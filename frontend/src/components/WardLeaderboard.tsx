import type { WardScore } from "@/types";

const GRADE_COLOR: Record<string, string> = {
  A: "#10b981", B: "#0ea5e9", C: "#f59e0b", D: "#f97316", F: "#ef4444",
};

export default function WardLeaderboard({ wards }: { wards: WardScore[] }) {
  const sorted = [...wards].sort((a, b) => b.wascore - a.wascore);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Ward Performance</span>
        <span className="badge badge-blue">{wards.length} wards</span>
      </div>
      <div>
        {sorted.map((w, i) => {
          const gc = GRADE_COLOR[w.grade] ?? "#64748b";
          return (
            <div key={w.ward_id} className="px-3.5 py-2.5 flex items-center gap-3 border-b border-[#f1f5f9] last:border-b-0">
              <span className="text-[11px] font-bold text-[#94a3b8] w-4 shrink-0 tabular-nums text-center">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold text-[#0f172a] truncate">{w.ward_name}</div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 rounded-full bg-[#f1f5f9] overflow-hidden max-w-[100px]">
                    <div className="h-full rounded-full" style={{ width: `${w.pct_resolved}%`, background: gc }} />
                  </div>
                  <span className="text-[10px] text-[#94a3b8]">{w.pct_resolved}% resolved</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-[#94a3b8]">{w.active_dumps} dumps</span>
                <span
                  className="text-[11px] font-bold w-6 h-6 rounded-md flex items-center justify-center"
                  style={{ background: `${gc}12`, color: gc }}
                >
                  {w.grade}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
