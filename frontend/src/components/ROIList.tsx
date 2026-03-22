import { ROI_ITEMS } from "@/lib/data";

const RANK_COLORS = ["#00e5a0", "#4db8ff", "#c084fc", "#ffd166", "#fb923c"];

export default function ROIList() {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Best Interventions</span>
        <span className="badge badge-green">BY ROI</span>
      </div>
      <div className="p-2.5 space-y-1.5">
        {ROI_ITEMS.map((item, i) => {
          const color = RANK_COLORS[i] ?? "#4a5a70";
          // Parse ROI multiplier for bar width
          const roiNum = parseFloat(item.roi);
          const barPct = Math.min((roiNum / 5) * 100, 100);

          return (
            <div
              key={i}
              className="rounded-lg bg-white/[0.02] border border-white/[0.06] overflow-hidden"
              style={{ borderLeftColor: color, borderLeftWidth: 3 }}
            >
              <div className="flex items-center gap-2.5 px-2.5 py-2">
                {/* Rank */}
                <span className="font-syne text-[13px] font-black w-4 shrink-0" style={{ color }}>
                  {i + 1}
                </span>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium truncate">{item.name}</div>
                  <div className="text-[9px] text-[#4a5a70] truncate mt-0.5">{item.sites}</div>
                  {/* ROI bar */}
                  <div className="mt-1 h-0.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${barPct}%`, background: color }}
                    />
                  </div>
                </div>
                {/* Metrics */}
                <div className="text-right shrink-0">
                  <div className="font-syne text-[13px] font-bold" style={{ color }}>
                    {item.roi}
                  </div>
                  <div className="text-[10px] text-[#ffd166]">{item.cost}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
