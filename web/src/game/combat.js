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

/**
 * 蓝原子持续性：遭到进攻时，己方格蓝原子连接黑原子数目为 x，则降低可以破坏的原子数目 x（最低为 0）。
 * 即 extra = max(0, 红原子数 - x)，其中 x = 防守格所有蓝原子各自邻接黑原子数之和。
 */
export function extraDestroys(attackerCell, defenderCell) {
  const an = attackerCell.countByColor()[ATOM_RED] ?? 0
  let x = 0
  for (const [[r, c], color] of defenderCell.allAtoms()) {
    if (color === ATOM_BLUE) x += defenderCell.countBlackNeighbors(r, c)
  }
  return Math.max(0, an - x)
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

/**
 * 破坏后连通规则（进攻与红效果均按此流程）：
 * (1) 检查该格剩余原子是否连通，不连通则返回 { type: 'all' } 由被破坏方选择保留一个连通子集；
 * (2) 仅看黑原子是否连通，若存在多个黑原子连通子集则返回 { type: 'black' } 由被破坏方选择保留一个；
 * (3) 再自动清除所有「不包含黑原子」的连通子集。
 * 返回 null 表示无需选择或已执行完 (3)；否则返回 { type, components }，components 为可序列化的 [string[]]。
 */
export function getConnectivityChoice(cell) {
  if (cell.isEmpty()) return null
  // (1) 全原子连通
  const comps = cell.connectedComponents()
  if (comps.length > 1) {
    return { type: 'all', components: comps.map((s) => [...s]) }
  }
  // (2) 黑原子连通
  const blackComps = cell.blackConnectedComponents()
  if (blackComps.length > 1) {
    return { type: 'black', components: blackComps.map((s) => [...s]) }
  }
  // (3) 自动清除不含黑的连通子集
  removeComponentsWithoutBlackAndReturnRest(cell)
  return null
}

/**
 * 被破坏方选择后应用：保留 componentToKeepKeys（string[]），移除其余。
 * type 'all'：保留一个全原子连通子集；type 'black'：保留一个黑原子连通子集并执行步骤(3)。
 */
export function applyConnectivityChoice(cell, type, componentToKeepKeys) {
  const toKeep = new Set(componentToKeepKeys)
  if (type === 'all') {
    removeComponentsExcept(cell, toKeep)
  } else if (type === 'black') {
    removeBlackAtomsExcept(cell, toKeep)
    removeComponentsWithoutBlackAndReturnRest(cell) // (3) 清除不含黑的连通子集
  }
}

/**
 * 破坏后连通规则（随机版，用于无需玩家选择时）。
 */
export function applyPostDestructionConnectivity(cell) {
  if (cell.isEmpty()) return
  let comps = cell.connectedComponents()
  if (comps.length > 1) {
    const toKeep = comps[Math.floor(Math.random() * comps.length)]
    removeComponentsExcept(cell, toKeep)
  }
  if (cell.isEmpty()) return
  let blackComps = cell.blackConnectedComponents()
  if (blackComps.length > 1) {
    const toKeep = blackComps[Math.floor(Math.random() * blackComps.length)]
    removeBlackAtomsExcept(cell, toKeep)
  }
  removeComponentsWithoutBlackAndReturnRest(cell)
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
  state.blueProtectionUntilTurn[player] = state.turnNumber + 2
  return true
}

/**
 * 红原子点击效果：先选对方格子，再在该格内随机破坏 y 个黑原子（y=红原子相邻黑数）。
 * - 从 UI 调用时必须传入 targetDefCellIndex（用户选择的对方格索引）。
 * - 仅从该格内收集可破坏的黑原子，随机取 min(y, 该格内数量) 个破坏。
 */
export function applyEffectRedRandom(state, attacker, cellIndex, r, c, targetDefCellIndex = null) {
  const cells = state.cells[attacker]
  if (cellIndex < 0 || cellIndex >= cells.length) return false
  const cell = cells[cellIndex]
  if (cell.get(r, c) !== ATOM_RED) return false
  const y = cell.countBlackNeighbors(r, c)
  if (y <= 0) return false
  const defender = 1 - attacker
  const defCells = state.cells[defender]
  // 仅从选中的对方格（或未指定时全部格）收集候选
  const cellIndices =
    targetDefCellIndex != null && targetDefCellIndex >= 0 && targetDefCellIndex < defCells.length
      ? [targetDefCellIndex]
      : targetDefCellIndex == null
        ? [0, 1, 2]
        : []
  const candidates = []
  for (const ci of cellIndices) {
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
  const affectedCells = new Set()
  for (const { ci, k: ptKey } of toDestroy) {
    const [rr, cc] = ptKey.split(',').map(Number)
    defCells[ci].remove(rr, cc)
    affectedCells.add(ci)
  }
  // 红效果破坏结束后立即检查是否产生多个连通子集，若有则需被破坏方选择
  for (const ci of affectedCells) {
    const choice = getConnectivityChoice(defCells[ci])
    if (choice) {
      return { ok: true, connectivityChoice: { defender, cellIndex: ci, ...choice } }
    }
  }
  return { ok: true }
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
