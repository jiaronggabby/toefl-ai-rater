from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


@dataclass
class ProviderConfig:
    provider: str
    model: str | None = None
    base_url: str | None = None
    api_key_env: str | None = None
    timeout_seconds: int = 90
    enabled: bool = True

    def resolved_api_key(self) -> str | None:
        if not self.api_key_env:
            return None
        return os.getenv(self.api_key_env)


@dataclass
class ReportingConfig:
    output_dir: str = "outputs/latest"
    json_name: str = "report.json"
    markdown_name: str = "report.md"


@dataclass
class AppConfig:
    scoring: ProviderConfig
    transcription: ProviderConfig
    reporting: ReportingConfig = field(default_factory=ReportingConfig)

    @classmethod
    def from_yaml(cls, path: Path) -> "AppConfig":
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        scoring_raw = raw.get("scoring", {})
        transcription_raw = raw.get("transcription", {})
        reporting_raw = raw.get("reporting", {})
        return cls(
            scoring=ProviderConfig(
                provider=scoring_raw.get("provider", "heuristic"),
                model=scoring_raw.get("model"),
                base_url=scoring_raw.get("base_url"),
                api_key_env=scoring_raw.get("api_key_env"),
                timeout_seconds=int(scoring_raw.get("timeout_seconds", 90)),
                enabled=bool(scoring_raw.get("enabled", True)),
            ),
            transcription=ProviderConfig(
                provider=transcription_raw.get("provider", "none"),
                model=transcription_raw.get("model"),
                base_url=transcription_raw.get("base_url"),
                api_key_env=transcription_raw.get("api_key_env"),
                timeout_seconds=int(transcription_raw.get("timeout_seconds", 120)),
                enabled=bool(transcription_raw.get("enabled", True)),
            ),
            reporting=ReportingConfig(
                output_dir=reporting_raw.get("output_dir", "outputs/latest"),
                json_name=reporting_raw.get("json_name", "report.json"),
                markdown_name=reporting_raw.get("markdown_name", "report.md"),
            ),
        )

    def public_summary(self) -> dict[str, Any]:
        return {
            "scoring": {
                "provider": self.scoring.provider,
                "model": self.scoring.model,
                "base_url": self.scoring.base_url,
                "api_key_env": self.scoring.api_key_env,
                "enabled": self.scoring.enabled,
            },
            "transcription": {
                "provider": self.transcription.provider,
                "model": self.transcription.model,
                "base_url": self.transcription.base_url,
                "api_key_env": self.transcription.api_key_env,
                "enabled": self.transcription.enabled,
            },
            "reporting": {
                "output_dir": self.reporting.output_dir,
                "json_name": self.reporting.json_name,
                "markdown_name": self.reporting.markdown_name,
            },
        }
