export default function MLInfo() {
  const features = [
    { name: "Road Proximity", src: "OSM roads (841 segments)", pct: 25, color: "#0ea5e9" },
    { name: "Dump Density", src: "Satellite TIF", pct: 25, color: "#ef4444" },
    { name: "Collection Gap", src: "BBMP service gaps", pct: 20, color: "#f97316" },
    { name: "Market Distance", src: "OSM markets (8)", pct: 10, color: "#f59e0b" },
    { name: "Night Lights", src: "TIF brightness", pct: 10, color: "#8b5cf6" },
    { name: "Population", src: "OSM buildings", pct: 5, color: "#10b981" },
    { name: "Land Use", src: "OSM polygons (1023)", pct: 5, color: "#059669" },
  ];

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">ML Risk Prediction Engine</span>
        <span className="badge badge-purple">AUC 0.80</span>
      </div>
      <div className="p-3.5">
        {/* Algorithm card */}
        <div className="rounded-lg bg-gradient-to-br from-[#f5f3ff] to-[#ede9fe] border border-[#e9e5ff] px-3.5 py-3 mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[13px] font-bold text-[#7c3aed]">Gradient Boosting Classifier</span>
            <span className="text-[9px] text-[#a78bfa] bg-white/60 px-2 py-0.5 rounded">scikit-learn</span>
          </div>
          <p className="text-[10px] text-[#64748b] leading-relaxed mb-2.5">
            Predicts where illegal dumps will form before they appear, using spatial context from OpenStreetMap + satellite imagery.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Grid Cells", value: "552" },
              { label: "Labels", value: "20" },
              { label: "AUC Score", value: "0.80" },
            ].map((s) => (
              <div key={s.label} className="text-center rounded-md bg-white/80 py-1.5 border border-[#e9e5ff]">
                <div className="text-[14px] font-bold text-[#7c3aed] tabular-nums">{s.value}</div>
                <div className="text-[8px] text-[#a78bfa] uppercase tracking-wide">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Feature importance */}
        <div className="section-label mb-2">Feature Importance</div>
        <div className="space-y-2">
          {features.map((f) => (
            <div key={f.name} className="flex items-center gap-2.5">
              <div className="w-[100px] shrink-0">
                <div className="text-[11px] font-medium text-[#334155]">{f.name}</div>
                <div className="text-[9px] text-[#94a3b8]">{f.src}</div>
              </div>
              <div className="flex-1 h-2 rounded-full bg-[#f1f5f9] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${f.pct * 4}%`, background: f.color }}
                />
              </div>
              <span className="text-[11px] font-bold tabular-nums w-8 text-right" style={{ color: f.color }}>
                {f.pct}%
              </span>
            </div>
          ))}
        </div>

        {/* Pipeline note */}
        <div className="mt-3 pt-3 border-t border-[#f1f5f9] text-[10px] text-[#94a3b8] leading-relaxed">
          Trained on 23x24 grid (100m) over Thanisandra ward. Real GIS data: 841 road segments, 8 markets, 7757 buildings, 1023 land-use polygons.
        </div>
      </div>
    </div>
  );
}
