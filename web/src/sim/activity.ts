// Honest station-activity estimates derived from historical hourly ridership profiles.
// Output is a normalized 0..1 "how busy is this station right now" plus helpers to turn
// that into absolute throughput estimates. Nothing here claims live or exact counts.

import type { Station } from '../types/bundle'
import { hourFraction, isWeekend } from './clock'

function profileFor(station: Station, epochMs: number): number[] {
  return isWeekend(epochMs) ? station.ridership.hourlyWeekend : station.ridership.hourlyWeekday
}

/** Activity 0..1 (relative to the station's own busiest hour), smoothly interpolated. */
export function stationActivity(station: Station, epochMs: number): number {
  const arr = profileFor(station, epochMs)
  const { hour, frac } = hourFraction(epochMs)
  const a = arr[hour]
  const b = arr[(hour + 1) % 24]
  return a + (b - a) * frac
}

/** Fraction of this station's daily throughput occurring in the current hour. */
export function hourlyShare(station: Station, epochMs: number): number {
  const arr = profileFor(station, epochMs)
  const sum = arr.reduce((x, y) => x + y, 0) || 1
  const { hour, frac } = hourFraction(epochMs)
  const a = arr[hour]
  const b = arr[(hour + 1) % 24]
  return (a + (b - a) * frac) / sum
}

/** Estimated entries+exits at this station in the current hour. */
export function estimatedHourlyThroughput(station: Station, epochMs: number): number {
  return station.ridership.dailyAvg * hourlyShare(station, epochMs)
}

// --- Activity colour ramp (cool = quiet -> warm = busy), for panels/legend ---
const RAMP: Array<[number, [number, number, number]]> = [
  [0.0, [46, 64, 92]], // dim slate-blue
  [0.35, [56, 132, 158]], // teal
  [0.65, [234, 179, 8]], // amber
  [1.0, [239, 68, 68]], // hot red
]

export function activityColour(t: number): string {
  const x = Math.max(0, Math.min(1, t))
  for (let i = 1; i < RAMP.length; i++) {
    if (x <= RAMP[i][0]) {
      const [t0, c0] = RAMP[i - 1]
      const [t1, c1] = RAMP[i]
      const f = (x - t0) / (t1 - t0 || 1)
      const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * f))
      return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
    }
  }
  return 'rgb(239, 68, 68)'
}
