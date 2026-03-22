"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { STREAM_COLORS } from "@/lib/data";
import { classifyOnDevice } from "@/lib/clientClassify";
import type { ClassificationResult } from "@/types";

interface CapturedSite {
  id: string;
  lat: number;
  lon: number;
  result: ClassificationResult;
  timestamp: string;
  imageUrl?: string;
}

const STREAM_EMOJI: Record<string, string> = {
  "Wet/Green": "🟢",
  "Dry/Blue": "🔵",
  "Sanitary/Red": "🔴",
  "Hazardous/Black": "⚫",
};

export default function MobilePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [streaming, setStreaming] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: number; lon: number } | null>(null);
  const [gpsError, setGpsError] = useState(false);
  const [sites, setSites] = useState<CapturedSite[]>([]);
  const [currentSiteId, setCurrentSiteId] = useState<string>("");
  const [sentToDashboard, setSentToDashboard] = useState(false);
  const [apiBase, setApiBase] = useState("http://localhost:8000");
  // ngrok free tier shows an interstitial HTML page when Origin header is present.
  // Adding this header tells ngrok to skip it and return the real response.
  const ngrokHeaders = { "ngrok-skip-browser-warning": "true" };

  // Auto-detect API base:
  // - ngrok/https → use Next.js proxy route (same origin, avoids mixed content)
  // - LAN IP over http → point directly at port 8000
  // - localhost → keep localhost:8000
  useEffect(() => {
    const { hostname, protocol, origin } = window.location;
    if (protocol === "https:") {
      // Served over HTTPS (ngrok) — proxy through Next.js /api/proxy/... → backend
      setApiBase(`${origin}/api/proxy`);
    } else if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      setApiBase(`http://${hostname}:8000`);
    }
  }, []);
  const [apiStatus, setApiStatus] = useState<"unknown" | "live" | "offline">("unknown");
  const [phase, setPhase] = useState<"camera" | "result">("camera");

  // ── GPS ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) { setGpsError(true); return; }
    const id = navigator.geolocation.watchPosition(
      (pos) => setGps({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => setGpsError(true),
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // ── API health check — re-runs whenever apiBase changes ───────────────
  useEffect(() => {
    if (!apiBase) return;
    setApiStatus("unknown");
    const check = async () => {
      try {
        const res = await fetch(`${apiBase}/api/summary`, {
          signal: AbortSignal.timeout(4000),
          headers: ngrokHeaders,
        });
        // ngrok interstitial returns 200 with HTML — check content-type
        const ct = res.headers.get("content-type") ?? "";
        setApiStatus(res.ok && ct.includes("json") ? "live" : "offline");
      } catch {
        setApiStatus("offline");
      }
    };
    check();
  }, [apiBase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Camera ────────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera API not available. Make sure you are on HTTPS.");
      return;
    }

    // Try rear camera first (ideal, not exact — so it won't hard-fail)
    const constraints: MediaStreamConstraints[] = [
      { video: { facingMode: "environment" }, audio: false },
      { video: { facingMode: "user" }, audio: false },
      { video: true, audio: false },
    ];

    for (const constraint of constraints) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraint);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setStreaming(true);
          return;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.name : String(err);
        // NotAllowedError = permission denied → stop trying
        if (msg === "NotAllowedError" || msg === "SecurityError") {
          setCameraError("Camera permission denied. Go to iPhone Settings → Safari → Camera → Allow.");
          return;
        }
        // Other errors (NotFoundError, OverconstrainedError) → try next constraint
      }
    }

    setCameraError("Could not access any camera. Try closing other apps using the camera.");
  }, []);

  const stopCamera = useCallback(() => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    setStreaming(false);
  }, []);

  // ── Capture + classify ─────────────────────────────────────────────────
  const capture = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setCapturing(true);

    // Draw frame to canvas
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const imageUrl = canvas.toDataURL("image/jpeg", 0.8);
    setCapturedImage(imageUrl);

    // Step 1: fast on-device pre-screen (pixel analysis, no upload needed)
    // This correctly rejects clean indoor scenes, walls, floors, people, furniture.
    // Only images that pass this check are sent to the backend model.
    const deviceResult = classifyOnDevice(canvas, "capture.jpg");
    const looksLikeWaste = deviceResult.status === "success";

    let classResult: ClassificationResult;
    if (!looksLikeWaste) {
      // Clean scene confirmed on-device — no need to upload
      classResult = deviceResult as unknown as ClassificationResult;
    } else if (apiStatus === "live") {
      // Step 2: pixel analysis thinks waste is present → send to fine-tuned model
      try {
        const blob = await (await fetch(imageUrl)).blob();
        const form = new FormData();
        form.append("file", blob, "capture.jpg");
        const res = await fetch(`${apiBase}/api/classify`, { method: "POST", body: form, headers: ngrokHeaders });
        classResult = await res.json();
      } catch {
        classResult = deviceResult as unknown as ClassificationResult;
      }
    } else {
      // Offline with waste-like pixels — use device result
      await new Promise((r) => setTimeout(r, 300));
      classResult = deviceResult as unknown as ClassificationResult;
    }

    setResult(classResult);
    setPhase("result");
    setCapturing(false);
    setSentToDashboard(false);

    // Always log the site — use GPS if available, else Thanisandra centroid for demo
    const siteGps = gps ?? { lat: 13.0601 + (Math.random() - 0.5) * 0.004, lon: 77.6312 + (Math.random() - 0.5) * 0.004 };
    const siteId = `FIELD-${Date.now().toString().slice(-5)}`;
    setCurrentSiteId(siteId);

    const site: CapturedSite = {
      id: siteId,
      lat: siteGps.lat,
      lon: siteGps.lon,
      result: classResult,
      timestamp: new Date().toLocaleTimeString("en-IN", { hour12: false }),
      imageUrl,
    };
    setSites((prev) => [site, ...prev]);

    // Post to backend → dashboard map picks it up in 4s
    if (apiStatus === "live") {
      fetch(`${apiBase}/api/field-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ngrokHeaders },
        body: JSON.stringify({
          id: site.id, lat: site.lat, lon: site.lon,
          dominant_stream: classResult.dominant_stream,
          detections: classResult.detections,
          timestamp: site.timestamp,
        }),
      }).then(() => setSentToDashboard(true)).catch(() => {});
    }
  }, [apiStatus, apiBase, gps]);

  const retake = useCallback(() => {
    setResult(null);
    setCapturedImage(null);
    setCurrentSiteId("");
    setSentToDashboard(false);
    setPhase("camera");
    // Camera stream may have been released when video element unmounted — restart it
    setStreaming(false);
    setTimeout(() => startCamera(), 200);
  }, [startCamera]);

  const streamColor = result ? (STREAM_COLORS[result.dominant_stream] ?? "#4a5a70") : "";

  return (
    <div className="min-h-screen bg-[#06080d] text-[#dde4ee] flex flex-col select-none">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#06080d]/95 border-b border-white/7 sticky top-0 z-50">
        <div>
          <div className="font-syne text-[16px] font-extrabold text-[#00e5a0]">
            Orbit<span className="text-[#dde4ee]">Clean</span>
            <span className="text-[10px] text-[#4db8ff] ml-1.5 tracking-widest uppercase">Field</span>
          </div>
          <div className="text-[9px] text-[#4a5a70] tracking-[1.5px] uppercase">Drone Simulation Mode</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className={`flex items-center gap-1 text-[9px] font-semibold tracking-widest uppercase ${apiStatus === "live" ? "text-[#00e5a0]" : "text-[#4a5a70]"}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${apiStatus === "live" ? "bg-[#00e5a0] animate-pulse" : "bg-[#4a5a70]"}`} />
            {apiStatus === "live" ? "API LIVE" : "DEMO MODE"}
          </div>
          <div className={`text-[9px] ${gps ? "text-[#ffd166]" : "text-[#4a5a70]"}`}>
            {gps ? `📍 ${gps.lat.toFixed(4)}, ${gps.lon.toFixed(4)}` : gpsError ? "📍 GPS unavailable" : "📍 Getting GPS…"}
          </div>
        </div>
      </div>

      {/* ── Camera / Result view ── */}
      <div className="flex-1 flex flex-col">

        {phase === "camera" ? (
          <>
            {/* Viewfinder */}
            <div className="relative bg-black flex-1 flex items-center justify-center overflow-hidden" style={{ minHeight: 280 }}>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Crosshair overlay */}
              {streaming && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-0 border-2 border-transparent">
                    {/* Corner brackets */}
                    {[
                      "top-6 left-6 border-t-2 border-l-2",
                      "top-6 right-6 border-t-2 border-r-2",
                      "bottom-6 left-6 border-b-2 border-l-2",
                      "bottom-6 right-6 border-b-2 border-r-2",
                    ].map((cls, i) => (
                      <div key={i} className={`absolute w-8 h-8 border-[#00e5a0] ${cls}`} />
                    ))}
                  </div>
                  <div className="absolute bottom-4 left-0 right-0 text-center text-[10px] text-[#00e5a0]/70 tracking-widest uppercase">
                    Point at waste · Tap capture
                  </div>
                </div>
              )}

              {/* Not started / error */}
              {!streaming && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#06080d] px-8">
                  {cameraError ? (
                    <>
                      <div className="text-4xl">⚠️</div>
                      <p className="text-[#ef4444] text-sm text-center font-semibold">{cameraError}</p>
                      <p className="text-[#4a5a70] text-xs text-center">
                        Check iPhone Settings → Safari → Camera → Allow for this site
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="text-5xl">📷</div>
                      <p className="text-[#4a5a70] text-sm text-center">
                        Tap start to activate camera.<br />Point at a waste dump site.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Camera controls */}
            <div className="p-4 flex gap-3">
              {!streaming ? (
                <button
                  onClick={startCamera}
                  className="flex-1 py-3.5 rounded-xl bg-[#00e5a0]/15 border border-[#00e5a0]/30 text-[#00e5a0] font-semibold text-[14px] active:bg-[#00e5a0]/25"
                >
                  Start Camera
                </button>
              ) : (
                <>
                  <button
                    onClick={stopCamera}
                    className="py-3.5 px-5 rounded-xl bg-white/5 border border-white/10 text-[#4a5a70] text-[13px]"
                  >
                    Stop
                  </button>
                  <button
                    onClick={capture}
                    disabled={capturing}
                    className="flex-1 py-3.5 rounded-xl bg-[#00e5a0] text-[#06080d] font-bold text-[15px] active:bg-[#00e5a0]/80 disabled:opacity-60"
                  >
                    {capturing ? "Classifying…" : "Capture & Classify"}
                  </button>
                </>
              )}
            </div>
          </>
        ) : (
          /* ── Result view ── */
          <div className="flex flex-col overflow-y-auto">

            {/* Captured image — full width with gradient fade */}
            {capturedImage && (
              <div className="relative w-full" style={{ height: 220 }}>
                <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, transparent 40%, #06080d 100%)" }} />
                {/* Site ID badge over image */}
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-[#06080d]/80 border border-white/10 text-[10px] text-[#4a5a70] font-mono">
                  {currentSiteId || "FIELD-…"}
                </div>
                <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-[#06080d]/80 border border-white/10 text-[10px] text-[#4a5a70]">
                  {new Date().toLocaleTimeString("en-IN", { hour12: false })}
                </div>
              </div>
            )}

            <div className="p-4 space-y-3">
              {result && (
                <>
                  {/* ── No waste ── */}
                  {(result as unknown as {status: string}).status === "no_waste" ? (
                    <div className="rounded-xl p-4 border border-[#4a5a70]/30 bg-white/[0.03] text-center">
                      <div className="text-4xl mb-2">🔍</div>
                      <div className="font-syne text-[17px] font-bold text-[#4a5a70]">No Waste Detected</div>
                      <div className="text-[12px] text-[#4a5a70] mt-1.5 leading-relaxed">
                        Point camera directly at the waste pile and recapture.
                      </div>
                      {(result as unknown as {scene_label?: string}).scene_label && (
                        <div className="mt-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/7 text-[10px] text-[#4a5a70]">
                          Model saw: <span className="text-[#dde4ee]">{(result as unknown as {scene_label: string}).scene_label}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                  <>
                    {/* ── Waste stream banner ── */}
                    <div
                      className="rounded-xl p-4 border"
                      style={{ background: `${streamColor}15`, borderColor: `${streamColor}40` }}
                    >
                      <div className="text-[9px] text-[#4a5a70] uppercase tracking-[2px] mb-2">Waste Stream Detected</div>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                          style={{ background: `${streamColor}20` }}>
                          {STREAM_EMOJI[result.dominant_stream] ?? "🗑️"}
                        </div>
                        <div className="flex-1">
                          <div className="font-syne text-[20px] font-extrabold leading-tight" style={{ color: streamColor }}>
                            {result.dominant_stream}
                          </div>
                          <div className="text-[11px] text-[#4a5a70] mt-0.5 leading-relaxed">{result.primary_disposal}</div>
                        </div>
                      </div>
                    </div>

                    {/* ── Detections ── */}
                    {result.detections.length > 0 && (
                      <div className="rounded-xl border border-white/7 overflow-hidden">
                        <div className="px-3 py-2 bg-white/[0.03] border-b border-white/7">
                          <span className="text-[9px] text-[#4a5a70] uppercase tracking-[2px] font-semibold">AI Detections</span>
                        </div>
                        {result.detections.map((d, i) => (
                          <div key={i} className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.04] last:border-0">
                            <div>
                              <div className="font-semibold text-[13px]">{d.category}</div>
                              <div className="text-[10px] text-[#4a5a70] mt-0.5">
                                {Math.round(d.confidence * 100)}% confidence
                                {d.recyclable && <span className="ml-2 text-[#00e5a0]">· ♻️ ₹{d.market_value_per_kg_inr}/kg</span>}
                              </div>
                            </div>
                            <span className="text-[9px] px-2 py-1 rounded-full font-semibold shrink-0"
                              style={{ background: `${STREAM_COLORS[d.swm_stream] ?? "#666"}22`, color: STREAM_COLORS[d.swm_stream] ?? "#aaa" }}>
                              {d.swm_stream}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ── Data pipeline card ── */}
                    <div className="rounded-xl border border-[#c084fc]/25 bg-[#c084fc]/[0.06] p-3.5">
                      <div className="text-[9px] text-[#c084fc] uppercase tracking-[2px] font-semibold mb-3">Data Pipeline</div>
                      <div className="flex items-center gap-1">
                        {[
                          { icon: "📷", label: "Capture", done: true },
                          { icon: apiStatus === "live" ? "🤖" : "🔬", label: apiStatus === "live" ? "AI Classify" : "On-device", done: true },
                          { icon: "📡", label: "Backend API", done: apiStatus === "live" },
                          { icon: "🗺️", label: "Dashboard Map", done: sentToDashboard },
                        ].map((step, i) => (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-base transition-all ${step.done ? "bg-[#c084fc]/20" : "bg-white/[0.04]"}`}>
                              {step.icon}
                            </div>
                            <div className={`text-[8px] text-center leading-tight font-medium ${step.done ? "text-[#c084fc]" : "text-[#4a5a70]"}`}>
                              {step.label}
                            </div>
                            {step.done && <div className="w-1.5 h-1.5 rounded-full bg-[#c084fc]" />}
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 pt-2.5 border-t border-[#c084fc]/15 text-[10px] text-[#4a5a70] leading-relaxed">
                        {apiStatus === "live"
                          ? sentToDashboard
                            ? "✅ Report sent — dashboard map updates in ~4 seconds. Purple pin will appear at capture location."
                            : "⏳ Sending to dashboard…"
                          : "⚠️ Offline — report saved locally. Connect to WiFi with laptop running to sync."
                        }
                      </div>
                    </div>

                    {/* ── Location card ── */}
                    {sites.length > 0 && (
                      <div className="rounded-xl border border-[#ffd166]/25 bg-[#ffd166]/[0.06] px-3.5 py-3">
                        <div className="text-[9px] text-[#ffd166] uppercase tracking-[2px] font-semibold mb-1.5">Location Tagged</div>
                        <div className="text-[12px] text-[#ffd166] font-mono">
                          {sites[0].lat.toFixed(5)}, {sites[0].lon.toFixed(5)}
                        </div>
                        {!gps && (
                          <div className="text-[10px] text-[#4a5a70] mt-1">
                            GPS unavailable — using Thanisandra centroid for demo.
                            Enable: Safari Settings → Location → Allow
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── What happens next ── */}
                    <div className="rounded-xl border border-white/7 bg-white/[0.02] p-3.5">
                      <div className="text-[9px] text-[#4a5a70] uppercase tracking-[2px] font-semibold mb-2.5">What Happens Next</div>
                      {[
                        { color: "#c084fc", label: "Purple pin appears on dashboard map at capture GPS" },
                        { color: "#00e5a0", label: "BBMP recycler alert if high-value material detected" },
                        { color: "#4db8ff", label: "Risk predictor re-scores this grid cell (+weight)" },
                        { color: "#ffd166", label: "CO₂ estimate updated: ~2.4 kg CO₂e avoided per kg dry waste recycled" },
                      ].map((item, i) => (
                        <div key={i} className="flex items-start gap-2.5 mb-2 last:mb-0">
                          <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: item.color }} />
                          <div className="text-[11px] text-[#4a5a70] leading-relaxed">{item.label}</div>
                        </div>
                      ))}
                    </div>
                  </>
                  )}

                  {/* ── Actions ── */}
                  <div className="flex gap-2 pt-1 pb-2">
                    <button onClick={retake}
                      className="flex-1 py-3.5 rounded-xl bg-[#00e5a0] text-[#06080d] font-bold text-[14px] active:bg-[#00e5a0]/80">
                      Capture Next Site →
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Session log ── */}
        {sites.length > 0 && (
          <div className="border-t border-white/7 p-4">
            <div className="text-[10px] text-[#4a5a70] uppercase tracking-widest mb-2">
              Session Log — {sites.length} site{sites.length > 1 ? "s" : ""} captured
            </div>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {sites.map((site) => {
                const sc = STREAM_COLORS[site.result.dominant_stream] ?? "#666";
                return (
                  <div key={site.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-white/[0.02] border border-white/7">
                    <span className="text-base">{STREAM_EMOJI[site.result.dominant_stream] ?? "🗑️"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold" style={{ color: sc }}>
                        {site.result.dominant_stream}
                      </div>
                      <div className="text-[10px] text-[#4a5a70] truncate">
                        {site.lat.toFixed(4)}, {site.lon.toFixed(4)} · {site.timestamp}
                      </div>
                    </div>
                    <span className="text-[9px] text-[#4a5a70] shrink-0">{site.id}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── API config (bottom) ── */}
      <div className="px-4 pb-4 pt-2 border-t border-white/7 bg-[#06080d]/95">
        <div className="text-[9px] text-[#4a5a70] mb-1 uppercase tracking-widest">Laptop API URL (same WiFi)</div>
        <input
          className="w-full bg-white/[0.04] border border-white/7 rounded-lg px-3 py-2 text-[11px] text-[#dde4ee] outline-none focus:border-[#00e5a0]/30"
          value={apiBase}
          onChange={(e) => setApiBase(e.target.value)}
          placeholder="http://192.168.x.x:8000"
        />
        <div className="text-[9px] text-[#4a5a70] mt-1">
          Run on laptop: <code className="text-[#4db8ff]">uvicorn backend.app:app --host 0.0.0.0 --port 8000</code>
        </div>
      </div>

    </div>
  );
}
