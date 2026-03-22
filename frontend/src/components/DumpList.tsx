import type { DumpSite } from "@/types";

const STREAM_DOT: Record<string, string> = {
  "Dry/Blue": "#2563eb",
  "Wet/Green": "#10b981",
  "Sanitary/Red": "#ef4444",
  "Hazardous/Black": "#374151",
};

export default function DumpList({
  dumps,
  onSelect,
}: {
  dumps: DumpSite[];
  onSelect: (d: DumpSite) => void;
}) {
  const active = dumps
    .filter((d) => d.status === "Active")
    .sort((a, b) => b.risk_score - a.risk_score);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Detected Dump Sites</span>
        <span className="badge badge-red">{active.length} active</span>
      </div>
      <div>
        {active.map((d) => {
          const riskPct = Math.round(d.risk_score * 100);
          const critical = d.risk_score >= 0.85;
          const riskColor = critical ? "#ef4444" : "#f97316";
          return (
            <button
              key={d.id}
              onClick={() => onSelect(d)}
              className="w-full text-left px-3.5 py-3 hover:bg-[#f8fafc] transition-colors border-b border-[#f1f5f9] last:border-b-0"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: riskColor }}
                  />
                  <span className="text-[12px] font-semibold text-[#0f172a] truncate">{d.name}</span>
                </div>
                <span
                  className="text-[12px] font-bold tabular-nums shrink-0 ml-2"
                  style={{ color: riskColor }}
                >
                  {riskPct}%
                </span>
              </div>
              <div className="ml-4">
                <div className="h-1.5 rounded-full bg-[#f1f5f9] overflow-hidden mb-1.5">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${riskPct}%`, background: riskColor }}
                  />
                </div>
                <div className="flex items-center gap-2 text-[10px] text-[#94a3b8]">
                  <div className="flex items-center gap-1">
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: STREAM_DOT[d.swm_stream] ?? "#64748b" }}
                    />
                    <span>{d.swm_stream}</span>
                  </div>
                  <span>{d.area_sqm}m²</span>
                  <span>{d.detected_date}</span>
                  {d.estimated_weight_tonnes != null && (
                    <span className="font-semibold text-[#f59e0b]">~{d.estimated_weight_tonnes}T</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
