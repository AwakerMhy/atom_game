/**
 * Turn flow: phase transitions, place, draw
 */
import {
  PHASE_CONFIRM,
  PHASE_DRAW,
  PHASE_PLACE,
  PHASE_ACTION,
  CHOICE_EXTRA_DRAW,
  CHOICE_EXTRA_PLACE,
  CHOICE_EXTRA_ATTACK,
  ATOM_BLACK,
} from './config.js'
import { drawAtoms } from './draw.js'
import { xForTurn, playerCells } from './state.js'

export function applyPhase0Choice(state, choice) {
  if (state.phase !== PHASE_CONFIRM || state.phase0Choice != null) return false
  if (![CHOICE_EXTRA_DRAW, CHOICE_EXTRA_PLACE, CHOICE_EXTRA_ATTACK].includes(choice)) return false
  state.phase0Choice = choice
  const x = xForTurn(state)
  const baseDraw = state.config.baseDrawCount ?? state.baseDrawCount
  const basePlace = state.config.basePlaceLimit ?? state.basePlaceLimit
  if (choice === CHOICE_EXTRA_DRAW) {
    state.turnDrawCount = baseDraw + x
    state.turnPlaceLimit = basePlace
    state.turnAttackLimit = 1
  } else if (choice === CHOICE_EXTRA_PLACE) {
    state.turnDrawCount = baseDraw
    state.turnPlaceLimit = basePlace + x
    state.turnAttackLimit = 1
  } else {
    state.turnDrawCount = baseDraw
    state.turnPlaceLimit = basePlace
    state.turnAttackLimit = Math.max(1, x)
  }
  return true
}

export function advanceToPhase1(state) {
  state.placementHistory = []
  state.phase = PHASE_DRAW
  const drawn = drawAtoms(state.turnDrawCount, state.drawWeights)
  const pool = state.pools[state.currentPlayer]
  for (const color of drawn) {
    pool[color] = (pool[color] ?? 0) + 1
  }
  state.phase = PHASE_PLACE
  state.turnPlacedCount = 0
}

export function startTurnDefault(state) {
  state.turnDrawCount = state.config.baseDrawCount ?? 10
  state.turnPlaceLimit = state.config.basePlaceLimit ?? 10
  state.turnAttackLimit = 1
  state.phase0Choice = null
  advanceToPhase1(state)
}

export function validatePlace(state, cellIndex, r, c, color) {
  if (state.phase !== PHASE_PLACE) return [false, '当前不是排布阶段']
  if (state.turnPlacedCount >= state.turnPlaceLimit) return [false, '本回合放置数已达上限']
  const pool = state.pools[state.currentPlayer]
  if ((pool[color] ?? 0) <= 0) return [false, '没有该颜色原子']
  const cells = state.cells[state.currentPlayer]
  if (cellIndex < 0 || cellIndex >= cells.length) return [false, '无效格子']
  const cell = cells[cellIndex]
  if (!cell.grid.inBounds(r, c) || cell.get(r, c) != null) return [false, '该格点已有原子或越界']
  if (color !== ATOM_BLACK) {
    const blacks = cell.blackPoints()
    const hasBlackNeighbor = cell.grid.neighborsOf(r, c).some(([nr, nc]) => blacks.has(`${nr},${nc}`))
    if (!hasBlackNeighbor) return [false, '红/蓝/绿/黄必须与至少一个黑原子相邻']
  }
  cell.place(r, c, color)
  if (!cell.isConnected()) {
    cell.remove(r, c)
    return [false, '放置后该格原子不连通']
  }
  if (!cell.hasBlack()) {
    cell.remove(r, c)
    return [false, '非空格至少需一个黑原子']
  }
  cell.remove(r, c)
  return [true, '']
}

export function applyPlace(state, cellIndex, r, c, color) {
  const [ok, msg] = validatePlace(state, cellIndex, r, c, color)
  if (!ok) return false
  const cell = state.cells[state.currentPlayer][cellIndex]
  cell.place(r, c, color)
  state.pools[state.currentPlayer][color]--
  state.turnPlacedCount++
  state.placementHistory = state.placementHistory ?? []
  state.placementHistory.push({ player: state.currentPlayer, cellIndex, r, c, color })
  return true
}

/** 是否存在可撤回的非黑原子放置 */
export function canUndoPlacement(state) {
  const hist = state.placementHistory ?? []
  return state.phase === PHASE_PLACE && hist.some((h) => h.color !== ATOM_BLACK)
}

/** 撤回最后一个非黑原子的放置；黑原子不可撤回 */
export function undoLastPlacement(state) {
  const hist = state.placementHistory ?? []
  if (hist.length === 0) return false
  if (state.phase !== PHASE_PLACE) return false
  let idx = -1
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i].color !== ATOM_BLACK) {
      idx = i
      break
    }
  }
  if (idx < 0) return false
  const last = hist[idx]
  hist.splice(idx, 1)
  const cell = state.cells[last.player][last.cellIndex]
  cell.remove(last.r, last.c)
  state.pools[last.player][last.color] = (state.pools[last.player][last.color] ?? 0) + 1
  state.turnPlacedCount--
  return true
}

/**
 * 纯函数：只计算要放置的黑原子坐标，不修改 state。
 * 返回 [ok, msg, placements]，placements 为 [[r,c], ...]。
 */
export function batchPlaceOnCell(state, cellIndex, n, viewCenter) {
  if (state.phase !== PHASE_PLACE) return [false, '当前不是排布阶段', null]
  const pool = state.pools[state.currentPlayer]
  const cells = state.cells[state.currentPlayer]
  if (cellIndex < 0 || cellIndex >= cells.length) return [false, '无效格子', null]
  const cell = cells[cellIndex]
  const count = Math.min(pool[ATOM_BLACK] ?? 0, Math.max(0, n))
  if (count <= 0) return [false, '数量为 0 或池中无黑原子', null]
  const remaining = state.turnPlaceLimit - state.turnPlacedCount
  if (count > remaining) return [false, `本回合最多还可放 ${remaining} 个`, null]
  const allPts = cell.grid.allPoints()
  const occupied = new Set()
  for (const [k] of cell.allAtoms()) occupied.add(k)
  const blackPoints = new Set(cell.blackPoints())
  const valid = new Set(allPts.map(([r, c]) => `${r},${c}`))
  const empty = new Set([...valid].filter((k) => !occupied.has(k)))
  if (empty.size === 0) return [false, '该格已无空位', null]

  function emptyNeighborsOfBlack(occ, blk, emp) {
    if (blk.size === 0) return []
    const out = []
    for (const k of blk) {
      const [r, c] = k.split(',').map(Number)
      for (const [nr, nc] of cell.grid.neighborsOf(r, c)) {
        const pk = `${nr},${nc}`
        if (valid.has(pk) && emp.has(pk)) out.push(pk)
      }
    }
    return [...new Set(out)]
  }

  const placements = []
  let occ = new Set(occupied)
  let blk = new Set(blackPoints)
  let emp = new Set(empty)
  let r0, c0

  if (blk.size === 0) {
    const centerPt =
      viewCenter && viewCenter[0] != null && viewCenter[1] != null && cell.grid.inBounds(viewCenter[0], viewCenter[1])
        ? `${viewCenter[0]},${viewCenter[1]}`
        : `${cell.grid.centerR},${cell.grid.centerC}`
    if (emp.has(centerPt)) {
      ;[r0, c0] = centerPt.split(',').map(Number)
    } else {
      const gridCenter = `${cell.grid.centerR},${cell.grid.centerC}`
      if (emp.has(gridCenter)) {
        ;[r0, c0] = gridCenter.split(',').map(Number)
      } else {
        const pick = [...emp][Math.floor(Math.random() * emp.size)]
        ;[r0, c0] = pick.split(',').map(Number)
      }
    }
  } else {
    const firstCandidates = emptyNeighborsOfBlack(occ, blk, emp)
    if (firstCandidates.length === 0) return [false, '该格无与现有黑原子相邻的空位', null]
    const pick = firstCandidates[Math.floor(Math.random() * firstCandidates.length)]
    ;[r0, c0] = pick.split(',').map(Number)
  }

  placements.push([r0, c0])
  occ.add(`${r0},${c0}`)
  blk.add(`${r0},${c0}`)
  emp.delete(`${r0},${c0}`)

  for (let i = 1; i < count; i++) {
    const candidates = emptyNeighborsOfBlack(occ, blk, emp)
    if (candidates.length === 0) {
      return [false, '空位不足或无与黑原子相邻的空位', null]
    }
    const pick = candidates[Math.floor(Math.random() * candidates.length)]
    const [rr, cc] = pick.split(',').map(Number)
    placements.push([rr, cc])
    occ.add(`${rr},${cc}`)
    blk.add(`${rr},${cc}`)
    emp.delete(`${rr},${cc}`)
  }
  return [true, `已在格子 ${cellIndex + 1} 放置 ${placements.length} 个黑原子`, placements]
}

export function endPlacePhase(state) {
  if (state.phase !== PHASE_PLACE) return
  state.phase = PHASE_ACTION
  state.turnAttackUsed = 0
  state.turnAttackLimit = state.cells[state.currentPlayer].filter((c) => c.hasBlack()).length
  state.attackedCellsThisTurn = []
}

export function endTurn(state) {
  state.currentPlayer = 1 - state.currentPlayer
  state.phase = PHASE_CONFIRM
  state.turnNumber++
  state.isFirstTurn = false
  // clear blue protection when turn has passed
  for (const p of [0, 1]) {
    if (state.blueProtectionUntilTurn[p] != null && state.turnNumber >= state.blueProtectionUntilTurn[p]) {
      state.blueProtectedPoints[p] = new Set()
    }
    if (state.yellowPriorityUntilTurn[p] != null && state.turnNumber >= state.yellowPriorityUntilTurn[p]) {
      state.yellowPriorityPoints[p] = new Set()
    }
  }
}
