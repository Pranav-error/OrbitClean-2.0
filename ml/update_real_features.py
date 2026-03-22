"""
Update training CSV with real population_density_proxy and land_use_encoded
from OSM building and landuse shapefiles.

Usage:
    python ml/update_real_features.py
"""

import csv
import math
import os

try:
    import geopandas as gpd
    from shapely.geometry import Point
    HAS_GPD = True
except ImportError:
    HAS_GPD = False

BASE = "/Users/saipranav/Documents/GitHub/AWI-SpaceTech-Hackathon"
DATA = os.path.join(BASE, "data")

# OSM landuse → encoded integer
LANDUSE_MAP = {
    'vacant':          4, 'brownfield':    4, 'greenfield':   4,
    'retail':          3, 'commercial':    2, 'industrial':   2,
    'marketplace':     3, 'market':        3,
    'residential':     1, 'apartments':    1,
    'grass':           0, 'park':          0, 'forest':       0,
    'recreation_ground': 0, 'allotments':  0, 'cemetery':     0,
    'farmland':        0, 'meadow':        0,
    'construction':    4,  # construction = high risk (like vacant)
}


def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin(math.radians(lat2 - lat1) / 2) ** 2 +
         math.cos(phi1) * math.cos(phi2) *
         math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(a))


def load_building_centroids(shp_path):
    """Return list of (lat, lon) for all buildings."""
    if not HAS_GPD:
        return []
    try:
        gdf = gpd.read_file(shp_path).to_crs("EPSG:4326")
        coords = []
        for geom in gdf.geometry:
            if geom is None:
                continue
            c = geom.centroid
            coords.append((c.y, c.x))
        print(f"  Loaded {len(coords)} buildings from {os.path.basename(shp_path)}")
        return coords
    except Exception as e:
        print(f"  [WARN] Could not read buildings: {e}")
        return []


def load_landuse_polygons(shp_path):
    """Return GeoDataFrame of landuse polygons with 'landuse' column."""
    if not HAS_GPD:
        return None
    try:
        gdf = gpd.read_file(shp_path).to_crs("EPSG:4326")
        print(f"  Loaded {len(gdf)} landuse polygons")
        print(f"  Landuse types: {gdf['landuse'].value_counts().to_dict() if 'landuse' in gdf.columns else 'no landuse column'}")
        return gdf
    except Exception as e:
        print(f"  [WARN] Could not read landuse: {e}")
        return None


def encode_landuse_for_point(lat, lon, landuse_gdf):
    """Find which landuse polygon contains this point, return encoded int."""
    if landuse_gdf is None:
        return None
    pt = Point(lon, lat)
    # Try multiple columns QuickOSM may use
    for _, row in landuse_gdf.iterrows():
        if row.geometry is None:
            continue
        try:
            if not row.geometry.contains(pt):
                continue
        except Exception:
            continue
        # Try landuse → building → amenity → shop columns in order
        for col in ['landuse', 'building', 'amenity', 'shop']:
            val = str(row.get(col, '') or '').lower().strip()
            if val and val != 'none' and val != 'yes':
                encoded = LANDUSE_MAP.get(val, None)
                if encoded is not None:
                    return encoded
                # Broad fallbacks
                if val in ('apartments', 'house', 'residential', 'detached', 'terrace'):
                    return 1
                if val in ('commercial', 'office', 'retail', 'shop', 'supermarket'):
                    return 2
                if val in ('marketplace', 'market', 'wholesale'):
                    return 3
                if val in ('construction', 'ruins', 'vacant'):
                    return 4
        return 1  # polygon found but type unknown → residential default
    return None


def count_buildings_within(lat, lon, building_coords, radius_m=150):
    """Count buildings within radius_m metres of (lat, lon)."""
    return sum(1 for bc in building_coords
               if haversine_m(lat, lon, bc[0], bc[1]) < radius_m)


def main():
    csv_path = os.path.join(DATA, "thanisandra_training_features.csv")
    buildings_shp = os.path.join(DATA, "osm_buildings.shp")
    landuse_shp   = os.path.join(DATA, "osm_landuse.shp")

    print("[UPDATE] Loading OSM shapefiles...")
    building_coords = load_building_centroids(buildings_shp)
    landuse_gdf     = load_landuse_polygons(landuse_shp)

    if not building_coords:
        print("[WARN] No buildings loaded — population_density_proxy stays synthetic")
    if landuse_gdf is None:
        print("[WARN] No landuse loaded — land_use_encoded stays synthetic")

    print(f"[UPDATE] Reading {csv_path}...")
    rows = []
    with open(csv_path) as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        for row in reader:
            rows.append(row)

    updated_pop = 0
    updated_lu  = 0
    max_buildings = max(
        count_buildings_within(float(r['lat']), float(r['lon']), building_coords)
        for r in rows
    ) if building_coords else 1

    for row in rows:
        lat, lon = float(row['lat']), float(row['lon'])

        # population_density_proxy — normalised building count in 150m radius
        if building_coords:
            n_buildings = count_buildings_within(lat, lon, building_coords, radius_m=150)
            row['population_density_proxy'] = round(n_buildings / max(max_buildings, 1), 4)
            updated_pop += 1

        # land_use_encoded — from OSM landuse polygon containment
        if landuse_gdf is not None:
            lu = encode_landuse_for_point(lat, lon, landuse_gdf)
            if lu is not None:
                row['land_use_encoded'] = lu
                updated_lu += 1

    print(f"[UPDATE] population_density_proxy: {updated_pop} cells updated from real buildings")
    print(f"[UPDATE] land_use_encoded: {updated_lu} cells updated from real landuse polygons")

    with open(csv_path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"[UPDATE] Saved → {csv_path}")
    print(f"\nNext: python ml/risk_predictor.py --real-data {csv_path}")


if __name__ == "__main__":
    main()
