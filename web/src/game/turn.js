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
  ATOM_WHITE,
  ATOM_GRAY,
} from './config.js'
import { drawAtoms } from './draw.js'
import { xForTurn, placementCountThisTurn } from './state.js'
import { getConnectivityChoice } from './combat.js'

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
  const drawCount = Math.max(1, Math.min(30, Math.floor(Number(state.config?.baseDrawCount ?? state.baseDrawCount ?? state.turnDrawCount ?? 10))))
  const drawn = drawAtoms(drawCount, state.drawWeights)
  const pool = state.pools[state.currentPlayer]
  for (const color of drawn) {
    pool[color] = (pool[color] ?? 0) + 1
  }
  state.phase = PHASE_PLACE
  state.turnPlacedCount = 0
}

export function startTurnDefault(state) {
  const cfg = state.config ?? {}
  if (cfg.gameMode === 'ai_level1' && state.currentPlayer === 1) {
    state.turnDrawCount = 0
    const add = Math.max(0, cfg.aiBlackPerTurn ?? 8)
    state.pools[1][ATOM_BLACK] = (state.pools[1][ATOM_BLACK] ?? 0) + add
    // 尽可能放满：本回合可放置数 = 当前拥有的全部黑原子（不再用 aiPlaceLimit 封顶）
    state.turnPlaceLimit = Math.max(0, state.pools[1][ATOM_BLACK] ?? 0)
    state.turnAttackLimit = 1
    state.phase0Choice = null
    state.phase = PHASE_PLACE
    state.turnPlacedCount = 0
    state.placementHistory = []
    delete state._lastAIPlaceStepDone
    return
  }
  if (cfg.gameMode === 'ai_level2' && state.currentPlayer === 1) {
    state.turnDrawCount = 0
    const drawN = Math.max(1, Math.min(20, cfg.ai2DrawCount ?? 10))
    const weights = Array.isArray(cfg.ai2DrawWeights) && cfg.ai2DrawWeights.length >= 8
      ? cfg.ai2DrawWeights.slice(0, 8)
      : [5, 2, 2, 0, 0, 0, 0, 0]
    const drawn = drawAtoms(drawN, weights)
    const pool = state.pools[1]
    for (const color of drawn) {
      pool[color] = (pool[color] ?? 0) + 1
    }
    state.turnPlaceLimit = Math.max(1, Math.min(25, cfg.ai2PlaceLimit ?? 12))
    state.turnAttackLimit = 1
    state.phase0Choice = null
    state.phase = PHASE_PLACE
    state.turnPlacedCount = 0
    state.placementHistory = []
    delete state._lastAIPlaceStepDone
    return
  }
  if (cfg.gameMode === 'ai_level3' && state.currentPlayer === 1) {
    state.phase = PHASE_ACTION
    state.turnPlaceLimit = 0
    state.turnDrawCount = 0
    state.turnPlacedCount = 0
    state.placementHistory = []
    state.turnAttackUsed = 0
    state.turnAttackLimit = state.cells[1].filter((c) => c.hasBlack()).length
    state.attackedCellsThisTurn = []
    state.attackedEnemyCellIndicesThisTurn = []
    state.redEffectTargetCellIndicesThisTurn = []
    state.phase0Choice = null
    delete state._lastAIPlaceStepDone
    return
  }
  state.turnDrawCount = cfg.baseDrawCount ?? 10
  state.turnPlaceLimit = cfg.basePlaceLimit ?? 10
  state.turnAttackLimit = 1
  state.phase0Choice = null
  advanceToPhase1(state)
}

export function validatePlace(state, cellIndex, r, c, color, options = {}) {
  if (state.phase !== PHASE_PLACE) return [false, '当前不是排布阶段']
  // 本回合已放置总数（所有颜色合计）不得超过 turnPlaceLimit
  const placed = placementCountThisTurn(state)
  if (placed >= (state.turnPlaceLimit ?? 0)) return [false, '本回合放置数已达上限']
  const pool = state.pools[state.currentPlayer]
  if ((pool[color] ?? 0) <= 0) return [false, '没有该颜色原子']
  const targetPlayer =
    (color === ATOM_WHITE || color === ATOM_GRAY) && options.targetPlayer != null
      ? options.targetPlayer
      : state.currentPlayer
  const cells = state.cells[targetPlayer]
  if (cellIndex < 0 || cellIndex >= cells.length) return [false, '无效格子']
  const cell = cells[cellIndex]
  if (!cell.grid.inBounds(r, c)) return [false, '越界']
  if (color === ATOM_WHITE) {
    if (cell.get(r, c) == null) return [false, '白原子需点击格上已有原子才能发动（删除该原子并消耗 1 个白原子）']
    return [true, '']
  }
  if (targetPlayer !== state.currentPlayer && color !== ATOM_GRAY) return [false, '仅白/灰原子可作用于对方格子']
  if (cell.get(r, c) != null) return [false, '该格点已有原子']
  const blacks = cell.blackPoints()
  if (color === ATOM_BLACK) {
    // 黑原子只能放在已有黑原子的邻居格点上（或该格首个原子）
    if (blacks.size > 0) {
      const hasBlackNeighbor = cell.grid.neighborsOf(r, c).some(([nr, nc]) => blacks.has(`${nr},${nc}`))
      if (!hasBlackNeighbor) return [false, '黑原子必须与已有黑原子相邻']
    }
  } else if (color === ATOM_GRAY) {
    const hasBlackNeighbor = cell.grid.neighborsOf(r, c).some(([nr, nc]) => blacks.has(`${nr},${nc}`))
    if (!hasBlackNeighbor)
      return [false, targetPlayer !== state.currentPlayer ? '灰原子必须放在对方格子中黑原子的邻居格点上' : '灰原子必须与至少一个黑原子相邻']
  } else {
    const hasBlackNeighbor = cell.grid.neighborsOf(r, c).some(([nr, nc]) => blacks.has(`${nr},${nc}`))
    if (!hasBlackNeighbor) return [false, '红/蓝/绿/黄/紫必须与至少一个黑原子相邻']
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

export function applyPlace(state, cellIndex, r, c, color, options = {}) {
  const placed = placementCountThisTurn(state)
  if (placed >= (state.turnPlaceLimit ?? 0)) return false // 本回合已放总数达上限，不能再放置任何原子
  const targetPlayer =
    (color === ATOM_WHITE || color === ATOM_GRAY) && options.targetPlayer != null
      ? options.targetPlayer
      : state.currentPlayer
  const [ok, msg] = validatePlace(state, cellIndex, r, c, color, options)
  if (!ok) return false
  const cell = state.cells[targetPlayer][cellIndex]
  // 排布阶段白原子效果：点击某格上一颗原子 → 删除该原子，消耗 1 个白原子；若该格随后出现多个不连通子集则由统一规则弹窗选择
  // turnPlacedCount：不论黑/红/蓝/绿/黄/紫/白/灰，每放置 1 次就 +1，用于「排布 · 已放」与上限校验
  if (color === ATOM_WHITE) {
    cell.remove(r, c)
    state.pools[state.currentPlayer][color]--
    const connectivityChoice = getConnectivityChoice(cell)
    return { applied: true, connectivityChoice, defender: targetPlayer, cellIndex }
  }
  const targetCell = state.cells[targetPlayer][cellIndex]
  targetCell.place(r, c, color)
  state.pools[state.currentPlayer][color]--
  return true
}

/** 是否存在可撤回的非黑、非白原子放置（黑与白不可撤回） */
export function canUndoPlacement(state) {
  const hist = state.placementHistory ?? []
  return state.phase === PHASE_PLACE && hist.some((h) => h.color !== ATOM_BLACK && h.color !== ATOM_WHITE)
}

/** 撤回最后一个非黑、非白原子的放置；黑与白不可撤回。计数以 placementHistory 为准会随之下降。 */
export function undoLastPlacement(state) {
  const hist = state.placementHistory ?? []
  if (hist.length === 0) return false
  if (state.phase !== PHASE_PLACE) return false
  let idx = -1
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i].color !== ATOM_BLACK && hist[i].color !== ATOM_WHITE) {
      idx = i
      break
    }
  }
  if (idx < 0) return false
  const last = hist[idx]
  hist.splice(idx, 1)
  const cellOwner = last.targetPlayer ?? last.player
  const cell = state.cells[cellOwner][last.cellIndex]
  cell.remove(last.r, last.c)
  state.pools[last.player][last.color] = (state.pools[last.player][last.color] ?? 0) + 1
  state.turnPlacedCount = placementCountThisTurn(state)
  return true
}

/**
 * 纯函数：只计算要放置的黑原子坐标，不修改 state。
 * 约束：每个新放置的黑原子，其邻居中至少有一个已放置的黑原子（本格已有黑或本批已放的黑）；
 * 仅当本格尚无任何黑原子时，第一个黑可放在任意空位（中心或随机）。
 * 返回 [ok, msg, placements]，placements 为 [[r,c], ...]。
 */
export function batchPlaceOnCell(state, cellIndex, n, viewCenter) {
  if (state.phase !== PHASE_PLACE) return [false, '当前不是排布阶段', null]
  const pool = state.pools[state.currentPlayer]
  const cells = state.cells[state.currentPlayer]
  if (cellIndex < 0 || cellIndex >= cells.length) return [false, '无效格子', null]
  const cell = cells[cellIndex]
  const placed = placementCountThisTurn(state)
  const remaining = (state.turnPlaceLimit ?? 0) - placed
  if (remaining <= 0) return [false, '本回合放置数已达上限', null] // 本回合已放总数达上限后不能再放
  const count = Math.min(pool[ATOM_BLACK] ?? 0, Math.max(0, n), remaining)
  if (count <= 0) return [false, '数量为 0 或池中无黑原子', null]
  const allPts = cell.grid.allPoints()
  const occupied = new Set()
  for (const [k] of cell.allAtoms()) occupied.add(k)
  const blackPoints = new Set(cell.blackPoints())
  const valid = new Set(allPts.map(([r, c]) => `${r},${c}`))
  const empty = new Set([...valid].filter((k) => !occupied.has(k)))
  if (empty.size === 0) return [false, '该格已无空位', null]

  /** 返回与至少一个黑原子相邻的空格（保证新放的黑原子满足「邻居中至少有一个已放置的黑」） */
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
  state.attackedEnemyCellIndicesThisTurn = []
  state.redEffectTargetCellIndicesThisTurn = []
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
    if (state.graySilencedUntilTurn[p] != null && state.turnNumber >= state.graySilencedUntilTurn[p]) {
      state.graySilencedPoints[p] = new Set()
    }
  }
}

/** 第三关「增殖」：在 cell 内放置 n 个连通的黑原子（不消耗 pool），用于初始化 AI 格子；第一个原子在格子中央 */
function placeConnectedBlacksOnCell(cell, n) {
  if (n <= 0) return
  const allPts = cell.grid.allPoints()
  const valid = new Set(allPts.map(([r, c]) => `${r},${c}`))
  let empty = new Set(valid)
  for (const [k] of cell.allAtoms()) empty.delete(k)
  if (empty.size === 0) return
  const centerKey = `${cell.grid.centerR},${cell.grid.centerC}`
  const first = empty.has(centerKey) ? centerKey : [...empty][Math.floor(Math.random() * empty.size)]
  const [r0, c0] = first.split(',').map(Number)
  cell.place(r0, c0, ATOM_BLACK)
  let blk = new Set([first])
  empty.delete(first)
  for (let i = 1; i < n; i++) {
    const candidates = []
    for (const k of blk) {
      const [r, c] = k.split(',').map(Number)
      for (const [nr, nc] of cell.grid.neighborsOf(r, c)) {
        const pk = `${nr},${nc}`
        if (empty.has(pk)) candidates.push(pk)
      }
    }
    const uniq = [...new Set(candidates)]
    if (uniq.length === 0) break
    const pick = uniq[Math.floor(Math.random() * uniq.length)]
    const [rr, cc] = pick.split(',').map(Number)
    cell.place(rr, cc, ATOM_BLACK)
    blk.add(pick)
    empty.delete(pick)
  }
}

/** 第三关「增殖」：开局时初始化 P1 每个格子有 x 个连通黑原子 */
export function initLevel3AICells(state) {
  const x = Math.max(1, Math.min(20, state.config?.ai3InitialBlack ?? 3))
  for (const cell of state.cells[1]) {
    placeConnectedBlacksOnCell(cell, x)
  }
}

/** 第三关「增殖」：AI 回合结束时，每个 P1 格子的每个黑原子周围随机新增 y 个黑原子（空邻居） */
export function applyLevel3Proliferation(state) {
  const y = Math.max(1, Math.min(6, state.config?.ai3ProliferatePerBlack ?? 2))
  for (const cell of state.cells[1]) {
    const blacks = [...cell.blackPoints()]
    const toAdd = new Set()
    for (const key of blacks) {
      const [r, c] = key.split(',').map(Number)
      const neighbors = cell.grid.neighborsOf(r, c)
      const empty = neighbors.filter(([nr, nc]) => cell.get(nr, nc) == null).map(([nr, nc]) => `${nr},${nc}`)
      const pick = Math.min(y, empty.length)
      for (let i = 0; i < pick; i++) {
        const idx = Math.floor(Math.random() * empty.length)
        toAdd.add(empty[idx])
        empty.splice(idx, 1)
      }
    }
    for (const key of toAdd) {
      const [r, c] = key.split(',').map(Number)
      cell.place(r, c, ATOM_BLACK)
    }
  }
}
