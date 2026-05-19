"use client";
import { useState, useEffect } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface AnomalyAlert {
  zone_id: string;
  zone_name: string;
  week: string;
  dump_count: number;
  baseline_avg: number;
  multiplier: number;
  anomaly_severity: number;
  probable_cause: string;
  alert_message: string;
  recommended_action: string;
  true_anomaly: boolean;
}

const FALLBACK: AnomalyAlert[] = [
  {
    zone_id: "ZONE-TH-1", zone_name: "Thanisandra North",
    week: "2026-W02", dump_count: 18.1, baseline_avg: 4.8, multiplier: 3.8,
    anomaly_severity: 3.8, probable_cause: "Organized illegal dumping (commercial vehicle)",
    alert_message: "3.8× above normal in Thanisandra North",
    recommended_action: "Increase collection frequency this week", true_anomaly: true,
  },
  {
    zone_id: "ZONE-TH-3", zone_name: "Kodigehalli",
    week: "2026-W03", dump_count: 9.2, baseline_avg: 3.1, multiplier: 3.0,
    anomaly_severity: 3.1, probable_cause: "Construction debris overflow",
    alert_message: "3.0× above normal in Kodigehalli",
    recommended_action: "Deploy special tipper for construction waste", true_anomaly: true,
  },
  {
    zone_id: "ZONE-TH-2", zone_name: "Thanisandra South",
    week: "2026-W01", dump_count: 5.5, baseline_avg: 5.9, multiplier: 0.9,
    anomaly_severity: 2.72, probable_cause: "Market day organic overflow",
    alert_message: "0.9× baseline in Thanisandra South",
    recommended_action: "Monitor next week", true_anomaly: false,
  },
];

function severityColor(a: AnomalyAlert) {
  if (a.true_anomaly && a.multiplier >= 3) return "#dc2626";
  if (a.true_anomaly) return "#ea580c";
  return "#d97706";
}

export default function AlertsPanel() {
  const [alerts, setAlerts] = useState<AnomalyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/anomalies`)
      .then((r) => r.json())
      .then((data) => {
        setAlerts(data.alerts ?? []);
        setLoading(false);
      })
      .catch(() => {
        setAlerts(FALLBACK);
        setOffline(true);
        setLoading(false);
      });
  }, []);

  const confirmed = alerts.filter((a) => a.true_anomaly);
  const borderline = alerts.filter((a) => !a.true_anomaly);

  return (
    <div className="flex flex-col gap-3">
      {/* Summary card */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Isolation Forest Alerts</span>
          {confirmed.length > 0 && (
            <span className="badge badge-red">{confirmed.length} confirmed</span>
          )}
        </div>
        <div className="p-3">
          {offline && (
            <div
              className="mb-3 rounded-lg px-3 py-2 text-[10.5px]"
              style={{ background: "var(--amber-soft)", color: "#b45309", border: "1px solid rgba(217,119,6,0.2)" }}
            >
              Backend offline — showing cached data
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: confirmed.length, label: "Confirmed", color: "#dc2626" },
              { value: borderline.length, label: "Borderline", color: "#d97706" },
              { value: alerts.length, label: "Total", color: "var(--tx)" },
            ].map((s) => (
              <div key={s.label} className="kpi-pill">
                <span className="kpi-value" style={{ color: s.color }}>{s.value}</span>
                <span className="kpi-label">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Confirmed surges */}
      {!loading && confirmed.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Confirmed Surge Events</span>
          </div>
          {confirmed.map((a, i) => (
            <AlertRow key={i} alert={a} />
          ))}
        </div>
      )}

      {/* Borderline events */}
      {!loading && borderline.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Borderline Events</span>
            <span className="badge badge-amber">{borderline.length}</span>
          </div>
          {borderline.map((a, i) => (
            <AlertRow key={i} alert={a} />
          ))}
        </div>
      )}

      {loading && (
        <div
          className="card p-6 text-center"
          style={{ fontSize: "11px", color: "var(--mu)" }}
        >
          Loading alerts…
        </div>
      )}
    </div>
  );
}

function AlertRow({ alert: a }: { alert: AnomalyAlert }) {
  const color = severityColor(a);
  return (
    <div
      className="px-4 py-3"
      style={{ borderBottom: "1px solid var(--border-light)" }}
    >
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="min-w-0">
          <span style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--tx)" }}>
            {a.zone_name}
          </span>
          <span style={{ fontSize: "9px", color: "var(--mu)", marginLeft: 6 }}>
            {a.week}
          </span>
        </div>
        <span
          className="shrink-0 text-[9px] font-bold px-2 py-0.5 rounded"
          style={{ background: `${color}15`, color, border: `1px solid ${color}28` }}
        >
          {a.multiplier.toFixed(1)}× baseline
        </span>
      </div>
      <p style={{ fontSize: "10.5px", color: "var(--tx2)", marginBottom: 3 }}>
        {a.probable_cause}
      </p>
      <p style={{ fontSize: "10px", color: "var(--mu)" }}>
        → {a.recommended_action}
      </p>
    </div>
  );
}
