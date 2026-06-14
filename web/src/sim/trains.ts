// Deterministic active-train computation from the schedule + a timestamp.
// No GPS: a train that departed a terminus `elapsed` seconds ago is placed by mapping
// elapsed -> route-progress distance (via per-segment travel times) -> path position.

import type { Line } from '../types/bundle'
import type { MetroData } from '../data/loadBundle'
import { interpolateAlong } from './geometry'
import {
  headwayAtMinute,
  isOperating,
  istMidnightEpoch,
  minutesOfDay,
  operatingWindow,
} from './clock'

export type Direction = 0 | 1 // 0: from -> to (forward), 1: to -> from (reverse)

export interface Train {
  id: string
  lineId: string
  lineName: string
  colour: string
  direction: Direction
  headingName: string // terminus this train is heading toward
  originName: string
  progress: number // 0..1 along the route
  lng: number
  lat: number
  bearing: number
  elapsedSec: number
  prevStationId: string
  nextStationId: string
  etaNextSec: number
}

/** A line resolved into one travel direction: ordered stations + progress distances + times. */
interface DirectedRoute {
  direction: Direction
  order: string[]
  /** Route-progress distance (m) of each station, monotonic increasing in travel order. */
  dists: number[]
  /** Cumulative travel time (s) at each station, route start = 0. */
  cumTimes: number[]
  runTimeSec: number
  lengthM: number
  originName: string
  headingName: string
}

const routeCache = new WeakMap<Line, [DirectedRoute, DirectedRoute]>()

function buildRoutes(line: Line): [DirectedRoute, DirectedRoute] {
  const cached = routeCache.get(line)
  if (cached) return cached

  const n = line.stations.length
  const segs = line.segmentTimesSec
  const cumF = [0]
  for (let i = 0; i < segs.length; i++) cumF.push(cumF[i] + segs[i])

  const forward: DirectedRoute = {
    direction: 0,
    order: line.stations,
    dists: line.stationDistancesM,
    cumTimes: cumF,
    runTimeSec: line.runTimeSec,
    lengthM: line.lengthM,
    originName: line.from ?? line.stations[0],
    headingName: line.to ?? line.stations[n - 1],
  }

  // Reverse: travel from the far terminus back to the origin.
  const orderR = [...line.stations].reverse()
  const distsR = [...line.stationDistancesM].reverse().map((d) => line.lengthM - d)
  const segsR = [...segs].reverse()
  const cumR = [0]
  for (let i = 0; i < segsR.length; i++) cumR.push(cumR[i] + segsR[i])
  const reverse: DirectedRoute = {
    direction: 1,
    order: orderR,
    dists: distsR,
    cumTimes: cumR,
    runTimeSec: line.runTimeSec,
    lengthM: line.lengthM,
    originName: line.to ?? line.stations[n - 1],
    headingName: line.from ?? line.stations[0],
  }

  const pair: [DirectedRoute, DirectedRoute] = [forward, reverse]
  routeCache.set(line, pair)
  return pair
}

function segIndexByTime(cumTimes: number[], t: number): number {
  let lo = 0
  let hi = cumTimes.length - 1
  if (t <= 0) return 0
  if (t >= cumTimes[hi]) return hi - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cumTimes[mid] <= t) lo = mid + 1
    else hi = mid
  }
  return Math.max(0, lo - 1)
}

/**
 * Departure epoch-ms times from a terminus across the operating day, honoring the
 * variable headway windows. Anchored at the day's service start.
 */
function departureTimes(data: MetroData, epochMs: number): number[] {
  const { schedule } = data
  const win = operatingWindow(schedule, epochMs)
  const midnight = istMidnightEpoch(epochMs)
  const out: number[] = []
  let m = win.start
  // Trains stay in service up to runtime after departing; we only need departures that
  // could still be running now, but enumerating the day is cheap and keeps it simple.
  while (m < win.end) {
    out.push(midnight + m * 60_000)
    const hw = headwayAtMinute(schedule, m)
    if (!hw) break
    m += hw / 60
  }
  return out
}

export interface Arrival {
  trainId: string
  lineId: string
  lineName: string
  colour: string
  direction: Direction
  headingName: string
  /** Seconds until the train reaches this station. */
  etaSec: number
}

/**
 * Next upcoming arrivals at a station, soonest first. Computed from the same departure +
 * per-segment travel-time model as `computeTrains`, so the board agrees with the dots.
 * `perDir` caps how many to keep per line+direction before merging.
 */
export function arrivalsAt(
  data: MetroData,
  stationId: string,
  epochMs: number,
  perDir = 3,
): Arrival[] {
  if (!isOperating(data.schedule, epochMs)) return []
  const station = data.stationById.get(stationId)
  if (!station) return []

  const deps = departureTimes(data, epochMs)
  const out: Arrival[] = []

  for (const lineId of station.lines) {
    const line = data.lineById.get(lineId)
    if (!line) continue
    const routes = buildRoutes(line)
    for (const route of routes) {
      const idx = route.order.indexOf(stationId)
      if (idx <= 0) continue // skip the origin terminus (departure, not an arrival)
      const cumT = route.cumTimes[idx] // seconds from origin to reach this station
      let kept = 0
      for (let di = 0; di < deps.length && kept < perDir; di++) {
        const etaSec = (deps[di] + cumT * 1000 - epochMs) / 1000
        if (etaSec < 0) continue
        out.push({
          trainId: `${line.id}-${route.direction}-${di}`,
          lineId: line.id,
          lineName: line.name,
          colour: line.colour,
          direction: route.direction,
          headingName: route.headingName,
          etaSec,
        })
        kept++
      }
    }
  }
  return out.sort((a, b) => a.etaSec - b.etaSec)
}

/** All trains currently in service at `epochMs`. */
export function computeTrains(data: MetroData, epochMs: number): Train[] {
  if (!isOperating(data.schedule, epochMs)) return []

  const deps = departureTimes(data, epochMs)
  const trains: Train[] = []
  const nowMin = minutesOfDay(epochMs)
  void nowMin

  for (const line of data.lines) {
    const routes = buildRoutes(line)
    const cum = data.pathCumById.get(line.id)!
    for (const route of routes) {
      for (let di = 0; di < deps.length; di++) {
        const elapsedSec = (epochMs - deps[di]) / 1000
        if (elapsedSec < 0 || elapsedSec > route.runTimeSec) continue

        const k = segIndexByTime(route.cumTimes, elapsedSec)
        const segDt = route.cumTimes[k + 1] - route.cumTimes[k] || 1
        const frac = (elapsedSec - route.cumTimes[k]) / segDt
        const s = route.dists[k] + (route.dists[k + 1] - route.dists[k]) * frac
        const pathDist = route.direction === 0 ? s : route.lengthM - s
        const pt = interpolateAlong(line.path, cum, pathDist)
        const heading = route.direction === 0 ? pt.bearing : (pt.bearing + 180) % 360

        trains.push({
          id: `${line.id}-${route.direction}-${di}`,
          lineId: line.id,
          lineName: line.name,
          colour: line.colour,
          direction: route.direction,
          headingName: route.headingName,
          originName: route.originName,
          progress: route.lengthM ? s / route.lengthM : 0,
          lng: pt.lng,
          lat: pt.lat,
          bearing: heading,
          elapsedSec,
          prevStationId: route.order[k],
          nextStationId: route.order[k + 1],
          etaNextSec: Math.max(0, route.cumTimes[k + 1] - elapsedSec),
        })
      }
    }
  }
  return trains
}
