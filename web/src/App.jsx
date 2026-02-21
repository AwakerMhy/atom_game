import { useState, useCallback, useEffect } from 'react'
import { createGameState, pool, canAttackThisTurn, opponent } from './game/state.js'
import { startTurnDefault } from './game/turn.js'
import { applyPlace, batchPlaceOnCell } from './game/turn.js'
import {
  applyDirectAttack,
  handleAttackEnemyCell,
} from './game/attack.js'
import { applyEffectBlue, applyEffectGreen, applyEffectRedRandom } from './game/combat.js'
import { PHASE_PLACE, PHASE_ACTION, INITIAL_HP, ATOM_BLACK } from './game/config.js'
import { Cell } from './game/cell.js'
import Board from './components/Board.jsx'
import HUD from './components/HUD.jsx'

function App() {
  const [state, setState] = useState(() => {
    const s = createGameState()
    startTurnDefault(s)
    return s
  })
  const [selectedColor, setSelectedColor] = useState(null)
  const [batchMode, setBatchMode] = useState(false)
  const [batchCount, setBatchCount] = useState(1)
  const [gridScaleDenom, setGridScaleDenom] = useState(4)
  const [interactionMode, setInteractionMode] = useState('operate')
  const [actionSubstate, setActionSubstate] = useState('idle')
  const [attackMyCell, setAttackMyCell] = useState(null)
  const [attackEnemyCell, setAttackEnemyCell] = useState(null)
  const [attackMessage, setAttackMessage] = useState('')

  const maxBatch = state.phase === PHASE_PLACE
    ? Math.min(pool(state, state.currentPlayer).black ?? 0, state.turnPlaceLimit - state.turnPlacedCount)
    : 0
  useEffect(() => {
    if (batchMode && maxBatch >= 0 && batchCount > maxBatch) {
      setBatchCount(maxBatch)
    }
  }, [batchMode, maxBatch, batchCount])

  useEffect(() => {
    if (state.phase !== PHASE_ACTION) {
      setActionSubstate('idle')
      setAttackMyCell(null)
      setAttackEnemyCell(null)
    }
  }, [state.phase])

  const resetAttackState = useCallback(() => {
    setActionSubstate('idle')
    setAttackMyCell(null)
    setAttackEnemyCell(null)
  }, [])

  const updateState = useCallback((updater) => {
    setState((prev) => {
      const next = { ...prev }
      if (typeof updater === 'function') updater(next)
      return next
    })
  }, [])

  const handleCellClick = useCallback(
    (player, cellIndex, r, c, viewCenter) => {
      if (interactionMode !== 'operate') return

      if (state.phase === PHASE_ACTION) {
        const cur = state.currentPlayer
        const opp = opponent(state, cur)
        const ptKey = r != null && c != null ? `${r},${c}` : null

        if (actionSubstate === 'idle' && player === cur && ptKey != null) {
          const cell = state.cells[cur][cellIndex]
          const color = cell.get(r, c)
          if (color === 'red') {
            const y = cell.countBlackNeighbors(r, c)
            if (y > 0) {
              updateState((s) => {
                if (applyEffectRedRandom(s, cur, cellIndex, r, c)) {
                  setAttackMessage('红效果：已随机破坏对方黑原子')
                }
              })
              return
            }
          } else if (color === 'blue') {
            updateState((s) => {
              if (applyEffectBlue(s, cur, cellIndex, r, c)) {
                setAttackMessage('蓝效果：相邻黑原子下一回合内不可被破坏')
              }
            })
            return
          } else if (color === 'green') {
            updateState((s) => {
              if (applyEffectGreen(s, cur, cellIndex, r, c)) {
                setAttackMessage('绿效果：该格点变为黑原子')
              }
            })
            return
          }
        }

        if (actionSubstate === 'attack_my' && attackMyCell) {
          if (player === opp && !state.cells[opp][cellIndex].isEmpty()) {
            const enemyCell = [opp, cellIndex]
            setAttackEnemyCell(enemyCell)
            updateState((s) => {
              const ret = handleAttackEnemyCell(s, attackMyCell, enemyCell)
              setActionSubstate(ret.substate)
              setAttackMessage(ret.message ?? '')
              if (ret.substate === 'idle') resetAttackState()
            })
          }
          return
        }

        if (actionSubstate === 'idle' && player === cur && canAttackThisTurn(state)) {
          const cell = state.cells[cur][cellIndex]
          if (!cell.isEmpty() && cell.hasBlack()) {
            setAttackMyCell([cur, cellIndex])
            const oppAllEmpty = [0, 1, 2].every((i) => state.cells[opp][i].isEmpty())
            if (oppAllEmpty) {
              setActionSubstate('direct_attack_confirm')
              setAttackMessage('对方三格皆空，是否要直接攻击？')
            } else {
              setActionSubstate('attack_my')
              setAttackMessage('请点击对方格子进攻')
            }
          }
        }
        return
      }

      if (state.phase !== PHASE_PLACE || state.currentPlayer !== player) return
      if (batchMode) {
        const n = Math.min(Math.max(0, Math.floor(batchCount)), maxBatch)
        if (n <= 0) return
        updateState((s) => {
          const [ok, msg, placements] = batchPlaceOnCell(s, cellIndex, n, viewCenter)
          if (!ok || !placements?.length) {
            if (!ok) console.warn(msg)
            return
          }
          const player = s.currentPlayer
          s.turnPlacedCount = s.turnPlacedCount + placements.length
          s.pools = s.pools.map((p, i) =>
            i === player ? { ...p, [ATOM_BLACK]: (p[ATOM_BLACK] ?? 0) - placements.length } : p
          )
          const cell = s.cells[player][cellIndex]
          const gridConfig = {
            rows: cell.grid.rows,
            cols: cell.grid.cols,
            centerR: cell.grid.centerR,
            centerC: cell.grid.centerC,
            hexRadius: cell.grid.hexRadius,
          }
          const clonedCell = Cell.fromJSON(cell.toJSON(), gridConfig)
          for (const [r, c] of placements) clonedCell.place(r, c, ATOM_BLACK)
          s.cells = s.cells.map((row, pi) =>
            row.map((c, ci) => (pi === player && ci === cellIndex ? clonedCell : c))
          )
          s.placementHistory = [...(s.placementHistory ?? [])]
          for (const [r, c] of placements) {
            s.placementHistory.push({ player, cellIndex, r, c, color: ATOM_BLACK })
          }
        })
      } else if (selectedColor && r != null && c != null) {
        updateState((s) => applyPlace(s, cellIndex, r, c, selectedColor))
      }
    },
    [
      interactionMode,
      state.phase,
      state.currentPlayer,
      state.cells,
      selectedColor,
      batchMode,
      batchCount,
      maxBatch,
      updateState,
      actionSubstate,
      attackMyCell,
      resetAttackState,
    ]
  )

  return (
    <div className="min-h-screen bg-bg text-gray-200 flex flex-col">
      <div className="fixed top-0 left-0 right-0 z-10">
        <PlayerBar state={state} player={1} />
      </div>
      <header className="pt-16 pb-2 px-4 border-b border-gray-700 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setInteractionMode((m) => (m === 'drag' ? 'operate' : 'drag'))}
            className={`px-3 py-1 rounded text-sm ${interactionMode === 'drag' ? 'bg-sky-600 ring-2 ring-sky-400' : 'bg-gray-600'}`}
          >
            {interactionMode === 'drag' ? '拖动视角' : '操作'}
          </button>
          <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">三角形:格子</span>
          <input
            type="range"
            min={3}
            max={10}
            value={gridScaleDenom}
            onChange={(e) => setGridScaleDenom(Number(e.target.value))}
            className="w-20"
          />
          <span className="text-xs text-gray-500">1:{gridScaleDenom}</span>
          </div>
        </div>
        {state.phase === PHASE_PLACE && (
          <div className="flex items-center gap-4">
            <button
              onClick={() => setBatchMode((b) => !b)}
              className={`px-3 py-1 rounded text-sm text-white ${batchMode ? 'bg-black ring-2 ring-gray-400' : 'bg-gray-800'}`}
            >
              批量放置黑
            </button>
            {batchMode && (
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, maxBatch)}
                  value={Math.min(batchCount, Math.max(0, maxBatch))}
                  onChange={(e) => setBatchCount(Number(e.target.value))}
                  className="w-28"
                />
                <span className="text-sm text-gray-400 w-6">{Math.min(Math.floor(batchCount), Math.max(0, maxBatch))}</span>
              </div>
            )}
            {!batchMode && (
            <div className="flex gap-2">
            {['red', 'blue', 'green'].map((color) => (
              <button
                key={color}
                onClick={() =>
                  setSelectedColor((prev) => (prev === color ? null : color))
                }
                className={`px-3 py-1 rounded text-sm ${
                  selectedColor === color ? 'ring-2 ring-amber-400' : ''
                } ${
                  color === 'red'
                    ? 'bg-red-700'
                    : color === 'blue'
                      ? 'bg-blue-700'
                      : 'bg-green-700'
                }`}
              >
                {color === 'red' ? '红' : color === 'blue' ? '蓝' : '绿'}
              </button>
            ))}
            </div>
            )}
          </div>
        )}
      </header>
      <main className="flex-1 flex flex-col items-center justify-center p-4 overflow-auto pt-4 pb-24">
        <Board
          state={state}
          selectedColor={selectedColor}
          onClick={handleCellClick}
          gridScaleDenom={gridScaleDenom}
          interactionMode={interactionMode}
          attackHighlightCell={attackMyCell ? { player: attackMyCell[0], cellIndex: attackMyCell[1] } : null}
        />
      </main>
      <div className="fixed bottom-20 left-0 right-0 z-10">
        <PlayerBar state={state} player={0} />
      </div>
      <HUD
        state={state}
        setState={setState}
        updateState={updateState}
        actionSubstate={actionSubstate}
        attackMyCell={attackMyCell}
        onDirectAttackConfirm={() => {
          if (attackMyCell) {
            updateState((s) => {
              const dmg = applyDirectAttack(s, s.cells[attackMyCell[0]][attackMyCell[1]])
              setAttackMessage(`直接攻击，造成 ${dmg} 点伤害`)
            })
            resetAttackState()
          }
        }}
        onDirectAttackCancel={resetAttackState}
        attackMessage={attackMessage}
      />
    </div>
  )
}

function PlayerBar({ state, player }) {
  const p = pool(state, player)
  const isCurrent = state.currentPlayer === player
  const hp = state.hp[player] ?? INITIAL_HP
  const maxHp = INITIAL_HP
  return (
    <div className={`flex items-center gap-4 px-4 py-2 border-b border-gray-700 ${isCurrent ? 'bg-gray-800/60' : 'bg-gray-900/40'}`}>
      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold bg-gray-700 text-amber-400 border-2 border-gray-600">
        P{player}
      </div>
      <div className="flex items-center gap-2">
        <div className="w-24 h-3 bg-gray-800 rounded overflow-hidden">
          <div
            className="h-full bg-red-600 transition-all"
            style={{ width: `${Math.max(0, Math.min(100, (hp / maxHp) * 100))}%` }}
          />
        </div>
        <span className="text-sm text-gray-400">{hp}/{maxHp}</span>
      </div>
      <div className="flex gap-1">
        {['black', 'red', 'blue', 'green'].map((color) => (
          <span
            key={color}
            className={`px-2 py-0.5 rounded text-xs ${
              color === 'black' ? 'bg-gray-700' : color === 'red' ? 'bg-red-700' : color === 'blue' ? 'bg-blue-700' : 'bg-green-700'
            } text-white`}
          >
            {(p[color] ?? 0)}
          </span>
        ))}
      </div>
    </div>
  )
}

export default App
