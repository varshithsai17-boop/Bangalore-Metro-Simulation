import { useNetwork } from '../hooks/useNetwork'
import { dayTypeOf, formatIST } from '../sim/clock'
import { fmtCompact, fmtDuration } from '../util/format'

const DAY_LABEL: Record<string, string> = {
  weekday: 'Weekday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

/** Top cards: brand (left), floating statistics (centre), live clock (right). */
export function TopBar() {
  const net = useNetwork()
  if (!net) return null

  const { now, stats } = net
  const dayType = dayTypeOf(now)

  return (
    <>
      <div className="brand-card surface">
        <span className="title">Bangalore Metro Tracking</span>
        <span className="subtitle">Varshith Sai</span>
      </div>

      <div className="stats-card surface">
        <Instrument value={String(stats.activeTrains)} label="active trains" accent="var(--accent)" />
        <Instrument
          value={stats.avgWaitSec != null ? fmtDuration(stats.avgWaitSec) : '—'}
          label="avg wait"
        />
        <Instrument value={`${Math.round(stats.networkActivityPct)}%`} label="activity · est" />
        <Instrument value={`~${fmtCompact(stats.estPassengersInTransit)}`} label="riding · est" />
      </div>

      <div className="clock-card surface">
        <span className="clock-day">{DAY_LABEL[dayType]}</span>
        <span className="clock-time tnum">{formatIST(now)}</span>
      </div>
    </>
  )
}

function Instrument({ value, label, accent }: { value: string; label: string; accent?: string }) {
  return (
    <div className="instr">
      <span className="instr-val tnum" style={accent ? { color: accent } : undefined}>
        {value}
      </span>
      <span className="instr-key">{label}</span>
    </div>
  )
}
