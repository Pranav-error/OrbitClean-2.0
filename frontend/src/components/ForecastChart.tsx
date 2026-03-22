"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import type { ForecastDay } from "@/types";

interface Props {
  data: ForecastDay[];
}

interface TooltipPayload {
  payload?: ForecastDay;
}

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: ForecastDay }> }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#0d1421] border border-white/10 rounded-lg px-3 py-2 text-[11px]">
      <div className="font-semibold text-[#dde4ee]">{d.day}</div>
      <div className="text-[#4db8ff]">{d.value} T/day</div>
      {d.festival && <div className="text-[#ffd166]">⚠️ {d.festival}</div>}
    </div>
  );
};

export default function ForecastChart({ data }: Props) {
  const hasSurge = data.some((d) => d.surge);
  const surgeLabel = data.find((d) => d.festival)?.festival ?? "Festival Surge";

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">7-Day Waste Forecast</span>
        {hasSurge && <span className="badge badge-yellow">⚠️ {surgeLabel}</span>}
      </div>
      <div className="p-3 h-[140px]" style={{ minWidth: 0 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="day"
              tick={{ fill: "#4a5a70", fontSize: 9 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#4a5a70", fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              domain={[30, 70]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.surge ? "rgba(255,209,102,0.75)" : "rgba(77,184,255,0.55)"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
