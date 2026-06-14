// Pure geometry helpers for placing trains on a line by distance-along-path.
// Reused by the simulation engine; no external dependencies.

import type { LngLat } from '../types/bundle'

export interface PointOnPath {
  lng: number
  lat: number
  /** Compass bearing (degrees, 0 = north) in the direction of increasing distance. */
  bearing: number
}

/** Initial bearing from a to b in degrees (0 = north, clockwise). */
export function bearing(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const y = Math.sin(toRad(b[0] - a[0])) * Math.cos(toRad(b[1]))
  const x =
    Math.cos(toRad(a[1])) * Math.sin(toRad(b[1])) -
    Math.sin(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.cos(toRad(b[0] - a[0]))
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/** Binary search: index i such that cum[i] <= d < cum[i+1]. */
function segmentIndex(cum: number[], d: number): number {
  let lo = 0
  let hi = cum.length - 1
  if (d <= cum[0]) return 0
  if (d >= cum[hi]) return hi - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cum[mid] <= d) lo = mid + 1
    else hi = mid
  }
  return Math.max(0, lo - 1)
}

/**
 * Interpolate a position + bearing at `distanceM` along `path` (with precomputed
 * cumulative distances `cum`). Clamps to the path endpoints.
 */
export function interpolateAlong(path: LngLat[], cum: number[], distanceM: number): PointOnPath {
  if (path.length === 0) return { lng: 0, lat: 0, bearing: 0 }
  if (path.length === 1) return { lng: path[0][0], lat: path[0][1], bearing: 0 }

  const total = cum[cum.length - 1]
  const d = Math.max(0, Math.min(distanceM, total))
  const i = segmentIndex(cum, d)
  const a = path[i]
  const b = path[i + 1]
  const segLen = cum[i + 1] - cum[i] || 1
  const t = (d - cum[i]) / segLen
  return {
    lng: a[0] + (b[0] - a[0]) * t,
    lat: a[1] + (b[1] - a[1]) * t,
    bearing: bearing(a, b),
  }
}
