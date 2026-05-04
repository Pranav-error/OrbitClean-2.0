"""
Sentinel-2 Automatic Fetcher & Preprocessor (No Authentication Required)

Fetches latest Sentinel-2 L2A imagery from Planetary Computer STAC,
preprocesses to 6-band stack, rotates files for live multispectral change detection.

Usage:
    python ml/sentinel_fetcher.py --aoi data/thanisandra_grid.shp --max-cloud 20 --output-prev data/s2_prev.tif --output-curr data/s2_curr.tif
    python ml/sentinel_fetcher.py --bbox "77.5,13.0,77.6,13.1" --max-cloud 15 --rotate

Outputs:
    - 6-band GeoTIFF stack (B2, B3, B4, B5, B11, B12 at 10m resolution)
    - Metadata JSON (acquisition date, cloud cover, data coverage %)
    - Rotated file structure for live refresh
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import warnings

warnings.filterwarnings("ignore", category=DeprecationWarning)

try:
    import numpy as np
    HAS_NP = True
except ImportError:
    HAS_NP = False

try:
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.transform import from_bounds
    from rasterio.warp import transform_bounds
    HAS_RASTERIO = True
except ImportError:
    HAS_RASTERIO = False

try:
    import geopandas as gpd
    from shapely.geometry import box
    HAS_GEO = True
except ImportError:
    HAS_GEO = False

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

try:
    from pystac_client import Client
    HAS_PYSTAC = True
except ImportError:
    HAS_PYSTAC = False

try:
    import planetary_computer
    HAS_PLANETARY_COMPUTER = True
except ImportError:
    HAS_PLANETARY_COMPUTER = False

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
METADATA_PATH = DATA_DIR / "s2_fetch_metadata.json"

# STAC Endpoints (no auth required for queries)
PLANETARY_COMPUTER_STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"
SENTINEL_2_L2A_COLLECTION = "sentinel-2-l2a"

# Thanisandra test area (Bangalore waste zone)
THANISANDRA_BBOX = (77.5, 13.0, 77.6, 13.1)  # (minx, miny, maxx, maxy)
THANISANDRA_EPSG = 32643  # UTM Zone 43N


def log(msg: str) -> None:
    """Print timestamped log message."""
    ts = datetime.now().isoformat(timespec="seconds")
    print(f"[sentinel_fetcher {ts}] {msg}", flush=True)


def get_bbox_from_shp(shp_path: str) -> Tuple[float, float, float, float]:
    """Extract bounding box from shapefile."""
    if not HAS_GEO:
        raise ImportError("geopandas required for shapefile parsing")
    gdf = gpd.read_file(shp_path)
    bounds = gdf.total_bounds  # (minx, miny, maxx, maxy)
    log(f"Extracted bbox from {shp_path}: {bounds}")
    return tuple(bounds)


def _normalise_scene(feature: Dict) -> Dict:
    props = feature.get("properties", {})
    return {
        "id": feature.get("id"),
        "datetime": props.get("datetime"),
        "cloud_cover": props.get("eo:cloud_cover"),
        "asset_links": feature.get("assets", {}),
        "bbox": feature.get("bbox"),
    }


def _sign_feature_asset_hrefs(feature: Dict) -> Dict:
    if not HAS_PLANETARY_COMPUTER:
        return feature
    for asset in feature.get("assets", {}).values():
        href = asset.get("href")
        if not href:
            continue
        try:
            signer = getattr(planetary_computer, "sign_url", planetary_computer.sign)
            asset["href"] = signer(href)
        except Exception as exc:
            log(f"WARNING: Could not sign asset URL ({exc})")
    return feature


def _query_stac_with_pystac(
    bbox: Tuple[float, float, float, float],
    start_date: str,
    end_date: str,
    max_cloud: float,
) -> List[Dict]:
    modifier = planetary_computer.sign_inplace if HAS_PLANETARY_COMPUTER else None
    catalog = Client.open(PLANETARY_COMPUTER_STAC, modifier=modifier)
    search = catalog.search(
        collections=[SENTINEL_2_L2A_COLLECTION],
        bbox=bbox,
        datetime=f"{start_date}/{end_date}",
        query={"eo:cloud_cover": {"lte": max_cloud}},
        limit=20,
    )
    return [item.to_dict() for item in search.items()]


def _query_stac_with_requests(
    bbox: Tuple[float, float, float, float],
    start_date: str,
    end_date: str,
    max_cloud: float,
) -> List[Dict]:
    minx, miny, maxx, maxy = bbox
    search_url = f"{PLANETARY_COMPUTER_STAC}/search"
    payload = {
        "collections": [SENTINEL_2_L2A_COLLECTION],
        "bbox": [minx, miny, maxx, maxy],
        "datetime": f"{start_date}T00:00:00Z/{end_date}T23:59:59Z",
        "query": {"eo:cloud_cover": {"lte": max_cloud}},
        "limit": 20,
    }
    resp = requests.post(search_url, json=payload, timeout=30)
    resp.raise_for_status()
    return resp.json().get("features", [])


def query_stac(
    bbox: Tuple[float, float, float, float],
    start_date: str,
    end_date: str,
    max_cloud: float = 20,
) -> List[Dict]:
    """
    Query STAC for Sentinel-2 L2A scenes.
    
    Tries Planetary Computer using pystac-client when available, then a direct
    STAC request. Returned asset URLs are signed when planetary-computer exists.

    Args:
        bbox: (minx, miny, maxx, maxy)
        start_date: YYYY-MM-DD
        end_date: YYYY-MM-DD
        max_cloud: Maximum cloud cover percentage
    Returns:
        List of scene metadata dicts (sorted by acquisition date, newest first)
    """
    if not HAS_REQUESTS:
        raise ImportError("requests required for STAC queries")

    log(f"Querying STAC for bbox={bbox}, date={start_date}..{end_date}, max_cloud={max_cloud}%")
    errors = []
    features = []
    if HAS_PYSTAC:
        try:
            features = _query_stac_with_pystac(bbox, start_date, end_date, max_cloud)
        except Exception as e:
            errors.append(f"pystac-client: {e}")

    if not features:
        try:
            features = _query_stac_with_requests(bbox, start_date, end_date, max_cloud)
            if HAS_PLANETARY_COMPUTER:
                features = [_sign_feature_asset_hrefs(feat) for feat in features]
        except Exception as e:
            errors.append(f"requests: {e}")

    if errors and not features:
        raise RuntimeError("; ".join(errors))

    log(f"Found {len(features)} scenes matching criteria")
    features_sorted = sorted(
        features,
        key=lambda f: f.get("properties", {}).get("datetime", ""),
        reverse=True,
    )
    return [_normalise_scene(feat) for feat in features_sorted]


def download_s2_bands(
    asset_links: Dict,
    bands: List[str] = None,
    output_dir: Path = None,
    bbox: Tuple[float, float, float, float] = None,
) -> Dict[str, Path]:
    """
    Download specific Sentinel-2 bands from asset links.

    For COG assets, this reads only the AOI window through rasterio instead of
    downloading entire Sentinel tiles.

    Args:
        asset_links: Asset dictionary from STAC feature
        bands: List of band names (default: ["B02", "B03", "B04", "B05", "B11", "B12"])
        output_dir: Where to save (default: DATA_DIR)
        bbox: WGS84 AOI bounds for windowed COG reads

    Returns:
        Dict mapping band name -> local file path
    """
    if not HAS_REQUESTS:
        raise ImportError("requests required for downloads")

    if bands is None:
        bands = ["B02", "B03", "B04", "B05", "B11", "B12"]

    if output_dir is None:
        output_dir = DATA_DIR

    output_dir.mkdir(parents=True, exist_ok=True)
    downloaded = {}

    for band in bands:
        band_key = next((key for key in asset_links if key.lower() == band.lower()), None)
        if not band_key:
            log(f"WARNING: Band {band} not found in assets")
            continue

        asset = asset_links[band_key]
        href = asset.get("href")
        if not href:
            log(f"WARNING: No href for {band}")
            continue

        output_path = output_dir / f"s2_{band}.tif"
        log(f"Fetching {band} from {href}")

        try:
            if HAS_RASTERIO and bbox:
                with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
                    with rasterio.open(href) as src:
                        src_bounds = transform_bounds("EPSG:4326", src.crs, *bbox, densify_pts=21)
                        window = src.window(*src_bounds).round_offsets().round_lengths()
                        data = src.read(1, window=window, boundless=False)
                        if data.size == 0:
                            raise ValueError(f"{band} window is empty for bbox={bbox}")
                        profile = src.profile.copy()
                        profile.update(
                            driver="GTiff",
                            height=data.shape[0],
                            width=data.shape[1],
                            transform=src.window_transform(window),
                            count=1,
                        )
                        with rasterio.open(output_path, "w", **profile) as dst:
                            dst.write(data, 1)
            else:
                resp = requests.get(href, timeout=60, stream=True)
                resp.raise_for_status()
                with open(output_path, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=8192):
                        f.write(chunk)
            log(f"Saved {band} to {output_path}")
            downloaded[band] = output_path
        except Exception as e:
            log(f"ERROR downloading {band}: {e}")

    return downloaded


def build_6band_stack(
    band_paths: Dict[str, Path],
    output_path: Path,
    target_epsg: int = 32643,
) -> None:
    """
    Stack 6 Sentinel-2 bands into single GeoTIFF.

    Order: B2 (10m Blue), B3 (10m Green), B4 (10m Red), B5 (20m Vegetation Edge),
           B11 (20m SWIR-1), B12 (20m SWIR-2)

    Uses rasterio to resample 20m bands to 10m.

    Args:
        band_paths: Dict mapping band name (B02, B03, etc.) -> file path
        output_path: Output 6-band GeoTIFF path
        target_epsg: Target EPSG code (default: UTM43N for Bangalore)
    """
    if not (HAS_RASTERIO and HAS_NP):
        raise ImportError("rasterio and numpy required for stacking")

    log(f"Building 6-band stack with {len(band_paths)} bands")

    band_order = ["B02", "B03", "B04", "B05", "B11", "B12"]
    band_10m = ["B02", "B03", "B04"]
    band_20m = ["B05", "B11", "B12"]

    stack = []
    transform = None
    height = None
    width = None

    # Read 10m bands first
    for band_name in band_10m:
        if band_name not in band_paths:
            raise FileNotFoundError(f"Band {band_name} not downloaded")
        with rasterio.open(band_paths[band_name]) as src:
            data = src.read(1)
            stack.append(data)
            if transform is None:
                transform = src.transform
                height, width = src.height, src.width
            log(f"Loaded {band_name}: {data.shape}, dtype={data.dtype}")

    # Read 20m bands and resample to the 10m reference grid
    for band_name in band_20m:
        if band_name not in band_paths:
            raise FileNotFoundError(f"Band {band_name} not downloaded")
        with rasterio.open(band_paths[band_name]) as src:
            data_10m = src.read(
                1,
                out_shape=(height, width),
                resampling=Resampling.bilinear,
            )
            stack.append(data_10m)
            log(f"Loaded {band_name} (resampled to 10m): {data_10m.shape}, dtype={data_10m.dtype}")

    # Write 6-band stack
    stack_array = np.array(stack, dtype=np.uint16)
    log(f"Stack shape: {stack_array.shape}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(
        output_path,
        "w",
        driver="GTiff",
        height=height,
        width=width,
        count=6,
        dtype=stack_array.dtype,
        transform=transform,
        crs=f"EPSG:{target_epsg}",
    ) as dst:
        for i, band_data in enumerate(stack_array, 1):
            dst.write(band_data, i)
    log(f"Wrote 6-band stack to {output_path}")


def preserve_current_as_previous(prev_path: Path, curr_path: Path) -> None:
    """
    Preserve the current scene as the previous scene before a new current file is promoted.

    Args:
        prev_path: Path where yesterday's scene will be saved
        curr_path: Path where the old current scene exists
    """
    import shutil

    if curr_path.exists():
        if prev_path.exists():
            log(f"Removing old prev file: {prev_path}")
            prev_path.unlink()
        log(f"Preserving current scene: {curr_path} -> {prev_path}")
        shutil.copy(curr_path, prev_path)
        log(f"Previous scene updated: {prev_path}")
    else:
        log(f"No existing current scene to preserve: {curr_path}")


def fetch_and_preprocess(
    bbox: Tuple[float, float, float, float],
    max_cloud: float = 20,
    days_lookback: int = 30,
    output_prev: Path = None,
    output_curr: Path = None,
    skip_rotation: bool = False,
    allow_demo_fallback: bool = False,
) -> Dict:
    """
    Full pipeline: query STAC, download, stack, rotate.
    
    Fails visibly when live STAC data cannot be fetched unless
    allow_demo_fallback=True is explicitly supplied.

    Args:
        bbox: (minx, miny, maxx, maxy)
        max_cloud: Max cloud cover %
        days_lookback: How far back to search for scenes
        output_prev: Where to save previous date file
        output_curr: Where to save current date file
        skip_rotation: Skip file rotation (for first-time setup)
        allow_demo_fallback: Copy bundled demo imagery only when explicitly requested

    Returns:
        Metadata dictionary
    """
    if output_prev is None:
        output_prev = DATA_DIR / "s2_prev.tif"
    if output_curr is None:
        output_curr = DATA_DIR / "s2_curr.tif"

    metadata = {
        "timestamp": datetime.now().isoformat(),
        "bbox": bbox,
        "max_cloud": max_cloud,
        "status": "pending",
        "mode": "stac_fetch",
        "scenes_found": 0,
        "scene_selected": None,
        "bands_downloaded": 0,
        "error": None,
    }

    try:
        # Calculate date range
        end_date = datetime.now().date().isoformat()
        start_date = (datetime.now() - timedelta(days=days_lookback)).date().isoformat()

        # Query STAC
        scenes = query_stac(bbox, start_date, end_date, max_cloud)
        metadata["scenes_found"] = len(scenes)

        if not scenes:
            if not allow_demo_fallback:
                metadata["error"] = "No Sentinel-2 scenes found for AOI/date/cloud constraints"
                metadata["status"] = "failed"
                return metadata

            log("No scenes found from STAC; using explicit demo fallback (copying existing file)")
            metadata["mode"] = "demo_fallback"
            
            # Demo fallback: copy existing file
            existing_file = DATA_DIR / "thanisandra_cropped_6band.tif"
            if not existing_file.exists():
                metadata["error"] = f"Demo fallback failed: {existing_file} does not exist"
                metadata["status"] = "failed"
                return metadata
            
            import shutil
            if not skip_rotation:
                preserve_current_as_previous(output_prev, output_curr)
                metadata["prev_file"] = str(output_prev.relative_to(ROOT))

            log(f"Copying {existing_file} to {output_curr} for demo purposes")
            shutil.copy(existing_file, output_curr)
            metadata["output_file"] = str(output_curr.relative_to(ROOT))
            metadata["bands_downloaded"] = 6  # Pretend 6 bands
            metadata["scene_selected"] = {
                "id": "demo_copy",
                "datetime": datetime.now().isoformat(),
                "cloud_cover": 0,
                "note": "Demo fallback - using existing file"
            }

            metadata["status"] = "ok"
            log("Demo fallback completed successfully")
            return metadata

        # Select newest scene
        scene = scenes[0]
        metadata["scene_selected"] = {
            "id": scene["id"],
            "datetime": scene["datetime"],
            "cloud_cover": scene["cloud_cover"],
        }
        log(f"Selected scene: {scene['id']}, datetime={scene['datetime']}, cloud={scene['cloud_cover']}%")

        if METADATA_PATH.exists() and output_curr.exists():
            try:
                previous_metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
                previous_scene = (previous_metadata.get("scene_selected") or {}).get("id")
                if previous_scene == scene["id"]:
                    metadata["status"] = "ok"
                    metadata["mode"] = "stac_fetch_skipped_same_scene"
                    metadata["output_file"] = str(output_curr.relative_to(ROOT))
                    if output_prev.exists():
                        metadata["prev_file"] = str(output_prev.relative_to(ROOT))
                    log("Latest STAC scene is already current; skipping download and rotation")
                    return metadata
            except Exception as exc:
                log(f"WARNING: Could not compare previous scene metadata ({exc})")

        # Download bands
        temp_dir = DATA_DIR / "_s2_temp"
        bands_dict = download_s2_bands(scene["asset_links"], output_dir=temp_dir, bbox=bbox)
        metadata["bands_downloaded"] = len(bands_dict)

        required_bands = {"B02", "B03", "B04", "B05", "B11", "B12"}
        if set(bands_dict) != required_bands:
            missing = sorted(required_bands - set(bands_dict))
            metadata["error"] = f"Failed to download required bands: {', '.join(missing)}"
            metadata["status"] = "failed"
            return metadata

        # Build 6-band stack
        temp_stack = output_curr.with_suffix(".tmp.tif")
        if temp_stack.exists():
            temp_stack.unlink()
        build_6band_stack(bands_dict, temp_stack)

        if not skip_rotation:
            preserve_current_as_previous(output_prev, output_curr)
            metadata["prev_file"] = str(output_prev.relative_to(ROOT))

        if output_curr.exists():
            output_curr.unlink()
        temp_stack.replace(output_curr)
        metadata["output_file"] = str(output_curr.relative_to(ROOT))

        # Cleanup temp files
        import shutil
        if temp_dir.exists():
            shutil.rmtree(temp_dir)

        metadata["status"] = "ok"
        log("Sentinel-2 fetch and preprocess completed successfully")

    except Exception as e:
        log(f"ERROR in fetch_and_preprocess: {e}")
        metadata["error"] = str(e)
        metadata["status"] = "failed"

    return metadata


def main() -> int:
    parser = argparse.ArgumentParser(description="Sentinel-2 Automatic Fetcher & Preprocessor")
    parser.add_argument(
        "--bbox",
        type=str,
        help="Bounding box as 'minx,miny,maxx,maxy' (default: Thanisandra)",
    )
    parser.add_argument(
        "--aoi",
        type=str,
        help="Path to shapefile for AOI (alternative to --bbox)",
    )
    parser.add_argument(
        "--max-cloud",
        type=float,
        default=20,
        help="Maximum cloud cover %% (default: 20)",
    )
    parser.add_argument(
        "--days-lookback",
        type=int,
        default=30,
        help="Days to search backwards (default: 30)",
    )
    parser.add_argument(
        "--output-curr",
        type=Path,
        default=DATA_DIR / "s2_curr.tif",
        help="Output path for latest scene stack",
    )
    parser.add_argument(
        "--output-prev",
        type=Path,
        default=DATA_DIR / "s2_prev.tif",
        help="Output path for previous (rotated) scene",
    )
    parser.add_argument(
        "--skip-rotation",
        action="store_true",
        help="Skip file rotation (for first-time setup)",
    )
    parser.add_argument(
        "--allow-demo-fallback",
        action="store_true",
        help="Allow copying bundled demo imagery if live Sentinel-2 fetch fails",
    )
    parser.add_argument(
        "--metadata-out",
        type=Path,
        help="Write metadata JSON to this path (default: no metadata file)",
    )

    args = parser.parse_args()

    # Determine AOI
    if args.aoi:
        bbox = get_bbox_from_shp(args.aoi)
    elif args.bbox:
        bbox = tuple(map(float, args.bbox.split(",")))
    else:
        bbox = THANISANDRA_BBOX

    # Ensure output paths are absolute
    output_curr = Path(args.output_curr).resolve()
    output_prev = Path(args.output_prev).resolve()

    # Run pipeline
    metadata = fetch_and_preprocess(
        bbox=bbox,
        max_cloud=args.max_cloud,
        days_lookback=args.days_lookback,
        output_prev=output_prev,
        output_curr=output_curr,
        skip_rotation=args.skip_rotation,
        allow_demo_fallback=args.allow_demo_fallback,
    )

    # Write metadata if requested
    if args.metadata_out:
        args.metadata_out.parent.mkdir(parents=True, exist_ok=True)
        with open(args.metadata_out, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2)
        log(f"Metadata written to {args.metadata_out}")

    # Print final status
    log(f"Final status: {metadata['status']}")
    return 0 if metadata["status"] == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
