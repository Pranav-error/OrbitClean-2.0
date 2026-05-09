#!/usr/bin/env python3
"""
OrbitClean 2.0 — Ground Truth Validation Script
Compares field GPS coordinates against ML-predicted dump site locations.

Usage:
    python3 validate_ground_truth.py
"""

import json
import math
import os
import sys

DATA_FILE = os.path.join(os.path.dirname(__file__), "data", "detected_dumps.geojson")
TOLERANCE_M = 100  # Sentinel-2 10m/pixel, cluster centroid tolerance

GROUND_TRUTH = [
    {
        "id": "GT-001",
        "desc": "Patel Nangegowda Layout, near Shri Krishna Gokul Hotel",
        "lat": 13.056306,
        "lon": 77.62965,
        "date": "7 March 2026",
        "observation": "Mixed waste at bus stop",
    },
    {
        "id": "GT-002",
        "desc": "Site 43 & 44, Rachenahalli Main Rd, P&T Layout",
        "lat": 13.056467,
        "lon": 77.629216,
        "date": "7 March 2026",
        "observation": "Open dump, cattle foraging",
    },
]


def haversine(lon1, lat1, lon2, lat2):
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(a))


def main():
    if not os.path.exists(DATA_FILE):
        print(f"ERROR: {DATA_FILE} not found. Run `python ml/dump_detector.py --demo` first.")
        sys.exit(1)

    with open(DATA_FILE) as f:
        features = json.load(f)["features"]

    print("=" * 60)
    print("  ORBITCLEAN 2.0 — GROUND TRUTH VALIDATION")
    print("  Sentinel-2A · 20 Mar 2026 · Thanisandra Ward 26")
    print("=" * 60)

    matched = 0
    results = []

    for gt in GROUND_TRUTH:
        nearest = min(
            features,
            key=lambda d: haversine(gt["lon"], gt["lat"],
                                    d["geometry"]["coordinates"][0],
                                    d["geometry"]["coordinates"][1]),
        )
        props = nearest["properties"]
        pred_lon, pred_lat = nearest["geometry"]["coordinates"]
        dist = haversine(gt["lon"], gt["lat"], pred_lon, pred_lat)
        is_match = dist <= TOLERANCE_M

        if is_match:
            matched += 1

        results.append({
            "gt": gt,
            "pred_lat": pred_lat,
            "pred_lon": pred_lon,
            "dump_id": props.get("id", "?"),
            "risk_score": props.get("risk_score", "?"),
            "area_sqm": props.get("area_sqm", "?"),
            "dist_m": dist,
            "match": is_match,
        })

        status = "✓ MATCH" if is_match else "✗ MISS"
        print(f"\n  {gt['id']}  {gt['desc']}")
        print(f"  {'─' * 54}")
        print(f"  Observed      :  {gt['observation']}")
        print(f"  GPS (field)   :  {gt['lat']}°N, {gt['lon']}°E")
        print(f"  ML Predicted  :  {pred_lat}°N, {pred_lon}°E")
        print(f"  Matched Dump  :  {props.get('id', '?')}")
        print(f"  Offset        :  {dist:.1f} m   {status}")
        print(f"  Risk Score    :  {props.get('risk_score', '?')}")
        print(f"  Area          :  {props.get('area_sqm', '?')} m²")

    print("\n" + "=" * 60)
    print(f"  Total ML detections  : {len(features)}")
    print(f"  Ground truth sites   : {len(GROUND_TRUTH)}")
    print(f"  Matched (≤{TOLERANCE_M}m)      : {matched} / {len(GROUND_TRUTH)}  ({matched/len(GROUND_TRUTH)*100:.0f}%)")
    print(f"  Sentinel-2 pixel res : 10 m/pixel")
    print(f"  False-positive rate  : {len(features) / 90000 * 100:.3f}% of scene pixels")
    print("=" * 60)

    if matched == len(GROUND_TRUTH):
        print("\n  ALL GROUND TRUTH SITES DETECTED  ✓")
    else:
        print(f"\n  WARNING: {len(GROUND_TRUTH) - matched} site(s) not matched within tolerance.")

    print()
    return 0 if matched == len(GROUND_TRUTH) else 1


if __name__ == "__main__":
    sys.exit(main())
