/**
 * Weighted random draw for atoms
 */
import { ATOM_BLACK, ATOM_RED, ATOM_BLUE, ATOM_GREEN, ATOM_YELLOW, ATOM_PURPLE } from './config.js'

const COLOR_LIST = [ATOM_BLACK, ATOM_RED, ATOM_BLUE, ATOM_GREEN, ATOM_YELLOW, ATOM_PURPLE]
const DEFAULT_WEIGHTS = [3, 1, 1, 1, 1, 0]

export function drawAtoms(n, weights = DEFAULT_WEIGHTS) {
  const result = []
  const w = weights.length >= 6 ? weights.slice(0, 6) : [...(weights.slice(0, 5)), weights[5] ?? 0].slice(0, 6)
  const total = w.reduce((a, b) => a + b, 0)
  const useEqual = total <= 0
  const numColors = COLOR_LIST.length
  for (let i = 0; i < n; i++) {
    if (useEqual) {
      result.push(COLOR_LIST[Math.floor(Math.random() * numColors)])
    } else {
      let r = Math.random() * total
      for (let j = 0; j < Math.min(numColors, w.length); j++) {
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
