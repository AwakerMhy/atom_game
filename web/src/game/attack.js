/**
 * Attack flow logic: apply attack results, reset action state.
 */
import {
  attackBeatsDefense,
  extraDestroys,
  destroyOneBlackAndGetComponents,
  removeComponentsExcept,
  removeComponentsWithoutBlackAndReturnRest,
  removeBlackAtomsExcept,
  clearCellIfNoBlack,
  resolveDirectAttack,
} from './combat.js'

/**
 * Apply direct attack (when opponent has no atoms): deal damage, consume attack.
 */
export function applyDirectAttack(state, attackerCell) {
  const opp = 1 - state.currentPlayer
  const dmg = resolveDirectAttack(attackerCell)
  state.hp[opp] = Math.max(0, (state.hp[opp] ?? 0) - dmg)
  state.turnAttackUsed++
  return dmg
}

/**
 * After attack/effect: clear any cell that has no black atoms.
 */
export function clearCellsWithNoBlack(state, player) {
  for (const cell of state.cells[player]) {
    clearCellIfNoBlack(cell)
  }
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
 * Resolve attack entirely with random selection (no user picking).
 * Mutates state. Returns { substate: 'idle', message }.
 */
export function resolveAttackRandom(state, attackMyCell, attackEnemyCell) {
  const [myP, myCi] = attackMyCell
  const [enP, enCi] = attackEnemyCell
  const atkCell = state.cells[myP][myCi]
  let defCell = state.cells[enP][enCi]
  const blacks = [...defCell.blackPoints()].filter(
    (k) => !(state.blueProtectedPoints[enP]?.has(`${enCi}:${k}`) ?? false)
  )
  if (blacks.length === 0) {
    state.hp[enP] = Math.max(0, (state.hp[enP] ?? 0) - 1)
    state.turnAttackUsed++
    clearCellsWithNoBlack(state, enP)
    return { substate: 'idle', message: '攻击造成 1 点伤害（对方黑原子受保护，未破坏）' }
  }
  const ptKey = shuffleArray(blacks)[0]
  const [dmg] = destroyOneBlackAndGetComponents(atkCell, defCell, ptKey)
  state.hp[enP] = Math.max(0, (state.hp[enP] ?? 0) - dmg)
  const extra = extraDestroys(atkCell, defCell)
  if (extra > 0 && !defCell.isEmpty()) {
    const allPts = [...defCell.allAtoms()].map(([[r, c]]) => `${r},${c}`)
    const toRemove = shuffleArray(allPts).slice(0, Math.min(extra, allPts.length))
    for (const k of toRemove) {
      const [r, c] = k.split(',').map(Number)
      defCell.remove(r, c)
    }
  }
  clearCellsWithNoBlack(state, enP)
  let comps = removeComponentsWithoutBlackAndReturnRest(defCell)
  while (comps.length > 1) {
    const toKeep = comps[Math.floor(Math.random() * comps.length)]
    removeComponentsExcept(defCell, toKeep)
    comps = removeComponentsWithoutBlackAndReturnRest(defCell)
  }
  let blackComps = defCell.blackConnectedComponents()
  while (blackComps.length > 1) {
    const toKeep = blackComps[Math.floor(Math.random() * blackComps.length)]
    removeBlackAtomsExcept(defCell, toKeep)
    removeComponentsWithoutBlackAndReturnRest(defCell)
    blackComps = defCell.blackConnectedComponents()
  }
  state.turnAttackUsed++
  return { substate: 'idle', message: '进攻完成' }
}

/**
 * Handle attack_my: user selected enemy cell. With random mode, resolve immediately.
 * Returns { substate, message }.
 */
export function handleAttackEnemyCell(state, attackMyCell, attackEnemyCell) {
  const [myP, myCi] = attackMyCell
  const [enP, enCi] = attackEnemyCell
  const atkCell = state.cells[myP][myCi]
  const defCell = state.cells[enP][enCi]
  if (!attackBeatsDefense(atkCell, defCell)) {
    return { substate: 'idle', message: '攻击力未大于防御力，无效果' }
  }
  const blacks = [...defCell.blackPoints()].filter(
    (k) => !(state.blueProtectedPoints[enP]?.has(`${enCi}:${k}`) ?? false)
  )
  if (blacks.length === 0 && defCell.blackPoints().size > 0) {
    state.hp[enP] = Math.max(0, (state.hp[enP] ?? 0) - 1)
    state.turnAttackUsed++
    clearCellsWithNoBlack(state, enP)
    return { substate: 'idle', message: '攻击造成 1 点伤害（对方黑原子受保护，未破坏）' }
  }
  return resolveAttackRandom(state, attackMyCell, attackEnemyCell)
}

