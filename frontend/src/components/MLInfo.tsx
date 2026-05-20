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
        <div
          className="rounded-lg px-3.5 py-3 mb-3"
          style={{ background: "var(--purple-soft)", border: "1px solid rgba(124,58,237,0.2)" }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#7c3aed" }}>
              Gradient Boosting Classifier
            </span>
            <span
              className="px-2 py-0.5 rounded"
              style={{ fontSize: "9px", color: "var(--mu)", background: "var(--card)", border: "1px solid var(--border)" }}
            >
              scikit-learn
            </span>
          </div>
          <p style={{ fontSize: "10px", color: "var(--tx2)", lineHeight: 1.6, marginBottom: "10px" }}>
            Predicts where illegal dumps will form before they appear, using spatial context from OpenStreetMap + satellite imagery.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Grid Cells", value: "552" },
              { label: "Labels", value: "20" },
              { label: "AUC Score", value: "0.80" },
            ].map((s) => (
              <div
                key={s.label}
                className="text-center rounded-md py-1.5"
                style={{ background: "var(--card)", border: "1px solid rgba(124,58,237,0.2)" }}
              >
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#7c3aed", fontVariantNumeric: "tabular-nums" }}>
                  {s.value}
                </div>
                <div style={{ fontSize: "8px", color: "var(--mu)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {s.label}
                </div>
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
                <div style={{ fontSize: "11px", fontWeight: 500, color: "var(--tx)" }}>{f.name}</div>
                <div style={{ fontSize: "9px", color: "var(--mu)" }}>{f.src}</div>
              </div>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${f.pct * 4}%`, background: f.color }}
                />
              </div>
              <span style={{ fontSize: "11px", fontWeight: 700, fontVariantNumeric: "tabular-nums", width: "32px", textAlign: "right", color: f.color }}>
                {f.pct}%
              </span>
            </div>
          ))}
        </div>

        {/* Pipeline note */}
        <div
          className="mt-3 pt-3"
          style={{ borderTop: "1px solid var(--border)", fontSize: "10px", color: "var(--mu)", lineHeight: 1.6 }}
        >
          Trained on 23×24 grid (100m) over Thanisandra ward. Real GIS data: 841 road segments, 8 markets, 7757 buildings, 1023 land-use polygons.
        </div>
      </div>
    </div>
  );
}
