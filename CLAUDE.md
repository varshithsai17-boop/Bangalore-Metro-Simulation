# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

A desktop-first dashboard visualizing the Bengaluru Namma Metro (Purple + Green lines) as a live
operations display. See `README.md` for the product overview and `ARCHITECTURE.md` for the full
design. This file captures the non-obvious things.

## Commands

```bash
# Web app (web/)
cd web
npm install
npm run dev         # Vite dev server (http://localhost:5173)
npm run typecheck   # tsc --noEmit  — run this after edits; there is no separate lint step
npm run build       # tsc --noEmit && vite build  → web/dist (fully static)
npm run preview     # serve the production build

# Data pipeline (data-pipeline/) — Python, run offline
cd data-pipeline
pip install -r requirements.txt
python src/pipeline.py            # fetch latest OSM + ridership, rebuild + copy the bundle
python src/pipeline.py --offline  # rebuild from cached downloads only
```

There are no automated tests. The `sim/` modules are pure functions and are the right place to add
unit tests if needed. Verification is done by running the app (see "Verifying map changes" below).

## Big picture

Two decoupled halves around one artifact, **`metro-bundle.json`**:

- **`data-pipeline/`** (Python, offline): derives a compact static bundle from public data.
  `pipeline.py` runs ingest_osm → ingest_ridership → process → validate → build_bundle. Geometry,
  ordered stations, and coordinates come from the **OSM Overpass API** (`route=subway` relations) and
  are **never hardcoded**; ridership comes from the Vonter RTI dataset; only theming and the schedule
  model (headways/hours/speed — no machine feed exists) live in `config/lines.yaml`. The build copies
  the bundle into `web/public/data/` and a committed snapshot in `output/` is the offline fallback.

- **`web/`** (React + TS + Vite, static): there is **no runtime backend**. The core design decision:
  **everything is a pure function of `(bundle, timestamp)`**. Train positions and station activity are
  computed deterministically — there is no live GPS feed. LIVE / PAUSE / speed / timeline-scrub are all
  just different timestamps fed into the same `web/src/sim/` functions (`clock`, `geometry`, `trains`,
  `activity`, `stats`). `store/useDashboard.ts` (Zustand) holds the clock anchor, selection, and
  per-line filter. `map/MetroMap.tsx` runs the rAF animation loop and reads the clock imperatively (not
  via React) to stay at 60fps.

The data model is **line-agnostic** — adding Yellow/Pink/Blue later is a `config/lines.yaml` + pipeline
run, not a code change. All activity/passenger/wait figures are **estimates** and are labelled `est.`
in the UI; never present them as measured real-time counts.

## MapLibre gotchas (these caused real, hard-to-find bugs)

- **Line show/hide must use per-line layers + `setLayoutProperty(id, 'visibility', ...)`, NOT
  `setFilter`/`setData`.** MapLibre applies layer `filter`s and source data at *tile-build* time in a
  worker; toggling them leaves the rendered tiles stale (the hidden line keeps showing). In
  `MetroMap.tsx`, each line has its own `line-glow-${id}` / `line-core-${id}` / `stations-${id}` /
  `station-labels-${id}` / `trains-${id}` layers with a *static* filter set once at creation;
  `applyLineVisibility()` toggles `visibility` (a render-time op). Sources stay a constant feature set.
- **Glyphs must be a valid `.pbf` endpoint** (`basemapStyle.ts` uses `demotiles.maplibre.org/font/...`).
  A bad glyph URL makes MapLibre's Pbf parser throw "Unimplemented type: 4", which fails the *entire*
  tile build for any source feeding a symbol/text layer — silently hiding the stations circles too.
- **`.map-root` needs the `.app .map-root` selector** in `theme.css`: `maplibre-gl.css` loads after
  `theme.css` and its `.maplibregl-map { position: relative }` otherwise wins and collapses the map to
  0 height.
- **Expression rules:** `['zoom']` may only be the top-level input to an `interpolate`/`step` (don't nest
  it in arithmetic — apply the data factor to the per-stop outputs); and only one zoom-based
  sub-expression is allowed per property (use a single zoom `interpolate` whose stop outputs are
  `['case', ...]` on feature data).
- **Statistics stay full-network** regardless of the line filter (the filter only hides map layers).
  `useNetwork`/`stats.ts` read all of `data.lines`.

## Verifying map changes

`queryRenderedFeatures` is unreliable here (it can return `visibility:none` layers and lags `setData`
re-tiles) — trust screenshots, not feature counts. The map is WebGL, so verify visually. The pattern
used in this repo: launch headless Edge with `--use-angle=swiftshader --enable-unsafe-swiftshader
--remote-debugging-port=...`, drive the app over the DevTools Protocol (the dev build exposes
`window.__map` and `window.__store` for this), and capture `Page.captureScreenshot`. To exercise sim
state, set the `.tl-range` slider value + dispatch an `input` event (e.g. `540` = 09:00 peak).
