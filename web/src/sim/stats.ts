// Network-level statistics, derived purely from the bundle + a timestamp + the trains
// already computed for that timestamp. All figures except `activeTrains` and
// `frequencySec` are estimates and are labelled as such in the UI.

import type { MetroData } from '../data/loadBundle'
import type { Train } from './trains'
import { headwayAtMinute, isOperating, minutesOfDay } from './clock'
import { estimatedHourlyThroughput, stationActivity } from './activity'

// Average in-system journey time used to convert hourly entries into a rough count of
// passengers currently travelling. Deliberately a single transparent constant.
const AVG_JOURNEY_HOURS = 0.4 // ~24 min

export interface StationActivityRef {
  id: string
  name: string
  activity: number
}

export interface NetworkStats {
  operating: boolean
  activeTrains: number
  trainsPerLine: Record<string, number>
  frequencySec: number | null
  avgWaitSec: number | null
  estPassengersInTransit: number
  networkActivityPct: number
  busiest: StationActivityRef | null
  quietest: StationActivityRef | null
  lineUtilization: Record<string, number>
}

export function computeStats(data: MetroData, epochMs: number, trains: Train[]): NetworkStats {
  const operating = isOperating(data.schedule, epochMs)
  const frequencySec = operating ? headwayAtMinute(data.schedule, minutesOfDay(epochMs)) : null

  const trainsPerLine: Record<string, number> = {}
  for (const l of data.lines) trainsPerLine[l.id] = 0
  for (const t of trains) trainsPerLine[t.lineId] = (trainsPerLine[t.lineId] ?? 0) + 1

  // Station activity + passenger-in-transit estimate.
  let activitySum = 0
  let passengers = 0
  let busiest: StationActivityRef | null = null
  let quietest: StationActivityRef | null = null
  for (const s of data.stations) {
    const act = operating ? stationActivity(s, epochMs) : 0
    activitySum += act
    // entries/hour ~ half of (entries+exits)/hour; convert to in-transit headcount.
    passengers += (estimatedHourlyThroughput(s, epochMs) / 2) * AVG_JOURNEY_HOURS * (operating ? 1 : 0)
    const ref: StationActivityRef = { id: s.id, name: s.name, activity: act }
    if (!busiest || act > busiest.activity) busiest = ref
    if (!quietest || act < quietest.activity) quietest = ref
  }
  const networkActivityPct = data.stations.length
    ? (activitySum / data.stations.length) * 100
    : 0

  // Line utilization: actual trains vs the ideal implied by run time / headway (both dirs).
  const lineUtilization: Record<string, number> = {}
  for (const l of data.lines) {
    const ideal = frequencySec ? (2 * l.runTimeSec) / frequencySec : 0
    lineUtilization[l.id] = ideal ? Math.min(1.5, (trainsPerLine[l.id] ?? 0) / ideal) : 0
  }

  return {
    operating,
    activeTrains: trains.length,
    trainsPerLine,
    frequencySec,
    avgWaitSec: frequencySec != null ? frequencySec / 2 : null,
    estPassengersInTransit: Math.round(passengers),
    networkActivityPct,
    busiest: operating ? busiest : null,
    quietest: operating ? quietest : null,
    lineUtilization,
  }
}
