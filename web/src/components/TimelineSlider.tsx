import { useDashboard } from '../store/useDashboard'
import {
  dayTypeOf,
  formatIST,
  istMidnightEpoch,
  minutesOfDay,
  operatingWindow,
} from '../sim/clock'

const DAY_LABEL: Record<string, string> = {
  weekday: 'Weekday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

/** Scrub any time of the current day. Feeds the same clock the whole sim reads from. */
export function TimelineSlider() {
  const data = useDashboard((s) => s.data)
  const nowMs = useDashboard((s) => s.nowMs)
  const live = useDashboard((s) => s.clock.live)
  const scrubTo = useDashboard((s) => s.scrubTo)
  if (!data) return null

  const mins = minutesOfDay(nowMs)
  const win = operatingWindow(data.schedule, nowMs)
  const startPct = (win.start / 1440) * 100
  const endPct = (win.end / 1440) * 100

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const m = Number(e.target.value)
    scrubTo(istMidnightEpoch(nowMs) + m * 60_000)
  }

  return (
    <div className="timeline">
      <div className="tl-head">
        <span className="tl-time tnum">{formatIST(nowMs, false)}</span>
        <span className={`tl-mode ${live ? 'live' : ''}`}>{live ? 'LIVE' : DAY_LABEL[dayTypeOf(nowMs)]}</span>
      </div>
      <div className="tl-track-wrap">
        <div className="tl-service" style={{ left: `${startPct}%`, right: `${100 - endPct}%` }} />
        <input
          className="tl-range"
          type="range"
          min={0}
          max={1439}
          step={1}
          value={Math.floor(mins)}
          onChange={onInput}
          aria-label="Time of day"
        />
      </div>
      <div className="tl-ticks tnum">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
    </div>
  )
}
