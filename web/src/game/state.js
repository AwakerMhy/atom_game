/**
 * Game state: pools, HP, cells, phase, etc.
 */
import { Cell } from './cell.js'
import {
  ATOM_BLACK,
  ATOM_RED,
  ATOM_BLUE,
  ATOM_GREEN,
  ATOM_YELLOW,
  INITIAL_HP,
  INITIAL_POOL,
  PHASE_CONFIRM,
  PHASE_DRAW,
  PHASE_PLACE,
  PHASE_ACTION,
} from './config.js'

const GRID_ROWS = 100
const GRID_COLS = 100
const CENTER_R = 50
const CENTER_C = 50
const HEX_RADIUS = 15

function makeCells(count) {
  const n = Math.max(2, Math.min(6, count ?? 3))
  return Array.from({ length: n }, () => new Cell(GRID_ROWS, GRID_COLS, CENTER_R, CENTER_C, HEX_RADIUS))
}

export function createGameState(config = {}) {
  const initialPool = { ...INITIAL_POOL }
  const cfg = {
    baseDrawCount: 10,
    basePlaceLimit: 10,
    drawWeights: [3, 1, 1, 1, 1, 0, 0],
    initialHp: INITIAL_HP,
    cellCount: 3,
    ...config,
  }
  const base = [3, 1, 1, 1, 1, 0, 0, 0]
  const numColors = 8
  const wIn = Array.isArray(cfg.drawWeights) ? cfg.drawWeights : base
  const weights = wIn.length >= numColors ? wIn.slice(0, numColors) : [...wIn, ...Array(numColors - wIn.length).fill(0)].slice(0, numColors)
  const hpVal = Math.max(1, Math.min(99, cfg.initialHp ?? INITIAL_HP))
  const cellCount = Math.max(2, Math.min(6, cfg.cellCount ?? 3))
  return {
    config: cfg,
    pools: [{ ...initialPool }, { ...initialPool }],
    hp: [hpVal, hpVal],
    cells: [makeCells(cellCount), makeCells(cellCount)],
    currentPlayer: 0,
    phase: PHASE_CONFIRM,
    phase0Choice: null,
    baseDrawCount: cfg.baseDrawCount,
    basePlaceLimit: cfg.basePlaceLimit,
    drawWeights: weights,
    turnDrawCount: cfg.baseDrawCount,
    turnPlaceLimit: cfg.basePlaceLimit,
    turnAttackLimit: 1,
    turnPlacedCount: 0,
    turnAttackUsed: 0,
    turnNumber: 0,
    attackedCellsThisTurn: [],
    attackedEnemyCellIndicesThisTurn: [],
    redEffectTargetCellIndicesThisTurn: [],
    isFirstTurn: true,
    blueProtectedPoints: { 0: new Set(), 1: new Set() },
    blueProtectionUntilTurn: {},
    yellowPriorityPoints: { 0: new Set(), 1: new Set() },
    yellowPriorityUntilTurn: {},
    graySilencedPoints: { 0: new Set(), 1: new Set() },
    graySilencedUntilTurn: {},
    placementHistory: [],
  }
}

export function opponent(state, player) {
  return 1 - player
}

export function pool(state, player) {
  return state.pools[player]
}

export function playerCells(state, player) {
  return state.cells[player]
}

export function cellsWithBlackCount(state, player) {
  return state.cells[player].filter((c) => c.hasBlack()).length
}

export function nonEmptyCellCount(state, player) {
  return state.cells[player].filter((c) => !c.isEmpty()).length
}

export function xForTurn(state) {
  return nonEmptyCellCount(state, state.currentPlayer)
}

export function canAttackThisTurn(state) {
  if (state.turnAttackUsed >= state.turnAttackLimit) return false
  if (state.isFirstTurn) return false
  return true
}

/** 该格本回合是否已进攻过（每格每回合只能进攻一次） */
export function hasCellAttackedThisTurn(state, player, cellIndex) {
  const list = state.attackedCellsThisTurn ?? []
  return list.some(([p, ci]) => p === player && ci === cellIndex)
}

export function winner(state) {
  if (state.hp[0] <= 0) return 1
  if (state.hp[1] <= 0) return 0
  return null
}

export function isBlackProtected(state, player, cellIndex, pt) {
  const pk = typeof pt === 'string' ? pt : `${pt[0]},${pt[1]}`
  return state.blueProtectedPoints[player]?.has(`${cellIndex}:${pk}`) ?? false
}

export function isBlackYellowPriority(state, player, cellIndex, pt) {
  const pk = typeof pt === 'string' ? pt : `${pt[0]},${pt[1]}`
  return state.yellowPriorityPoints[player]?.has(`${cellIndex}:${pk}`) ?? false
}

/** 该格点是否处于灰原子点击效果的沉默区域内（下一回合内不可发动其他原子点击效果） */
export function isGraySilenced(state, player, cellIndex, pt) {
  const pk = typeof pt === 'string' ? pt : `${pt[0]},${pt[1]}`
  const until = state.graySilencedUntilTurn?.[player]
  if (until == null || state.turnNumber >= until) return false
  return state.graySilencedPoints[player]?.has(`${cellIndex}:${pk}`) ?? false
}

/** 返回该玩家有黄原子的格子索引列表 */
export function cellsWithYellow(state, player) {
  const out = []
  for (let i = 0; i < state.cells[player].length; i++) {
    if (state.cells[player][i].hasYellow()) out.push(i)
  }
  return out
}

/** 某格黄原子个数（用于黄持续效果：进攻顺序） */
export function yellowCountInCell(cell) {
  return cell.countByColor?.()?.[ATOM_YELLOW] ?? 0
}

/**
 * 进攻时可选的对方格子索引。
 * 黄原子持续效果：对方若要进攻我方某格（该格有 x 个黄原子），须已进攻过所有「黄原子数严格大于 x」的我方格子。
 * 因此按黄原子数从多到少依次可被选为攻击目标。
 */
/** 有灰原子的格子内黄持续效果无效 */
function effectiveYellowCountInCell(cell) {
  if (cell.hasGray?.()) return 0
  return yellowCountInCell(cell)
}

export function getAttackableEnemyCellIndices(state) {
  const opp = 1 - state.currentPlayer
  const cells = state.cells[opp]
  const n = cells.length
  const attackedSet = new Set(state.attackedEnemyCellIndicesThisTurn ?? [])
  const yellowCounts = cells.map((c) => effectiveYellowCountInCell(c))

  const candidateIndices = Array.from({ length: n }, (_, i) => i).filter(
    (i) => !cells[i].isEmpty() && cells[i].hasBlack()
  )
  if (candidateIndices.length === 0) return []

  const attackable = candidateIndices.filter((i) => {
    const x = yellowCounts[i]
    for (let j = 0; j < n; j++) {
      if (yellowCounts[j] > x && !attackedSet.has(j)) return false
    }
    return true
  })
  return attackable
}

/**
 * 红效果可选的对方格子索引。
 * 与进攻相同顺序约束：对方某格有 x 个黄原子时，须已对「黄原子数严格大于 x」的我方其他格子发动过红效果后才能选该格。
 */
export function getRedEffectTargetableEnemyCellIndices(state) {
  const cur = state.currentPlayer
  const opp = 1 - cur
  const cells = state.cells[opp]
  const n = cells.length
  const doneSet = new Set(state.redEffectTargetCellIndicesThisTurn ?? [])
  const yellowCounts = cells.map((c) => effectiveYellowCountInCell(c))

  const candidateIndices = Array.from({ length: n }, (_, i) => i).filter(
    (i) => !cells[i].isEmpty() && cells[i].hasBlack()
  )
  if (candidateIndices.length === 0) return []

  return candidateIndices.filter((i) => {
    const x = yellowCounts[i]
    for (let j = 0; j < n; j++) {
      if (yellowCounts[j] > x && !doneSet.has(j)) return false
    }
    return true
  })
}
