"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, type ReactNode } from "react";
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
import AlertsPanel from "@/components/AlertsPanel";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

type Tab = "overview" | "routes" | "cleanup" | "intel" | "ai" | "alerts";

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  {
    id: "overview", label: "Overview",
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    id: "routes", label: "Routes",
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="3 11 22 2 13 21 11 13 3 11" />
      </svg>
    ),
  },
  {
    id: "cleanup", label: "Cleanup",
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
  },
  {
    id: "intel", label: "ML Intel",
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <rect x="9" y="9" width="6" height="6" />
        <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3" />
      </svg>
    ),
  },
  {
    id: "ai", label: "AI Chat",
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    id: "alerts", label: "Alerts",
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
];

export default function DashboardPage() {
  const [selectedDump, setSelectedDump] = useState<DumpSite | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [darkMode, setDarkMode] = useState<boolean>(() =>
    typeof window !== "undefined" && localStorage.getItem("oc-theme") === "dark"
  );
  const [search, setSearch] = useState("");
  const { reports: fieldReports, newCount } = useFieldReports();
  const { cleanedSites, communityPhotos, refresh: refreshCleanup } = useCleanupData();

  // Persist dark mode to localStorage
  useEffect(() => {
    localStorage.setItem("oc-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const activeDumps = DUMPS.filter((d) => d.status === "Active");
  const totalWeight = activeDumps.reduce((s, d) => s + (d.estimated_weight_tonnes ?? 0), 0);
  const f = WARD_ROUTES.fleet_summary;
  const criticalDumps = activeDumps.filter((d) => d.risk_score >= 0.85);

  // Filtered dumps for Overview search
  const filteredDumps = search.trim()
    ? DUMPS.filter((d) =>
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        d.swm_stream?.toLowerCase().includes(search.toLowerCase())
      )
    : DUMPS;

  // CSV export
  function exportCSV() {
    const rows = [
      ["ID", "Name", "Status", "Risk Score", "Stream", "Weight (T)", "Area (m²)", "Detected"],
      ...activeDumps.map((d) => [
        d.id, d.name, d.status,
        d.risk_score.toFixed(2), d.swm_stream,
        d.estimated_weight_tonnes ?? "", d.area_sqm, d.detected_date,
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orbitclean-dumps-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: "var(--bg)" }}
      data-theme={darkMode ? "dark" : "light"}
    >
      {/* ══ HEADER ══ */}
      <header
        className="shrink-0 z-50 flex items-center gap-4 px-4"
        style={{
          height: "var(--header-h)",
          background: "var(--card)",
          borderBottom: "1px solid var(--border)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #1d4ed8 0%, #0891b2 100%)" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
              <path d="M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span style={{ fontFamily: "var(--font-syne), Syne, sans-serif", fontSize: "15px", fontWeight: 800, letterSpacing: "-0.02em", color: "#1d4ed8" }}>
                Orbit
              </span>
              <span style={{ fontFamily: "var(--font-syne), Syne, sans-serif", fontSize: "15px", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--tx)" }}>
                Clean
              </span>
              <span
                className="px-1 py-0.5 rounded text-[8px] font-bold"
                style={{ background: "var(--primary-soft)", color: "#1d4ed8", border: "1px solid rgba(29,78,216,0.2)" }}
              >
                2.0
              </span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#16a34a" }} />
              <span style={{ fontSize: "9px", color: "var(--mu)" }}>Thanisandra · Live</span>
            </div>
          </div>
        </div>

        <div className="w-px h-8 shrink-0" style={{ background: "var(--border)" }} />

        {/* Compact stats */}
        <div className="flex items-center gap-4">
          <CompactStat value={activeDumps.length} label="dumps" color={criticalDumps.length > 0 ? "#dc2626" : "var(--tx)"} />
          <CompactStat value={criticalDumps.length} label="critical" color="#ea580c" />
          <CompactStat value={`${totalWeight.toFixed(0)}T`} label="waste" />
          <CompactStat value={f.total_auto_tippers} label="fleet" />
          <CompactStat value={RISK_GRID.length} label="risk cells" />
          {cleanedSites.length > 0 && (
            <CompactStat value={cleanedSites.length} label="cleaned" color="#16a34a" />
          )}
        </div>

        <div className="flex-1" />

        {/* Right controls */}
        <div className="flex items-center gap-2 shrink-0">
          {fieldReports.length > 0 && (
            <span
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[9.5px] font-medium"
              style={{ background: "var(--purple-soft)", color: "#7c3aed" }}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#7c3aed" }} />
              {fieldReports.length} field capture{fieldReports.length > 1 ? "s" : ""}
            </span>
          )}

          <span
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[9.5px] font-medium"
            style={{ background: "var(--success-soft)", color: "#15803d" }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-green-500" />
            ML Active
          </span>

          {/* Dark mode toggle */}
          <button
            onClick={() => setDarkMode((v) => !v)}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:brightness-95"
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            style={{ background: "var(--card-raised)", border: "1px solid var(--border)", color: "var(--tx2)" }}
          >
            {darkMode ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          {/* Export CSV */}
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10.5px] font-medium transition-all hover:brightness-95"
            title="Export active dumps as CSV"
            style={{ background: "var(--card-raised)", border: "1px solid var(--border)", color: "var(--tx2)" }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
          </button>

          <Link
            href="/qr"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all hover:brightness-105"
            style={{
              background: "linear-gradient(135deg, #1d4ed8 0%, #0891b2 100%)",
              color: "white",
              fontSize: "10.5px",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="3" width="15" height="13" rx="2" /><path d="M16 8h4l3 3v5h-7V8z" />
              <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
            </svg>
            Route Sim
          </Link>
        </div>
      </header>

      {/* ══ TABS ══ */}
      <nav
        className="shrink-0 flex items-end px-4 gap-0.5"
        style={{ background: "var(--card)", borderBottom: "1px solid var(--border)" }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5"
              style={{
                padding: "9px 14px",
                fontSize: "11.5px",
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "#1d4ed8" : "var(--tx2)",
                background: "none",
                border: "none",
                borderBottom: isActive ? "2px solid #1d4ed8" : "2px solid transparent",
                marginBottom: "-1px",
                cursor: "pointer",
                transition: "color 0.15s, border-color 0.15s",
                whiteSpace: "nowrap",
              }}
            >
              <span style={{ opacity: isActive ? 1 : 0.6 }}>{tab.icon}</span>
              {tab.label}
              {tab.id === "alerts" && (
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold"
                  style={{ background: "#dc2626", color: "white", marginLeft: 2 }}
                >
                  4
                </span>
              )}
            </button>
          );
        })}
        <div className="flex-1" />
        <span style={{ fontSize: "9px", color: "var(--mu)", paddingBottom: "9px" }}>
          13.059°N 77.630°E
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

          {/* Map controls */}
          <div className="absolute top-3 right-3 z-[400] flex flex-col gap-2">
            <div
              className="flex items-center gap-3 px-3 py-2 rounded-lg"
              style={{
                background: "rgba(255,255,255,0.96)",
                border: "1px solid var(--border)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                backdropFilter: "blur(8px)",
              }}
            >
              <MapToggle label="Risk Heatmap" active={showHeatmap} color="#dc2626" onClick={() => setShowHeatmap((v) => !v)} />
              <div className="w-px h-4" style={{ background: "var(--border)" }} />
              <MapToggle label="Zone Coverage" active={showRoutes} color="#1d4ed8" onClick={() => setShowRoutes((v) => !v)} />
            </div>
          </div>

          {/* New capture notification */}
          {newCount > 0 && (
            <div
              className="absolute top-3 left-1/2 -translate-x-1/2 z-[400] flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-semibold text-white"
              style={{ background: "#7c3aed", boxShadow: "0 4px 12px rgba(124,58,237,0.3)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              +{newCount} new field capture{newCount > 1 ? "s" : ""} from iPhone
            </div>
          )}

          {/* Legend */}
          {(showHeatmap || showRoutes) && (
            <div
              className="absolute bottom-4 right-3 z-[400] px-3 py-3 rounded-lg"
              style={{
                background: "rgba(255,255,255,0.96)",
                border: "1px solid var(--border)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                backdropFilter: "blur(8px)",
              }}
            >
              {showHeatmap && (
                <>
                  <div className="section-label mb-2">Risk Level</div>
                  {[
                    { color: "#dc2626", label: "Critical ≥85%" },
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
                      <span style={{ fontSize: "10px", color: "var(--tx2)" }}>Cleaned</span>
                    </div>
                  )}
                  <div className="mt-2 pt-2 text-center" style={{ borderTop: "1px solid var(--border)", fontSize: "9px", color: "var(--mu)" }}>
                    {RISK_GRID.length} XGBoost cells
                  </div>
                </>
              )}
              {showRoutes && (
                <>
                  {showHeatmap && <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--border)" }} />}
                  <div className="section-label mb-2 mt-1">Zones</div>
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

          {/* Live captures */}
          {fieldReports.length > 0 && (
            <div className="absolute bottom-4 left-4 z-[400]">
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{
                  background: "rgba(255,255,255,0.96)",
                  border: "1px solid rgba(124,58,237,0.2)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
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

        {/* ══ SIDEBAR TOGGLE ══ */}
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="shrink-0 flex items-center justify-center transition-colors"
          title={sidebarOpen ? "Collapse" : "Expand"}
          style={{
            width: "18px",
            background: "var(--card-raised)",
            borderLeft: "1px solid var(--border)",
            borderRight: "1px solid var(--border)",
            color: "var(--mu)",
            cursor: "pointer",
          }}
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {sidebarOpen ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
          </svg>
        </button>

        {/* ══ SIDEBAR ══ */}
        {sidebarOpen && (
          <aside
            className="shrink-0 flex flex-col overflow-hidden"
            style={{ width: "var(--sidebar-w)", background: "var(--bg)", borderLeft: "1px solid var(--border)" }}
          >
            <div className="flex-1 overflow-y-auto">

              {/* OVERVIEW */}
              {activeTab === "overview" && (
                <div className="sidebar-section">
                  {/* Ward summary */}
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
                            className="rounded-md px-3 py-2"
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

                  {/* Search + export row */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <svg
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                        width="12" height="12" viewBox="0 0 24 24" fill="none"
                        stroke="var(--mu)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      >
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <input
                        className="search-input"
                        type="text"
                        placeholder="Filter dumps by name or stream…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    {search && (
                      <button
                        onClick={() => setSearch("")}
                        className="px-2.5 py-1.5 rounded-md text-[10px] font-medium"
                        style={{ background: "var(--card-raised)", border: "1px solid var(--border)", color: "var(--tx2)" }}
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <DumpList dumps={filteredDumps} onSelect={setSelectedDump} />
                  <WardLeaderboard wards={WARDS} />
                </div>
              )}

              {/* ROUTES */}
              {activeTab === "routes" && (
                <div className="sidebar-section">
                  <RouteOptimizer
                    solution={WARD_ROUTES}
                    showRoutes={showRoutes}
                    onToggleRoutes={() => setShowRoutes((v) => !v)}
                  />
                </div>
              )}

              {/* CLEANUP */}
              {activeTab === "cleanup" && (
                <div className="sidebar-section">
                  <CleanupTracker onMissionsUpdate={() => refreshCleanup()} />
                  <CommunityUpload />
                </div>
              )}

              {/* ML INTEL */}
              {activeTab === "intel" && (
                <div className="sidebar-section">
                  <WasteClassifier />
                  <MLInfo />
                  <RetrainStatus />
                </div>
              )}

              {/* AI CHAT */}
              {activeTab === "ai" && (
                <div className="sidebar-section">
                  <AIChat />
                </div>
              )}

              {/* ALERTS */}
              {activeTab === "alerts" && (
                <div className="sidebar-section">
                  <AlertsPanel />
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

function CompactStat({
  value,
  label,
  color,
}: {
  value: string | number;
  label: string;
  color?: string;
}) {
  return (
    <div className="flex items-baseline gap-1 shrink-0">
      <span style={{ fontSize: "14px", fontWeight: 700, color: color ?? "var(--tx)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ fontSize: "10px", color: "var(--mu)", letterSpacing: "0.01em" }}>
        {label}
      </span>
    </div>
  );
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
    <button onClick={onClick} className="flex items-center gap-1.5 text-[11px] font-medium">
      <div
        className="w-2.5 h-2.5 rounded-sm transition-all"
        style={{
          background: active ? color : "transparent",
          border: `2px solid ${active ? color : "var(--mu2)"}`,
        }}
      />
      <span style={{ color: active ? "var(--tx)" : "var(--mu)" }}>{label}</span>
    </button>
  );
}
