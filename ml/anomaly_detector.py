"""
Advanced-5: Anomaly Detection for Dump Surge Events
Isolation Forest on dump formation time-series to detect abnormal spikes.

Usage:
    python anomaly_detector.py --demo
    python anomaly_detector.py --timeseries data/dump_timeseries.json
"""

import json
import os
import argparse
from datetime import datetime, timedelta
import random

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

try:
    from sklearn.ensemble import IsolationForest
    from sklearn.preprocessing import StandardScaler
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False


ZONES = [
    {"id": "ZONE-TH-1", "name": "Thanisandra North",  "lat": 13.062, "lon": 77.628},
    {"id": "ZONE-TH-2", "name": "Thanisandra South",  "lat": 13.054, "lon": 77.631},
    {"id": "ZONE-HB-1", "name": "Hebbal Junction",     "lat": 13.051, "lon": 77.597},
    {"id": "ZONE-YL-1", "name": "Yelahanka Market",    "lat": 13.101, "lon": 77.598},
    {"id": "ZONE-KG-1", "name": "Kodigehalli Road",    "lat": 13.072, "lon": 77.619},
]

ANOMALY_CAUSES = {
    'construction': "Construction/demolition debris surge",
    'festival':     "Post-festival cleanup waste surge",
    'organized':    "Organized illegal dumping (commercial vehicle)",
    'market':       "Market day organic overflow",
    'rain':         "Storm drain backup + debris",
}


def generate_synthetic_timeseries(n_weeks=12):
    """
    Generate realistic weekly dump count time-series per zone.
    Injects 2-3 anomalous weeks (festival, construction, organized dumping).
    """
    series = {}
    start_date = datetime.now() - timedelta(weeks=n_weeks)

    for zone in ZONES:
        baseline = random.uniform(2, 8)  # avg dumps/week
        counts = []
        for w in range(n_weeks):
            date = (start_date + timedelta(weeks=w)).strftime("%Y-W%W")
            noise = random.gauss(0, 0.8)
            count = max(0, baseline + noise)

            # Inject anomalies
            if zone['id'] == 'ZONE-HB-1' and w == 6:
                count = baseline * 5.2   # construction surge
                cause = 'construction'
            elif zone['id'] == 'ZONE-YL-1' and w == 9:

                count = baseline * 4.1   # festival surge (Ugadi)
                cause = 'festival'
            elif zone['id'] == 'ZONE-TH-1' and w == 3:
                count = baseline * 3.8   # organized dumping
                cause = 'organized'
            else:
                cause = None

            counts.append({
                'week': date,
                'week_index': w,
                'dump_count': round(count, 1),
                'true_anomaly': cause is not None,
                'true_cause': cause,
            })
        series[zone['id']] = {
            'zone': zone,
            'baseline': baseline,
            'counts': counts,
        }
    return series


def extract_features(counts):
    """
    Feature vector per week:
    [count, change_from_prev, z_score_vs_8wk_mean, day_of_week_effect]
    """
    if not HAS_NUMPY:
        return [[c['dump_count']] for c in counts]

    vals = [c['dump_count'] for c in counts]
    vals_np = __import__('numpy').array(vals, dtype=float)
    features = []
    window = 4

    for i in range(len(vals)):
        v = vals[i]
        prev = vals[i-1] if i > 0 else v
        change = v - prev
        recent = vals_np[max(0, i-window):i] if i > 0 else vals_np[:1]
        mean_r = float(recent.mean()) if len(recent) > 0 else v
        std_r  = float(recent.std())  if len(recent) > 1 else 1.0
        zscore = (v - mean_r) / (std_r + 1e-6)
        features.append([v, change, zscore, i % 4])  # seasonal (quarterly)

    return features


def run_isolation_forest(features, contamination=0.10):
    if not HAS_SKLEARN:
        # Manual z-score fallback
        vals = [f[0] for f in features]
        mean = sum(vals) / len(vals)
        std  = (sum((v - mean)**2 for v in vals) / len(vals)) ** 0.5
        return [-1 if abs(v - mean) > 2.5 * std else 1 for v in vals], \
               [-(abs(v - mean) / (std + 1e-6)) for v in vals]

    scaler = StandardScaler()
    X = scaler.fit_transform(features)
    model = IsolationForest(n_estimators=200, contamination=contamination,
                            random_state=42)
    model.fit(X)
    labels  = model.predict(X)   # -1 = anomaly, 1 = normal
    scores  = model.score_samples(X)  # lower = more anomalous
    return labels, scores


def compute_anomaly_ratio(labels, score):
    """Severity ratio: how anomalous vs. expected."""
    return round(-float(score) * 5, 2)  # scale to intuitive 0-10


def analyse_timeseries(series, output_path=None):
    all_alerts = []

    for zone_id, data in series.items():
        zone = data['zone']
        counts = data['counts']
        features = extract_features(counts)
        labels, scores = run_isolation_forest(features)

        for i, (week_data, label, score) in enumerate(zip(counts, labels, scores)):
            if label == -1:
                ratio = compute_anomaly_ratio(label, score)
                baseline = data['baseline']
                actual   = week_data['dump_count']
                mult     = round(actual / max(baseline, 0.1), 1)

                cause_hint = (
                    'festival'     if 'W14' in week_data['week'] or 'W15' in week_data['week'] else
                    'construction' if mult > 4 else
                    'organized'    if mult > 3 else 'market'
                )

                alert = {
                    'zone_id': zone_id,
                    'zone_name': zone['name'],
                    'lat': zone['lat'],
                    'lon': zone['lon'],
                    'week': week_data['week'],
                    'dump_count': actual,
                    'baseline_avg': round(baseline, 1),
                    'multiplier': mult,
                    'anomaly_severity': ratio,
                    'probable_cause': ANOMALY_CAUSES.get(cause_hint, 'Unknown'),
                    'alert_message': (
                        f"ANOMALY: Dump formation {mult}x above normal in {zone['name']} "
                        f"— possible {cause_hint.replace('_', ' ')} activity"
                    ),
                    'recommended_action': (
                        "Deploy enforcement team + CCTV review" if mult > 4
                        else "Increase collection frequency this week"
                    ),
                    'true_anomaly': week_data.get('true_anomaly', False),
                }
                all_alerts.append(alert)

    # Accuracy report
    all_weeks = [(z, wk) for zid, z_data in series.items()
                  for wk in z_data['counts'] for z in [z_data['zone']]]
    tp = sum(1 for a in all_alerts if a['true_anomaly'])
    fp = sum(1 for a in all_alerts if not a['true_anomaly'])
    print(f"\n=== Anomaly Detection Results ===")
    print(f"  Alerts raised: {len(all_alerts)} ({tp} true positives, {fp} false positives)")

    for alert in all_alerts:
        severity = "CRITICAL" if alert['multiplier'] > 4 else "HIGH" if alert['multiplier'] > 3 else "MEDIUM"
        print(f"  [{severity}] {alert['zone_name']} {alert['week']}: "
              f"{alert['multiplier']}x — {alert['probable_cause']}")

    if output_path:
        output = {
            'generated_at': datetime.now().isoformat(),
            'total_alerts': len(all_alerts),
            'alerts': all_alerts,
        }
        os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else '.', exist_ok=True)
        with open(output_path, 'w') as f:
            json.dump(output, f, indent=2)
        print(f"  Saved → {output_path}")

    return all_alerts


def run_demo():
    print("[DEMO] Generating synthetic 12-week dump time-series...")
    series = generate_synthetic_timeseries(n_weeks=12)
    total_obs = sum(len(d['counts']) for d in series.values())
    print(f"[DEMO] {len(series)} zones × {total_obs // len(series)} weeks = {total_obs} observations")
    alerts = analyse_timeseries(series, "data/anomaly_alerts.json")
    return alerts


def main():
    parser = argparse.ArgumentParser(description="OrbitClean Anomaly Detector")
    parser.add_argument("--timeseries", help="Path to dump time-series JSON")
    parser.add_argument("--output",     default="data/anomaly_alerts.json")
    parser.add_argument("--demo",       action="store_true")
    args = parser.parse_args()

    if args.demo or not args.timeseries:
        run_demo()
        return

    with open(args.timeseries) as f:
        series = json.load(f)
    analyse_timeseries(series, args.output)


if __name__ == "__main__":
    main()
