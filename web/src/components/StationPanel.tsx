import { motion } from 'framer-motion'
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, YAxis } from 'recharts'
import { X, ArrowLeftRight, MapPin, TrainFront } from 'lucide-react'

import type { Station } from '../types/bundle'
import { useDashboard } from '../store/useDashboard'
import { useNetwork } from '../hooks/useNetwork'
import { stationActivity, estimatedHourlyThroughput, activityColour } from '../sim/activity'
import { arrivalsAt } from '../sim/trains'
import { dayTypeOf, hourFraction, isWeekend } from '../sim/clock'
import { activityBand, fmtCompact, fmtEta, fmtKm, fmtInt } from '../util/format'

const LINE_LABEL: Record<string, string> = { weekday: 'weekday', saturday: 'Saturday', sunday: 'Sunday' }

export function StationPanel({ station }: { station: Station }) {
  const net = useNetwork()
  const close = useDashboard((s) => s.select)
  const lineById = useDashboard((s) => s.data?.lineById)
  if (!net || !lineById) return null
  const { now, stats } = net

  const operating = stats.operating
  const act = operating ? stationActivity(station, now) : 0
  const band = activityBand(act)
  const throughput = operating ? estimatedHourlyThroughput(station, now) : 0
  const arrivals = arrivalsAt(net.data, station.id, now, 3).slice(0, 6)

  // 24h profile for the relevant day-type, with the current hour marked.
  const profile = isWeekend(now) ? station.ridership.hourlyWeekend : station.ridership.hourlyWeekday
  const chart = profile.map((v, h) => ({ h, v }))
  const { hour } = hourFraction(now)

  const lines = station.lines.map((id) => lineById.get(id)).filter(Boolean) as NonNullable<
    ReturnType<typeof lineById.get>
  >[]

  return (
    <motion.aside
      className="panel surface"
      initial={{ x: 28, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 28, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
    >
      <header className="panel-head">
        <div className="panel-kicker">
          {station.interchange ? 'Interchange station' : 'Station'}
        </div>
        <h2 className="panel-title">{station.name}</h2>
        <div className="chips">
          {lines.map((l) => (
            <span key={l.id} className="chip" style={{ ['--c' as string]: l.colour }}>
              <span className="chip-dot" /> {l.name.replace(' Line', '')}
            </span>
          ))}
          {station.interchange && (
            <span className="chip ghost">
              <ArrowLeftRight size={11} /> Interchange
            </span>
          )}
        </div>
        <button className="icon-btn close" onClick={() => close(null)} aria-label="Close">
          <X size={16} />
        </button>
      </header>

      {/* Estimated current activity */}
      <section className="panel-block">
        <div className="block-label">
          Current activity <span className="est">est.</span>
        </div>
        <div className="activity-readout">
          <span className="activity-word" style={{ color: activityColour(act) }}>
            {operating ? band.label : 'Closed'}
          </span>
          <span className="activity-sub tnum">
            {operating ? `~${fmtCompact(throughput)} entries+exits / hr` : 'Service not running'}
          </span>
        </div>
        <div className="meter">
          <div
            className="meter-fill"
            style={{ width: `${Math.round(act * 100)}%`, background: activityColour(act) }}
          />
        </div>
      </section>

      {/* Upcoming arrivals */}
      <section className="panel-block">
        <div className="block-label">
          Upcoming arrivals <span className="est">estimated from schedule</span>
        </div>
        {arrivals.length === 0 ? (
          <div className="empty">No trains expected — service closed.</div>
        ) : (
          <ul className="arrivals">
            {arrivals.map((a, i) => (
              <li key={`${a.trainId}-${i}`} className="arrival">
                <span className="arr-dot" style={{ background: a.colour }} />
                <span className="arr-dest">
                  <TrainFront size={12} className="arr-ico" /> to {a.headingName}
                </span>
                <span className={`arr-eta tnum ${a.etaSec < 45 ? 'due' : ''}`}>{fmtEta(a.etaSec)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Daily usage profile */}
      <section className="panel-block">
        <div className="block-label">
          Typical {LINE_LABEL[dayTypeOf(now)]} usage <span className="est">historical</span>
        </div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={68}>
            <AreaChart data={chart} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="usageFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lines[0]?.colour ?? '#6ea8fe'} stopOpacity={0.55} />
                  <stop offset="100%" stopColor={lines[0]?.colour ?? '#6ea8fe'} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <YAxis hide domain={[0, 1]} />
              {operating && (
                <ReferenceLine x={hour} stroke="#e7ecf3" strokeOpacity={0.5} strokeDasharray="2 2" />
              )}
              <Area
                type="monotone"
                dataKey="v"
                stroke={lines[0]?.colour ?? '#6ea8fe'}
                strokeWidth={1.6}
                fill="url(#usageFill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
          <div className="chart-axis tnum">
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
            <span>24</span>
          </div>
        </div>
        <div className="stat-row">
          <div className="stat">
            <span className="stat-val tnum">{fmtInt(station.ridership.dailyAvg)}</span>
            <span className="stat-key">avg/day · entries+exits</span>
          </div>
          <div className="stat">
            <span className="stat-val tnum">{String(station.ridership.peakHour).padStart(2, '0')}:00</span>
            <span className="stat-key">busiest hour</span>
          </div>
        </div>
      </section>

      {/* Position on network */}
      <section className="panel-block">
        <div className="block-label">Position on network</div>
        <div className="position-list">
          {lines.map((l) => {
            const fromMaj = station.distanceFromMajestic[l.id]
            const seq = station.lineSeq[l.id]
            const total = l.stations.length
            return (
              <div key={l.id} className="position-row">
                <span className="pos-line" style={{ color: l.colour }}>
                  {l.name}
                </span>
                <span className="pos-detail tnum">
                  <MapPin size={11} /> stop {seq + 1} of {total} ·{' '}
                  {fromMaj === 0 ? 'at Majestic' : `${fmtKm(Math.abs(fromMaj))} from Majestic`}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      <footer className="panel-foot">
        Activity & passenger figures are model estimates from historical ridership + published
        frequencies — not live counts.
      </footer>
    </motion.aside>
  )
}
