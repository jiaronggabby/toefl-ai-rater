from __future__ import annotations

from ..heuristics import score_speaking, score_writing
from ..models import EvaluationResult, PracticeInput
from .base import ScoringProvider, TranscriptionProvider


class ExistingTranscriptProvider(TranscriptionProvider):
    name = "existing_transcript"

    def transcribe(self, item: PracticeInput) -> tuple[str, str | None]:
        if item.transcript_text.strip():
            return item.transcript_text.strip(), "existing_file"
        return "", None


class HeuristicScoringProvider(ScoringProvider):
    name = "heuristic"

    def score_speaking(self, item: PracticeInput) -> EvaluationResult:
        return score_speaking(item)

    def score_writing(self, item: PracticeInput) -> EvaluationResult:
        return score_writing(item)
