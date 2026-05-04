"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { DumpSite, PipelineStatus, RiskCell } from "@/types";
import { WARD_ROUTES } from "@/lib/data";
import { useFieldReports } from "@/lib/useFieldReports";
import { useCleanupData } from "@/lib/useCleanupData";
import RouteOptimizer from "@/components/RouteOptimizer";
import CommunityUpload from "@/components/CommunityUpload";
import CleanupTracker from "@/components/CleanupTracker";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const TARGET_WARD = "Thanisandra";
const TARGET_WARD_ID = 26;

type Tab = "overview" | "routes" | "cleanup";

type InspectionResult = {
  lat: number;
  lon: number;
  found: boolean;
  nearestDump: DumpSite | null;
  nearestRiskCell: RiskCell | null;
  dumpDistanceMeters: number | null;
  riskDistanceMeters: number | null;
};

type GeoJsonFeature = {
  properties?: Record<string, unknown>;
  geometry?: {
    coordinates?: [number, number] | number[];
  };
};

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "routes", label: "Routes" },
  { id: "cleanup", label: "Cleanup" },
];

function textProp(feature: GeoJsonFeature, key: string, fallback = "") {
  const value = feature.properties?.[key];
  return typeof value === "string" ? value : fallback;
}

function numberProp(feature: GeoJsonFeature, key: string, fallback = 0) {
  const value = feature.properties?.[key];
  return typeof value === "number" ? value : Number(value ?? fallback);
}

function riskColor(score: number) {
  if (score >= 0.85) return "#dc2626";
  if (score >= 0.7) return "#f97316";
  return "#eab308";
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radius = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180)
    * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function DashboardPage() {
  const [selectedDump, setSelectedDump] = useState<DumpSite | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showRoutes, setShowRoutes] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [liveDumps, setLiveDumps] = useState<DumpSite[]>([]);
  const [liveRiskGrid, setLiveRiskGrid] = useState<RiskCell[]>([]);
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [lookupLat, setLookupLat] = useState("");
  const [lookupLon, setLookupLon] = useState("");
  const [inspectionResult, setInspectionResult] = useState<InspectionResult | null>(null);
  const { reports: fieldReports } = useFieldReports();
  const { cleanedSites, communityPhotos, refresh: refreshCleanup } = useCleanupData();

  useEffect(() => {
    let cancelled = false;

    async function loadMlData() {
      try {
        setDataLoading(true);
        setDataError(null);

        const [dumpsRes, riskRes, pipelineRes] = await Promise.all([
          fetch("/api/proxy/api/dumps/active"),
          fetch(`/api/proxy/api/risk_grid?min_score=0.3&ward=${encodeURIComponent(TARGET_WARD)}`),
          fetch("/api/proxy/api/pipeline/status"),
        ]);

        if (!dumpsRes.ok) throw new Error(`Failed to load dumps (${dumpsRes.status})`);
        if (!riskRes.ok) throw new Error(`Failed to load risk grid (${riskRes.status})`);
        if (!pipelineRes.ok) throw new Error(`Failed to load pipeline status (${pipelineRes.status})`);

        const dumpsJson = await dumpsRes.json();
        const riskJson = await riskRes.json();
        const pipelineJson = await pipelineRes.json();

        const dumps: DumpSite[] = ((dumpsJson.features || []) as GeoJsonFeature[])
          .filter((feature) => {
            const ward = textProp(feature, "ward", TARGET_WARD).toLowerCase();
            const wardId = numberProp(feature, "ward_id", TARGET_WARD_ID);
            return ward === TARGET_WARD.toLowerCase() || wardId === TARGET_WARD_ID;
          })
          .map((feature) => ({
            id: textProp(feature, "id", "?"),
            name: textProp(feature, "name", "Unknown Dump"),
            waste_type: textProp(feature, "waste_type", "Mixed"),
            swm_stream: textProp(feature, "swm_stream", "Dry/Blue"),
            risk_score: numberProp(feature, "risk_score"),
            area_sqm: numberProp(feature, "area_sqm"),
            volume_m3: numberProp(feature, "volume_m3"),
            detected_date: textProp(feature, "detected_date"),
            status: textProp(feature, "status") === "Resolved" ? "Resolved" : "Active",
            recurrence_risk: numberProp(feature, "recurrence_risk"),
            carbon_co2_eq_tonnes: numberProp(feature, "carbon_co2_eq_tonnes"),
            carbon_credit_inr: numberProp(feature, "carbon_credit_inr"),
            nearest_recycler: textProp(feature, "nearest_recycler"),
            recycler_distance_km: numberProp(feature, "recycler_distance_km"),
            water_risk: textProp(feature, "water_risk", "Low") as DumpSite["water_risk"],
            cctv_coverage: Boolean(feature.properties?.cctv_coverage),
            ward: textProp(feature, "ward", TARGET_WARD),
            ward_id: numberProp(feature, "ward_id", TARGET_WARD_ID),
            best_intervention: textProp(feature, "best_intervention"),
            intervention_cost_inr: numberProp(feature, "intervention_cost_inr"),
            roi_weeks: numberProp(feature, "roi_weeks"),
            lat: Number(feature.geometry?.coordinates?.[1]),
            lon: Number(feature.geometry?.coordinates?.[0]),
            estimated_weight_tonnes: numberProp(feature, "area_sqm") * 15 / 1000,
            community_reports: numberProp(feature, "community_reports"),
            community_verified: Boolean(feature.properties?.community_verified),
          }));

        const riskGrid: RiskCell[] = ((riskJson.features || []) as GeoJsonFeature[])
          .filter((feature) => textProp(feature, "ward", TARGET_WARD).toLowerCase() === TARGET_WARD.toLowerCase())
          .map((feature) => ({
            id: textProp(feature, "cell_id"),
            lat: Number(feature.geometry?.coordinates?.[1]),
            lon: Number(feature.geometry?.coordinates?.[0]),
            score: numberProp(feature, "risk_score"),
            risk_level: textProp(feature, "risk_level"),
            ward: textProp(feature, "ward"),
            land_use: textProp(feature, "land_use"),
            dist_road_m: numberProp(feature, "dist_road_m"),
            dist_collection_m: numberProp(feature, "dist_collection_m"),
            hist_dump_density: numberProp(feature, "hist_dump_density"),
            generated_at: textProp(feature, "generated_at"),
            source: "Sentinel-2 + urban risk model",
          }));

        if (!cancelled) {
          setLiveDumps(dumps);
          setLiveRiskGrid(riskGrid);
          setPipelineStatus(pipelineJson);
        }
      } catch (error) {
        if (!cancelled) {
          setDataError(error instanceof Error ? error.message : "Failed to load dashboard data");
          setLiveDumps([]);
          setLiveRiskGrid([]);
        }
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    }

    loadMlData();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeDumps = useMemo(() => liveDumps.filter((dump) => dump.status === "Active"), [liveDumps]);
  const rankedCells = useMemo(() => [...liveRiskGrid].sort((a, b) => b.score - a.score), [liveRiskGrid]);
  const topRiskCells = rankedCells.slice(0, 6);
  const criticalCells = liveRiskGrid.filter((cell) => cell.score >= 0.85).length;
  const highCells = liveRiskGrid.filter((cell) => cell.score >= 0.7 && cell.score < 0.85).length;
  const totalWeight = activeDumps.reduce((sum, dump) => sum + (dump.estimated_weight_tonnes ?? 0), 0);
  const pipelineOk = pipelineStatus?.refresh?.status === "ok";
  const sentinelScene = pipelineStatus?.sentinel?.scene_selected;
  const sentinelDate = sentinelScene?.datetime
    ? new Date(sentinelScene.datetime).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "Pending";

  function selectRiskCell(cell: RiskCell) {
    setLookupLat(cell.lat.toFixed(6));
    setLookupLon(cell.lon.toFixed(6));
    setInspectionResult({
      lat: cell.lat,
      lon: cell.lon,
      found: true,
      nearestDump: null,
      nearestRiskCell: cell,
      dumpDistanceMeters: null,
      riskDistanceMeters: 0,
    });
  }

  function handleCoordinateCheck() {
    const lat = Number.parseFloat(lookupLat);
    const lon = Number.parseFloat(lookupLon);

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      setInspectionResult(null);
      return;
    }

    let nearestDump: DumpSite | null = null;
    let nearestDumpDistance = Number.POSITIVE_INFINITY;
    activeDumps.forEach((dump) => {
      const distance = haversineMeters(lat, lon, dump.lat, dump.lon);
      if (distance < nearestDumpDistance) {
        nearestDumpDistance = distance;
        nearestDump = dump;
      }
    });

    let nearestRiskCell: RiskCell | null = null;
    let nearestRiskDistance = Number.POSITIVE_INFINITY;
    liveRiskGrid.forEach((cell) => {
      const distance = haversineMeters(lat, lon, cell.lat, cell.lon);
      if (distance < nearestRiskDistance) {
        nearestRiskDistance = distance;
        nearestRiskCell = cell;
      }
    });

    const hasNearbyDump = nearestDumpDistance <= 150;
    const hasNearbyPrediction = nearestRiskDistance <= 250;
    setInspectionResult({
      lat,
      lon,
      found: hasNearbyDump || hasNearbyPrediction,
      nearestDump,
      nearestRiskCell,
      dumpDistanceMeters: Number.isFinite(nearestDumpDistance) ? nearestDumpDistance : null,
      riskDistanceMeters: Number.isFinite(nearestRiskDistance) ? nearestRiskDistance : null,
    });

    if (hasNearbyDump && nearestDump) setSelectedDump(nearestDump);
  }

  return (
    <div className="h-screen overflow-hidden bg-[#f8fafc] text-[#0f172a]">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#e2e8f0] bg-white px-5">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0f172a] text-sm font-black text-white">
            OC
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-bold leading-tight tracking-tight">OrbitClean 2.0</div>
            <div className="truncate text-[11px] text-[#64748b]">Thanisandra Ward 26, Bengaluru</div>
          </div>
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <TopMetric label="Predicted" value={liveRiskGrid.length} tone="#dc2626" />
          <TopMetric label="Waste" value={`${totalWeight.toFixed(1)}T`} tone="#f97316" />
          <TopMetric label="Tippers" value={WARD_ROUTES.fleet_summary.total_auto_tippers} tone="#2563eb" />
          <TopMetric label="Cleaned" value={cleanedSites.length} tone="#059669" />
        </div>

        <div className="flex items-center gap-2">
          <span className={`status-pill ${pipelineOk ? "status-pill-green" : "status-pill-amber"}`}>
            {pipelineOk ? "Live" : "Syncing"}
          </span>
          <span className="hidden rounded-md border border-[#e2e8f0] px-2.5 py-1 text-[11px] font-medium text-[#64748b] sm:inline">
            Sentinel {sentinelDate}
          </span>
        </div>
      </header>

      <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
        <main className="relative flex-1 overflow-hidden">
          <MapView
            dumps={liveDumps}
            recyclers={[]}
            riskGrid={liveRiskGrid}
            fieldReports={fieldReports}
            selectedDump={selectedDump}
            inspectedPoint={inspectionResult}
            showHeatmap={showHeatmap}
            showRecyclers={false}
            showWater={false}
            zones={WARD_ROUTES.zones}
            showRoutes={showRoutes}
            cleanedSites={cleanedSites}
            communityPhotos={communityPhotos}
          />

          <div className="absolute left-4 top-4 z-[400] flex flex-wrap gap-2">
            <ToggleButton active={showHeatmap} onClick={() => setShowHeatmap((value) => !value)}>
              Risk heatmap
            </ToggleButton>
            <ToggleButton active={showRoutes} onClick={() => setShowRoutes((value) => !value)}>
              Collection routes
            </ToggleButton>
          </div>

          <div className="absolute bottom-4 left-4 z-[400] rounded-lg border border-[#e2e8f0] bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">Risk</div>
            <div className="flex items-center gap-3 text-[11px] text-[#475569]">
              <LegendDot color="#dc2626" label="Critical" />
              <LegendDot color="#f97316" label="High" />
              <LegendDot color="#7c3aed" label="Field" />
            </div>
          </div>

          {dataLoading && (
            <MapNotice>Loading live ward data...</MapNotice>
          )}

          {dataError && (
            <MapNotice tone="error">{dataError}</MapNotice>
          )}
        </main>

        <aside className="w-[400px] shrink-0 border-l border-[#e2e8f0] bg-[#f8fafc] max-lg:w-[360px] max-md:hidden">
          <div className="sidebar-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`sidebar-tab ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="h-[calc(100%-42px)] overflow-y-auto">
            {activeTab === "overview" && (
              <div className="sidebar-section">
                <section className="card">
                  <div className="card-header">
                    <span className="card-title">Ward Status</span>
                    <span className={`badge ${pipelineOk ? "badge-green" : "badge-amber"}`}>
                      {pipelineStatus?.refresh?.status ?? "Loading"}
                    </span>
                  </div>
                  <div className="p-3">
                    <div className="grid grid-cols-3 gap-2">
                      <KpiBlock label="Critical" value={criticalCells} color="#dc2626" />
                      <KpiBlock label="High" value={highCells} color="#f97316" />
                      <KpiBlock label="Scenes" value={pipelineStatus?.sentinel?.scenes_found ?? 0} color="#2563eb" />
                    </div>
                    <div className="mt-3 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-3 text-[11px] text-[#64748b]">
                      <InfoRow label="Latest Sentinel" value={sentinelDate} />
                      <InfoRow
                        label="Cloud cover"
                        value={typeof sentinelScene?.cloud_cover === "number" ? `${sentinelScene.cloud_cover.toFixed(1)}%` : "Unknown"}
                      />
                    <InfoRow label="Confirmed dumps" value={activeDumps.length} />
                    <InfoRow label="Predicted hotspots" value={liveRiskGrid.length} />
                    {activeDumps.length === 0 && liveRiskGrid.length > 0 && (
                      <div className="mt-2 rounded-md border border-[#fed7aa] bg-[#fff7ed] px-2.5 py-2 text-[10px] leading-relaxed text-[#9a3412]">
                        The latest satellite detector produced 0 confirmed dump polygons, so the map is showing risk-predicted dump hotspots from the model.
                      </div>
                    )}
                    </div>
                  </div>
                </section>

                <section className="card">
                  <div className="card-header">
                    <span className="card-title">Priority Hotspots</span>
                    <span className="badge badge-red">{topRiskCells.length} shown</span>
                  </div>
                  <div className="divide-y divide-[#f1f5f9]">
                    {topRiskCells.length > 0 ? topRiskCells.map((cell, index) => (
                      <button
                        key={cell.id ?? `${cell.lat}-${cell.lon}`}
                        type="button"
                        onClick={() => selectRiskCell(cell)}
                        className="w-full px-3.5 py-3 text-left transition-colors hover:bg-[#f8fafc]"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-[12px] font-semibold text-[#0f172a]">
                              {index + 1}. {cell.id || "Risk cell"}
                            </div>
                            <div className="mt-1 truncate text-[10px] text-[#64748b]">
                              {cell.land_use || "Unknown land use"} | Road {Math.round(cell.dist_road_m ?? 0)}m
                            </div>
                          </div>
                          <span className="rounded-md px-2 py-1 text-[12px] font-bold" style={{ color: riskColor(cell.score), background: `${riskColor(cell.score)}12` }}>
                            {Math.round(cell.score * 100)}%
                          </span>
                        </div>
                      </button>
                    )) : (
                      <div className="px-3.5 py-4 text-[11px] text-[#64748b]">No hotspots loaded yet.</div>
                    )}
                  </div>
                </section>

                <section className="card">
                  <div className="card-header">
                    <span className="card-title">Inspect Coordinate</span>
                    <span className="badge badge-blue">Map lookup</span>
                  </div>
                  <div className="space-y-3 p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <CoordinateInput label="Latitude" value={lookupLat} onChange={setLookupLat} placeholder="13.056306" />
                      <CoordinateInput label="Longitude" value={lookupLon} onChange={setLookupLon} placeholder="77.629650" />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <PresetButton onClick={() => { setLookupLat("13.056306"); setLookupLon("77.629650"); }}>GT-001</PresetButton>
                      <PresetButton onClick={() => { setLookupLat("13.056467"); setLookupLon("77.629216"); }}>GT-002</PresetButton>
                      <PresetButton onClick={() => { setLookupLat(""); setLookupLon(""); setInspectionResult(null); }}>Clear</PresetButton>
                    </div>
                    <button
                      onClick={handleCoordinateCheck}
                      disabled={!lookupLat || !lookupLon || dataLoading}
                      className="w-full rounded-lg bg-[#0f172a] px-3 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#1e293b] disabled:cursor-not-allowed disabled:opacity-50"
                      type="button"
                    >
                      Check location
                    </button>
                    {inspectionResult && (
                      <div className={`rounded-lg border p-3 text-[11px] ${inspectionResult.found ? "border-[#bbf7d0] bg-[#f0fdf4]" : "border-[#fed7aa] bg-[#fff7ed]"}`}>
                        <div className={`font-semibold ${inspectionResult.found ? "text-[#047857]" : "text-[#c2410c]"}`}>
                          {inspectionResult.found ? "Nearby risk found" : "No nearby match"}
                        </div>
                        <InfoRow label="Hotspot" value={inspectionResult.nearestRiskCell?.id ?? "None"} />
                        <InfoRow
                          label="Distance"
                          value={inspectionResult.riskDistanceMeters === null ? "No risk cells" : `${Math.round(inspectionResult.riskDistanceMeters)} m`}
                        />
                        <InfoRow label="Confirmed dump" value={inspectionResult.nearestDump?.id ?? "None"} />
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}

            {activeTab === "routes" && (
              <div className="sidebar-section">
                <RouteOptimizer
                  solution={WARD_ROUTES}
                  showRoutes={showRoutes}
                  onToggleRoutes={() => setShowRoutes((value) => !value)}
                />
              </div>
            )}

            {activeTab === "cleanup" && (
              <div className="sidebar-section">
                <CleanupTracker onMissionsUpdate={() => refreshCleanup()} />
                <CommunityUpload />
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function TopMetric({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 py-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: tone }} />
      <span className="text-[13px] font-bold tabular-nums" style={{ color: tone }}>{value}</span>
      <span className="text-[11px] text-[#64748b]">{label}</span>
    </div>
  );
}

function ToggleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-[12px] font-semibold shadow-sm backdrop-blur transition-colors ${
        active
          ? "border-[#0f172a] bg-[#0f172a] text-white"
          : "border-[#e2e8f0] bg-white/95 text-[#334155] hover:border-[#94a3b8]"
      }`}
    >
      {children}
    </button>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function MapNotice({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "error" }) {
  return (
    <div className={`absolute right-4 top-4 z-[400] max-w-[320px] rounded-lg border px-3 py-2 text-[12px] shadow-sm ${
      tone === "error"
        ? "border-[#fecaca] bg-[#fef2f2] text-[#991b1b]"
        : "border-[#e2e8f0] bg-white/95 text-[#64748b]"
    }`}>
      {children}
    </div>
  );
}

function KpiBlock({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-lg border border-[#e2e8f0] bg-white p-3 text-center">
      <div className="text-[20px] font-bold leading-none tabular-nums" style={{ color }}>{value}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">{label}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-[#64748b]">{label}</span>
      <span className="truncate text-right font-semibold text-[#0f172a]">{value}</span>
    </div>
  );
}

function CoordinateInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">{label}</div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-[12px] text-[#0f172a] outline-none transition-colors focus:border-[#2563eb]"
        placeholder={placeholder}
      />
    </label>
  );
}

function PresetButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-[#e2e8f0] bg-white px-2 py-2 text-[11px] font-semibold text-[#64748b] transition-colors hover:border-[#2563eb] hover:text-[#2563eb]"
    >
      {children}
    </button>
  );
}
