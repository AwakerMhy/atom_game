import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { createGameState, pool, canAttackThisTurn, opponent, hasCellAttackedThisTurn, getAttackableEnemyCellIndices } from './game/state.js'
import { startTurnDefault } from './game/turn.js'
import { applyPlace, batchPlaceOnCell } from './game/turn.js'
import {
  applyDirectAttack,
  handleAttackEnemyCell,
  clearCellsWithNoBlack,
} from './game/attack.js'
import { applyEffectBlue, applyEffectGreen, applyEffectYellow, applyEffectRedRandom, getConnectivityChoice, applyConnectivityChoice } from './game/combat.js'
import { PHASE_PLACE, PHASE_ACTION, INITIAL_HP, ATOM_BLACK } from './game/config.js'
import { Cell } from './game/cell.js'
import Board from './components/Board.jsx'
import HUD from './components/HUD.jsx'
import StartScreen from './components/StartScreen.jsx'
import { playDestroySound, playEffectSound } from './utils/sound.js'

function App() {
  const [inGame, setInGame] = useState(false)
  const [state, setState] = useState(() => {
    const s = createGameState()
    startTurnDefault(s)
    return s
  })

  const handleStartGame = useCallback((config) => {
    const s = createGameState(config)
    startTurnDefault(s)
    setState(s)
    setInGame(true)
  }, [])
  const [selectedColor, setSelectedColor] = useState(null)
  const [batchMode, setBatchMode] = useState(false)
  const [batchCount, setBatchCount] = useState(1)
  const [gridScaleDenom, setGridScaleDenom] = useState(6)
  const [interactionMode, setInteractionMode] = useState('operate')
  const [actionSubstate, setActionSubstate] = useState('idle')
  const [attackMyCell, setAttackMyCell] = useState(null)
  const [attackEnemyCell, setAttackEnemyCell] = useState(null)
  const [redEffectSource, setRedEffectSource] = useState(null)
  const [attackMessage, setAttackMessage] = useState('')
  const [connectivityChoice, setConnectivityChoice] = useState(null)
  const [pendingAction, setPendingAction] = useState(null)
  const [destroyingAtoms, setDestroyingAtoms] = useState([])
  const [effectFlashAtom, setEffectFlashAtom] = useState(null)
  const nextConnectivityChoiceRef = useRef(null)
  const destroyTimeoutRef = useRef(null)

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
      setRedEffectSource(null)
      setConnectivityChoice(null)
      setPendingAction(null)
    }
  }, [state.phase])

  useEffect(() => () => {
    if (destroyTimeoutRef.current) clearTimeout(destroyTimeoutRef.current)
  }, [])

  const resetAttackState = useCallback(() => {
    setActionSubstate('idle')
    setAttackMyCell(null)
    setAttackEnemyCell(null)
    setRedEffectSource(null)
  }, [])

  const triggerDestroyAnimation = useCallback((destroyedAtoms) => {
    if (destroyedAtoms?.length) {
      if (destroyTimeoutRef.current) clearTimeout(destroyTimeoutRef.current)
      playDestroySound()
      setDestroyingAtoms(destroyedAtoms)
      destroyTimeoutRef.current = setTimeout(() => {
        setDestroyingAtoms([])
        destroyTimeoutRef.current = null
      }, 380)
    }
  }, [])

  const triggerEffectFlash = useCallback((player, cellIndex, r, c) => {
    playEffectSound()
    setEffectFlashAtom({ player, cellIndex, r, c })
    setTimeout(() => setEffectFlashAtom(null), 320)
  }, [])

  const updateState = useCallback((updater) => {
    setState((prev) => {
      const next = { ...prev }
      if (typeof updater === 'function') updater(next)
      return next
    })
  }, [])

  const handleAttackConfirm = useCallback(() => {
    if (!attackMyCell || !attackEnemyCell) return
    const next = { ...state }
    const ret = handleAttackEnemyCell(next, attackMyCell, attackEnemyCell)
    setState(next)
    setActionSubstate(ret.substate)
    setAttackMessage(ret.message ?? '')
    if (ret.destroyedAtoms?.length) triggerDestroyAnimation(ret.destroyedAtoms)
    if (ret.substate === 'idle' && ret.attackConsumed !== false) {
      updateState((s) => {
        s.attackedCellsThisTurn = s.attackedCellsThisTurn ?? []
        s.attackedCellsThisTurn.push([attackMyCell[0], attackMyCell[1]])
      })
      resetAttackState()
    } else if (ret.substate === 'idle' && ret.attackConsumed === false) {
      setAttackEnemyCell(null)
      setActionSubstate('attack_my')
      setAttackMessage('请点击对方格子进攻')
    } else if (ret.substate === 'defender_choose_connected' && ret.connectivityChoice) {
      const cc = ret.connectivityChoice
      setConnectivityChoice(cc)
      setPendingAction(ret.pendingAction ?? null)
      setAttackMessage(
        cc.type === 'all'
          ? '步骤(1)：该格不连通，请选择要保留的连通子集'
          : '步骤(2)：多个黑连通子集，请选择要保留的一个'
      )
      updateState((s) => { s.currentPlayer = cc.defender })
    }
  }, [state, attackMyCell, attackEnemyCell, updateState, resetAttackState, triggerDestroyAnimation])

  const handleAttackCancel = useCallback(() => {
    setAttackEnemyCell(null)
    setAttackMyCell(null)
    setActionSubstate('idle')
    setAttackMessage('')
  }, [])

  const handleConnectivityChoice = useCallback(
    (choiceIndex) => {
      const cc = connectivityChoice
      if (!cc || choiceIndex < 0 || choiceIndex >= cc.components.length) return
      const { defender, cellIndex, type, components } = cc
      nextConnectivityChoiceRef.current = null
      updateState((s) => {
        const cell = s.cells[defender][cellIndex]
        applyConnectivityChoice(cell, type, components[choiceIndex])
        nextConnectivityChoiceRef.current = getConnectivityChoice(cell)
      })
      const next = nextConnectivityChoiceRef.current
      if (next) {
        setConnectivityChoice({ defender, cellIndex, ...next })
        setAttackMessage(
          next.type === 'all'
            ? '步骤(1)：该格不连通，请选择要保留的连通子集'
            : '步骤(2)：多个黑连通子集，请选择要保留的一个'
        )
      } else {
        setConnectivityChoice(null)
        if (pendingAction === 'attack') {
          updateState((s) => {
            s.turnAttackUsed++
            clearCellsWithNoBlack(s, defender)
            s.currentPlayer = 1 - defender
            s.attackedCellsThisTurn = s.attackedCellsThisTurn ?? []
            if (attackMyCell) s.attackedCellsThisTurn.push([attackMyCell[0], attackMyCell[1]])
          })
          resetAttackState()
          setAttackMessage('进攻完成')
        } else if (pendingAction === 'red_effect') {
          updateState((s) => { s.currentPlayer = 1 - defender })
          setAttackMessage('红效果：已随机破坏对方黑原子')
        }
        setPendingAction(null)
      }
    },
    [connectivityChoice, pendingAction, attackMyCell, updateState, resetAttackState]
  )

  const handleCellClick = useCallback(
    (player, cellIndex, r, c, viewCenter) => {
      if (interactionMode !== 'operate') return

      if (state.phase === PHASE_ACTION) {
        const cur = state.currentPlayer
        const opp = opponent(state, cur)
        const ptKey = r != null && c != null ? `${r},${c}` : null

        if (actionSubstate === 'red_effect_target' && player === opp) {
          const src = redEffectSource
          if (src) {
            const next = { ...state }
            const result = applyEffectRedRandom(next, src.player, src.cellIndex, src.r, src.c, cellIndex)
            setState(next)
            setActionSubstate('idle')
            setRedEffectSource(null)
            if (result?.destroyedAtoms?.length) triggerDestroyAnimation(result.destroyedAtoms)
            if (result && typeof result === 'object' && result.ok) {
              if (result.connectivityChoice) {
                const cc = result.connectivityChoice
                setConnectivityChoice(cc)
                setPendingAction('red_effect')
                setAttackMessage(
                  cc.type === 'all'
                    ? '步骤(1)：该格不连通，请选择要保留的连通子集'
                    : '步骤(2)：多个黑连通子集，请选择要保留的一个'
                )
                updateState((s) => { s.currentPlayer = cc.defender })
              } else {
                setAttackMessage('红效果：已随机破坏对方黑原子')
              }
            } else {
              setAttackMessage('该格无可破坏的黑原子')
            }
          }
          return
        }

        if (actionSubstate === 'idle' && player === cur && ptKey != null) {
          const cell = state.cells[cur][cellIndex]
          const color = cell.get(r, c)
          if (color === 'red') {
            const y = cell.countBlackNeighbors(r, c)
            if (y > 0) {
              setRedEffectSource({ player: cur, cellIndex, r, c })
              setActionSubstate('red_effect_target')
              setAttackMessage('请选择要作用的对方格子')
              return
            }
          } else if (color === 'blue') {
            updateState((s) => {
              if (applyEffectBlue(s, cur, cellIndex, r, c)) {
                triggerEffectFlash(cur, cellIndex, r, c)
                setAttackMessage('蓝效果：相邻黑原子下一回合内不可被破坏')
              }
            })
            return
          } else if (color === 'green') {
            updateState((s) => {
              if (applyEffectGreen(s, cur, cellIndex, r, c)) {
                triggerEffectFlash(cur, cellIndex, r, c)
                setAttackMessage('绿效果：该格点变为黑原子')
              }
            })
            return
          } else if (color === 'yellow') {
            updateState((s) => {
              if (applyEffectYellow(s, cur, cellIndex, r, c)) {
                triggerEffectFlash(cur, cellIndex, r, c)
                setAttackMessage('黄效果：相邻黑原子下回合内优先被破坏')
              }
            })
            return
          } else if (color === 'purple') {
            setAttackMessage('紫原子无点击效果')
            return
          }
        }

        if (actionSubstate === 'attack_my' && attackMyCell) {
          const attackable = getAttackableEnemyCellIndices(state)
          if (player === opp) {
            if (!attackable.includes(cellIndex)) {
              setAttackMessage('对方有黄原子时，只能攻击有黄原子的格子')
              return
            }
          }
          if (player === opp && attackable.includes(cellIndex) && !state.cells[opp][cellIndex].isEmpty()) {
            setAttackEnemyCell([opp, cellIndex])
            setActionSubstate('attack_confirm')
            setAttackMessage('确认进攻？')
            return
          }
          return
        }

        if (actionSubstate === 'attack_confirm' && attackMyCell && attackEnemyCell) {
          return
        }

        if (actionSubstate === 'idle' && player === cur && canAttackThisTurn(state)) {
          const cell = state.cells[cur][cellIndex]
          if (!cell.isEmpty() && cell.hasBlack() && !hasCellAttackedThisTurn(state, cur, cellIndex)) {
            setAttackMyCell([cur, cellIndex])
            const oppAllEmpty = state.cells[opp].every((c) => c.isEmpty())
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
      redEffectSource,
      resetAttackState,
      triggerDestroyAnimation,
      triggerEffectFlash,
    ]
  )

  if (!inGame) {
    return <StartScreen onStart={handleStartGame} defaultConfig={state?.config} />
  }

  return (
    <div className="min-h-screen bg-bg text-gray-200 flex flex-col">
      <div className="fixed top-0 left-0 right-0 z-10">
        <PlayerBar state={state} player={1} />
      </div>
      <header className="pt-16 pb-2 px-4 border-b border-gray-700 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setInGame(false)}
            className="px-3 py-1 rounded text-sm bg-gray-600 hover:bg-gray-500"
          >
            主菜单
          </button>
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
            {['red', 'blue', 'green', 'yellow', 'purple'].map((color) => (
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
                      : color === 'green'
                        ? 'bg-green-700'
                        : color === 'yellow'
                          ? 'bg-yellow-600'
                          : 'bg-violet-600'
                }`}
              >
                {color === 'red' ? '红' : color === 'blue' ? '蓝' : color === 'green' ? '绿' : color === 'yellow' ? '黄' : '紫'}
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
          connectivityChoice={connectivityChoice}
          destroyingAtoms={destroyingAtoms}
          effectFlashAtom={effectFlashAtom}
          actionSubstate={actionSubstate}
          attackMyCell={attackMyCell}
          attackEnemyCell={attackEnemyCell}
        />
      </main>
      <div className="fixed bottom-0 left-0 right-0 z-10">
        <PlayerBar state={state} player={0} />
      </div>
      {connectivityChoice && Array.isArray(connectivityChoice.components) && connectivityChoice.components.length > 0 &&
        createPortal(
          <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-start pl-2 pointer-events-none">
            <div className="bg-gray-900 rounded-lg p-3 max-w-[200px] border-2 border-amber-500/80 shadow-xl pointer-events-auto">
              <h3 className="text-sm font-semibold text-amber-400 mb-1">
                {connectivityChoice.type === 'all'
                  ? '步骤(1)：该格不连通'
                  : '步骤(2)：多个黑连通子集'}
              </h3>
              <p className="text-xs text-gray-300 mb-2">
                可拖动视角查看格子，选保留子集：
              </p>
              <div className="flex flex-col gap-1.5">
                {[
                  { bg: 'bg-amber-600', hover: 'hover:bg-amber-500', label: '琥珀' },
                  { bg: 'bg-cyan-600', hover: 'hover:bg-cyan-500', label: '青' },
                  { bg: 'bg-pink-600', hover: 'hover:bg-pink-500', label: '粉' },
                  { bg: 'bg-emerald-600', hover: 'hover:bg-emerald-500', label: '翠绿' },
                  { bg: 'bg-violet-600', hover: 'hover:bg-violet-500', label: '紫' },
                ].slice(0, connectivityChoice.components.length).map((style, i) => (
                  <button
                    key={i}
                    onClick={() => handleConnectivityChoice(i)}
                    className={`px-2 py-1.5 ${style.bg} ${style.hover} rounded text-xs font-medium flex items-center gap-1.5`}
                  >
                    <span className="w-4 h-4 rounded-full bg-white/30 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                    保留 {i + 1}（{style.label}）
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}
      <HUD
        state={state}
        setState={setState}
        updateState={updateState}
        actionSubstate={actionSubstate}
        attackMyCell={attackMyCell}
        attackEnemyCell={attackEnemyCell}
        onAttackConfirm={handleAttackConfirm}
        onAttackCancel={handleAttackCancel}
        onDirectAttackConfirm={() => {
          if (attackMyCell) {
            updateState((s) => {
              const dmg = applyDirectAttack(s, s.cells[attackMyCell[0]][attackMyCell[1]])
              s.attackedCellsThisTurn = s.attackedCellsThisTurn ?? []
              s.attackedCellsThisTurn.push([attackMyCell[0], attackMyCell[1]])
              setAttackMessage(`直接攻击，造成 ${dmg} 点伤害`)
            })
            resetAttackState()
          }
        }}
        onDirectAttackCancel={resetAttackState}
        attackMessage={attackMessage}
        connectivityChoice={connectivityChoice}
        onConnectivityChoice={handleConnectivityChoice}
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
        {['black', 'red', 'blue', 'green', 'yellow', 'purple'].map((color) => (
          <span
            key={color}
            className={`px-2 py-0.5 rounded text-xs ${
              color === 'black' ? 'bg-gray-700' : color === 'red' ? 'bg-red-700' : color === 'blue' ? 'bg-blue-700' : color === 'green' ? 'bg-green-700' : color === 'yellow' ? 'bg-yellow-600' : 'bg-violet-600'
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
