"""
QGIS Bridge — CSV Validator and Normalizer
Validates and normalises the CSV exported from QGIS before feeding it
into risk_predictor.py or dump_detector.py.

Usage:
    python ml/qgis_bridge.py --input data/thanisandra_training_features.csv
    python ml/qgis_bridge.py --input data/thanisandra_training_features.csv --output data/features_clean.csv
    python ml/qgis_bridge.py --schema   # print expected column schema
"""

import sys
import os
import json
import argparse
from datetime import datetime

try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    import math
    HAS_NUMPY = False


# ---------------------------------------------------------------------------
# Schema definition
# ---------------------------------------------------------------------------

REQUIRED_COLUMNS = ['lat', 'lon']

FEATURE_SCHEMA = {
    # column_name: (dtype, min_val, max_val, synthetic_fallback_description)
    'lat':                        ('float',  12.0,   14.0,   'Thanisandra centroid ≈ 13.059'),
    'lon':                        ('float',  77.0,   78.0,   'Thanisandra centroid ≈ 77.630'),
    'dist_road_m':                ('float',  0.0,    5000.0, 'exponential(80), min=5'),
    'dist_collection_m':          ('float',  0.0,    5000.0, 'exponential(400), min=50'),
    'hist_dump_density':          ('int',    0,      20,     'poisson(1.5)'),
    'population_density_proxy':   ('float',  0.0,    1.0,    'uniform(0.3, 0.9)'),
    'land_use_encoded':           ('int',    0,      4,      '0=Green,1=Residential,2=Commercial/Mixed,3=Market,4=Vacant'),
    'dist_market_m':              ('float',  0.0,    10000.0,'exponential(800), min=100'),
    'night_light_idx':            ('float',  0.0,    1.0,    'beta(2,5), min=0.05'),
    'dist_water_m':               ('float',  0.0,    20000.0,'exponential(1000), min=20'),
    'is_dump':                    ('int',    0,      1,      'binary label — 1=dump,0=clean (OPTIONAL)'),
}

COLUMN_ALIASES = {
    # QGIS export name → internal name
    'population_density': 'population_density_proxy',
    'pop_density':         'population_density_proxy',
    'pop':                 'population_density_proxy',
    'land_use':            'land_use_encoded',
    'landuse':             'land_use_encoded',
    'lu_encoded':          'land_use_encoded',
    'dist_road':           'dist_road_m',
    'road_dist':           'dist_road_m',
    'dist_collection':     'dist_collection_m',
    'collection_dist':     'dist_collection_m',
    'hist_density':        'hist_dump_density',
    'dump_density':        'hist_dump_density',
    'night_light':         'night_light_idx',
    'nl_idx':              'night_light_idx',
    'viirs':               'night_light_idx',
    'dist_water':          'dist_water_m',
    'water_dist':          'dist_water_m',
    'dist_market':         'dist_market_m',
    'market_dist':         'dist_market_m',
    'dump':                'is_dump',
    'label':               'is_dump',
    'y':                   'is_dump',
    'latitude':            'lat',
    'longitude':           'lon',
    'x':                   'lon',
}

LAND_USE_ENCODING = {
    'vacant':       4, 'Vacant':       4,
    'market':       3, 'Market':       3,
    'commercial':   2, 'Commercial':   2,
    'mixed':        2, 'Mixed':        2,
    'residential':  1, 'Residential':  1,
    'green':        0, 'Green':        0,
    'park':         0, 'Park':         0,
    'industrial':   2, 'Industrial':   2,
}


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

def _rng(seed=42):
    if HAS_NUMPY:
        return lambda *args, **kwargs: None  # numpy used directly
    return None


def _synthetic_value(col, n, seed=42):
    """Generate fallback synthetic values for a column."""
    if HAS_NUMPY:
        np.random.seed(seed)
        if col == 'dist_road_m':
            return np.random.exponential(80, n).clip(5)
        if col == 'dist_collection_m':
            return np.random.exponential(400, n).clip(50)
        if col == 'hist_dump_density':
            return np.random.poisson(1.5, n).astype(int)
        if col == 'population_density_proxy':
            return np.random.uniform(0.3, 0.9, n)
        if col == 'land_use_encoded':
            return np.random.choice([0,1,2,3,4], n, p=[0.15,0.40,0.20,0.15,0.10])
        if col == 'dist_market_m':
            return np.random.exponential(800, n).clip(100)
        if col == 'night_light_idx':
            return np.random.beta(2, 5, n).clip(0.05)
        if col == 'dist_water_m':
            return np.random.exponential(1000, n).clip(20)
    # numpy not available — constant fallback
    defaults = {
        'dist_road_m': 80.0, 'dist_collection_m': 400.0,
        'hist_dump_density': 1, 'population_density_proxy': 0.6,
        'land_use_encoded': 1, 'dist_market_m': 800.0,
        'night_light_idx': 0.2, 'dist_water_m': 500.0,
    }
    return [defaults.get(col, 0)] * n


def validate_and_clean(df, verbose=True):
    """
    1. Normalise column names (aliases → canonical)
    2. Encode string land_use → int
    3. Fill missing feature columns with synthetic fallback
    4. Clip values to valid range
    5. Report statistics

    Returns cleaned DataFrame and a dict of validation issues.
    """
    issues = {}

    # 1. Normalise column names
    df.columns = [c.strip().lower() for c in df.columns]
    df.rename(columns=COLUMN_ALIASES, inplace=True)

    # 2. Encode string land_use
    if 'land_use_encoded' in df.columns and df['land_use_encoded'].dtype == object:
        original = df['land_use_encoded'].copy()
        df['land_use_encoded'] = df['land_use_encoded'].map(LAND_USE_ENCODING)
        unmapped = original[df['land_use_encoded'].isna()].unique().tolist()
        if unmapped:
            issues['land_use_unmapped'] = unmapped
            if verbose:
                print(f"[WARN] Unmapped land_use values (defaulting to 1=Residential): {unmapped}")
        df['land_use_encoded'] = df['land_use_encoded'].fillna(1).astype(int)

    # 3. Check required columns
    for col in REQUIRED_COLUMNS:
        if col not in df.columns:
            issues[f'missing_required_{col}'] = True
            raise ValueError(f"Required column '{col}' not found in CSV. "
                             f"Available: {list(df.columns)}")

    # 4. Fill missing feature columns
    n = len(df)
    for col in FEATURE_SCHEMA:
        if col in REQUIRED_COLUMNS or col == 'is_dump':
            continue
        if col not in df.columns:
            issues[f'missing_{col}'] = 'filled_with_synthetic'
            if verbose:
                print(f"[FILL] '{col}' missing → synthetic fallback")
            df[col] = _synthetic_value(col, n)
        elif df[col].isna().any():
            na_count = df[col].isna().sum()
            issues[f'nan_{col}'] = int(na_count)
            if verbose:
                print(f"[FILL] '{col}' has {na_count} NaN values → median imputation")
            df[col] = df[col].fillna(df[col].median())

    # 5. Clip to valid range
    for col, (dtype, lo, hi, _) in FEATURE_SCHEMA.items():
        if col not in df.columns:
            continue
        try:
            df[col] = df[col].astype(float if dtype == 'float' else int)
            clipped = ((df[col] < lo) | (df[col] > hi)).sum()
            if clipped > 0:
                issues[f'clipped_{col}'] = int(clipped)
                if verbose:
                    print(f"[CLIP] '{col}': {clipped} values outside [{lo}, {hi}] — clipping")
            df[col] = df[col].clip(lo, hi)
            if dtype == 'int':
                df[col] = df[col].astype(int)
        except Exception as e:
            issues[f'type_error_{col}'] = str(e)

    return df, issues


def print_schema():
    """Print expected CSV column schema."""
    print("\n=== QGIS Bridge — Expected CSV Schema ===\n")
    print(f"{'Column':<30} {'Type':<8} {'Range':<18} Notes")
    print("-" * 85)
    for col, (dtype, lo, hi, note) in FEATURE_SCHEMA.items():
        req = " (REQUIRED)" if col in REQUIRED_COLUMNS else ""
        print(f"{col:<30} {dtype:<8} [{lo:.0f}, {hi:.0f}]{'':<10} {note}{req}")
    print("\nAliases accepted for column names:")
    for alias, canonical in sorted(COLUMN_ALIASES.items()):
        print(f"  {alias} → {canonical}")


def print_stats(df, issues):
    """Print summary statistics for the cleaned DataFrame."""
    print(f"\n=== Dataset Summary ===")
    print(f"  Rows: {len(df)}")
    print(f"  Columns: {list(df.columns)}")
    if 'is_dump' in df.columns:
        pos = df['is_dump'].sum()
        print(f"  Positive (dump) labels: {int(pos)} ({100*pos/len(df):.1f}%)")
        print(f"  Negative (clean) labels: {int(len(df)-pos)}")
    if issues:
        print(f"\n  Validation issues:")
        for k, v in issues.items():
            print(f"    {k}: {v}")
    else:
        print("  No validation issues.")

    print("\n  Feature stats:")
    for col in FEATURE_SCHEMA:
        if col in df.columns and col not in ('lat', 'lon', 'is_dump'):
            try:
                print(f"    {col:<30} mean={df[col].mean():.3f}  std={df[col].std():.3f}  "
                      f"min={df[col].min():.3f}  max={df[col].max():.3f}")
            except Exception:
                pass


# ---------------------------------------------------------------------------
# Synthetic sample generator (for testing without QGIS)
# ---------------------------------------------------------------------------

def generate_synthetic_csv(output_path, n_cells=200, n_dumps=25, seed=42):
    """
    Generate a synthetic QGIS-format training CSV for testing.
    Useful when QGIS is not available but you want to test the pipeline.
    """
    if not HAS_NUMPY or not HAS_PANDAS:
        print("[ERROR] numpy and pandas required to generate synthetic CSV")
        return

    np.random.seed(seed)

    # Thanisandra grid
    lat_min, lat_max = 13.048, 13.070
    lon_min, lon_max = 77.618, 77.642
    lats = np.random.uniform(lat_min, lat_max, n_cells)
    lons = np.random.uniform(lon_min, lon_max, n_cells)

    dump_zones = [(13.0563, 77.6297), (13.0510, 77.5975), (13.0715, 77.6190)]

    rows = []
    for i, (lat, lon) in enumerate(zip(lats, lons)):
        min_d = min(
            ((lat - dz[0])**2 + (lon - dz[1])**2)**0.5 * 111
            for dz in dump_zones
        )
        prox = max(0, 1 - min_d / 1.0)
        rows.append({
            'cell_id':                    f"CELL-{i+1:04d}",
            'lat':                        round(float(lat), 6),
            'lon':                        round(float(lon), 6),
            'dist_road_m':                round(float(max(5, np.random.exponential(80))), 1),
            'dist_collection_m':          round(float(max(50, np.random.exponential(400) + prox*200)), 1),
            'hist_dump_density':          int(np.random.poisson(prox * 4)),
            'population_density_proxy':   round(float(np.random.uniform(0.3, 0.9)), 3),
            'land_use_encoded':           int(np.random.choice([0,1,2,3,4], p=[0.15,0.40,0.20,0.15,0.10])),
            'dist_market_m':              round(float(max(100, np.random.exponential(800))), 1),
            'night_light_idx':            round(float(max(0.05, np.random.beta(2,5) - prox*0.1)), 3),
            'dist_water_m':               round(float(max(20, np.random.exponential(1000))), 1),
            'is_dump':                    0,
        })

    df = pd.DataFrame(rows)

    # Label n_dumps cells near dump zones as positive
    for i, row in df.iterrows():
        for dz in dump_zones:
            d_km = ((row['lat']-dz[0])**2 + (row['lon']-dz[1])**2)**0.5 * 111
            if d_km < 0.15:
                df.at[i, 'is_dump'] = 1
                break

    # Ensure minimum positive count
    if df['is_dump'].sum() < 5:
        idx = np.random.choice(len(df), min(n_dumps, len(df)), replace=False)
        df.loc[idx, 'is_dump'] = 1

    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
    df.to_csv(output_path, index=False)
    print(f"[SYNTH] Generated {len(df)} cells ({df['is_dump'].sum()} dumps) → {output_path}")
    return df


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="OrbitClean QGIS Bridge — CSV Validator")
    parser.add_argument("--input",   help="Path to QGIS-exported CSV")
    parser.add_argument("--output",  help="Path for cleaned CSV output (optional)")
    parser.add_argument("--schema",  action="store_true", help="Print expected schema and exit")
    parser.add_argument("--synth",   help="Generate synthetic CSV at given path (for testing)")
    parser.add_argument("--n-cells", type=int, default=200, help="Number of synthetic cells")
    args = parser.parse_args()

    if args.schema:
        print_schema()
        return

    if args.synth:
        generate_synthetic_csv(args.synth, n_cells=args.n_cells)
        return

    if not args.input:
        parser.print_help()
        sys.exit(1)

    if not HAS_PANDAS:
        print("[ERROR] pandas not installed. Run: pip install pandas")
        sys.exit(1)

    if not os.path.exists(args.input):
        print(f"[ERROR] File not found: {args.input}")
        sys.exit(1)

    df = pd.read_csv(args.input)
    print(f"[INFO] Loaded {len(df)} rows, {len(df.columns)} columns from {args.input}")

    df_clean, issues = validate_and_clean(df, verbose=True)
    print_stats(df_clean, issues)

    out_path = args.output or args.input.replace('.csv', '_clean.csv')
    df_clean.to_csv(out_path, index=False)
    print(f"\n[INFO] Cleaned CSV saved → {out_path}")
    print(f"[INFO] Run risk predictor: python ml/risk_predictor.py --real-data {out_path}")


if __name__ == "__main__":
    main()
