import { describe, it, expect } from 'vitest'
import { attackPower, defensePower, attackBeatsDefense } from './combat.js'
import { Cell } from './cell.js'

describe('combat', () => {
  it('attackBeatsDefense', () => {
    const atk = new Cell(100, 100, 50, 50, 15)
    const def = new Cell(100, 100, 50, 50, 15)
    atk.place(50, 50, 'black')
    atk.place(58, 50, 'black')
    def.place(50, 48, 'black')
    def.place(50, 52, 'black')
    expect(attackPower(atk)).toBeGreaterThan(0)
    expect(defensePower(def)).toBeGreaterThan(0)
    expect(typeof attackBeatsDefense(atk, def)).toBe('boolean')
  })
})
