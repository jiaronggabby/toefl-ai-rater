# Demo Walkthrough

This repository includes a fully synthetic sample input set so you can verify the workflow without exposing real student recordings, essays, tutor scores, tokens, or private study history.

The demo is designed to prove three things:

- the CLI can discover speaking and writing files from a local folder
- the scoring pipeline can produce structured JSON and readable Markdown
- the repository scan can be run before publishing or sharing the project

It is not an accuracy benchmark. The bundled demo uses the heuristic scorer so the project can run offline and in CI-like environments. For richer rubric-aware feedback, configure an OpenAI-compatible scoring provider with your own key.

## Run the Demo

From the repository root:

```bash
python -m toefl_ai_rater run --project-root . --input-dir examples/sample_inputs --dry-run
```

Expected console output:

```text
Report JSON: .../outputs/latest/report.json
Report Markdown: .../outputs/latest/report.md
Residual scan: .../outputs/latest/residual_scan.json
Items scored: 2
Residual findings: 0
```

## Demo Inputs

The sample folder contains:

- `speaking_q1.prompt.txt`
- `speaking_q1.transcript.txt`
- `writing_q1.prompt.txt`
- `writing_q1.response.txt`

The speaking sample uses an existing transcript, so the dry run does not need audio transcription. The writing sample uses a short synthetic response that intentionally leaves room for improvement, which makes the feedback easier to inspect.

## Demo Artifacts

Pre-generated sample outputs are committed here:

- [Sample Markdown report](../examples/demo_output/report.md)
- [Sample JSON report](../examples/demo_output/report.json)
- [Sample residual scan](../examples/demo_output/residual_scan.json)

The committed artifacts are examples only. When you run the command locally, fresh outputs are written to `outputs/latest/`.

## What to Replace

Point the same command at your own practice folder:

```bash
python -m toefl_ai_rater run --project-root . --input-dir path/to/practice
```

Use matching file names:

- `speaking_*.wav`, `speaking_*.mp3`, or another supported audio format
- `speaking_*.transcript.txt` if you already have transcripts
- `speaking_*.prompt.txt` for prompt-aware speaking feedback
- `writing_*.prompt.txt`
- `writing_*.response.txt`

Keep real student recordings, essays, API tokens, and private logs outside the repository unless you are intentionally building a private dataset.
