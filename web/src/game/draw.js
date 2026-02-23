/**
 * Weighted random draw for atoms
 */
import { ATOM_BLACK, ATOM_RED, ATOM_BLUE, ATOM_GREEN, ATOM_YELLOW, ATOM_PURPLE, ATOM_WHITE, ATOM_GRAY } from './config.js'

const COLOR_LIST = [ATOM_BLACK, ATOM_RED, ATOM_BLUE, ATOM_GREEN, ATOM_YELLOW, ATOM_PURPLE, ATOM_WHITE, ATOM_GRAY]
const DEFAULT_WEIGHTS = [3, 1, 1, 1, 1, 0, 0, 0]

export function drawAtoms(n, weights = DEFAULT_WEIGHTS) {
  const result = []
  const numColors = COLOR_LIST.length
  const w = weights.length >= numColors ? weights.slice(0, numColors) : [...weights, ...Array(numColors - weights.length).fill(0)].slice(0, numColors)
  const total = w.reduce((a, b) => a + b, 0)
  const useEqual = total <= 0
  for (let i = 0; i < n; i++) {
    if (useEqual) {
      result.push(COLOR_LIST[Math.floor(Math.random() * numColors)])
    } else {
      let r = Math.random() * total
      for (let j = 0; j < numColors; j++) {
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
