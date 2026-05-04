"""
Ground Truth vs ML Prediction Comparator — OrbitClean 2.0

Given a field-photo coordinate, find the nearest predicted dump site in a
GeoJSON output file and report the distance, model coordinates, and metadata.

Usage:
    python ml/compare_ground_truth.py --lat 13.056306 --lon 77.62965
    python ml/compare_ground_truth.py --lat 13.056467 --lon 77.629216 --geojson data/detected_dumps.geojson
"""

from __future__ import annotations

import argparse
import json
import math
import os
from typing import Any, Dict, Iterable, List, Tuple


DEFAULT_GEOJSON = os.path.join("data", "detected_dumps.geojson")


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return distance in meters between two WGS84 coordinates."""
    radius_m = 6371000.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2.0) ** 2
    )
    return radius_m * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def load_features(path: str) -> List[Dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as handle:
        geojson = json.load(handle)
    return list(geojson.get("features", []))


def nearest_feature(lat: float, lon: float, features: Iterable[Dict[str, Any]]) -> Tuple[Dict[str, Any], float]:
    best_feature: Dict[str, Any] | None = None
    best_distance = float("inf")

    for feature in features:
        coords = feature.get("geometry", {}).get("coordinates", [None, None])
        if len(coords) < 2:
            continue
        feature_lon, feature_lat = coords[0], coords[1]
        distance = haversine_m(lat, lon, feature_lat, feature_lon)
        if distance < best_distance:
            best_distance = distance
            best_feature = feature

    if best_feature is None:
        raise ValueError("No valid features found in GeoJSON file")

    return best_feature, best_distance


def build_report(lat: float, lon: float, feature: Dict[str, Any], distance_m: float) -> str:
    properties = feature.get("properties", {})
    coords = feature.get("geometry", {}).get("coordinates", [None, None])
    model_lon, model_lat = coords[0], coords[1]

    lines = [
        "GROUND TRUTH VS ML PREDICTION",
        f"Field photo: {lat:.6f}, {lon:.6f}",
        f"Nearest model site: {properties.get('id', '?')}",
        f"Model coordinates: {model_lat:.6f}, {model_lon:.6f}",
        f"Distance: {distance_m:.0f} m",
        f"Detection method: {properties.get('detection_method', '?')}",
    ]

    if "probability" in properties:
        lines.append(f"Model probability: {properties['probability']}")
    if "area_sqm" in properties:
        lines.append(f"Estimated area: {properties['area_sqm']} sqm")
    if "status" in properties:
        lines.append(f"Status: {properties['status']}")

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare a field GPS point to the nearest ML dump prediction.")
    parser.add_argument("--lat", type=float, required=True, help="Field photo latitude")
    parser.add_argument("--lon", type=float, required=True, help="Field photo longitude")
    parser.add_argument("--geojson", default=DEFAULT_GEOJSON, help="Path to predicted dump GeoJSON")
    args = parser.parse_args()

    if not os.path.exists(args.geojson):
        raise FileNotFoundError(f"GeoJSON file not found: {args.geojson}")

    features = load_features(args.geojson)
    nearest, distance_m = nearest_feature(args.lat, args.lon, features)
    print(build_report(args.lat, args.lon, nearest, distance_m))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())