/**
 * Weighted random draw for atoms
 */
import { ATOM_BLACK, ATOM_RED, ATOM_BLUE, ATOM_GREEN, ATOM_YELLOW, ATOM_PURPLE, ATOM_WHITE, ATOM_GRAY } from './config.js'

const COLOR_LIST = [ATOM_BLACK, ATOM_RED, ATOM_BLUE, ATOM_GREEN, ATOM_YELLOW, ATOM_PURPLE, ATOM_WHITE, ATOM_GRAY]
const DEFAULT_WEIGHTS = [3, 1, 1, 1, 1, 0, 0, 0]

export function drawAtoms(n, weights = DEFAULT_WEIGHTS) {
  n = Math.max(0, Math.floor(Number(n)))
  const result = []
  const numColors = COLOR_LIST.length
  const w = weights.length >= numColors ? weights.slice(0, numColors) : [...weights, ...Array(numColors - weights.length).fill(0)].slice(0, numColors)
  const total = w.reduce((a, b) => a + b, 0)
  const useEqual = total <= 0

  if (useEqual) {
    for (let i = 0; i < n; i++) {
      result.push(COLOR_LIST[Math.floor(Math.random() * numColors)])
    }
    return result
  }

  // 整数累积权重，用整数随机 [0, total) 避免浮点误差
  const cum = []
  let sum = 0
  for (const v of w) {
    sum += Number(v)
    cum.push(sum)
  }
  const totalInt = Math.max(1, sum)

  for (let i = 0; i < n; i++) {
    const r = Math.floor(Math.random() * totalInt)
    let j = 0
    while (j < numColors && r >= (cum[j] ?? totalInt)) j++
    result.push(COLOR_LIST[Math.min(j, numColors - 1)])
  }
  while (result.length < n) result.push(COLOR_LIST[Math.floor(Math.random() * numColors)])
  return result.slice(0, n)
}
