import { useState } from 'react'
import { winner } from '../game/state.js'
import { endPlacePhase, endTurn, startTurnDefault, undoLastPlacement } from '../game/turn.js'
import { applyGreenEndOfTurn } from '../game/combat.js'
import { PHASE_CONFIRM, PHASE_PLACE, PHASE_ACTION } from '../game/config.js'

const RULES_OVERLAY_LINES = [
  "【规则摘要】 点击「规则」或下方关闭按钮关闭",
  "",
  "一、目标",
  "将对方生命降至 0。每方 3 格，格点可放置黑/红/蓝/绿原子。",
  "",
  "二、游戏阶段",
  "阶段1：排布。拖放原子到己方格，点「结束排布」。",
  "阶段2：效果。点击己方红/蓝/绿原子发动效果。",
  "阶段3：进攻。点击己方格子再点对方格进攻，随后「结束回合」。",
  "",
  "三、场地与进攻",
  "· 三角形网格边长为 1。",
  "· 每回合，己方有黑原子的格子各可发动一次进攻。",
  "· 攻击力 = 黑原子竖向跨度 ÷ √3/2；防御力 = 黑原子横向跨度。",
  "· 攻 > 防：可破坏一个黑原子，造成 1 点伤害。",
  "· 对方格子无黑原子：直接造成攻击力数值的伤害。",
  "",
  "四、原子排布",
  "黑原子只能随机排布；红/蓝/绿可选在已有黑原子的邻居位置放置。",
  "非黑原子的效果取决于其所连接的黑原子数目。",
  "",
  "五、原子持续性效果",
  "红：进攻时，己方格红原子连接黑原子数 x，可多破坏 x 个原子。",
  "蓝：遭进攻时，己方格蓝原子连接黑原子数 x，可少破坏 x 个（最低为 0）。",
  "绿：回合结束时，获得「己方所有绿原子邻接黑原子数」之和的黑原子。",
  "",
  "六、原子点击效果",
  "红：先选对方格子，再在该格内随机破坏 y 个黑原子（y = 该红原子相邻黑数）。",
  "蓝：与该蓝相邻的黑原子下一回合内不可被破坏，期间蓝色高亮。",
  "绿：该绿原子就地变为黑原子（不消耗池）。",
  "",
  "七、破坏后连通规则",
  "每批原子被破坏后，进攻与红效果均按此流程：",
  "(1) 检查该格剩余原子是否连通，不连通则由被破坏方选择保留一个连通子集；",
  "(2) 仅看黑原子是否连通，若存在多个黑连通子集则由被破坏方选一个保留，其余破坏；",
  "(3) 自动清除所有不包含黑原子的连通子集。",
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
  connectivityChoice,
  onConnectivityChoice,
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
    <div className="fixed right-0 top-24 bottom-20 w-28 flex flex-col gap-2 py-4 pr-2 pl-2 bg-gray-900/90 border-l border-gray-700 z-20">
      <p className="text-xs text-gray-400 px-1 pb-2 border-b border-gray-600">
        {state.phase === PHASE_PLACE &&
          `排布 · 已放 ${state.turnPlacedCount}/${state.turnPlaceLimit}`}
        {state.phase === PHASE_ACTION &&
          (attackMessage || `动作 · 进攻 ${state.turnAttackUsed}/${state.turnAttackLimit}`)}
      </p>
      <button
        onClick={() => setShowRules(true)}
        className="px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded text-sm w-full"
      >
        规则
      </button>
      {state.phase === PHASE_PLACE && (
        <>
          <button
            onClick={() => updateState((s) => undoLastPlacement(s))}
            disabled={!(state.placementHistory?.length)}
            className="px-3 py-2 bg-gray-600 hover:bg-gray-500 disabled:opacity-40 disabled:cursor-not-allowed rounded text-sm w-full"
          >
            撤回
          </button>
          <button
            onClick={handleEndPlace}
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
      {state.phase === PHASE_ACTION && !connectivityChoice && (
        <>
          <button
            onClick={handleEndTurn}
            className="px-3 py-2 bg-sky-600 hover:bg-sky-500 rounded text-sm w-full"
          >
            结束回合
          </button>
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
  )
}
