"use client";

import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
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
import AIChat from "@/components/AIChat";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

type Tab = "overview" | "routes" | "cleanup" | "intel" | "ai";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "routes",   label: "Routes" },
  { id: "cleanup",  label: "Cleanup" },
  { id: "intel",    label: "ML Intel" },
  { id: "ai",       label: "AI Chat" },
];

export default function DashboardPage() {
  const [selectedDump, setSelectedDump] = useState<DumpSite | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
          background: "#ffffff",
          borderBottom: "1px solid var(--border)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
      >
        <div className="flex items-center gap-5 px-5 py-3">
          {/* Logo */}
          <div className="flex items-center gap-3 shrink-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: "linear-gradient(135deg, #1d4ed8 0%, #0891b2 100%)",
                boxShadow: "0 2px 8px rgba(29,78,216,0.28)",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
                <path d="M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span style={{ fontFamily: "var(--font-syne), Syne, sans-serif", fontSize: "17px", fontWeight: 800, letterSpacing: "-0.02em", color: "#1d4ed8" }}>
                  Orbit
                </span>
                <span style={{ fontFamily: "var(--font-syne), Syne, sans-serif", fontSize: "17px", fontWeight: 800, letterSpacing: "-0.02em", color: "#0f172a" }}>
                  Clean
                </span>
                <span
                  className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                  style={{ background: "rgba(29,78,216,0.09)", color: "#1d4ed8", border: "1px solid rgba(29,78,216,0.2)" }}
                >
                  2.0
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#16a34a" }} />
                <span style={{ fontSize: "10px", color: "var(--tx2)" }}>
                  Thanisandra Ward 26 · BBMP · Live
                </span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-10 w-px shrink-0" style={{ background: "var(--border)" }} />

          {/* KPI Cards */}
          <div className="flex items-center gap-2 flex-1 overflow-x-auto">
            <HeaderKPI
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="m19 6-.867 12.142A2 2 0 0 1 16.138 20H7.862a2 2 0 0 1-1.995-1.858L5 6" />
                  <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              }
              value={activeDumps.length}
              label="Active Dumps"
              color="#dc2626"
              critical={criticalDumps.length > 0}
            />
            <HeaderKPI
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              }
              value={criticalDumps.length}
              label="Critical"
              color="#ea580c"
            />
            <HeaderKPI
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              }
              value={`${totalWeight.toFixed(1)}T`}
              label="Est. Waste"
              color="#d97706"
            />
            <HeaderKPI
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="3" width="15" height="13" rx="2" />
                  <path d="M16 8h4l3 3v5h-7V8z" />
                  <circle cx="5.5" cy="18.5" r="2.5" />
                  <circle cx="18.5" cy="18.5" r="2.5" />
                </svg>
              }
              value={f.total_auto_tippers}
              label="Fleet"
              color="#1d4ed8"
            />
            <HeaderKPI
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              }
              value={RISK_GRID.length}
              label="Risk Cells"
              color="#7c3aed"
            />
            {cleanedSites.length > 0 && (
              <HeaderKPI
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                }
                value={cleanedSites.length}
                label="Cleaned"
                color="#16a34a"
              />
            )}
          </div>

          {/* Right: Status chips + action */}
          <div className="flex items-center gap-2 shrink-0">
            {fieldReports.length > 0 && (
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                style={{ background: "var(--purple-soft)", border: "1px solid rgba(124,58,237,0.2)" }}
              >
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#7c3aed" }} />
                <span style={{ fontSize: "10px", fontWeight: 600, color: "#6d28d9" }}>
                  {fieldReports.length} field capture{fieldReports.length > 1 ? "s" : ""}
                </span>
              </div>
            )}
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
              style={{ background: "var(--success-soft)", border: "1px solid rgba(22,163,74,0.2)" }}
            >
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#16a34a" }} />
              <span style={{ fontSize: "10px", fontWeight: 600, color: "#15803d" }}>ML Active · AUC 0.80</span>
            </div>
            <div
              className="px-3 py-1.5 rounded-lg"
              style={{ background: "var(--primary-soft)", border: "1px solid rgba(29,78,216,0.2)" }}
            >
              <span style={{ fontSize: "10px", fontWeight: 500, color: "#1d4ed8" }}>SWM 2026</span>
            </div>
            <Link
              href="/qr"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all hover:brightness-105"
              style={{
                background: "linear-gradient(135deg, #1d4ed8 0%, #0891b2 100%)",
                color: "white",
                fontSize: "11px",
                boxShadow: "0 2px 6px rgba(29,78,216,0.28)",
              }}
            >
              <span>🚛</span>
              <span>Route Simulation</span>
            </Link>
          </div>
        </div>

        {/* Sub-bar */}
        <div
          className="flex items-center justify-between px-5 py-1.5"
          style={{ background: "var(--card-raised)", borderTop: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-4">
            <SubBarItem icon="🛰" label="Sentinel-2A" value="20 Mar 2026 · T43PGQ" />
            <SubBarDot />
            <SubBarItem icon="📡" label="Scene" value="~90,000 px · 10m res · <5% cloud" />
            <SubBarDot />
            <SubBarItem icon="🎯" label="Ground Truth" value="2/2 matched (73m, 82m)" />
            <SubBarDot />
            <SubBarItem icon="🌿" label="Carbon Credits" value="₹4,97,000 · 248T CO₂-eq" color="#15803d" />
          </div>
          <span style={{ fontSize: "9px", color: "var(--mu)" }}>
            AWI SpaceTech Hackathon · Team Resonance · REVA University
          </span>
        </div>
      </header>

      {/* ══ TOP NAV TABS ══ */}
      <nav
        className="shrink-0 flex items-end px-4 gap-1"
        style={{
          background: "#ffffff",
          borderBottom: "1px solid var(--border)",
          boxShadow: "0 1px 0 rgba(0,0,0,0.04)",
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "10px 16px",
              fontSize: "12.5px",
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? "#1d4ed8" : "var(--tx2)",
              background: "none",
              border: "none",
              borderBottom: activeTab === tab.id ? "2px solid #1d4ed8" : "2px solid transparent",
              marginBottom: "-1px",
              cursor: "pointer",
              transition: "color 0.15s, border-color 0.15s",
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
          </button>
        ))}
        <div className="flex-1" />
        <span style={{ fontSize: "9px", color: "var(--mu)", paddingBottom: "10px" }}>
          13.059°N 77.630°E · Bengaluru
        </span>
      </nav>

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
              className="flex items-center gap-3 px-3 py-2 rounded-xl"
              style={{
                background: "rgba(255,255,255,0.96)",
                border: "1px solid var(--border)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                backdropFilter: "blur(8px)",
              }}
            >
              <MapToggle label="Risk Heatmap" active={showHeatmap} color="#dc2626" onClick={() => setShowHeatmap((v) => !v)} />
              <div className="w-px h-4" style={{ background: "var(--border)" }} />
              <MapToggle label="Zone Coverage" active={showRoutes} color="#1d4ed8" onClick={() => setShowRoutes((v) => !v)} />
            </div>

            <Link
              href="/qr"
              className="flex items-center gap-2 px-3 py-2 rounded-xl font-semibold text-white text-[11px] transition-all hover:brightness-105"
              style={{
                background: "linear-gradient(135deg, #1d4ed8, #0891b2)",
                border: "1px solid rgba(29,78,216,0.3)",
                boxShadow: "0 2px 8px rgba(29,78,216,0.25)",
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
              className="absolute top-3 left-1/2 -translate-x-1/2 z-[400] flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-[11px] text-white"
              style={{
                background: "#7c3aed",
                border: "1px solid rgba(124,58,237,0.5)",
                boxShadow: "0 4px 12px rgba(124,58,237,0.3)",
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
              className="absolute bottom-4 right-3 z-[400] px-3 py-3 rounded-xl"
              style={{
                background: "rgba(255,255,255,0.96)",
                border: "1px solid var(--border)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                backdropFilter: "blur(8px)",
              }}
            >
              {showHeatmap && (
                <>
                  <div className="section-label mb-2">Risk Level</div>
                  {[
                    { color: "#dc2626", label: "Critical ≥ 85%" },
                    { color: "#ea580c", label: "High  70–84%" },
                    { color: "#ca8a04", label: "Medium 50–69%" },
                  ].map((r) => (
                    <div key={r.label} className="flex items-center gap-2 mb-1.5">
                      <div className="w-2 h-2 rounded-sm" style={{ background: r.color }} />
                      <span style={{ fontSize: "10px", color: "var(--tx2)" }}>{r.label}</span>
                    </div>
                  ))}
                  {cleanedSites.length > 0 && (
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-2 h-2 rounded-sm" style={{ background: "#16a34a" }} />
                      <span style={{ fontSize: "10px", color: "var(--tx2)" }}>Cleaned & Verified</span>
                    </div>
                  )}
                  <div
                    className="mt-2 pt-2 text-center"
                    style={{ borderTop: "1px solid var(--border)", fontSize: "9px", color: "var(--mu)" }}
                  >
                    {RISK_GRID.length} XGBoost cells
                  </div>
                </>
              )}
              {showRoutes && (
                <>
                  {showHeatmap && <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--border)" }} />}
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
                className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{
                  background: "rgba(255,255,255,0.96)",
                  border: "1px solid rgba(124,58,237,0.25)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                }}
              >
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#7c3aed" }} />
                <span style={{ fontSize: "11px", color: "var(--tx2)", fontWeight: 500 }}>
                  {fieldReports.length} field capture{fieldReports.length > 1 ? "s" : ""} live
                </span>
              </div>
            </div>
          )}
        </main>

        {/* ══ SIDEBAR COLLAPSE TOGGLE ══ */}
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="shrink-0 flex items-center justify-center transition-colors hover:bg-blue-50"
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          style={{
            width: "20px",
            background: "var(--card-raised)",
            borderLeft: "1px solid var(--border)",
            borderRight: "1px solid var(--border)",
            color: "var(--mu)",
            cursor: "pointer",
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {sidebarOpen
              ? <polyline points="15 18 9 12 15 6" />
              : <polyline points="9 18 15 12 9 6" />
            }
          </svg>
        </button>

        {/* ══ RIGHT SIDEBAR ══ */}
        {sidebarOpen && (
          <aside
            className="shrink-0 flex flex-col overflow-hidden"
            style={{
              width: "var(--sidebar-w)",
              background: "var(--bg)",
              borderLeft: "1px solid var(--border)",
            }}
          >
            <div className="flex-1 overflow-y-auto">

              {/* ── OVERVIEW ── */}
              {activeTab === "overview" && (
                <div className="sidebar-section">
                  <div className="card">
                    <div className="card-header">
                      <span className="card-title">Ward Summary</span>
                      <span className="badge badge-blue">Ward 26</span>
                    </div>
                    <div className="p-3">
                      <div className="grid grid-cols-4 gap-2">
                        <div className="kpi-pill">
                          <span className="kpi-value" style={{ color: "#dc2626" }}>{activeDumps.length}</span>
                          <span className="kpi-label">Dumps</span>
                        </div>
                        <div className="kpi-pill">
                          <span className="kpi-value" style={{ color: "#d97706" }}>{totalWeight.toFixed(1)}T</span>
                          <span className="kpi-label">Waste</span>
                        </div>
                        <div className="kpi-pill">
                          <span className="kpi-value" style={{ color: "#1d4ed8" }}>{f.total_auto_tippers}</span>
                          <span className="kpi-label">Tippers</span>
                        </div>
                        <div className="kpi-pill">
                          <span className="kpi-value" style={{ color: "#16a34a" }}>{cleanedSites.length}</span>
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
                            style={{ background: "var(--card-raised)", border: "1px solid var(--border)" }}
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

              {/* ── ROUTES ── */}
              {activeTab === "routes" && (
                <div className="sidebar-section">
                  <RouteOptimizer
                    solution={WARD_ROUTES}
                    showRoutes={showRoutes}
                    onToggleRoutes={() => setShowRoutes((v) => !v)}
                  />
                </div>
              )}

              {/* ── CLEANUP ── */}
              {activeTab === "cleanup" && (
                <div className="sidebar-section">
                  <CleanupTracker onMissionsUpdate={() => refreshCleanup()} />
                  <CommunityUpload />
                </div>
              )}

              {/* ── ML INTEL ── */}
              {activeTab === "intel" && (
                <div className="sidebar-section">
                  <WasteClassifier />
                  <MLInfo />
                  <RetrainStatus />
                </div>
              )}

              {/* ── AI CHAT ── */}
              {activeTab === "ai" && (
                <div className="sidebar-section">
                  <AIChat />
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

/* ══ Sub-components ══ */

function HeaderKPI({
  icon,
  value,
  label,
  color,
  critical,
}: {
  icon: ReactNode;
  value: string | number;
  label: string;
  color: string;
  critical?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-xl shrink-0 transition-all"
      style={{
        background: `${color}0d`,
        border: `1px solid ${color}22`,
        boxShadow: critical ? `0 0 0 2px ${color}18` : "none",
      }}
    >
      <div style={{ color, opacity: 0.85 }}>{icon}</div>
      <div>
        <div style={{ fontSize: "15px", fontWeight: 700, color, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
          {value}
        </div>
        <div style={{ fontSize: "9px", color: "var(--tx2)", marginTop: "2px", letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
          {label}
        </div>
      </div>
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
          border: `2px solid ${active ? color : "#cbd5e1"}`,
          boxShadow: active ? `0 0 4px ${color}50` : "none",
        }}
      />
      <span style={{ color: active ? "var(--tx)" : "var(--mu)" }}>{label}</span>
    </button>
  );
}
