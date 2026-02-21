import { useState } from 'react'
import { winner } from '../game/state.js'
import { endPlacePhase, endTurn, startTurnDefault, undoLastPlacement } from '../game/turn.js'
import { applyGreenEndOfTurn } from '../game/combat.js'
import { PHASE_CONFIRM, PHASE_PLACE, PHASE_ACTION } from '../game/config.js'

const RULES_OVERLAY_LINES = [
  '【规则摘要】 点击「规则」按钮或下方关闭按钮关闭',
  '目标：将对方生命降至 0。每方 3 格，格点放原子（黑/红/蓝/绿）。',
  '阶段1：拖动原子到己方格放置，点「结束排布」。',
  '阶段2：点击己方格子进攻再点对方格；或点击己方红/蓝/绿原子发动效果；点「结束回合」。',
  '三角形网格的边长为1',
  '攻击力=己格黑原子竖向跨度除以sqrt(3)/2；防御力=对方格黑原子横向跨度。攻>防可破坏黑原子。',
  '红=对方须破坏 y 个黑原子（y=该红原子相邻黑数），随机选择。',
  '',
  '【原子持续性效果】',
  '黑：决定己格攻击力与对方格防御力；每回合己方「有黑原子的格子」各可发动一次进攻；非空格至少需有一黑。',
  '红：发动时对方须破坏 y 个黑原子；进攻时己格红数 n、对方格蓝数 m，额外可破坏数=max(0,n-m)。',
  '蓝（点击）：与该蓝相邻的黑原子下一回合内不可被破坏。',
  '绿（点击）：该绿原子就地变为一个黑原子（不消耗池）。',
  '绿（持续）：回合结束时获得「己方所有绿原子邻接黑原子数」之和的黑原子。',
]

export default function HUD({
  state,
  setState,
  updateState,
  actionSubstate,
  attackMyCell,
  onDirectAttackConfirm,
  onDirectAttackCancel,
  attackMessage,
}) {
  const [showRules, setShowRules] = useState(false)
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
    updateState((s) => {
      endPlacePhase(s)
    })
  }

  const handleEndTurn = () => {
    updateState((s) => {
      applyGreenEndOfTurn(s, s.currentPlayer)
      endTurn(s)
      startTurnDefault(s)
    })
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 py-3 px-4 flex flex-wrap items-center justify-center gap-4">
      <button
        onClick={() => setShowRules(true)}
        className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm"
      >
        规则
      </button>
      {state.phase === PHASE_PLACE && (
        <>
          <button
            onClick={() => updateState((s) => undoLastPlacement(s))}
            disabled={!(state.placementHistory?.length)}
            className="px-3 py-1 bg-gray-600 hover:bg-gray-500 disabled:opacity-40 disabled:cursor-not-allowed rounded text-sm"
          >
            撤回
          </button>
          <button
            onClick={handleEndPlace}
            className="px-4 py-1 bg-amber-600 hover:bg-amber-500 rounded text-sm"
          >
            结束排布
          </button>
        </>
      )}
      {state.phase === PHASE_ACTION && (
        <>
          <button
            onClick={handleEndTurn}
            className="px-4 py-1 bg-sky-600 hover:bg-sky-500 rounded text-sm"
          >
            结束回合
          </button>
          {actionSubstate === 'direct_attack_confirm' && attackMyCell && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-amber-400">对方三格皆空，直接攻击？</span>
              <button
                onClick={onDirectAttackConfirm}
                className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-sm"
              >
                是
              </button>
              <button
                onClick={onDirectAttackCancel}
                className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm"
              >
                否
              </button>
            </div>
          )}
        </>
      )}
      <p className="text-xs text-gray-500 w-full text-center">
        {state.phase === PHASE_PLACE &&
          `排布阶段 · 已放 ${state.turnPlacedCount}/${state.turnPlaceLimit}`}
        {state.phase === PHASE_ACTION &&
          (attackMessage || `动作阶段 · 进攻 ${state.turnAttackUsed}/${state.turnAttackLimit}`)}
      </p>
    </div>
  )
}
