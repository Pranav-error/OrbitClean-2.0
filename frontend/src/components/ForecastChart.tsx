"use client";

import { useState } from "react";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
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
  const [chartType, setChartType] = useState<"bar" | "line">("bar");
  const hasSurge = data.some((d) => d.surge);
  const surgeLabel = data.find((d) => d.festival)?.festival ?? "Festival Surge";

  const axisProps = {
    tick: { fill: "#4a5a70", fontSize: 9 },
    axisLine: false as const,
    tickLine: false as const,
  };

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">7-Day Waste Forecast</span>
        <div className="flex items-center gap-2">
          {hasSurge && <span className="badge badge-yellow">⚠️ {surgeLabel}</span>}
          <div className="flex rounded overflow-hidden" style={{ border: "1px solid var(--border-light)" }}>
            {(["bar", "line"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setChartType(type)}
                className="px-2 py-0.5 text-[9px] font-semibold transition-colors"
                style={{
                  background: chartType === type ? "var(--primary-soft)" : "transparent",
                  color: chartType === type ? "#1d4ed8" : "var(--mu)",
                }}
              >
                {type === "bar" ? "Bar" : "Line"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="p-3 h-[140px]" style={{ minWidth: 0 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          {chartType === "bar" ? (
            <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="day" {...axisProps} />
              <YAxis domain={[30, 70]} {...axisProps} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.surge ? "rgba(255,209,102,0.75)" : "rgba(77,184,255,0.55)"} />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="day" {...axisProps} />
              <YAxis domain={[30, 70]} {...axisProps} />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="rgba(77,184,255,0.85)"
                strokeWidth={2}
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  return (
                    <circle
                      key={`dot-${payload.day}`}
                      cx={cx} cy={cy} r={3}
                      fill={payload.surge ? "#ffd166" : "rgba(77,184,255,0.85)"}
                      stroke="none"
                    />
                  );
                }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
