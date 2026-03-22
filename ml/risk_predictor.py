"""
ML-2: Illegal Dump Risk Prediction Model (XGBoost)
Scores every 100m grid cell in Thanisandra Ward for dump formation probability.

Usage:
    python risk_predictor.py --ward Thanisandra --output data/risk_grid.geojson
    python risk_predictor.py --demo
    python risk_predictor.py --real-data data/thanisandra_training_features.csv
"""

import numpy as np
import json
import os
import argparse
from datetime import datetime

try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False

try:
    import xgboost as xgb
    HAS_XGB = True
except ImportError:
    HAS_XGB = False

try:
    from sklearn.ensemble import GradientBoostingClassifier
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import roc_auc_score, classification_report
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False

try:
    import osmnx as ox
    HAS_OSM = True
except ImportError:
    HAS_OSM = False


# ---------------------------------------------------------------------------
# Feature schema
# ---------------------------------------------------------------------------

FEATURE_COLUMNS = [
    'dist_road_m',
    'dist_collection_m',
    'hist_dump_density',
    'population_density_proxy',
    'land_use_encoded',
    'dist_market_m',
    'night_light_idx',
    'dist_water_m',
]

LAND_USE_ENCODING = {
    'Vacant': 4, 'Market': 3, 'Commercial': 2,
    'Mixed': 2, 'Residential': 1, 'Green': 0,
}

# Column aliases: maps QGIS export names → internal names
_COLUMN_ALIASES = {
    'population_density': 'population_density_proxy',
    'pop_density':        'population_density_proxy',
    'land_use':           'land_use_encoded',
    'dist_road':          'dist_road_m',
    'dist_collection':    'dist_collection_m',
    'hist_density':       'hist_dump_density',
    'night_light':        'night_light_idx',
    'dist_water':         'dist_water_m',
    'dist_market':        'dist_market_m',
}


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    phi1, phi2 = np.radians(lat1), np.radians(lat2)
    dphi = np.radians(lat2 - lat1)
    dlam = np.radians(lon2 - lon1)
    a = np.sin(dphi/2)**2 + np.cos(phi1)*np.cos(phi2)*np.sin(dlam/2)**2
    return 2 * R * np.arcsin(np.sqrt(a))


def generate_grid(lat_min, lat_max, lon_min, lon_max, cell_size_deg=0.001):
    """Generate 100m grid (≈0.001° at equator) over bounding box."""
    lats = np.arange(lat_min, lat_max, cell_size_deg)
    lons = np.arange(lon_min, lon_max, cell_size_deg)
    return [(lat, lon) for lat in lats for lon in lons]


# ---------------------------------------------------------------------------
# Real-data loader (QGIS CSV export)
# ---------------------------------------------------------------------------

def load_real_data(csv_path):
    """
    Load training features exported from QGIS.

    Expected CSV columns (flexible — aliases accepted):
        cell_id, lat, lon, is_dump,
        dist_road_m, dist_collection_m, hist_dump_density,
        population_density_proxy, land_use_encoded,
        dist_market_m, night_light_idx, dist_water_m

    Returns (feature_dicts, labels_array).
    """
    if not HAS_PANDAS:
        raise ImportError("pandas not installed. Run: pip install pandas")

    print(f"[REAL] Loading QGIS training data from {csv_path}...")
    df = pd.read_csv(csv_path)

    # Normalise column names
    df.columns = [c.strip().lower() for c in df.columns]
    df.rename(columns=_COLUMN_ALIASES, inplace=True)

    # Encode string land_use → integer if needed
    if 'land_use_encoded' in df.columns and df['land_use_encoded'].dtype == object:
        df['land_use_encoded'] = df['land_use_encoded'].map(LAND_USE_ENCODING).fillna(1).astype(int)

    # Fill missing feature columns with synthetic fallback values
    defaults = {
        'dist_road_m':               lambda n: np.random.exponential(80, n).clip(5),
        'dist_collection_m':         lambda n: np.random.exponential(400, n).clip(50),
        'hist_dump_density':         lambda n: np.random.poisson(1.5, n),
        'population_density_proxy':  lambda n: np.random.uniform(0.3, 0.9, n),
        'land_use_encoded':          lambda n: np.random.choice([0,1,2,3,4], n, p=[0.15,0.40,0.20,0.15,0.10]),
        'dist_market_m':             lambda n: np.random.exponential(800, n).clip(100),
        'night_light_idx':           lambda n: np.random.beta(2, 5, n).clip(0.05),
        'dist_water_m':              lambda n: np.random.exponential(1000, n).clip(20),
    }
    for col, gen in defaults.items():
        if col not in df.columns:
            print(f"[REAL] Column '{col}' missing — using synthetic fallback")
            df[col] = gen(len(df))

    # Ensure lat/lon columns
    for coord in ('lat', 'lon'):
        if coord not in df.columns:
            raise ValueError(f"CSV must have a '{coord}' column")

    feature_dicts = df.to_dict(orient='records')

    # Labels
    if 'is_dump' in df.columns:
        y = df['is_dump'].values.astype(int)
        print(f"[REAL] {len(df)} cells loaded — {y.sum()} positive (dump) labels")
    else:
        print("[REAL] 'is_dump' column not found — using heuristic labels")
        y = None

    return feature_dicts, y


# ---------------------------------------------------------------------------
# Feature engineering
# ---------------------------------------------------------------------------

def engineer_features_from_osm(grid_points, ward_name="Thanisandra"):
    """
    Fetch OSM features and compute distances.
    Falls back to synthetic features if osmnx unavailable.
    """
    if not HAS_OSM:
        print("[WARN] osmnx not available, using synthetic features")
        return _synthetic_features(grid_points)

    print(f"[OSM] Fetching road network for {ward_name}...")
    try:
        G = ox.graph_from_place(f"{ward_name}, Bengaluru, India", network_type='drive')
        nodes, edges = ox.graph_to_gdfs(G)
        road_coords = nodes[['y', 'x']].values  # lat, lon
    except Exception as e:
        print(f"[WARN] OSM fetch failed ({e}), using synthetic features")
        return _synthetic_features(grid_points)

    features = []
    for lat, lon in grid_points:
        dists_road = [haversine_km(lat, lon, r[0], r[1])*1000 for r in road_coords[:50]]
        dist_road_m = min(dists_road)
        features.append({
            'lat': lat, 'lon': lon,
            'dist_road_m': dist_road_m,
            'dist_collection_m': np.random.uniform(100, 800),
            'hist_dump_density': np.random.poisson(1.5),
            'population_density_proxy': np.random.uniform(0.3, 0.9),
            'land_use_encoded': np.random.choice([0, 1, 2, 3, 4], p=[0.2, 0.4, 0.2, 0.1, 0.1]),
            'dist_market_m': np.random.uniform(200, 2000),
            'night_light_idx': np.random.uniform(0.05, 0.7),
            'dist_water_m': np.random.uniform(50, 3000),
        })
    return features


def _synthetic_features(grid_points):
    """Realistic synthetic feature generation for demo mode."""
    np.random.seed(42)
    features = []
    for i, (lat, lon) in enumerate(grid_points):
        dump_zones = [(13.0563, 77.6297), (13.0510, 77.5975), (13.0715, 77.6190)]
        min_dump_dist = min(haversine_km(lat, lon, dz[0], dz[1])*1000 for dz in dump_zones)
        proximity_factor = max(0, 1 - min_dump_dist / 1000)

        features.append({
            'lat': lat, 'lon': lon,
            'dist_road_m': max(5, np.random.exponential(80)),
            'dist_collection_m': max(50, np.random.exponential(400) + proximity_factor * 200),
            'hist_dump_density': int(np.random.poisson(proximity_factor * 4)),
            'population_density_proxy': np.random.uniform(0.3, 0.9),
            'land_use_encoded': np.random.choice([0,1,2,3,4], p=[0.15,0.40,0.20,0.15,0.10]),
            'dist_market_m': max(100, np.random.exponential(800)),
            'night_light_idx': max(0.05, np.random.beta(2, 5) + proximity_factor * -0.1),
            'dist_water_m': max(20, np.random.exponential(1000)),
        })
    return features


def features_to_matrix(feature_dicts):
    return np.array([[
        f['dist_road_m'],
        f['dist_collection_m'],
        f['hist_dump_density'],
        f['population_density_proxy'],
        f['land_use_encoded'],
        f['dist_market_m'],
        f['night_light_idx'],
        f['dist_water_m'],
    ] for f in feature_dicts])


def generate_training_labels(feature_dicts, dump_sites_geojson=None):
    """
    Label cells positive if near known dump sites or matching heuristic risk rule.
    """
    if dump_sites_geojson:
        with open(dump_sites_geojson) as f:
            dumps = json.load(f)
        dump_coords = [(ft['geometry']['coordinates'][1], ft['geometry']['coordinates'][0])
                       for ft in dumps['features'] if ft['geometry']['type'] == 'Point']
    else:
        dump_coords = [(13.0563,77.6297),(13.0510,77.5975),(13.0715,77.6190),
                       (13.0565,77.6292),(13.1012,77.5985),(13.0712,77.6192)]

    labels = []
    for f in feature_dicts:
        near_dump = any(
            haversine_km(f['lat'], f['lon'], dc[0], dc[1]) < 0.15
            for dc in dump_coords
        )
        heuristic = (
            f['dist_road_m'] < 50 and
            f['dist_collection_m'] > 400 and
            f['hist_dump_density'] >= 2 and
            f['night_light_idx'] < 0.3
        )
        labels.append(1 if (near_dump or heuristic) else 0)
    return np.array(labels)


# ---------------------------------------------------------------------------
# Model training
# ---------------------------------------------------------------------------

def train_xgboost(X, y):
    if not HAS_XGB and not HAS_SKLEARN:
        raise ImportError("Install xgboost or scikit-learn")

    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    if HAS_XGB:
        model = xgb.XGBClassifier(
            n_estimators=300, max_depth=6, learning_rate=0.05,
            subsample=0.8, colsample_bytree=0.8,
            use_label_encoder=False, eval_metric='logloss',
            random_state=42
        )
        model.fit(X_tr, y_tr, eval_set=[(X_te, y_te)], verbose=False)
    else:
        print("[INFO] xgboost not found, using GradientBoostingClassifier fallback")
        model = GradientBoostingClassifier(n_estimators=200, max_depth=5, random_state=42)
        model.fit(X_tr, y_tr)

    preds = model.predict(X_te)
    proba = model.predict_proba(X_te)[:, 1]
    auc = roc_auc_score(y_te, proba)
    print(f"[MODEL] AUC-ROC: {auc:.4f}")
    print(classification_report(y_te, preds, target_names=['Safe', 'High Risk']))
    return model


# ---------------------------------------------------------------------------
# Inference + output
# ---------------------------------------------------------------------------

def predict_risk(model, X, feature_dicts):
    proba = model.predict_proba(X)[:, 1]
    results = []
    for i, f in enumerate(feature_dicts):
        results.append({
            'lat': f['lat'], 'lon': f['lon'],
            'risk_score': round(float(proba[i]), 4),
            'dist_road_m': round(f['dist_road_m'], 1),
            'dist_collection_m': round(f['dist_collection_m'], 1),
            'hist_dump_density': int(f['hist_dump_density']),
            'night_light_idx': round(f['night_light_idx'], 3),
            'land_use_encoded': int(f['land_use_encoded']),
        })
    return results


def to_geojson(results, ward="Thanisandra"):
    features = []
    lu_map = {v: k for k, v in LAND_USE_ENCODING.items()}
    for r in results:
        rs = r['risk_score']
        risk_level = 'Critical' if rs > 0.8 else 'High' if rs > 0.6 else 'Medium' if rs > 0.4 else 'Low'
        features.append({
            "type": "Feature",
            "properties": {
                "cell_id": f"G{len(features)+1:03d}",
                "risk_score": r['risk_score'],
                "risk_level": risk_level,
                "ward": ward,
                "dist_road_m": r['dist_road_m'],
                "dist_collection_m": r['dist_collection_m'],
                "hist_dump_density": r['hist_dump_density'],
                "night_light_idx": r['night_light_idx'],
                "land_use": lu_map.get(r['land_use_encoded'], 'Unknown'),
                "generated_at": datetime.now().isoformat(),
            },
            "geometry": {"type": "Point", "coordinates": [r['lon'], r['lat']]}
        })
    return {"type": "FeatureCollection", "features": features}


# ---------------------------------------------------------------------------
# Run modes
# ---------------------------------------------------------------------------

def run_demo(output_path="data/risk_grid_predicted.geojson"):
    print("[DEMO] Running XGBoost risk predictor for Thanisandra Ward...")

    grid = generate_grid(13.048, 13.070, 77.618, 77.642, cell_size_deg=0.002)
    print(f"[DEMO] Grid cells: {len(grid)}")

    features = _synthetic_features(grid)
    X = features_to_matrix(features)
    y = generate_training_labels(features)

    print(f"[DEMO] Training XGBoost: {y.sum()} positive, {(1-y).sum()} negative")
    model = train_xgboost(X, y)

    results = predict_risk(model, X, features)
    geojson = to_geojson(results)
    geojson['features'] = [f for f in geojson['features'] if f['properties']['risk_score'] > 0.3]

    os.makedirs("data", exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(geojson, f, indent=2)

    high_risk = sum(1 for r in results if r['risk_score'] > 0.7)
    print(f"[DEMO] {high_risk} high-risk cells (P>0.7). Saved → {output_path}")
    return geojson


def run_real_data(csv_path, output_path="data/risk_grid_predicted.geojson", ward="Thanisandra"):
    """
    Train and predict using real QGIS-exported features.
    Falls back to synthetic labels if CSV has no is_dump column.
    """
    feature_dicts, y = load_real_data(csv_path)

    X = features_to_matrix(feature_dicts)

    if y is None:
        print("[REAL] Generating heuristic labels from feature values...")
        y = generate_training_labels(feature_dicts)

    # Guard against degenerate label sets
    pos = y.sum()
    neg = (y == 0).sum()
    if pos < 2 or neg < 2:
        print(f"[REAL] Warning: only {pos} positive and {neg} negative samples — "
              "adding synthetic examples for training stability")
        # Augment with synthetic samples from known dump zones
        syn_grid = generate_grid(13.048, 13.070, 77.618, 77.642, cell_size_deg=0.003)
        syn_feats = _synthetic_features(syn_grid)
        syn_y     = generate_training_labels(syn_feats)
        feature_dicts = feature_dicts + syn_feats
        X = features_to_matrix(feature_dicts)
        y = np.concatenate([y, syn_y])
        print(f"[REAL] Augmented to {y.sum()} positive, {(y==0).sum()} negative samples")

    print(f"[REAL] Training XGBoost: {y.sum()} positive, {(y==0).sum()} negative")
    model = train_xgboost(X, y)

    results = predict_risk(model, X, feature_dicts)
    geojson = to_geojson(results, ward)
    # Keep ALL cells so the full ward risk gradient is visible on the dashboard

    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(geojson, f, indent=2)

    high_risk = sum(1 for r in results if r['risk_score'] > 0.7)
    print(f"[REAL] {high_risk} high-risk cells (P>0.7). Saved → {output_path}")
    return geojson


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="OrbitClean Risk Predictor")
    parser.add_argument("--ward",      default="Thanisandra")
    parser.add_argument("--demo",      action="store_true")
    parser.add_argument("--real-data", dest="real_data",
                        help="Path to QGIS-exported CSV with real features")
    parser.add_argument("--dumps",     help="Path to known dump sites GeoJSON for labels")
    parser.add_argument("--output",    default="data/risk_grid_predicted.geojson")
    args = parser.parse_args()

    if args.real_data:
        run_real_data(args.real_data, args.output, args.ward)
        return

    if args.demo:
        run_demo(args.output)
        return

    # Default: try OSM → fall back to synthetic
    grid = generate_grid(13.048, 13.070, 77.618, 77.642)
    features = engineer_features_from_osm(grid, args.ward)
    X = features_to_matrix(features)
    y = generate_training_labels(features, args.dumps)
    model = train_xgboost(X, y)
    results = predict_risk(model, X, features)
    geojson = to_geojson(results, args.ward)

    os.makedirs(os.path.dirname(args.output) if os.path.dirname(args.output) else ".", exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(geojson, f, indent=2)
    print(f"[INFO] Saved risk grid → {args.output}")


if __name__ == "__main__":
    main()
