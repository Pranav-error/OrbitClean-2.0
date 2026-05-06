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

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview",   icon: "◉" },
  { id: "routes",   label: "Routes",     icon: "⬡" },
  { id: "cleanup",  label: "Cleanup",    icon: "✓" },
  { id: "intel",    label: "ML Intel",   icon: "⬡" },
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
  const criticalDumps = activeDumps.filter((d) => d.risk_score >= 0.85);

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "var(--bg)" }}>

      {/* ══ HEADER ══ */}
      <header
        className="shrink-0 z-50"
        style={{
          background: "linear-gradient(180deg, #0d1225 0%, #0a1020 100%)",
          borderBottom: "1px solid var(--border)",
          boxShadow: "0 1px 0 rgba(20,184,166,0.06)",
        }}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3">
          {/* Left: Logo + location */}
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-3">
              {/* Satellite icon */}
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: "linear-gradient(135deg, #14b8a6 0%, #0891b2 100%)",
                  boxShadow: "0 0 20px rgba(20,184,166,0.35)",
                }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
                  <path d="M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span
                    style={{
                      fontFamily: "var(--font-syne), Syne, sans-serif",
                      fontSize: "17px",
                      fontWeight: 800,
                      letterSpacing: "-0.02em",
                      color: "#14b8a6",
                    }}
                  >
                    Orbit
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-syne), Syne, sans-serif",
                      fontSize: "17px",
                      fontWeight: 800,
                      letterSpacing: "-0.02em",
                      color: "#e2e8f0",
                    }}
                  >
                    Clean
                  </span>
                  <span
                    className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                    style={{ background: "rgba(20,184,166,0.15)", color: "#2dd4bf", border: "1px solid rgba(20,184,166,0.25)" }}
                  >
                    2.0
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
                  <span style={{ fontSize: "10px", color: "var(--mu)", letterSpacing: "0.02em" }}>
                    Thanisandra Ward 26 · BBMP · Live
                  </span>
                </div>
              </div>
            </div>

            {/* Separator */}
            <div className="h-8 w-px" style={{ background: "var(--border)" }} />

            {/* KPI strip */}
            <div className="flex items-center gap-2">
              <HeaderKPI value={activeDumps.length} label="Active Sites" color="#ef4444" critical={criticalDumps.length > 0} />
              <HeaderKPI value={criticalDumps.length} label="Critical" color="#f97316" />
              <HeaderKPI value={`${totalWeight.toFixed(1)}T`} label="Est. Waste" color="#f59e0b" />
              <HeaderKPI value={f.total_auto_tippers} label="Tippers" color="#3b82f6" />
              <HeaderKPI value={RISK_GRID.length} label="Risk Cells" color="#a855f7" />
              {cleanedSites.length > 0 && (
                <HeaderKPI value={cleanedSites.length} label="Cleaned" color="#22c55e" />
              )}
            </div>
          </div>

          {/* Right: Status + actions */}
          <div className="flex items-center gap-3">
            {fieldReports.length > 0 && (
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.25)" }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#a855f7] animate-pulse" />
                <span style={{ fontSize: "10px", fontWeight: 600, color: "#c084fc" }}>
                  {fieldReports.length} field capture{fieldReports.length > 1 ? "s" : ""}
                </span>
              </div>
            )}

            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
              style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
              <span style={{ fontSize: "10px", fontWeight: 600, color: "#4ade80" }}>ML Active · AUC 0.80</span>
            </div>

            <div
              className="px-3 py-1.5 rounded-lg"
              style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)" }}
            >
              <span style={{ fontSize: "10px", fontWeight: 500, color: "#60a5fa" }}>SWM Rules 2026</span>
            </div>

            <Link
              href="/qr"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all hover:brightness-110"
              style={{
                background: "linear-gradient(135deg, #14b8a6 0%, #0891b2 100%)",
                color: "white",
                fontSize: "11px",
                boxShadow: "0 2px 8px rgba(20,184,166,0.3)",
              }}
            >
              <span>⬡</span>
              <span>Route Simulation</span>
            </Link>
          </div>
        </div>

        {/* Sub-bar: satellite info + alert strip */}
        <div
          className="flex items-center justify-between px-5 py-1.5"
          style={{ borderTop: "1px solid var(--border-light)", background: "rgba(0,0,0,0.2)" }}
        >
          <div className="flex items-center gap-4">
            <SubBarItem icon="🛰" label="Sentinel-2A" value="20 Mar 2026 · T43PGQ" />
            <SubBarDot />
            <SubBarItem icon="📡" label="Scene" value="~90,000 px · 10m res · <5% cloud" />
            <SubBarDot />
            <SubBarItem icon="🎯" label="Ground Truth" value="2/2 matched (73m, 82m)" />
            <SubBarDot />
            <SubBarItem icon="🏭" label="Carbon Credits" value="₹4,97,000 · 248T CO₂-eq" color="#4ade80" />
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ fontSize: "9px", color: "var(--mu)" }}>AWI SpaceTech Hackathon · Team Resonance · REVA University</span>
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
            <div
              className="flex items-center gap-3 px-3 py-2 rounded-xl backdrop-blur-sm"
              style={{ background: "rgba(13,18,37,0.92)", border: "1px solid var(--border)", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}
            >
              <MapToggle label="Risk Heatmap" active={showHeatmap} color="#ef4444" onClick={() => setShowHeatmap((v) => !v)} />
              <div className="w-px h-4" style={{ background: "var(--border)" }} />
              <MapToggle label="Zone Coverage" active={showRoutes} color="#3b82f6" onClick={() => setShowRoutes((v) => !v)} />
            </div>

            <Link
              href="/qr"
              className="flex items-center gap-2 px-3 py-2 rounded-xl font-semibold text-white text-[11px] transition-all hover:brightness-110"
              style={{
                background: "linear-gradient(135deg, rgba(20,184,166,0.9) 0%, rgba(8,145,178,0.9) 100%)",
                border: "1px solid rgba(20,184,166,0.4)",
                boxShadow: "0 4px 16px rgba(20,184,166,0.25)",
                backdropFilter: "blur(8px)",
              }}
            >
              <span>🚛</span>
              <span>Live Route Simulation →</span>
            </Link>
          </div>

          {/* New capture notification */}
          {newCount > 0 && (
            <div
              className="absolute top-3 left-1/2 -translate-x-1/2 z-[400] flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-[11px]"
              style={{
                background: "rgba(168,85,247,0.9)",
                border: "1px solid rgba(168,85,247,0.5)",
                boxShadow: "0 4px 16px rgba(168,85,247,0.35)",
                color: "white",
                backdropFilter: "blur(8px)",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              +{newCount} new field capture{newCount > 1 ? "s" : ""} from iPhone
            </div>
          )}

          {/* Legend — bottom right */}
          {(showHeatmap || showRoutes) && (
            <div
              className="absolute bottom-4 right-3 z-[400] px-3 py-3 rounded-xl backdrop-blur-sm"
              style={{ background: "rgba(13,18,37,0.92)", border: "1px solid var(--border)", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}
            >
              {showHeatmap && (
                <>
                  <div className="section-label mb-2">Risk Level</div>
                  {[
                    { color: "#ef4444", label: "Critical ≥ 85%" },
                    { color: "#f97316", label: "High  70–84%" },
                    { color: "#eab308", label: "Medium 50–69%" },
                  ].map((r) => (
                    <div key={r.label} className="flex items-center gap-2 mb-1.5">
                      <div className="w-2 h-2 rounded" style={{ background: r.color, boxShadow: `0 0 4px ${r.color}80` }} />
                      <span style={{ fontSize: "10px", color: "var(--tx2)" }}>{r.label}</span>
                    </div>
                  ))}
                  {cleanedSites.length > 0 && (
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-2 h-2 rounded" style={{ background: "#22c55e", boxShadow: "0 0 4px rgba(34,197,94,0.5)" }} />
                      <span style={{ fontSize: "10px", color: "var(--tx2)" }}>Cleaned & Verified</span>
                    </div>
                  )}
                  <div
                    className="mt-2 pt-2 text-center"
                    style={{ borderTop: "1px solid var(--border-light)", fontSize: "9px", color: "var(--mu)" }}
                  >
                    {RISK_GRID.length} XGBoost cells
                  </div>
                </>
              )}

              {showRoutes && (
                <>
                  {showHeatmap && <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--border-light)" }} />}
                  {!showHeatmap && null}
                  <div className="section-label mb-2 mt-1">Zone Coverage</div>
                  {WARD_ROUTES.zones.map((z) => (
                    <div key={z.zone_id} className="flex items-center gap-2 mb-1.5">
                      <div className="w-5 h-0.5 rounded" style={{ background: z.color }} />
                      <span style={{ fontSize: "10px", color: "var(--tx2)" }}>{z.zone_id} · {z.route_length_km}km</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Live captures — bottom left */}
          {fieldReports.length > 0 && (
            <div className="absolute bottom-4 left-4 z-[400]">
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-sm"
                style={{ background: "rgba(13,18,37,0.92)", border: "1px solid rgba(168,85,247,0.3)", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}
              >
                <div className="w-2 h-2 rounded-full bg-[#a855f7] animate-pulse" />
                <span style={{ fontSize: "11px", color: "var(--tx2)", fontWeight: 500 }}>
                  {fieldReports.length} field capture{fieldReports.length > 1 ? "s" : ""} live
                </span>
              </div>
            </div>
          )}
        </main>

        {/* ══ RIGHT SIDEBAR ══ */}
        <aside
          className="shrink-0 flex flex-col"
          style={{
            width: "var(--sidebar-w)",
            background: "var(--surface)",
            borderLeft: "1px solid var(--border)",
          }}
        >
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
                {/* Ward summary */}
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">Ward Summary</span>
                    <span className="badge badge-teal">Ward 26</span>
                  </div>
                  <div className="p-3">
                    <div className="grid grid-cols-4 gap-2">
                      <div className="kpi-pill">
                        <span className="kpi-value" style={{ color: "#ef4444" }}>{activeDumps.length}</span>
                        <span className="kpi-label">Dumps</span>
                      </div>
                      <div className="kpi-pill">
                        <span className="kpi-value" style={{ color: "#f59e0b" }}>{totalWeight.toFixed(1)}T</span>
                        <span className="kpi-label">Waste</span>
                      </div>
                      <div className="kpi-pill">
                        <span className="kpi-value" style={{ color: "#3b82f6" }}>{f.total_auto_tippers}</span>
                        <span className="kpi-label">Tippers</span>
                      </div>
                      <div className="kpi-pill">
                        <span className="kpi-value" style={{ color: "#22c55e" }}>{cleanedSites.length}</span>
                        <span className="kpi-label">Cleaned</span>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {[
                        { label: "Area", value: "8.2 km²" },
                        { label: "Population", value: "52,000" },
                        { label: "Households", value: "~13,000" },
                        { label: "Daily TPD", value: `${f.total_daily_waste_tonnes}T` },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className="rounded-lg px-3 py-2"
                          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-light)" }}
                        >
                          <span style={{ fontSize: "9px", color: "var(--mu)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            {item.label}
                          </span>
                          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--tx)", marginTop: "2px" }}>
                            {item.value}
                          </div>
                        </div>
                      ))}
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

/* ══ Sub-components ══ */

function HeaderKPI({
  value,
  label,
  color,
  critical,
}: {
  value: string | number;
  label: string;
  color: string;
  critical?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
      style={{
        background: `${color}10`,
        border: `1px solid ${color}28`,
        boxShadow: critical ? `0 0 8px ${color}30` : "none",
      }}
    >
      <span style={{ fontSize: "12px", fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
      <span style={{ fontSize: "9.5px", color: "var(--mu)", letterSpacing: "0.02em" }}>{label}</span>
    </div>
  );
}

function SubBarItem({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span style={{ fontSize: "10px" }}>{icon}</span>
      <span style={{ fontSize: "9px", color: "var(--mu)" }}>{label}:</span>
      <span style={{ fontSize: "9px", fontWeight: 600, color: color ?? "var(--tx2)" }}>{value}</span>
    </div>
  );
}

function SubBarDot() {
  return <span style={{ color: "var(--mu2)", fontSize: "8px" }}>·</span>;
}

function MapToggle({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 text-[11px] font-medium">
      <div
        className="w-3 h-3 rounded transition-all"
        style={{
          background: active ? color : "transparent",
          border: `2px solid ${active ? color : "var(--border)"}`,
          boxShadow: active ? `0 0 6px ${color}60` : "none",
        }}
      />
      <span style={{ color: active ? "var(--tx)" : "var(--mu)" }}>{label}</span>
    </button>
  );
}
