from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class PracticeInput:
    item_id: str
    item_type: str
    prompt_path: Path | None = None
    response_path: Path | None = None
    audio_path: Path | None = None
    transcript_path: Path | None = None
    prompt_text: str = ""
    response_text: str = ""
    transcript_text: str = ""
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        data = asdict(self)
        for key in ("prompt_path", "response_path", "audio_path", "transcript_path"):
            value = data[key]
            data[key] = str(value) if value else None
        return data


@dataclass
class DimensionScore:
    name: str
    score: float
    rationale: str


@dataclass
class EvaluationResult:
    item_id: str
    item_type: str
    provider: str
    prompt_text: str
    response_text: str
    transcript_text: str
    overall_score: float | None
    dimensions: list[DimensionScore]
    strengths: list[str]
    weaknesses: list[str]
    revision_plan: list[str]
    sample_revision: str
    notes: list[str] = field(default_factory=list)
    audio_path: str | None = None
    transcript_source: str | None = None

    def as_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["dimensions"] = [asdict(item) for item in self.dimensions]
        return data


@dataclass
class RunArtifacts:
    report_json: Path
    report_markdown: Path
    scan_report: Path | None = None
