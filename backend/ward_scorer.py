"""
Ward Accountability Score (WAScore) computation.
Composite metric used on BBMP dashboard leaderboard.

WAScore = w1*(active_dumps) + w2*(collection_gap) + w3*(avg_dump_age)
        - w4*(pct_resolved_this_week) - w5*(ndvi_health)
Lower = better ward performance.
"""

import json
import os
from datetime import datetime, timedelta

# Scoring weights (tuned to give 0-100 range)
WEIGHTS = {
    'active_dumps':       2.5,
    'collection_gap_hrs': 0.8,
    'avg_dump_age_days':  1.2,
    'pct_resolved':      -30.0,   # negative: resolving dumps reduces score
    'high_risk_cells':    0.5,
}

# Static ward data (from BBMP open data + census)
WARD_DATA = [
    {
        "ward_id": 26,
        "ward_name": "Thanisandra",
        "corporator": "Smt. Roopa R.",
        "area_sqkm": 8.2,
        "population": 52000,
        "active_dumps": 4,
        "resolved_this_week": 1,
        "total_this_week": 5,
        "avg_dump_age_days": 3.2,
        "collection_frequency_hrs": 48,  # BBMP target = 24hrs
        "high_risk_cells": 8,
        "last_inspection": "2026-03-19",
        "trend": "worsening",
    },
    {
        "ward_id": 4,
        "ward_name": "Hebbal",
        "corporator": "Sri. Manjunath G.",
        "area_sqkm": 11.5,
        "population": 78000,
        "active_dumps": 6,
        "resolved_this_week": 3,
        "total_this_week": 7,
        "avg_dump_age_days": 2.1,
        "collection_frequency_hrs": 30,
        "high_risk_cells": 11,
        "last_inspection": "2026-03-20",
        "trend": "improving",
    },
    {
        "ward_id": 3,
        "ward_name": "Yelahanka",
        "corporator": "Sri. Venkatesh S.",
        "area_sqkm": 14.3,
        "population": 95000,
        "active_dumps": 3,
        "resolved_this_week": 4,
        "total_this_week": 5,
        "avg_dump_age_days": 1.8,
        "collection_frequency_hrs": 26,
        "high_risk_cells": 5,
        "last_inspection": "2026-03-21",
        "trend": "improving",
    },
    {
        "ward_id": 6,
        "ward_name": "Kodigehalli",
        "corporator": "Smt. Pushpalatha M.",
        "area_sqkm": 7.8,
        "population": 41000,
        "active_dumps": 5,
        "resolved_this_week": 0,
        "total_this_week": 4,
        "avg_dump_age_days": 5.7,
        "collection_frequency_hrs": 72,  # worst
        "high_risk_cells": 9,
        "last_inspection": "2026-03-15",
        "trend": "worsening",
    },
    {
        "ward_id": 8,
        "ward_name": "Jakkur",
        "corporator": "Sri. Ramesh B.",
        "area_sqkm": 9.1,
        "population": 38000,
        "active_dumps": 2,
        "resolved_this_week": 3,
        "total_this_week": 3,
        "avg_dump_age_days": 1.2,
        "collection_frequency_hrs": 22,
        "high_risk_cells": 3,
        "last_inspection": "2026-03-21",
        "trend": "improving",
    },
]


def compute_wascore(ward):
    """
    WAScore (0-100): higher = WORSE performance.
    Penalty-based: dumps, collection gaps, dump age increase score.
    Resolution and inspection frequency reduce score.
    """
    pct_resolved = (
        ward['resolved_this_week'] / max(1, ward['total_this_week']) * 100
    )
    collection_gap_excess = max(0, ward['collection_frequency_hrs'] - 24)

    score = (
        WEIGHTS['active_dumps']        * ward['active_dumps'] +
        WEIGHTS['collection_gap_hrs']  * collection_gap_excess +
        WEIGHTS['avg_dump_age_days']   * ward['avg_dump_age_days'] +
        WEIGHTS['pct_resolved']        * (pct_resolved / 100) +
        WEIGHTS['high_risk_cells']     * ward['high_risk_cells']
    )
    score = max(0, min(100, score + 30))  # normalise around 30 baseline
    return round(score, 1)


def get_grade(score):
    if score < 30: return {'grade': 'A', 'label': 'Excellent', 'color': '#22c55e'}
    if score < 45: return {'grade': 'B', 'label': 'Good',      'color': '#84cc16'}
    if score < 60: return {'grade': 'C', 'label': 'Fair',      'color': '#f59e0b'}
    if score < 75: return {'grade': 'D', 'label': 'Poor',      'color': '#f97316'}
    return             {'grade': 'F', 'label': 'Critical',  'color': '#ef4444'}


def compute_all_scores():
    results = []
    for ward in WARD_DATA:
        score = compute_wascore(ward)
        grade = get_grade(score)
        pct_resolved = ward['resolved_this_week'] / max(1, ward['total_this_week']) * 100
        results.append({
            **ward,
            'wascore': score,
            'grade': grade['grade'],
            'grade_label': grade['label'],
            'grade_color': grade['color'],
            'pct_resolved': round(pct_resolved, 1),
            'collection_gap_excess_hrs': max(0, ward['collection_frequency_hrs'] - 24),
            'computed_at': datetime.now().isoformat(),
        })
    # Sort worst first
    results.sort(key=lambda w: -w['wascore'])
    return results


def get_leaderboard(limit=5):
    """Returns worst-performing wards first (for dashboard leaderboard)."""
    all_scores = compute_all_scores()
    return {
        'computed_at': datetime.now().isoformat(),
        'total_wards': len(all_scores),
        'worst': all_scores[:limit],
        'best': list(reversed(all_scores))[:limit],
        'all': all_scores,
    }


def save_scores(output_path="data/ward_scores.json"):
    leaderboard = get_leaderboard()
    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else '.', exist_ok=True)
    with open(output_path, 'w') as f:
        json.dump(leaderboard, f, indent=2)
    print(f"[WAScore] Saved → {output_path}")
    return leaderboard


if __name__ == "__main__":
    lb = get_leaderboard()
    print("\n=== Ward Accountability Leaderboard ===")
    print(f"{'Ward':<15} {'Score':>6} {'Grade':<10} {'Active':>6} {'Resolved%':>10} {'Trend'}")
    print("-" * 60)
    for w in lb['all']:
        trend_arrow = "↑ WORSE" if w['trend'] == 'worsening' else "↓ BETTER"
        print(f"{w['ward_name']:<15} {w['wascore']:>6.1f} {w['grade_label']:<10} "
              f"{w['active_dumps']:>6} {w['pct_resolved']:>9.1f}% {trend_arrow}")
    save_scores()
