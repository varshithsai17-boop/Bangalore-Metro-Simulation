// Time model for the simulation. Everything is computed in India Standard Time (IST,
// UTC+5:30) regardless of the viewer's local timezone, so peaks/operating-hours align
// with Bengaluru reality. All functions are pure.

import type { Schedule } from '../types/bundle'

export type DayType = 'weekday' | 'saturday' | 'sunday'

export const IST_OFFSET_MIN = 330

/** A Date shifted into IST; read its UTC getters to obtain IST wall-clock fields. */
export function istDate(epochMs: number): Date {
  return new Date(epochMs + IST_OFFSET_MIN * 60_000)
}

export function dayTypeOf(epochMs: number): DayType {
  const g = istDate(epochMs).getUTCDay() // 0 Sun ... 6 Sat
  if (g === 0) return 'sunday'
  if (g === 6) return 'saturday'
  return 'weekday'
}

export function isWeekend(epochMs: number): boolean {
  return dayTypeOf(epochMs) !== 'weekday'
}

/** Minutes since IST midnight (fractional). */
export function minutesOfDay(epochMs: number): number {
  const d = istDate(epochMs)
  return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60
}

/** Hour of day (0..23) in IST, plus fractional progress to the next hour. */
export function hourFraction(epochMs: number): { hour: number; frac: number } {
  const m = minutesOfDay(epochMs)
  const hour = Math.floor(m / 60) % 24
  return { hour, frac: (m - hour * 60) / 60 }
}

export function operatingWindow(schedule: Schedule, epochMs: number) {
  return schedule.operatingHours[dayTypeOf(epochMs)]
}

export function isOperating(schedule: Schedule, epochMs: number): boolean {
  const w = operatingWindow(schedule, epochMs)
  const m = minutesOfDay(epochMs)
  return m >= w.start && m < w.end
}

/** Headway (seconds) effective at the given minute-of-day, or null when closed. */
export function headwayAtMinute(schedule: Schedule, minutes: number): number | null {
  for (const h of schedule.headways) {
    if (minutes >= h.from && minutes < h.to) return h.sec
  }
  return null
}

/** Start of the IST day containing epochMs, expressed as an epoch-ms value. */
export function istMidnightEpoch(epochMs: number): number {
  return epochMs - minutesOfDay(epochMs) * 60_000
}

const HHMM = (m: number) => {
  const h = Math.floor(m / 60)
  const mm = Math.floor(m % 60)
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** Formatted IST clock string HH:MM:SS. */
export function formatIST(epochMs: number, withSeconds = true): string {
  const d = istDate(epochMs)
  const base = HHMM(d.getUTCHours() * 60 + d.getUTCMinutes())
  return withSeconds ? `${base}:${String(d.getUTCSeconds()).padStart(2, '0')}` : base
}
