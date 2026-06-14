import { Maximize2, Crosshair } from 'lucide-react'
import { useDashboard } from '../store/useDashboard'
import { fitPoints, flyTo, resetView } from '../map/mapRef'

/** Smooth camera presets — always eased, never an abrupt jump. */
export function CameraPresets() {
  const data = useDashboard((s) => s.data)
  if (!data) return null

  const allPoints = () => data.lines.flatMap((l) => l.path)
  const fitAll = () => fitPoints(allPoints())
  const majestic = data.interchanges[0]

  return (
    <div className="presets">
      <button className="pbtn" onClick={fitAll}>
        <Maximize2 size={12} /> Network
      </button>
      {majestic && (
        <button className="pbtn" onClick={() => flyTo(majestic.lng, majestic.lat, { zoom: 14 })}>
          <Crosshair size={12} /> Majestic
        </button>
      )}
      <button className="pbtn ghost" onClick={() => resetView(allPoints())}>
        Reset
      </button>
    </div>
  )
}
