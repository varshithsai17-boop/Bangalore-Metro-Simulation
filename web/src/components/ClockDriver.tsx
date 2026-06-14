import { useEffect } from 'react'
import { useDashboard } from '../store/useDashboard'

/**
 * Drives the throttled reactive clock used by UI panels (~5 updates/sec). The map runs
 * its own per-frame loop for train motion, so this stays cheap and avoids re-rendering
 * panels 60 times a second.
 */
export function ClockDriver() {
  const tick = useDashboard((s) => s.tick)
  useEffect(() => {
    const id = window.setInterval(() => tick(useDashboard.getState().getNow()), 200)
    return () => window.clearInterval(id)
  }, [tick])
  return null
}
