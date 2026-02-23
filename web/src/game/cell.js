/**
 * Single cell: grid point -> atom color, place/remove, connectivity.
 */
import { COLORS, ATOM_BLACK, ATOM_RED, ATOM_BLUE, ATOM_GREEN, ATOM_YELLOW, ATOM_PURPLE, ATOM_GRAY } from './config.js'
import { TriangleGrid } from './grid.js'

export class Cell {
  constructor(rows, cols, centerR = null, centerC = null, hexRadius = null) {
    this.grid = new TriangleGrid(rows, cols, centerR, centerC, hexRadius)
    this._atoms = new Map()
  }

  _key(r, c) {
    return `${r},${c}`
  }

  get(r, c) {
    return this._atoms.get(this._key(r, c)) ?? null
  }

  place(r, c, color) {
    if (!this.grid.inBounds(r, c) || this._atoms.has(this._key(r, c)))
      return false
    if (!COLORS.includes(color)) return false
    this._atoms.set(this._key(r, c), color)
    return true
  }

  remove(r, c) {
    const k = this._key(r, c)
    const color = this._atoms.get(k)
    if (color != null) this._atoms.delete(k)
    return color ?? null
  }

  allAtoms() {
    return [...this._atoms.entries()].map(([k, v]) => [k.split(',').map(Number), v])
  }

  blackPoints() {
    const out = new Set()
    for (const [k, color] of this._atoms) {
      if (color === ATOM_BLACK) out.add(k)
    }
    return out
  }

  /** Parse "r,c" to [r,c] for a Set of keys */
  static keysToPoints(keys) {
    return [...keys].map((s) => s.split(',').map(Number))
  }

  isEmpty() {
    return this._atoms.size === 0
  }

  isConnected() {
    const points = new Set()
    for (const [k] of this._atoms) {
      points.add(k)
    }
    if (points.size === 0) return true
    const start = [...points][0]
    const visited = new Set([start])
    const q = [start]
    while (q.length) {
      const [r, c] = q.shift().split(',').map(Number)
      for (const [nr, nc] of this.grid.neighborsOf(r, c)) {
        const pk = `${nr},${nc}`
        if (points.has(pk) && !visited.has(pk)) {
          visited.add(pk)
          q.push(pk)
        }
      }
    }
    return visited.size === points.size
  }

  hasBlack() {
    for (const c of this._atoms.values()) {
      if (c === ATOM_BLACK) return true
    }
    return false
  }

  hasYellow() {
    for (const c of this._atoms.values()) {
      if (c === ATOM_YELLOW) return true
    }
    return false
  }

  hasGray() {
    for (const c of this._atoms.values()) {
      if (c === ATOM_GRAY) return true
    }
    return false
  }

  countByColor() {
    const out = {}
    for (const c of COLORS) out[c] = 0
    for (const c of this._atoms.values()) out[c] = (out[c] ?? 0) + 1
    return out
  }

  connectedComponents() {
    const points = new Set(this._atoms.keys())
    if (points.size === 0) return []
    const remaining = new Set(points)
    const components = []
    while (remaining.size) {
      const start = [...remaining][0]
      remaining.delete(start)
      const comp = new Set([start])
      const q = [start]
      while (q.length) {
        const [r, c] = q.shift().split(',').map(Number)
        for (const [nr, nc] of this.grid.neighborsOf(r, c)) {
          const pk = `${nr},${nc}`
          if (remaining.has(pk)) {
            remaining.delete(pk)
            comp.add(pk)
            q.push(pk)
          }
        }
      }
      components.push(comp)
    }
    return components
  }

  countBlackNeighbors(r, c) {
    const color = this._atoms.get(this._key(r, c))
    if (!color || color === ATOM_BLACK) return 0
    const blacks = this.blackPoints()
    let n = 0
    for (const [nr, nc] of this.grid.neighborsOf(r, c)) {
      if (blacks.has(`${nr},${nc}`)) n++
    }
    return n
  }

  blackNeighborsOf(r, c) {
    const blacks = this.blackPoints()
    const out = new Set()
    for (const [nr, nc] of this.grid.neighborsOf(r, c)) {
      if (blacks.has(`${nr},${nc}`)) out.add(`${nr},${nc}`)
    }
    return out
  }

  /** 格点 (r,c) 是否与紫原子相邻 */
  hasPurpleNeighbor(r, c) {
    for (const [nr, nc] of this.grid.neighborsOf(r, c)) {
      if (this.get(nr, nc) === ATOM_PURPLE) return true
    }
    return false
  }

  /** 格点 (r,c) 的紫原子邻居坐标列表 [[nr,nc], ...]，用于发动效果后一并移除 */
  purpleNeighborPositions(r, c) {
    const out = []
    for (const [nr, nc] of this.grid.neighborsOf(r, c)) {
      if (this.get(nr, nc) === ATOM_PURPLE) out.push([nr, nc])
    }
    return out
  }

  /** 格点 (r,c) 相邻的紫原子个数（多紫叠加时用于计算跳数 1+K） */
  countPurpleNeighbors(r, c) {
    let n = 0
    for (const [nr, nc] of this.grid.neighborsOf(r, c)) {
      if (this.get(nr, nc) === ATOM_PURPLE) n++
    }
    return n
  }

  /** 在仅黑格图上从 (r,c) 出发 BFS，得到「不超过 maxHops 跳」的黑格集合（1 跳 = 直接黑邻居） */
  blackNeighborsWithinHops(r, c, maxHops) {
    const blacks = this.blackPoints()
    const result = new Set()
    if (maxHops < 1) return result
    let frontier = new Set()
    for (const [nr, nc] of this.grid.neighborsOf(r, c)) {
      const pk = `${nr},${nc}`
      if (blacks.has(pk)) {
        frontier.add(pk)
        result.add(pk)
      }
    }
    for (let step = 2; step <= maxHops && frontier.size > 0; step++) {
      const next = new Set()
      for (const key of frontier) {
        const [r1, c1] = key.split(',').map(Number)
        for (const [nr, nc] of this.grid.neighborsOf(r1, c1)) {
          const pk = `${nr},${nc}`
          if (blacks.has(pk) && !result.has(pk)) {
            result.add(pk)
            next.add(pk)
          }
        }
      }
      frontier = next
    }
    return result
  }

  /** 格点 (r,c) 的「黑原子邻居 ∪ 黑原子邻居的黑原子邻居」集合（用于与紫相邻的红/蓝/绿/黄效果扩展） */
  twoHopBlackNeighborsOf(r, c) {
    const blacks = this.blackPoints()
    const oneHop = new Set()
    for (const [nr, nc] of this.grid.neighborsOf(r, c)) {
      if (blacks.has(`${nr},${nc}`)) oneHop.add(`${nr},${nc}`)
    }
    const twoHop = new Set(oneHop)
    for (const key of oneHop) {
      const [r1, c1] = key.split(',').map(Number)
      for (const [nr, nc] of this.grid.neighborsOf(r1, c1)) {
        const pk = `${nr},${nc}`
        if (blacks.has(pk)) twoHop.add(pk)
      }
    }
    return twoHop
  }

  /** 与紫相邻时用 (1+K) 跳黑邻居数（K=相邻紫数），否则用 countBlackNeighbors */
  effectiveBlackNeighborCount(r, c) {
    const color = this.get(r, c)
    if (!color || color === ATOM_BLACK || color === ATOM_PURPLE) return 0
    const k = this.countPurpleNeighbors(r, c)
    if (k > 0) return this.blackNeighborsWithinHops(r, c, 1 + k).size
    return this.countBlackNeighbors(r, c)
  }

  /** 与紫相邻时用 (1+K) 跳黑邻居集合（K=相邻紫数），否则用 blackNeighborsOf */
  effectiveBlackNeighborsOf(r, c) {
    const k = this.countPurpleNeighbors(r, c)
    if (k > 0) return this.blackNeighborsWithinHops(r, c, 1 + k)
    return this.blackNeighborsOf(r, c)
  }

  blackConnectedComponents() {
    const blackKeys = new Set()
    for (const [k, c] of this._atoms) if (c === ATOM_BLACK) blackKeys.add(k)
    if (blackKeys.size === 0) return []
    const remaining = new Set(blackKeys)
    const components = []
    while (remaining.size) {
      const start = [...remaining][0]
      remaining.delete(start)
      const comp = new Set([start])
      const q = [start]
      while (q.length) {
        const [r, c] = q.shift().split(',').map(Number)
        for (const [nr, nc] of this.grid.neighborsOf(r, c)) {
          const pk = `${nr},${nc}`
          if (blackKeys.has(pk) && remaining.has(pk)) {
            remaining.delete(pk)
            comp.add(pk)
            q.push(pk)
          }
        }
      }
      components.push(comp)
    }
    return components
  }

  toJSON() {
    const obj = {}
    for (const [k, v] of this._atoms) obj[k] = v
    return obj
  }

  static fromJSON(json, gridConfig) {
    const cell = new Cell(
      gridConfig.rows,
      gridConfig.cols,
      gridConfig.centerR,
      gridConfig.centerC,
      gridConfig.hexRadius
    )
    for (const [k, v] of Object.entries(json)) {
      const [r, c] = k.split(',').map(Number)
      cell._atoms.set(k, v)
    }
    return cell
  }
}
