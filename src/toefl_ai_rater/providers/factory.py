from __future__ import annotations

from dataclasses import dataclass

from ..config import AppConfig
from .base import ScoringProvider, TranscriptionProvider
from .local import ExistingTranscriptProvider, HeuristicScoringProvider
from .openai_compatible import OpenAICompatibleScoringProvider, OpenAICompatibleTranscriptionProvider


@dataclass
class PipelineProviders:
    scoring: ScoringProvider
    transcription: TranscriptionProvider


def build_pipeline(config: AppConfig) -> PipelineProviders:
    if config.scoring.provider == "openai_compatible" and config.scoring.enabled:
        scoring: ScoringProvider = OpenAICompatibleScoringProvider(config.scoring)
    else:
        scoring = HeuristicScoringProvider()

    if config.transcription.provider == "openai_compatible" and config.transcription.enabled:
        transcription: TranscriptionProvider = OpenAICompatibleTranscriptionProvider(config.transcription)
    else:
        transcription = ExistingTranscriptProvider()

    return PipelineProviders(scoring=scoring, transcription=transcription)
