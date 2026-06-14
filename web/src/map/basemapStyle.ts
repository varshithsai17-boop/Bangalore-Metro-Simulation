import type { StyleSpecification } from 'maplibre-gl'

// Bengaluru viewport defaults.
export const BENGALURU_CENTER: [number, number] = [77.59, 12.99]
export const DEFAULT_ZOOM = 10.5

// Token-free dark basemap: CARTO "dark matter (no labels)" raster tiles + a free glyph
// endpoint for our own station labels. No Mapbox account or API key required.
// NOTE: glyphs MUST be valid .pbf. fonts.openmaptiles.org now returns an HTML page, which
// makes MapLibre's Pbf parser throw "Unimplemented type: 4" and — because the stations
// source feeds a text/symbol layer — fails the whole tile build, hiding station circles too.
// MapLibre's own glyph host serves valid pbf for Noto Sans and needs no token.
export function darkBasemap(): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      carto: {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
          'https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
          'https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
          'https://d.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors © CARTO',
      },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#070a0f' } },
      {
        id: 'carto',
        type: 'raster',
        source: 'carto',
        paint: { 'raster-opacity': 0.82, 'raster-contrast': 0.05 },
      },
    ],
  }
}
