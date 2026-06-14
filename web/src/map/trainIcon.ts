// Registers two icons per line:
//   arrow-<lineId>  — a generated directional chevron (tip up / north), used at far zoom.
//   train-<lineId>  — the PNG sprite under public/trains/<lineId>.png, used at medium/near zoom.
// Sprites can differ in source resolution, so each is normalized to a constant logical width via
// `pixelRatio` — that way one `icon-size` renders them the same. Sprites are drawn horizontally
// (front to the left), so the trains layer rotates them by `bearing + 90°`; the chevron points
// north, so it is rotated by `bearing` (see MetroMap's `icon-rotate` step expression).

import type maplibregl from 'maplibre-gl'

const TARGET_LOGICAL_WIDTH = 64 // CSS px (before icon-size)
const ARROW_SIZE = 48 // device px; registered at pixelRatio 2 → 24px logical

function lighten(hex: string, amt: number): string {
  const m = hex.replace('#', '')
  const r = parseInt(m.slice(0, 2), 16)
  const g = parseInt(m.slice(2, 4), 16)
  const b = parseInt(m.slice(4, 6), 16)
  const f = (v: number) => Math.round(v + (255 - v) * amt)
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`
}

/** A rounded chevron pointing up (north), tinted to the line colour with a soft glow. */
function drawArrowGlyph(colour: string): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = ARROW_SIZE
  canvas.height = ARROW_SIZE
  const ctx = canvas.getContext('2d')!
  const c = ARROW_SIZE / 2

  ctx.shadowColor = colour
  ctx.shadowBlur = ARROW_SIZE * 0.22

  ctx.beginPath()
  ctx.moveTo(c, c - 13) // tip
  ctx.lineTo(c + 10, c + 11)
  ctx.quadraticCurveTo(c, c + 5, c - 10, c + 11)
  ctx.closePath()
  ctx.fillStyle = lighten(colour, 0.45)
  ctx.fill()

  ctx.shadowBlur = 0
  ctx.beginPath()
  ctx.arc(c, c, 3.4, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  return ctx.getImageData(0, 0, ARROW_SIZE, ARROW_SIZE)
}

export async function registerTrainIcons(
  map: maplibregl.Map,
  lines: Array<{ id: string; colour: string }>,
): Promise<void> {
  // Arrows (synchronous canvas) — far-zoom glyph.
  for (const line of lines) {
    const aid = `arrow-${line.id}`
    if (!map.hasImage(aid)) map.addImage(aid, drawArrowGlyph(line.colour), { pixelRatio: 2 })
  }

  // Train sprites (async PNG) — medium/near-zoom glyph.
  await Promise.all(
    lines.map(async (line) => {
      const id = `train-${line.id}`
      if (map.hasImage(id)) return
      try {
        const resp = await map.loadImage(`${import.meta.env.BASE_URL}trains/${line.id}.png`)
        const img = resp?.data
        if (!img || map.hasImage(id)) return
        map.addImage(id, img, { pixelRatio: img.width / TARGET_LOGICAL_WIDTH })
      } catch {
        // Map torn down mid-load, or the sprite is missing — the line falls back to the arrow.
      }
    }),
  )
}
