# Bengaluru Namma Metro — Live Operations Dashboard

A polished, desktop-first dashboard that visualizes the **Namma Metro** (Bengaluru) network
as a live operations display — think flight tracker / railway control room. Trains glide
along the Purple and Green lines in real time, stations pulse with estimated activity, and a
floating statistics strip reports the state of the network.

There is **no live GPS feed** for Namma Metro, so this is not a real-time tracker and does not
pretend to be one. Instead, train positions and station activity are **computed
deterministically** from the published schedule and the current system time. The whole thing
is a static site backed by an offline data pipeline — **build once, run indefinitely**.

> ⚠️ All passenger, activity, and wait-time figures are **estimates**, derived from historical
> ridership patterns and published service frequencies, and are labelled as such throughout the
> UI. Nothing here is a measured real-time count.

**Scope:** Green Line and Purple Line (the original Phase-1 lines), interchanging at
Nadaprabhu Kempegowda Station (Majestic). The data model is line-agnostic, so more lines drop
in later simply by re-running the pipeline.

---

## What it does

- **Semantic-zoom map** (MapLibre GL, token-free dark basemap): the whole network at far zoom;
  station names, interchanges and train spacing at medium zoom; full station/train detail up close.
- **Continuous train animation** — positions interpolated along real OSM track geometry from a
  headway-based schedule model. Trains never jump between stations.
- **Floating statistics** — active trains, average wait, network activity score, estimated
  passengers in transit, operational status; all live and time-aware.
- **Station panel** — estimated activity, upcoming arrivals, typical daily usage, line
  membership, interchange status, distance from Majestic, service frequency, operating status.
- **Train panel** — line, direction, previous/next station, ETA, live interpolated position.
- **Simulation controls** — `LIVE · PAUSE · 1× · 2× · 5× · 10×` and a **timeline slider** to
  scrub any time of day. Everything (trains, activity, stats) recomputes from the same clock.
- **Camera presets** (Network · Purple · Green · Majestic · Reset) with smooth easing, **line
  filtering** (statistics stay full-network), search, and a compact legend.

## Architecture in one breath

```
┌─ data-pipeline/ (Python, run offline) ──────────────────────────────┐
│  OSM Overpass ─┐                                                     │
│  ridership ────┼─► process ─► validate ─► metro-bundle.json ─────────┼─► web/public/data/
│  config ───────┘                                                     │
└─────────────────────────────────────────────────────────────────────┘
┌─ web/ (React + TS, static) ─────────────────────────────────────────┐
│  metro-bundle.json ─► sim engine (clock·geometry·trains·activity·    │
│                       stats, pure fns) ─► Zustand ─► MapLibre + panels│
└─────────────────────────────────────────────────────────────────────┘
```

No runtime backend, no API tokens, no accounts, no database. See [ARCHITECTURE.md](ARCHITECTURE.md)
for the full design.

## Data sources

| Need | Source | Notes |
|------|--------|-------|
| Line geometry, ordered stations, coordinates, interchange | [OpenStreetMap](https://www.openstreetmap.org) via the Overpass API | `route=subway` relations for Purple & Green; current and authoritative |
| Station ridership | [Vonter/bmrcl-ridership-hourly](https://github.com/Vonter/bmrcl-ridership-hourly) | Real RTI-sourced hourly entry/exit counts → per-station hour-of-day activity profiles |
| Headways, hours, run-times | `data-pipeline/config/lines.yaml` | BMRCL published service frequencies (no machine-readable feed exists) |

Geometry and stations are **never hardcoded** — they are derived from OSM each pipeline run.
The processed `metro-bundle.json` is committed as a fallback snapshot so the app always runs
even offline.

## Quick start

Prerequisites: **Node ≥ 18** and **Python ≥ 3.10**.

### 1. Build the data bundle (optional — a committed snapshot already exists)

```bash
cd data-pipeline
pip install -r requirements.txt
python src/pipeline.py            # fetch latest OSM + ridership, rebuild bundle
# python src/pipeline.py --offline  # rebuild from cached downloads only
```

This writes `data-pipeline/output/metro-bundle.json` and copies it into `web/public/data/`.

### 2. Run the dashboard

```bash
cd web
npm install
npm run dev        # http://localhost:5173
```

For a production build: `npm run build` then `npm run preview` (output in `web/dist/`, fully static).

## Project structure

```
.
├── data-pipeline/           # Python: derive a static bundle from public data
│   ├── config/lines.yaml    # line theming + schedule model (headways/hours/speed)
│   ├── src/
│   │   ├── ingest_osm.py        # Overpass → ordered stations + stitched track geometry
│   │   ├── ingest_ridership.py  # download + unzip ridership CSVs
│   │   ├── process.py           # build graph, distances, ridership profiles, interchange
│   │   ├── validate.py          # sanity checks (counts, monotonic distances, colours)
│   │   ├── build_bundle.py      # emit metro-bundle.json (+ copy to web/public/data)
│   │   └── pipeline.py          # orchestrator (resilient: live → cache → snapshot)
│   └── output/metro-bundle.json # committed fallback snapshot
└── web/                     # React + TypeScript + Vite static app
    └── src/
        ├── sim/             # pure simulation engine (clock, geometry, trains, activity, stats)
        ├── map/             # MapLibre setup, layers, basemap, geojson builders
        ├── components/      # TopBar, panels, search, controls, timeline, legend
        ├── store/           # Zustand dashboard state
        └── data/            # bundle loader + indexing
```

## Honest estimation

Activity and passenger figures combine the time of day, day type, published service frequency,
and **real historical hourly ridership** per station. They are estimates of *typical* conditions,
not live measurements, and the UI marks them `est.` Wait time is reported as half the current
headway. See [ARCHITECTURE.md](ARCHITECTURE.md#honest-estimation) for the methodology.

## Auto-refresh

A GitHub Action ([`.github/workflows/refresh-data.yml`](.github/workflows/refresh-data.yml))
re-runs the pipeline weekly and commits the updated bundle, so the dashboard tracks the latest
public data with zero manual maintenance.

## Tech stack

React · TypeScript · Vite · MapLibre GL JS · Zustand · Recharts · Lucide · Python (Overpass +
pandas). Token-free and open-source throughout.

## Attribution

Map data © OpenStreetMap contributors. Basemap tiles © [CARTO](https://carto.com/attributions).
Ridership data via [Vonter/bmrcl-ridership-hourly](https://github.com/Vonter/bmrcl-ridership-hourly)
(RTI-sourced). This is a personal, non-commercial visualization project and is not affiliated
with BMRCL.
