"""
Cleanup Tracker — OrbitClean 2.0

Tracks cleanup missions for illegal dump sites and ML-predicted risk zones.
Zepto-style driver accountability: before/after photo verification with GPS.

Flow:
  1. System assigns cleanup missions to drivers (dump sites + high-risk cells)
  2. Driver arrives → uploads BEFORE photo (GPS auto-captured)
  3. Driver cleans → uploads AFTER photo
  4. System verifies GPS match → marks site as cleaned
  5. Risk score on map reduces dynamically
  6. Community photos at cleaned sites auto-archived

Penalties (BBMP SWM 2026): ₹200–₹25,000 for violations
"""

import json
import math
import os
import uuid
from datetime import datetime

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
MISSIONS_PATH = os.path.join(DATA_DIR, "cleanup_missions.json")
PHOTOS_DIR = os.path.join(DATA_DIR, "cleanup_photos")
GPS_TOLERANCE_M = 150  # max distance between driver GPS and assigned site


def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _load_missions():
    if os.path.exists(MISSIONS_PATH):
        with open(MISSIONS_PATH) as f:
            return json.load(f)
    return []


def _save_missions(missions):
    os.makedirs(os.path.dirname(MISSIONS_PATH) or ".", exist_ok=True)
    with open(MISSIONS_PATH, "w") as f:
        json.dump(missions, f, indent=2)


def _save_photo(image_bytes, mission_id, phase):
    """Save a before/after photo to disk."""
    os.makedirs(PHOTOS_DIR, exist_ok=True)
    filename = f"{mission_id}_{phase}.jpg"
    path = os.path.join(PHOTOS_DIR, filename)
    with open(path, "wb") as f:
        f.write(image_bytes)
    return path


# ── Mission Management ──────────────────────────────────────────────────────

def generate_missions(dumps, risk_cells=None):
    """
    Generate cleanup missions from active dump sites + critical risk cells.
    Each dump site gets a dedicated mission. Critical risk cells are grouped by zone.
    """
    missions = _load_missions()
    existing_targets = {m["target_id"] for m in missions if m["status"] != "cancelled"}

    new_missions = []

    # Missions for known dump sites
    for dump in dumps:
        p = dump if "id" in dump else dump.get("properties", dump)
        if p.get("status") == "Resolved":
            continue
        target_id = p.get("id", "?")
        if target_id in existing_targets:
            continue

        new_missions.append({
            "mission_id": f"CLN-{uuid.uuid4().hex[:6].upper()}",
            "target_id": target_id,
            "target_type": "dump_site",
            "target_name": p.get("name", target_id),
            "lat": p.get("lat", 0),
            "lon": p.get("lon", 0),
            "waste_type": p.get("waste_type", p.get("swm_stream", "Mixed")),
            "area_sqm": p.get("area_sqm", 100),
            "risk_score": p.get("risk_score", 0.5),
            "status": "assigned",  # assigned → in_progress → before_uploaded → after_uploaded → verified → cleaned
            "assigned_at": datetime.now().isoformat(),
            "driver_id": None,
            "before_photo": None,
            "before_gps": None,
            "before_time": None,
            "after_photo": None,
            "after_gps": None,
            "after_time": None,
            "gps_verified": False,
            "risk_reduction": 0,  # how much risk score was reduced
        })

    # Missions for high-risk cells (if provided)
    if risk_cells:
        for cell in risk_cells:
            p = cell.get("properties", cell)
            if p.get("risk_level") != "Critical":
                continue
            cell_id = p.get("cell_id", "?")
            if cell_id in existing_targets:
                continue

            lat = cell["geometry"]["coordinates"][1] if "geometry" in cell else p.get("lat", 0)
            lon = cell["geometry"]["coordinates"][0] if "geometry" in cell else p.get("lon", 0)

            new_missions.append({
                "mission_id": f"CLN-{uuid.uuid4().hex[:6].upper()}",
                "target_id": cell_id,
                "target_type": "risk_cell",
                "target_name": f"Risk Zone {cell_id}",
                "lat": lat,
                "lon": lon,
                "waste_type": "Mixed",
                "area_sqm": 50,
                "risk_score": p.get("risk_score", 0.85),
                "status": "assigned",
                "assigned_at": datetime.now().isoformat(),
                "driver_id": None,
                "before_photo": None,
                "before_gps": None,
                "before_time": None,
                "after_photo": None,
                "after_gps": None,
                "after_time": None,
                "gps_verified": False,
                "risk_reduction": 0,
            })

    missions.extend(new_missions)
    _save_missions(missions)
    return {"new_missions": len(new_missions), "total_missions": len(missions), "missions": new_missions}


def upload_before_photo(mission_id, driver_lat, driver_lon, driver_id=None, image_bytes=None):
    """
    Driver uploads BEFORE photo at the site.
    GPS is verified against mission target location.
    """
    missions = _load_missions()
    mission = next((m for m in missions if m["mission_id"] == mission_id), None)
    if not mission:
        return {"error": f"Mission {mission_id} not found"}

    if mission["status"] not in ("assigned", "in_progress"):
        return {"error": f"Mission already in status: {mission['status']}"}

    # GPS verification
    dist = haversine_m(driver_lat, driver_lon, mission["lat"], mission["lon"])
    gps_ok = dist <= GPS_TOLERANCE_M

    # Save photo
    photo_path = None
    if image_bytes:
        photo_path = _save_photo(image_bytes, mission_id, "before")

    mission["status"] = "before_uploaded"
    mission["before_gps"] = {"lat": driver_lat, "lon": driver_lon, "distance_m": round(dist, 1)}
    mission["before_time"] = datetime.now().isoformat()
    mission["before_photo"] = photo_path
    mission["driver_id"] = driver_id
    mission["gps_verified"] = gps_ok

    _save_missions(missions)

    return {
        "mission_id": mission_id,
        "status": "before_uploaded",
        "gps_verified": gps_ok,
        "gps_distance_m": round(dist, 1),
        "gps_tolerance_m": GPS_TOLERANCE_M,
        "message": "Before photo recorded. Clean the site and upload after photo." if gps_ok
                   else f"WARNING: GPS mismatch — you are {round(dist)}m from target (max {GPS_TOLERANCE_M}m). Photo recorded but flagged.",
    }


def upload_after_photo(mission_id, driver_lat, driver_lon, image_bytes=None):
    """
    Driver uploads AFTER photo — completes the cleanup verification.
    Risk score is reduced for the cleaned site.
    """
    missions = _load_missions()
    mission = next((m for m in missions if m["mission_id"] == mission_id), None)
    if not mission:
        return {"error": f"Mission {mission_id} not found"}

    if mission["status"] != "before_uploaded":
        return {"error": f"Must upload before photo first. Current status: {mission['status']}"}

    dist = haversine_m(driver_lat, driver_lon, mission["lat"], mission["lon"])
    gps_ok = dist <= GPS_TOLERANCE_M

    photo_path = None
    if image_bytes:
        photo_path = _save_photo(image_bytes, mission_id, "after")

    # Calculate risk reduction
    original_risk = mission.get("risk_score", 0.5)
    reduction = original_risk * 0.7 if gps_ok else original_risk * 0.3  # verified = 70% reduction
    new_risk = round(max(original_risk - reduction, 0.05), 3)

    mission["status"] = "verified" if gps_ok else "after_uploaded"
    mission["after_gps"] = {"lat": driver_lat, "lon": driver_lon, "distance_m": round(dist, 1)}
    mission["after_time"] = datetime.now().isoformat()
    mission["after_photo"] = photo_path
    mission["risk_reduction"] = round(reduction, 3)
    mission["new_risk_score"] = new_risk
    if gps_ok:
        mission["verified_at"] = datetime.now().isoformat()

    _save_missions(missions)

    # Archive community photos at this location
    _archive_community_photos(mission["lat"], mission["lon"])

    return {
        "mission_id": mission_id,
        "status": mission["status"],
        "gps_verified": gps_ok,
        "gps_distance_m": round(dist, 1),
        "risk_before": original_risk,
        "risk_after": new_risk,
        "risk_reduction_pct": round((reduction / original_risk) * 100, 1) if original_risk > 0 else 0,
        "message": "Site verified as cleaned! Risk score updated." if gps_ok
                   else "After photo recorded but GPS mismatch. Needs manual verification.",
    }


def _archive_community_photos(site_lat, site_lon, radius_m=200):
    """Archive (mark as resolved) community photos near a cleaned site."""
    photos_path = os.path.join(DATA_DIR, "community_photos.json")
    if not os.path.exists(photos_path):
        return 0
    with open(photos_path) as f:
        photos = json.load(f)

    archived = 0
    for photo in photos:
        if photo.get("archived"):
            continue
        dist = haversine_m(site_lat, site_lon, photo.get("lat", 0), photo.get("lon", 0))
        if dist <= radius_m:
            photo["archived"] = True
            photo["archived_reason"] = "site_cleaned"
            photo["archived_at"] = datetime.now().isoformat()
            archived += 1

    with open(photos_path, "w") as f:
        json.dump(photos, f, indent=2)
    return archived


# ── Query Functions ─────────────────────────────────────────────────────────

def get_all_missions():
    """Get all missions with status breakdown."""
    missions = _load_missions()
    by_status = {}
    for m in missions:
        by_status[m["status"]] = by_status.get(m["status"], 0) + 1

    return {
        "missions": missions,
        "total": len(missions),
        "by_status": by_status,
        "pending_cleanup": len([m for m in missions if m["status"] in ("assigned", "in_progress", "before_uploaded")]),
        "verified_clean": len([m for m in missions if m["status"] == "verified"]),
    }


def get_cleaned_sites():
    """Get list of cleaned/verified sites — used to reduce risk on map."""
    missions = _load_missions()
    cleaned = []
    for m in missions:
        if m["status"] in ("verified", "after_uploaded"):
            cleaned.append({
                "target_id": m["target_id"],
                "target_type": m["target_type"],
                "lat": m["lat"],
                "lon": m["lon"],
                "risk_before": m.get("risk_score", 0),
                "risk_after": m.get("new_risk_score", m.get("risk_score", 0)),
                "risk_reduction": m.get("risk_reduction", 0),
                "verified": m["status"] == "verified",
                "cleaned_at": m.get("verified_at", m.get("after_time")),
            })
    return cleaned


def get_active_community_photos():
    """Get only non-archived community photos (for map display)."""
    photos_path = os.path.join(DATA_DIR, "community_photos.json")
    if not os.path.exists(photos_path):
        return []
    with open(photos_path) as f:
        photos = json.load(f)
    return [p for p in photos if not p.get("archived")]
