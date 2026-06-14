"""Sanity-check a processed bundle before it is written/shipped.

Raises AssertionError with a clear message on any structural problem so a bad refresh
never silently produces a broken app.
"""
from __future__ import annotations


def validate(bundle: dict) -> list[str]:
    warnings: list[str] = []
    lines = bundle["lines"]
    stations = {s["id"]: s for s in bundle["stations"]}

    assert lines, "no lines in bundle"
    assert stations, "no stations in bundle"

    for ln in lines:
        ids = ln["stations"]
        dists = ln["stationDistancesM"]
        assert len(ids) >= 10, f"line {ln['id']} has too few stations ({len(ids)})"
        assert len(ids) == len(dists), f"line {ln['id']} station/distance length mismatch"
        assert len(ln["path"]) >= 2, f"line {ln['id']} has no path geometry"
        assert ln["lengthM"] > 5000, f"line {ln['id']} path length implausibly small"
        # distances strictly increasing and within the path length
        for i in range(1, len(dists)):
            assert dists[i] > dists[i - 1], f"line {ln['id']} distances not monotonic at {i}"
        assert dists[-1] <= ln["lengthM"] + 50, f"line {ln['id']} last station beyond path end"
        assert ln.get("colour", "").startswith("#"), f"line {ln['id']} missing colour"
        assert len(ln["segmentTimesSec"]) == len(ids) - 1, f"line {ln['id']} segment time count off"
        assert ln["runTimeSec"] > 600, f"line {ln['id']} run time implausibly short"
        for sid in ids:
            assert sid in stations, f"line {ln['id']} references unknown station {sid}"

    for s in bundle["stations"]:
        assert -90 <= s["lat"] <= 90 and -180 <= s["lng"] <= 180, f"{s['id']} bad coords"
        r = s["ridership"]
        assert len(r["hourlyWeekday"]) == 24, f"{s['id']} weekday profile not 24h"
        assert len(r["hourlyWeekend"]) == 24, f"{s['id']} weekend profile not 24h"
        assert s["lines"], f"{s['id']} belongs to no line"
        if not r.get("matched", False):
            warnings.append(f"station {s['id']} ({s['name']}) has no ridership match (synthetic)")

    assert bundle["interchanges"], "no interchange detected (expected Majestic)"

    sched = bundle["schedule"]
    assert sched["headways"], "no headways configured"
    for dtype in ("weekday", "saturday", "sunday"):
        assert dtype in sched["operatingHours"], f"missing operating hours for {dtype}"

    return warnings


if __name__ == "__main__":
    import sys
    from process import process

    b = process()
    warns = validate(b)
    print(f"OK: {len(b['lines'])} lines, {len(b['stations'])} stations, "
          f"{len(b['interchanges'])} interchange(s).")
    for w in warns:
        print("  warn:", w)
    sys.exit(0)
