import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { createGameState, pool, canAttackThisTurn, opponent, hasCellAttackedThisTurn, getAttackableEnemyCellIndices, getRedEffectTargetableEnemyCellIndices, isGraySilenced, placementCountThisTurn } from './game/state.js'
import { startTurnDefault, undoLastPlacement, initLevel3AICells, applyLevel3Proliferation } from './game/turn.js'
import { applyPlace, batchPlaceOnCell, validatePlace } from './game/turn.js'
import {
  applyDirectAttack,
  handleAttackEnemyCell,
  clearCellsWithNoBlack,
} from './game/attack.js'
import { applyEffectBlue, applyEffectGreen, applyEffectYellow, applyEffectRedRandom, applyEffectGray, getConnectivityChoice, applyConnectivityChoice, attackPower, defensePower, resolveDirectAttack } from './game/combat.js'
import { PHASE_PLACE, PHASE_ACTION, INITIAL_HP, ATOM_BLACK } from './game/config.js'
import { matchRecipe, applySynthesis } from './game/synthesis.js'
import { runAIPlace, runAIPlaceStep, runAIPlaceStepLevel2, getAIAttackOptions, runOneAIAttack, runAIEndTurn, runAIRedEffect, runAIBlueEffect } from './game/ai.jsx'
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
    if (config?.gameMode === 'ai_level3') initLevel3AICells(s)
    setState(s)
    setGameLog([])
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
  const [redEffectHighlightAtoms, setRedEffectHighlightAtoms] = useState([])
  const [attackHighlightAtoms, setAttackHighlightAtoms] = useState([])
  const [damagePopup, setDamagePopup] = useState(null)
  const [effectFlashAtom, setEffectFlashAtom] = useState(null)
  const [testMode, setTestMode] = useState(false)
  const nextConnectivityChoiceRef = useRef(null)
  const destroyTimeoutRef = useRef(null)
  const redEffectHighlightTimeoutRef = useRef(null)
  const attackHighlightTimeoutRef = useRef(null)
  const aiAttackDestroyedRef = useRef(null)
  const aiAttackDamageRef = useRef(null)
  const aiPendingAttackLogsRef = useRef([])
  const aiDamagePopupRef = useRef(null)
  const damagePopupTimeoutRef = useRef(null)
  const aiPlaceTimeoutRef = useRef(null)
  const aiLevel2ActionTimeoutRef = useRef(null)
  const aiLevel2ContinueRef = useRef(false)
  const aiLevel2AttackChoiceRef = useRef(null)
  const aiBlueFlashRef = useRef(null)
  const whitePlaceConnectivityRef = useRef(null)
  const whitePlacePendingInUpdaterRef = useRef(null)
  const lastSinglePlaceResultRef = useRef(null)
  const [whitePlaceConnectivityTrigger, setWhitePlaceConnectivityTrigger] = useState(0)
  const [placeCountTick, setPlaceCountTick] = useState(0)
  const [gameLog, setGameLog] = useState([])
  const gameLogIdRef = useRef(0)
  const lastBatchPlaceRef = useRef(null)
  const [showSynthesisPanel, setShowSynthesisPanel] = useState(false)
  const [synthesisTray, setSynthesisTray] = useState(() => ({ black: 0, red: 0, blue: 0, yellow: 0, white: 0 }))

  const pushGameLog = useCallback((entry) => {
    const { type, player, text, detail, turnBoundary } = typeof entry === 'function' ? entry() : entry
    if (!text) return
    gameLogIdRef.current += 1
    setGameLog((prev) => {
      const next = [...prev, { id: gameLogIdRef.current, type, player, text, detail, turnBoundary }]
      return next.slice(-300)
    })
  }, [])

  // 本回合已放置总数（黑/红/蓝/绿/黄/紫/白/灰合计），不得超过 turnPlaceLimit
  const placePhasePlaced = placementCountThisTurn(state)
  const maxBatch = state.phase === PHASE_PLACE
    ? Math.min(pool(state, state.currentPlayer).black ?? 0, Math.max(0, (state.turnPlaceLimit ?? 0) - placePhasePlaced))
    : 0
  useEffect(() => {
    if (batchMode && maxBatch >= 0 && batchCount > maxBatch) {
      setBatchCount(maxBatch)
    }
  }, [batchMode, maxBatch, batchCount])

  useEffect(() => {
    if (state.phase !== PHASE_PLACE) setSynthesisTray({ black: 0, red: 0, blue: 0, yellow: 0, white: 0 })
  }, [state.phase])

  const prevPhaseRef = useRef(state.phase)
  useEffect(() => {
    const prev = prevPhaseRef.current
    prevPhaseRef.current = state.phase
    if (state.phase === PHASE_PLACE && prev !== PHASE_PLACE) {
      pushGameLog({ type: 'phase', player: state.currentPlayer, text: `P${state.currentPlayer} 开始排布`, turnBoundary: true })
    }
    if (state.phase === PHASE_ACTION && prev !== PHASE_ACTION) {
      pushGameLog({ type: 'phase', player: state.currentPlayer, text: `P${state.currentPlayer} 开始行动`, turnBoundary: true })
    }
    const leftActionPhase = prev === PHASE_ACTION && state.phase !== PHASE_ACTION
    if (leftActionPhase) {
      setActionSubstate('idle')
      setAttackMyCell(null)
      setAttackEnemyCell(null)
      setRedEffectSource(null)
      setEffectPendingAtom(null)
      setConnectivityChoice(null)
      setPendingAction(null)
      if (state.currentPlayer === 0 && (state.config?.gameMode === 'ai_level1' || state.config?.gameMode === 'ai_level2' || state.config?.gameMode === 'ai_level3')) {
        setAttackMessage('AI 已结束回合，轮到你了')
      }
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
  }, [state.phase, state.currentPlayer, pushGameLog])

  useEffect(() => () => {
    if (destroyTimeoutRef.current) clearTimeout(destroyTimeoutRef.current)
    if (redEffectHighlightTimeoutRef.current) clearTimeout(redEffectHighlightTimeoutRef.current)
    if (attackHighlightTimeoutRef.current) clearTimeout(attackHighlightTimeoutRef.current)
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
      // 复制 placementHistory，避免 React 严格模式双重调用时共享数组被重复 push
      const next = { ...prev, placementHistory: [...(prev.placementHistory ?? [])] }
      if (typeof updater === 'function') updater(next)
      // 以 placementHistory 为唯一来源同步本回合排布数（所有颜色合计），保证撤回与上限一致
      const placed = (next.placementHistory ?? []).length
      next.turnPlacedCount = Math.min(next.turnPlaceLimit ?? 0, placed)
      // 强制新数组引用，确保 React 检测到 state 变化、HUD「排布·已放」能正确更新
      next.placementHistory = [...(next.placementHistory ?? [])]
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
      }, 420)
    }
  }, [])

  /** 红效果破坏：先显示红圈圈住目标原子，再播放破坏动画 */
  const triggerRedEffectDestroyAnimation = useCallback((destroyedAtoms) => {
    if (!destroyedAtoms?.length) return
    if (redEffectHighlightTimeoutRef.current) clearTimeout(redEffectHighlightTimeoutRef.current)
    setRedEffectHighlightAtoms(destroyedAtoms)
    redEffectHighlightTimeoutRef.current = setTimeout(() => {
      setRedEffectHighlightAtoms([])
      redEffectHighlightTimeoutRef.current = null
      triggerDestroyAnimation(destroyedAtoms)
    }, 1200)
  }, [triggerDestroyAnimation])

  /** 进攻破坏：先显示深灰圈圈住目标原子，再播放破坏动画 */
  const triggerAttackDestroyAnimation = useCallback((destroyedAtoms) => {
    if (!destroyedAtoms?.length) return
    if (attackHighlightTimeoutRef.current) clearTimeout(attackHighlightTimeoutRef.current)
    setAttackHighlightAtoms(destroyedAtoms)
    attackHighlightTimeoutRef.current = setTimeout(() => {
      setAttackHighlightAtoms([])
      attackHighlightTimeoutRef.current = null
      triggerDestroyAnimation(destroyedAtoms)
    }, 1200)
  }, [triggerDestroyAnimation])

  const triggerEffectFlash = useCallback((player, cellIndex, r, c) => {
    playEffectSound()
    setEffectFlashAtom({ player, cellIndex, r, c })
    setTimeout(() => setEffectFlashAtom(null), 320)
  }, [])

  const triggerDamagePopup = useCallback((player, cellIndex, value) => {
    if (damagePopupTimeoutRef.current) clearTimeout(damagePopupTimeoutRef.current)
    setDamagePopup({ player, cellIndex, value })
    damagePopupTimeoutRef.current = setTimeout(() => {
      setDamagePopup(null)
      damagePopupTimeoutRef.current = null
    }, 1200)
  }, [])

  // AI 对战模式：轮到 P1（AI）时自动执行排布与进攻（分步显示排布、高亮攻击目标、破坏动画）。必须在 resetAttackState、triggerDestroyAnimation、triggerEffectFlash 之后定义。
  // 排布阶段用 ref 驱动链式 timeout，避免依赖 effect 重跑导致超时被清理或漏调度。
  useEffect(() => {
    const isAI = state.currentPlayer === 1 && (state.config?.gameMode === 'ai_level1' || state.config?.gameMode === 'ai_level2' || state.config?.gameMode === 'ai_level3')
    if (!inGame || !isAI) return
    const speedMult = Math.max(0.25, Math.min(4, Number(state.config?.aiSpeedMultiplier) || 1))
    const placeStepDelay = Math.round(400 * speedMult)
    const attackHighlightMs = Math.round(750 * speedMult)
    const attackThenNextDelay = Math.round((400 + 380) * speedMult)
    const level2FirstActionDelay = Math.round(500 * speedMult)
    const isLevel2 = state.config?.gameMode === 'ai_level2'

    if (state.phase === PHASE_PLACE) {
      const runStep = isLevel2 ? runAIPlaceStepLevel2 : runAIPlaceStep
      const scheduleNextPlaceStep = () => {
        aiPlaceTimeoutRef.current = setTimeout(() => {
          setState((prev) => {
            if (prev.currentPlayer !== 1 || prev.phase !== PHASE_PLACE) return prev
            const done = runStep(prev).done
            if (!done) scheduleNextPlaceStep()
            return { ...prev }
          })
        }, placeStepDelay)
      }
      scheduleNextPlaceStep()
      return () => {
        if (aiPlaceTimeoutRef.current) {
          clearTimeout(aiPlaceTimeoutRef.current)
          aiPlaceTimeoutRef.current = null
        }
      }
    }

    if (state.phase === PHASE_ACTION && !isLevel2) {
      const options = getAIAttackOptions(state)
      const hasOptions = options.length > 0
      if (hasOptions) {
        const [myCi, enCi] = options[Math.floor(Math.random() * options.length)]
        setAttackMyCell([1, myCi])
        setAttackEnemyCell([0, enCi])
        setActionSubstate('attack_confirm')
        const t = setTimeout(() => {
          setState((prev) => {
            if (prev.currentPlayer !== 1 || prev.phase !== PHASE_ACTION) return prev
            const ret = runOneAIAttack(prev, [myCi, enCi])
            aiAttackDestroyedRef.current = ret.destroyedAtoms
            aiAttackDamageRef.current = ret.damage ?? 1
            aiPendingAttackLogsRef.current.push({
              myCi,
              enCi,
              dmg: ret.damage ?? 1,
              destroyedCount: ret.destroyedAtoms?.length ?? 0,
              destroyedAtoms: ret.destroyedAtoms ?? [],
            })
            return { ...prev }
          })
          setTimeout(() => {
            const pending = aiPendingAttackLogsRef.current
            aiPendingAttackLogsRef.current = []
            resetAttackState()
            const last = pending[pending.length - 1]
            if (last?.destroyedAtoms?.length) triggerAttackDestroyAnimation(last.destroyedAtoms)
            aiAttackDestroyedRef.current = null
            aiAttackDamageRef.current = null
            const seen = new Set()
            let uniqueDmg = 0
            for (const e of pending) {
              if (e.dmg == null) continue
              const key = `${e.myCi},${e.enCi},${e.dmg},${e.destroyedCount}`
              if (seen.has(key)) continue
              seen.add(key)
              uniqueDmg += e.dmg ?? 0
              pushGameLog({ type: 'attack', player: 1, text: `P1（AI）用格子${e.myCi} 进攻 P0 格子${e.enCi}，造成 ${e.dmg} 点伤害` })
              if (e.destroyedCount > 0) pushGameLog({ type: 'destroy', player: 0, text: `P0 格子${e.enCi} 被破坏 ${e.destroyedCount} 个黑原子` })
            }
            const lastDmg = last?.dmg
            if (lastDmg != null) {
              setAttackMessage(seen.size > 1 ? `共 ${seen.size} 次进攻，造成 ${uniqueDmg} 点伤害` : `造成 ${lastDmg} 点伤害`)
              triggerDamagePopup(0, last.enCi, lastDmg)
            }
          }, 0)
        }, attackHighlightMs)
        return () => clearTimeout(t)
      }
      resetAttackState()
      const t = setTimeout(() => {
        setState((prev) => {
          if (prev.currentPlayer !== 1 || prev.phase !== PHASE_ACTION) return prev
          if (prev.config?.gameMode === 'ai_level3') applyLevel3Proliferation(prev)
          runAIEndTurn(prev)
          return { ...prev, currentPlayer: 0, phase: PHASE_PLACE }
        })
      }, attackThenNextDelay)
      return () => clearTimeout(t)
    }

    if (state.phase === PHASE_ACTION && isLevel2) {
      const runNextLevel2Action = () => {
        aiLevel2ContinueRef.current = false
        setState((prev) => {
          if (prev.currentPlayer !== 1 || prev.phase !== PHASE_ACTION) return prev
          const redRet = runAIRedEffect(prev)
          if (redRet.executed) {
            aiLevel2ContinueRef.current = true
            aiAttackDestroyedRef.current = redRet.destroyedAtoms ?? []
            return { ...prev }
          }
          const blueOptsBefore = prev.cells[1].flatMap((cell, ci) =>
            cell.allAtoms().filter(([, col]) => col === 'blue').map(([[r, c]]) => ({ ci, r, c }))
          )
          const blueRet = runAIBlueEffect(prev)
          if (blueRet.executed && blueOptsBefore.length > 0) {
            aiLevel2ContinueRef.current = true
            const o = blueOptsBefore[0]
            aiBlueFlashRef.current = { player: 1, cellIndex: o.ci, r: o.r, c: o.c }
            return { ...prev }
          }
          aiBlueFlashRef.current = null
          const attackOpts = getAIAttackOptions(prev)
          if (attackOpts.length > 0) {
            const [myCi, enCi] = attackOpts[Math.floor(Math.random() * attackOpts.length)]
            aiLevel2ContinueRef.current = true
            aiLevel2AttackChoiceRef.current = [myCi, enCi]
            return { ...prev }
          }
          runAIEndTurn(prev)
          return { ...prev, currentPlayer: 0, phase: PHASE_PLACE }
        })
        setTimeout(() => {
          const redDestroyed = aiAttackDestroyedRef.current?.length ?? 0
          resetAttackState()
          if (aiAttackDestroyedRef.current?.length) triggerRedEffectDestroyAnimation(aiAttackDestroyedRef.current)
          aiAttackDestroyedRef.current = null
          if (redDestroyed > 0) pushGameLog({ type: 'effect', player: 1, text: `P1（AI）发动红效果，P0 被破坏 ${redDestroyed} 个黑原子` })
          if (aiBlueFlashRef.current) {
            const { player, cellIndex, r, c } = aiBlueFlashRef.current
            triggerEffectFlash(player, cellIndex, r, c)
            pushGameLog({ type: 'effect', player: 1, text: `P1（AI）发动蓝效果（格子${cellIndex}）` })
            aiBlueFlashRef.current = null
          }
          if (aiLevel2AttackChoiceRef.current) {
            const [myCi, enCi] = aiLevel2AttackChoiceRef.current
            aiLevel2AttackChoiceRef.current = null
            setAttackMyCell([1, myCi])
            setAttackEnemyCell([0, enCi])
            setActionSubstate('attack_confirm')
            aiLevel2ActionTimeoutRef.current = setTimeout(() => {
              setState((prev) => {
                if (prev.currentPlayer !== 1 || prev.phase !== PHASE_ACTION) return prev
                const ret = runOneAIAttack(prev, [myCi, enCi])
                aiAttackDestroyedRef.current = ret.destroyedAtoms ?? []
                aiAttackDamageRef.current = ret.damage ?? 1
                aiPendingAttackLogsRef.current.push({
                  myCi,
                  enCi,
                  dmg: ret.damage ?? 1,
                  destroyedCount: ret.destroyedAtoms?.length ?? 0,
                  destroyedAtoms: ret.destroyedAtoms ?? [],
                })
                return { ...prev }
              })
              setTimeout(() => {
                const pending = aiPendingAttackLogsRef.current
                aiPendingAttackLogsRef.current = []
                resetAttackState()
                const last = pending[pending.length - 1]
                if (last?.destroyedAtoms?.length) triggerAttackDestroyAnimation(last.destroyedAtoms)
                aiAttackDestroyedRef.current = null
                aiAttackDamageRef.current = null
                const seen = new Set()
                let uniqueDmg = 0
                for (const e of pending) {
                  if (e.dmg == null) continue
                  const key = `${e.myCi},${e.enCi},${e.dmg},${e.destroyedCount}`
                  if (seen.has(key)) continue
                  seen.add(key)
                  uniqueDmg += e.dmg ?? 0
                  pushGameLog({ type: 'attack', player: 1, text: `P1（AI）用格子${e.myCi} 进攻 P0 格子${e.enCi}，造成 ${e.dmg} 点伤害` })
                  if (e.destroyedCount > 0) pushGameLog({ type: 'destroy', player: 0, text: `P0 格子${e.enCi} 被破坏 ${e.destroyedCount} 个黑原子` })
                }
                const lastDmg = last?.dmg
                if (lastDmg != null) {
                  setAttackMessage(seen.size > 1 ? `共 ${seen.size} 次进攻，造成 ${uniqueDmg} 点伤害` : `造成 ${lastDmg} 点伤害`)
                  triggerDamagePopup(0, last.enCi, lastDmg)
                }
                aiLevel2ActionTimeoutRef.current = setTimeout(runNextLevel2Action, attackHighlightMs)
              }, 0)
            }, attackHighlightMs)
            return
          }
          if (aiLevel2ContinueRef.current) {
            aiLevel2ActionTimeoutRef.current = setTimeout(runNextLevel2Action, attackHighlightMs)
          }
        }, 0)
      }
      aiLevel2ActionTimeoutRef.current = setTimeout(runNextLevel2Action, level2FirstActionDelay)
      return () => {
        if (aiLevel2ActionTimeoutRef.current) {
          clearTimeout(aiLevel2ActionTimeoutRef.current)
          aiLevel2ActionTimeoutRef.current = null
        }
      }
    }
  }, [inGame, state.currentPlayer, state.phase, state.config?.gameMode, state.turnAttackUsed, resetAttackState, triggerDestroyAnimation, triggerRedEffectDestroyAnimation, triggerAttackDestroyAnimation, triggerEffectFlash, triggerDamagePopup])

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
      pushGameLog({ type: 'effect', player, text: `P${player} 发动蓝效果（格子${cellIndex}），相邻黑原子本回合内受保护` })
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
        pushGameLog({ type: 'effect', player, text: `P${player} 发动绿效果（格子${cellIndex}），该格点变为黑原子` })
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
        pushGameLog({ type: 'effect', player, text: `P${player} 发动黄效果（格子${cellIndex}），相邻黑原子下回合优先被破坏` })
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
        pushGameLog({ type: 'effect', player, text: `P${player} 发动灰效果（格子${cellIndex}），周围格点本回合内无法发动其他点击效果` })
      }
      return
    }
  }, [effectPendingAtom, updateState, triggerEffectFlash, pushGameLog])

  const handleEffectCancel = useCallback(() => {
    setEffectPendingAtom(null)
  }, [])

  const handleAttackConfirm = useCallback(() => {
    if (!attackMyCell || !attackEnemyCell) return
    const next = { ...state }
    const ret = handleAttackEnemyCell(next, attackMyCell, attackEnemyCell)
    setState(next)
    setActionSubstate(ret.substate)
    if (ret.damage != null && (ret.substate === 'idle' || ret.substate === 'defender_choose_connected')) {
      triggerDamagePopup(attackEnemyCell[0], attackEnemyCell[1], ret.damage)
    }
    if (ret.substate === 'idle' && ret.attackConsumed !== false && ret.damage != null) {
      setAttackMessage(`进攻完成，造成 ${ret.damage} 点伤害`)
    } else {
      setAttackMessage(ret.message ?? '')
    }
    if (ret.destroyedAtoms?.length) triggerAttackDestroyAnimation(ret.destroyedAtoms)
    if (ret.damage != null && (ret.substate === 'idle' || ret.substate === 'defender_choose_connected')) {
      pushGameLog({ type: 'attack', player: attackMyCell[0], text: `P${attackMyCell[0]} 用格子${attackMyCell[1]} 进攻 P${attackEnemyCell[0]} 格子${attackEnemyCell[1]}，造成 ${ret.damage} 点伤害` })
      if (ret.destroyedAtoms?.length) {
        pushGameLog({ type: 'destroy', player: attackEnemyCell[0], text: `P${attackEnemyCell[0]} 格子${attackEnemyCell[1]} 被破坏 ${ret.destroyedAtoms.length} 个黑原子` })
      }
    }
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
      if (cc.defender === 1 && (state.config?.gameMode === 'ai_level1' || state.config?.gameMode === 'ai_level2' || state.config?.gameMode === 'ai_level3')) {
        updateState((s) => {
          const cell = s.cells[cc.defender][cc.cellIndex]
          const blackPoints = cell.blackPoints()
          const idx = cc.components
            .map((comp) => comp.filter((k) => blackPoints.has(k)).length)
            .reduce((best, count, i) => (count > best.count ? { idx: i, count } : best), { idx: 0, count: -1 }).idx
          applyConnectivityChoice(cell, cc.type, cc.components[idx])
          s.turnAttackUsed++
          clearCellsWithNoBlack(s, cc.defender)
          s.currentPlayer = 0
          s.attackedCellsThisTurn = s.attackedCellsThisTurn ?? []
          if (attackMyCell) s.attackedCellsThisTurn.push([attackMyCell[0], attackMyCell[1]])
          s.attackedEnemyCellIndicesThisTurn = s.attackedEnemyCellIndicesThisTurn ?? []
          s.attackedEnemyCellIndicesThisTurn.push(cc.cellIndex)
        })
        resetAttackState()
        setAttackMessage(`进攻完成（AI 格已自动保留黑原子最多的连通子集），造成 ${ret.damage ?? 1} 点伤害`)
      } else {
        setConnectivityChoice(cc)
        setPendingAction(ret.pendingAction ?? null)
        setAttackMessage(
          cc.type === 'all'
            ? '步骤(1)：该格不连通，请选择要保留的连通子集'
            : '步骤(2)：多个黑连通子集，请选择要保留的一个'
        )
        updateState((s) => { s.currentPlayer = cc.defender })
      }
    }
  }, [state, attackMyCell, attackEnemyCell, updateState, resetAttackState, triggerDestroyAnimation, triggerAttackDestroyAnimation, triggerDamagePopup, pushGameLog])

  const handleAttackCancel = useCallback(() => {
    setAttackEnemyCell(null)
    setAttackMyCell(null)
    setActionSubstate('idle')
    setAttackMessage('')
  }, [])

  const handleUndo = useCallback(() => {
    updateState((s) => undoLastPlacement(s))
    pushGameLog({ type: 'undo', player: state.currentPlayer, text: `P${state.currentPlayer} 撤回了上一步放置` })
  }, [updateState, pushGameLog, state.currentPlayer])

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
          setAttackMessage('进攻完成，造成 1 点伤害')
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
            if (result?.destroyedAtoms?.length) triggerRedEffectDestroyAnimation(result.destroyedAtoms)
            if (result && typeof result === 'object' && result.ok) {
              if (result.connectivityChoice) {
                const cc = result.connectivityChoice
                if (cc.defender === 1 && (state.config?.gameMode === 'ai_level1' || state.config?.gameMode === 'ai_level2' || state.config?.gameMode === 'ai_level3')) {
                  updateState((s) => {
                    const cell = s.cells[cc.defender][cc.cellIndex]
                    const blackPoints = cell.blackPoints()
                    const idx = cc.components
                      .map((comp) => comp.filter((k) => blackPoints.has(k)).length)
                      .reduce((best, count, i) => (count > best.count ? { idx: i, count } : best), { idx: 0, count: -1 }).idx
                    applyConnectivityChoice(cell, cc.type, cc.components[idx])
                    s.redEffectTargetCellIndicesThisTurn = s.redEffectTargetCellIndicesThisTurn ?? []
                    s.redEffectTargetCellIndicesThisTurn.push(cc.cellIndex)
                  })
                  setAttackMessage('红效果：已随机破坏对方黑原子（AI 格已自动保留黑原子最多的连通子集）')
                } else {
                  setConnectivityChoice(cc)
                  setPendingAction('red_effect')
                  setAttackMessage(
                    cc.type === 'all'
                      ? '步骤(1)：该格不连通，请选择要保留的连通子集'
                      : '步骤(2)：多个黑连通子集，请选择要保留的一个'
                  )
                  updateState((s) => { s.currentPlayer = cc.defender })
                }
              } else {
                updateState((s) => {
                  s.redEffectTargetCellIndicesThisTurn = s.redEffectTargetCellIndicesThisTurn ?? []
                  s.redEffectTargetCellIndicesThisTurn.push(cellIndex)
                })
                setAttackMessage('红效果：已随机破坏对方黑原子')
                const n = result?.destroyedAtoms?.length ?? 0
                pushGameLog({ type: 'effect', player: src.player, text: `P${src.player} 对 P${opp} 格子${cellIndex} 发动红效果${n ? `，破坏 ${n} 个黑原子` : ''}` })
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
          const attackableByOrder = getAttackableEnemyCellIndices(state)
          const attackerCell = state.cells[attackMyCell[0]][attackMyCell[1]]
          const attackable = attackableByOrder.filter(
            (i) => attackPower(attackerCell) > defensePower(state.cells[opp][i])
          )
          if (player === opp) {
            if (!attackableByOrder.includes(cellIndex)) {
              setAttackMessage('须先进攻黄原子数更多的对方格子')
              return
            }
            if (!attackable.includes(cellIndex)) {
              setAttackMessage('该格防御力不低于己方攻击力，无法进攻')
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
      const placedTotal = placementCountThisTurn(state)
      const atPlaceLimit = placedTotal >= (state.turnPlaceLimit ?? 0)
      if (atPlaceLimit) {
        setAttackMessage('本回合放置数已达上限，不能再放置任何原子')
        return
      }
      if (batchMode) {
        const n = Math.min(Math.max(0, Math.floor(batchCount)), maxBatch)
        if (n <= 0) return
        lastBatchPlaceRef.current = []
        updateState((s) => {
          const placed = placementCountThisTurn(s)
          const remaining = (s.turnPlaceLimit ?? 0) - placed
          if (remaining <= 0) return
          const nCapped = Math.min(n, remaining)
          const [ok, msg, placements] = batchPlaceOnCell(s, cellIndex, nCapped, viewCenter)
          if (!ok || !placements?.length) {
            if (!ok) console.warn(msg)
            return
          }
          const player = s.currentPlayer
          const slotLeft = (s.turnPlaceLimit ?? 0) - placed
          const allowed = Math.min(placements.length, slotLeft)
          if (allowed <= 0) return
          const used = placements.slice(0, allowed)
          // 计数统一由 placementHistory.length 提供，见 updateState 内同步
          s.pools = s.pools.map((p, i) =>
            i === player ? { ...p, [ATOM_BLACK]: (p[ATOM_BLACK] ?? 0) - used.length } : p
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
          for (const [r, c] of used) clonedCell.place(r, c, ATOM_BLACK)
          s.cells = s.cells.map((row, pi) =>
            row.map((c, ci) => (pi === player && ci === cellIndex ? clonedCell : c))
          )
          s.placementHistory = [...(s.placementHistory ?? [])]
          for (const [r, c] of used) {
            s.placementHistory.push({ player, cellIndex, r, c, color: ATOM_BLACK })
          }
          const arr = lastBatchPlaceRef.current
          if (Array.isArray(arr)) arr.push({ player, cellIndex, n: used.length })
        })
        const batchList = lastBatchPlaceRef.current
        if (Array.isArray(batchList) && batchList.length > 0) {
          const total = batchList.reduce((s, e) => s + e.n, 0)
          const first = batchList[0]
          pushGameLog({ type: 'place', player: first.player, text: `P${first.player} 在格子${first.cellIndex} 放置 ${total} 个黑原子` })
          lastBatchPlaceRef.current = null
        }
      } else if (selectedColor && r != null && c != null) {
        // 单次放置（非 batch）：不可变更新——不突变 prev，返回全新 next，确保 React 收到新引用、HUD 会更新
        const targetPlayer = selectedColor === 'white' || selectedColor === 'gray' ? player : state.currentPlayer
        lastSinglePlaceResultRef.current = null
        flushSync(() => {
          setState((prev) => {
            const [ok] = validatePlace(prev, cellIndex, r, c, selectedColor, (selectedColor === 'white' || selectedColor === 'gray') ? { targetPlayer } : undefined)
            if (!ok) return prev
            const cell = prev.cells[targetPlayer][cellIndex]
            const gridConfig = { rows: cell.grid.rows, cols: cell.grid.cols, centerR: cell.grid.centerR, centerC: cell.grid.centerC, hexRadius: cell.grid.hexRadius }
            const clonedCell = Cell.fromJSON(cell.toJSON(), gridConfig)
            let result
            if (selectedColor === 'white') {
              clonedCell.remove(r, c)
              result = { applied: true, connectivityChoice: getConnectivityChoice(clonedCell), defender: targetPlayer, cellIndex }
            } else {
              clonedCell.place(r, c, selectedColor)
              result = true
            }
            lastSinglePlaceResultRef.current = result
            const newPools = prev.pools.map((p, i) =>
              i === prev.currentPlayer ? { ...p, [selectedColor]: (p[selectedColor] ?? 0) - 1 } : p
            )
            const newCells = prev.cells.map((row, pi) =>
              pi === targetPlayer ? row.map((c, ci) => (ci === cellIndex ? clonedCell : c)) : row
            )
            const newEntry = { player: prev.currentPlayer, targetPlayer, cellIndex, r, c, color: selectedColor }
            const newHistory = [...(prev.placementHistory ?? []), newEntry]
            const next = {
              ...prev,
              cells: newCells,
              pools: newPools,
              placementHistory: newHistory,
              turnPlacedCount: newHistory.length,
            }
            if (selectedColor === 'white' && result && typeof result === 'object' && result.connectivityChoice) {
              const choice = result.connectivityChoice
              const hasMulti = Array.isArray(choice.components) && choice.components.length > 0
              if (hasMulti && result.defender === 1 && (prev.config?.gameMode === 'ai_level1' || prev.config?.gameMode === 'ai_level2' || prev.config?.gameMode === 'ai_level3')) {
                // AI 方被白原子湮灭产生多连通子集：在构造 next 时直接保留黑原子最多的子集，不弹窗、不交回合给 AI
                const cellToApply = newCells[result.defender][result.cellIndex]
                const blackPoints = cellToApply.blackPoints()
                const idx = choice.components
                  .map((comp) => comp.filter((k) => blackPoints.has(k)).length)
                  .reduce((best, count, i) => (count > best.count ? { idx: i, count } : best), { idx: 0, count: -1 }).idx
                applyConnectivityChoice(cellToApply, choice.type, choice.components[idx])
              } else if (hasMulti) {
                next.currentPlayer = result.defender !== prev.currentPlayer ? result.defender : prev.currentPlayer
                next.pendingConnectivityChoice = {
                  defender: result.defender,
                  cellIndex: result.cellIndex,
                  type: choice.type,
                  components: choice.components,
                  placer: prev.currentPlayer,
                }
                next.pendingConnectivityAction = 'white_place'
                whitePlacePendingInUpdaterRef.current = next.pendingConnectivityChoice
              }
            } else if (selectedColor === 'white' && (!result || result === false) && whitePlacePendingInUpdaterRef.current) {
              next.pendingConnectivityChoice = whitePlacePendingInUpdaterRef.current
              next.pendingConnectivityAction = 'white_place'
            }
            return next
          })
          setPlaceCountTick((t) => t + 1)
        })
        const colorLabel = selectedColor === 'black' ? '黑' : selectedColor === 'red' ? '红' : selectedColor === 'blue' ? '蓝' : selectedColor === 'green' ? '绿' : selectedColor === 'yellow' ? '黄' : selectedColor === 'purple' ? '紫' : selectedColor === 'white' ? '白' : selectedColor === 'gray' ? '灰' : selectedColor
        const targetLabel = (selectedColor === 'white' || selectedColor === 'gray') && player !== state.currentPlayer ? `（对方格子${cellIndex}）` : `（己方格子${cellIndex}）`
        pushGameLog({ type: 'place', player: state.currentPlayer, text: `P${state.currentPlayer} 放置${colorLabel}原子于格子${cellIndex} ${targetLabel}`, detail: `格点 (${r},${c})` })
        const placeResult = lastSinglePlaceResultRef.current
        if (selectedColor === 'white' && placeResult && typeof placeResult === 'object') {
          const choice = placeResult.connectivityChoice
          const hasComponents = choice && Array.isArray(choice.components) && choice.components.length > 0
          // AI 方多连通子集已在 setState 内自动保留黑最多的子集，不弹窗
          if (hasComponents && !(placeResult.defender === 1 && (state.config?.gameMode === 'ai_level1' || state.config?.gameMode === 'ai_level2'))) {
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
      pushGameLog,
    ]
  )

  if (!inGame) {
    return (
      <StartScreen
        onStart={handleStartGame}
        defaultConfig={state?.config ? { ...state.config, gameMode: 'normal' } : undefined}
      />
    )
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
          <div className="flex items-center gap-4 flex-wrap">
            {state.config?.synthesis !== false && (state.config?.gameMode === 'normal' || state.currentPlayer === 0) && (
              <button
                onClick={() => setShowSynthesisPanel(true)}
                className="px-3 py-1 rounded text-sm bg-violet-700 hover:bg-violet-600 text-white"
              >
                原子合成
              </button>
            )}
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
          redEffectHighlightAtoms={redEffectHighlightAtoms}
          attackHighlightAtoms={attackHighlightAtoms}
          damagePopup={damagePopup}
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
                    {effectiveCC.components.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => handleConnectivityChoice(i)}
                        className="px-2 py-1.5 bg-gray-600 hover:bg-gray-500 rounded text-xs font-medium flex items-center gap-1.5"
                      >
                        <span className="w-4 h-4 rounded-full bg-white/30 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                        保留子集 {i + 1}
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
        placementCount={placementCountThisTurn(state)}
        placeCountTick={placeCountTick}
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
        onUndo={handleUndo}
        gameLog={gameLog}
        onDirectAttackConfirm={() => {
          if (attackMyCell) {
            const defender = 1 - attackMyCell[0]
            const attackerCell = state.cells[attackMyCell[0]][attackMyCell[1]]
            const dmg = resolveDirectAttack(attackerCell)
            updateState((s) => {
              applyDirectAttack(s, s.cells[attackMyCell[0]][attackMyCell[1]])
              s.attackedCellsThisTurn = s.attackedCellsThisTurn ?? []
              s.attackedCellsThisTurn.push([attackMyCell[0], attackMyCell[1]])
              return null
            })
            setAttackMessage(`直接攻击，造成 ${dmg} 点伤害`)
            triggerDamagePopup(defender, 0, dmg)
            pushGameLog({ type: 'attack', player: attackMyCell[0], text: `P${attackMyCell[0]} 直接攻击 P${defender}，造成 ${dmg} 点伤害` })
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
      {showSynthesisPanel && state.config?.synthesis !== false && (state.config?.gameMode === 'normal' || state.currentPlayer === 0) && (
        <SynthesisPanel
          state={state}
          synthesisTray={synthesisTray}
          setSynthesisTray={setSynthesisTray}
          onClose={() => setShowSynthesisPanel(false)}
          updateState={updateState}
          matchRecipe={matchRecipe}
          applySynthesis={applySynthesis}
        />
      )}
    </div>
  )
}

function SynthesisPanel({ state, synthesisTray, setSynthesisTray, onClose, updateState, matchRecipe, applySynthesis }) {
  const p = pool(state, state.currentPlayer)
  const trayTotal = (synthesisTray.black ?? 0) + (synthesisTray.red ?? 0) + (synthesisTray.blue ?? 0) + (synthesisTray.yellow ?? 0) + (synthesisTray.white ?? 0)
  const canAdd = (color) => (p[color] ?? 0) > (synthesisTray[color] ?? 0) && trayTotal < 3
  const recipe = matchRecipe(synthesisTray)
  const canSynthesize = recipe && Object.keys(recipe.in).every((c) => (p[c] ?? 0) >= (recipe.in[c] ?? 0))
  const trayColors = ['black', 'red', 'blue', 'yellow', 'white']
  const colorLabel = (c) => ({ black: '黑', red: '红', blue: '蓝', yellow: '黄', white: '白' }[c])
  const colorBg = (c) => ({ black: 'bg-gray-700', red: 'bg-red-700', blue: 'bg-blue-700', yellow: 'bg-yellow-600', white: 'bg-gray-200 text-gray-800' }[c])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-gray-800 rounded-xl border border-gray-600 p-5 shadow-xl max-w-sm w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-amber-400">原子合成</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white px-2 py-1 rounded">关闭</button>
        </div>
        <p className="text-xs text-gray-400 mb-2">将需要合成的原子放入下方（最多3个），匹配配方后点击合成。</p>
        <div className="mb-3 p-2 rounded bg-gray-700/60 min-h-10 flex flex-wrap items-center gap-1">
          {trayColors.flatMap((c) =>
            Array.from({ length: synthesisTray[c] ?? 0 }, (_, i) => (
              <span key={`${c}-${i}`} className={`px-2 py-0.5 rounded text-xs ${colorBg(c)} ${c !== 'white' ? 'text-white' : ''}`}>
                {colorLabel(c)}
              </span>
            ))
          )}
          {trayTotal === 0 && <span className="text-gray-500 text-sm">空</span>}
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {trayColors.map((c) => (
            <button
              key={c}
              disabled={!canAdd(c)}
              onClick={() => setSynthesisTray((t) => ({ ...t, [c]: (t[c] ?? 0) + 1 }))}
              className={`px-3 py-1 rounded text-sm ${canAdd(c) ? colorBg(c) + ' hover:opacity-90 ' + (c !== 'white' ? 'text-white' : '') : 'bg-gray-600 text-gray-500 cursor-not-allowed'}`}
            >
              +{colorLabel(c)}
            </button>
          ))}
        </div>
        {recipe && (
          <p className="text-xs text-green-400 mb-2">
            → {Object.entries(recipe.out).map(([col, n]) => `${col === 'purple' ? '紫' : col === 'green' ? '绿' : col === 'white' ? '白' : '灰'}×${n}`).join(' ')}
          </p>
        )}
        {trayTotal > 0 && !recipe && <p className="text-xs text-amber-400 mb-2">不匹配任何配方</p>}
        <div className="flex gap-2">
          <button
            disabled={!canSynthesize}
            onClick={() => {
              if (!recipe || !canSynthesize) return
              updateState((s) => {
                const newPool = { ...s.pools[s.currentPlayer] }
                applySynthesis(newPool, recipe)
                s.pools = s.pools.map((p, i) => (i === s.currentPlayer ? newPool : p))
              })
              setSynthesisTray({ black: 0, red: 0, blue: 0, yellow: 0, white: 0 })
            }}
            className={`px-4 py-2 rounded text-sm font-medium ${canSynthesize ? 'bg-violet-600 hover:bg-violet-500 text-white' : 'bg-gray-600 text-gray-500 cursor-not-allowed'}`}
          >
            合成
          </button>
          <button
            onClick={() => setSynthesisTray({ black: 0, red: 0, blue: 0, yellow: 0, white: 0 })}
            className="px-4 py-2 rounded text-sm bg-gray-600 hover:bg-gray-500"
          >
            清空
          </button>
        </div>
      </div>
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
