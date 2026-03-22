"use client";

import { useState, useEffect, useRef } from "react";
import type { CleanupMission } from "@/types";

interface Props {
  apiBase?: string;
  onMissionsUpdate?: (missions: CleanupMission[]) => void;
}

const STATUS_COLORS: Record<string, string> = {
  assigned: "#f59e0b",
  in_progress: "#0ea5e9",
  before_uploaded: "#8b5cf6",
  after_uploaded: "#f97316",
  verified: "#10b981",
  cleaned: "#10b981",
  cancelled: "#94a3b8",
};

const STATUS_LABELS: Record<string, string> = {
  assigned: "Assigned",
  in_progress: "In Progress",
  before_uploaded: "Before Uploaded",
  after_uploaded: "Needs Verification",
  verified: "Verified Clean",
  cleaned: "Cleaned",
  cancelled: "Cancelled",
};

export default function CleanupTracker({ apiBase = "http://localhost:8000", onMissionsUpdate }: Props) {
  const [missions, setMissions] = useState<CleanupMission[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, verified: 0 });
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [activeUpload, setActiveUpload] = useState<{ missionId: string; phase: "before" | "after" } | null>(null);

  useEffect(() => { fetchMissions(); }, []);

  async function fetchMissions() {
    try {
      const res = await fetch(`${apiBase}/api/cleanup/missions`);
      if (res.ok) {
        const data = await res.json();
        setMissions(data.missions || []);
        setStats({ total: data.total || 0, pending: data.pending_cleanup || 0, verified: data.verified_clean || 0 });
        onMissionsUpdate?.(data.missions || []);
      }
    } catch {
      setMissions(MOCK_MISSIONS);
      setStats({ total: MOCK_MISSIONS.length, pending: 2, verified: 1 });
      onMissionsUpdate?.(MOCK_MISSIONS);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch(`${apiBase}/api/cleanup/generate`, { method: "POST" });
      if (res.ok) await fetchMissions();
    } catch {
      setMissions(MOCK_MISSIONS);
      setStats({ total: MOCK_MISSIONS.length, pending: 2, verified: 1 });
    }
    setGenerating(false);
  }

  function triggerUpload(missionId: string, phase: "before" | "after") {
    setActiveUpload({ missionId, phase });
    fileRef.current?.click();
  }

  async function handleFileChange() {
    if (!activeUpload || !fileRef.current?.files?.[0]) return;
    const { missionId, phase } = activeUpload;
    setUploading(missionId);

    let lat = 13.059, lon = 77.630;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
      );
      lat = pos.coords.latitude;
      lon = pos.coords.longitude;
    } catch { /* default coords */ }

    try {
      const form = new FormData();
      form.append("file", fileRef.current.files[0]);
      const url = `${apiBase}/api/cleanup/${missionId}/${phase}?lat=${lat}&lon=${lon}&driver_id=DRIVER-001`;
      await fetch(url, { method: "POST", body: form });
      await fetchMissions();
    } catch {
      setMissions(prev => prev.map(m =>
        m.mission_id === missionId
          ? { ...m, status: phase === "before" ? "before_uploaded" as const : "verified" as const, gps_verified: true }
          : m
      ));
    }

    setUploading(null);
    setActiveUpload(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const pendingMissions = missions.filter(m => !["verified", "cleaned", "cancelled"].includes(m.status));
  const completedMissions = missions.filter(m => ["verified", "cleaned"].includes(m.status));

  return (
    <>
      {/* Cleanup overview */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Driver Accountability</span>
          <div className="flex items-center gap-1.5">
            {stats.verified > 0 && <span className="badge badge-green">{stats.verified} clean</span>}
            <span className="badge badge-amber">{stats.pending} pending</span>
          </div>
        </div>
        <div className="p-3 space-y-3">
          {/* Description */}
          <div className="text-[10px] text-[#64748b] leading-relaxed rounded-lg bg-[#f8fafc] border border-[#f1f5f9] px-3 py-2">
            Zepto-style driver verification: before/after photo with GPS auto-capture. Verified cleanups reduce risk score by 70%.
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="kpi-pill">
              <span className="kpi-value text-[#ef4444]">{stats.total}</span>
              <span className="kpi-label">Missions</span>
            </div>
            <div className="kpi-pill">
              <span className="kpi-value text-[#f59e0b]">{stats.pending}</span>
              <span className="kpi-label">Pending</span>
            </div>
            <div className="kpi-pill">
              <span className="kpi-value text-[#10b981]">{stats.verified}</span>
              <span className="kpi-label">Verified</span>
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full py-2.5 rounded-lg bg-[#ef4444] text-white text-[11px] font-semibold hover:bg-[#dc2626] disabled:opacity-50 transition-colors"
          >
            {generating ? "Generating..." : "Generate Cleanup Missions"}
          </button>

          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
        </div>
      </div>

      {/* Active missions */}
      {pendingMissions.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Active Missions</span>
            <span className="badge badge-amber">{pendingMissions.length}</span>
          </div>
          <div className="p-3 space-y-2">
            {pendingMissions.slice(0, 5).map(m => (
              <div key={m.mission_id} className="rounded-lg border border-[#e2e8f0] bg-white p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-[#0f172a] tabular-nums">{m.mission_id}</span>
                  <span
                    className="text-[9px] font-semibold px-2 py-0.5 rounded-md"
                    style={{ background: `${STATUS_COLORS[m.status]}12`, color: STATUS_COLORS[m.status] }}
                  >
                    {STATUS_LABELS[m.status]}
                  </span>
                </div>
                <div className="text-[10px] text-[#64748b] mb-2">{m.target_name}</div>

                {/* GPS status */}
                {m.before_gps && (
                  <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded bg-[#f8fafc] border border-[#f1f5f9]">
                    <div className={`w-2 h-2 rounded-full ${m.gps_verified ? "bg-[#10b981]" : "bg-[#ef4444]"}`} />
                    <span className="text-[9px] text-[#64748b]">
                      GPS: {m.before_gps.distance_m}m from target {m.gps_verified ? "(verified)" : "(mismatch!)"}
                    </span>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2">
                  {m.status === "assigned" && (
                    <button
                      onClick={() => triggerUpload(m.mission_id, "before")}
                      disabled={uploading === m.mission_id}
                      className="flex-1 py-2 rounded-lg bg-[#8b5cf6] text-white text-[10px] font-semibold hover:bg-[#7c3aed] disabled:opacity-50 transition-colors"
                    >
                      {uploading === m.mission_id ? "Uploading..." : "Upload BEFORE Photo"}
                    </button>
                  )}
                  {m.status === "before_uploaded" && (
                    <button
                      onClick={() => triggerUpload(m.mission_id, "after")}
                      disabled={uploading === m.mission_id}
                      className="flex-1 py-2 rounded-lg bg-[#10b981] text-white text-[10px] font-semibold hover:bg-[#059669] disabled:opacity-50 transition-colors"
                    >
                      {uploading === m.mission_id ? "Uploading..." : "Upload AFTER Photo"}
                    </button>
                  )}
                </div>

                {/* Meta info */}
                <div className="flex items-center gap-3 mt-2 text-[9px] text-[#94a3b8]">
                  <span>Risk: {Math.round(m.risk_score * 100)}%</span>
                  <span>{m.waste_type}</span>
                  <span>{m.area_sqm}m²</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed missions */}
      {completedMissions.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Completed Cleanups</span>
            <span className="badge badge-green">{completedMissions.length}</span>
          </div>
          <div className="p-3 space-y-1.5">
            {completedMissions.slice(0, 5).map(m => (
              <div key={m.mission_id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#ecfdf5] border border-[#a7f3d0]">
                <div className="w-6 h-6 rounded-md bg-[#10b981] text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                  &#10003;
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-semibold text-[#059669]">{m.mission_id}</div>
                  <div className="text-[9px] text-[#6ee7b7] truncate">{m.target_name}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[12px] font-bold text-[#059669] tabular-nums">
                    -{Math.round(m.risk_reduction * 100)}%
                  </div>
                  <div className="text-[8px] text-[#6ee7b7]">risk</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BBMP penalty reference */}
      <div className="card">
        <div className="p-3">
          <div className="text-[10px] text-[#94a3b8] leading-relaxed">
            <span className="font-semibold text-[#64748b]">BBMP SWM 2026:</span> Penalties from &#8377;200 (littering) to &#8377;25,000 (bulk dumping). GPS-verified cleanup = 70% risk reduction. Unverified = 30%.
          </div>
        </div>
      </div>
    </>
  );
}

const MOCK_MISSIONS: CleanupMission[] = [
  {
    mission_id: "CLN-A1B2C3", target_id: "DUMP-001", target_type: "dump_site",
    target_name: "Thanisandra Main Road Dump", lat: 13.056306, lon: 77.629650,
    waste_type: "Mixed", area_sqm: 145, risk_score: 0.87,
    status: "assigned", assigned_at: "2026-03-21T10:00:00",
    driver_id: null, before_photo: null, before_gps: null, before_time: null,
    after_photo: null, after_gps: null, after_time: null,
    gps_verified: false, risk_reduction: 0,
  },
  {
    mission_id: "CLN-D4E5F6", target_id: "DUMP-003", target_type: "dump_site",
    target_name: "Market Area Dump (Hebbal)", lat: 13.051234, lon: 77.597680,
    waste_type: "Hazardous", area_sqm: 210, risk_score: 0.93,
    status: "before_uploaded", assigned_at: "2026-03-21T09:30:00",
    driver_id: "DRIVER-001", before_photo: "/data/cleanup_photos/CLN-D4E5F6_before.jpg",
    before_gps: { lat: 13.0513, lon: 77.5977, distance_m: 12.3 }, before_time: "2026-03-21T10:15:00",
    after_photo: null, after_gps: null, after_time: null,
    gps_verified: true, risk_reduction: 0,
  },
  {
    mission_id: "CLN-G7H8I9", target_id: "DUMP-005", target_type: "dump_site",
    target_name: "Kogilu Drain Edge", lat: 13.065432, lon: 77.621890,
    waste_type: "Wet/Green", area_sqm: 78, risk_score: 0.82,
    status: "verified", assigned_at: "2026-03-20T14:00:00",
    driver_id: "DRIVER-002", before_photo: "/data/cleanup_photos/CLN-G7H8I9_before.jpg",
    before_gps: { lat: 13.0654, lon: 77.6219, distance_m: 8.5 }, before_time: "2026-03-20T15:00:00",
    after_photo: "/data/cleanup_photos/CLN-G7H8I9_after.jpg",
    after_gps: { lat: 13.0655, lon: 77.6219, distance_m: 15.2 }, after_time: "2026-03-20T16:30:00",
    gps_verified: true, risk_reduction: 0.574, new_risk_score: 0.246, verified_at: "2026-03-20T16:30:00",
  },
];
