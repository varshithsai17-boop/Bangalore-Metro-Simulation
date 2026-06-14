import { Pause, Play, Radio } from 'lucide-react'
import { useDashboard, type SimSpeed } from '../store/useDashboard'

const SPEEDS: SimSpeed[] = [1, 2, 5, 10]

/** LIVE · PAUSE · 1× 2× 5× 10× — drives the shared simulation clock. */
export function TransportControls() {
  const clock = useDashboard((s) => s.clock)
  const goLive = useDashboard((s) => s.goLive)
  const pause = useDashboard((s) => s.pause)
  const play = useDashboard((s) => s.play)
  const setSpeed = useDashboard((s) => s.setSpeed)

  return (
    <div className="transport">
      <button className={`tbtn live ${clock.live ? 'on' : ''}`} onClick={goLive} title="Follow real time">
        <Radio size={12} /> LIVE
      </button>
      <button
        className={`tbtn icon ${clock.paused ? 'on' : ''}`}
        onClick={() => (clock.paused ? play() : pause())}
        title={clock.paused ? 'Resume' : 'Pause'}
      >
        {clock.paused ? <Play size={13} /> : <Pause size={13} />}
      </button>
      <div className="speed-group">
        {SPEEDS.map((sp) => {
          const on = !clock.live && !clock.paused && clock.speed === sp
          return (
            <button key={sp} className={`tbtn speed ${on ? 'on' : ''}`} onClick={() => setSpeed(sp)}>
              {sp}×
            </button>
          )
        })}
      </div>
    </div>
  )
}
