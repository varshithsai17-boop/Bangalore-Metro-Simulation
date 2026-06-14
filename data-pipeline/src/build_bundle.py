"""Serialize the processed bundle to disk and copy it into the web app.

Writes data-pipeline/output/metro-bundle.json (committed fallback snapshot) and copies it
to web/public/data/metro-bundle.json so the frontend loads it as a static asset.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "output" / "metro-bundle.json"
WEB_COPY = ROOT.parent / "web" / "public" / "data" / "metro-bundle.json"


def write_bundle(bundle: dict) -> None:
    bundle.setdefault("meta", {})["generatedAt"] = datetime.now(timezone.utc).isoformat()
    payload = json.dumps(bundle, ensure_ascii=False, separators=(",", ":"))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(payload, encoding="utf-8")
    print(f"  wrote {OUTPUT} ({len(payload)} bytes)")

    WEB_COPY.parent.mkdir(parents=True, exist_ok=True)
    WEB_COPY.write_text(payload, encoding="utf-8")
    print(f"  copied to {WEB_COPY}")


if __name__ == "__main__":
    from process import process
    from validate import validate

    b = process()
    validate(b)
    write_bundle(b)
