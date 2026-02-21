/**
 * Triangle grid: point indexing, neighbors, vertical/horizontal distances.
 */
import { TRI_HEIGHT } from './config.js'

const DIST_ONE_TOL = 1e-6

export function pointToXy(r, c) {
  return { x: c + 0.5 * r, y: r * TRI_HEIGHT }
}

export function distanceBetween(p1, p2) {
  const { x: x1, y: y1 } = pointToXy(p1[0], p1[1])
  const { x: x2, y: y2 } = pointToXy(p2[0], p2[1])
  return Math.hypot(x2 - x1, y2 - y1)
}

export function neighbors(r, c) {
  return [
    [r - 1, c],
    [r - 1, c + 1],
    [r, c - 1],
    [r, c + 1],
    [r + 1, c - 1],
    [r + 1, c],
  ]
}

export function verticalDistanceUnits(pointKeys) {
  if (!pointKeys?.size) return 0
  const rows = [...pointKeys].map((s) => parseInt(s.split(',')[0], 10))
  return Math.max(...rows) - Math.min(...rows)
}

function xValFromKey(s) {
  const [r, c] = s.split(',').map(Number)
  return c + 0.5 * r
}

export function horizontalDistanceUnits(pointKeys) {
  if (!pointKeys?.size) return 0
  const xs = [...pointKeys].map(xValFromKey)
  return Math.max(...xs) - Math.min(...xs)
}

function offsetToAxial(row, col) {
  const q = col - Math.floor((row - (row & 1)) / 2)
  return [q, row]
}

export function hexDistance(r, c, centerR, centerC) {
  const [q, rAx] = offsetToAxial(r, c)
  const [q0, r0] = offsetToAxial(centerR, centerC)
  const dq = q - q0
  const dr = rAx - r0
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2
}

export function inHexagon(r, c, centerR, centerC, radius) {
  return hexDistance(r, c, centerR, centerC) <= radius
}

function axialToOffset(q, rAx) {
  const row = rAx
  const col = q + Math.floor((row - (row & 1)) / 2)
  return [row, col]
}

/** Hexagon corners in (r,c) offset coords for drawing */
export function hexagonCorners(centerR, centerC, radius) {
  const [q0, r0] = offsetToAxial(centerR, centerC)
  const cornersAxial = [
    [q0 + radius, r0],
    [q0 + radius, r0 - radius],
    [q0, r0 - radius],
    [q0 - radius, r0],
    [q0 - radius, r0 + radius],
    [q0, r0 + radius],
  ]
  return cornersAxial.map(([q, rAx]) => axialToOffset(q, rAx))
}

export class TriangleGrid {
  constructor(rows, cols, centerR = null, centerC = null, hexRadius = null) {
    this.rows = rows
    this.cols = cols
    this.centerR = centerR ?? Math.floor(rows / 2)
    this.centerC = centerC ?? Math.floor(cols / 2)
    this.hexRadius = hexRadius
    this._points = []
    this._rebuild()
  }

  _rebuild() {
    this._points = []
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (
          this.hexRadius == null ||
          inHexagon(r, c, this.centerR, this.centerC, this.hexRadius)
        ) {
          this._points.push([r, c])
        }
      }
    }
  }

  allPoints() {
    return [...this._points]
  }

  neighborsOf(r, c) {
    const out = []
    const here = [r, c]
    for (const [nr, nc] of neighbors(r, c)) {
      if (this.inBounds(nr, nc)) {
        if (Math.abs(distanceBetween(here, [nr, nc]) - 1.0) < DIST_ONE_TOL) {
          out.push([nr, nc])
        }
      }
    }
    return out
  }

  inBounds(r, c) {
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false
    if (this.hexRadius == null) return true
    return inHexagon(r, c, this.centerR, this.centerC, this.hexRadius)
  }
}
