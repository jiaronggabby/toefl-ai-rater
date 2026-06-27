from __future__ import annotations

import re

from .models import DimensionScore, EvaluationResult, PracticeInput


def _words(text: str) -> list[str]:
    return re.findall(r"[A-Za-z']+|\d+", text.lower())


def _clamp(value: float, low: float = 0.0, high: float = 5.0) -> float:
    return max(low, min(high, round(value, 1)))


def score_speaking(item: PracticeInput) -> EvaluationResult:
    transcript = item.transcript_text.strip()
    words = _words(transcript)
    prompt = item.prompt_text.strip()
    connectors = sum(transcript.lower().count(token) for token in ("because", "for example", "for instance", "therefore", "so"))
    length_bonus = 0.0
    if len(words) >= 90:
        length_bonus = 0.8
    elif len(words) >= 60:
        length_bonus = 0.4
    elif len(words) >= 35:
        length_bonus = 0.1
    task = _clamp(2.8 + length_bonus)
    development = _clamp(2.4 + length_bonus + min(0.6, connectors * 0.15))
    language = _clamp(2.8 + min(0.5, len(set(words)) / max(1, len(words)) * 0.8))
    delivery = _clamp(2.7 + min(0.5, connectors * 0.1))

    notes: list[str] = []
    if not transcript:
        notes.append("No transcript available. Heuristic score falls back to zero until a transcript or transcriber is provided.")
        overall = 0.0
        dimensions = [
            DimensionScore("task_fulfillment", 0.0, "Missing transcript."),
            DimensionScore("delivery_and_fluency", 0.0, "Missing transcript."),
            DimensionScore("language_use", 0.0, "Missing transcript."),
            DimensionScore("topic_development", 0.0, "Missing transcript."),
        ]
        return EvaluationResult(
            item_id=item.item_id,
            item_type=item.item_type,
            provider="heuristic",
            prompt_text=prompt,
            response_text="",
            transcript_text=transcript,
            overall_score=overall,
            dimensions=dimensions,
            strengths=[],
            weaknesses=["Provide a transcript or enable transcription."],
            revision_plan=["Save a matching `.transcript.txt` file or configure a transcription provider."],
            sample_revision="",
            notes=notes,
            audio_path=str(item.audio_path) if item.audio_path else None,
            transcript_source="missing",
        )

    repeated_i_think = transcript.lower().count("i think")
    if repeated_i_think >= 3:
        language = _clamp(language - 0.4)
        notes.append("Repeated `I think` suggests limited sentence variety.")
    if len(words) < 45:
        development = _clamp(development - 0.6)
        task = _clamp(task - 0.3)
        notes.append("Short response limits topic development.")

    dimensions = [
        DimensionScore("task_fulfillment", task, "Heuristic estimate from length and prompt engagement."),
        DimensionScore("delivery_and_fluency", delivery, "Heuristic estimate from connector use and response continuity."),
        DimensionScore("language_use", language, "Heuristic estimate from lexical variety and repetition."),
        DimensionScore("topic_development", development, "Heuristic estimate from detail density and connectors."),
    ]
    overall = round(sum(score.score for score in dimensions) / len(dimensions), 1)
    strengths: list[str] = []
    weaknesses: list[str] = []
    revision_plan: list[str] = []

    if len(words) >= 60:
        strengths.append("Response length is already close to a full TOEFL practice turn.")
    if connectors >= 2:
        strengths.append("The answer uses causal or example markers instead of listing ideas only.")
    if len(set(words)) / max(1, len(words)) > 0.45:
        strengths.append("Word choice is not overly repetitive for a practice draft.")

    if len(words) < 60:
        weaknesses.append("Add one more concrete example or result sentence.")
        revision_plan.append("Use a 4-sentence frame: answer, reason, example, result.")
    if connectors == 0:
        weaknesses.append("The answer lacks clear logic markers such as `because` or `for example`.")
        revision_plan.append("Insert one reason connector and one example connector.")
    if repeated_i_think >= 3:
        weaknesses.append("Repeated `I think` weakens delivery and language variety.")
        revision_plan.append("Replace repeated starters with `because`, `for example`, or `therefore`.")

    sample_revision = (
        "I would answer directly, give one reason, add a concrete example, and end with the result. "
        "That structure usually sounds more complete and more TOEFL-ready."
    )
    return EvaluationResult(
        item_id=item.item_id,
        item_type=item.item_type,
        provider="heuristic",
        prompt_text=prompt,
        response_text="",
        transcript_text=transcript,
        overall_score=overall,
        dimensions=dimensions,
        strengths=strengths,
        weaknesses=weaknesses,
        revision_plan=revision_plan,
        sample_revision=sample_revision,
        notes=notes,
        audio_path=str(item.audio_path) if item.audio_path else None,
        transcript_source="existing_file" if item.transcript_path else "generated_or_inline",
    )


def score_writing(item: PracticeInput) -> EvaluationResult:
    response = item.response_text.strip()
    words = _words(response)
    prompt = item.prompt_text.strip()
    connectors = sum(response.lower().count(token) for token in ("because", "for example", "for instance", "therefore", "however"))
    unique_ratio = len(set(words)) / max(1, len(words))
    task = _clamp(2.9 + (0.5 if len(words) >= 120 else 0.2 if len(words) >= 90 else -0.2))
    organization = _clamp(2.8 + min(0.6, connectors * 0.15))
    development = _clamp(2.7 + (0.6 if len(words) >= 120 else 0.2 if len(words) >= 90 else -0.4))
    language = _clamp(2.8 + unique_ratio * 1.0)

    notes: list[str] = []
    if not response:
        notes.append("No writing response available.")
        dimensions = [
            DimensionScore("task_fulfillment", 0.0, "Missing response."),
            DimensionScore("organization", 0.0, "Missing response."),
            DimensionScore("development", 0.0, "Missing response."),
            DimensionScore("language_use", 0.0, "Missing response."),
        ]
        return EvaluationResult(
            item_id=item.item_id,
            item_type=item.item_type,
            provider="heuristic",
            prompt_text=prompt,
            response_text=response,
            transcript_text="",
            overall_score=0.0,
            dimensions=dimensions,
            strengths=[],
            weaknesses=["Add a writing response file before scoring."],
            revision_plan=["Save a `writing_*.response.txt` file in the input directory."],
            sample_revision="",
            notes=notes,
        )

    if len(words) < 100:
        development = _clamp(development - 0.4)
        task = _clamp(task - 0.2)
        notes.append("The draft is short for a high-band practice answer.")
    if connectors < 2:
        organization = _clamp(organization - 0.3)
        notes.append("The essay could use more explicit transitions.")
    if response.lower().count("i think") >= 3:
        language = _clamp(language - 0.3)
        notes.append("Repeated sentence openings make the response sound less polished.")

    dimensions = [
        DimensionScore("task_fulfillment", task, "Heuristic estimate from length and directness."),
        DimensionScore("organization", organization, "Heuristic estimate from transitions and paragraph flow."),
        DimensionScore("development", development, "Heuristic estimate from detail density."),
        DimensionScore("language_use", language, "Heuristic estimate from lexical variety and repetition."),
    ]
    overall = round(sum(score.score for score in dimensions) / len(dimensions), 1)
    strengths: list[str] = []
    weaknesses: list[str] = []
    revision_plan: list[str] = []

    if len(words) >= 100:
        strengths.append("The draft is long enough to support a full response.")
    if connectors >= 2:
        strengths.append("The response shows some logical progression instead of isolated claims.")
    if unique_ratio > 0.45:
        strengths.append("Vocabulary reuse is not excessive.")

    if len(words) < 120:
        weaknesses.append("The response needs one more concrete example or supporting detail.")
        revision_plan.append("Add a specific scenario, example, or consequence sentence.")
    if connectors < 2:
        weaknesses.append("Transitions are too sparse for a strong TOEFL writing rhythm.")
        revision_plan.append("Use connectors such as `because`, `however`, and `therefore` more deliberately.")
    if response.lower().count("i think") >= 3:
        weaknesses.append("Repeated sentence starters make the language sound less mature.")
        revision_plan.append("Vary sentence openings and combine shorter claims.")

    sample_revision = (
        "State your position in the first sentence, add one concrete example, explain why it matters, "
        "and end with a clean conclusion."
    )
    return EvaluationResult(
        item_id=item.item_id,
        item_type=item.item_type,
        provider="heuristic",
        prompt_text=prompt,
        response_text=response,
        transcript_text="",
        overall_score=overall,
        dimensions=dimensions,
        strengths=strengths,
        weaknesses=weaknesses,
        revision_plan=revision_plan,
        sample_revision=sample_revision,
        notes=notes,
    )
