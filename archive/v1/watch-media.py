#!/usr/bin/env python3
"""
watch-media.py — regenerate manifest.json whenever assets/media/ changes.

Run this alongside the kiosk. Polls the media folder every 5 seconds; when
the contents change, rewrites manifest.json. Designed for macOS Bash 3.2 /
Debian 12 alike — pure stdlib, no dependencies.

Usage:
    python3 scripts/watch-media.py [--root <project_root>] [--interval 5]
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

ALLOWED_EXT = {".mp4", ".mov", ".webm", ".m4v", ".jpg", ".jpeg", ".png", ".webp"}

def scan(media_dir: Path):
    items = []
    for p in sorted(media_dir.iterdir() if media_dir.exists() else []):
        if p.is_file() and p.suffix.lower() in ALLOWED_EXT and not p.name.startswith("."):
            items.append(p.name)
    return items

def write_manifest(root: Path, names: list[str]):
    manifest_path = root / "manifest.json"
    payload = {
        "items": [f"assets/media/{n}" for n in names],
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    tmp = manifest_path.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    tmp.replace(manifest_path)
    print(f"[watch-media] wrote {len(names)} items -> manifest.json")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(Path(__file__).resolve().parent.parent))
    ap.add_argument("--interval", type=float, default=5.0)
    args = ap.parse_args()

    root = Path(args.root).resolve()
    media_dir = root / "assets" / "media"
    print(f"[watch-media] watching {media_dir} every {args.interval}s")

    last = None
    while True:
        try:
            current = scan(media_dir)
            if current != last:
                write_manifest(root, current)
                last = current
        except Exception as e:
            print(f"[watch-media] error: {e}", file=sys.stderr)
        time.sleep(args.interval)

if __name__ == "__main__":
    main()
