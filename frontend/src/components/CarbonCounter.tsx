"use client";

import { useEffect, useState } from "react";

interface Props {
  co2: number;
  credits: number;
}

function useCounter(target: number, duration = 1800) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min((t - start) / duration, 1);
      setValue(target * p);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return value;
}

export default function CarbonCounter({ co2, credits }: Props) {
  const co2Val = useCounter(co2);
  const credVal = useCounter(credits, 2000);

  const stats = [
    { label: "Active Dumps", value: "5", color: "#ef4444", icon: "📍" },
    { label: "Wards at Risk", value: "3", color: "#fb923c", icon: "🗺" },
    { label: "Recycler Alerts", value: "3", color: "#ffd166", icon: "♻️" },
  ];

  return (
    <div className="mx-2.5 mt-2.5 mb-1 rounded-xl border border-[#00e5a0]/20 bg-gradient-to-br from-[#00e5a0]/10 to-[#0a1018] overflow-hidden">
      {/* Main CO2 counter */}
      <div className="px-4 pt-4 pb-3 text-center">
        <div className="text-[9px] text-[#4a5a70] tracking-[2px] uppercase mb-1">
          Live CO₂ Equivalent
        </div>
        <div className="font-syne text-[38px] font-extrabold text-[#00e5a0] leading-none tabular-nums">
          {co2Val.toFixed(1)}
          <span className="text-[16px] font-normal text-[#4a5a70] ml-1">T</span>
        </div>
        <div className="text-[10px] text-[#4a5a70] mt-0.5">
          from active illegal dumps · Bengaluru North
        </div>
        {/* Carbon credit pill */}
        <div className="mt-2.5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#ffd166]/10 border border-[#ffd166]/20">
          <div className="w-1.5 h-1.5 rounded-full bg-[#ffd166] animate-pulse" />
          <span className="text-[11px] font-semibold text-[#ffd166]">
            ₹{Math.round(credVal).toLocaleString()} Carbon Credits
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-white/[0.06] mx-3" />

      {/* Mini stat row */}
      <div className="grid grid-cols-3 divide-x divide-white/[0.06]">
        {stats.map((s) => (
          <div key={s.label} className="py-2.5 text-center">
            <div className="text-[14px] font-syne font-bold" style={{ color: s.color }}>
              {s.icon} {s.value}
            </div>
            <div className="text-[9px] text-[#4a5a70] tracking-wide uppercase mt-0.5">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
