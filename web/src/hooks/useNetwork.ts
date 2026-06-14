import { useMemo } from 'react'
import { useDashboard } from '../store/useDashboard'
import { computeTrains, type Train } from '../sim/trains'
import { computeStats, type NetworkStats } from '../sim/stats'
import type { MetroData } from '../data/loadBundle'

export interface NetworkSnapshot {
  now: number
  data: MetroData
  trains: Train[]
  stats: NetworkStats
}

/** Reactive network snapshot recomputed when the throttled clock (nowMs) advances. */
export function useNetwork(): NetworkSnapshot | null {
  const data = useDashboard((s) => s.data)
  const now = useDashboard((s) => s.nowMs)
  return useMemo(() => {
    if (!data) return null
    const trains = computeTrains(data, now)
    const stats = computeStats(data, now, trains)
    return { now, data, trains, stats }
  }, [data, now])
}
