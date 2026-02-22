/**
 * Attack/defense, destroy, connectivity, effects.
 */
import { verticalDistanceUnits, horizontalDistanceUnits } from './grid.js'
import { ATOM_BLACK, ATOM_RED, ATOM_BLUE, ATOM_GREEN, ATOM_YELLOW, ATOM_PURPLE } from './config.js'

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
 * 红方贡献 = 各红原子有效黑邻数之和（与紫相邻时用两跳黑邻）；蓝方 x = 各蓝原子有效黑邻数之和。
 */
export function extraDestroys(attackerCell, defenderCell) {
  let redSum = 0
  for (const [[r, c], color] of attackerCell.allAtoms()) {
    if (color === ATOM_RED) redSum += attackerCell.effectiveBlackNeighborCount(r, c)
  }
  let blueSum = 0
  for (const [[r, c], color] of defenderCell.allAtoms()) {
    if (color === ATOM_BLUE) blueSum += defenderCell.effectiveBlackNeighborCount(r, c)
  }
  return Math.max(0, redSum - blueSum)
}

function shuffleArray(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * 选取黑原子破坏目标（攻击/红效果通用）。
 * 规则：要破坏 x 个黑原子时：
 * - 若无黄高亮黑原子：从该格所有黑原子中无放回随机抽 x 个作为目标；
 * - 若有 y 个黄高亮黑原子且 x>=y：先确定这 y 个为目标，再从其余黑原子中随机抽 x-y 个；
 * - 若有 y 个黄高亮黑原子且 x<y：从这 y 个中随机抽 x 个作为目标。
 * 选中的目标若被蓝保护则不实际破坏。
 * 返回 { results: [{ ptKey, destroyed }], destroyedAtoms: [{ defender, cellIndex, r, c, color }] }
 */
export function selectAndDestroyBlackTargets(state, defender, cellIndex, defCell, x, actuallyDestroy = true) {
  const allBlacks = [...defCell.blackPoints()]
  const yellowPriority = allBlacks.filter((k) => state.yellowPriorityPoints?.[defender]?.has(`${cellIndex}:${k}`) ?? false)
  const otherBlacks = allBlacks.filter((k) => !yellowPriority.includes(k))
  const y = yellowPriority.length

  let targets = []
  if (y === 0) {
    targets = shuffleArray(allBlacks).slice(0, Math.min(x, allBlacks.length))
  } else if (x >= y) {
    targets = [...shuffleArray(yellowPriority)]
    const needMore = x - y
    if (needMore > 0 && otherBlacks.length > 0) {
      targets.push(...shuffleArray(otherBlacks).slice(0, Math.min(needMore, otherBlacks.length)))
    }
  } else {
    targets = shuffleArray(yellowPriority).slice(0, Math.min(x, yellowPriority.length))
  }

  const results = []
  const destroyedAtoms = []
  for (const ptKey of targets) {
    const protected_ = state.blueProtectedPoints?.[defender]?.has(`${cellIndex}:${ptKey}`) ?? false
    if (actuallyDestroy && !protected_) {
      const [r, c] = ptKey.split(',').map(Number)
      defCell.remove(r, c)
      results.push({ ptKey, destroyed: true })
      destroyedAtoms.push({ defender, cellIndex, r, c, color: 'black' })
    } else {
      results.push({ ptKey, destroyed: !protected_ })
    }
  }
  return { results, destroyedAtoms }
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
  const protected_ = cell.effectiveBlackNeighborsOf(r, c)
  const purpleNeighbors = cell.purpleNeighborPositions(r, c)
  cell.remove(r, c)
  for (const [nr, nc] of purpleNeighbors) {
    cell.remove(nr, nc)
  }
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
  const y = cell.effectiveBlackNeighborCount(r, c)
  if (y <= 0) return false
  const defender = 1 - attacker
  const defCells = state.cells[defender]
  // 仅从选中的对方格（或未指定时全部格）收集候选
  const cellIndices =
    targetDefCellIndex != null && targetDefCellIndex >= 0 && targetDefCellIndex < defCells.length
      ? [targetDefCellIndex]
      : targetDefCellIndex == null
        ? Array.from({ length: defCells.length }, (_, i) => i)
        : []
  cell.remove(r, c)
  const affectedCells = new Set()
  const destroyedAtoms = []
  for (const ci of cellIndices) {
    const defCell = defCells[ci]
    const numBefore = defCell.allAtoms().length
    if (numBefore === 0) continue
    const numBlacks = defCell.blackPoints().size
    if (numBlacks === 0) continue
    const k = Math.min(y, numBlacks)
    const { destroyedAtoms: da } = selectAndDestroyBlackTargets(state, defender, ci, defCell, k, true)
    destroyedAtoms.push(...da)
    if (defCell.allAtoms().length < numBefore) affectedCells.add(ci)
  }
  // 红效果破坏结束后立即检查是否产生多个连通子集，若有则需被破坏方选择
  for (const ci of affectedCells) {
    const choice = getConnectivityChoice(defCells[ci])
    if (choice) {
      return { ok: true, connectivityChoice: { defender, cellIndex: ci, ...choice }, destroyedAtoms }
    }
  }
  return { ok: true, destroyedAtoms }
}

export function applyEffectYellow(state, player, cellIndex, r, c) {
  const cells = state.cells[player]
  if (cellIndex < 0 || cellIndex >= cells.length) return false
  const cell = cells[cellIndex]
  if (cell.get(r, c) !== ATOM_YELLOW) return false
  const priority_ = cell.effectiveBlackNeighborsOf(r, c)
  const purpleNeighbors = cell.purpleNeighborPositions(r, c)
  cell.remove(r, c)
  for (const [nr, nc] of purpleNeighbors) {
    cell.remove(nr, nc)
  }
  for (const k of priority_) {
    state.yellowPriorityPoints[player].add(`${cellIndex}:${k}`)
  }
  state.yellowPriorityUntilTurn[player] = state.turnNumber + 2
  return true
}

export function applyEffectGreen(state, player, cellIndex, r, c) {
  const cells = state.cells[player]
  if (cellIndex < 0 || cellIndex >= cells.length) return false
  const cell = cells[cellIndex]
  if (cell.get(r, c) !== ATOM_GREEN) return false
  const extendToEmpty = cell.hasPurpleNeighbor(r, c)
  const oneHopBlack = extendToEmpty ? cell.effectiveBlackNeighborsOf(r, c) : new Set()
  const purpleNeighbors = cell.purpleNeighborPositions(r, c)
  cell.remove(r, c)
  cell.place(r, c, ATOM_BLACK)
  if (extendToEmpty) {
    for (const key of oneHopBlack) {
      const [r1, c1] = key.split(',').map(Number)
      for (const [nr, nc] of cell.grid.neighborsOf(r1, c1)) {
        if (cell.get(nr, nc) == null && cell.grid.inBounds(nr, nc)) {
          cell.place(nr, nc, ATOM_BLACK)
        }
      }
    }
  }
  for (const [nr, nc] of purpleNeighbors) {
    cell.remove(nr, nc)
  }
  return true
}

export function applyGreenEndOfTurn(state, player) {
  let total = 0
  for (const cell of state.cells[player]) {
    for (const [[r, c], color] of cell.allAtoms()) {
      if (color === ATOM_GREEN) total += cell.effectiveBlackNeighborCount(r, c)
    }
  }
  if (total > 0) {
    state.pools[player][ATOM_BLACK] = (state.pools[player][ATOM_BLACK] ?? 0) + total
  }
  return total
}
