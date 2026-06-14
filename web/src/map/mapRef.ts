// Module-level handle to the active MapLibre map so non-map components (search,
// camera presets) can issue smooth camera commands without prop drilling.

import type maplibregl from 'maplibre-gl'

let current: maplibregl.Map | null = null

export function setMap(map: maplibregl.Map | null): void {
  current = map
}

export function getMap(): maplibregl.Map | null {
  return current
}

/** Smoothly ease the camera to a point; never an abrupt jump. */
export function flyTo(lng: number, lat: number, opts?: { zoom?: number; duration?: number }): void {
  const map = current
  if (!map) return
  const zoom = opts?.zoom ?? Math.max(map.getZoom(), 13.2)
  map.easeTo({
    center: [lng, lat],
    zoom,
    duration: opts?.duration ?? 1100,
    essential: true,
  })
}

/** Smoothly fit a set of [lng,lat] points into view with padding. */
export function fitPoints(
  points: Array<[number, number]>,
  opts: { padding?: number; maxZoom?: number; bearing?: number } = {},
): void {
  const map = current
  if (!map || points.length === 0) return
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  map.fitBounds(
    [
      [minX, minY],
      [maxX, maxY],
    ],
    {
      padding: opts.padding ?? 90,
      duration: 1100,
      essential: true,
      maxZoom: opts.maxZoom ?? 14.5,
      bearing: opts.bearing ?? map.getBearing(),
      pitch: 0,
    },
  )
}

/** Reset to the default framing: the whole network centred, north-up. */
export function resetView(points: Array<[number, number]>): void {
  fitPoints(points, { padding: 120, maxZoom: 12.6, bearing: 0 })
}
