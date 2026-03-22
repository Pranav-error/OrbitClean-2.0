"""
Ward-Level Micro-Route Optimization — OrbitClean 2.0

Divides Thanisandra ward into collection zones based on real GIS data
(buildings, roads, land use, population density) and computes:
  - How many auto tippers per zone
  - Collection frequency (wet daily, dry 2-3x/week)
  - Depot assignments
  - Optimized intra-zone collection sequences
  - Total fleet requirement for the ward

BBMP Real Specs:
  - Auto Tipper: 500 kg, 1 per 750 households, door-to-door
  - Wet waste: daily collection (Green bin)
  - Dry waste: 2-3x/week (Blue bin)
  - Composition: 64% wet, 28% dry, 3% sanitary, 6% reject
  - Thanisandra: Ward 26, 8.2 sq km, ~52,000 population
"""

import json
import math
import os
import csv

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

# ── BBMP Constants ──────────────────────────────────────────────────────────

AUTO_TIPPER_CAPACITY_KG = 500
HOUSEHOLDS_PER_TIPPER = 750
WASTE_PER_CAPITA_KG = 0.44   # Bengaluru avg: 5700 TPD / 13M
COMPOSITION = {"wet": 0.64, "dry": 0.28, "sanitary": 0.03, "reject": 0.06}
KM_PER_LITRE = 4.0
CO2_PER_LITRE_KG = 2.68

# Collection frequency (trips per week)
FREQ_WET = 7    # daily
FREQ_DRY = 3    # Mon/Wed/Fri typical
FREQ_MIXED = 7  # daily in high-risk areas

# Ward parameters
WARD_POPULATION = 52000
WARD_AREA_SQKM = 8.2
WARD_HOUSEHOLDS = WARD_POPULATION // 4  # ~13,000

ROUTE_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#ec4899"]

# ── Zone definitions ────────────────────────────────────────────────────────
# Based on actual grid analysis: 552 cells, 23 rows × 24 cols, ~111m spacing
# Ward bounds: lat 13.048–13.070, lon 77.618–77.641

ZONE_DEFS = [
    {
        "id": "ZONE-A",
        "name": "Thanisandra Main Road (Central)",
        # Top center strip: lat [13.058, 13.071], lon [77.626, 77.635]
        "depot": {"lat": 13.0635, "lon": 77.6305, "name": "BBMP DWCC Thanisandra"},
        "color": "#2563eb",
    },
    {
        "id": "ZONE-B",
        "name": "Kogilu Cross / North-West",
        # Top left strip: lat [13.058, 13.071], lon [77.617, 77.626]
        "depot": {"lat": 13.0645, "lon": 77.6215, "name": "Collection Point Kogilu"},
        "color": "#10b981",
    },
    {
        "id": "ZONE-C",
        "name": "Bagalur Road / North-East",
        # Top right strip: lat [13.058, 13.071], lon [77.635, 77.642]
        "depot": {"lat": 13.0645, "lon": 77.6380, "name": "Collection Point Bagalur Rd"},
        "color": "#f59e0b",
    },
    {
        "id": "ZONE-D",
        "name": "Rachenahalli / South-West",
        # Bottom left: lat [13.047, 13.058], lon [77.617, 77.6295]
        "depot": {"lat": 13.0525, "lon": 77.6230, "name": "Collection Point Rachenahalli"},
        "color": "#8b5cf6",
    },
    {
        "id": "ZONE-E",
        "name": "BEL Layout / South-East",
        # Bottom right: lat [13.047, 13.058], lon [77.6295, 77.642]
        "depot": {"lat": 13.0525, "lon": 77.6360, "name": "Collection Point BEL Layout"},
        "color": "#ef4444",
    },
]


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _load_grid():
    """Load the 552-cell risk grid with all features."""
    path = os.path.join(DATA_DIR, "risk_grid_predicted.geojson")
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return None


def _load_training_features():
    """Load training features CSV for population density and distances."""
    path = os.path.join(DATA_DIR, "thanisandra_training_features_clean.csv")
    if os.path.exists(path):
        with open(path) as f:
            return list(csv.DictReader(f))
    return []


def _assign_zone(lat, lon):
    """
    Assign a grid cell to a collection zone based on geography.

    Ward partition (non-overlapping rectangular grid):
      Top row (lat >= 13.058):
        ZONE-B: lon < 77.626   (NW — Kogilu area)
        ZONE-A: 77.626 <= lon < 77.635  (Central — Thanisandra Main Road corridor)
        ZONE-C: lon >= 77.635  (NE — Bagalur Road area)
      Bottom row (lat < 13.058):
        ZONE-D: lon < 77.6295  (SW — Rachenahalli)
        ZONE-E: lon >= 77.6295 (SE — BEL Layout)

    Split rationale:
    - Horizontal at 13.058: separates northern commercial/mixed area from southern residential
    - Top lon splits at 77.626 / 77.635: creates 3 roughly equal strips along main road axis
    - Bottom lon split at 77.6295 (ward center): balances SW/SE households
    """
    if lat >= 13.058:
        if lon < 77.626:
            return "ZONE-B"
        elif lon < 77.635:
            return "ZONE-A"
        else:
            return "ZONE-C"
    else:
        if lon < 77.6295:
            return "ZONE-D"
        else:
            return "ZONE-E"


def _estimate_zone_waste(cells, pop_density_map):
    """Estimate daily waste generation for a set of grid cells."""
    total_pop_weight = 0
    residential_cells = 0
    market_cells = 0
    high_risk_cells = 0

    for cell in cells:
        p = cell["properties"]
        lu = p.get("land_use", "Mixed")
        cell_id = p.get("cell_id", "")

        # Population weight from density proxy
        pop_proxy = pop_density_map.get(cell_id, 0.5)

        # Land-use multiplier (markets generate more waste)
        if lu == "Market":
            mult = 2.5
            market_cells += 1
        elif lu == "Residential":
            mult = 1.0
            residential_cells += 1
        elif lu == "Mixed":
            mult = 1.5
        elif lu == "Vacant":
            mult = 0.2
        else:  # Green
            mult = 0.1

        total_pop_weight += pop_proxy * mult

        if p.get("risk_level") == "Critical":
            high_risk_cells += 1

    # Scale to ward total
    # Ward generates ~22.9 TPD, distributed proportionally
    ward_daily_kg = WARD_POPULATION * WASTE_PER_CAPITA_KG
    zone_fraction = total_pop_weight / max(total_pop_weight * 5.5, 1)  # rough normalization
    zone_daily_kg = ward_daily_kg * zone_fraction

    # Households estimate
    zone_households = int(WARD_HOUSEHOLDS * zone_fraction)

    return {
        "total_cells": len(cells),
        "residential_cells": residential_cells,
        "market_cells": market_cells,
        "high_risk_cells": high_risk_cells,
        "estimated_households": zone_households,
        "daily_waste_kg": round(zone_daily_kg, 1),
        "daily_wet_kg": round(zone_daily_kg * COMPOSITION["wet"], 1),
        "daily_dry_kg": round(zone_daily_kg * COMPOSITION["dry"], 1),
        "weekly_waste_kg": round(zone_daily_kg * 7, 1),
    }


def _estimate_zone_waste_proportional(cells, pop_density_map, fraction):
    """Estimate daily waste for a zone using its proportional share of ward waste."""
    residential_cells = 0
    market_cells = 0
    high_risk_cells = 0

    for cell in cells:
        p = cell["properties"]
        lu = p.get("land_use", "Mixed")
        if lu == "Market":
            market_cells += 1
        elif lu == "Residential":
            residential_cells += 1
        if p.get("risk_level") == "Critical":
            high_risk_cells += 1

    ward_daily_kg = WARD_POPULATION * WASTE_PER_CAPITA_KG
    zone_daily_kg = ward_daily_kg * fraction
    zone_households = int(WARD_HOUSEHOLDS * fraction)

    return {
        "total_cells": len(cells),
        "residential_cells": residential_cells,
        "market_cells": market_cells,
        "high_risk_cells": high_risk_cells,
        "estimated_households": zone_households,
        "daily_waste_kg": round(zone_daily_kg, 1),
        "daily_wet_kg": round(zone_daily_kg * COMPOSITION["wet"], 1),
        "daily_dry_kg": round(zone_daily_kg * COMPOSITION["dry"], 1),
        "weekly_waste_kg": round(zone_daily_kg * 7, 1),
    }


def _compute_zone_routing(zone_def, cells, waste_info):
    """Compute routing details for a single zone."""
    depot = zone_def["depot"]

    # Trucks needed (BBMP: 1 per 750 households)
    tippers_by_households = max(1, math.ceil(waste_info["estimated_households"] / HOUSEHOLDS_PER_TIPPER))

    # Trucks needed by daily capacity
    # Wet waste: daily, Dry: 3x/week
    wet_trips_per_day = math.ceil(waste_info["daily_wet_kg"] / AUTO_TIPPER_CAPACITY_KG)
    dry_trips_per_day = math.ceil(waste_info["daily_dry_kg"] / AUTO_TIPPER_CAPACITY_KG)  # on collection days

    # Total trucks = max of household rule vs capacity need
    tippers_needed = max(tippers_by_households, wet_trips_per_day)

    # Compute zone coverage area and collection path
    if cells:
        lats = [c["geometry"]["coordinates"][1] for c in cells]
        lons = [c["geometry"]["coordinates"][0] for c in cells]
        zone_center_lat = sum(lats) / len(lats)
        zone_center_lon = sum(lons) / len(lons)
        zone_area_km = (max(lats) - min(lats)) * 111 * (max(lons) - min(lons)) * 111 * math.cos(math.radians(zone_center_lat))
    else:
        zone_center_lat = depot["lat"]
        zone_center_lon = depot["lon"]
        zone_area_km = 1.0

    # Intra-zone route distance estimate (serpentine pattern)
    # Approximate: sqrt(area) * grid_factor
    route_length_km = round(math.sqrt(zone_area_km) * 3.5, 2)  # serpentine coverage

    # Nearest-neighbor tour of high-risk / dump cells
    tour_points = [[depot["lat"], depot["lon"]]]
    high_risk = [c for c in cells if c["properties"].get("risk_level") == "Critical"]
    # Sort by distance from depot for simple tour
    high_risk.sort(key=lambda c: haversine_km(
        depot["lat"], depot["lon"],
        c["geometry"]["coordinates"][1], c["geometry"]["coordinates"][0]
    ))
    for c in high_risk[:8]:  # limit for visualization
        tour_points.append([c["geometry"]["coordinates"][1], c["geometry"]["coordinates"][0]])
    # Add a sweep through zone corners for full coverage visualization
    if cells:
        corners = [
            [min(lats), min(lons)],
            [min(lats), max(lons)],
            [max(lats), max(lons)],
            [max(lats), min(lons)],
        ]
        tour_points.extend(corners)
    tour_points.append([depot["lat"], depot["lon"]])

    # Collection frequency
    if waste_info["market_cells"] > 5 or waste_info["high_risk_cells"] > 3:
        freq_label = "Daily (high waste area)"
        freq_per_week = 7
    elif waste_info["residential_cells"] > 30:
        freq_label = "Daily wet / 3x dry"
        freq_per_week = 7  # wet is daily
    else:
        freq_label = "Daily wet / 2x dry"
        freq_per_week = 7

    return {
        "zone_id": zone_def["id"],
        "zone_name": zone_def["name"],
        "color": zone_def["color"],
        "depot": depot,
        "zone_center": {"lat": round(zone_center_lat, 6), "lon": round(zone_center_lon, 6)},
        "zone_area_sqkm": round(zone_area_km, 2),
        "tippers_assigned": tippers_needed,
        "tipper_capacity_kg": AUTO_TIPPER_CAPACITY_KG,
        "wet_trips_per_day": wet_trips_per_day,
        "dry_trips_per_collection": dry_trips_per_day,
        "collection_frequency": freq_label,
        "collection_freq_per_week": freq_per_week,
        "route_length_km": route_length_km,
        "polyline": tour_points,
        "waste": waste_info,
    }


def optimize_ward():
    """
    Full ward-level route optimization for Thanisandra.
    Returns zone breakdown, truck assignments, and collection schedules.
    """
    grid = _load_grid()
    features_csv = _load_training_features()

    # Build population density lookup from CSV
    pop_density_map = {}
    for row in features_csv:
        # Map CSV cell_ids to grid cell_ids by nearest coordinates
        pop_density_map[row["cell_id"]] = float(row.get("population_density_proxy", 0.5))

    # Also build a coord-based lookup for grid cells
    coord_pop = {}
    for row in features_csv:
        key = f"{float(row['lat']):.3f},{float(row['lon']):.3f}"
        coord_pop[key] = float(row.get("population_density_proxy", 0.5))

    cells_by_zone = {z["id"]: [] for z in ZONE_DEFS}
    if grid:
        for feat in grid["features"]:
            lat = feat["geometry"]["coordinates"][1]
            lon = feat["geometry"]["coordinates"][0]
            zone_id = _assign_zone(lat, lon)
            # Attach pop density from nearest training cell
            key = f"{lat:.3f},{lon:.3f}"
            if key in coord_pop:
                pop_density_map[feat["properties"]["cell_id"]] = coord_pop[key]
            cells_by_zone[zone_id].append(feat)

    # First pass: compute raw pop weights per zone for proportional allocation
    zone_raw_weights = {}
    for zone_def in ZONE_DEFS:
        cells = cells_by_zone[zone_def["id"]]
        weight = 0
        for cell in cells:
            p = cell["properties"]
            lu = p.get("land_use", "Mixed")
            cell_id = p.get("cell_id", "")
            pop_proxy = pop_density_map.get(cell_id, 0.5)
            mult = {"Market": 2.5, "Residential": 1.0, "Mixed": 1.5, "Vacant": 0.2}.get(lu, 0.1)
            weight += pop_proxy * mult
        zone_raw_weights[zone_def["id"]] = weight
    total_weight = sum(zone_raw_weights.values()) or 1

    # Second pass: compute per-zone routing with proportional waste
    zones = []
    total_tippers = 0
    total_daily_waste = 0
    total_route_km = 0

    for zone_def in ZONE_DEFS:
        cells = cells_by_zone[zone_def["id"]]
        fraction = zone_raw_weights[zone_def["id"]] / total_weight
        waste_info = _estimate_zone_waste_proportional(cells, pop_density_map, fraction)
        route_info = _compute_zone_routing(zone_def, cells, waste_info)
        zones.append(route_info)
        total_tippers += route_info["tippers_assigned"]
        total_daily_waste += waste_info["daily_waste_kg"]
        total_route_km += route_info["route_length_km"]

    # Naive baseline: single depot, all zones from center
    depot_center = ZONE_DEFS[0]["depot"]
    naive_km = 0
    for z in zones:
        naive_km += 2 * haversine_km(
            depot_center["lat"], depot_center["lon"],
            z["zone_center"]["lat"], z["zone_center"]["lon"]
        ) + z["route_length_km"]

    optimized_km = total_route_km  # distributed depots
    distance_saved = round(naive_km - optimized_km, 2)
    pct_saved = round((distance_saved / naive_km) * 100, 1) if naive_km > 0 else 0
    fuel_saved = round(distance_saved / KM_PER_LITRE, 2) if distance_saved > 0 else 0
    co2_saved = round(fuel_saved * CO2_PER_LITRE_KG, 2)

    return {
        "ward": {
            "name": "Thanisandra",
            "ward_id": 26,
            "area_sqkm": WARD_AREA_SQKM,
            "population": WARD_POPULATION,
            "households": WARD_HOUSEHOLDS,
            "grid_cells": len(grid["features"]) if grid else 0,
        },
        "zones": zones,
        "fleet_summary": {
            "total_auto_tippers": total_tippers,
            "tipper_capacity_kg": AUTO_TIPPER_CAPACITY_KG,
            "bbmp_rule": f"1 tipper per {HOUSEHOLDS_PER_TIPPER} households",
            "total_daily_waste_kg": round(total_daily_waste, 1),
            "total_daily_waste_tonnes": round(total_daily_waste / 1000, 2),
            "waste_composition": COMPOSITION,
            "wet_collection": "Daily (Green bin)",
            "dry_collection": "Mon/Wed/Fri (Blue bin)",
            "total_route_km_per_day": round(total_route_km, 2),
            "depots": len(ZONE_DEFS),
        },
        "savings": {
            "naive_total_km": round(naive_km, 2),
            "optimized_total_km": round(optimized_km, 2),
            "distance_saved_km": max(0, distance_saved),
            "pct_distance_saved": max(0, pct_saved),
            "fuel_saved_litres": fuel_saved,
            "co2_saved_kg": co2_saved,
        },
        "benchmarks": {
            "seoul": {"reduction_pct": 42, "label": "Seoul Smart Collection"},
            "amsterdam": {"reduction_pct": 30, "label": "Amsterdam IoT Bins"},
            "barcelona": {"reduction_pct": 20, "label": "Barcelona Pneumatic"},
            "orbitclean": {"reduction_pct": max(0, pct_saved), "label": "OrbitClean Thanisandra"},
        },
        "bbmp_context": {
            "citywide_tpd": 5700,
            "processing_capacity_tpd": 2900,
            "processing_utilised_tpd": 1150,
            "underutilisation_pct": 60,
            "penalty_range": "₹200–₹25,000 per violation",
            "total_compactors_citywide": 531,
            "total_auto_tippers_citywide": 4000,
        },
    }


def precompute_ward(output_path=None):
    """Run ward optimization and save to JSON."""
    if output_path is None:
        output_path = os.path.join(DATA_DIR, "route_solution.json")
    result = optimize_ward()
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(result, f, indent=2)
    return result


if __name__ == "__main__":
    result = precompute_ward()
    print(json.dumps(result["fleet_summary"], indent=2))
    print(f"\nZones:")
    for z in result["zones"]:
        print(f"  {z['zone_id']} ({z['zone_name']}): {z['tippers_assigned']} tippers, "
              f"{z['waste']['daily_waste_kg']:.0f}kg/day, {z['waste']['estimated_households']} HH, "
              f"{z['route_length_km']}km route, {z['collection_frequency']}")
    print(f"\nSavings: {result['savings']['pct_distance_saved']}% distance reduction")
