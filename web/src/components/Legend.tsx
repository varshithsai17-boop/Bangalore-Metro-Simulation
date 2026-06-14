import { Eye, EyeOff } from 'lucide-react'
import { useDashboard } from '../store/useDashboard'

/**
 * Compact network legend that doubles as the line-visibility filter (clicking a line
 * toggles it on the map). Keeps the control surface minimal — one component, two jobs.
 */
export function Legend() {
  const data = useDashboard((s) => s.data)
  const lineFilter = useDashboard((s) => s.lineFilter)
  const toggleLine = useDashboard((s) => s.toggleLine)
  if (!data) return null

  return (
    <div className="legend surface">
      <div className="legend-lines">
        {data.lines.map((l) => {
          const on = lineFilter[l.id] !== false
          return (
            <div key={l.id} className={`legend-line ${on ? '' : 'off'}`}>
              <span className="ll-swatch" style={{ background: l.colour }} />
              <span className="ll-name">{l.name.replace(' Line', '')}</span>
              <button
                className="ll-eye"
                onClick={() => toggleLine(l.id)}
                title={on ? 'Hide line' : 'Show line'}
                aria-label={on ? 'Hide line' : 'Show line'}
              >
                {on ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
            </div>
          )
        })}
      </div>

      <div className="legend-keys">
        <span className="lk">
          <span className="lk-glyph lk-train" /> Train
        </span>
        <span className="lk">
          <span className="lk-glyph lk-station" /> Station
        </span>
        <span className="lk">
          <span className="lk-glyph lk-inter" /> Interchange
        </span>
      </div>

      <div className="legend-activity">
        <span className="la-label">Activity</span>
        <span className="la-ramp" />
        <span className="la-ends">
          <span>Quiet</span>
          <span>Busy</span>
        </span>
      </div>
    </div>
  )
}
