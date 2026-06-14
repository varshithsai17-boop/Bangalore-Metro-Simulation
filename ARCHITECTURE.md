# Architecture

This document explains how the Namma Metro dashboard is put together: the offline data
pipeline, the bundle it produces, the client-side simulation engine, and the rendering layer.

## Guiding principle

There is no live GPS feed for Namma Metro. Rather than fake one, **everything is a pure
function of `(static data, timestamp)`**. Given the network geometry, a schedule model, and a
moment in time, the position of every train and the activity at every station is fully
determined. That single decision shapes the whole architecture:

- No runtime backend or websocket is needed — the browser computes the "live" state itself.
- Scrubbing the timeline or changing simulation speed is just feeding a different timestamp
  into the same pure functions.
- The app is a static site that runs indefinitely; Python is only needed *offline* to refresh
  the input data.

```
(metro-bundle.json, now) ──► sim engine ──► { trains[], station activity[], network stats }
```

## 1. Data pipeline (`data-pipeline/`, Python, offline)

A five-stage pipeline turns public data into one compact JSON bundle. It is resilient: each
ingest step falls back to a cached download, and the committed `output/metro-bundle.json` is
the ultimate fallback, so a build never depends on a source being up.

| Stage | Module | What it does |
|-------|--------|--------------|
| Ingest geometry | `ingest_osm.py` | Queries the Overpass API for the `route=subway` relations of each configured line; picks the canonical (max-stop) relation per `ref`; extracts ordered stop nodes and stitches the member ways into one continuous polyline per line. |
| Ingest ridership | `ingest_ridership.py` | Downloads and unzips the hourly station entry/exit CSVs. |
| Process | `process.py` | Builds the station graph; computes each station's distance along its line and per-segment travel times; derives per-station **hour-of-day ridership profiles** (weekday/weekend, normalized); detects the interchange (a station on >1 line). |
| Validate | `validate.py` | Asserts sane station counts, monotonic distances, present colours, and that every station has coordinates and a profile. |
| Build | `build_bundle.py` | Emits `metro-bundle.json` and copies it into `web/public/data/`. |

Geometry and stations are **derived, never hardcoded**. Only display theming and the schedule
model (which has no machine-readable source) live in `config/lines.yaml`.

### Schedule model

Namma Metro publishes service frequencies, not a GTFS timetable, so `config/lines.yaml`
encodes: operating hours per day type, headway windows (≈5 min peak / 8 min midday / 10–12 min
early-late), an effective scheduled speed, and a fixed dwell. Per-segment travel times are
computed from inter-station distance ÷ speed + dwell — no timetable is invented.

## 2. The bundle (`metro-bundle.json`)

The single artifact the web app consumes (~77 KB):

```jsonc
{
  "meta":    { "network", "city", "generatedAt", "sources" },
  "schedule":{ "operatingHours", "headways", "scheduleSpeedKmph", "dwellSec" },
  "lines": [{
    "id", "name", "colour", "from", "to",
    "path": [[lng,lat], …],          // stitched OSM track geometry
    "stations": ["station-id", …],   // ordered along the line
    "stationDistancesM": [m, …],     // each station's distance along the path
    "segmentTimesSec": [s, …],       // derived per-segment travel time
    "lengthM", "runTimeSec"
  }],
  "stations": [{
    "id", "name", "lng", "lat",
    "lines": ["purple", …], "interchange": bool,
    "distanceAlong": { "purple": m },
    "ridership": { "matched", "hourlyWeekday": [24], "hourlyWeekend": [24], "dailyAvg" }
  }],
  "interchanges": ["station-id", …]
}
```

On load, `data/loadBundle.ts` indexes it into maps (`stationById`, `lineById`) and precomputes
each line's cumulative path distances for fast interpolation.

## 3. Simulation engine (`web/src/sim/`, pure TypeScript)

All modules are pure functions of the bundle and a timestamp — no side effects, unit-testable.

- **`clock.ts`** — day type and operating window for a timestamp; headway for a minute-of-day;
  IST helpers. The store's clock advances `virtual = anchorVirtual + (realNow − anchorReal) ×
  speed`, so LIVE, PAUSE, speed, and timeline-scrub are all the same anchor mechanism.
- **`geometry.ts`** — `interpolateAlong(path, cumDist, d)` returns the lng/lat **and bearing**
  at distance `d` along a polyline. This is what makes train motion continuous and never
  jump between stations.
- **`trains.ts`** — the heart of it. For each line and direction, it enumerates terminus
  departure times across the day (honoring headway windows). A train that departed `elapsed`
  seconds ago is placed by mapping `elapsed → segment (binary search on cumulative times) →
  route-progress distance → path position`. Trains past `runTimeSec` are retired.
  `arrivalsAt()` reuses the same model to produce a station's upcoming-arrivals board, so the
  board always agrees with the moving dots.
- **`activity.ts`** — a station's activity at time `t` blends its hour-of-day ridership profile
  between the current and next hour, selecting the weekday/weekend curve. The result (0–1)
  drives station radius and colour on the map.
- **`stats.ts`** — network aggregates: active-train count, trains per line, average wait
  (= headway⁄2), estimated passengers in transit, network activity score, busiest/quietest
  station, line utilization.

The map runs `computeTrains` every animation frame (`requestAnimationFrame`) and refreshes
station activity a few times a second — cheap, because the bundle is small and the functions
are simple.

## 4. State (`web/src/store/useDashboard.ts`, Zustand)

A single store holds: the indexed bundle, the clock anchor (speed/paused/live), a throttled
reactive `nowMs` for UI panels, the current selection (station/train), the per-line visibility
filter, and search state. Components subscribe via selectors so unrelated updates don't
re-render them. The map reads the clock imperatively in its animation loop (not via React) to
keep 60 fps.

## 5. Rendering (`web/src/map/`, MapLibre GL JS)

- **Basemap** — CARTO "dark matter (no labels)" raster tiles + MapLibre's glyph endpoint for
  our own labels. Token-free; north-up locked, rotation disabled.
- **Sources** — three GeoJSON sources (`lines`, `stations`, `trains`) updated via `setData`
  (never re-adding layers).
- **Layers** — line glow + core; station circles (radius/colour data-driven by activity); a
  distinct interchange ring; semantic-zoom station labels (interchange labels surface first);
  a selection highlight; and trains as rotated, line-tinted symbol glyphs.
- **Semantic zoom** — label opacity/size and detail ramp with zoom via MapLibre expressions;
  clicking a station or train opens its contextual side panel.
- **Line filter** — toggling a line sets a MapLibre `filter` on the relevant layers via a store
  subscription set up where the layers are guaranteed to exist. Statistics deliberately remain
  full-network.

## Honest estimation

The dashboard never claims measured real-time numbers. Estimates are built from:

- **Time of day & day type** — selects the weekday/weekend ridership curve and the hour.
- **Real historical ridership** — per-station hourly entry/exit profiles (RTI-sourced) give the
  *shape* of demand at each station.
- **Published service frequency** — headway windows drive train density and average wait.

Activity (0–1) and "passengers in transit" are therefore estimates of *typical* conditions for
that time, surfaced with an `est.` label. Average wait is reported as half the current headway.
This is honest by construction: it models what the schedule and historical patterns imply, not
what is happening on any particular day.

## Notable engineering decisions

- **Client-side simulation over a backend.** Because state is deterministic from time, a server
  would add operational burden for no capability. The trade-off — the client does the compute —
  is trivial at this scale (two lines, 68 stations).
- **Token-free basemap.** Mapbox would look great but needs a metered API token; MapLibre + CARTO
  keeps the "runs indefinitely with zero maintenance" promise.
- **Committed bundle snapshot.** The app ships with a valid bundle so it runs with no pipeline
  run and survives any upstream outage; the pipeline just keeps it fresh.
- **Line-agnostic data model.** Adding Yellow/Pink/Blue later is a config + pipeline-run change,
  not a code change.
