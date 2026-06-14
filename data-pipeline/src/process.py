"""Process raw OSM + ridership into the compact metro-bundle consumed by the frontend.

Pipeline of pure-ish transforms:
  1. Select the canonical (max-stop) OSM route relation per configured line ref.
  2. Stitch member ways into one ordered polyline; order stations along it.
  3. Detect interchanges by normalized station name across lines (-> Majestic).
  4. Compute each station's distance-along-line and distance-from-Majestic.
  5. Build honest per-station hour-of-day ridership profiles (weekday/weekend) from the
     RTI dataset, matching station names fuzzily; synthesize a fallback where unmatched.

The output dict is serialized by build_bundle.py. No timetables are hardcoded: per-segment
travel times are derived from geometry + the configured scheduled speed and dwell.
"""
from __future__ import annotations

import difflib
import json
import math
import re
import sys
from pathlib import Path

import pandas as pd
import yaml

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "cache"
CONFIG = ROOT / "config" / "lines.yaml"

# Generic weekday demand curve used only when a station can't be matched to ridership
# data. Bimodal (AM/PM commute peaks). Values are relative, normalized later.
_FALLBACK_WEEKDAY = [
    2, 1, 1, 1, 2, 8, 30, 70, 100, 85, 55, 45, 48, 46, 44, 50, 62, 88, 95, 70, 48, 32, 18, 8,
]
_FALLBACK_WEEKEND = [
    3, 2, 1, 1, 2, 6, 18, 35, 55, 72, 85, 90, 88, 84, 80, 82, 86, 90, 92, 80, 60, 42, 26, 12,
]


# --------------------------------------------------------------------------- geometry
def haversine_m(lng1: float, lat1: float, lng2: float, lat2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def _gap(a: tuple[float, float], b: tuple[float, float]) -> float:
    return haversine_m(a[0], a[1], b[0], b[1])


def stitch_path(ways: list[list[tuple[float, float]]]) -> list[tuple[float, float]]:
    """Stitch ordered way geometries into a single oriented polyline of (lng, lat)."""
    ways = [w for w in ways if len(w) >= 2]
    if not ways:
        return []
    path = list(ways[0])
    if len(ways) > 1:
        nxt = ways[1]
        # Orient the first way so its END is the join point with the next way.
        if min(_gap(path[0], nxt[0]), _gap(path[0], nxt[-1])) < min(
            _gap(path[-1], nxt[0]), _gap(path[-1], nxt[-1])
        ):
            path.reverse()
    for seg in ways[1:]:
        end = path[-1]
        seg_oriented = seg if _gap(end, seg[0]) <= _gap(end, seg[-1]) else list(reversed(seg))
        # Drop a duplicated joint vertex if the ways already touch.
        start_idx = 1 if _gap(end, seg_oriented[0]) < 5 else 0
        path.extend(seg_oriented[start_idx:])
    return path


def cumulative(path: list[tuple[float, float]]) -> list[float]:
    cum = [0.0]
    for i in range(1, len(path)):
        cum.append(cum[-1] + _gap(path[i - 1], path[i]))
    return cum


def project_distance(pt: tuple[float, float], path: list[tuple[float, float]], cum: list[float]) -> float:
    """Distance along `path` (metres) of the closest point to `pt`."""
    best_d2 = float("inf")
    best_along = 0.0
    plng, plat = pt
    # Local metres-per-degree scale for cheap planar projection near Bengaluru.
    mlat = 111_320.0
    mlng = 111_320.0 * math.cos(math.radians(plat))
    for i in range(len(path) - 1):
        ax, ay = path[i]
        bx, by = path[i + 1]
        ax_m, ay_m = ax * mlng, ay * mlat
        bx_m, by_m = bx * mlng, by * mlat
        px_m, py_m = plng * mlng, plat * mlat
        dx, dy = bx_m - ax_m, by_m - ay_m
        seg_len2 = dx * dx + dy * dy
        t = 0.0 if seg_len2 == 0 else ((px_m - ax_m) * dx + (py_m - ay_m) * dy) / seg_len2
        t = max(0.0, min(1.0, t))
        cx, cy = ax_m + t * dx, ay_m + t * dy
        d2 = (px_m - cx) ** 2 + (py_m - cy) ** 2
        if d2 < best_d2:
            best_d2 = d2
            best_along = cum[i] + t * (cum[i + 1] - cum[i])
    return best_along


# ------------------------------------------------------------------------ name matching
def normalize_name(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"\((?:purple|green|yellow|blue|pink)\s+line\)", " ", s)  # strip line suffix
    s = s.replace("stn.", "station").replace("stn ", "station ")
    s = re.sub(r"[.,]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def slugify(normalized: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")


def clean_display_name(name: str) -> str:
    """Drop the '(Purple Line)' / '(Green Line)' suffix OSM puts on interchange stops."""
    return re.sub(r"\s*\((?:purple|green|yellow|blue|pink)\s+line\)", "", name, flags=re.I).strip()


# ------------------------------------------------------------------------- OSM parsing
def load_osm(raw: dict):
    elements = raw["elements"]
    rels = [e for e in elements if e.get("type") == "relation"]
    node_names = {
        e["id"]: e["tags"].get("name")
        for e in elements
        if e.get("type") == "node" and e.get("tags") and e["tags"].get("name")
    }
    return rels, node_names


def canonical_relation(rels: list[dict], ref: str) -> dict:
    candidates = [r for r in rels if r.get("tags", {}).get("ref") == ref]
    if not candidates:
        raise ValueError(f"No OSM relation found with ref={ref!r}")

    def stop_count(r: dict) -> int:
        return sum(1 for m in r.get("members", []) if m.get("role", "").startswith("stop"))

    return max(candidates, key=stop_count)


def relation_stations(rel: dict, node_names: dict) -> list[dict]:
    """Ordered station stops: name + coordinates, de-duplicating consecutive repeats."""
    out: list[dict] = []
    for m in rel.get("members", []):
        if not m.get("role", "").startswith("stop") or m.get("type") != "node":
            continue
        name = node_names.get(m["ref"])
        if not name:
            continue
        if out and out[-1]["name"] == name:
            continue
        out.append({"name": name, "lng": m["lon"], "lat": m["lat"]})
    return out


def relation_path(rel: dict) -> list[tuple[float, float]]:
    ways: list[list[tuple[float, float]]] = []
    for m in rel.get("members", []):
        if m.get("type") == "way" and m.get("role", "") == "" and m.get("geometry"):
            ways.append([(g["lon"], g["lat"]) for g in m["geometry"]])
    return stitch_path(ways)


# ----------------------------------------------------------------------- ridership
def build_ridership_profiles() -> tuple[dict, dict]:
    """Return {normalized_name -> profile} and meta about the dataset."""
    entries = pd.read_csv(CACHE / "ridership_entries.csv", sep=";")
    exits = pd.read_csv(CACHE / "ridership_exits.csv", sep=";")
    merged = entries.merge(
        exits, on=["Date", "Hour", "Station"], how="outer", suffixes=("_in", "_out")
    ).fillna(0)
    merged["total"] = merged["Ridership_in"] + merged["Ridership_out"]
    merged["dow"] = pd.to_datetime(merged["Date"]).dt.dayofweek
    merged["is_weekend"] = merged["dow"] >= 5

    date_min, date_max = str(merged["Date"].min()), str(merged["Date"].max())
    profiles: dict[str, dict] = {}

    for station, grp in merged.groupby("Station"):
        wk = grp[~grp["is_weekend"]]
        we = grp[grp["is_weekend"]]

        def hourly(df: pd.DataFrame) -> list[float]:
            by_hour = df.groupby("Hour")["total"].mean()  # mean per hour across days
            return [float(by_hour.get(h, 0.0)) for h in range(24)]

        wk_h = hourly(wk)
        we_h = hourly(we)
        wk_max = max(wk_h) or 1.0
        we_max = max(we_h) or 1.0
        profiles[normalize_name(str(station))] = {
            "raw_name": str(station),
            "hourlyWeekday": [round(v / wk_max, 4) for v in wk_h],
            "hourlyWeekend": [round(v / we_max, 4) for v in we_h],
            "dailyAvg": int(round(sum(wk_h))),  # avg weekday throughput (entries+exits)
            "weekendDailyAvg": int(round(sum(we_h))),
            "peakHour": int(max(range(24), key=lambda h: wk_h[h])),
        }
    return profiles, {"dateMin": date_min, "dateMax": date_max, "stations": len(profiles)}


def match_profile(norm_name: str, profiles: dict) -> dict | None:
    if norm_name in profiles:
        return profiles[norm_name]
    close = difflib.get_close_matches(norm_name, list(profiles.keys()), n=1, cutoff=0.84)
    return profiles[close[0]] if close else None


# --------------------------------------------------------------------------- assemble
def process() -> dict:
    cfg = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    osm_raw = json.loads((CACHE / "osm_raw.json").read_text(encoding="utf-8"))
    rels, node_names = load_osm(osm_raw)
    profiles, ridership_meta = build_ridership_profiles()

    stations: dict[str, dict] = {}   # slug -> station record (deduped across lines)
    lines_out: list[dict] = []
    unmatched: list[str] = []

    for lc in cfg["lines"]:
        rel = canonical_relation(rels, lc["ref"])
        raw_stations = relation_stations(rel, node_names)
        path = relation_path(rel)
        cum = cumulative(path)
        path_len = cum[-1] if cum else 0.0

        line_station_ids: list[str] = []
        line_distances: list[float] = []
        prev_along = -1.0
        for st in raw_stations:
            norm = normalize_name(st["name"])
            slug = slugify(norm)
            along = project_distance((st["lng"], st["lat"]), path, cum)
            along = max(along, prev_along + 1.0)  # enforce monotonic ordering
            prev_along = along

            if slug not in stations:
                prof = match_profile(norm, profiles)
                if prof is None:
                    unmatched.append(st["name"])
                stations[slug] = {
                    "id": slug,
                    "name": clean_display_name(st["name"]),
                    "lng": round(st["lng"], 6),
                    "lat": round(st["lat"], 6),
                    "lines": [],
                    "lineSeq": {},        # line id -> index along that line
                    "distanceAlong": {},  # line id -> metres along that line's path
                    "interchange": False,
                    "ridership": _ridership_record(prof),
                }
            rec = stations[slug]
            if lc["id"] not in rec["lines"]:
                rec["lines"].append(lc["id"])
            rec["lineSeq"][lc["id"]] = len(line_station_ids)
            rec["distanceAlong"][lc["id"]] = round(along, 1)
            if len(rec["lines"]) > 1:
                rec["interchange"] = True

            line_station_ids.append(slug)
            line_distances.append(round(along, 1))

        # Derive per-segment travel times from geometry (no hardcoded timetable).
        speed_mps = cfg["schedule"]["scheduleSpeedKmph"] * 1000 / 3600
        dwell = cfg["schedule"]["dwellSec"]
        seg_times = []
        for i in range(1, len(line_distances)):
            seg_len = line_distances[i] - line_distances[i - 1]
            seg_times.append(round(seg_len / speed_mps + dwell, 1))
        run_time = round(sum(seg_times), 1)

        lines_out.append({
            "id": lc["id"],
            "ref": lc["ref"],
            "name": lc["name"],
            "colour": lc["colour"],
            "osmColour": lc.get("osm_colour"),
            "from": clean_display_name(raw_stations[0]["name"]) if raw_stations else None,
            "to": clean_display_name(raw_stations[-1]["name"]) if raw_stations else None,
            "stations": line_station_ids,
            "stationDistancesM": line_distances,
            "path": [[round(x, 6), round(y, 6)] for x, y in path],
            "lengthM": round(path_len, 1),
            "segmentTimesSec": seg_times,
            "runTimeSec": run_time,
        })

    # Distance from the Majestic interchange along each line.
    majestic = next((s for s in stations.values() if s["interchange"]), None)
    for st in stations.values():
        st["distanceFromMajestic"] = {}
        if majestic:
            for lid in st["lines"]:
                if lid in majestic["distanceAlong"] and lid in st["distanceAlong"]:
                    st["distanceFromMajestic"][lid] = round(
                        abs(st["distanceAlong"][lid] - majestic["distanceAlong"][lid]), 1
                    )

    interchanges = [
        {"id": s["id"], "name": s["name"], "lng": s["lng"], "lat": s["lat"], "lines": s["lines"]}
        for s in stations.values()
        if s["interchange"]
    ]

    network_daily = sum(s["ridership"]["dailyAvg"] for s in stations.values())

    bundle = {
        "meta": {
            "network": cfg["network"]["name"],
            "city": cfg["network"]["city"],
            "scope": [l["id"] for l in lines_out],
            "sources": {
                "geometry": "OpenStreetMap via Overpass API (route=subway, network~Namma)",
                "ridership": "Vonter/bmrcl-ridership-hourly (RTI-sourced station hourly counts)",
                "schedule": "BMRCL published frequencies (config/lines.yaml)",
            },
            "ridership": ridership_meta,
            "networkDailyThroughput": network_daily,
            "estimateDisclaimer": (
                "Activity, passengers and waits are estimates derived from historical hourly "
                "ridership and published headways — not live or exact counts."
            ),
            "unmatchedStations": unmatched,
        },
        "schedule": cfg["schedule"],
        "lines": lines_out,
        "stations": list(stations.values()),
        "interchanges": interchanges,
    }
    return bundle


def _ridership_record(prof: dict | None) -> dict:
    if prof is None:
        wk_max = max(_FALLBACK_WEEKDAY)
        we_max = max(_FALLBACK_WEEKEND)
        return {
            "matched": False,
            "hourlyWeekday": [round(v / wk_max, 4) for v in _FALLBACK_WEEKDAY],
            "hourlyWeekend": [round(v / we_max, 4) for v in _FALLBACK_WEEKEND],
            "dailyAvg": 0,
            "peakHour": int(max(range(24), key=lambda h: _FALLBACK_WEEKDAY[h])),
        }
    return {
        "matched": True,
        "matchedName": prof["raw_name"],
        "hourlyWeekday": prof["hourlyWeekday"],
        "hourlyWeekend": prof["hourlyWeekend"],
        "dailyAvg": prof["dailyAvg"],
        "peakHour": prof["peakHour"],
    }


if __name__ == "__main__":
    b = process()
    print("lines:", [(l["id"], len(l["stations"]), f"{l['lengthM']/1000:.1f}km",
                      f"{l['runTimeSec']/60:.0f}min") for l in b["lines"]])
    print("stations:", len(b["stations"]))
    print("interchanges:", [(i["name"], i["lines"]) for i in b["interchanges"]])
    print("unmatched:", b["meta"]["unmatchedStations"])
    print("network daily throughput:", b["meta"]["networkDailyThroughput"])
