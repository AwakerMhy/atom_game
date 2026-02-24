/**
 * AI 对战模式：关卡 1 — P1 仅使用黑原子，随机排布后按规则进攻直至无法进攻则结束回合。
 */
import { ATOM_BLACK } from './config.js'
import { getAttackableEnemyCellIndices } from './state.js'
import { attackPower, defensePower } from './combat.js'
import { endPlacePhase } from './turn.js'
import { applyGreenEndOfTurn } from './combat.js'
import { endTurn, startTurnDefault } from './turn.js'
import { resolveAttackRandomAuto } from './attack.js'
import { hasCellAttackedThisTurn } from './state.js'

function attackBeatsDefense(atk, def) {
  return atk > def
}

/**
 * 在指定格内随机放置一个黑原子（须与已有黑相邻或为首个）。成功返回 true。
 */
function placeOneBlackRandomInCell(cell) {
  const allPts = cell.grid.allPoints()
  const occupied = new Set()
  for (const [k] of cell.allAtoms()) occupied.add(k)
  const blackPoints = new Set(cell.blackPoints())
  const valid = new Set(allPts.map(([r, c]) => `${r},${c}`))
  const empty = new Set([...valid].filter((k) => !occupied.has(k)))
  if (empty.size === 0) return false

  function emptyNeighborsOfBlack(occ, blk, emp) {
    if (blk.size === 0) return [...emp]
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

  const candidates = emptyNeighborsOfBlack(occupied, blackPoints, empty)
  if (candidates.length === 0) return false
  const pick = candidates[Math.floor(Math.random() * candidates.length)]
  const [r, c] = pick.split(',').map(Number)
  cell.place(r, c, ATOM_BLACK)
  return true
}

/**
 * AI 排布阶段：将手上的黑原子随机排布到己方格子，直至达到本回合放置上限或无合法空位。
 * 会修改 state（pools、cells、turnPlacedCount），最后调用 endPlacePhase。
 */
export function runAIPlace(state) {
  const ai = 1
  const pool = state.pools[ai]
  const cells = state.cells[ai]
  const toPlace = Math.min(
    pool[ATOM_BLACK] ?? 0,
    state.turnPlaceLimit - state.turnPlacedCount
  )
  let placed = 0
  for (let n = 0; n < toPlace; n++) {
    const order = cells.map((_, i) => i).sort(() => Math.random() - 0.5)
    let ok = false
    for (const ci of order) {
      if (placeOneBlackRandomInCell(cells[ci])) {
        pool[ATOM_BLACK] = (pool[ATOM_BLACK] ?? 0) - 1
        state.turnPlacedCount++
        placed++
        ok = true
        break
      }
    }
    if (!ok) break
  }
  endPlacePhase(state)
}

/**
 * 返回当前可发动进攻的 (己方格索引, 对方格索引) 列表。己方为 P1，对方为 P0。
 * 满足：己方格有黑且本回合未用该格进攻过；对方格在 getAttackableEnemyCellIndices 中且攻击力大于防御力。
 */
function getAIAttackOptions(state) {
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
 * AI 行动阶段：依次用己方格子向对方进攻（满足攻防与黄顺序），直至没有可进攻的格子后结束回合。
 * 随后 endTurn + startTurnDefault，使 currentPlayer 变为 0，下一回合轮到玩家。
 */
export function runAIAction(state) {
  const ai = 1
  const player = 0
  let options = getAIAttackOptions(state)
  while (options.length > 0) {
    const idx = Math.floor(Math.random() * options.length)
    const [myCi, enCi] = options[idx]
    resolveAttackRandomAuto(state, [ai, myCi], [player, enCi])
    options = getAIAttackOptions(state)
  }
  applyGreenEndOfTurn(state, ai)
  endTurn(state)
  startTurnDefault(state)
  // 此时 state.currentPlayer === 0，phase 已由 startTurnDefault 设为 PLACE，轮到玩家排布
}
