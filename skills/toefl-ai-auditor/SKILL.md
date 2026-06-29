---
name: toefl-ai-auditor
description: TOEFL Speaking/Writing scoring workflow. Use for local recording audits, 11-task Speaking scoring, 0-5 task diagnostics, final 1-6 merged Speaking tracking score, and reusable TOEFL templates.
---

# TOEFL Speaking/Writing Scoring Workflow

## Workflow

1. Sort the latest WAV recordings by modification time; align the latest 11 files to Speaking Q1-Q11 unless structured report data provides a stronger mapping.
2. Pull prompts from structured report data or a local question bank. Avoid OCR and broad file scans when structured data exists.
3. Score Q1-Q7 repeat tasks for exactness. Do not reward paraphrase.
4. Score Q8-Q11 interview tasks on task response, delivery/fluency, language use, and development.
5. Reply in chat unless the user explicitly asks for a file.

## Scale

- Per-task diagnostic score: 0-5.
- Final Speaking tracking score: merge all 11 Speaking task scores into 1-6.
- Merge rule: `avg5 = mean(Q1..Q11)`, then `final6 = nearest_half(avg5 * 6 / 5)`, clamped to 1.0-6.0 when `avg5 > 0`.
- Treat the 1-6 number as a local practice tracking band, not an official ETS conversion.

## Required Speaking Output

Always include:

- all 11 task scores on 0-5
- 11-task average on 0-5
- final merged Speaking score on 1-6
- likely 1-6 band
- per-question theme, key errors, reason for score, and a better version

## Interview Response Templates

Use reusable student-life examples so the same structure works across different practice sets. Do not build a one-off answer pattern only for the current topic.

Core frame:

```text
Direct answer.
The main reason is that ...
For example, in my daily life / last semester / last week, ...
As a result ... / That is why I think ...
```

Theme bank:

- study/work
- health/food
- money/spending
- technology/apps
- community/volunteering
- travel/service

Common fixes: exact repeat nouns and function words; add concrete examples; avoid unfinished `if/because/but` clauses; say `habits`, `physical health`, `stay healthy`, `junk food`, and `taste`.
