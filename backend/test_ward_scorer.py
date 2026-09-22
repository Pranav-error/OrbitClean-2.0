import unittest

from ward_scorer import WARD_DATA, compute_wascore, get_grade, get_leaderboard


class ComputeWascoreTests(unittest.TestCase):
    def test_score_is_clamped_to_0_100(self):
        for ward in WARD_DATA:
            score = compute_wascore(ward)
            self.assertGreaterEqual(score, 0)
            self.assertLessEqual(score, 100)

    def test_full_resolution_lowers_score(self):
        ward = {
            "active_dumps": 5,
            "collection_frequency_hrs": 48,
            "avg_dump_age_days": 3,
            "resolved_this_week": 0,
            "total_this_week": 5,
            "high_risk_cells": 6,
        }
        unresolved_score = compute_wascore(ward)

        resolved_ward = {**ward, "resolved_this_week": 5}
        resolved_score = compute_wascore(resolved_ward)

        self.assertLess(resolved_score, unresolved_score)

    def test_zero_dumps_in_week_does_not_divide_by_zero(self):
        ward = {
            "active_dumps": 0,
            "collection_frequency_hrs": 24,
            "avg_dump_age_days": 0,
            "resolved_this_week": 0,
            "total_this_week": 0,
            "high_risk_cells": 0,
        }
        # max(1, 0) guard in compute_wascore should keep this from raising
        compute_wascore(ward)


class GetGradeTests(unittest.TestCase):
    def test_boundaries(self):
        self.assertEqual(get_grade(29.9)["grade"], "A")
        self.assertEqual(get_grade(30)["grade"], "B")
        self.assertEqual(get_grade(44.9)["grade"], "B")
        self.assertEqual(get_grade(45)["grade"], "C")
        self.assertEqual(get_grade(59.9)["grade"], "C")
        self.assertEqual(get_grade(60)["grade"], "D")
        self.assertEqual(get_grade(74.9)["grade"], "D")
        self.assertEqual(get_grade(75)["grade"], "F")

    def test_extremes(self):
        self.assertEqual(get_grade(0)["grade"], "A")
        self.assertEqual(get_grade(100)["grade"], "F")


class GetLeaderboardTests(unittest.TestCase):
    def test_worst_and_best_are_opposite_ends_sorted_by_wascore(self):
        leaderboard = get_leaderboard(limit=len(WARD_DATA))

        worst_scores = [w["wascore"] for w in leaderboard["worst"]]
        best_scores = [w["wascore"] for w in leaderboard["best"]]

        self.assertEqual(worst_scores, sorted(worst_scores, reverse=True))
        self.assertEqual(best_scores, sorted(best_scores))
        self.assertEqual(leaderboard["total_wards"], len(WARD_DATA))

    def test_limit_is_respected(self):
        leaderboard = get_leaderboard(limit=2)
        self.assertEqual(len(leaderboard["worst"]), 2)
        self.assertEqual(len(leaderboard["best"]), 2)
        self.assertEqual(len(leaderboard["all"]), len(WARD_DATA))


if __name__ == "__main__":
    unittest.main()
