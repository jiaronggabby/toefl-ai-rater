from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .config import AppConfig
from .discovery import discover_inputs
from .models import EvaluationResult
from .providers import build_pipeline
from .reporting import write_reports
from .scanner import scan_repo, write_scan_report


def _default_config_path(root: Path) -> Path:
    return root / "config.example.yaml"


def run_command(args: argparse.Namespace) -> int:
    project_root = Path(args.project_root).resolve()
    input_dir = Path(args.input_dir).resolve()
    config_path = Path(args.config).resolve() if args.config else _default_config_path(project_root)
    config = AppConfig.from_yaml(config_path)
    providers = build_pipeline(config)
    items = discover_inputs(input_dir)
    results: list[EvaluationResult] = []

    for item in items:
        if item.item_type == "speaking":
            if not item.transcript_text.strip() and item.audio_path and not args.dry_run:
                transcript, source = providers.transcription.transcribe(item)
                item.transcript_text = transcript
                if source == "api_transcription":
                    item.notes.append("Transcript generated via configured transcription provider.")
            result = providers.scoring.score_speaking(item)
        else:
            result = providers.scoring.score_writing(item)
        if args.dry_run:
            result.notes.append("Dry run enabled: outputs were produced without forcing API calls.")
        results.append(result)

    output_dir = project_root / config.reporting.output_dir
    artifacts = write_reports(output_dir, config, results, dry_run=args.dry_run)
    scan_findings = scan_repo(project_root)
    scan_path = write_scan_report(project_root, scan_findings, output_dir / "residual_scan.json")
    print(f"Report JSON: {artifacts.report_json}")
    print(f"Report Markdown: {artifacts.report_markdown}")
    print(f"Residual scan: {scan_path}")
    print(f"Items scored: {len(results)}")
    if scan_findings:
        print(f"Residual findings: {len(scan_findings)}")
    else:
        print("Residual findings: 0")
    return 0


def scan_command(args: argparse.Namespace) -> int:
    root = Path(args.project_root).resolve()
    findings = scan_repo(root)
    for item in findings:
        print(f"{item['file']}:{item['line']} [{item['label']}] {item['snippet']}")
    if not findings:
        print("No residual findings.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="toefl-ai-rater",
        description="Local TOEFL speaking/writing scoring and feedback pipeline.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    run_parser = subparsers.add_parser("run", help="Score a local input directory and write JSON/Markdown outputs.")
    run_parser.add_argument("--project-root", default=".", help="Repository root used for config and outputs.")
    run_parser.add_argument("--input-dir", required=True, help="Directory containing speaking/writing practice files.")
    run_parser.add_argument("--config", help="Path to YAML config. Defaults to config.example.yaml in project root.")
    run_parser.add_argument("--dry-run", action="store_true", help="Avoid forced API transcription; useful for smoke tests.")
    run_parser.set_defaults(func=run_command)

    scan_parser = subparsers.add_parser("scan", help="Scan the repo for private paths, handles, and secret-like strings.")
    scan_parser.add_argument("--project-root", default=".", help="Repository root to scan.")
    scan_parser.set_defaults(func=scan_command)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
