"""
Community Photo Upload & Validation — OrbitClean 2.0

Validates community-uploaded geo-tagged photos against ML-predicted dumps.
When a dump gets ≥3 community reports within 200m → "Community Verified" badge.
"""

import json
import math
import os
import uuid
from datetime import datetime

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
PHOTOS_PATH = os.path.join(DATA_DIR, "community_photos.json")
UPLOADS_DIR = os.path.join(DATA_DIR, "community_uploads")

VERIFICATION_THRESHOLD = 3   # reports needed for "Community Verified"
MAX_MATCH_RADIUS_M = 200     # max distance to match a report to a dump


def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _load_photos():
    if os.path.exists(PHOTOS_PATH):
        with open(PHOTOS_PATH) as f:
            return json.load(f)
    return []


def _save_photos(photos):
    os.makedirs(os.path.dirname(PHOTOS_PATH) or ".", exist_ok=True)
    with open(PHOTOS_PATH, "w") as f:
        json.dump(photos, f, indent=2)


def find_nearest_dump(lat, lon, dumps, max_radius_m=MAX_MATCH_RADIUS_M):
    """Find the nearest dump site within max_radius_m."""
    best = None
    best_dist = float("inf")
    for dump in dumps:
        p = dump if "lat" in dump else dump.get("properties", dump)
        dlat = p.get("lat", 0)
        dlon = p.get("lon", 0)
        dist = haversine_m(lat, lon, dlat, dlon)
        if dist <= max_radius_m and dist < best_dist:
            best_dist = dist
            best = p
    if best:
        return {"dump_id": best.get("id", "?"), "distance_m": round(best_dist, 1)}
    return None


def upload_photo(lat, lon, classification, dumps, image_bytes=None, filename=None):
    """
    Process a community photo upload.
    Returns the saved record with dump match info.
    """
    photos = _load_photos()

    report_id = f"CPH-{uuid.uuid4().hex[:8].upper()}"

    # Save image if provided
    image_path = None
    if image_bytes and filename:
        os.makedirs(UPLOADS_DIR, exist_ok=True)
        ext = os.path.splitext(filename)[1] or ".jpg"
        image_path = os.path.join(UPLOADS_DIR, f"{report_id}{ext}")
        with open(image_path, "wb") as f:
            f.write(image_bytes)

    # Match to nearest dump
    match = find_nearest_dump(lat, lon, dumps)

    record = {
        "id": report_id,
        "lat": lat,
        "lon": lon,
        "classification": classification,
        "matched_dump": match["dump_id"] if match else None,
        "match_distance_m": match["distance_m"] if match else None,
        "image_path": image_path,
        "timestamp": datetime.now().isoformat(),
    }

    photos.insert(0, record)
    _save_photos(photos)

    return record


def get_verification_status(dumps):
    """
    Check all dumps and return community verification status.
    A dump is 'Community Verified' if it has ≥3 community reports within 200m.
    """
    photos = _load_photos()
    dump_counts = {}

    for photo in photos:
        dump_id = photo.get("matched_dump")
        if dump_id:
            dump_counts[dump_id] = dump_counts.get(dump_id, 0) + 1

    results = []
    for dump in dumps:
        p = dump if "id" in dump else dump.get("properties", dump)
        dump_id = p.get("id", "?")
        count = dump_counts.get(dump_id, 0)
        results.append({
            "dump_id": dump_id,
            "community_reports": count,
            "community_verified": count >= VERIFICATION_THRESHOLD,
        })

    return results


def get_stats():
    """Return community upload statistics."""
    photos = _load_photos()
    matched = [p for p in photos if p.get("matched_dump")]
    dump_ids = set(p["matched_dump"] for p in matched)
    dump_counts = {}
    for p in matched:
        dump_counts[p["matched_dump"]] = dump_counts.get(p["matched_dump"], 0) + 1

    verified = sum(1 for c in dump_counts.values() if c >= VERIFICATION_THRESHOLD)

    return {
        "total_uploads": len(photos),
        "matched_to_dumps": len(matched),
        "unique_dumps_reported": len(dump_ids),
        "verified_dumps": verified,
        "verification_threshold": VERIFICATION_THRESHOLD,
    }
