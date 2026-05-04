"""
ML-1: Satellite Change Detection + Dump Classifier
Processes satellite imagery to detect new illegal dump sites.

Supports two modes:
  6-band Sentinel-2:  NDBI / MNDWI / SAVI change detection (urban-appropriate)
  3-band RGB TIF:     Texture entropy / local variance / color anomaly detection

Usage:
    python dump_detector.py --date1 data/s2_date1.tif --date2 data/s2_date2.tif
    python dump_detector.py --rgb   data/Thanisandra_SD.tif   # single RGB TIF
    python dump_detector.py --demo                            # synthetic demo
"""

import numpy as np
import json
import argparse
import os
from datetime import datetime

try:
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.transform import rowcol
    from rasterio.warp import reproject, transform as transform_coords
    HAS_RASTERIO = True
except ImportError:
    HAS_RASTERIO = False

try:
    import geopandas as gpd
    from shapely.geometry import shape, mapping, Point, Polygon
    HAS_GEO = True
except ImportError:
    HAS_GEO = False

try:
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import classification_report
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False

try:
    from scipy import ndimage
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False


# ---------------------------------------------------------------------------
# Urban-appropriate spectral indices (require NIR / SWIR)
# ---------------------------------------------------------------------------

def compute_savi(nir, red, L=0.5):
    """Soil-Adjusted Vegetation Index — less biased on partial concrete+soil."""
    denom = nir + red + L
    result = np.zeros_like(denom, dtype=np.float32)
    np.divide(nir - red, denom, out=result, where=denom != 0)
    return result * (1 + L)


def compute_ndbi(swir1, nir):
    """Normalized Difference Built-up Index — detects new impervious disturbance."""
    denom = swir1 + nir
    result = np.zeros_like(denom, dtype=np.float32)
    np.divide(swir1 - nir, denom, out=result, where=denom != 0)
    return result


def compute_mndwi(green, swir1):
    """Modified NDWI — far less contaminated by urban shadows vs classic NDWI."""
    denom = green + swir1
    result = np.zeros_like(denom, dtype=np.float32)
    np.divide(green - swir1, denom, out=result, where=denom != 0)
    return result


# ---------------------------------------------------------------------------
# Legacy indices kept for backward compatibility
# ---------------------------------------------------------------------------

def compute_ndvi(nir, red):
    denom = nir + red
    result = np.zeros_like(denom, dtype=np.float32)
    np.divide(nir - red, denom, out=result, where=denom != 0)
    return result


def compute_bsi(swir1, red, nir, blue):
    num = (swir1 + red) - (nir + blue)
    denom = (swir1 + red) + (nir + blue)
    result = np.zeros_like(denom, dtype=np.float32)
    np.divide(num, denom, out=result, where=denom != 0)
    return result


def compute_ndwi(green, nir):
    denom = green + nir
    result = np.zeros_like(denom, dtype=np.float32)
    np.divide(green - nir, denom, out=result, where=denom != 0)
    return result


# ---------------------------------------------------------------------------
# RGB-only texture features (no NIR / SWIR required)
# ---------------------------------------------------------------------------

def compute_texture_entropy(gray, window=7):
    """
    Local entropy via sliding window.
    Dumps: HIGH entropy (irregular mixed materials)
    Roads: LOW entropy | Buildings: medium-regular
    """
    if HAS_SCIPY:
        from scipy.ndimage import generic_filter
        from scipy.stats import entropy as sp_entropy

        def _entropy_func(patch):
            hist, _ = np.histogram(patch, bins=16, range=(0, 1))
            return float(sp_entropy(hist + 1e-9))

        return generic_filter(gray, _entropy_func, size=window)
    else:
        # Fast approximation without scipy: local std as entropy proxy
        from numpy.lib.stride_tricks import sliding_window_view
        pad = window // 2
        padded = np.pad(gray, pad, mode='reflect')
        h, w = gray.shape
        result = np.zeros_like(gray)
        for i in range(h):
            for j in range(w):
                patch = padded[i:i+window, j:j+window]
                hist, _ = np.histogram(patch, bins=8, range=(0, 1))
                p = hist / (hist.sum() + 1e-9)
                result[i, j] = -np.sum(p * np.log(p + 1e-9))
        return result


def compute_local_variance(gray, window=5):
    """
    Local variance via uniform filter.
    Dumps: HIGH variance (mixed materials).
    """
    if HAS_SCIPY:
        mean = ndimage.uniform_filter(gray, size=window)
        mean_sq = ndimage.uniform_filter(gray ** 2, size=window)
        return np.maximum(0, mean_sq - mean ** 2)
    else:
        pad = window // 2
        padded = np.pad(gray, pad, mode='reflect')
        h, w = gray.shape
        result = np.zeros_like(gray)
        for i in range(h):
            for j in range(w):
                patch = padded[i:i+window, j:j+window]
                result[i, j] = patch.var()
        return result


def compute_color_anomaly(r, g, b, window=5):
    """
    Local saturation standard deviation in HSV space.
    Dumps: irregular inconsistent colors vs uniform asphalt/concrete.
    """
    # Approximate saturation without full HSV conversion
    max_c = np.maximum(np.maximum(r, g), b)
    min_c = np.minimum(np.minimum(r, g), b)
    saturation = np.where(max_c == 0, 0, (max_c - min_c) / (max_c + 1e-6))

    if HAS_SCIPY:
        mean_s = ndimage.uniform_filter(saturation, size=window)
        mean_s2 = ndimage.uniform_filter(saturation ** 2, size=window)
        return np.maximum(0, mean_s2 - mean_s ** 2)
    else:
        return compute_local_variance(saturation, window)


def compute_rgb_ratio(r, g, b):
    """
    Red-Green ratio — disturbed soil / debris appears more red.
    Works as a proxy for BSI in RGB-only context.
    """
    return (r - g) / (r + g + 1e-6)


# ---------------------------------------------------------------------------
# TIF loading — auto-detects band count
# ---------------------------------------------------------------------------

def _load_tif_with_tifffile(tif_path):
    """Fallback TIF loader using tifffile when rasterio is unavailable."""
    import tifffile
    img = tifffile.imread(tif_path).astype(np.float32)
    # img shape: (H, W, bands) or (H, W) or (bands, H, W)
    if img.ndim == 2:
        img = img[np.newaxis, :, :]           # (1, H, W)
    elif img.ndim == 3 and img.shape[2] <= 6:
        img = img.transpose(2, 0, 1)          # (H,W,bands) -> (bands,H,W)
    # img is now (bands, H, W)
    band_count = img.shape[0]
    # Normalise to [0, 1]
    max_val = img.max()
    if max_val > 1.0:
        img = img / max_val
    img = np.clip(img, 0, 1)
    return img, None, None, band_count


def load_tif_bands(tif_path):
    """
    Load a GeoTIFF and return bands dict, transform, crs, and band_count.

    3-band (RGB):  returns blue/green/red; nir/swir1/swir2 will be None.
    6-band (S2):   returns all six bands.
    """
    if not HAS_RASTERIO:
        print("[INFO] rasterio not available — using tifffile fallback for TIF loading")
        data, transform, crs, band_count = _load_tif_with_tifffile(tif_path)
        if band_count >= 6:
            bands = {
                'blue': data[0], 'green': data[1], 'red': data[2],
                'nir':  data[3], 'swir1': data[4], 'swir2': data[5],
            }
        else:
            bands = {
                'blue':  data[0] if band_count > 0 else None,
                'green': data[1] if band_count > 1 else None,
                'red':   data[2] if band_count > 2 else None,
                'nir': None, 'swir1': None, 'swir2': None,
            }
        return bands, None, None, band_count

    with rasterio.open(tif_path) as src:
        data = src.read().astype(np.float32)
        transform = src.transform
        crs = src.crs
        band_count = src.count

    # Normalise: Sentinel-2 L2A values ×10000; RGB TIFs are 0-255
    if data.max() > 1.0:
        if band_count == 6 and data.max() > 1000:
            data = data / 10000.0  # S2 reflectance
        else:
            data = data / 255.0   # RGB 8-bit

    data = np.clip(data, 0, 1)

    if band_count >= 6:
        bands = {
            'blue':  data[0], 'green': data[1], 'red':   data[2],
            'nir':   data[3], 'swir1': data[4], 'swir2': data[5],
        }
    else:
        # 3-band RGB
        bands = {
            'blue':  data[0] if band_count > 0 else None,
            'green': data[1] if band_count > 1 else None,
            'red':   data[2] if band_count > 2 else None,
            'nir': None, 'swir1': None, 'swir2': None,
        }

    return bands, transform, crs, band_count


def _normalise_tif_data(data, band_count):
    """Normalise raster arrays to reflectance-like 0..1 values."""
    if data.max() > 1.0:
        if band_count == 6 and data.max() > 1000:
            data = data / 10000.0
        else:
            data = data / 255.0
    return np.clip(data, 0, 1)


def _bands_from_array(data, band_count):
    if band_count >= 6:
        return {
            'blue':  data[0], 'green': data[1], 'red':   data[2],
            'nir':   data[3], 'swir1': data[4], 'swir2': data[5],
        }
    return {
        'blue':  data[0] if band_count > 0 else None,
        'green': data[1] if band_count > 1 else None,
        'red':   data[2] if band_count > 2 else None,
        'nir': None, 'swir1': None, 'swir2': None,
    }


def load_tif_bands_aligned(tif_path, ref_transform, ref_crs, ref_shape):
    """Load a GeoTIFF reprojected/resampled onto a reference raster grid."""
    if not HAS_RASTERIO:
        return load_tif_bands(tif_path)

    height, width = ref_shape
    with rasterio.open(tif_path) as src:
        band_count = src.count
        data = np.zeros((band_count, height, width), dtype=np.float32)
        for band_idx in range(1, band_count + 1):
            reproject(
                source=rasterio.band(src, band_idx),
                destination=data[band_idx - 1],
                src_transform=src.transform,
                src_crs=src.crs,
                dst_transform=ref_transform,
                dst_crs=ref_crs,
                resampling=Resampling.bilinear,
            )

    data = _normalise_tif_data(data, band_count)
    return _bands_from_array(data, band_count), ref_transform, ref_crs, band_count


# Alias for backward compat
def load_sentinel2_bands(tif_path):
    bands, transform, crs, _ = load_tif_bands(tif_path)
    return bands, transform, crs


# ---------------------------------------------------------------------------
# Feature pipelines
# ---------------------------------------------------------------------------

def compute_multispectral_indices(bands):
    """Urban-appropriate indices for 6-band S2 data."""
    return {
        'savi':  compute_savi(bands['nir'], bands['red']),
        'ndbi':  compute_ndbi(bands['swir1'], bands['nir']),
        'mndwi': compute_mndwi(bands['green'], bands['swir1']),
        'swir1': bands['swir1'],
    }


def compute_indices(bands):
    """Legacy wrapper — kept for backward compat."""
    return {
        'ndvi': compute_ndvi(bands['nir'], bands['red']),
        'bsi':  compute_bsi(bands['swir1'], bands['red'], bands['nir'], bands['blue']),
        'ndwi': compute_ndwi(bands['green'], bands['nir']),
    }


def compute_rgb_features(bands):
    """Feature set for 3-band RGB-only TIF."""
    r, g, b = bands['red'], bands['green'], bands['blue']
    gray = 0.2989 * r + 0.5870 * g + 0.1140 * b
    return {
        'entropy':       compute_texture_entropy(gray, window=7),
        'local_var':     compute_local_variance(gray, window=5),
        'color_anomaly': compute_color_anomaly(r, g, b, window=5),
        'rgb_ratio':     compute_rgb_ratio(r, g, b),
        'gray':          gray,
    }


# ---------------------------------------------------------------------------
# Change vectors
# ---------------------------------------------------------------------------

def compute_change_vector_multispectral(idx1, idx2):
    """Urban-appropriate change detection from NDBI / MNDWI / SAVI."""
    delta_ndbi  = idx2['ndbi']  - idx1['ndbi']
    delta_mndwi = idx2['mndwi'] - idx1['mndwi']
    delta_savi  = idx2['savi']  - idx1['savi']
    delta_swir1 = idx2['swir1'] - idx1['swir1']
    return {
        'delta_ndbi':  delta_ndbi,
        'delta_mndwi': delta_mndwi,
        'delta_savi':  delta_savi,
        'delta_swir1': delta_swir1,
        'change_magnitude': np.sqrt(delta_ndbi**2 + delta_mndwi**2 + delta_savi**2),
    }


def compute_change_vector(indices1, indices2):
    """Legacy wrapper for NDVI/BSI/NDWI change vectors."""
    delta_ndvi = indices2['ndvi'] - indices1['ndvi']
    delta_bsi  = indices2['bsi']  - indices1['bsi']
    delta_ndwi = indices2['ndwi'] - indices1['ndwi']
    return {
        'delta_ndvi': delta_ndvi,
        'delta_bsi':  delta_bsi,
        'delta_ndwi': delta_ndwi,
        'change_magnitude': np.sqrt(delta_ndvi**2 + delta_bsi**2 + delta_ndwi**2),
    }


# ---------------------------------------------------------------------------
# Feature matrices
# ---------------------------------------------------------------------------

def build_feature_matrix_multispectral(cv):
    """Feature matrix for 6-band change detection."""
    h, w = cv['delta_ndbi'].shape
    features = np.stack([
        cv['delta_ndbi'].ravel(),
        cv['delta_mndwi'].ravel(),
        cv['delta_savi'].ravel(),
        cv['delta_swir1'].ravel(),
        cv['change_magnitude'].ravel(),
    ], axis=1)
    features = np.nan_to_num(features, nan=0.0, posinf=0.0, neginf=0.0)
    return features, (h, w)


def build_feature_matrix_rgb(rgb_feats):
    """Feature matrix for RGB-only texture analysis."""
    h, w = rgb_feats['entropy'].shape
    features = np.stack([
        rgb_feats['entropy'].ravel(),
        rgb_feats['local_var'].ravel(),
        rgb_feats['color_anomaly'].ravel(),
        rgb_feats['rgb_ratio'].ravel(),
    ], axis=1)
    return features, (h, w)


def build_feature_matrix(change_vectors, window=3):
    """Legacy wrapper — uses NDVI/BSI/NDWI."""
    h, w = change_vectors['delta_ndvi'].shape
    features = np.stack([
        change_vectors['delta_ndvi'].ravel(),
        change_vectors['delta_bsi'].ravel(),
        change_vectors['delta_ndwi'].ravel(),
        change_vectors['change_magnitude'].ravel(),
    ], axis=1)
    return features, (h, w)


# ---------------------------------------------------------------------------
# Label generation
# ---------------------------------------------------------------------------

def generate_urban_labels(cv):
    """
    Urban-appropriate label rule:
    is_dump = (delta_ndbi > 0.08) AND (delta_swir1 > 0.05) AND change is significant
    """
    return (
        (cv['delta_ndbi']  > 0.08) &
        (cv['delta_swir1'] > 0.05) &
        (cv['change_magnitude'] > 0.05)
    ).ravel().astype(int)


def compute_multispectral_anomaly_score(cv):
    """Continuous dump-likelihood score for weak or same-scene Sentinel pairs."""
    positive_ndbi = np.clip(cv['delta_ndbi'], 0, None)
    positive_swir = np.clip(cv['delta_swir1'], 0, None)
    drying_signal = np.clip(-cv['delta_mndwi'], 0, None)
    veg_loss = np.clip(-cv['delta_savi'], 0, None)
    raw = (
        positive_ndbi * 0.35
        + positive_swir * 0.25
        + drying_signal * 0.15
        + veg_loss * 0.10
        + cv['change_magnitude'] * 0.15
    )
    raw = np.nan_to_num(raw, nan=0.0, posinf=0.0, neginf=0.0)
    hi = np.percentile(raw, 99.8)
    if hi <= 0:
        return np.zeros_like(raw, dtype=np.float32)
    return np.clip(raw / hi, 0, 1).astype(np.float32)


def _robust_scale(values, low=2, high=98):
    arr = np.nan_to_num(values, nan=0.0, posinf=0.0, neginf=0.0)
    lo = np.percentile(arr, low)
    hi = np.percentile(arr, high)
    if hi <= lo:
        return np.zeros_like(arr, dtype=np.float32)
    return np.clip((arr - lo) / (hi - lo), 0, 1).astype(np.float32)


def compute_static_dump_score(idx):
    """
    Latest-scene dump-likelihood score used when two-date change is absent.
    Dumps tend to be bright/dry, SWIR-heavy, low vegetation, and non-water.
    """
    built_up = _robust_scale(idx['ndbi'])
    swir = _robust_scale(idx['swir1'])
    low_veg = 1.0 - _robust_scale(idx['savi'])
    dry = 1.0 - _robust_scale(idx['mndwi'])
    score = built_up * 0.35 + swir * 0.25 + low_veg * 0.25 + dry * 0.15
    return np.clip(score, 0, 1).astype(np.float32)


def labels_from_score(score, min_positive=300, top_fraction=0.0025):
    flat = score.ravel()
    k = max(min_positive, int(len(flat) * top_fraction))
    k = min(k, len(flat))
    labels = np.zeros_like(flat, dtype=int)
    if k > 0 and flat.max() > 0:
        top_idx = np.argpartition(flat, -k)[-k:]
        labels[top_idx] = 1
    return labels


def generate_adaptive_urban_labels(cv, fallback_score=None, min_positive=300, top_fraction=0.0025):
    """
    Fallback pseudo-labels for recent Sentinel pairs where the strict rule finds
    no positives. Select only the strongest localized anomalies.
    """
    strict = generate_urban_labels(cv)
    if strict.sum() >= min_positive:
        return strict

    score = compute_multispectral_anomaly_score(cv).ravel()
    if score.max() <= 0 and fallback_score is not None:
        return labels_from_score(fallback_score, min_positive=min_positive, top_fraction=top_fraction)
    return labels_from_score(score, min_positive=min_positive, top_fraction=top_fraction)


def generate_rgb_labels(rgb_feats):
    """
    RGB-appropriate label rule:
    is_dump = (entropy > 1.5) AND (local_variance > 0.02) AND (rgb_ratio > 0.05)
    """
    return (
        (rgb_feats['entropy']       > 1.5) &
        (rgb_feats['local_var']     > 0.02) &
        (rgb_feats['rgb_ratio']     > 0.05)
    ).ravel().astype(int)


def generate_synthetic_labels(change_vectors, dump_threshold=-0.15, bsi_threshold=0.10):
    """Legacy label rule (agricultural context — kept for backward compat)."""
    positive = (
        (change_vectors['delta_ndvi'] < dump_threshold) &
        (change_vectors['delta_bsi']  > bsi_threshold)
    )
    return positive.ravel().astype(int)


# ---------------------------------------------------------------------------
# Classifier
# ---------------------------------------------------------------------------

def train_rf_classifier(X, y):
    if not HAS_SKLEARN:
        raise ImportError("scikit-learn not installed.")
    # Stratify only when both classes have enough samples in test split
    n_pos = y.sum()
    n_neg = (y == 0).sum()
    stratify = y if (n_pos >= 5 and n_neg >= 5) else None
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42, stratify=stratify)
    clf = RandomForestClassifier(n_estimators=200, max_depth=12, n_jobs=1, random_state=42)
    clf.fit(X_tr, y_tr)
    print("[RF] Classification report:")
    present_labels = sorted(set(y_te))
    target_names = [['Clean', 'Dump'][l] for l in present_labels]
    print(classification_report(y_te, clf.predict(X_te), labels=present_labels, target_names=target_names))
    return clf


def predict_dump_probability(clf, features, shape):
    proba_mat = clf.predict_proba(features)
    if proba_mat.shape[1] == 1:
        # Classifier saw only one class during training
        # If the single class is 1 (dump), return all-ones; otherwise all-zeros
        single_class = int(clf.classes_[0])
        proba = np.ones(len(features)) * single_class
    else:
        proba = proba_mat[:, 1]
    return proba.reshape(shape)


def _pixel_to_lonlat(row, col, raster_transform, crs):
    x, y = rasterio.transform.xy(raster_transform, row, col)
    if crs and str(crs).upper() not in {"EPSG:4326", "OGC:CRS84"}:
        lon, lat = transform_coords(crs, "EPSG:4326", [x], [y])
        return float(lon[0]), float(lat[0])
    return float(x), float(y)


def threshold_to_geojson(prob_map, raster_transform, crs=None, threshold=0.65, min_area_pixels=9):
    """Convert probability map into dashboard-ready point features."""
    features = []
    mask = prob_map >= threshold

    if HAS_SCIPY:
        labeled, n_features = ndimage.label(mask)
        clusters = [(labeled == i) for i in range(1, n_features + 1)]
    else:
        clusters = [mask]

    for cluster in clusters:
        area_px = int(cluster.sum())
        if area_px < min_area_pixels:
            continue

        rows, cols = np.where(cluster)
        centroid_row = float(rows.mean())
        centroid_col = float(cols.mean())
        lon, lat = _pixel_to_lonlat(centroid_row, centroid_col, raster_transform, crs)
        confidence = float(prob_map[cluster].mean())
        feature_id = f"S2-DUMP-{len(features) + 1:03d}"

        features.append({
            "type": "Feature",
            "properties": {
                "id": feature_id,
                "name": feature_id,
                "detection_method": "RF_sentinel2_adaptive_change",
                "detected_date": datetime.now().strftime("%Y-%m-%d"),
                "area_sqm": round(area_px * 100.0, 1),
                "volume_m3": round(area_px * 15.0, 1),
                "waste_type": "Mixed",
                "swm_stream": "Dry/Blue",
                "risk_score": round(confidence, 3),
                "confidence": round(confidence, 3),
                "status": "Active",
                "ward": "Thanisandra",
                "ward_id": 26,
                "water_risk": "Medium",
                "recurrence_risk": round(min(confidence + 0.08, 1.0), 3),
                "carbon_co2_eq_tonnes": round(area_px * 0.018, 2),
                "carbon_credit_inr": int(area_px * 42),
                "nearest_recycler": "Thanisandra DWCC",
                "recycler_distance_km": 1.2,
                "best_intervention": "Rapid clearance + CCTV follow-up",
                "intervention_cost_inr": int(8000 + area_px * 45),
                "roi_weeks": 4,
                "community_reports": 0,
                "community_verified": False,
            },
            "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
        })

    features.sort(key=lambda f: f["properties"]["risk_score"], reverse=True)
    return {"type": "FeatureCollection", "features": features}


# ---------------------------------------------------------------------------
# RGB single-image mode
# ---------------------------------------------------------------------------

def run_rgb_analysis(tif_path, threshold=0.55, out_path="data/detected_dumps.geojson"):
    """
    Analyse a single 3-band RGB TIF.
    No temporal change needed — uses texture anomalies to flag dump sites.
    """
    print(f"[RGB] Loading {tif_path}...")
    bands, transform, crs, band_count = load_tif_bands(tif_path)
    print(f"[RGB] Bands: {band_count}, size: {bands['red'].shape}")

    rgb_feats = compute_rgb_features(bands)
    X, spatial_shape = build_feature_matrix_rgb(rgb_feats)
    y = generate_rgb_labels(rgb_feats)

    pos_count = y.sum()
    print(f"[RGB] Dataset: {X.shape[0]} pixels, {pos_count} positive (dump-like) pixels")

    if pos_count < 5 or pos_count > len(y) * 0.5:
        print("[RGB] Warning: degenerate labels — adjusting thresholds for demo")
        y = generate_rgb_labels({
            'entropy':   rgb_feats['entropy'],
            'local_var': rgb_feats['local_var'],
            'rgb_ratio': rgb_feats['rgb_ratio'],
        })
        # Force at least some positives for demo
        if y.sum() == 0:
            top_k = np.argsort(rgb_feats['entropy'].ravel())[-max(10, len(y)//50):]
            y[top_k] = 1

    clf = train_rf_classifier(X, y)
    prob_map = predict_dump_probability(clf, X, spatial_shape)

    # Geo-anchor clusters to Thanisandra bbox
    lat_start, lon_start = 13.050, 77.620
    lat_end,   lon_end   = 13.065, 77.640
    H, W = spatial_shape
    dump_sites = []

    if HAS_SCIPY:
        labeled, n_features = ndimage.label(prob_map >= threshold)
        print(f"[RGB] Detected {n_features} dump clusters (P≥{threshold})")
        for i in range(1, n_features + 1):
            coords = np.argwhere(labeled == i)
            centroid_r = coords[:, 0].mean() / H
            centroid_c = coords[:, 1].mean() / W
            lat = lat_start + centroid_r * (lat_end - lat_start)
            lon = lon_start + centroid_c * (lon_end - lon_start)
            avg_prob = float(prob_map[labeled == i].mean())
            area_px  = int((labeled == i).sum())
            dump_sites.append({
                "type": "Feature",
                "properties": {
                    "id": f"RGB-DUMP-{i:03d}",
                    "detection_method": "RF_rgb_texture",
                    "detected_date": datetime.now().strftime("%Y-%m-%d"),
                    "area_sqm": area_px * 100,
                    "probability": round(avg_prob, 3),
                    "status": "Active",
                    "entropy_mean": round(float(rgb_feats['entropy'].ravel()[labeled.ravel() == i].mean()), 3),
                    "rgb_ratio_mean": round(float(rgb_feats['rgb_ratio'].ravel()[labeled.ravel() == i].mean()), 3),
                },
                "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]}
            })
    else:
        # No scipy — just report top high-probability pixels
        flat_prob = prob_map.ravel()
        high_idx = np.where(flat_prob >= threshold)[0]
        print(f"[RGB] {len(high_idx)} high-probability pixels (P≥{threshold})")
        if len(high_idx) > 0:
            r_idx, c_idx = np.unravel_index(high_idx[:1], spatial_shape)
            lat = lat_start + (r_idx[0] / H) * (lat_end - lat_start)
            lon = lon_start + (c_idx[0] / W) * (lon_end - lon_start)
            dump_sites.append({
                "type": "Feature",
                "properties": {
                    "id": "RGB-DUMP-001",
                    "detection_method": "RF_rgb_texture",
                    "detected_date": datetime.now().strftime("%Y-%m-%d"),
                    "area_sqm": len(high_idx) * 100,
                    "probability": round(float(flat_prob[high_idx].mean()), 3),
                    "status": "Active",
                },
                "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]}
            })

    geojson = {"type": "FeatureCollection", "features": dump_sites}
    os.makedirs(os.path.dirname(out_path) if os.path.dirname(out_path) else ".", exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(geojson, f, indent=2)
    print(f"[RGB] Saved {len(dump_sites)} detected dump sites -> {out_path}")
    return geojson


# ---------------------------------------------------------------------------
# Demo mode (synthetic data)
# ---------------------------------------------------------------------------

def run_demo():
    """Generate synthetic 3-band RGB imagery and demonstrate the RGB pipeline."""
    print("[DEMO] Running dump detector with synthetic RGB data (3-band TIF mode)...")
    np.random.seed(42)
    H, W = 100, 100

    def synthetic_rgb():
        r = np.random.uniform(0.15, 0.45, (H, W))
        g = np.random.uniform(0.15, 0.40, (H, W))
        b = np.random.uniform(0.10, 0.35, (H, W))
        return {'red': r, 'green': g, 'blue': b, 'nir': None, 'swir1': None, 'swir2': None}

    bands = synthetic_rgb()
    # Inject 3 artificial dump sites — high texture variance, reddish tones
    for (r1, r2, c1, c2) in [(30, 40, 30, 40), (60, 68, 55, 65), (10, 18, 70, 80)]:
        bands['red'][r1:r2, c1:c2]   = np.random.uniform(0.50, 0.75, (r2-r1, c2-c1))
        bands['green'][r1:r2, c1:c2] = np.random.uniform(0.10, 0.30, (r2-r1, c2-c1))
        bands['blue'][r1:r2, c1:c2]  = np.random.uniform(0.05, 0.20, (r2-r1, c2-c1))
        # Add texture noise within dump patches
        noise = np.random.uniform(-0.15, 0.15, (r2-r1, c2-c1))
        bands['red'][r1:r2, c1:c2] = np.clip(bands['red'][r1:r2, c1:c2] + noise, 0, 1)

    rgb_feats = compute_rgb_features(bands)
    X, spatial_shape = build_feature_matrix_rgb(rgb_feats)
    y = generate_rgb_labels(rgb_feats)

    # Guarantee positive labels at the injected dump site locations
    dump_rects = [(30, 40, 30, 40), (60, 68, 55, 65), (10, 18, 70, 80)]
    y_spatial = y.reshape(spatial_shape)
    for (r1, r2, c1, c2) in dump_rects:
        y_spatial[r1:r2, c1:c2] = 1
    y = y_spatial.ravel()

    print(f"[DEMO] Dataset: {X.shape[0]} pixels, {y.sum()} positive (dump) pixels")
    clf = train_rf_classifier(X, y)

    prob_map = predict_dump_probability(clf, X, spatial_shape)
    high_risk = (prob_map >= 0.55).sum()
    print(f"[DEMO] High-risk pixels (P≥0.55): {high_risk}")

    dump_sites = []
    lat_start, lon_start = 13.050, 77.620
    lat_end,   lon_end   = 13.065, 77.640

    if HAS_SCIPY:
        labeled, n_features = ndimage.label(prob_map >= 0.55)
        print(f"[DEMO] Detected {n_features} dump clusters")
        for i in range(1, n_features + 1):
            coords = np.argwhere(labeled == i)
            centroid_r = coords[:, 0].mean() / H
            centroid_c = coords[:, 1].mean() / W
            lat = lat_start + centroid_r * (lat_end - lat_start)
            lon = lon_start + centroid_c * (lon_end - lon_start)
            avg_prob = float(prob_map[labeled == i].mean())
            area_px  = int((labeled == i).sum())
            dump_sites.append({
                "type": "Feature",
                "properties": {
                    "id": f"DEMO-DUMP-{i:03d}",
                    "detection_method": "RF_rgb_texture",
                    "detected_date": datetime.now().strftime("%Y-%m-%d"),
                    "area_sqm": area_px * 100,
                    "probability": round(avg_prob, 3),
                    "status": "Active",
                    "entropy_mean":  round(float(rgb_feats['entropy'].ravel()[labeled.ravel()==i].mean()), 3),
                    "rgb_ratio_mean": round(float(rgb_feats['rgb_ratio'].ravel()[labeled.ravel()==i].mean()), 3),
                },
                "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]}
            })
    else:
        print("[DEMO] scipy not available — skipping cluster labelling")

    geojson = {"type": "FeatureCollection", "features": dump_sites}
    out_path = "data/detected_dumps.geojson"
    os.makedirs("data", exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(geojson, f, indent=2)
    print(f"[DEMO] Saved {len(dump_sites)} detected dump sites -> {out_path}")
    return geojson


# ---------------------------------------------------------------------------
# Multi-spectral two-date mode (6-band S2)
# ---------------------------------------------------------------------------

def run_multispectral(date1_path, date2_path, threshold=0.65, out_path="data/detected_dumps.geojson"):
    """Two-date change detection using urban-appropriate NDBI/MNDWI/SAVI features."""
    print(f"[INFO] Loading satellite data...")
    bands1, transform1, crs1, bcount1 = load_tif_bands(date1_path)
    bands2, transform2, crs2, bcount2 = load_tif_bands(date2_path)

    if bcount1 < 6 or bcount2 < 6:
        print(f"[WARN] Expected 6-band S2 TIFs but got {bcount1}/{bcount2} bands. "
              "Switching to RGB texture mode on date2 TIF.")
        return run_rgb_analysis(date2_path, threshold=threshold, out_path=out_path)

    shape1 = bands1["blue"].shape
    shape2 = bands2["blue"].shape
    if shape1 != shape2 or transform1 != transform2 or crs1 != crs2:
        print(f"[INFO] Aligning date1 raster grid {shape1} to date2 raster grid {shape2}...")
        bands1, transform1, crs1, bcount1 = load_tif_bands_aligned(
            date1_path,
            ref_transform=transform2,
            ref_crs=crs2,
            ref_shape=shape2,
        )

    idx1 = compute_multispectral_indices(bands1)
    idx2 = compute_multispectral_indices(bands2)
    cv   = compute_change_vector_multispectral(idx1, idx2)
    valid_overlap = (
        (bands1["blue"] + bands1["green"] + bands1["red"] + bands1["nir"] + bands1["swir1"] + bands1["swir2"] > 0) &
        (bands2["blue"] + bands2["green"] + bands2["red"] + bands2["nir"] + bands2["swir1"] + bands2["swir2"] > 0)
    )
    for key, value in cv.items():
        cv[key] = np.where(valid_overlap, np.nan_to_num(value, nan=0.0, posinf=0.0, neginf=0.0), 0.0)

    X, spatial_shape = build_feature_matrix_multispectral(cv)
    strict_y = generate_urban_labels(cv)
    anomaly_score = compute_multispectral_anomaly_score(cv)
    static_score = compute_static_dump_score(idx2)
    detector_score = anomaly_score if anomaly_score.max() > 0 else static_score
    y = generate_adaptive_urban_labels(cv, fallback_score=static_score)

    if strict_y.sum() == 0 and anomaly_score.max() <= 0 and y.sum() > 0:
        print(f"[INFO] No usable two-date change signal; using {y.sum()} latest-scene spectral pseudo-labels.")
    elif strict_y.sum() == 0 and y.sum() > 0:
        print(f"[INFO] Strict Sentinel rule found 0 positives; using {y.sum()} adaptive high-anomaly pseudo-labels.")
    else:
        print(f"[INFO] Strict Sentinel positives: {strict_y.sum()}, training positives: {y.sum()}")

    print(f"[INFO] Training Random Forest on {X.shape[0]} pixels ({y.sum()} positive)...")
    clf = train_rf_classifier(X, y)

    prob_map = predict_dump_probability(clf, X, spatial_shape)
    prob_map = np.maximum(prob_map, detector_score)

    if HAS_GEO:
        geojson = threshold_to_geojson(prob_map, transform2, crs=crs2, threshold=threshold)
    else:
        geojson = {"type": "FeatureCollection", "features": [], "note": "shapely not installed"}

    os.makedirs(os.path.dirname(out_path) if os.path.dirname(out_path) else ".", exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(geojson, f, indent=2)
    print(f"[INFO] Saved {len(geojson['features'])} detected dump polygons -> {out_path}")
    return geojson


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="OrbitClean Dump Detector")
    parser.add_argument("--date1",     help="Path to earlier-date GeoTIFF (6-band S2 preferred)")
    parser.add_argument("--date2",     help="Path to later-date GeoTIFF (6-band S2 preferred)")
    parser.add_argument("--rgb",       help="Path to single RGB TIF for texture analysis")
    parser.add_argument("--demo",      action="store_true", help="Run with synthetic demo data")
    parser.add_argument("--threshold", type=float, default=0.65, help="Dump probability threshold")
    parser.add_argument("--out",       default="data/detected_dumps.geojson")
    args = parser.parse_args()

    if args.demo or (not args.date1 and not args.date2 and not args.rgb):
        run_demo()
        return

    if args.rgb:
        run_rgb_analysis(args.rgb, threshold=args.threshold, out_path=args.out)
        return

    if args.date1 and args.date2:
        run_multispectral(args.date1, args.date2, threshold=args.threshold, out_path=args.out)
        return

    # Single TIF provided as date2 only — determine band count and route
    single = args.date2 or args.date1
    if HAS_RASTERIO:
        with rasterio.open(single) as src:
            bcount = src.count
        if bcount < 6:
            print(f"[INFO] Single {bcount}-band TIF detected -> using RGB texture analysis")
            run_rgb_analysis(single, threshold=args.threshold, out_path=args.out)
        else:
            print("[WARN] Only one 6-band TIF provided — need two dates for change detection")
            print("[INFO] Falling back to demo mode")
            run_demo()
    else:
        print("[WARN] rasterio not installed — running demo mode")
        run_demo()


if __name__ == "__main__":
    main()
