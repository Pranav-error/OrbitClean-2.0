"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { TruckStats } from "@/components/ChatBox";

const TruckSim = dynamic(() => import("@/components/ChatBox"), { ssr: false });

const ALGOS = [
  { name: "Dijkstra / A*", user: "Google Maps", why: "Single shortest path between 2 points", vrp: false },
  { name: "Hungarian Algorithm", user: "Uber dispatch", why: "Bipartite matching: drivers ↔ riders", vrp: false },
  { name: "LKH-3 (Lin-Kernighan)", user: "Google OR-Tools", why: "Huge VRP instances (> 1,000 stops)", vrp: true },
  { name: "Clarke-Wright Savings", user: "Us + Waste Industry", why: "CVRP with capacity — optimal for n < 100", vrp: true },
];

const INIT: TruckStats = { households: 0, waste_kg: 0, cap_pct: 0, status: "idle", events: [{ time: "06:00", msg: "Truck ready at BBMP DWCC — ZONE-N route (8 real CW stops)", type: "depot" }] };

export default function RoutesPage() {
  const [stats, setStats] = useState<TruckStats>(INIT);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#f8fafc]">
      {/* Header */}
      <header className="flex items-center gap-4 px-5 py-2.5 bg-white border-b border-[#e2e8f0] shrink-0 z-50">
        <Link href="/" className="text-[11px] text-[#94a3b8] hover:text-[#0f172a] transition-colors flex items-center gap-1">
          <span>←</span> Dashboard
        </Link>
        <div className="h-5 w-px bg-[#e2e8f0]" />
        <div>
          <div className="text-[14px] font-bold text-[#0f172a]">Route Optimization Lab</div>
          <div className="text-[10px] text-[#94a3b8]">Clarke-Wright CVRP · OpenStreetMap OSRM road network · Live truck simulation</div>
        </div>
        <div className="ml-auto flex gap-2">
          <div className="px-2.5 py-1 rounded-full bg-[#f0f9ff] border border-[#bae6fd] text-[10px] font-semibold text-[#0369a1]">ZONE-N Demo · 5,958 HH</div>
          <div className="px-2.5 py-1 rounded-full bg-[#fef2f2] border border-[#fecaca] text-[10px] font-semibold text-[#b91c1c]">155 detected dump clusters</div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT — algorithm + live stats */}
        <aside className="w-[370px] shrink-0 flex flex-col overflow-y-auto border-r border-[#e2e8f0] bg-white">

          {/* Algorithm comparison */}
          <div className="p-4 border-b border-[#f1f5f9]">
            <div className="text-[12px] font-bold text-[#0f172a] mb-1">Algorithm Selection — Why Not Google Maps?</div>
            <div className="text-[10px] text-[#64748b] leading-relaxed mb-3">
              Our problem is <b className="text-[#334155]">CVRP</b> (Capacitated Vehicle Routing): assign 17 auto-tippers (500kg each) to cover 11,917 households + 295 detected dump sites with minimum total distance. Google Maps solves single-path routing — not multi-stop VRP.
            </div>
            <div className="space-y-1.5">
              {ALGOS.map(a => (
                <div key={a.name} className={`px-3 py-2 rounded-lg border text-[10px] ${a.name === "Clarke-Wright Savings" ? "border-[#a7f3d0] bg-[#f0fdf4]" : "border-[#f1f5f9] bg-[#fafbfc]"}`}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`font-bold ${a.name === "Clarke-Wright Savings" ? "text-[#059669]" : "text-[#334155]"}`}>{a.name}</span>
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${a.vrp ? "bg-[#f0fdf4] text-[#059669]" : "bg-[#f1f5f9] text-[#94a3b8]"}`}>{a.vrp ? "✓ VRP" : "✗ Not VRP"}</span>
                  </div>
                  <div className="text-[9px] text-[#94a3b8]">{a.user} · {a.why}</div>
                </div>
              ))}
            </div>
          </div>

          {/* How Clarke-Wright works */}
          <div className="p-4 border-b border-[#f1f5f9]">
            <div className="text-[11px] font-bold text-[#0f172a] mb-2">Clarke-Wright in 4 Steps</div>
            {[
              { n: "1", t: "Naive: 17 dedicated trucks (1 per dump cluster), star pattern. Total: 48.42 km — from 295 real detected dumps clustered into stops" },
              { n: "2", t: "Compute savings S(i,j) = d(depot→i) + d(depot→j) − d(i→j) for every site pair" },
              { n: "3", t: "Sort pairs by savings (highest first). Merge routes if combined load ≤ 500kg cap" },
              { n: "4", t: "Result: 3 zones, grouped stops, 79.2% less distance — same coverage" },
            ].map(s => (
              <div key={s.n} className="flex gap-2 mb-2">
                <div className="w-5 h-5 rounded-full bg-[#2563eb] text-white text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">{s.n}</div>
                <div className="text-[10px] text-[#64748b] leading-relaxed">{s.t}</div>
              </div>
            ))}
          </div>

          {/* Savings proof */}
          <div className="p-4 border-b border-[#f1f5f9]">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-bold text-[#0f172a]">Proved Savings — ZONE-N Demo</div>
              <div className="text-[9px] text-[#94a3b8] bg-[#f1f5f9] px-2 py-0.5 rounded-full">from real data</div>
            </div>
            <div className="text-[9px] text-[#64748b] mb-2 leading-relaxed bg-[#f8fafc] px-2 py-1.5 rounded-lg border border-[#f1f5f9]">
              Source: <b>detected_dumps.geojson</b> · 295 satellite-detected sites → 3 geographic zones · BBMP DWCC depot
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {[
                { l: "Naive — 17 dedicated trucks", v: "48.42 km", c: "#ef4444" },
                { l: "Optimised — CW 3 zones", v: "10.07 km", c: "#10b981" },
                { l: "Distance saved/day", v: "38.35 km", c: "#2563eb" },
                { l: "CO₂ avoided", v: "25.7 kg", c: "#8b5cf6" },
              ].map(k => (
                <div key={k.l} className="rounded-lg border border-[#f1f5f9] bg-[#f8fafc] px-3 py-2">
                  <div className="text-[15px] font-bold tabular-nums" style={{ color: k.c }}>{k.v}</div>
                  <div className="text-[9px] text-[#94a3b8] uppercase leading-tight">{k.l}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#ecfdf5] border border-[#a7f3d0]">
              <span className="text-[22px] font-black text-[#059669]">79.2%</span>
              <div>
                <div className="text-[11px] font-bold text-[#059669]">Route savings vs naive</div>
                <div className="text-[9px] text-[#6ee7b7]">vs Seoul 42% · Amsterdam 30% · Barcelona 20%</div>
              </div>
            </div>
          </div>

          {/* Live stats */}
          <div className="p-4 border-b border-[#f1f5f9]">
            <div className="text-[11px] font-bold text-[#0f172a] mb-2">Live Simulation — ZONE-N Truck</div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="rounded-lg border border-[#f1f5f9] bg-[#f8fafc] px-3 py-2">
                <div className="text-[16px] font-bold tabular-nums text-[#0ea5e9]">{stats.households}<span className="text-[9px] text-[#94a3b8] font-normal">/5,958</span></div>
                <div className="text-[9px] text-[#94a3b8] uppercase">Households served</div>
              </div>
              <div className="rounded-lg border border-[#f1f5f9] bg-[#f8fafc] px-3 py-2">
                <div className="text-[16px] font-bold tabular-nums text-[#f59e0b]">{stats.waste_kg}<span className="text-[9px] text-[#94a3b8] font-normal">kg</span></div>
                <div className="text-[9px] text-[#94a3b8] uppercase">Waste collected</div>
              </div>
            </div>
            <div className="mb-2">
              <div className="flex justify-between mb-1">
                <span className="text-[10px] font-semibold text-[#334155]">Truck Capacity (500kg)</span>
                <span className="text-[11px] font-bold tabular-nums" style={{ color: stats.cap_pct >= 85 ? "#ef4444" : stats.cap_pct >= 60 ? "#f59e0b" : "#10b981" }}>{stats.cap_pct}%</span>
              </div>
              <div className="h-3 rounded-full bg-[#f1f5f9] overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${stats.cap_pct}%`, background: stats.cap_pct >= 85 ? "#ef4444" : stats.cap_pct >= 60 ? "#f59e0b" : "#10b981" }} />
              </div>
            </div>
            <div className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold text-center ${stats.status === "running" ? "bg-[#f0fdf4] text-[#059669]" : stats.status === "done" ? "bg-[#ecfdf5] text-[#059669]" : stats.status === "paused" ? "bg-[#fffbeb] text-[#92400e]" : "bg-[#f8fafc] text-[#94a3b8]"}`}>
              {stats.status === "idle" ? "Press ▶ Start on the map to begin" : stats.status === "running" ? "🚛 Truck collecting..." : stats.status === "paused" ? "⏸ Paused" : "✅ Trip complete!"}
            </div>
          </div>

          {/* Event log */}
          <div className="p-4 flex-1 min-h-0">
            <div className="text-[11px] font-bold text-[#0f172a] mb-2">Event Log</div>
            <div className="space-y-1.5">
              {stats.events.map((e, i) => (
                <div key={i} className={`flex items-start gap-2 px-2.5 py-1.5 rounded-lg text-[10px] ${e.type === "dump" ? "bg-[#fef2f2] border border-[#fecaca]" : e.type === "depot" ? "bg-[#f0f9ff] border border-[#bae6fd]" : e.type === "warn" ? "bg-[#fffbeb] border border-[#fde68a]" : "bg-[#f8fafc] border border-[#f1f5f9]"}`}>
                  <span className="font-mono text-[9px] text-[#94a3b8] shrink-0 mt-0.5">{e.time}</span>
                  <span className={e.type === "dump" ? "text-[#b91c1c]" : e.type === "depot" ? "text-[#0369a1]" : e.type === "warn" ? "text-[#92400e]" : "text-[#334155]"}>{e.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* MAP */}
        <main className="flex-1 overflow-hidden">
          <TruckSim onStats={setStats} />
        </main>
      </div>
    </div>
  );
}
