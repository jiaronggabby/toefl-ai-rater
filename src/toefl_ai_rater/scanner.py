from __future__ import annotations

import json
import re
from pathlib import Path


PRIVATE_USER_ID = "316" + "07"
PRIVATE_BRAND = "FM" + "-TOEFL"
PRIVATE_HANDLE = "jiarong" + "gabby"

PATTERNS: dict[str, str] = {
    "windows_user_path": rf"C:\\Users\\{PRIVATE_USER_ID}|C:/Users/{PRIVATE_USER_ID}",
    "username_31607": rf"\b{PRIVATE_USER_ID}\b",
    "private_brand_fm_toefl": re.escape(PRIVATE_BRAND),
    "personal_github_handle": re.escape(PRIVATE_HANDLE),
    "possible_secret": (
        r"sk-[A-Za-z0-9]{10,}|"
        r"(?:api[_-]?key|token)\s*[:=]\s*['\"]"
        r"(?!(?:your-key-here|replace-me|example|placeholder)['\"])[A-Za-z0-9_\-]{16,}['\"]"
    ),
}

IGNORE_DIRS = {".git", "__pycache__", ".venv", "node_modules", "outputs", "work"}
TEXT_SUFFIXES = {".py", ".md", ".txt", ".yaml", ".yml", ".json", ".toml", ".gitignore"}


def scan_repo(root: Path) -> list[dict[str, str | int]]:
    findings: list[dict[str, str | int]] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if any(part in IGNORE_DIRS for part in path.parts):
            continue
        if path.suffix.lower() not in TEXT_SUFFIXES and path.name not in {"LICENSE", "README"}:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for label, pattern in PATTERNS.items():
            for index, line in enumerate(text.splitlines(), start=1):
                if re.search(pattern, line, flags=re.IGNORECASE):
                    findings.append(
                        {
                            "file": str(path.relative_to(root)),
                            "line": index,
                            "label": label,
                            "snippet": line.strip()[:180],
                        }
                    )
    return findings


def write_scan_report(root: Path, findings: list[dict[str, str | int]], output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps({"findings": findings}, indent=2, ensure_ascii=False), encoding="utf-8")
    return output_path
