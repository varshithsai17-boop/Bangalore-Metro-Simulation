import type { MetroBundle, Line, Station } from '../types/bundle'

/** Index structures derived once from the raw bundle for O(1) lookups. */
export interface MetroData extends MetroBundle {
  stationById: Map<string, Station>
  lineById: Map<string, Line>
  /** Cumulative distance (m) along each line's path, parallel to line.path. */
  pathCumById: Map<string, number[]>
}

function cumulativeAlong(path: [number, number][]): number[] {
  const cum = [0]
  for (let i = 1; i < path.length; i++) {
    cum.push(cum[i - 1] + haversineM(path[i - 1], path[i]))
  }
  return cum
}

function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(a[0] - b[0]) * -1 // keep sign tidy; magnitude is what matters
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function indexBundle(bundle: MetroBundle): MetroData {
  const stationById = new Map(bundle.stations.map((s) => [s.id, s]))
  const lineById = new Map(bundle.lines.map((l) => [l.id, l]))
  const pathCumById = new Map(bundle.lines.map((l) => [l.id, cumulativeAlong(l.path)]))
  return { ...bundle, stationById, lineById, pathCumById }
}

export async function loadBundle(url = `${import.meta.env.BASE_URL}data/metro-bundle.json`): Promise<MetroData> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load metro bundle: ${res.status} ${res.statusText}`)
  const bundle = (await res.json()) as MetroBundle
  return indexBundle(bundle)
}
