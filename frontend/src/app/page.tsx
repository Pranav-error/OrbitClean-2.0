"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { DumpSite } from "@/types";
import { DUMPS, WARDS, RISK_GRID, WARD_ROUTES } from "@/lib/data";
import { useFieldReports } from "@/lib/useFieldReports";
import { useCleanupData } from "@/lib/useCleanupData";

import Link from "next/link";
import DumpList from "@/components/DumpList";
import WardLeaderboard from "@/components/WardLeaderboard";
import RouteOptimizer from "@/components/RouteOptimizer";
import CommunityUpload from "@/components/CommunityUpload";
import RetrainStatus from "@/components/RetrainStatus";
import CleanupTracker from "@/components/CleanupTracker";
import MLInfo from "@/components/MLInfo";
import WasteClassifier from "@/components/WasteClassifier";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

type Tab = "overview" | "routes" | "cleanup" | "intel";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "routes", label: "Fleet & Routes" },
  { id: "cleanup", label: "Cleanup Ops" },
  { id: "intel", label: "ML & Community" },
];

export default function DashboardPage() {
  const [selectedDump, setSelectedDump] = useState<DumpSite | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const { reports: fieldReports, newCount } = useFieldReports();
  const { cleanedSites, communityPhotos, refresh: refreshCleanup } = useCleanupData();

  const activeDumps = DUMPS.filter((d) => d.status === "Active");
  const totalWeight = activeDumps.reduce((s, d) => s + (d.estimated_weight_tonnes ?? 0), 0);
  const f = WARD_ROUTES.fleet_summary;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#f8fafc]">

      {/* ══ HEADER ══ */}
      <header className="flex items-center justify-between px-5 py-2.5 bg-white border-b border-[#e2e8f0] z-50 shrink-0">
        <div className="flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                <path d="M2 12h20"/>
              </svg>
            </div>
            <div>
              <div className="text-[15px] font-bold tracking-tight leading-none">
                <span className="text-[#10b981]">Orbit</span><span className="text-[#0f172a]">Clean</span>
                <span className="text-[10px] text-[#94a3b8] font-medium ml-1.5">2.0</span>
              </div>
              <div className="text-[10px] text-[#94a3b8] leading-none mt-0.5">Thanisandra Ward 26, Bengaluru</div>
            </div>
          </div>

          <div className="h-8 w-px bg-[#e2e8f0]" />

          {/* KPI strip */}
          <div className="flex items-center gap-3">
            <KPIPill value={activeDumps.length} label="Active Sites" color="#ef4444" />
            <KPIPill value={`${totalWeight.toFixed(1)}T`} label="Est. Waste" color="#f59e0b" />
            <KPIPill value={f.total_auto_tippers} label="Tippers" color="#0ea5e9" />
            <KPIPill value={`${f.total_daily_waste_tonnes}T`} label="Daily TPD" color="#8b5cf6" />
            <KPIPill value={RISK_GRID.length} label="Risk Cells" color="#f97316" />
            {cleanedSites.length > 0 && (
              <KPIPill value={cleanedSites.length} label="Cleaned" color="#10b981" />
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/qr"
            className="px-3 py-1.5 rounded-lg bg-[#2563eb] text-white text-[11px] font-semibold hover:bg-[#1d4ed8] transition-colors"
          >
            🗺 Route Simulation
          </Link>
          {fieldReports.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#f5f3ff] border border-[#e9e5ff]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#7c3aed] animate-pulse" />
              <span className="text-[10px] font-semibold text-[#7c3aed]">{fieldReports.length} field captures</span>
            </div>
          )}
          <div className="px-2.5 py-1 rounded-full bg-[#f0fdf4] border border-[#bbf7d0] text-[10px] font-semibold text-[#059669]">
            ML Active · AUC 0.80
          </div>
          <div className="px-2.5 py-1 rounded-full bg-[#f8fafc] border border-[#e2e8f0] text-[10px] font-medium text-[#64748b]">
            BBMP SWM 2026
          </div>
        </div>
      </header>

      {/* ══ MAIN LAYOUT ══ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── MAP ── */}
        <main className="relative flex-1 overflow-hidden">
          <MapView
            dumps={DUMPS}
            recyclers={[]}
            riskGrid={RISK_GRID}
            fieldReports={fieldReports}
            selectedDump={selectedDump}
            showHeatmap={showHeatmap}
            showRecyclers={false}
            showWater={false}
            zones={WARD_ROUTES.zones}
            showRoutes={showRoutes}
            cleanedSites={cleanedSites}
            communityPhotos={communityPhotos}
          />

          {/* Map controls — top right */}
          <div className="absolute top-3 right-3 z-[400] flex flex-col gap-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/95 border border-[#e2e8f0] shadow-sm backdrop-blur-sm">
              <MapToggle
                label="Risk Heatmap"
                active={showHeatmap}
                color="#ef4444"
                onClick={() => setShowHeatmap((v) => !v)}
              />
              <div className="w-px h-4 bg-[#e2e8f0]" />
              <MapToggle
                label="Zone Coverage"
                active={showRoutes}
                color="#0ea5e9"
                onClick={() => setShowRoutes((v) => !v)}
              />
            </div>
            <Link
              href="/qr"
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#2563eb] text-white text-[11px] font-semibold shadow-md hover:bg-[#1d4ed8] transition-colors"
            >
              <span>🚛</span>
              <span>Live Route Simulation →</span>
            </Link>
          </div>

          {/* Field capture notification — top center */}
          {newCount > 0 && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[400] px-4 py-2 rounded-lg bg-[#7c3aed] text-white text-[11px] font-semibold shadow-lg animate-pulse">
              +{newCount} new field capture{newCount > 1 ? "s" : ""} from iPhone
            </div>
          )}

          {/* Legend — bottom right */}
          {(showHeatmap || showRoutes) && (
            <div className="absolute bottom-4 right-3 z-[400] px-3 py-2.5 rounded-lg bg-white/95 border border-[#e2e8f0] shadow-sm backdrop-blur-sm">
              {showHeatmap && (
                <>
                  <div className="text-[9px] text-[#94a3b8] uppercase tracking-wider font-semibold mb-2">Risk Level</div>
                  {[
                    { color: "#ef4444", label: "Critical  >= 85%" },
                    { color: "#f97316", label: "High  70-84%" },
                  ].map((r) => (
                    <div key={r.label} className="flex items-center gap-2 mb-1">
                      <div className="w-2.5 h-2.5 rounded" style={{ background: r.color }} />
                      <span className="text-[10px] text-[#64748b]">{r.label}</span>
                    </div>
                  ))}
                  {cleanedSites.length > 0 && (
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2.5 h-2.5 rounded bg-[#10b981]" />
                      <span className="text-[10px] text-[#64748b]">Cleaned & Verified</span>
                    </div>
                  )}
                  {communityPhotos.length > 0 && (
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2.5 h-2.5 rounded bg-[#f59e0b]" />
                      <span className="text-[10px] text-[#64748b]">Community Reports</span>
                    </div>
                  )}
                  <div className="text-[9px] text-[#94a3b8] mt-2 pt-2 border-t border-[#e2e8f0]">
                    {RISK_GRID.length} ML-predicted cells · Gradient Boosting
                  </div>
                </>
              )}
              {showRoutes && (
                <>
                  {showHeatmap && <div className="mt-2 pt-2 border-t border-[#e2e8f0]" />}
                  <div className="text-[9px] text-[#94a3b8] uppercase tracking-wider font-semibold mb-2">Zone Coverage</div>
                  {WARD_ROUTES.zones.map((z) => (
                    <div key={z.zone_id} className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-0.5 rounded" style={{ background: z.color }} />
                      <span className="text-[10px] text-[#64748b]">{z.zone_id} — {z.route_length_km}km</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-3 h-3 rounded bg-[#0ea5e9]" />
                    <span className="text-[10px] text-[#64748b]">Depot / Start</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Live captures — bottom left */}
          {fieldReports.length > 0 && (
            <div className="absolute bottom-4 left-4 z-[400]">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/95 border border-[#e2e8f0] shadow-sm backdrop-blur-sm">
                <div className="w-2 h-2 rounded-full bg-[#7c3aed] animate-pulse" />
                <span className="text-[11px] text-[#334155] font-medium">
                  {fieldReports.length} field capture{fieldReports.length > 1 ? "s" : ""} live
                </span>
              </div>
            </div>
          )}
        </main>

        {/* ══ RIGHT SIDEBAR ══ */}
        <aside className="w-[380px] shrink-0 flex flex-col border-l border-[#e2e8f0] bg-[#f8fafc]">

          {/* Tabs */}
          <div className="sidebar-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`sidebar-tab ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">

            {/* ── OVERVIEW TAB ── */}
            {activeTab === "overview" && (
              <div className="sidebar-section">
                {/* Ward summary card */}
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">Ward Summary</span>
                    <span className="badge badge-blue">Ward 26</span>
                  </div>
                  <div className="p-3">
                    <div className="grid grid-cols-4 gap-2">
                      <div className="kpi-pill">
                        <span className="kpi-value text-[#ef4444]">{activeDumps.length}</span>
                        <span className="kpi-label">Dumps</span>
                      </div>
                      <div className="kpi-pill">
                        <span className="kpi-value text-[#f59e0b]">{totalWeight.toFixed(1)}T</span>
                        <span className="kpi-label">Waste</span>
                      </div>
                      <div className="kpi-pill">
                        <span className="kpi-value text-[#0ea5e9]">{f.total_auto_tippers}</span>
                        <span className="kpi-label">Tippers</span>
                      </div>
                      <div className="kpi-pill">
                        <span className="kpi-value text-[#10b981]">{cleanedSites.length}</span>
                        <span className="kpi-label">Cleaned</span>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                      <div className="rounded-lg bg-[#f1f5f9] px-3 py-2">
                        <span className="text-[#64748b]">Area: </span>
                        <span className="font-semibold text-[#334155]">8.2 km²</span>
                      </div>
                      <div className="rounded-lg bg-[#f1f5f9] px-3 py-2">
                        <span className="text-[#64748b]">Population: </span>
                        <span className="font-semibold text-[#334155]">52,000</span>
                      </div>
                      <div className="rounded-lg bg-[#f1f5f9] px-3 py-2">
                        <span className="text-[#64748b]">Households: </span>
                        <span className="font-semibold text-[#334155]">~13,000</span>
                      </div>
                      <div className="rounded-lg bg-[#f1f5f9] px-3 py-2">
                        <span className="text-[#64748b]">Daily TPD: </span>
                        <span className="font-semibold text-[#334155]">{f.total_daily_waste_tonnes}T</span>
                      </div>
                    </div>
                  </div>
                </div>

                <DumpList dumps={DUMPS} onSelect={setSelectedDump} />
                <WardLeaderboard wards={WARDS} />
              </div>
            )}

            {/* ── ROUTES TAB ── */}
            {activeTab === "routes" && (
              <div className="sidebar-section">
                <RouteOptimizer
                  solution={WARD_ROUTES}
                  showRoutes={showRoutes}
                  onToggleRoutes={() => setShowRoutes((v) => !v)}
                />
              </div>
            )}

            {/* ── CLEANUP TAB ── */}
            {activeTab === "cleanup" && (
              <div className="sidebar-section">
                <CleanupTracker onMissionsUpdate={() => refreshCleanup()} />
                <CommunityUpload />
              </div>
            )}

            {/* ── ML & COMMUNITY TAB ── */}
            {activeTab === "intel" && (
              <div className="sidebar-section">
                <WasteClassifier />
                <MLInfo />
                <RetrainStatus />
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ── Small components ── */

function KPIPill({ value, label, color }: { value: string | number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#f8fafc] border border-[#e2e8f0]">
      <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      <span className="text-[12px] font-bold tabular-nums" style={{ color }}>{value}</span>
      <span className="text-[10px] text-[#94a3b8]">{label}</span>
    </div>
  );
}

function MapToggle({ label, active, color, onClick }: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 text-[11px] font-medium">
      <div
        className="w-3 h-3 rounded border-2 transition-all"
        style={{
          background: active ? color : "transparent",
          borderColor: active ? color : "#cbd5e1",
        }}
      />
      <span className={active ? "text-[#0f172a]" : "text-[#94a3b8]"}>{label}</span>
    </button>
  );
}
