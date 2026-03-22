"""
Advanced-8: Behavioral Deterrence ROI Calculator
Ranks intervention options per dump site by cost-effectiveness.

Usage:
    python deterrence_roi.py --dumps data/thanisandra_dumps.geojson
    python deterrence_roi.py --demo
"""

import json
import os
import argparse

# Intervention catalogue
INTERVENTIONS = [
    {
        "id": "A",
        "name": "No Dumping Signage + Paint",
        "cost_inr": 5_000,
        "dump_reduction_pct": 15,
        "description": "Visible deterrence at low cost",
        "lifespan_years": 2,
        "suitable_for": ["Low", "Medium"],
    },
    {
        "id": "B",
        "name": "Motion Sensor Light (Solar)",
        "cost_inr": 25_000,
        "dump_reduction_pct": 55,
        "description": "Illumination eliminates covert night dumping",
        "lifespan_years": 5,
        "suitable_for": ["Low", "Medium", "High"],
    },
    {
        "id": "C",
        "name": "Solar-Powered IoT Camera",
        "cost_inr": 60_000,
        "dump_reduction_pct": 85,
        "description": "24/7 surveillance + BBMP enforcement integration",
        "lifespan_years": 7,
        "suitable_for": ["Medium", "High", "Critical"],
    },
    {
        "id": "D",
        "name": "Community Bin Installation",
        "cost_inr": 80_000,
        "dump_reduction_pct": 95,
        "description": "Designated collection point removes dumping motivation",
        "lifespan_years": 10,
        "suitable_for": ["Medium", "High", "Critical"],
    },
    {
        "id": "E",
        "name": "Barricade + Landscaping",
        "cost_inr": 35_000,
        "dump_reduction_pct": 70,
        "description": "Physical barrier prevents vehicle access to dump zones",
        "lifespan_years": 8,
        "suitable_for": ["Low", "Medium", "High"],
    },
]

# BBMP cleanup cost per incident (based on BBMP 2024 operational data)
CLEANUP_COST_INR = {
    'Small':   8_000,   # < 50 m²
    'Medium':  18_000,  # 50-200 m²
    'Large':   45_000,  # > 200 m²
}
REOCCURRENCE_WEEKS = 3.5  # average weeks between re-dumps at un-remediated sites
WEEKS_PER_YEAR = 52


def classify_site_size(area_sqm):
    if area_sqm < 50:
        return 'Small'
    elif area_sqm <= 200:
        return 'Medium'
    return 'Large'


def compute_roi(intervention, site_size, cleanup_cost_inr, recurrence_weeks=REOCCURRENCE_WEEKS):
    """
    ROI = (savings from prevented cleanups over lifespan) - intervention cost
    Annual cleanups without intervention = 52 / recurrence_weeks
    Savings = cleanups_prevented * cleanup_cost * lifespan_years
    """
    annual_cleanups_baseline = WEEKS_PER_YEAR / recurrence_weeks
    annual_cleanups_after    = annual_cleanups_baseline * (1 - intervention['dump_reduction_pct'] / 100)
    annual_savings           = (annual_cleanups_baseline - annual_cleanups_after) * cleanup_cost_inr

    lifespan_savings = annual_savings * intervention['lifespan_years']
    net_roi          = lifespan_savings - intervention['cost_inr']
    payback_weeks    = (intervention['cost_inr'] / annual_savings * WEEKS_PER_YEAR) if annual_savings > 0 else 999

    return {
        'intervention_id':   intervention['id'],
        'intervention_name': intervention['name'],
        'cost_inr':          intervention['cost_inr'],
        'dump_reduction_pct': intervention['dump_reduction_pct'],
        'annual_cleanups_before': round(annual_cleanups_baseline, 1),
        'annual_cleanups_after':  round(annual_cleanups_after, 1),
        'annual_savings_inr':     round(annual_savings),
        'lifespan_years':         intervention['lifespan_years'],
        'lifetime_savings_inr':   round(lifespan_savings),
        'net_roi_inr':            round(net_roi),
        'payback_weeks':          round(payback_weeks, 1),
        'roi_ratio':              round(lifespan_savings / max(1, intervention['cost_inr']), 2),
        'description':            intervention['description'],
    }


def rank_interventions_for_site(dump_feature):
    props     = dump_feature['properties']
    area      = props.get('area_sqm', 100)
    risk_lvl  = 'High' if props.get('risk_score', 0.5) > 0.7 else 'Medium'
    site_size = classify_site_size(area)
    cleanup_cost = CLEANUP_COST_INR[site_size]

    options = []
    for intv in INTERVENTIONS:
        if risk_lvl in intv['suitable_for'] or 'Low' in intv['suitable_for']:
            roi = compute_roi(intv, site_size, cleanup_cost)
            options.append(roi)

    options.sort(key=lambda r: -r['roi_ratio'])

    best = options[0] if options else None
    return {
        'dump_id':      props.get('id', 'UNKNOWN'),
        'site_size':    site_size,
        'area_sqm':     area,
        'cleanup_cost': cleanup_cost,
        'risk_level':   risk_lvl,
        'best_option':  best,
        'all_options':  options,
    }


def process_dump_geojson(geojson_path, output_path=None):
    with open(geojson_path) as f:
        gj = json.load(f)

    results = []
    enriched_features = []

    for feat in gj.get('features', []):
        analysis = rank_interventions_for_site(feat)
        results.append(analysis)

        if analysis['best_option']:
            bo = analysis['best_option']
            feat['properties']['best_intervention']    = bo['intervention_name']
            feat['properties']['intervention_cost_inr'] = bo['cost_inr']
            feat['properties']['roi_weeks']             = bo['payback_weeks']
            feat['properties']['annual_savings_inr']    = bo['annual_savings_inr']
            feat['properties']['net_roi_inr']           = bo['net_roi_inr']
        enriched_features.append(feat)

    print(f"\n=== Deterrence ROI Analysis ===")
    print(f"{'Site':<20} {'Size':<8} {'Best Intervention':<28} {'Cost':>8} {'Payback':>8} {'ROI x':>6}")
    print("-" * 84)
    for r in results:
        if r['best_option']:
            bo = r['best_option']
            print(f"{r['dump_id']:<20} {r['site_size']:<8} {bo['intervention_name']:<28} "
                  f"₹{bo['cost_inr']:>6,} {bo['payback_weeks']:>6.1f}wk {bo['roi_ratio']:>5.1f}x")

    if output_path:
        gj['features'] = enriched_features
        with open(output_path, 'w') as f:
            json.dump(gj, f, indent=2)
        print(f"\n[INFO] Saved enriched GeoJSON → {output_path}")

    return results


def run_demo():
    print("[DEMO] Deterrence ROI Calculator\n")
    print("SCENARIO: Motion Sensor Light at Medium dump site")
    print("=" * 50)
    intv = next(i for i in INTERVENTIONS if i['id'] == 'B')
    roi  = compute_roi(intv, 'Medium', CLEANUP_COST_INR['Medium'])
    print(f"Intervention:       {roi['intervention_name']}")
    print(f"Upfront cost:       ₹{roi['cost_inr']:,}")
    print(f"Dump reduction:     {roi['dump_reduction_pct']}%")
    print(f"Annual cleanups:    {roi['annual_cleanups_before']} → {roi['annual_cleanups_after']}")
    print(f"Annual savings:     ₹{roi['annual_savings_inr']:,}")
    print(f"Lifespan:           {roi['lifespan_years']} years")
    print(f"Lifetime savings:   ₹{roi['lifetime_savings_inr']:,}")
    print(f"Net ROI:            ₹{roi['net_roi_inr']:,} ({roi['roi_ratio']}x return)")
    print(f"Payback period:     {roi['payback_weeks']} weeks")

    dumps_path = "data/thanisandra_dumps.geojson"
    if os.path.exists(dumps_path):
        print(f"\n{'='*50}")
        process_dump_geojson(dumps_path, "data/roi_analysis.geojson")


def main():
    parser = argparse.ArgumentParser(description="OrbitClean Deterrence ROI")
    parser.add_argument("--dumps",  default="data/thanisandra_dumps.geojson")
    parser.add_argument("--output", default="data/roi_analysis.geojson")
    parser.add_argument("--demo",   action="store_true")
    args = parser.parse_args()

    if args.demo or not os.path.exists(args.dumps):
        run_demo()
        return

    process_dump_geojson(args.dumps, args.output)


if __name__ == "__main__":
    main()
