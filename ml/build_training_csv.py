"""
Build training CSV from OSM shapefiles + Thanisandra grid.
Replaces the QGIS distance computation steps.

Usage:
    python ml/build_training_csv.py
"""

import json
import csv
import os
import math

try:
    import geopandas as gpd
    HAS_GPD = True
except ImportError:
    HAS_GPD = False

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False


def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return 2 * R * math.asin(math.sqrt(a))


def min_dist_to_layer(lat, lon, coords_list):
    """Minimum haversine distance from (lat,lon) to any point in coords_list."""
    if not coords_list:
        return 9999.0
    return min(haversine_m(lat, lon, c[0], c[1]) for c in coords_list)


def extract_coords(shp_path):
    """Extract (lat, lon) pairs from any shapefile using geopandas."""
    if not HAS_GPD:
        return []
    try:
        gdf = gpd.read_file(shp_path)
        gdf = gdf.to_crs("EPSG:4326")
        coords = []
        for geom in gdf.geometry:
            if geom is None:
                continue
            if geom.geom_type == 'Point':
                coords.append((geom.y, geom.x))
            elif geom.geom_type == 'MultiPoint':
                for pt in geom.geoms:
                    coords.append((pt.y, pt.x))
            elif geom.geom_type in ('LineString', 'MultiLineString'):
                # Sample vertices along the line
                if geom.geom_type == 'LineString':
                    lines = [geom]
                else:
                    lines = list(geom.geoms)
                for line in lines:
                    pts = list(line.coords)
                    # Sample every 5th point to keep it fast
                    for pt in pts[::5]:
                        coords.append((pt[1], pt[0]))
            elif geom.geom_type in ('Polygon', 'MultiPolygon'):
                coords.append((geom.centroid.y, geom.centroid.x))
        print(f"  Loaded {len(coords)} coordinate samples from {os.path.basename(shp_path)}")
        return coords
    except Exception as e:
        print(f"  [WARN] Could not read {shp_path}: {e}")
        return []


def generate_grid(lat_min, lat_max, lon_min, lon_max, step=0.001):
    grid = []
    lat = lat_min
    while lat < lat_max:
        lon = lon_min
        while lon < lon_max:
            grid.append((round(lat, 6), round(lon, 6)))
            lon += step
        lat += step
    return grid


def main():
    base = "/Users/saipranav/Documents/GitHub/AWI-SpaceTech-Hackathon"
    data = os.path.join(base, "data")
    out_csv = os.path.join(data, "thanisandra_training_features.csv")

    print("[BUILD] Loading OSM layers...")

    # Try geopandas first, fall back to synthetic
    road_coords   = extract_coords(os.path.join(data, "osm_roads.shp"))
    market_coords = extract_coords(os.path.join(data, "osm_markets.shp"))

    if not road_coords:
        print("[WARN] osm_roads.shp not readable — using synthetic road distances")
    if not market_coords:
        print("[WARN] osm_markets.shp not readable — using synthetic market distances")

    # Known dump zones for labelling
    dump_zones = [
        (13.0563, 77.6297), (13.0510, 77.5975), (13.0715, 77.6190),
        (13.0565, 77.6292), (13.1012, 77.5985), (13.0712, 77.6192),
    ]

    # Load existing dump geojson for additional labels
    dump_geojson = os.path.join(data, "thanisandra_dumps.geojson")
    if os.path.exists(dump_geojson):
        with open(dump_geojson) as f:
            dj = json.load(f)
        for ft in dj['features']:
            if ft['geometry']['type'] == 'Point':
                c = ft['geometry']['coordinates']
                dump_zones.append((c[1], c[0]))
        print(f"[BUILD] Using {len(dump_zones)} known dump locations for labels")

    print("[BUILD] Generating 100m grid over Thanisandra...")
    grid = generate_grid(13.048, 13.070, 77.618, 77.642, step=0.001)
    print(f"[BUILD] {len(grid)} grid cells")

    import random
    random.seed(42)

    rows = []
    for i, (lat, lon) in enumerate(grid):
        if i % 50 == 0:
            print(f"  Processing cell {i}/{len(grid)}...", end='\r')

        # Distance to nearest road
        if road_coords:
            dist_road = min_dist_to_layer(lat, lon, road_coords)
        else:
            dist_road = max(5.0, random.expovariate(1/80))

        # Distance to nearest market
        if market_coords:
            dist_market = min_dist_to_layer(lat, lon, market_coords)
        else:
            dist_market = max(100.0, random.expovariate(1/800))

        # Proximity to known dump zones
        dist_to_dumps = [haversine_m(lat, lon, dz[0], dz[1]) for dz in dump_zones]
        min_dump_dist = min(dist_to_dumps)
        prox = max(0, 1 - min_dump_dist / 1000)

        # Synthetic features for columns we can't get from OSM alone
        dist_collection = max(50.0, random.expovariate(1/400) + prox * 200)
        hist_dump_density = int(max(0, random.gauss(prox * 4, 1)))
        pop_density = round(random.uniform(0.3, 0.9), 3)
        land_use = random.choices([0, 1, 2, 3, 4], weights=[15, 40, 20, 15, 10])[0]
        night_light = round(max(0.05, random.betavariate(2, 5) - prox * 0.1), 3)
        dist_water = max(20.0, random.expovariate(1/1000))

        # Label: positive if within 150m of a known dump site
        near_dump = min_dump_dist < 150
        heuristic = (
            dist_road < 50 and
            dist_collection > 400 and
            hist_dump_density >= 2 and
            night_light < 0.3
        )
        is_dump = 1 if (near_dump or heuristic) else 0

        rows.append({
            'cell_id':                   f"CELL-{i+1:04d}",
            'lat':                       lat,
            'lon':                       lon,
            'dist_road_m':               round(dist_road, 1),
            'dist_collection_m':         round(dist_collection, 1),
            'hist_dump_density':         hist_dump_density,
            'population_density_proxy':  pop_density,
            'land_use_encoded':          land_use,
            'dist_market_m':             round(dist_market, 1),
            'night_light_idx':           night_light,
            'dist_water_m':              round(dist_water, 1),
            'is_dump':                   is_dump,
        })

    print(f"\n[BUILD] Writing {len(rows)} rows to {out_csv}...")
    fieldnames = list(rows[0].keys())
    with open(out_csv, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    pos = sum(r['is_dump'] for r in rows)
    print(f"[BUILD] Done. {pos} positive (dump) cells, {len(rows)-pos} negative.")
    print(f"[BUILD] Saved → {out_csv}")
    print(f"\nNext: python ml/risk_predictor.py --real-data {out_csv}")


if __name__ == "__main__":
    main()
