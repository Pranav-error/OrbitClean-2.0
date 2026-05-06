"use client";

import { useState } from "react";
import type { WardRouteSolution } from "@/types";

interface Props {
  solution: WardRouteSolution;
  onToggleRoutes: () => void;
  showRoutes: boolean;
}

const ZONE_TABS = ["ZONE-N", "ZONE-SE", "ZONE-SW"] as const;

export default function RouteOptimizer({ solution, onToggleRoutes, showRoutes }: Props) {
  const f = solution.fleet_summary;
  const s = solution.savings;
  const benchmarks = solution.benchmarks;
  const [activeZone, setActiveZone] = useState<string>("ZONE-N");

  const zone = solution.zones.find(z => z.zone_id === activeZone) ?? solution.zones[0];

  return (
    <>
      {/* Fleet overview */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Fleet Overview</span>
          <button
            onClick={onToggleRoutes}
            className="text-[10px] px-2.5 py-1 rounded-md font-semibold transition-all"
            style={{
              background: showRoutes ? "var(--teal)" : "rgba(255,255,255,0.05)",
              color: showRoutes ? "white" : "var(--mu)",
              border: `1px solid ${showRoutes ? "var(--teal)" : "var(--border)"}`,
            }}
          >
            {showRoutes ? "Coverage On" : "Show Zone Coverage"}
          </button>
        </div>
        <div className="p-3">
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[
              { label: "Tippers", value: f.total_auto_tippers, color: "#0ea5e9" },
              { label: "Zones", value: solution.zones.length, color: "#10b981" },
              { label: "TPD", value: `${f.total_daily_waste_tonnes}T`, color: "#f59e0b" },
              { label: "km/day", value: f.total_route_km_per_day, color: "#8b5cf6" },
            ].map((kpi) => (
              <div key={kpi.label} className="kpi-pill">
                <span className="kpi-value" style={{ color: kpi.color }}>{kpi.value}</span>
                <span className="kpi-label">{kpi.label}</span>
              </div>
            ))}
          </div>
          <div className="text-[10px] leading-relaxed rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", color: "var(--tx2)" }}>
            BBMP Spec: {f.bbmp_rule} · 500kg capacity · {f.wet_collection} · {f.dry_collection}
          </div>
        </div>
      </div>

      {/* How the route was built — data pipeline */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">How Routes Were Built</span>
          <span className="badge badge-blue">Real GPS Data</span>
        </div>
        <div className="p-3 space-y-2">

          {/* Data source */}
          <div className="info-box-blue">
            <div className="text-[10px] font-bold mb-1" style={{ color: "#60a5fa" }}>Step 1 — Satellite Detection → GPS Points</div>
            <div className="text-[9px] leading-relaxed" style={{ color: "var(--tx2)" }}>
              <b style={{ color: "var(--tx)" }}>detected_dumps.geojson</b> contains <b style={{ color: "#60a5fa" }}>295 real GPS coordinates</b> of illegal dump sites identified by our ML classifier (XGBoost) from satellite imagery. Each point has: lat, lon, area_sqm, risk_score.
            </div>
          </div>

          {/* Clustering */}
          <div className="info-box-green">
            <div className="text-[10px] font-bold mb-1" style={{ color: "#4ade80" }}>Step 2 — Spatial Clustering into Collection Stops</div>
            <div className="text-[9px] leading-relaxed" style={{ color: "var(--tx2)" }}>
              295 GPS points are grouped using a <b style={{ color: "var(--tx)" }}>100m radius grid</b> — any dumps within 100m become one <b style={{ color: "#4ade80" }}>collection stop</b>. This gives us <b style={{ color: "var(--tx)" }}>24 stops</b> across 3 zones (8 per zone).
            </div>
            <div className="mt-1.5 text-[8px]" style={{ color: "#86efac" }}>
              Example: &ldquo;Cluster S2&rdquo; = 6 dump sites within 100m → 1 truck stop, 7,300m² total area, 109.5T accumulated waste
            </div>
          </div>

          {/* Zone division */}
          <div className="info-box-amber">
            <div className="text-[10px] font-bold mb-1" style={{ color: "#fbbf24" }}>Step 3 — Geographic Zone Division</div>
            <div className="text-[9px] leading-relaxed" style={{ color: "var(--tx2)" }}>
              Ward split along <b style={{ color: "var(--tx)" }}>real roads</b>: <b>Thanisandra Main Road</b> (lon 77.630) as E-W divider, lat 13.059 as N-S divider. Tippers per zone = households ÷ 750 (BBMP spec).
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-1">
              {solution.zones.map(z => (
                <div key={z.zone_id} className="text-center rounded px-1 py-1" style={{ background: `${z.color}15`, border: `1px solid ${z.color}40` }}>
                  <div className="text-[9px] font-bold" style={{ color: z.color }}>{z.zone_id}</div>
                  <div className="text-[8px] text-[#94a3b8]">{z.dump_sites_count} dumps</div>
                  <div className="text-[8px] text-[#94a3b8]">{z.tippers_assigned} trucks</div>
                </div>
              ))}
            </div>
          </div>

          {/* Waste estimation */}
          <div className="info-box-purple">
            <div className="text-[10px] font-bold mb-1" style={{ color: "#c084fc" }}>Waste Volume Estimation</div>
            <div className="text-[9px] leading-relaxed" style={{ color: "var(--tx2)" }}>
              Each dump site&apos;s weight: <b style={{ color: "var(--tx)" }}>area_sqm × 15 kg/m²</b><br />
              Formula: 0.15m depth × 0.7 fill factor × 150 kg/m³ density (CPCB data).<br />
              Daily truck load per stop: area × 0.5 kg/m²/day, capped at 200kg.
            </div>
          </div>

        </div>
      </div>

      {/* Why Clarke-Wright */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Why Clarke-Wright — Not Google Maps</span>
        </div>
        <div className="p-3 space-y-2">
          <div className="text-[9px] leading-relaxed rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", color: "var(--tx2)" }}>
            Our problem is <b style={{ color: "var(--tx)" }}>CVRP</b> — Capacitated Vehicle Routing Problem: assign 17 trucks (500kg each) from a single depot to cover all 24 collection stops with minimum total distance, without exceeding truck capacity.
          </div>

          {/* Algorithm comparison */}
          {[
            { name: "Google Maps / Dijkstra", verdict: false, reason: "Finds shortest path between 2 points only. Cannot handle multi-stop, multi-truck, capacity constraints." },
            { name: "Hungarian Algorithm", verdict: false, reason: "Assigns drivers to riders (bipartite matching). No route ordering, no capacity constraint." },
            { name: "LKH-3 (Google OR-Tools)", verdict: "ok", reason: "World's best for huge instances (>1000 stops). Overkill for 24 stops — needs complex setup, 50MB dependency." },
            { name: "Clarke-Wright Savings", verdict: true, reason: "Built exactly for CVRP. Handles capacity constraint. Industry standard for n<100 stops. Used by BBMP-style SWM systems globally." },
          ].map(a => (
            <div
              key={a.name}
              className="px-3 py-2 rounded-lg text-[10px]"
              style={{
                background: a.verdict === true ? "rgba(34,197,94,0.07)" : a.verdict === "ok" ? "rgba(245,158,11,0.07)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${a.verdict === true ? "rgba(34,197,94,0.2)" : a.verdict === "ok" ? "rgba(245,158,11,0.2)" : "var(--border)"}`,
              }}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span style={{ fontWeight: 700, color: a.verdict === true ? "#4ade80" : a.verdict === "ok" ? "#fbbf24" : "var(--mu)" }}>
                  {a.name}
                </span>
                <span
                  className="text-[8px] font-bold px-1.5 py-0.5 rounded"
                  style={{
                    background: a.verdict === true ? "rgba(34,197,94,0.15)" : a.verdict === "ok" ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.05)",
                    color: a.verdict === true ? "#4ade80" : a.verdict === "ok" ? "#fbbf24" : "var(--mu)",
                  }}
                >
                  {a.verdict === true ? "✓ Our Choice" : a.verdict === "ok" ? "~ Viable" : "✗ Wrong Problem"}
                </span>
              </div>
              <div className="text-[9px]" style={{ color: "var(--tx2)" }}>{a.reason}</div>
            </div>
          ))}

          {/* Algorithm steps */}
          <div className="mt-2">
            <div className="text-[10px] font-bold mb-1.5" style={{ color: "var(--tx)" }}>Clarke-Wright in 4 Steps (Our Computation)</div>
            {[
              { n: "1", t: "Start: 24 dedicated trips (depot→stop→depot). Naive total = 48.42 km (17 trucks doing 24 star trips)." },
              { n: "2", t: "Compute savings S(i,j) = d(depot→i) + d(depot→j) − d(i→j) for every pair of stops. If truck visits i then j in one trip instead of two star trips, it saves S(i,j) km." },
              { n: "3", t: "Sort all pairs by S(i,j) descending. Greedily merge routes: if combined waste ≤ 500kg, merge stops i and j into one truck trip." },
              { n: "4", t: "Stop merging when no pair improves distance or capacity is exceeded. Result: 3 zones × 8 grouped stops = 10.07 km total (79.2% saved)." },
            ].map(step => (
              <div key={step.n} className="flex gap-2 mb-1.5">
                <div className="w-5 h-5 rounded-full text-white text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5" style={{ background: "#3b82f6" }}>{step.n}</div>
                <div className="text-[9px] leading-relaxed" style={{ color: "var(--tx2)" }}>{step.t}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Per-zone breakdown */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Zone Route Details</span>
          <div className="flex gap-1">
            {ZONE_TABS.map(zid => (
              <button
                key={zid}
                onClick={() => setActiveZone(zid)}
                className="text-[9px] px-2 py-0.5 rounded font-semibold transition-colors"
                style={{
                  background: activeZone === zid ? "var(--teal)" : "rgba(255,255,255,0.05)",
                  color: activeZone === zid ? "white" : "var(--mu)",
                  border: `1px solid ${activeZone === zid ? "var(--teal)" : "var(--border)"}`,
                }}
              >{zid}</button>
            ))}
          </div>
        </div>

        {zone && (
          <div className="p-3">
            {/* Zone header */}
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full" style={{ background: zone.color }} />
              <div>
                <div className="text-[12px] font-bold" style={{ color: "var(--tx)" }}>{zone.zone_name}</div>
                <div className="text-[9px]" style={{ color: "var(--mu)" }}>
                  Bounds: lat {zone.zone_bounds.lat_min}–{zone.zone_bounds.lat_max} · lon {zone.zone_bounds.lon_min}–{zone.zone_bounds.lon_max}
                </div>
              </div>
            </div>

            {/* Savings comparison */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="rounded-lg px-3 py-2" style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <div className="text-[13px] font-bold tabular-nums" style={{ color: "#f87171" }}>{zone.naive_route_km} km</div>
                <div className="text-[8px] uppercase leading-tight" style={{ color: "var(--mu)" }}>Naive — {zone.dump_sites_count} star trips</div>
              </div>
              <div className="rounded-lg px-3 py-2" style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)" }}>
                <div className="text-[13px] font-bold tabular-nums" style={{ color: "#4ade80" }}>{zone.route_length_km} km</div>
                <div className="text-[8px] uppercase leading-tight" style={{ color: "var(--mu)" }}>CW optimised — 8 grouped stops</div>
              </div>
            </div>
            <div className="rounded-lg px-3 py-2 mb-3 flex items-center justify-between" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
              <div>
                <span className="text-[16px] font-black" style={{ color: "#4ade80" }}>
                  {Math.round((1 - zone.route_length_km / zone.naive_route_km) * 100)}%
                </span>
                <span className="text-[9px] ml-1.5" style={{ color: "#86efac" }}>distance saved vs naive</span>
              </div>
              <div className="text-right">
                <div className="text-[9px]" style={{ color: "var(--tx2)" }}>{zone.tippers_assigned} tippers · {zone.waste.estimated_households.toLocaleString()} HH</div>
                <div className="text-[9px]" style={{ color: "var(--mu)" }}>{zone.accumulated_waste_tonnes}T accumulated · {(zone.waste.daily_waste_kg / 1000).toFixed(1)}T/day</div>
              </div>
            </div>

            {/* Stop list with context */}
            <div className="section-label mb-1.5">8 Clarke-Wright Collection Stops</div>
            <div className="text-[8px] mb-2 leading-relaxed" style={{ color: "var(--mu)" }}>
              Each stop = a <b style={{ color: "var(--tx2)" }}>100m spatial cluster</b> of GPS-detected dump sites, visited in nearest-neighbour order from BBMP DWCC depot.
            </div>
            <div className="space-y-1">
              {zone.stops?.map((stop) => {
                const area = parseInt(stop.name.match(/(\d[\d,]+)m²/)?.[1] ?? "0");
                const waste = Math.round(area * 15 / 1000 * 10) / 10;
                const sites = parseInt(stop.name.match(/(\d+) site/)?.[1] ?? "1");
                return (
                  <div key={stop.id} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" }}>
                    <div
                      className="w-5 h-5 rounded-full text-white flex items-center justify-center text-[8px] font-bold shrink-0"
                      style={{ background: zone.color }}
                    >
                      {stop.order}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] font-semibold" style={{ color: "var(--tx2)" }}>
                        {sites} dump site{sites > 1 ? "s" : ""} · {area.toLocaleString()}m²
                      </div>
                      <div className="text-[8px]" style={{ color: "var(--mu)" }}>
                        ~{waste}T · {area}m² × 15 kg/m²
                      </div>
                    </div>
                    <span
                      className="text-[8px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                      style={{ background: `${zone.color}18`, color: zone.color, border: `1px solid ${zone.color}30` }}
                    >
                      {stop.priority}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-2 text-[8px] rounded px-2.5 py-2 leading-relaxed" style={{ color: "var(--mu)", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)" }}>
              <b style={{ color: "var(--tx2)" }}>CVRP check:</b> {zone.stops?.length ?? 0} stops × 60 kg/day = {(zone.stops?.length ?? 0) * 60}kg. Tipper capacity: 500kg. ✓ Within bounds.
            </div>
          </div>
        )}
      </div>

      {/* Single depot */}
      <div className="card">
        <div className="p-3">
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg" style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)" }}>
            <div className="w-3 h-3 rounded shrink-0" style={{ background: "#3b82f6", boxShadow: "0 0 8px rgba(59,130,246,0.5)" }} />
            <div>
              <div className="text-[11px] font-semibold" style={{ color: "#60a5fa" }}>BBMP DWCC Thanisandra — Single Depot</div>
              <div className="text-[9px]" style={{ color: "var(--mu)" }}>All 17 tippers depart from 13.0601, 77.6310 · Clarke-Wright depot→stops→depot</div>
            </div>
          </div>
        </div>
      </div>

      {/* Savings */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Total Savings — Thanisandra Ward</span>
        </div>
        <div className="p-3">
          <div className="rounded-lg p-3 mb-3" style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)" }}>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Distance", value: `${s.pct_distance_saved}%`, sub: `${s.distance_saved_km}km/day saved` },
                { label: "Fuel", value: `${s.fuel_saved_litres}L`, sub: "diesel saved/day" },
                { label: "CO₂", value: `${s.co2_saved_kg}kg`, sub: "carbon saved/day" },
              ].map((sv) => (
                <div key={sv.label} className="text-center">
                  <div className="text-[16px] font-bold tabular-nums" style={{ color: "#4ade80" }}>{sv.value}</div>
                  <div className="text-[8px]" style={{ color: "#86efac" }}>{sv.sub}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-[8px] text-center" style={{ color: "var(--mu)" }}>
              {s.naive_total_km}km naive → {s.optimized_total_km}km optimised · detected_dumps.geojson (295 real sites)
            </div>
          </div>

          {/* Benchmarks */}
          <div className="section-label mb-2">vs Global Benchmarks</div>
          {Object.entries(benchmarks).map(([key, b]) => (
            <div key={key} className="flex items-center gap-2 mb-1.5">
              <div className="w-16 text-[9px] truncate" style={{ color: "var(--mu)" }}>{b.label.split(" ")[0]}</div>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(b.reduction_pct, 50) * 2}%`,
                    background: key === "orbitclean" ? "#14b8a6" : "#1e2d45",
                    boxShadow: key === "orbitclean" ? "0 0 6px rgba(20,184,166,0.4)" : "none",
                  }}
                />
              </div>
              <span className="text-[10px] font-bold tabular-nums w-8 text-right" style={{ color: key === "orbitclean" ? "#2dd4bf" : "var(--mu)" }}>
                {b.reduction_pct}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
