import { motion } from 'framer-motion'
import { X, ArrowRight, TrainFront, Navigation } from 'lucide-react'

import { useDashboard } from '../store/useDashboard'
import { useNetwork } from '../hooks/useNetwork'
import { fmtDuration } from '../util/format'

export function TrainPanel({ trainId }: { trainId: string }) {
  const net = useNetwork()
  const close = useDashboard((s) => s.select)
  if (!net) return null

  const train = net.trains.find((t) => t.id === trainId)
  const stationById = net.data.stationById

  if (!train) {
    return (
      <motion.aside
        className="panel surface"
        initial={{ x: 28, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 28, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      >
        <header className="panel-head">
          <div className="panel-kicker">Train</div>
          <h2 className="panel-title">Out of service</h2>
          <button className="icon-btn close" onClick={() => close(null)} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <section className="panel-block">
          <div className="empty">This train has completed its run or isn't running at the selected time.</div>
        </section>
      </motion.aside>
    )
  }

  const prev = stationById.get(train.prevStationId)
  const next = stationById.get(train.nextStationId)
  const pct = Math.round(train.progress * 100)

  return (
    <motion.aside
      className="panel surface"
      initial={{ x: 28, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 28, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
    >
      <header className="panel-head">
        <div className="panel-kicker">In service</div>
        <h2 className="panel-title">
          <TrainFront size={18} style={{ marginRight: 8, color: train.colour, verticalAlign: '-3px' }} />
          {train.lineName}
        </h2>
        <div className="chips">
          <span className="chip" style={{ ['--c' as string]: train.colour }}>
            <span className="chip-dot" /> {train.originName} <ArrowRight size={11} /> {train.headingName}
          </span>
        </div>
        <button className="icon-btn close" onClick={() => close(null)} aria-label="Close">
          <X size={16} />
        </button>
      </header>

      {/* Next stop + ETA */}
      <section className="panel-block">
        <div className="block-label">Next stop</div>
        <div className="nextstop">
          <span className="nextstop-name">{next?.name ?? '—'}</span>
          <span className="nextstop-eta tnum">{fmtDuration(train.etaNextSec)}</span>
        </div>
        <div className="segline">
          <span className="seg-end">{prev?.name ?? train.originName}</span>
          <div className="seg-track">
            <div className="seg-fill" style={{ width: `${segFrac(train.etaNextSec)}%`, background: train.colour }} />
            <span className="seg-dot" style={{ left: `${segFrac(train.etaNextSec)}%`, background: train.colour }} />
          </div>
          <span className="seg-end">{next?.name ?? '—'}</span>
        </div>
      </section>

      {/* Journey progress */}
      <section className="panel-block">
        <div className="block-label">Route progress</div>
        <div className="meter">
          <div className="meter-fill" style={{ width: `${pct}%`, background: train.colour }} />
        </div>
        <div className="stat-row">
          <div className="stat">
            <span className="stat-val tnum">{pct}%</span>
            <span className="stat-key">of route</span>
          </div>
          <div className="stat">
            <span className="stat-val tnum">
              <Navigation size={12} style={{ verticalAlign: '-1px', transform: `rotate(${train.bearing}deg)` }} />{' '}
              {Math.round(train.bearing)}°
            </span>
            <span className="stat-key">heading</span>
          </div>
          <div className="stat">
            <span className="stat-val tnum">{train.lat.toFixed(4)}, {train.lng.toFixed(4)}</span>
            <span className="stat-key">interpolated position</span>
          </div>
        </div>
      </section>

      <footer className="panel-foot">
        Position is interpolated from the schedule (no live GPS feed exists for Namma Metro).
      </footer>
    </motion.aside>
  )
}

// Visual fill of the inter-station segment: we don't know the segment's full duration here,
// so approximate from the next-stop ETA against a nominal ~110s hop (kept purely visual).
function segFrac(etaSec: number): number {
  const nominal = 110
  return Math.max(4, Math.min(96, (1 - Math.min(etaSec, nominal) / nominal) * 100))
}
