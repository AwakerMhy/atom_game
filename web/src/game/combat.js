/**
 * Attack/defense, destroy, connectivity, effects.
 */
import { verticalDistanceUnits, horizontalDistanceUnits } from './grid.js'
import { ATOM_BLACK, ATOM_RED, ATOM_BLUE, ATOM_GREEN } from './config.js'

export function attackPower(cell) {
  const blacks = cell.blackPoints()
  return verticalDistanceUnits(blacks)
}

export function defensePower(cell) {
  const blacks = cell.blackPoints()
  return horizontalDistanceUnits(blacks)
}

export function attackBeatsDefense(attacker, defender) {
  return attackPower(attacker) > defensePower(defender)
}

export function extraDestroys(attackerCell, defenderCell) {
  const an = attackerCell.countByColor()[ATOM_RED] ?? 0
  const bm = defenderCell.countByColor()[ATOM_BLUE] ?? 0
  return Math.max(0, an - bm)
}

export function destroyOneBlackAndGetComponents(attackerCell, defenderCell, blackToDestroy) {
  const [r, c] = Array.isArray(blackToDestroy) ? blackToDestroy : blackToDestroy.split(',').map(Number)
  if (defenderCell.get(r, c) !== ATOM_BLACK) return [0, []]
  defenderCell.remove(r, c)
  const components = defenderCell.connectedComponents()
  return [1, components]
}

export function removeComponentsExcept(cell, toKeep) {
  const components = cell.connectedComponents()
  for (const comp of components) {
    let overlap = false
    for (const k of comp) if (toKeep.has(k)) { overlap = true; break }
    if (overlap) continue
    for (const k of comp) {
      const [r, c] = k.split(',').map(Number)
      cell.remove(r, c)
    }
  }
}

export function removeComponent(cell, component) {
  for (const k of component) {
    const [r, c] = k.split(',').map(Number)
    cell.remove(r, c)
  }
}

export function removeBlackAtomsExcept(cell, toKeep) {
  const blacks = cell.blackPoints()
  for (const k of blacks) {
    if (!toKeep.has(k)) {
      const [r, c] = k.split(',').map(Number)
      cell.remove(r, c)
    }
  }
}

export function clearCellIfNoBlack(cell) {
  if (!cell.hasBlack() && !cell.isEmpty()) {
    const toRemove = [...cell.allAtoms()].map(([pt]) => pt)
    for (const [r, c] of toRemove) cell.remove(r, c)
  }
}

export function removeComponentsWithoutBlackAndReturnRest(cell) {
  if (cell.isEmpty()) return []
  const components = cell.connectedComponents()
  const blacks = cell.blackPoints()
  const remaining = []
  for (const comp of components) {
    let hasBlack = false
    for (const k of comp) if (blacks.has(k)) { hasBlack = true; break }
    if (hasBlack) remaining.push(comp)
    else {
      for (const k of comp) {
        const [r, c] = k.split(',').map(Number)
        cell.remove(r, c)
      }
    }
  }
  return remaining
}

export function resolveDirectAttack(cell) {
  return Math.floor(attackPower(cell))
}

export function applyEffectBlue(state, player, cellIndex, r, c) {
  const cells = state.cells[player]
  if (cellIndex < 0 || cellIndex >= cells.length) return false
  const cell = cells[cellIndex]
  if (cell.get(r, c) !== ATOM_BLUE) return false
  const protected_ = cell.blackNeighborsOf(r, c)
  cell.remove(r, c)
  for (const k of protected_) {
    state.blueProtectedPoints[player].add(`${cellIndex}:${k}`)
  }
  state.blueProtectionUntilTurn[player] = state.turnNumber + 1
  return true
}

/**
 * Apply red effect with random destruction.
 * Removes attacker's red atom; defender loses y black atoms (y = red's black neighbors), randomly chosen.
 */
export function applyEffectRedRandom(state, attacker, cellIndex, r, c) {
  const cells = state.cells[attacker]
  if (cellIndex < 0 || cellIndex >= cells.length) return false
  const cell = cells[cellIndex]
  if (cell.get(r, c) !== ATOM_RED) return false
  const y = cell.countBlackNeighbors(r, c)
  if (y <= 0) return false
  const defender = 1 - attacker
  const defCells = state.cells[defender]
  const candidates = []
  for (let ci = 0; ci < defCells.length; ci++) {
    const defCell = defCells[ci]
    for (const k of defCell.blackPoints()) {
      if (!(state.blueProtectedPoints?.[defender]?.has(`${ci}:${k}`) ?? false)) {
        candidates.push({ ci, k })
      }
    }
  }
  if (candidates.length === 0) return false
  const k = Math.min(y, candidates.length)
  const shuffled = [...candidates].sort(() => Math.random() - 0.5)
  const toDestroy = shuffled.slice(0, k)
  cell.remove(r, c)
  for (const { ci, k: ptKey } of toDestroy) {
    const [rr, cc] = ptKey.split(',').map(Number)
    defCells[ci].remove(rr, cc)
  }
  for (const defCell of defCells) {
    clearCellIfNoBlack(defCell)
  }
  for (const defCell of defCells) {
    removeComponentsWithoutBlackAndReturnRest(defCell)
  }
  return true
}

export function applyEffectGreen(state, player, cellIndex, r, c) {
  const cells = state.cells[player]
  if (cellIndex < 0 || cellIndex >= cells.length) return false
  const cell = cells[cellIndex]
  if (cell.get(r, c) !== ATOM_GREEN) return false
  cell.remove(r, c)
  cell.place(r, c, ATOM_BLACK)
  return true
}

export function applyGreenEndOfTurn(state, player) {
  let total = 0
  for (const cell of state.cells[player]) {
    for (const [[r, c], color] of cell.allAtoms()) {
      if (color === ATOM_GREEN) total += cell.countBlackNeighbors(r, c)
    }
  }
  if (total > 0) {
    state.pools[player][ATOM_BLACK] = (state.pools[player][ATOM_BLACK] ?? 0) + total
  }
  return total
}
