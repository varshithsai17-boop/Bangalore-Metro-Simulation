// Type definitions mirroring the structure of data-pipeline output: metro-bundle.json.
// Geometry/stations come from OSM; ridership profiles from the RTI dataset; schedule
// from config. See ARCHITECTURE.md.

export type LngLat = [number, number]

export interface RidershipProfile {
  matched: boolean
  matchedName?: string
  /** 24 values, normalized 0..1 within the station's own busiest hour (weekdays). */
  hourlyWeekday: number[]
  /** 24 values, normalized 0..1 (weekends). */
  hourlyWeekend: number[]
  /** Average weekday throughput (entries + exits) per day. */
  dailyAvg: number
  peakHour: number
}

export interface Station {
  id: string
  name: string
  lng: number
  lat: number
  lines: string[]
  /** line id -> index of this station along that line. */
  lineSeq: Record<string, number>
  /** line id -> metres along that line's path. */
  distanceAlong: Record<string, number>
  /** line id -> metres from the Majestic interchange along that line. */
  distanceFromMajestic: Record<string, number>
  interchange: boolean
  ridership: RidershipProfile
}

export interface Line {
  id: string
  ref: string
  name: string
  /** Display colour (tuned for dark UI). */
  colour: string
  /** Authoritative OSM colour, for reference. */
  osmColour?: string
  from: string | null
  to: string | null
  /** Ordered station ids along the line. */
  stations: string[]
  /** Metres along the path for each station (parallel to `stations`). */
  stationDistancesM: number[]
  /** Polyline geometry as [lng, lat] pairs. */
  path: LngLat[]
  lengthM: number
  /** Travel time (s) for each inter-station segment (length = stations - 1). */
  segmentTimesSec: number[]
  /** Total end-to-end run time in seconds. */
  runTimeSec: number
}

export interface Interchange {
  id: string
  name: string
  lng: number
  lat: number
  lines: string[]
}

export interface DayWindow {
  start: number // minutes since midnight
  end: number
}

export interface HeadwayWindow {
  from: number // minutes since midnight
  to: number
  sec: number // headway in seconds
}

export interface Schedule {
  scheduleSpeedKmph: number
  dwellSec: number
  operatingHours: {
    weekday: DayWindow
    saturday: DayWindow
    sunday: DayWindow
  }
  headways: HeadwayWindow[]
}

export interface BundleMeta {
  network: string
  city: string
  scope: string[]
  sources: Record<string, string>
  ridership: { dateMin: string; dateMax: string; stations: number }
  networkDailyThroughput: number
  estimateDisclaimer: string
  unmatchedStations: string[]
  generatedAt?: string
}

export interface MetroBundle {
  meta: BundleMeta
  schedule: Schedule
  lines: Line[]
  stations: Station[]
  interchanges: Interchange[]
}
