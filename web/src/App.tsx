import { useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { loadBundle } from './data/loadBundle'
import { useDashboard } from './store/useDashboard'
import { MetroMap } from './map/MetroMap'
import { ClockDriver } from './components/ClockDriver'
import { TopBar } from './components/TopBar'
import { SearchBar } from './components/SearchBar'
import { StationPanel } from './components/StationPanel'
import { TrainPanel } from './components/TrainPanel'
import { TimelineSlider } from './components/TimelineSlider'
import { TransportControls } from './components/TransportControls'
import { CameraPresets } from './components/CameraPresets'
import { Legend } from './components/Legend'

function DetailPanel() {
  const selection = useDashboard((s) => s.selection)
  const stationById = useDashboard((s) => s.data?.stationById)
  return (
    <AnimatePresence mode="wait">
      {selection?.kind === 'station' && stationById?.get(selection.id) && (
        <StationPanel key={`st-${selection.id}`} station={stationById.get(selection.id)!} />
      )}
      {selection?.kind === 'train' && <TrainPanel key={`tr-${selection.id}`} trainId={selection.id} />}
    </AnimatePresence>
  )
}

export default function App() {
  const status = useDashboard((s) => s.status)
  const error = useDashboard((s) => s.error)
  const setData = useDashboard((s) => s.setData)
  const setError = useDashboard((s) => s.setError)

  useEffect(() => {
    let cancelled = false
    loadBundle()
      .then((data) => {
        if (!cancelled) setData(data)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [setData, setError])

  return (
    <div className="app">
      <MetroMap />
      <ClockDriver />
      {status === 'ready' && <TopBar />}
      {status === 'ready' && <SearchBar />}
      {status === 'ready' && <DetailPanel />}
      {status === 'ready' && <Legend />}
      {status === 'ready' && (
        <div className="dock surface">
          <TimelineSlider />
        </div>
      )}
      {status === 'ready' && (
        <div className="controls-panel surface">
          <TransportControls />
          <CameraPresets />
        </div>
      )}
      {status === 'loading' && (
        <div className="center-note">
          <div className="card">
            <div className="spinner" />
            Loading Namma Metro network…
          </div>
        </div>
      )}
      {status === 'error' && (
        <div className="center-note">
          <div className="card">Failed to load network data — {error}</div>
        </div>
      )}
    </div>
  )
}
