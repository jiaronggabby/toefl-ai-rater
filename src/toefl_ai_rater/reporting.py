from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from .config import AppConfig
from .models import EvaluationResult, RunArtifacts
from .scale import merged_speaking_summary, score5_to_tracking6


def write_reports(
    output_dir: Path,
    config: AppConfig,
    results: list[EvaluationResult],
    dry_run: bool,
) -> RunArtifacts:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / config.reporting.json_name
    markdown_path = output_dir / config.reporting.markdown_name

    speaking_summary = merged_speaking_summary(results)
    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": dry_run,
        "config": config.public_summary(),
        "counts": {
            "speaking": sum(1 for item in results if item.item_type == "speaking"),
            "writing": sum(1 for item in results if item.item_type == "writing"),
        },
        "speaking_summary": speaking_summary,
        "results": [item.as_dict() for item in results],
    }
    json_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")

    lines = [
        "# TOEFL AI Rater Report",
        "",
        f"- Generated: {summary['generated_at']}",
        f"- Dry run: {'yes' if dry_run else 'no'}",
        f"- Speaking items: {summary['counts']['speaking']}",
        f"- Writing items: {summary['counts']['writing']}",
        f"- Speaking merged score (1-6 tracking): {speaking_summary['final_tracking_1_6'] if speaking_summary['final_tracking_1_6'] is not None else 'N/A'}",
        f"- Speaking average (0-5): {speaking_summary['average_0_5'] if speaking_summary['average_0_5'] is not None else 'N/A'}",
        f"- Speaking likely band (1-6): {speaking_summary['likely_band_1_6'] if speaking_summary['likely_band_1_6'] is not None else 'N/A'}",
        f"- Speaking session status: {speaking_summary['status']}",
        "",
    ]

    if not results:
        lines.extend(
            [
                "No practice items were discovered.",
                "",
                "Use the sample naming convention from the README, then run the command again.",
            ]
        )
    for result in results:
        lines.extend(
            [
                f"## {result.item_id} ({result.item_type})",
                "",
                f"- Provider: {result.provider}",
                f"- Overall score (0-5): {result.overall_score if result.overall_score is not None else 'N/A'}",
            ]
        )
        if result.item_type == "speaking":
            score6 = score5_to_tracking6(result.overall_score)
            lines.append(f"- Tracking score (1-6): {score6 if score6 is not None else 'N/A'}")
        if result.audio_path:
            lines.append(f"- Audio: `{result.audio_path}`")
        if result.transcript_source:
            lines.append(f"- Transcript source: `{result.transcript_source}`")
        lines.extend(["", "### Dimensions", ""])
        for dimension in result.dimensions:
            lines.append(f"- {dimension.name}: {dimension.score} | {dimension.rationale}")
        if result.strengths:
            lines.extend(["", "### Strengths", ""])
            lines.extend(f"- {item}" for item in result.strengths)
        if result.weaknesses:
            lines.extend(["", "### Weaknesses", ""])
            lines.extend(f"- {item}" for item in result.weaknesses)
        if result.revision_plan:
            lines.extend(["", "### Revision Plan", ""])
            lines.extend(f"- {item}" for item in result.revision_plan)
        if result.sample_revision:
            lines.extend(["", "### Sample Revision", "", result.sample_revision])
        if result.notes:
            lines.extend(["", "### Notes", ""])
            lines.extend(f"- {item}" for item in result.notes)
        lines.append("")

    markdown_path.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")
    return RunArtifacts(report_json=json_path, report_markdown=markdown_path)
