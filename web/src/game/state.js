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
    drawWeights: [3, 1, 1, 1, 1, 0],
    initialHp: INITIAL_HP,
    cellCount: 3,
    ...config,
  }
  const base = [3, 1, 1, 1, 1, 0]
  const wIn = Array.isArray(cfg.drawWeights) ? cfg.drawWeights : base
  const weights = wIn.length >= 6 ? wIn.slice(0, 6) : [...wIn.slice(0, 5), ...Array(6 - wIn.length).fill(0)].slice(0, 6)
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
    isFirstTurn: true,
    blueProtectedPoints: { 0: new Set(), 1: new Set() },
    blueProtectionUntilTurn: {},
    yellowPriorityPoints: { 0: new Set(), 1: new Set() },
    yellowPriorityUntilTurn: {},
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

/** 返回该玩家有黄原子的格子索引列表 */
export function cellsWithYellow(state, player) {
  const out = []
  for (let i = 0; i < state.cells[player].length; i++) {
    if (state.cells[player][i].hasYellow()) out.push(i)
  }
  return out
}

/** 进攻时可选的对方格子索引。若对方有黄原子格，则只能选有黄原子的格；否则可选有黑原子的格 */
export function getAttackableEnemyCellIndices(state) {
  const opp = 1 - state.currentPlayer
  const yellowCells = cellsWithYellow(state, opp)
  if (yellowCells.length > 0) {
    return yellowCells.filter((i) => !state.cells[opp][i].isEmpty() && state.cells[opp][i].hasBlack())
  }
  const n = state.cells[opp].length
  return Array.from({ length: n }, (_, i) => i).filter((i) => !state.cells[opp][i].isEmpty() && state.cells[opp][i].hasBlack())
}
