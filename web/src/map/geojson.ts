// Builders converting bundle/sim data into GeoJSON for MapLibre sources.

import type { FeatureCollection, Feature, LineString, Point } from 'geojson'
import type { MetroData } from '../data/loadBundle'
import type { Train } from '../sim/trains'

const INTERCHANGE_COLOUR = '#e9eef5'

export function linesGeoJSON(data: MetroData): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: data.lines.map(
      (l): Feature<LineString> => ({
        type: 'Feature',
        properties: { lineId: l.id, colour: l.colour, name: l.name },
        geometry: { type: 'LineString', coordinates: l.path },
      }),
    ),
  }
}

export function stationsGeoJSON(data: MetroData): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: data.stations.map((s): Feature<Point> => {
      const colour = s.interchange ? INTERCHANGE_COLOUR : data.lineById.get(s.lines[0])?.colour ?? '#8aa'
      // Per-line membership flags let MapLibre filter stations by visible lines.
      const lineFlags: Record<string, boolean> = {}
      for (const id of s.lines) lineFlags[`line_${id}`] = true
      return {
        type: 'Feature',
        properties: {
          id: s.id,
          name: s.name,
          colour,
          interchange: s.interchange,
          lineCount: s.lines.length,
          ...lineFlags,
          // activity defaults; updated each tick via setData in MetroMap
          activity: 0,
        },
        geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
      }
    }),
  }
}

export function trainsGeoJSON(trains: Train[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: trains.map(
      (t): Feature<Point> => ({
        type: 'Feature',
        properties: {
          id: t.id,
          lineId: t.lineId,
          colour: t.colour,
          bearing: t.bearing,
          icon: `train-${t.lineId}`,
        },
        geometry: { type: 'Point', coordinates: [t.lng, t.lat] },
      }),
    ),
  }
}
