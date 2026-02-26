import { useState, useRef, useEffect } from 'react'
import React from 'react'

/** 将「造成 N 点伤害」「被破坏 N 个」「破坏 N 个」中的数字用红色高亮，返回 React 节点数组 */
function highlightDamageAndDestroy(text) {
  if (!text || typeof text !== 'string') return [text]
  const parts = []
  const re = /(造成 )(\d+)( 点伤害)|(被破坏 |破坏 )(\d+)( 个)/g
  let lastEnd = 0
  let key = 0
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastEnd) parts.push(<React.Fragment key={key++}>{text.slice(lastEnd, m.index)}</React.Fragment>)
    if (m[2]) {
      parts.push(<React.Fragment key={key++}>{m[1]}</React.Fragment>, <span key={key++} className="text-red-400 font-medium">{m[2]}</span>, <React.Fragment key={key++}>{m[3]}</React.Fragment>)
    } else {
      parts.push(<React.Fragment key={key++}>{m[4]}</React.Fragment>, <span key={key++} className="text-red-400 font-medium">{m[5]}</span>, <React.Fragment key={key++}>{m[6]}</React.Fragment>)
    }
    lastEnd = re.lastIndex
  }
  if (lastEnd < text.length) parts.push(<React.Fragment key={key++}>{text.slice(lastEnd)}</React.Fragment>)
  return parts.length ? parts : [text]
}
import { winner, placementCountThisTurn } from '../game/state.js'
import { endPlacePhase, endTurn, startTurnDefault, undoLastPlacement, canUndoPlacement } from '../game/turn.js'
import { applyGreenEndOfTurn } from '../game/combat.js'
import { PHASE_CONFIRM, PHASE_PLACE, PHASE_ACTION } from '../game/config.js'
import { RULES_OVERLAY_LINES } from './rulesOverlay.js'

export default function HUD({
  state,
  setState,
  updateState,
  placeCountTick = 0,
  actionSubstate,
  attackMyCell,
  attackEnemyCell,
  onAttackConfirm,
  onAttackCancel,
  onAttackMyCellCancel,
  onUndo,
  onDirectAttackConfirm,
  onDirectAttackCancel,
  attackMessage,
  connectivityChoice,
  onConnectivityChoice,
  effectPendingAtom,
  onEffectConfirm,
  onEffectCancel,
  gameLog = [],
}) {
  const [showRules, setShowRules] = useState(false)
  const [showEndPlaceConfirm, setShowEndPlaceConfirm] = useState(false)
  const [showEndTurnConfirm, setShowEndTurnConfirm] = useState(false)
  const gameLogScrollRef = useRef(null)
  useEffect(() => {
    if (gameLogScrollRef.current) gameLogScrollRef.current.scrollTop = gameLogScrollRef.current.scrollHeight
  }, [gameLog.length])
  // 本回合已放置总数（黑/红/蓝/绿/黄/紫/白/灰合计），唯一来源为 placementHistory.length；placeCountTick 变化时强制重读
  const placementCount = (state.placementHistory ?? []).length
  const cur = state.currentPlayer
  const w = winner(state)

  if (showRules) {
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-4">
        <div className="bg-gray-900 rounded-lg p-6 max-w-2xl max-h-[80vh] overflow-auto">
          <h3 className="text-lg font-semibold text-amber-400 mb-4">规则摘要</h3>
          <div className="text-sm text-gray-300 space-y-1">
            {RULES_OVERLAY_LINES.map((line, i) => (
              <p key={i} className={line.startsWith('【') ? 'font-medium text-amber-300 mt-2' : ''}>
                {line || '\u00A0'}
              </p>
            ))}
          </div>
          <button
            onClick={() => setShowRules(false)}
            className="mt-4 px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded text-sm"
          >
            关闭
          </button>
        </div>
      </div>
    )
  }

  if (w != null) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 py-4 px-4 text-center">
        <p className="text-xl text-amber-400">P{w} 获胜</p>
      </div>
    )
  }

  const handleEndPlace = () => {
    setShowEndPlaceConfirm(false)
    updateState((s) => {
      endPlacePhase(s)
    })
  }

  const handleEndTurn = () => {
    setShowEndTurnConfirm(false)
    updateState((s) => {
      applyGreenEndOfTurn(s, s.currentPlayer)
      endTurn(s)
      startTurnDefault(s)
    })
  }

  return (
    <>
      {showEndPlaceConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-lg p-4 border border-amber-500/60 shadow-xl max-w-xs w-full">
            <p className="text-gray-200 mb-4">确认结束排布？</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowEndPlaceConfirm(false)}
                className="px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded text-sm"
              >
                取消
              </button>
              <button
                onClick={handleEndPlace}
                className="px-3 py-2 bg-amber-600 hover:bg-amber-500 rounded text-sm"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
      {showEndTurnConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-lg p-4 border border-sky-500/60 shadow-xl max-w-xs w-full">
            <p className="text-gray-200 mb-4">确认结束回合？</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowEndTurnConfirm(false)}
                className="px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded text-sm"
              >
                取消
              </button>
              <button
                onClick={handleEndTurn}
                className="px-3 py-2 bg-sky-600 hover:bg-sky-500 rounded text-sm"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    <div className="fixed right-0 top-24 bottom-20 flex z-20">
      <div className="w-56 flex flex-col border-l border-gray-700 bg-gray-900/95 overflow-hidden">
        <p className="text-xs font-medium text-amber-400 px-2 py-2 border-b border-gray-600 shrink-0">战局信息</p>
        <div ref={gameLogScrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-1 px-2 space-y-1">
          {gameLog.length === 0 ? (
            <p className="text-xs text-gray-500">暂无记录</p>
          ) : (
            gameLog.map((entry, index) => (
              <div key={entry.id} className="leading-tight">
                {entry.turnBoundary && index > 0 && (
                  <div className="border-t border-red-500/70 border-dashed my-1.5" aria-hidden />
                )}
                <div className="text-xs text-gray-300">
                  <span className={entry.player === 0 ? 'text-amber-300' : entry.player === 1 ? 'text-sky-300' : ''}>
                    {highlightDamageAndDestroy(entry.text)}
                  </span>
                </div>
                {entry.detail && <span className="block text-gray-500 mt-0.5 text-xs">{entry.detail}</span>}
              </div>
            ))
          )}
        </div>
      </div>
      <div className="w-28 flex flex-col gap-2 py-4 pr-2 pl-2 bg-gray-900/90 border-l border-gray-700">
      <p className="text-xs text-gray-400 px-1 pb-2 border-b border-gray-600">
        {state.currentPlayer === 1 && (state.config?.gameMode === 'ai_level1' || state.config?.gameMode === 'ai_level2') &&
          (state.phase === PHASE_PLACE ? 'AI 回合 · 排布中…' : 'AI 回合 · 进攻中…')}
        {!(state.currentPlayer === 1 && (state.config?.gameMode === 'ai_level1' || state.config?.gameMode === 'ai_level2')) && state.phase === PHASE_PLACE && (
          <span key={`place-${placeCountTick}`}>排布 · 已放 {Math.min(state.turnPlaceLimit ?? 0, placementCount)}/{state.turnPlaceLimit ?? 0}（所有颜色合计）</span>
        )}
        {!(state.currentPlayer === 1 && (state.config?.gameMode === 'ai_level1' || state.config?.gameMode === 'ai_level2')) && state.phase === PHASE_ACTION &&
          (attackMessage || `动作 · 进攻 ${state.turnAttackUsed}/${state.turnAttackLimit}`)}
      </p>
      <button
        onClick={() => setShowRules(true)}
        className="px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded text-sm w-full"
      >
        规则
      </button>
      {state.phase === PHASE_PLACE && (state.config?.gameMode === 'ai_level1' || state.config?.gameMode === 'ai_level2' ? state.currentPlayer === 0 : true) && (
        <>
          <button
            onClick={onUndo ?? (() => updateState((s) => undoLastPlacement(s)))}
            disabled={!canUndoPlacement(state)}
            className="px-3 py-2 bg-gray-600 hover:bg-gray-500 disabled:opacity-40 disabled:cursor-not-allowed rounded text-sm w-full"
          >
            撤回
          </button>
          <button
            onClick={() => setShowEndPlaceConfirm(true)}
            className="px-3 py-2 bg-amber-600 hover:bg-amber-500 rounded text-sm w-full"
          >
            结束排布
          </button>
        </>
      )}
      {state.phase === PHASE_ACTION && connectivityChoice && (
        <>
          <p className="text-xs text-amber-400 px-1 font-medium">
            {connectivityChoice.type === 'all'
              ? '步骤(1)：该格不连通，请选择要保留的连通子集'
              : '步骤(2)：多个黑连通子集，请选择要保留的一个'}
          </p>
          {connectivityChoice.components.map((_, i) => (
            <button
              key={i}
              onClick={() => onConnectivityChoice(i)}
              className="px-3 py-2 bg-amber-700 hover:bg-amber-600 rounded text-sm w-full"
            >
              保留子集 {i + 1}
            </button>
          ))}
        </>
      )}
      {state.phase === PHASE_ACTION && !connectivityChoice && (state.config?.gameMode === 'ai_level1' || state.config?.gameMode === 'ai_level2' ? state.currentPlayer === 0 : true) && (
        <>
          <button
            onClick={() => setShowEndTurnConfirm(true)}
            className="px-3 py-2 bg-sky-600 hover:bg-sky-500 rounded text-sm w-full"
          >
            结束回合
          </button>
          {actionSubstate === 'attack_my' && attackMyCell && (
            <button
              onClick={onAttackMyCellCancel}
              className="px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded text-sm w-full"
            >
              取消选择
            </button>
          )}
          {actionSubstate === 'attack_confirm' && attackMyCell && attackEnemyCell && (state.config?.gameMode === 'ai_level1' || state.config?.gameMode === 'ai_level2' ? state.currentPlayer === 0 : true) && (
            <>
              <span className="text-xs text-amber-400 px-1">确认进攻？</span>
              <button
                onClick={onAttackConfirm}
                className="px-3 py-2 bg-red-600 hover:bg-red-500 rounded text-sm w-full"
              >
                确认
              </button>
              <button
                onClick={onAttackCancel}
                className="px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded text-sm w-full"
              >
                取消
              </button>
            </>
          )}
          {actionSubstate === 'attack_confirm' && attackMyCell && attackEnemyCell && state.currentPlayer === 1 && (state.config?.gameMode === 'ai_level1' || state.config?.gameMode === 'ai_level2') && (
            <span className="text-xs text-amber-400 px-1">AI 进攻中…</span>
          )}
          {effectPendingAtom && (
            <>
              <span className="text-xs text-amber-400 px-1">确认发动效果？</span>
              <button
                onClick={onEffectConfirm}
                className="px-3 py-2 bg-amber-600 hover:bg-amber-500 rounded text-sm w-full"
              >
                确认发动
              </button>
              <button
                onClick={onEffectCancel}
                className="px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded text-sm w-full"
              >
                取消
              </button>
            </>
          )}
          {actionSubstate === 'direct_attack_confirm' && attackMyCell && (
            <>
              <span className="text-xs text-amber-400 px-1">直接攻击？</span>
              <button
                onClick={onDirectAttackConfirm}
                className="px-3 py-2 bg-red-600 hover:bg-red-500 rounded text-sm w-full"
              >
                是
              </button>
              <button
                onClick={onDirectAttackCancel}
                className="px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded text-sm w-full"
              >
                否
              </button>
            </>
          )}
        </>
      )}
      </div>
    </div>
    </>
  )
}
