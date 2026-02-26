/**
 * 原子合成：配方与匹配
 * 1红+1蓝→2紫；1蓝+1黄→2绿；1红+1蓝+1黄→1白；1白+1黑→2灰
 */
import { ATOM_BLACK, ATOM_RED, ATOM_BLUE, ATOM_GREEN, ATOM_YELLOW, ATOM_PURPLE, ATOM_WHITE, ATOM_GRAY } from './config.js'

/** 配方：input 与 output 均为 { color: count } */
export const SYNTHESIS_RECIPES = [
  { in: { [ATOM_RED]: 1, [ATOM_BLUE]: 1 }, out: { [ATOM_PURPLE]: 2 } },
  { in: { [ATOM_BLUE]: 1, [ATOM_YELLOW]: 1 }, out: { [ATOM_GREEN]: 2 } },
  { in: { [ATOM_RED]: 1, [ATOM_BLUE]: 1, [ATOM_YELLOW]: 1 }, out: { [ATOM_WHITE]: 1 } },
  { in: { [ATOM_WHITE]: 1, [ATOM_BLACK]: 1 }, out: { [ATOM_GRAY]: 2 } },
]

/**
 * 判断 tray（{ color: count }）是否与某个配方完全一致
 * @returns { { in, out } | null }
 */
export function matchRecipe(tray) {
  const keys = Object.keys(tray).filter((c) => (tray[c] ?? 0) > 0)
  const total = keys.reduce((s, c) => s + (tray[c] ?? 0), 0)
  if (total === 0) return null
  for (const recipe of SYNTHESIS_RECIPES) {
    const inKeys = Object.keys(recipe.in)
    const recipeTotal = inKeys.reduce((s, c) => s + (recipe.in[c] ?? 0), 0)
    if (recipeTotal !== total) continue
    let match = true
    for (const c of inKeys) {
      if ((tray[c] ?? 0) !== (recipe.in[c] ?? 0)) {
        match = false
        break
      }
    }
    if (!match) continue
    for (const c of keys) {
      if ((recipe.in[c] ?? 0) !== (tray[c] ?? 0)) {
        match = false
        break
      }
    }
    if (match) return recipe
  }
  return null
}

/**
 * 从 pool 扣除配方输入，增加配方输出（不校验 pool 是否足够，调用前需用 matchRecipe 校验）
 */
export function applySynthesis(pool, recipe) {
  for (const [color, n] of Object.entries(recipe.in)) {
    if (n <= 0) continue
    pool[color] = (pool[color] ?? 0) - n
  }
  for (const [color, n] of Object.entries(recipe.out)) {
    if (n <= 0) continue
    pool[color] = (pool[color] ?? 0) + n
  }
}
