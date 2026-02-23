import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { createGameState, pool, canAttackThisTurn, opponent, hasCellAttackedThisTurn, getAttackableEnemyCellIndices, getRedEffectTargetableEnemyCellIndices, isGraySilenced } from './game/state.js'
import { startTurnDefault } from './game/turn.js'
import { applyPlace, batchPlaceOnCell } from './game/turn.js'
import {
  applyDirectAttack,
  handleAttackEnemyCell,
  clearCellsWithNoBlack,
} from './game/attack.js'
import { applyEffectBlue, applyEffectGreen, applyEffectYellow, applyEffectRedRandom, applyEffectGray, getConnectivityChoice, applyConnectivityChoice } from './game/combat.js'
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
  const [effectPendingAtom, setEffectPendingAtom] = useState(null)
  const [attackMessage, setAttackMessage] = useState('')
  const [connectivityChoice, setConnectivityChoice] = useState(null)
  const [pendingAction, setPendingAction] = useState(null)
  const [destroyingAtoms, setDestroyingAtoms] = useState([])
  const [effectFlashAtom, setEffectFlashAtom] = useState(null)
  const [testMode, setTestMode] = useState(false)
  const nextConnectivityChoiceRef = useRef(null)
  const destroyTimeoutRef = useRef(null)
  const whitePlaceConnectivityRef = useRef(null)
  const whitePlacePendingInUpdaterRef = useRef(null)
  const [whitePlaceConnectivityTrigger, setWhitePlaceConnectivityTrigger] = useState(0)

  const maxBatch = state.phase === PHASE_PLACE
    ? Math.min(pool(state, state.currentPlayer).black ?? 0, state.turnPlaceLimit - state.turnPlacedCount)
    : 0
  useEffect(() => {
    if (batchMode && maxBatch >= 0 && batchCount > maxBatch) {
      setBatchCount(maxBatch)
    }
  }, [batchMode, maxBatch, batchCount])

  const prevPhaseRef = useRef(state.phase)
  useEffect(() => {
    const prev = prevPhaseRef.current
    prevPhaseRef.current = state.phase
    const leftActionPhase = prev === PHASE_ACTION && state.phase !== PHASE_ACTION
    if (leftActionPhase) {
      setActionSubstate('idle')
      setAttackMyCell(null)
      setAttackEnemyCell(null)
      setRedEffectSource(null)
      setEffectPendingAtom(null)
      setConnectivityChoice(null)
      setPendingAction(null)
    }
    const leftPlacePhase = prev === PHASE_PLACE && state.phase !== PHASE_PLACE
    if (leftPlacePhase) {
      whitePlacePendingInUpdaterRef.current = null
      setState((s) => {
        const next = { ...s }
        delete next.pendingConnectivityChoice
        delete next.pendingConnectivityAction
        return next
      })
    }
  }, [state.phase])

  useEffect(() => () => {
    if (destroyTimeoutRef.current) clearTimeout(destroyTimeoutRef.current)
  }, [])

  useEffect(() => {
    const payload = whitePlaceConnectivityRef.current
    if (!payload || state.phase !== PHASE_PLACE) return
    whitePlaceConnectivityRef.current = null
    whitePlacePendingInUpdaterRef.current = null
    setConnectivityChoice(payload)
    setPendingAction('white_place')
  }, [whitePlaceConnectivityTrigger, state.phase])

  // 仅在「某格黑原子数目下降且产生多个不连通子集」时弹窗（由白湮灭黑或进攻/红效果触发）
  const updateState = useCallback((updater) => {
    setState((prev) => {
      const next = { ...prev }
      if (typeof updater === 'function') updater(next)
      return next
    })
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

  const handleEffectConfirm = useCallback(() => {
    if (!effectPendingAtom) return
    const { player, cellIndex, r, c, color } = effectPendingAtom
    setEffectPendingAtom(null)
    if (color === 'red') {
      setRedEffectSource({ player, cellIndex, r, c })
      setActionSubstate('red_effect_target')
      setAttackMessage('请选择要作用的对方格子')
      return
    }
    if (color === 'blue') {
      updateState((s) => {
        if (applyEffectBlue(s, player, cellIndex, r, c)) {
          triggerEffectFlash(player, cellIndex, r, c)
          setAttackMessage('蓝效果：相邻黑原子下一回合内不可被破坏')
        }
      })
      return
    }
    if (color === 'green') {
      let effectResult
      updateState((s) => {
        effectResult = applyEffectGreen(s, player, cellIndex, r, c)
      })
      if (effectResult === true || (effectResult && effectResult.ok)) {
        triggerEffectFlash(player, cellIndex, r, c)
        setAttackMessage('绿效果：该格点变为黑原子')
      }
      if (effectResult && typeof effectResult === 'object' && effectResult.connectivityChoice) {
        setConnectivityChoice(effectResult.connectivityChoice)
        setPendingAction('green_effect')
      }
      return
    }
    if (color === 'yellow') {
      let effectResult
      updateState((s) => {
        effectResult = applyEffectYellow(s, player, cellIndex, r, c)
      })
      if (effectResult === true || (effectResult && effectResult.ok)) {
        triggerEffectFlash(player, cellIndex, r, c)
        setAttackMessage('黄效果：相邻黑原子下回合内优先被破坏')
      }
      if (effectResult && typeof effectResult === 'object' && effectResult.connectivityChoice) {
        setConnectivityChoice(effectResult.connectivityChoice)
        setPendingAction('yellow_effect')
      }
      return
    }
    if (color === 'gray') {
      let grayOk = false
      updateState((s) => {
        grayOk = applyEffectGray(s, player, cellIndex, r, c)
      })
      if (grayOk) {
        triggerEffectFlash(player, cellIndex, r, c)
        setAttackMessage('灰效果：周围格点下一回合内无法发动其他原子点击效果')
      }
      return
    }
  }, [effectPendingAtom, updateState, triggerEffectFlash])

  const handleEffectCancel = useCallback(() => {
    setEffectPendingAtom(null)
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
        s.attackedEnemyCellIndicesThisTurn = s.attackedEnemyCellIndicesThisTurn ?? []
        s.attackedEnemyCellIndicesThisTurn.push(attackEnemyCell[1])
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
      const cc = connectivityChoice ?? state.pendingConnectivityChoice
      if (!cc) return
      if (cc.noChoice) {
        setConnectivityChoice(null)
        setPendingAction(null)
        updateState((s) => { s.currentPlayer = cc.placer })
        setAttackMessage('')
        return
      }
      if (choiceIndex < 0 || choiceIndex >= (cc.components?.length ?? 0)) return
      const { defender, cellIndex, type, components } = cc
      nextConnectivityChoiceRef.current = null
      updateState((s) => {
        const cell = s.cells[defender][cellIndex]
        applyConnectivityChoice(cell, type, components[choiceIndex])
        nextConnectivityChoiceRef.current = getConnectivityChoice(cell)
        return s
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
            s.attackedEnemyCellIndicesThisTurn = s.attackedEnemyCellIndicesThisTurn ?? []
            s.attackedEnemyCellIndicesThisTurn.push(cellIndex)
          })
          resetAttackState()
          setAttackMessage('进攻完成')
        } else if (pendingAction === 'red_effect') {
          updateState((s) => {
            s.currentPlayer = 1 - defender
            s.redEffectTargetCellIndicesThisTurn = s.redEffectTargetCellIndicesThisTurn ?? []
            s.redEffectTargetCellIndicesThisTurn.push(cellIndex)
          })
          setAttackMessage('红效果：已随机破坏对方黑原子')
        } else if (pendingAction === 'white_place' || state.pendingConnectivityAction === 'white_place') {
          whitePlacePendingInUpdaterRef.current = null
          const placer = cc?.placer != null ? cc.placer : 1 - defender
          updateState((s) => {
            s.currentPlayer = placer
            delete s.pendingConnectivityChoice
            delete s.pendingConnectivityAction
            return s
          })
          setAttackMessage('')
        } else if (pendingAction === 'green_effect' || pendingAction === 'yellow_effect') {
          setAttackMessage(pendingAction === 'green_effect' ? '绿效果：该格点变为黑原子' : '黄效果：相邻黑原子下回合内优先被破坏')
        }
        setPendingAction(null)
      }
    },
    [connectivityChoice, pendingAction, state.pendingConnectivityChoice, state.pendingConnectivityAction, attackMyCell, updateState, resetAttackState]
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
            const targetable = getRedEffectTargetableEnemyCellIndices(state)
            if (!targetable.includes(cellIndex)) {
              setAttackMessage('须先对黄原子数更多的对方格子发动红效果')
              return
            }
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
                updateState((s) => {
                  s.redEffectTargetCellIndicesThisTurn = s.redEffectTargetCellIndicesThisTurn ?? []
                  s.redEffectTargetCellIndicesThisTurn.push(cellIndex)
                })
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
          if (isGraySilenced(state, cur, cellIndex, [r, c])) {
            setAttackMessage('该格点处于灰原子沉默区内，下一回合内无法发动点击效果')
            return
          }
          if (color === 'red') {
            const y = cell.effectiveBlackNeighborCount(r, c)
            if (y > 0) {
              setEffectPendingAtom({ player: cur, cellIndex, r, c, color: 'red' })
              setAttackMessage('请确认发动红效果，再选择对方格子')
              return
            }
          } else if (color === 'blue') {
            setEffectPendingAtom({ player: cur, cellIndex, r, c, color: 'blue' })
            setAttackMessage('请确认发动蓝效果')
            return
          } else if (color === 'green') {
            setEffectPendingAtom({ player: cur, cellIndex, r, c, color: 'green' })
            setAttackMessage('请确认发动绿效果')
            return
          } else if (color === 'yellow') {
            setEffectPendingAtom({ player: cur, cellIndex, r, c, color: 'yellow' })
            setAttackMessage('请确认发动黄效果')
            return
          } else if (color === 'gray') {
            setEffectPendingAtom({ player: cur, cellIndex, r, c, color: 'gray' })
            setAttackMessage('请确认发动灰效果：周围格点下一回合内无法发动其他原子点击效果')
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
              setAttackMessage('须先进攻黄原子数更多的对方格子')
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

        if (actionSubstate === 'idle' && !effectPendingAtom && player === cur && canAttackThisTurn(state)) {
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

      if (state.phase !== PHASE_PLACE) return
      if (state.currentPlayer !== player && selectedColor !== 'white' && selectedColor !== 'gray') return
      if (batchMode && selectedColor !== 'white') {
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
        let placeResult
        const targetPlayer = selectedColor === 'white' || selectedColor === 'gray' ? player : state.currentPlayer
        updateState((s) => {
          const result = applyPlace(s, cellIndex, r, c, selectedColor, (selectedColor === 'white' || selectedColor === 'gray') ? { targetPlayer } : undefined)
          if (result !== false) placeResult = result
          if (selectedColor === 'white' && result && typeof result === 'object' && result.connectivityChoice) {
            const choice = result.connectivityChoice
            const hasMulti = Array.isArray(choice.components) && choice.components.length > 0
            if (hasMulti) {
              if (result.defender !== s.currentPlayer) s.currentPlayer = result.defender
              const payload = {
                defender: result.defender,
                cellIndex: result.cellIndex,
                type: choice.type,
                components: choice.components,
                placer: s.currentPlayer,
              }
              s.pendingConnectivityChoice = payload
              s.pendingConnectivityAction = 'white_place'
              whitePlacePendingInUpdaterRef.current = payload
            }
          } else if (selectedColor === 'white' && result === false && whitePlacePendingInUpdaterRef.current) {
            s.pendingConnectivityChoice = whitePlacePendingInUpdaterRef.current
            s.pendingConnectivityAction = 'white_place'
          }
        })
        if (selectedColor === 'white' && placeResult && typeof placeResult === 'object') {
          const choice = placeResult.connectivityChoice
          const hasComponents = choice && Array.isArray(choice.components) && choice.components.length > 0
          if (hasComponents) {
            whitePlaceConnectivityRef.current = {
              defender: placeResult.defender,
              cellIndex: placeResult.cellIndex,
              type: choice.type,
              components: choice.components,
              placer: state.currentPlayer,
            }
            setWhitePlaceConnectivityTrigger((n) => n + 1)
          }
        }
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
      effectPendingAtom,
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
          <button
            onClick={() => setTestMode((t) => !t)}
            className={`px-3 py-1 rounded text-sm ${testMode ? 'bg-amber-600 ring-2 ring-amber-400' : 'bg-gray-600 hover:bg-gray-500'}`}
          >
            测试：连通子集数
          </button>
        </div>
        {state.phase === PHASE_PLACE && (
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                const enablingBatch = !batchMode
                setBatchMode((b) => !b)
                if (enablingBatch && selectedColor === 'white') setSelectedColor(null)
              }}
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
            {['red', 'blue', 'green', 'yellow', 'purple', 'white', 'gray'].map((color) => (
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
                          : color === 'purple'
                            ? 'bg-violet-600'
                            : color === 'white'
                              ? 'bg-gray-200 text-gray-800'
                              : 'bg-gray-500'
                }`}
              >
                {color === 'red' ? '红' : color === 'blue' ? '蓝' : color === 'green' ? '绿' : color === 'yellow' ? '黄' : color === 'purple' ? '紫' : color === 'white' ? '白' : '灰'}
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
          connectivityChoice={connectivityChoice ?? state.pendingConnectivityChoice}
          destroyingAtoms={destroyingAtoms}
          effectFlashAtom={effectFlashAtom}
          effectPendingAtom={effectPendingAtom}
          actionSubstate={actionSubstate}
          attackMyCell={attackMyCell}
          attackEnemyCell={attackEnemyCell}
          testMode={testMode}
        />
      </main>
      <div className="fixed bottom-0 left-0 right-0 z-10">
        <PlayerBar state={state} player={0} />
      </div>
      {(() => {
        const effectiveCC = connectivityChoice ?? state.pendingConnectivityChoice
        const effectiveAction = pendingAction ?? state.pendingConnectivityAction
        const show = effectiveCC && (effectiveCC.noChoice || (Array.isArray(effectiveCC.components) && effectiveCC.components.length > 0))
        if (!show) return null
        return createPortal(
          <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-start pl-2 pointer-events-none">
            <div className="bg-gray-900 rounded-lg p-3 max-w-[200px] border-2 border-amber-500/80 shadow-xl pointer-events-auto">
              <h3 className="text-sm font-semibold text-amber-400 mb-1">
                {effectiveCC.noChoice
                  ? '白原子已湮灭'
                  : effectiveAction === 'white_place'
                    ? '白原子湮灭后：选择保留子集'
                    : effectiveAction === 'green_effect'
                      ? '绿效果后：选择保留子集'
                      : effectiveAction === 'yellow_effect'
                        ? '黄效果后：选择保留子集'
                        : effectiveCC.type === 'all'
                          ? '步骤(1)：该格不连通'
                          : '步骤(2)：多个黑连通子集'}
              </h3>
              {effectiveCC.noChoice ? (
                <button
                  onClick={() => handleConnectivityChoice(0)}
                  className="w-full px-2 py-1.5 bg-amber-600 hover:bg-amber-500 rounded text-xs font-medium"
                >
                  确认
                </button>
              ) : (
                <>
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
                    ].slice(0, effectiveCC.components.length).map((style, i) => (
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
                </>
              )}
            </div>
          </div>,
          document.body
        )
      })()}
      <HUD
        state={state}
        setState={setState}
        updateState={updateState}
        actionSubstate={actionSubstate}
        attackMyCell={attackMyCell}
        attackEnemyCell={attackEnemyCell}
        onAttackConfirm={handleAttackConfirm}
        onAttackCancel={handleAttackCancel}
        onAttackMyCellCancel={() => {
          setAttackMyCell(null)
          setAttackEnemyCell(null)
          setActionSubstate('idle')
        }}
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
        connectivityChoice={connectivityChoice ?? state.pendingConnectivityChoice}
        onConnectivityChoice={handleConnectivityChoice}
        effectPendingAtom={effectPendingAtom}
        onEffectConfirm={handleEffectConfirm}
        onEffectCancel={handleEffectCancel}
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
        {['black', 'red', 'blue', 'green', 'yellow', 'purple', 'white', 'gray'].map((color) => (
          <span
            key={color}
            className={`px-2 py-0.5 rounded text-xs ${
              color === 'black' ? 'bg-gray-700' : color === 'red' ? 'bg-red-700' : color === 'blue' ? 'bg-blue-700' : color === 'green' ? 'bg-green-700' : color === 'yellow' ? 'bg-yellow-600' : color === 'purple' ? 'bg-violet-600' : color === 'white' ? 'bg-gray-200 text-gray-800' : 'bg-gray-500'
            } ${color !== 'white' ? 'text-white' : ''}`}
          >
            {(p[color] ?? 0)}
          </span>
        ))}
      </div>
    </div>
  )
}

export default App
