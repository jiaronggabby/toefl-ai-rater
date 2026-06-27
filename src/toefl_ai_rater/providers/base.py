from __future__ import annotations

from abc import ABC, abstractmethod

from ..models import EvaluationResult, PracticeInput


class TranscriptionProvider(ABC):
    name = "none"

    @abstractmethod
    def transcribe(self, item: PracticeInput) -> tuple[str, str | None]:
        raise NotImplementedError


class ScoringProvider(ABC):
    name = "unknown"

    @abstractmethod
    def score_speaking(self, item: PracticeInput) -> EvaluationResult:
        raise NotImplementedError

    @abstractmethod
    def score_writing(self, item: PracticeInput) -> EvaluationResult:
        raise NotImplementedError
