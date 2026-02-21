/**
 * Game constants
 */
export const ATOM_BLACK = 'black'
export const ATOM_RED = 'red'
export const ATOM_BLUE = 'blue'
export const ATOM_GREEN = 'green'
export const COLORS = [ATOM_BLACK, ATOM_RED, ATOM_BLUE, ATOM_GREEN]

export const TRI_HEIGHT = Math.sqrt(3) / 2
export const INITIAL_HP = 20
export const INITIAL_POOL = {
  [ATOM_BLACK]: 7,
  [ATOM_RED]: 1,
  [ATOM_BLUE]: 1,
  [ATOM_GREEN]: 1,
}

export const PHASE_CONFIRM = 0
export const PHASE_DRAW = 1
export const PHASE_PLACE = 2
export const PHASE_ACTION = 3

export const CHOICE_EXTRA_DRAW = 'a'
export const CHOICE_EXTRA_PLACE = 'b'
export const CHOICE_EXTRA_ATTACK = 'c'
