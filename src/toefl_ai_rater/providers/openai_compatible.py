from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import requests

from ..config import ProviderConfig
from ..models import DimensionScore, EvaluationResult, PracticeInput
from ..prompts import build_speaking_prompt, build_writing_prompt
from .base import ScoringProvider, TranscriptionProvider


def _normalize_base_url(base_url: str | None) -> str:
    if not base_url:
        return "https://api.openai.com/v1"
    return base_url.rstrip("/")


def _extract_json(text: str) -> dict[str, Any]:
    payload = text.strip()
    if payload.startswith("```"):
        payload = payload.strip("`")
        payload = payload.replace("json", "", 1).strip()
    return json.loads(payload)


class OpenAICompatibleTranscriptionProvider(TranscriptionProvider):
    name = "openai_compatible"

    def __init__(self, config: ProviderConfig):
        self.config = config
        self.base_url = _normalize_base_url(config.base_url)
        self.api_key = config.resolved_api_key()

    def transcribe(self, item: PracticeInput) -> tuple[str, str | None]:
        if not item.audio_path:
            return "", None
        if not self.api_key:
            raise RuntimeError(
                f"Environment variable `{self.config.api_key_env}` is required for transcription."
            )
        with item.audio_path.open("rb") as handle:
            response = requests.post(
                f"{self.base_url}/audio/transcriptions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                data={"model": self.config.model or "gpt-4o-mini-transcribe"},
                files={"file": (item.audio_path.name, handle)},
                timeout=self.config.timeout_seconds,
            )
        response.raise_for_status()
        payload = response.json()
        return str(payload.get("text", "")).strip(), "api_transcription"


class OpenAICompatibleScoringProvider(ScoringProvider):
    name = "openai_compatible"

    def __init__(self, config: ProviderConfig):
        self.config = config
        self.base_url = _normalize_base_url(config.base_url)
        self.api_key = config.resolved_api_key()
        if not self.api_key:
            raise RuntimeError(
                f"Environment variable `{self.config.api_key_env}` is required for scoring."
            )

    def _score(self, item: PracticeInput, messages: list[dict[str, str]]) -> EvaluationResult:
        response = requests.post(
            f"{self.base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.config.model or "gpt-4.1-mini",
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
                "messages": messages,
            },
            timeout=self.config.timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
        content = payload["choices"][0]["message"]["content"]
        structured = _extract_json(content)
        dimensions = [
            DimensionScore(
                name=str(row.get("name", "")),
                score=float(row.get("score", 0.0)),
                rationale=str(row.get("rationale", "")),
            )
            for row in structured.get("dimensions", [])
        ]
        return EvaluationResult(
            item_id=item.item_id,
            item_type=item.item_type,
            provider=self.name,
            prompt_text=item.prompt_text,
            response_text=item.response_text,
            transcript_text=item.transcript_text,
            overall_score=float(structured.get("overall_score", 0.0)),
            dimensions=dimensions,
            strengths=[str(x) for x in structured.get("strengths", [])],
            weaknesses=[str(x) for x in structured.get("weaknesses", [])],
            revision_plan=[str(x) for x in structured.get("revision_plan", [])],
            sample_revision=str(structured.get("sample_revision", "")),
            notes=[str(x) for x in structured.get("notes", [])],
            audio_path=str(item.audio_path) if item.audio_path else None,
            transcript_source="existing_file" if item.transcript_path else "api_transcription",
        )

    def score_speaking(self, item: PracticeInput) -> EvaluationResult:
        return self._score(item, build_speaking_prompt(item.prompt_text, item.transcript_text))

    def score_writing(self, item: PracticeInput) -> EvaluationResult:
        return self._score(item, build_writing_prompt(item.prompt_text, item.response_text))
