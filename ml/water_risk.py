"""
Advanced-2: Predictive Water Contamination Risk Model
Overlays dump sites on water bodies to compute contamination risk radius.

Usage:
    python water_risk.py --dumps data/thanisandra_dumps.geojson --water data/water_bodies.geojson
    python water_risk.py --demo
"""

import json
import math
import argparse
import os
from datetime import datetime


# Soil permeability classes (K in m/day) — from USDA-NRCS soil data
SOIL_PERMEABILITY = {
    'Sandy': 25.0,
    'Loamy Sand': 12.5,
    'Sandy Loam': 6.0,
    'Loam': 3.0,
    'Clay Loam': 1.5,
    'Clay': 0.5,
    'Default': 3.0,  # Bengaluru laterite soil
}

# Waste toxicity weights per SWM stream (1=low, 5=high)
WASTE_TOXICITY = {
    'Wet/Green': 2,
    'Dry/Blue': 1,
    'Sanitary/Red': 3,
    'Hazardous/Black': 5,
    'Mixed': 2,
    'Mixed Plastic': 2,
    'Organic': 2,
    'Construction Debris': 1,
    'Dry Recyclable': 1,
}

# Contamination radius model: R = sqrt(A) * permeability_factor * toxicity_factor * time_factor
DAYS_EXPOSURE_DEFAULT = 7  # assume dump has been there ~7 days


def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return 2 * R * math.asin(math.sqrt(a))


def compute_contamination_radius(area_sqm, waste_type, soil_type='Default', days=DAYS_EXPOSURE_DEFAULT):
    """
    Simplified contaminant transport model.
    Radius grows with sqrt(area) * soil permeability * toxicity * time.
    """
    permeability = SOIL_PERMEABILITY.get(soil_type, SOIL_PERMEABILITY['Default'])
    toxicity = WASTE_TOXICITY.get(waste_type, 2)
    base_radius = math.sqrt(area_sqm) * 3.0   # empirical coefficient
    time_factor = math.log1p(days) / math.log1p(7)  # normalised to 7-day baseline
    radius_m = base_radius * (permeability / 3.0) * (toxicity / 3.0) * time_factor
    return round(radius_m, 1)


def contamination_index(dump, water_body_distance_m, contamination_radius_m):
    """
    Composite contamination index [0-1].
    1 = dump inside contamination radius of water body (critical).
    """
    if water_body_distance_m <= 0:
        return 1.0
    if water_body_distance_m > contamination_radius_m * 3:
        return 0.0
    idx = 1.0 - (water_body_distance_m / (contamination_radius_m * 3))
    return round(min(1.0, max(0.0, idx)), 3)


def analyse_dump_water_risk(dump_feature, water_features):
    props = dump_feature['properties']
    coords = dump_feature['geometry']['coordinates']
    dump_lat, dump_lon = coords[1], coords[0]

    area = props.get('area_sqm', 100)
    waste_type = props.get('waste_type', 'Mixed')
    cont_radius = compute_contamination_radius(area, waste_type)

    risks = []
    for wb in water_features:
        wb_props = wb['properties']
        wb_geom = wb['geometry']

        # Get representative point for water body
        if wb_geom['type'] == 'Point':
            wb_lat = wb_geom['coordinates'][1]
            wb_lon = wb_geom['coordinates'][0]
        elif wb_geom['type'] == 'LineString':
            mid = wb_geom['coordinates'][len(wb_geom['coordinates'])//2]
            wb_lat, wb_lon = mid[1], mid[0]
        elif wb_geom['type'] == 'Polygon':
            pts = wb_geom['coordinates'][0]
            wb_lat = sum(p[1] for p in pts) / len(pts)
            wb_lon = sum(p[0] for p in pts) / len(pts)
        else:
            continue

        dist_m = haversine_m(dump_lat, dump_lon, wb_lat, wb_lon)
        ci = contamination_index(dump_feature, dist_m, cont_radius)

        if ci > 0.1:
            pop_at_risk = wb_props.get('population_at_risk', 0)
            risks.append({
                'water_body_id': wb_props.get('id'),
                'water_body_name': wb_props.get('name'),
                'water_body_type': wb_props.get('type'),
                'distance_m': round(dist_m, 1),
                'contamination_radius_m': cont_radius,
                'contamination_index': ci,
                'population_at_risk': int(pop_at_risk * ci),
                'risk_level': 'Critical' if ci > 0.7 else 'High' if ci > 0.4 else 'Medium',
            })

    return {
        'dump_id': props.get('id', 'UNKNOWN'),
        'contamination_radius_m': cont_radius,
        'waste_toxicity': WASTE_TOXICITY.get(waste_type, 2),
        'water_risks': sorted(risks, key=lambda r: -r['contamination_index']),
        'max_contamination_index': max((r['contamination_index'] for r in risks), default=0),
        'total_population_at_risk': sum(r['population_at_risk'] for r in risks),
    }


def run_analysis(dumps_path, water_path, output_path=None):
    with open(dumps_path) as f:
        dumps = json.load(f)
    with open(water_path) as f:
        waters = json.load(f)

    results = []
    enriched_dumps = []

    for dump_feat in dumps['features']:
        analysis = analyse_dump_water_risk(dump_feat, waters['features'])
        results.append(analysis)

        # Enrich dump feature
        dump_feat['properties']['contamination_radius_m'] = analysis['contamination_radius_m']
        dump_feat['properties']['max_contamination_index'] = analysis['max_contamination_index']
        dump_feat['properties']['water_risk_level'] = (
            'High' if analysis['max_contamination_index'] > 0.5 else
            'Medium' if analysis['max_contamination_index'] > 0.2 else 'Low'
        )
        dump_feat['properties']['population_at_risk'] = analysis['total_population_at_risk']
        enriched_dumps.append(dump_feat)

    total_pop = sum(r['total_population_at_risk'] for r in results)
    print(f"\n=== Water Contamination Risk Report ===")
    print(f"  Dump sites analysed:  {len(results)}")
    print(f"  Total population at risk: {total_pop:,}")
    for r in results:
        if r['water_risks']:
            wb = r['water_risks'][0]
            print(f"  [{r['dump_id']}] → {wb['water_body_name']}: {wb['risk_level']} "
                  f"(CI={wb['contamination_index']}, dist={wb['distance_m']}m, "
                  f"pop={wb['population_at_risk']})")

    if output_path:
        dumps['features'] = enriched_dumps
        dumps['water_risk_summary'] = {
            'total_population_at_risk': total_pop,
            'analysis_date': datetime.now().isoformat(),
        }
        with open(output_path, 'w') as f:
            json.dump(dumps, f, indent=2)
        print(f"\n[INFO] Saved enriched GeoJSON → {output_path}")

    return results


def run_demo():
    dumps_path = "data/thanisandra_dumps.geojson"
    water_path = "data/water_bodies.geojson"
    if os.path.exists(dumps_path) and os.path.exists(water_path):
        run_analysis(dumps_path, water_path, "data/water_risk_results.geojson")
    else:
        print("[DEMO] Running with inline sample data...")
        dump = {
            "type": "Feature",
            "properties": {"id": "DEMO-001", "area_sqm": 210, "waste_type": "Hazardous"},
            "geometry": {"type": "Point", "coordinates": [77.5975, 13.0510]}
        }
        water = {
            "type": "Feature",
            "properties": {"id": "WB-001", "name": "Hebbal Lake", "type": "Lake",
                          "population_at_risk": 12000},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[77.5920,13.0480],[77.5960,13.0480],
                                 [77.5960,13.0510],[77.5920,13.0510],[77.5920,13.0480]]]
            }
        }
        result = analyse_dump_water_risk(dump, [water])
        print(json.dumps(result, indent=2))


def main():
    parser = argparse.ArgumentParser(description="OrbitClean Water Contamination Risk")
    parser.add_argument("--dumps", default="data/thanisandra_dumps.geojson")
    parser.add_argument("--water", default="data/water_bodies.geojson")
    parser.add_argument("--output", default="data/water_risk_results.geojson")
    parser.add_argument("--demo", action="store_true")
    args = parser.parse_args()

    if args.demo:
        run_demo()
        return

    run_analysis(args.dumps, args.water, args.output)


if __name__ == "__main__":
    main()
