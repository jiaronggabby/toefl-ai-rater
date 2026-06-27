from pathlib import Path

from toefl_ai_rater.scanner import scan_repo


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    findings = scan_repo(root)
    for row in findings:
        print(f"{row['file']}:{row['line']} [{row['label']}] {row['snippet']}")
    if not findings:
        print("No residual findings.")
