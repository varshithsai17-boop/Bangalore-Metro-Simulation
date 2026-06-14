"""End-to-end data pipeline orchestrator.

  ingest OSM  ->  ingest ridership  ->  process  ->  validate  ->  build bundle

Each ingest step is resilient: if a live source is unreachable but a cached copy exists,
the pipeline proceeds with the cache (and the committed snapshot remains the ultimate
fallback). Run:

    python src/pipeline.py            # full refresh (fetch live, rebuild bundle)
    python src/pipeline.py --offline  # skip fetching, rebuild from existing cache
"""
from __future__ import annotations

import sys
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ingest_osm
import ingest_ridership
from build_bundle import write_bundle
from process import process
from validate import validate

CACHE = Path(__file__).resolve().parent.parent / "cache"


def _step(name: str) -> None:
    print(f"\n=== {name} ===")


def run(offline: bool = False) -> None:
    _step("1/5 Ingest OSM geometry")
    if offline and (CACHE / "osm_raw.json").exists():
        print("  offline: using cached osm_raw.json")
    else:
        try:
            ingest_osm.ingest()
        except Exception as exc:  # noqa: BLE001
            if (CACHE / "osm_raw.json").exists():
                print(f"  fetch failed ({exc}); using cached osm_raw.json")
            else:
                raise

    _step("2/5 Ingest ridership")
    have_ridership = (CACHE / "ridership_entries.csv").exists()
    if offline and have_ridership:
        print("  offline: using cached ridership CSVs")
    else:
        try:
            ingest_ridership.ingest()
        except Exception as exc:  # noqa: BLE001
            if have_ridership:
                print(f"  fetch failed ({exc}); using cached ridership CSVs")
            else:
                raise

    _step("3/5 Process")
    bundle = process()
    print(f"  {len(bundle['lines'])} lines, {len(bundle['stations'])} stations, "
          f"{len(bundle['interchanges'])} interchange(s)")

    _step("4/5 Validate")
    warnings = validate(bundle)
    print(f"  passed with {len(warnings)} warning(s)")
    for w in warnings:
        print("    warn:", w)

    _step("5/5 Build bundle")
    write_bundle(bundle)
    print("\nPipeline complete.")


if __name__ == "__main__":
    run(offline="--offline" in sys.argv)
