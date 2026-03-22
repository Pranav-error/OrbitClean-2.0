"""
Auto-Retrain Pipeline — OrbitClean 2.0

Tracks model versions and triggers retraining when enough community photos accumulate.
For demo: mock_retrain() creates version record with accuracy improvement.
"""

import json
import os
from datetime import datetime

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
VERSIONS_PATH = os.path.join(DATA_DIR, "model_versions.json")
PHOTOS_PATH = os.path.join(DATA_DIR, "community_photos.json")

RETRAIN_THRESHOLD = 50  # community photos needed to trigger retrain


def _load_versions():
    if os.path.exists(VERSIONS_PATH):
        with open(VERSIONS_PATH) as f:
            return json.load(f)
    # Seed with initial version
    initial = [{
        "version": "v1.0.0",
        "accuracy": 0.80,
        "training_images": 1200,
        "community_images_added": 0,
        "trained_at": "2026-03-15T00:00:00",
        "notes": "Initial GradientBoosting model — AUC 0.80",
    }]
    _save_versions(initial)
    return initial


def _save_versions(versions):
    os.makedirs(os.path.dirname(VERSIONS_PATH) or ".", exist_ok=True)
    with open(VERSIONS_PATH, "w") as f:
        json.dump(versions, f, indent=2)


def _count_community_photos():
    if os.path.exists(PHOTOS_PATH):
        with open(PHOTOS_PATH) as f:
            return len(json.load(f))
    return 0


def check_retrain_needed(threshold=RETRAIN_THRESHOLD):
    """Check if enough new community photos have accumulated."""
    versions = _load_versions()
    latest = versions[-1]
    total_photos = _count_community_photos()
    photos_since_last = total_photos - latest.get("community_images_added", 0)
    return {
        "needed": photos_since_last >= threshold,
        "current_photos": total_photos,
        "photos_since_last_train": photos_since_last,
        "threshold": threshold,
        "images_until_retrain": max(0, threshold - photos_since_last),
    }


def get_status():
    """Get current model version, accuracy trend, and retrain readiness."""
    versions = _load_versions()
    latest = versions[-1]
    check = check_retrain_needed()

    return {
        "current_version": latest["version"],
        "current_accuracy": latest["accuracy"],
        "versions": versions,
        "accuracy_trend": [{"version": v["version"], "accuracy": v["accuracy"]} for v in versions],
        "retrain_check": check,
        "total_training_images": latest.get("training_images", 0),
    }


def mock_retrain():
    """
    Demo-friendly retrain: creates a new version record with +2-5% accuracy.
    In production this would call train_waste_classifier.py.
    """
    versions = _load_versions()
    latest = versions[-1]
    community_count = _count_community_photos()

    # Parse version
    parts = latest["version"].replace("v", "").split(".")
    major, minor, patch = int(parts[0]), int(parts[1]), int(parts[2])
    minor += 1
    new_version = f"v{major}.{minor}.{patch}"

    # Accuracy improvement (diminishing returns)
    import random
    improvement = random.uniform(0.02, 0.05) * (1.0 - latest["accuracy"])
    new_accuracy = round(min(latest["accuracy"] + improvement, 0.98), 4)

    new_record = {
        "version": new_version,
        "accuracy": new_accuracy,
        "training_images": latest.get("training_images", 1200) + community_count,
        "community_images_added": community_count,
        "trained_at": datetime.now().isoformat(),
        "notes": f"Auto-retrain with {community_count} community photos. Accuracy {latest['accuracy']:.2%} → {new_accuracy:.2%}",
    }

    versions.append(new_record)
    _save_versions(versions)

    return {
        "status": "retrained",
        "previous_version": latest["version"],
        "new_version": new_version,
        "accuracy_before": latest["accuracy"],
        "accuracy_after": new_accuracy,
        "community_images_used": community_count,
    }
