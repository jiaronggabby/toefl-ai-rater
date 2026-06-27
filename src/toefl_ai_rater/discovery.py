from __future__ import annotations

from pathlib import Path

from .models import PracticeInput

TEXT_SUFFIXES = {".txt", ".md"}
AUDIO_SUFFIXES = {".wav", ".mp3", ".m4a", ".flac", ".ogg"}


def _read_text(path: Path | None) -> str:
    if not path or not path.exists():
        return ""
    return path.read_text(encoding="utf-8").strip()


def _base_id(path: Path) -> str:
    name = path.name
    for marker in (".prompt", ".transcript", ".response", ".essay", ".draft"):
        if marker in name:
            return name.split(marker, 1)[0]
    return path.stem


def discover_inputs(input_dir: Path) -> list[PracticeInput]:
    buckets: dict[tuple[str, str], PracticeInput] = {}
    for path in sorted(input_dir.rglob("*")):
        if not path.is_file():
            continue
        suffix = path.suffix.lower()
        lower_name = path.name.lower()
        if suffix in AUDIO_SUFFIXES and "speaking" in lower_name:
            item_id = _base_id(path)
            key = (item_id, "speaking")
            buckets.setdefault(key, PracticeInput(item_id=item_id, item_type="speaking")).audio_path = path
        elif suffix in TEXT_SUFFIXES and "speaking" in lower_name and ".transcript." in lower_name:
            item_id = _base_id(path)
            key = (item_id, "speaking")
            buckets.setdefault(key, PracticeInput(item_id=item_id, item_type="speaking")).transcript_path = path
        elif suffix in TEXT_SUFFIXES and "speaking" in lower_name and ".prompt." in lower_name:
            item_id = _base_id(path)
            key = (item_id, "speaking")
            buckets.setdefault(key, PracticeInput(item_id=item_id, item_type="speaking")).prompt_path = path
        elif suffix in TEXT_SUFFIXES and "writing" in lower_name and ".prompt." in lower_name:
            item_id = _base_id(path)
            key = (item_id, "writing")
            buckets.setdefault(key, PracticeInput(item_id=item_id, item_type="writing")).prompt_path = path
        elif suffix in TEXT_SUFFIXES and "writing" in lower_name:
            item_id = _base_id(path)
            key = (item_id, "writing")
            buckets.setdefault(key, PracticeInput(item_id=item_id, item_type="writing")).response_path = path

    items = list(buckets.values())
    for item in items:
        item.prompt_text = _read_text(item.prompt_path)
        item.response_text = _read_text(item.response_path)
        item.transcript_text = _read_text(item.transcript_path)
        if item.item_type == "speaking" and not item.audio_path and not item.transcript_path:
            item.notes.append("No audio or transcript detected.")
        if item.item_type == "writing" and not item.response_path:
            item.notes.append("No writing response detected.")
    return sorted(items, key=lambda entry: (entry.item_type, entry.item_id))
