/**
 * Hex grid rendering utilities
 */
import { pointToXy } from '../game/grid.js'

const TRI_HEIGHT = Math.sqrt(3) / 2

/** Grid (r,c) to pixel */
export function gridPointToPx(r, c, scale, originX, originY) {
  const { x, y } = pointToXy(r, c)
  return {
    x: originX + x * scale,
    y: originY + y * scale,
  }
}

/** Pixel to nearest grid (r,c). Returns null if no valid point. */
export function pixelToGrid(px, py, scale, ox, oy, grid) {
  const gx = (px - ox) / scale
  const gy = (py - oy) / scale
  const r = Math.round(gy / TRI_HEIGHT)
  const c = Math.round(gx - 0.5 * r)
  if (!grid.inBounds(r, c)) return null
  return [r, c]
}
