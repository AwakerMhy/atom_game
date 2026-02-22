/**
 * Weighted random draw for atoms
 */
import { ATOM_BLACK, ATOM_RED, ATOM_BLUE, ATOM_GREEN, ATOM_YELLOW } from './config.js'

const COLOR_LIST = [ATOM_BLACK, ATOM_RED, ATOM_BLUE, ATOM_GREEN, ATOM_YELLOW]

export function drawAtoms(n, weights = [3, 1, 1, 1, 1]) {
  const result = []
  const w = weights.length >= 5 ? weights : [3, 1, 1, 1, 1]
  const total = w.reduce((a, b) => a + b, 0)
  const useEqual = total <= 0
  for (let i = 0; i < n; i++) {
    if (useEqual) {
      result.push(COLOR_LIST[Math.floor(Math.random() * 5)])
    } else {
      let r = Math.random() * total
      for (let j = 0; j < Math.min(5, w.length); j++) {
        r -= w[j]
        if (r <= 0) {
          result.push(COLOR_LIST[j])
          break
        }
      }
    }
  }
  return result
}
