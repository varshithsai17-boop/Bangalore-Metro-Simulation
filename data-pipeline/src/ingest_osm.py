"""Ingest Namma Metro line geometry + ordered stations from OpenStreetMap.

Queries the Overpass API for `route=subway` relations belonging to the Namma Metro
network and saves the raw JSON to the cache directory. Geometry resolution is handled
later in process.py; this module only fetches and persists the authoritative source.

Run directly to fetch and print a short summary of what was found:

    python src/ingest_osm.py
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import requests

# Windows consoles default to cp1252; force UTF-8 so logging never crashes on non-ASCII.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass

CACHE = Path(__file__).resolve().parent.parent / "cache"
CACHE.mkdir(exist_ok=True)
RAW_OSM = CACHE / "osm_raw.json"

# Public Overpass mirrors, tried in order. Token-free.
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

# All Namma Metro subway route relations (one per line+direction) with full geometry,
# followed by the member stop nodes with their tags (names live on the nodes, not the
# relation members). `out geom` attaches lat/lon to node members and coordinate arrays
# to way members; the trailing `node(r:"stop"); out tags;` yields station names by id.
OVERPASS_QUERY = """
[out:json][timeout:180];
relation["route"="subway"]["network"~"Namma",i];
out geom;
node(r:"stop");
out tags;
"""

USER_AGENT = "namma-metro-dashboard/1.0 (personal project; OSM Overpass client)"


def fetch_overpass(query: str = OVERPASS_QUERY) -> dict:
    """Fetch from the first responsive Overpass mirror, with simple retries."""
    last_err: Exception | None = None
    for endpoint in ENDPOINTS:
        for attempt in range(2):
            try:
                print(f"  -> querying {endpoint} (attempt {attempt + 1})")
                resp = requests.post(
                    endpoint,
                    data={"data": query},
                    headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
                    timeout=200,
                )
                resp.raise_for_status()
                return resp.json()
            except Exception as exc:  # noqa: BLE001 - report and try next mirror
                last_err = exc
                print(f"    failed: {exc}")
                time.sleep(3)
    raise RuntimeError(f"All Overpass mirrors failed; last error: {last_err}")


def ingest() -> dict:
    data = fetch_overpass()
    RAW_OSM.write_text(json.dumps(data), encoding="utf-8")
    print(f"  saved {RAW_OSM} ({RAW_OSM.stat().st_size} bytes)")
    return data


def _summarize(data: dict) -> None:
    elements = data.get("elements", [])
    rels = [e for e in elements if e.get("type") == "relation"]
    # node id -> name, from the trailing `out tags` node elements
    names = {
        e["id"]: e.get("tags", {}).get("name")
        for e in elements
        if e.get("type") == "node" and e.get("tags")
    }
    print(f"\nFound {len(rels)} route relation(s); {len(names)} named stop nodes.")

    # Pick the canonical (max-stop) relation per ref to preview the real station order.
    by_ref: dict[str, dict] = {}
    for r in rels:
        ref = r.get("tags", {}).get("ref")
        stops = [m for m in r.get("members", []) if m.get("role", "").startswith("stop")]
        if ref and (ref not in by_ref or len(stops) > by_ref[ref]["_n"]):
            by_ref[ref] = {"rel": r, "_n": len(stops)}

    for ref, info in by_ref.items():
        r = info["rel"]
        tags = r.get("tags", {})
        stops = [m for m in r.get("members", []) if m.get("role", "").startswith("stop")]
        ordered = [names.get(m["ref"], f"<{m['ref']}>") for m in stops]
        print(f"\n  === {ref} === id={r['id']} colour={tags.get('colour')!r} stops={len(stops)}")
        print(f"      {tags.get('from')!r} -> {tags.get('to')!r}")
        print("      stations: " + " | ".join(ordered))


if __name__ == "__main__":
    print("Ingesting Namma Metro OSM data...")
    try:
        data = ingest()
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
    _summarize(data)
