"""
Waste Volume & Weight Estimation — OrbitClean 2.0

Formula: weight_tonnes = area_sqm × depth_m × fill_factor × density
Uses BBMP composition: 64% wet, 28% dry, 3% sanitary, 6% reject

Truck capacity (BBMP real specs from SWM 2026 documents):
  - Auto Tipper: 500 kg (door-to-door, 1 per 750 households)
  - Small Compactor: 5 tonne min (blue, dry waste)
  - Large Compactor: 10 tonne min (green, wet waste)
"""

import math

# Depth estimates by waste type (metres) — illegal surface dumps, not landfills
DEPTH = {
    "Wet/Green": 0.08,
    "Dry/Blue": 0.12,
    "Sanitary/Red": 0.06,
    "Hazardous/Black": 0.08,
    "Mixed": 0.10,
}

# Bulk density (tonnes / m³)
DENSITY = {
    "Wet/Green": 0.55,
    "Dry/Blue": 0.15,
    "Sanitary/Red": 0.30,
    "Hazardous/Black": 0.60,
    "Mixed": 0.45,
}

FILL_FACTOR = 0.7

# BBMP composition (citywide averages)
COMPOSITION = {"wet": 0.64, "dry": 0.28, "sanitary": 0.03, "reject": 0.06}

# BBMP vehicle capacities
AUTO_TIPPER_CAPACITY_KG = 500
SMALL_COMPACTOR_CAPACITY_T = 5   # blue, dry waste
LARGE_COMPACTOR_CAPACITY_T = 10  # green, wet waste


def estimate(area_sqm: float, waste_type: str = "Mixed") -> dict:
    """Estimate volume and weight for a single dump site."""
    depth = DEPTH.get(waste_type, DEPTH["Mixed"])
    density = DENSITY.get(waste_type, DENSITY["Mixed"])
    volume_m3 = round(area_sqm * depth * FILL_FACTOR, 2)
    weight_tonnes = round(volume_m3 * density, 3)
    return {
        "area_sqm": area_sqm,
        "waste_type": waste_type,
        "depth_m": depth,
        "fill_factor": FILL_FACTOR,
        "density_t_per_m3": density,
        "volume_m3": volume_m3,
        "weight_tonnes": weight_tonnes,
        "weight_kg": round(weight_tonnes * 1000, 1),
    }


def ward_total(dumps: list) -> dict:
    """
    Compute total waste weight for a list of dump features (GeoJSON-style or dict).
    Returns per-site weights + total + trucks needed.
    """
    per_site = []
    total_weight = 0.0

    for dump in dumps:
        # Support both GeoJSON features and flat dicts
        if "properties" in dump:
            p = dump["properties"]
        else:
            p = dump

        area = p.get("area_sqm", 100)
        wtype = p.get("waste_type", p.get("swm_stream", "Mixed"))
        # Normalise common labels
        if wtype in DEPTH:
            pass
        elif "wet" in wtype.lower() or "organic" in wtype.lower():
            wtype = "Wet/Green"
        elif "dry" in wtype.lower() or "recyclable" in wtype.lower():
            wtype = "Dry/Blue"
        elif "hazard" in wtype.lower():
            wtype = "Hazardous/Black"
        elif "sanitary" in wtype.lower():
            wtype = "Sanitary/Red"
        else:
            wtype = "Mixed"

        est = estimate(area, wtype)
        site_id = p.get("id", p.get("name", "unknown"))
        per_site.append({
            "id": site_id,
            "name": p.get("name", site_id),
            **est,
        })
        total_weight += est["weight_tonnes"]

    total_weight = round(total_weight, 3)
    trucks_needed = math.ceil((total_weight * 1000) / AUTO_TIPPER_CAPACITY_KG)

    return {
        "total_weight_tonnes": total_weight,
        "total_weight_kg": round(total_weight * 1000, 1),
        "per_site": per_site,
        "trucks_needed": {
            "auto_tipper_500kg": trucks_needed,
            "note": f"{trucks_needed} trips × 500 kg Auto Tipper = {trucks_needed * 500} kg capacity",
        },
        "bbmp_context": {
            "citywide_tpd": 5700,
            "composition": COMPOSITION,
            "processing_capacity_tpd": 2900,
            "processing_utilised_tpd": 1150,
            "underutilisation_pct": 60,
        },
    }
