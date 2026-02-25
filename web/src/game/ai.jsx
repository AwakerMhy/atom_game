/**
 * AI 对战模式：关卡 1 — P1 仅使用黑原子；关卡 2 — P1 使用黑/红/蓝，可发动红/蓝效果。
 */
import { ATOM_BLACK, ATOM_RED, ATOM_BLUE } from './config.js'
import { getAttackableEnemyCellIndices, getRedEffectTargetableEnemyCellIndices, placementCountThisTurn } from './state.js'
import { attackPower, defensePower, applyEffectBlue, applyEffectRedRandom, getConnectivityChoice, applyConnectivityChoice } from './combat.js'
import { endPlacePhase, batchPlaceOnCell, applyPlace, validatePlace } from './turn.js'
import { applyGreenEndOfTurn } from './combat.js'
import { endTurn, startTurnDefault } from './turn.js'
import { resolveAttackRandomAuto, clearCellsWithNoBlack } from './attack.js'
import { hasCellAttackedThisTurn } from './state.js'
import { Cell } from './cell.js'

function attackBeatsDefense(atk, def) {
  return atk > def
}

/**
 * AI 排布阶段：与玩家一致——只选「往哪格放多少」，具体位置用与玩家相同的随机批量逻辑（batchPlaceOnCell）。
 * 按格轮着选数量并调用 batchPlaceOnCell，应用结果后设置 state.aiPlaceFocusCell 供视角移动。
 */
export function runAIPlace(state) {
  const ai = 1
  const pool = state.pools[ai]
  const cells = state.cells[ai]
  const cellOrder = cells.map((_, i) => i).sort(() => Math.random() - 0.5)
  state.aiPlaceFocusCell = null
  for (const ci of cellOrder) {
    const placed = placementCountThisTurn(state)
    const slotLeft = Math.max(0, (state.turnPlaceLimit ?? 0) - placed)
    const poolBlack = pool[ATOM_BLACK] ?? 0
    if (slotLeft <= 0 || poolBlack <= 0) continue
    const maxInCell = Math.min(poolBlack, slotLeft, 10)
    const n = maxInCell <= 0 ? 0 : Math.floor(Math.random() * maxInCell) + 1
    if (n <= 0) continue
    const [ok, msg, placements] = batchPlaceOnCell(state, ci, n, null)
    if (!ok || !placements?.length) continue
    const used = placements.slice(0, Math.min(placements.length, slotLeft))
    if (used.length <= 0) continue
    pool[ATOM_BLACK] = (pool[ATOM_BLACK] ?? 0) - used.length
    const cell = state.cells[ai][ci]
    const gridConfig = {
      rows: cell.grid.rows,
      cols: cell.grid.cols,
      centerR: cell.grid.centerR,
      centerC: cell.grid.centerC,
      hexRadius: cell.grid.hexRadius,
    }
    const clonedCell = Cell.fromJSON(cell.toJSON(), gridConfig)
    for (const [r, c] of used) clonedCell.place(r, c, ATOM_BLACK)
    state.cells = state.cells.map((row, pi) => (pi === ai ? row.map((c, i) => (i === ci ? clonedCell : c)) : row))
    state.placementHistory = state.placementHistory ?? []
    for (const [r, c] of used) state.placementHistory.push({ player: ai, cellIndex: ci, r, c, color: ATOM_BLACK })
    state.turnPlacedCount = (state.placementHistory ?? []).length
    const sumR = used.reduce((a, [r]) => a + r, 0)
    const sumC = used.reduce((a, [, c]) => a + c, 0)
    state.aiPlaceFocusCell = { player: ai, cellIndex: ci, r: Math.round(sumR / used.length), c: Math.round(sumC / used.length) }
  }
  endPlacePhase(state)
}

/**
 * AI 排布一步：只在一格内放置一批黑原子，用于分步显示。会写 state.aiPlaceCellOrder / aiPlaceStepIndex。
 * 返回 { done }，done 为 true 表示本回合排布已全部完成并已 endPlacePhase。
 */
export function runAIPlaceStep(state) {
  const ai = 1
  const pool = state.pools[ai]
  if (!state.aiPlaceCellOrder) {
    state.aiPlaceCellOrder = state.cells[ai].map((_, i) => i).sort(() => Math.random() - 0.5)
    state.aiPlaceStepIndex = 0
  }
  state.aiPlaceFocusCell = null
  const cellOrder = state.aiPlaceCellOrder
  const stepIndex = state.aiPlaceStepIndex ?? 0
  if (stepIndex >= cellOrder.length) {
    state.aiPlaceCellOrder = null
    state.aiPlaceStepIndex = 0
    endPlacePhase(state)
    state._lastAIPlaceStepDone = true
    return { done: true }
  }
  const ci = cellOrder[stepIndex]
  const placed = placementCountThisTurn(state)
  const slotLeft = Math.max(0, (state.turnPlaceLimit ?? 0) - placed)
  const poolBlack = pool[ATOM_BLACK] ?? 0
  state.aiPlaceStepIndex = stepIndex + 1
  if (slotLeft <= 0 || poolBlack <= 0) {
    const sub = runAIPlaceStep(state)
    state._lastAIPlaceStepDone = sub.done
    return sub
  }
  const maxInCell = Math.min(poolBlack, slotLeft, 10)
  const n = maxInCell <= 0 ? 0 : Math.floor(Math.random() * maxInCell) + 1
  if (n <= 0) {
    const sub = runAIPlaceStep(state)
    state._lastAIPlaceStepDone = sub.done
    return sub
  }
  const [ok, msg, placements] = batchPlaceOnCell(state, ci, n, null)
  if (!ok || !placements?.length) {
    const sub = runAIPlaceStep(state)
    state._lastAIPlaceStepDone = sub.done
    return sub
  }
  const used = placements.slice(0, Math.min(placements.length, slotLeft))
  if (used.length <= 0) {
    const sub = runAIPlaceStep(state)
    state._lastAIPlaceStepDone = sub.done
    return sub
  }
  pool[ATOM_BLACK] = (pool[ATOM_BLACK] ?? 0) - used.length
  const cell = state.cells[ai][ci]
  const gridConfig = {
    rows: cell.grid.rows,
    cols: cell.grid.cols,
    centerR: cell.grid.centerR,
    centerC: cell.grid.centerC,
    hexRadius: cell.grid.hexRadius,
  }
  const clonedCell = Cell.fromJSON(cell.toJSON(), gridConfig)
  for (const [r, c] of used) clonedCell.place(r, c, ATOM_BLACK)
  state.cells = state.cells.map((row, pi) => (pi === ai ? row.map((c, i) => (i === ci ? clonedCell : c)) : row))
  state.placementHistory = state.placementHistory ?? []
  for (const [r, c] of used) state.placementHistory.push({ player: ai, cellIndex: ci, r, c, color: ATOM_BLACK })
  state.turnPlacedCount = (state.placementHistory ?? []).length
  const sumR = used.reduce((a, [r]) => a + r, 0)
  const sumC = used.reduce((a, [, c]) => a + c, 0)
  state.aiPlaceFocusCell = { player: ai, cellIndex: ci, r: Math.round(sumR / used.length), c: Math.round(sumC / used.length) }
  if ((state.aiPlaceStepIndex ?? 0) >= state.aiPlaceCellOrder.length) {
    state.aiPlaceCellOrder = null
    state.aiPlaceStepIndex = 0
    endPlacePhase(state)
    state._lastAIPlaceStepDone = true
    return { done: true }
  }
  state._lastAIPlaceStepDone = false
  return { done: false }
}

/** 第二关：找空位中与黑相邻的格点，按黑邻居数排序，返回 [{ cellIndex, r, c, blackNeighbors }] */
function getEmptyNeighborsOfBlackByCell(state, player) {
  const cells = state.cells[player]
  const out = []
  for (let ci = 0; ci < cells.length; ci++) {
    const cell = cells[ci]
    const blacks = cell.blackPoints()
    if (blacks.size === 0) continue
    const occupied = new Set(cell.allAtoms().map(([pt]) => `${pt[0]},${pt[1]}`))
    for (const k of blacks) {
      const [r, c] = k.split(',').map(Number)
      for (const [nr, nc] of cell.grid.neighborsOf(r, c)) {
        const pk = `${nr},${nc}`
        if (occupied.has(pk)) continue
        const n = cell.grid.neighborsOf(nr, nc).filter(([rr, cc]) => blacks.has(`${rr},${cc}`)).length
        out.push({ cellIndex: ci, r: nr, c: nc, blackNeighbors: n })
      }
    }
  }
  return out.filter((p, i, arr) => arr.findIndex((q) => q.cellIndex === p.cellIndex && q.r === p.r && q.c === p.c) === i)
}

/**
 * 第二关 AI 排布一步：优先在「与黑临边最多」的空位放红/蓝，否则放黑。一步内至多一次放置（1 红或 1 蓝或一批黑）。
 */
export function runAIPlaceStepLevel2(state) {
  const ai = 1
  const pool = state.pools[ai]
  const placed = placementCountThisTurn(state)
  const slotLeft = Math.max(0, (state.turnPlaceLimit ?? 0) - placed)
  state.aiPlaceFocusCell = null
  if (slotLeft <= 0) {
    endPlacePhase(state)
    state._lastAIPlaceStepDone = true
    return { done: true }
  }
  const candidates = getEmptyNeighborsOfBlackByCell(state, ai)
  candidates.sort((a, b) => b.blackNeighbors - a.blackNeighbors)
  const bestScore = candidates.length ? candidates[0].blackNeighbors : 0
  const poolRed = pool[ATOM_RED] ?? 0
  const poolBlue = pool[ATOM_BLUE] ?? 0
  const poolBlack = pool[ATOM_BLACK] ?? 0
  if (poolRed > 0 && bestScore > 0 && candidates.length > 0) {
    const best = candidates[0]
    const [ok] = validatePlace(state, best.cellIndex, best.r, best.c, ATOM_RED)
    if (ok && applyPlace(state, best.cellIndex, best.r, best.c, ATOM_RED)) {
      state.placementHistory = state.placementHistory ?? []
      state.placementHistory.push({ player: ai, cellIndex: best.cellIndex, r: best.r, c: best.c, color: ATOM_RED })
      state.turnPlacedCount = state.placementHistory.length
      state.aiPlaceFocusCell = { player: ai, cellIndex: best.cellIndex, r: best.r, c: best.c }
      state._lastAIPlaceStepDone = false
      return { done: false }
    }
  }
  if (poolBlue > 0 && bestScore > 0 && candidates.length > 0) {
    const best = candidates[0]
    const [ok] = validatePlace(state, best.cellIndex, best.r, best.c, ATOM_BLUE)
    if (ok && applyPlace(state, best.cellIndex, best.r, best.c, ATOM_BLUE)) {
      state.placementHistory = state.placementHistory ?? []
      state.placementHistory.push({ player: ai, cellIndex: best.cellIndex, r: best.r, c: best.c, color: ATOM_BLUE })
      state.turnPlacedCount = state.placementHistory.length
      state.aiPlaceFocusCell = { player: ai, cellIndex: best.cellIndex, r: best.r, c: best.c }
      state._lastAIPlaceStepDone = false
      return { done: false }
    }
  }
  if (poolBlack > 0 && slotLeft > 0) {
    if (!state.aiPlaceCellOrder) {
      state.aiPlaceCellOrder = state.cells[ai].map((_, i) => i).sort(() => Math.random() - 0.5)
      state.aiPlaceStepIndex = 0
    }
    const cellOrder = state.aiPlaceCellOrder
    const stepIndex = state.aiPlaceStepIndex ?? 0
    if (stepIndex < cellOrder.length) {
      const ci = cellOrder[stepIndex]
      state.aiPlaceStepIndex = stepIndex + 1
      const maxInCell = Math.min(poolBlack, slotLeft, 10)
      const n = maxInCell <= 0 ? 0 : Math.floor(Math.random() * maxInCell) + 1
      if (n > 0) {
        const [ok, msg, placements] = batchPlaceOnCell(state, ci, n, null)
        if (ok && placements?.length) {
          const used = placements.slice(0, Math.min(placements.length, slotLeft))
          if (used.length > 0) {
            pool[ATOM_BLACK] = (pool[ATOM_BLACK] ?? 0) - used.length
            const cell = state.cells[ai][ci]
            const gridConfig = {
              rows: cell.grid.rows,
              cols: cell.grid.cols,
              centerR: cell.grid.centerR,
              centerC: cell.grid.centerC,
              hexRadius: cell.grid.hexRadius,
            }
            const clonedCell = Cell.fromJSON(cell.toJSON(), gridConfig)
            for (const [r, c] of used) clonedCell.place(r, c, ATOM_BLACK)
            state.cells = state.cells.map((row, pi) => (pi === ai ? row.map((c, i) => (i === ci ? clonedCell : c)) : row))
            state.placementHistory = state.placementHistory ?? []
            for (const [r, c] of used) state.placementHistory.push({ player: ai, cellIndex: ci, r, c, color: ATOM_BLACK })
            state.turnPlacedCount = state.placementHistory.length
            const sumR = used.reduce((a, [r]) => a + r, 0)
            const sumC = used.reduce((a, [, c]) => a + c, 0)
            state.aiPlaceFocusCell = { player: ai, cellIndex: ci, r: Math.round(sumR / used.length), c: Math.round(sumC / used.length) }
          }
        }
      }
    }
    if ((state.aiPlaceStepIndex ?? 0) >= (state.aiPlaceCellOrder ?? []).length) {
      state.aiPlaceCellOrder = null
      state.aiPlaceStepIndex = 0
    }
  }
  const placedAfter = placementCountThisTurn(state)
  if (placedAfter >= (state.turnPlaceLimit ?? 0) || ((pool[ATOM_BLACK] ?? 0) <= 0 && (pool[ATOM_RED] ?? 0) <= 0 && (pool[ATOM_BLUE] ?? 0) <= 0)) {
    endPlacePhase(state)
    state.aiPlaceCellOrder = null
    state.aiPlaceStepIndex = 0
    state._lastAIPlaceStepDone = true
    return { done: true }
  }
  state._lastAIPlaceStepDone = false
  return { done: false }
}

/**
 * 返回当前可发动进攻的 (己方格索引, 对方格索引) 列表。己方为 P1，对方为 P0。
 * 满足：己方格有黑且本回合未用该格进攻过；对方格在 getAttackableEnemyCellIndices 中且攻击力大于防御力。
 */
export function getAIAttackOptions(state) {
  const ai = 1
  const player = 0
  const attackableByOrder = getAttackableEnemyCellIndices(state)
  const options = []
  for (let myCi = 0; myCi < state.cells[ai].length; myCi++) {
    const myCell = state.cells[ai][myCi]
    if (!myCell.hasBlack() || hasCellAttackedThisTurn(state, ai, myCi)) continue
    const atk = attackPower(myCell)
    for (const enCi of attackableByOrder) {
      const enCell = state.cells[player][enCi]
      if (enCell.isEmpty() || !enCell.hasBlack()) continue
      if (attackBeatsDefense(atk, defensePower(enCell))) options.push([myCi, enCi])
    }
  }
  return options
}

/**
 * AI 执行一次进攻：从当前可进攻选项中随机选一个执行，若有连通子集选择则选黑原子最多的。
 * 若传入 chosenOption = [myCi, enCi]，则使用该选项（用于先高亮再执行）。
 * 返回 { executed: boolean, destroyedAtoms?: Array }，供调用方播放破坏动画。
 */
export function runOneAIAttack(state, chosenOption) {
  const options = getAIAttackOptions(state)
  if (options.length === 0) return { executed: false }
  const ai = 1
  const player = 0
  const [myCi, enCi] = chosenOption && options.some(([a, b]) => a === chosenOption[0] && b === chosenOption[1])
    ? chosenOption
    : options[Math.floor(Math.random() * options.length)]
  const ret = resolveAttackRandomAuto(state, [ai, myCi], [player, enCi])
  return { executed: true, destroyedAtoms: ret.destroyedAtoms ?? [] }
}

/**
 * AI 结束回合：绿效果结算 → endTurn → startTurnDefault（轮到玩家）。
 */
export function runAIEndTurn(state) {
  applyGreenEndOfTurn(state, 1)
  endTurn(state)
  startTurnDefault(state)
}

/** 第二关：可发动红效果的原子列表 [{ cellIndex, r, c, score }]，score = effectiveBlackNeighborCount */
function getAIRedEffectOptions(state) {
  const ai = 1
  const cells = state.cells[ai]
  const out = []
  for (let ci = 0; ci < cells.length; ci++) {
    const cell = cells[ci]
    for (const [[r, c], color] of cell.allAtoms()) {
      if (color !== ATOM_RED) continue
      const score = cell.effectiveBlackNeighborCount(r, c)
      if (score > 0) out.push({ cellIndex: ci, r, c, score })
    }
  }
  return out
}

/** 第二关：发动一次红效果，目标选玩家防御最高的格。返回 { executed, destroyedAtoms, connectivityChoice? } */
export function runAIRedEffect(state) {
  const options = getAIRedEffectOptions(state)
  if (options.length === 0) return { executed: false }
  const targetable = getRedEffectTargetableEnemyCellIndices(state)
  if (targetable.length === 0) return { executed: false }
  const best = options.reduce((a, b) => (a.score >= b.score ? a : b))
  const player = 0
  const defPowers = targetable.map((enCi) => ({ enCi, def: defensePower(state.cells[player][enCi]) }))
  defPowers.sort((a, b) => b.def - a.def)
  const targetEnCi = defPowers[0].enCi
  const ret = applyEffectRedRandom(state, 1, best.cellIndex, best.r, best.c, targetEnCi)
  if (ret && ret.ok && ret.destroyedAtoms) {
    state.redEffectTargetCellIndicesThisTurn = state.redEffectTargetCellIndicesThisTurn ?? []
    state.redEffectTargetCellIndicesThisTurn.push(targetEnCi)
    if (ret.connectivityChoice) {
      const defCell = state.cells[player][ret.connectivityChoice.cellIndex]
      const comps = ret.connectivityChoice.components ?? []
      const idx = comps.length > 0 ? Math.floor(Math.random() * comps.length) : 0
      const toKeep = comps[idx] ?? []
      applyConnectivityChoice(defCell, ret.connectivityChoice.type, toKeep)
      clearCellsWithNoBlack(state, player)
    }
    return { executed: true, destroyedAtoms: ret.destroyedAtoms ?? [] }
  }
  return { executed: false }
}

/** 第二关：可发动蓝效果的原子列表 [{ cellIndex, r, c }]，优先保护攻击力高的格内黑原子 */
function getAIBlueEffectOptions(state) {
  const ai = 1
  const cells = state.cells[ai]
  const out = []
  for (let ci = 0; ci < cells.length; ci++) {
    const cell = cells[ci]
    for (const [[r, c], color] of cell.allAtoms()) {
      if (color !== ATOM_BLUE) continue
      if (cell.effectiveBlackNeighborCount(r, c) > 0) out.push({ cellIndex: ci, r, c, atk: attackPower(cell) })
    }
  }
  out.sort((a, b) => b.atk - a.atk)
  return out
}

/** 第二关：发动一次蓝效果，优先保护攻击力高的格。返回 { executed } */
export function runAIBlueEffect(state) {
  const options = getAIBlueEffectOptions(state)
  if (options.length === 0) return { executed: false }
  const best = options[0]
  const ok = applyEffectBlue(state, 1, best.cellIndex, best.r, best.c)
  return { executed: !!ok }
}

/**
 * AI 行动阶段：依次用己方格子向对方进攻（满足攻防与黄顺序），直至没有可进攻的格子，然后结束回合。
 * 若需分步显示进攻过程，由调用方多次调用 runOneAIAttack 再在无选项时调用 runAIEndTurn。
 */
export function runAIAction(state) {
  while (runOneAIAttack(state).executed) {}
  runAIEndTurn(state)
}
