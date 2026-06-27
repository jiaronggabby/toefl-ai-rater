from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from .config import AppConfig
from .models import EvaluationResult, RunArtifacts


def write_reports(
    output_dir: Path,
    config: AppConfig,
    results: list[EvaluationResult],
    dry_run: bool,
) -> RunArtifacts:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / config.reporting.json_name
    markdown_path = output_dir / config.reporting.markdown_name

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": dry_run,
        "config": config.public_summary(),
        "counts": {
            "speaking": sum(1 for item in results if item.item_type == "speaking"),
            "writing": sum(1 for item in results if item.item_type == "writing"),
        },
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
