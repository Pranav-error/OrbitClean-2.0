"use client";

import { useEffect, useState } from "react";

interface HeaderProps {
  activeDumps: number;
  totalCO2: number;
  totalCredits: number;
  recyclerAlerts: number;
  anomalyVisible: boolean;
  anomalyText: string;
  onDismissAnomaly: () => void;
}

export default function Header({
  activeDumps, totalCO2, totalCredits, recyclerAlerts,
  anomalyVisible, anomalyText, onDismissAnomaly,
}: HeaderProps) {
  const [time, setTime] = useState("");

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString("en-IN", { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const kpis = [
    { label: "Active Dumps", value: activeDumps, color: "#ef4444", bg: "rgba(239,68,68,0.08)" },
    { label: "CO₂-eq", value: `${totalCO2}T`, color: "#ffd166", bg: "rgba(255,209,102,0.08)" },
    { label: "Carbon Credits", value: `₹${totalCredits.toLocaleString()}`, color: "#00e5a0", bg: "rgba(0,229,160,0.08)" },
    { label: "Recycler Alerts", value: recyclerAlerts, color: "#4db8ff", bg: "rgba(77,184,255,0.08)" },
    { label: "Wards Tracked", value: 5, color: "#c084fc", bg: "rgba(192,132,252,0.08)" },
  ];

  return (
    <>
      <header className="relative z-50 flex items-center gap-4 px-4 bg-[#06080d]/97 border-b border-white/[0.07] backdrop-blur h-[54px]">
        {/* Logo */}
        <div className="shrink-0 flex items-center gap-3">
          <div className="flex flex-col">
            <div className="font-syne text-[17px] font-extrabold leading-none">
              <span className="text-[#00e5a0]">Orbit</span>
              <span className="text-[#dde4ee]">Clean</span>
              <span className="text-[#4db8ff] text-[12px] ml-1 font-semibold">2.0</span>
            </div>
            <div className="text-[8px] text-[#4a5a70] tracking-[1.5px] uppercase mt-0.5">
              ಬೆಂಗಳೂರು · Team Resonance
            </div>
          </div>
          <div className="w-px h-7 bg-white/[0.07]" />
        </div>

        {/* KPI strip */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="flex items-center gap-2 px-2.5 py-1 rounded-lg shrink-0"
              style={{ background: kpi.bg }}
            >
              <div>
                <div
                  className="font-syne text-[14px] font-black leading-none tabular-nums"
                  style={{ color: kpi.color }}
                >
                  {kpi.value}
                </div>
                <div className="text-[8px] text-[#4a5a70] tracking-[1px] uppercase mt-0.5 leading-none">
                  {kpi.label}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3 shrink-0">
          {/* ML badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#c084fc]/10 border border-[#c084fc]/20">
            <div className="w-1.5 h-1.5 rounded-full bg-[#c084fc]" />
            <span className="text-[9px] text-[#c084fc] font-semibold tracking-wide">XGBoost · AUC 0.80</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#00e5a0] animate-pulse" />
            <span className="text-[10px] font-semibold tracking-[1.5px] uppercase text-[#00e5a0]">LIVE</span>
          </div>
          <code className="text-[10px] text-[#4a5a70] tabular-nums">{time}</code>
        </div>
      </header>

      {/* Anomaly Banner */}
      {anomalyVisible && (
        <div className="relative z-40 flex items-center gap-2.5 px-4 py-1.5 bg-[#ef4444]/8 border-b border-[#ef4444]/25 text-[10px] text-[#ef4444]">
          <div className="w-1.5 h-1.5 rounded-full bg-[#ef4444] animate-pulse shrink-0" />
          <span className="font-semibold">ANOMALY ALERT</span>
          <span className="text-[#ef4444]/70 hidden sm:inline">·</span>
          <span className="text-[#ef4444]/80 hidden sm:inline truncate">{anomalyText}</span>
          <button
            onClick={onDismissAnomaly}
            className="ml-auto text-[#4a5a70] hover:text-[#ef4444] shrink-0 transition-colors text-[12px]"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
