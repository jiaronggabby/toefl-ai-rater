from __future__ import annotations


def build_speaking_prompt(prompt_text: str, transcript_text: str) -> list[dict[str, str]]:
    rubric = (
        "Score the TOEFL speaking response on a 0-5 scale. "
        "Use four dimensions: task_fulfillment, delivery_and_fluency, language_use, topic_development. "
        "Be strict but fair. If only a transcript is available, do not invent pronunciation claims."
    )
    user = (
        "Return JSON only with keys: overall_score, dimensions, strengths, weaknesses, revision_plan, sample_revision, notes. "
        "Each dimension must include name, score, rationale.\n\n"
        f"Prompt:\n{prompt_text or '[No prompt provided]'}\n\n"
        f"Transcript:\n{transcript_text or '[No transcript provided]'}"
    )
    return [
        {"role": "system", "content": rubric},
        {"role": "user", "content": user},
    ]


def build_writing_prompt(prompt_text: str, response_text: str) -> list[dict[str, str]]:
    rubric = (
        "Score the TOEFL writing response on a 0-5 scale. "
        "Use four dimensions: task_fulfillment, organization, development, language_use. "
        "Map the evaluation to practical ETS-style feedback and revision advice."
    )
    user = (
        "Return JSON only with keys: overall_score, dimensions, strengths, weaknesses, revision_plan, sample_revision, notes. "
        "Each dimension must include name, score, rationale.\n\n"
        f"Prompt:\n{prompt_text or '[No prompt provided]'}\n\n"
        f"Response:\n{response_text or '[No response provided]'}"
    )
    return [
        {"role": "system", "content": rubric},
        {"role": "user", "content": user},
    ]
