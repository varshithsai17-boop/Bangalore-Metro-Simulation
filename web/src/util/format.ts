// Small, dependency-free formatting helpers shared across UI components.

/** Compact integer with thousands separators (e.g. 18466 -> "18,466"). */
export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-IN')
}

/** Rounded-to-significant compact count (e.g. 1234 -> "1.2k", 18466 -> "18k"). */
export function fmtCompact(n: number): string {
  const v = Math.round(n)
  if (v < 1000) return String(v)
  if (v < 10_000) return `${(v / 1000).toFixed(1)}k`
  if (v < 1_000_000) return `${Math.round(v / 1000)}k`
  return `${(v / 1_000_000).toFixed(1)}M`
}

/** Arrival countdown: "Due" under 45s, otherwise "m:ss". */
export function fmtEta(sec: number): string {
  if (sec < 45) return 'Due'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Duration as "Xm Ys" / "Ys" for ETAs in detail panels. */
export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${String(s % 60).padStart(2, '0')}s`
}

/** Metres -> "X.X km" (or "X m" under 1 km). */
export function fmtKm(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(1)} km`
}

/** Seconds-headway -> "every X min" (rounds to nearest half-minute). */
export function fmtHeadway(sec: number): string {
  const min = sec / 60
  const rounded = Math.round(min * 2) / 2
  return Number.isInteger(rounded) ? `${rounded} min` : `${rounded} min`
}

export type ActivityBand = { label: string; key: 'quiet' | 'light' | 'moderate' | 'busy' }

/** Map a 0..1 activity value to an honest qualitative band. */
export function activityBand(t: number): ActivityBand {
  if (t >= 0.7) return { label: 'Busy', key: 'busy' }
  if (t >= 0.45) return { label: 'Moderate', key: 'moderate' }
  if (t >= 0.2) return { label: 'Light', key: 'light' }
  return { label: 'Quiet', key: 'quiet' }
}
