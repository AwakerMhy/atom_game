/**
 * Game state: pools, HP, cells, phase, etc.
 */
import { Cell } from './cell.js'
import {
  ATOM_BLACK,
  ATOM_RED,
  ATOM_BLUE,
  ATOM_GREEN,
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

function makeCells() {
  return [
    new Cell(GRID_ROWS, GRID_COLS, CENTER_R, CENTER_C, HEX_RADIUS),
    new Cell(GRID_ROWS, GRID_COLS, CENTER_R, CENTER_C, HEX_RADIUS),
    new Cell(GRID_ROWS, GRID_COLS, CENTER_R, CENTER_C, HEX_RADIUS),
  ]
}

export function createGameState(config = {}) {
  const initialPool = { ...INITIAL_POOL }
  return {
    config: {
      baseDrawCount: 10,
      basePlaceLimit: 10,
      drawWeights: [3, 1, 1, 1],
      ...config,
    },
    pools: [{ ...initialPool }, { ...initialPool }],
    hp: [INITIAL_HP, INITIAL_HP],
    cells: [makeCells(), makeCells()],
    currentPlayer: 0,
    phase: PHASE_CONFIRM,
    phase0Choice: null,
    baseDrawCount: 10,
    basePlaceLimit: 10,
    drawWeights: [3, 1, 1, 1],
    turnDrawCount: 10,
    turnPlaceLimit: 10,
    turnAttackLimit: 1,
    turnPlacedCount: 0,
    turnAttackUsed: 0,
    turnNumber: 0,
    attackedCellsThisTurn: [],
    isFirstTurn: true,
    blueProtectedPoints: { 0: new Set(), 1: new Set() },
    blueProtectionUntilTurn: {},
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
