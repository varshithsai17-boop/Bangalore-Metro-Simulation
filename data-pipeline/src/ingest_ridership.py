"""Ingest BMRCL station-wise hourly ridership (entries + exits) from the public
Vonter/bmrcl-ridership-hourly dataset (RTI-sourced).

Downloads the zipped CSVs to the cache directory and extracts them. These feed the
honest per-station hour-of-day activity profiles built in process.py. Real-time exact
counts do not exist; this historical data is the most defensible basis for estimates.

    python src/ingest_ridership.py
"""
from __future__ import annotations

import io
import sys
import zipfile
from pathlib import Path

import requests

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass

CACHE = Path(__file__).resolve().parent.parent / "cache"
CACHE.mkdir(exist_ok=True)

BASE = "https://raw.githubusercontent.com/Vonter/bmrcl-ridership-hourly/main/data"
FILES = {
    "entries": f"{BASE}/station-hourly.csv.zip",
    "exits": f"{BASE}/station-hourly-exits.csv.zip",
}
USER_AGENT = "namma-metro-dashboard/1.0 (personal project)"


def ingest() -> dict[str, Path]:
    out: dict[str, Path] = {}
    for key, url in FILES.items():
        print(f"  downloading {key}: {url}")
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=120)
        resp.raise_for_status()
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            csv_name = next(n for n in zf.namelist() if n.endswith(".csv"))
            target = CACHE / f"ridership_{key}.csv"
            target.write_bytes(zf.read(csv_name))
            out[key] = target
            print(f"    extracted {csv_name} -> {target} ({target.stat().st_size} bytes)")
    return out


if __name__ == "__main__":
    try:
        paths = ingest()
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
    # Quick structure preview
    import pandas as pd

    for key, path in paths.items():
        df = pd.read_csv(path)
        print(f"\n=== {key} === shape={df.shape}")
        print("columns:", list(df.columns))
        print(df.head(5).to_string())
        # show distinct station names if such a column exists
        for col in df.columns:
            if df[col].dtype == object and df[col].nunique() < 80:
                print(f"\ndistinct '{col}' ({df[col].nunique()}):")
                print(sorted(df[col].dropna().unique().tolist())[:80])
                break
