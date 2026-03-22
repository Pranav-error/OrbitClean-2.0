"""
ML-5: Carbon Credit Quantification from Illegal Dump Sites
Converts dump volume estimate → CH4 emissions → CO2-eq → carbon credit value.

Formula based on IPCC 2006 Guidelines for Solid Waste Disposal (Tier 1).
Usage:
    python carbon_estimator.py --geojson data/thanisandra_dumps.geojson
    python carbon_estimator.py --demo
"""

import json
import argparse
import os

# --- IPCC Tier 1 constants ---
GWP_CH4 = 25.0          # CH4 global warming potential (CO2-eq)
FRACTION_ORGANIC = 0.55  # ~55% organic content in Indian MSW (Central Pollution Control Board)
DOC_F = 0.50            # fraction of degradable organic carbon that decomposes
MCF = 0.8               # methane correction factor (open dump = 0.8)
F_CH4 = 0.5             # fraction of landfill gas that is CH4
OX = 0.1                # oxidation factor (open dumps lower oxidation)
DENSITY_WASTE_KG_M3 = 400  # typical Indian mixed waste bulk density

# Carbon credit price (India VCM market, March 2026)
CARBON_CREDIT_INR_PER_TONNE = 2000   # ₹2000/tCO2-eq (BEE/CAQM estimate)
CARBON_CREDIT_USD_PER_TONNE = 5.0    # USD equiv


def estimate_volume_m3(area_sqm, depth_m=0.5):
    """
    Estimate dump volume. Default depth 0.5m (typical roadside dump).
    For larger sites use LiDAR/photogrammetry depth estimates.
    """
    return area_sqm * depth_m


def estimate_mass_tonnes(volume_m3):
    return (volume_m3 * DENSITY_WASTE_KG_M3) / 1000.0


def ipcc_tier1_ch4(mass_tonnes):
    """
    IPCC 2006 Tier 1 First Order Decay method (simplified steady-state).
    CH4 generated (tonnes) from waste mass (tonnes).
    """
    doc = mass_tonnes * FRACTION_ORGANIC * 0.4  # degradable organic carbon
    ch4_tonnes = doc * DOC_F * MCF * F_CH4 * (1 - OX) * (16 / 12)
    return ch4_tonnes


def ch4_to_co2eq(ch4_tonnes):
    return ch4_tonnes * GWP_CH4


def co2eq_to_credits(co2eq_tonnes):
    inr = co2eq_tonnes * CARBON_CREDIT_INR_PER_TONNE
    usd = co2eq_tonnes * CARBON_CREDIT_USD_PER_TONNE
    return {'inr': round(inr, 2), 'usd': round(usd, 2)}


def estimate_dump_carbon(area_sqm, depth_m=0.5, waste_type="Mixed"):
    """Full pipeline for a single dump site."""
    vol = estimate_volume_m3(area_sqm, depth_m)
    mass = estimate_mass_tonnes(vol)
    ch4 = ipcc_tier1_ch4(mass)
    co2eq = ch4_to_co2eq(ch4)
    credits = co2eq_to_credits(co2eq)

    # Water contamination risk radius (simplified diffusion model)
    contamination_radius_m = (area_sqm ** 0.5) * 3  # rough proxy

    return {
        'area_sqm': round(area_sqm, 1),
        'volume_m3': round(vol, 2),
        'mass_tonnes': round(mass, 2),
        'ch4_tonnes': round(ch4, 4),
        'co2_eq_tonnes': round(co2eq, 3),
        'carbon_credit_inr': credits['inr'],
        'carbon_credit_usd': credits['usd'],
        'contamination_radius_m': round(contamination_radius_m, 1),
        'waste_type': waste_type,
        'ipcc_method': 'Tier1_FOD_simplified',
    }


def process_geojson(geojson_path, output_path=None):
    with open(geojson_path) as f:
        gj = json.load(f)

    total_co2 = 0
    total_inr = 0
    enriched_features = []

    for feat in gj.get('features', []):
        props = feat.get('properties', {})
        area = props.get('area_sqm', 100)  # default 100m² if not set
        waste_type = props.get('waste_type', 'Mixed')
        carbon = estimate_dump_carbon(area, waste_type=waste_type)

        props.update({
            'volume_m3': carbon['volume_m3'],
            'mass_tonnes': carbon['mass_tonnes'],
            'co2_eq_tonnes': carbon['co2_eq_tonnes'],
            'carbon_credit_inr': carbon['carbon_credit_inr'],
            'contamination_radius_m': carbon['contamination_radius_m'],
        })
        feat['properties'] = props
        total_co2 += carbon['co2_eq_tonnes']
        total_inr += carbon['carbon_credit_inr']
        enriched_features.append(feat)

    gj['features'] = enriched_features
    gj['metadata'] = {
        'total_co2_eq_tonnes': round(total_co2, 3),
        'total_carbon_credit_inr': round(total_inr, 2),
        'num_sites': len(enriched_features),
        'ipcc_method': 'Tier1_FOD_simplified',
        'carbon_price_inr_per_tonne': CARBON_CREDIT_INR_PER_TONNE,
    }

    if output_path:
        with open(output_path, 'w') as f:
            json.dump(gj, f, indent=2)
        print(f"[INFO] Saved carbon-enriched GeoJSON → {output_path}")

    print(f"\n=== Carbon Quantification Summary ===")
    print(f"  Active dump sites: {len(enriched_features)}")
    print(f"  Total CO2-eq:      {total_co2:.2f} tonnes")
    print(f"  Carbon credits:    ₹{total_inr:,.0f}")
    print(f"  Equivalent:        {total_co2/7.0:.1f} years of car emissions avoided")
    return gj


def run_demo():
    print("[DEMO] Carbon credit quantification for Thanisandra dump sites\n")
    test_sites = [
        {"name": "Thanisandra Main Road Dump", "area_sqm": 145, "waste_type": "Mixed"},
        {"name": "Residential Colony Dump",    "area_sqm": 89,  "waste_type": "Organic"},
        {"name": "Market Area Dump (Hebbal)",  "area_sqm": 210, "waste_type": "Hazardous"},
        {"name": "Vacant Plot Dump",           "area_sqm": 320, "waste_type": "Construction"},
        {"name": "Storm Drain Adjacent Dump",  "area_sqm": 178, "waste_type": "Mixed Plastic"},
    ]

    total_co2 = 0
    total_inr = 0
    print(f"{'Site':<35} {'Area(m²)':>8} {'Mass(T)':>8} {'CO2-eq(T)':>10} {'₹ Credits':>12}")
    print("-" * 80)
    for s in test_sites:
        r = estimate_dump_carbon(s['area_sqm'], waste_type=s['waste_type'])
        total_co2 += r['co2_eq_tonnes']
        total_inr += r['carbon_credit_inr']
        print(f"{s['name']:<35} {s['area_sqm']:>8.0f} {r['mass_tonnes']:>8.2f} "
              f"{r['co2_eq_tonnes']:>10.3f} {r['carbon_credit_inr']:>12,.0f}")

    print("-" * 80)
    print(f"{'TOTAL':<35} {sum(s['area_sqm'] for s in test_sites):>8.0f} "
          f"{'':>8} {total_co2:>10.3f} {total_inr:>12,.0f}")
    print(f"\n  Preventing these dumps = {total_co2:.2f} tCO2-eq = ₹{total_inr:,.0f} in carbon credits")
    print(f"  Ugadi festival surge (est. +30%): +{total_co2*0.3:.2f} tCO2-eq if not intercepted")


def main():
    parser = argparse.ArgumentParser(description="OrbitClean Carbon Estimator")
    parser.add_argument("--geojson", help="Input dump sites GeoJSON")
    parser.add_argument("--output",  help="Output enriched GeoJSON path")
    parser.add_argument("--demo",    action="store_true")
    args = parser.parse_args()

    if args.demo or not args.geojson:
        run_demo()
        return

    process_geojson(args.geojson, args.output)


if __name__ == "__main__":
    main()
