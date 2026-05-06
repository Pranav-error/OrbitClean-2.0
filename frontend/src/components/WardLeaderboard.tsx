import type { WardScore } from "@/types";

const GRADE_CONFIG: Record<string, { color: string; label: string }> = {
  A: { color: "#22c55e", label: "Excellent" },
  B: { color: "#14b8a6", label: "Good" },
  C: { color: "#f59e0b", label: "Fair" },
  D: { color: "#f97316", label: "Poor" },
  F: { color: "#ef4444", label: "Critical" },
};

export default function WardLeaderboard({ wards }: { wards: WardScore[] }) {
  const sorted = [...wards].sort((a, b) => b.wascore - a.wascore);

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <span className="card-title">Ward Accountability</span>
          <div style={{ fontSize: "9px", color: "var(--mu)", marginTop: "1px" }}>Higher WAScore = worse performance</div>
        </div>
        <span className="badge badge-blue">{wards.length} wards</span>
      </div>

      <div>
        {sorted.map((w, i) => {
          const gc = GRADE_CONFIG[w.grade] ?? { color: "#64748b", label: "Unknown" };
          const wascore = Math.round(w.wascore);
          const isWorst = i === 0;

          return (
            <div
              key={w.ward_id}
              className="flex items-center gap-3 transition-colors"
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid var(--border-light)",
                background: isWorst ? "rgba(239,68,68,0.025)" : "transparent",
              }}
            >
              {/* Rank */}
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  color: i === 0 ? "#ef4444" : "var(--mu)",
                  width: "14px",
                  textAlign: "center",
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </span>

              {/* Ward info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--tx)" }} className="truncate">
                    {w.ward_name}
                  </span>
                  {isWorst && (
                    <span
                      className="text-[8px] font-bold px-1 py-0.5 rounded shrink-0"
                      style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}
                    >
                      WORST
                    </span>
                  )}
                </div>

                {/* WAScore bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1" style={{ height: "4px", borderRadius: "2px", background: "var(--border)", overflow: "hidden", maxWidth: "120px" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(wascore, 100)}%`,
                        background: gc.color,
                        borderRadius: "2px",
                        boxShadow: `0 0 4px ${gc.color}60`,
                        transition: "width 0.5s ease",
                      }}
                    />
                  </div>
                  <span style={{ fontSize: "9.5px", color: "var(--tx2)", fontVariantNumeric: "tabular-nums" }}>
                    {wascore}
                  </span>
                </div>

                {/* Resolved bar */}
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1" style={{ height: "2px", borderRadius: "1px", background: "var(--border-light)", overflow: "hidden", maxWidth: "120px" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${w.pct_resolved}%`,
                        background: "#22c55e",
                        borderRadius: "1px",
                      }}
                    />
                  </div>
                  <span style={{ fontSize: "8.5px", color: "var(--mu)" }}>{w.pct_resolved}% resolved</span>
                </div>
              </div>

              {/* Right side: dumps + grade */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">
                  <div style={{ fontSize: "10px", color: "var(--mu)", fontVariantNumeric: "tabular-nums" }}>
                    {w.active_dumps} dumps
                  </div>
                  <div style={{ fontSize: "8.5px", color: gc.color }}>{gc.label}</div>
                </div>

                {/* Grade badge */}
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    background: `${gc.color}15`,
                    border: `1px solid ${gc.color}35`,
                    boxShadow: i === 0 ? `0 0 8px ${gc.color}30` : "none",
                  }}
                >
                  <span style={{ fontSize: "13px", fontWeight: 800, color: gc.color }}>
                    {w.grade}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div
        className="px-4 py-2 flex items-center justify-between"
        style={{ borderTop: "1px solid var(--border-light)", background: "rgba(255,255,255,0.01)" }}
      >
        <span style={{ fontSize: "9px", color: "var(--mu)" }}>
          Formula: 2.5×dumps + 0.8×gap_hrs + 1.2×age_days − 30×resolved%
        </span>
        <span style={{ fontSize: "9px", fontWeight: 600, color: "var(--teal)" }}>WAScore</span>
      </div>
    </div>
  );
}
