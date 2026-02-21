/**
 * Weighted random draw for atoms
 */
import { ATOM_BLACK, ATOM_RED, ATOM_BLUE, ATOM_GREEN, COLORS } from './config.js'

const COLOR_LIST = [ATOM_BLACK, ATOM_RED, ATOM_BLUE, ATOM_GREEN]

export function drawAtoms(n, weights = [3, 1, 1, 1]) {
  const result = []
  for (let i = 0; i < n; i++) {
    const total = weights.reduce((a, b) => a + b, 0)
    let r = Math.random() * total
    for (let j = 0; j < 4; j++) {
      r -= weights[j]
      if (r <= 0) {
        result.push(COLOR_LIST[j])
        break
      }
    }
  }
  return result
}
