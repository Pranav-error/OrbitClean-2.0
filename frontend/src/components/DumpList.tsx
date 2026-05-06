import type { DumpSite } from "@/types";

const STREAM_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  "Dry/Blue":       { color: "#3b82f6", bg: "rgba(59,130,246,0.12)",  label: "Dry" },
  "Wet/Green":      { color: "#22c55e", bg: "rgba(34,197,94,0.12)",   label: "Wet" },
  "Sanitary/Red":   { color: "#ef4444", bg: "rgba(239,68,68,0.12)",   label: "San" },
  "Hazardous/Black":{ color: "#a855f7", bg: "rgba(168,85,247,0.12)",  label: "Haz" },
};

function riskColor(score: number) {
  if (score >= 0.85) return "#ef4444";
  if (score >= 0.70) return "#f97316";
  if (score >= 0.50) return "#eab308";
  return "#22c55e";
}

function riskLabel(score: number) {
  if (score >= 0.85) return "CRITICAL";
  if (score >= 0.70) return "HIGH";
  if (score >= 0.50) return "MED";
  return "LOW";
}

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
        <div className="flex items-center gap-2">
          <span
            className="text-[9px] font-bold px-2 py-0.5 rounded"
            style={{ background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}
          >
            {active.filter((d) => d.risk_score >= 0.85).length} CRITICAL
          </span>
          <span className="badge badge-red">{active.length} active</span>
        </div>
      </div>

      <div>
        {active.map((d, i) => {
          const riskPct = Math.round(d.risk_score * 100);
          const rc = riskColor(d.risk_score);
          const stream = STREAM_CONFIG[d.swm_stream] ?? { color: "#64748b", bg: "rgba(100,116,139,0.12)", label: "Mix" };
          const isCritical = d.risk_score >= 0.85;

          return (
            <button
              key={d.id}
              onClick={() => onSelect(d)}
              className="w-full text-left transition-all"
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid var(--border-light)",
                background: isCritical ? "rgba(239,68,68,0.025)" : "transparent",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.03)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = isCritical ? "rgba(239,68,68,0.025)" : "transparent";
              }}
            >
              {/* Row 1: name + risk score */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Rank */}
                  <span
                    style={{
                      fontSize: "9px",
                      fontWeight: 700,
                      color: "var(--mu)",
                      minWidth: "14px",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {i + 1}
                  </span>

                  {/* Risk dot — pulsing for critical */}
                  <div className="relative shrink-0">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ background: rc, boxShadow: `0 0 6px ${rc}80` }}
                    />
                    {isCritical && (
                      <div
                        className="absolute inset-0 rounded-full animate-ping"
                        style={{ background: rc, opacity: 0.4 }}
                      />
                    )}
                  </div>

                  <span
                    className="truncate"
                    style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--tx)" }}
                  >
                    {d.name}
                  </span>
                </div>

                {/* Risk badge */}
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <span
                    className="text-[8.5px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: `${rc}18`, color: rc, border: `1px solid ${rc}30` }}
                  >
                    {riskLabel(d.risk_score)}
                  </span>
                  <span style={{ fontSize: "12px", fontWeight: 800, color: rc, fontVariantNumeric: "tabular-nums" }}>
                    {riskPct}%
                  </span>
                </div>
              </div>

              {/* Row 2: risk bar */}
              <div className="mb-2 ml-9">
                <div className="risk-bar" style={{ height: "3px" }}>
                  <div
                    className="risk-bar-fill"
                    style={{ width: `${riskPct}%`, background: rc }}
                  />
                </div>
              </div>

              {/* Row 3: metadata pills */}
              <div className="flex items-center gap-2 ml-9 flex-wrap">
                {/* Stream */}
                <span
                  className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ background: stream.bg, color: stream.color, border: `1px solid ${stream.color}25` }}
                >
                  {stream.label}
                </span>

                <span style={{ fontSize: "9.5px", color: "var(--mu)" }}>{d.area_sqm}m²</span>

                {d.estimated_weight_tonnes != null && (
                  <span style={{ fontSize: "9.5px", fontWeight: 600, color: "#fbbf24" }}>
                    ~{d.estimated_weight_tonnes}T
                  </span>
                )}

                <span style={{ fontSize: "9px", color: "var(--mu)" }}>{d.detected_date}</span>

                {d.carbon_credit_inr > 0 && (
                  <span style={{ fontSize: "9px", fontWeight: 600, color: "#4ade80" }}>
                    ₹{(d.carbon_credit_inr / 1000).toFixed(1)}K credit
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
