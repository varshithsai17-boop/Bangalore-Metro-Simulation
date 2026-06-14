import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { GeoJSONSource } from 'maplibre-gl'

import { useDashboard } from '../store/useDashboard'
import { computeTrains } from '../sim/trains'
import { stationActivity } from '../sim/activity'
import { BENGALURU_CENTER, DEFAULT_ZOOM, darkBasemap } from './basemapStyle'
import { registerTrainIcons } from './trainIcon'
import { linesGeoJSON, stationsGeoJSON, trainsGeoJSON } from './geojson'
import { setMap } from './mapRef'

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

// Busyness colour ramp: vivid green (quiet) → yellow (moderate) → red (busy).
// Kept bright and saturated so the activity reads clearly on the dark map.
const ACTIVITY_FILL: maplibregl.ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['get', 'activity'],
  0.0, '#22e06b',
  0.5, '#ffd21a',
  1.0, '#ff3b30',
]

// Per-feature radius multiplier from estimated activity (0.55 quiet → 1.6 busy).
const ACTIVITY_SCALE: maplibregl.ExpressionSpecification = ['+', 0.55, ['*', 1.05, ['get', 'activity']]]

export function MetroMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const data = useDashboard((s) => s.data)

  // Initialize the map once.
  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: darkBasemap(),
      center: BENGALURU_CENTER,
      zoom: DEFAULT_ZOOM,
      minZoom: 9,
      maxZoom: 16.5,
      maxPitch: 0,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    })
    mapRef.current = map
    setMap(map)
    if (import.meta.env.DEV) {
      const w = window as unknown as { __map: maplibregl.Map; __store: typeof useDashboard }
      w.__map = map
      w.__store = useDashboard
    }
    // Lock to north-up; prevent accidental rotation.
    map.dragRotate.disable()
    map.touchZoomRotate.disableRotation()
    map.on('dblclick', () => {
      if (map.getBearing() !== 0 || map.getPitch() !== 0) {
        map.easeTo({ bearing: 0, pitch: 0, duration: 400 })
      }
    })
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left')
    // Train sprites load asynchronously; swallow the brief "image missing" warning.
    map.on('styleimagemissing', () => {})

    return () => {
      setMap(null)
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Once data is ready, add layers and start the animation loop.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !data) return

    let raf = 0
    let stationTimer = 0
    let unsubLineFilter = () => {}

    const setup = () => {
      map.addSource('lines', { type: 'geojson', data: linesGeoJSON(data) })
      map.addSource('stations', { type: 'geojson', data: stationsGeoJSON(data) })
      map.addSource('trains', { type: 'geojson', data: trainsGeoJSON([]) })
      map.addSource('selected', { type: 'geojson', data: EMPTY_FC })
      void registerTrainIcons(map, data.lines) // async PNG load; layers render once ready

      // Each line gets its OWN layers so it can be shown/hidden via layer `visibility`
      // (a render-time toggle). This is robust — unlike `filter`/`setData`, which MapLibre
      // applies at tile-build time and can leave stale. Sources stay a constant feature set.

      // Lines: glow (wide, blurred) + crisp core, one pair per line.
      for (const line of data.lines) {
        const onLine: maplibregl.FilterSpecification = ['==', ['get', 'lineId'], line.id]
        map.addLayer({
          id: `line-glow-${line.id}`,
          type: 'line',
          source: 'lines',
          filter: onLine,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': ['get', 'colour'],
            'line-width': ['interpolate', ['linear'], ['zoom'], 9, 6, 13, 14, 16, 22],
            'line-blur': ['interpolate', ['linear'], ['zoom'], 9, 4, 16, 12],
            'line-opacity': 0.22,
          },
        })
        map.addLayer({
          id: `line-core-${line.id}`,
          type: 'line',
          source: 'lines',
          filter: onLine,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': ['get', 'colour'],
            'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.6, 13, 3.2, 16, 5.5],
            'line-opacity': 0.95,
          },
        })
      }

      // Interchange ring (distinct white halo).
      map.addLayer({
        id: 'station-interchange',
        type: 'circle',
        source: 'stations',
        filter: ['==', ['get', 'interchange'], true],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 6, 13, 11, 16, 17],
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': '#eef2f8',
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 9, 1.4, 14, 2.4],
          'circle-opacity': 0.9,
        },
      })

      // Stations: one circle layer per line (interchange stations appear in both — identical
      // overlapping dots, which is fine). Fill encodes activity, thin stroke the line colour.
      for (const line of data.lines) {
        map.addLayer({
          id: `stations-${line.id}`,
          type: 'circle',
          source: 'stations',
          filter: ['==', ['get', `line_${line.id}`], true],
          paint: {
            // Radius = base(zoom) × activity-scale. MapLibre requires the zoom expression
            // to be the top-level interpolate, so the activity factor is applied per stop.
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              9, ['*', 2.8, ACTIVITY_SCALE],
              12, ['*', 5, ACTIVITY_SCALE],
              14, ['*', 8, ACTIVITY_SCALE],
              16, ['*', 12, ACTIVITY_SCALE],
            ],
            'circle-color': ACTIVITY_FILL,
            // Thin outline so the busyness colour dominates the dot.
            'circle-stroke-color': ['get', 'colour'],
            'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 14, 1],
            'circle-opacity': 0.95,
          },
        })
      }

      // Station labels with semantic-zoom densification: the interchange (and termini)
      // surface at far zoom; ordinary station names fade in at medium zoom. One layer per
      // line so it hides with its line (Majestic's label appears in both — collision dedups it).
      for (const line of data.lines) {
        map.addLayer({
          id: `station-labels-${line.id}`,
          type: 'symbol',
          source: 'stations',
          filter: ['==', ['get', `line_${line.id}`], true],
          layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10,
            ['case', ['get', 'interchange'], 11.5, 9.5],
            14,
            ['case', ['get', 'interchange'], 14, 12.5],
          ],
          'text-offset': [0, 1.3],
          'text-anchor': 'top',
          'text-allow-overlap': false,
          'text-optional': true,
          'symbol-sort-key': ['case', ['get', 'interchange'], 0, 1],
        },
        paint: {
          'text-color': ['case', ['get', 'interchange'], '#eef2f8', '#c4cedd'],
          'text-halo-color': '#070a0f',
          'text-halo-width': 1.4,
          // Single zoom interpolate (MapLibre allows only one) whose per-stop output
          // depends on interchange: interchange labels fade in early, others later.
          'text-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            9.6, 0,
            10.4, ['case', ['get', 'interchange'], 1, 0],
            11.6, ['case', ['get', 'interchange'], 1, 0],
            12.6, 1,
          ],
          },
        })
      }

      // Selection highlight (under trains): a soft glow + crisp ring that tracks the
      // currently-selected station or train.
      map.addLayer({
        id: 'selected-glow',
        type: 'circle',
        source: 'selected',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 16, 14, 30],
          'circle-color': ['get', 'colour'],
          'circle-opacity': 0.18,
          'circle-blur': 1,
        },
      })
      map.addLayer({
        id: 'selected-ring',
        type: 'circle',
        source: 'selected',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 9, 14, 16],
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.8,
          'circle-opacity': 0.9,
        },
      })

      // Trains: one symbol layer per line. The glyph changes with zoom — a directional arrow
      // far out (network), then the train sprite (smaller at line zoom, full size up close).
      const T1 = 11.5 // arrow → sprite
      for (const line of data.lines) {
        map.addLayer({
          id: `trains-${line.id}`,
          type: 'symbol',
          source: 'trains',
          filter: ['==', ['get', 'lineId'], line.id],
          layout: {
            'icon-image': ['step', ['zoom'], `arrow-${line.id}`, T1, `train-${line.id}`],
            // Arrow points north (rotate by bearing); the sprite points left (bearing + 90°).
            'icon-rotate': ['step', ['zoom'], ['get', 'bearing'], T1, ['+', ['get', 'bearing'], 90]],
            'icon-rotation-alignment': 'map',
            'icon-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              9, 0.42, // arrow (base 24px) — small
              11.4, 0.5,
              11.5, 0.62, // sprite (base 64px) begins, ~30% smaller than full
              13.8, 0.7,
              14, 1.0, // full size (unchanged near look)
              16, 1.32,
            ],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        })
      }

      const interactiveLayers = [
        ...data.lines.map((l) => `trains-${l.id}`),
        ...data.lines.map((l) => `stations-${l.id}`),
        'station-interchange',
      ]
      bindInteractions(map, interactiveLayers)

      // 60fps train animation + selection highlight tracking. Per-line `trains-*` layers
      // hide filtered lines, so the source carries every train.
      let lastHlKey = ''
      const frame = () => {
        const state = useDashboard.getState()
        const now = state.getNow()
        const trains = computeTrains(data, now)
        ;(map.getSource('trains') as GeoJSONSource | undefined)?.setData(trainsGeoJSON(trains))

        // Highlight follows the selected station (static) or train (moving). Only push to the
        // source when it actually changes, to keep the worker free.
        const sel = state.selection
        let hl: GeoJSON.FeatureCollection = EMPTY_FC
        let key = ''
        if (sel?.kind === 'station') {
          const st = data.stationById.get(sel.id)
          if (st) {
            hl = pointFC(st.lng, st.lat, st.interchange ? '#e9eef5' : data.lineById.get(st.lines[0])?.colour ?? '#fff')
            key = `s:${sel.id}`
          }
        } else if (sel?.kind === 'train') {
          const t = trains.find((x) => x.id === sel.id)
          if (t) {
            hl = pointFC(t.lng, t.lat, t.colour)
            key = `t:${t.lng.toFixed(5)},${t.lat.toFixed(5)}`
          }
        }
        if (key !== lastHlKey) {
          lastHlKey = key
          ;(map.getSource('selected') as GeoJSONSource | undefined)?.setData(hl)
        }

        raf = requestAnimationFrame(frame)
      }
      frame()

      // Station activity refresh (a few times per second is plenty). The source always
      // carries every station; per-line `stations-*` layers handle hiding.
      const updateStations = () => {
        const now = useDashboard.getState().getNow()
        const fc = stationsGeoJSON(data)
        for (const f of fc.features) {
          const st = data.stationById.get(f.properties!.id as string)!
          f.properties!.activity = Number(stationActivity(st, now).toFixed(3))
        }
        ;(map.getSource('stations') as GeoJSONSource | undefined)?.setData(fc)
      }
      updateStations()
      stationTimer = window.setInterval(updateStations, 300)

      // Line filtering via layer `visibility` — render-time, so it can't be left stale by
      // tiling. Statistics deliberately stay full-network (see useNetwork).
      const applyLineVisibility = () => {
        const lf = useDashboard.getState().lineFilter
        for (const line of data.lines) {
          const vis = lf[line.id] !== false ? 'visible' : 'none'
          for (const prefix of ['line-glow', 'line-core', 'stations', 'station-labels', 'trains']) {
            map.setLayoutProperty(`${prefix}-${line.id}`, 'visibility', vis)
          }
        }
        const anyVisible = data.lines.some((l) => lf[l.id] !== false)
        map.setLayoutProperty('station-interchange', 'visibility', anyVisible ? 'visible' : 'none')
      }
      applyLineVisibility()

      let lastLineFilter = useDashboard.getState().lineFilter
      unsubLineFilter = useDashboard.subscribe((state) => {
        if (state.lineFilter !== lastLineFilter) {
          lastLineFilter = state.lineFilter
          applyLineVisibility()
        }
      })
    }

    if (map.isStyleLoaded()) setup()
    else map.once('load', setup)

    return () => {
      cancelAnimationFrame(raf)
      clearInterval(stationTimer)
      unsubLineFilter()
    }
  }, [data])

  return <div ref={containerRef} className="map-root" />
}

function pointFC(lng: number, lat: number, colour: string): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { colour },
        geometry: { type: 'Point', coordinates: [lng, lat] },
      },
    ],
  }
}

function bindInteractions(map: maplibregl.Map, layers: string[]) {
  const setCursor = (v: string) => () => (map.getCanvas().style.cursor = v)
  for (const layer of layers) {
    map.on('mouseenter', layer, setCursor('pointer'))
    map.on('mouseleave', layer, setCursor(''))
  }

  map.on('click', (e) => {
    const feats = map.queryRenderedFeatures(e.point, { layers })
    if (!feats.length) {
      useDashboard.getState().select(null)
      return
    }
    const top = feats[0]
    const id = top.properties?.id as string
    if (top.layer.id.startsWith('trains-')) useDashboard.getState().select({ kind: 'train', id })
    else useDashboard.getState().select({ kind: 'station', id })
  })
}
