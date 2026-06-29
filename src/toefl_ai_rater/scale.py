from __future__ import annotations

from .models import EvaluationResult


def round_to_half(value: float) -> float:
    return round(value * 2) / 2


def score5_to_score6(score: float) -> float:
    return max(0.0, min(6.0, score * 6 / 5))


def score5_to_tracking6(score: float | None) -> float | None:
    if score is None:
        return None
    if score <= 0:
        return 0.0
    return max(1.0, min(6.0, round_to_half(score5_to_score6(score))))


def merged_speaking_summary(results: list[EvaluationResult]) -> dict[str, float | int | str | None]:
    speaking_scores = [
        item.overall_score
        for item in results
        if item.item_type == "speaking" and item.overall_score is not None
    ]
    if not speaking_scores:
        return {
            "speaking_items": 0,
            "average_0_5": None,
            "final_tracking_1_6": None,
            "likely_band_1_6": None,
            "status": "missing",
        }

    avg5 = round(sum(speaking_scores) / len(speaking_scores), 2)
    final6 = score5_to_tracking6(avg5)
    low6 = score5_to_tracking6(max(0.0, avg5 - 0.25))
    high6 = score5_to_tracking6(min(5.0, avg5 + 0.25))
    return {
        "speaking_items": len(speaking_scores),
        "average_0_5": avg5,
        "final_tracking_1_6": final6,
        "likely_band_1_6": f"{low6:.1f}-{high6:.1f}" if low6 != high6 else f"{final6:.1f}",
        "status": "complete_11_task_session" if len(speaking_scores) == 11 else "partial_session",
    }
