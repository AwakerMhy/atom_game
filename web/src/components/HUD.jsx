import { useState } from 'react'
import { winner } from '../game/state.js'
import { endPlacePhase, endTurn, startTurnDefault, undoLastPlacement, canUndoPlacement } from '../game/turn.js'
import { applyGreenEndOfTurn } from '../game/combat.js'
import { PHASE_CONFIRM, PHASE_PLACE, PHASE_ACTION } from '../game/config.js'

export const RULES_OVERLAY_LINES = [
  "【规则摘要】 点击「规则」或下方关闭按钮关闭",
  "",
  "一、目标",
  "将对方生命降至 0。每方 3 格，格点可放置黑/红/蓝/绿/黄/紫原子。",
  "",
  "二、游戏阶段",
  "阶段1：排布。拖放原子到己方格，点「结束排布」。",
  "阶段2：效果。点击己方红/蓝/绿/黄原子发动效果（紫原子无点击效果）。",
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
  "黑原子只能随机排布；红/蓝/绿/黄/紫必须至少与一个已有的黑原子相邻才能放置。",
  "非黑原子的效果取决于其所连接的黑原子数目。紫原子的作用是扩展具有特殊效果原子（红/蓝/绿/黄）的黑邻跳数：与紫相邻时，有效黑邻按「1 + 相邻紫个数」跳计算；多紫连接同一原子时跳数叠加。",
  "",
  "五、原子持续性效果",
  "红：进攻时，己方格红原子（与紫相邻时用扩展黑邻跳数）可多破坏 x 个原子。",
  "蓝：遭进攻时，己方格蓝原子（与紫相邻时用扩展黑邻跳数）可少破坏 x 个（最低为 0）。",
  "绿：回合结束时，获得己方所有绿原子有效黑邻数之和的黑原子（与紫相邻时用扩展黑邻跳数）。",
  "黄：对方必须以有黄原子的格子为攻击对象和红原子的效果对象；与紫相邻时黄效果按扩展黑邻跳数计算。",
  "紫：无持续性数值；其作用是扩展红/蓝/绿/黄的黑邻跳数（多紫可叠加）。",
  "",
  "六、原子点击效果",
  "红：先选对方格子，再在该格内随机破坏 y 个黑原子（y = 该红原子有效黑邻数，与紫相邻时用扩展跳数）。",
  "蓝：与该蓝有效黑邻（与紫相邻时用扩展跳数）下一回合内不可被破坏，期间蓝色高亮。",
  "绿：该格点变为黑原子；与紫相邻时并在此格内「有效黑邻的空邻居」处放置黑原子。",
  "黄：与该黄有效黑邻（与紫相邻时用扩展跳数）黄色高亮，下回合优先被选为破坏对象。",
  "绿/蓝/黄发动点击效果时，与其相邻的紫原子一并消失。",
  "紫：无点击效果。",
  "",
  "八、黑原子破坏规则（攻击与红效果）",
  "要破坏 x 个黑原子时：",
  "· 若无黄高亮黑原子：从该格所有黑原子中无放回随机抽 x 个作为目标；",
  "· 若有 y 个黄高亮黑原子且 x≥y：先确定这 y 个为目标，再从其余黑原子中随机抽 x-y 个；",
  "· 若有 y 个黄高亮黑原子且 x<y：从这 y 个中随机抽 x 个作为目标。",
  "选中的目标若被蓝保护则不实际破坏（蓝优先于黄）。",
  "",
  "九、破坏后连通规则",
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
  attackEnemyCell,
  onAttackConfirm,
  onAttackCancel,
  onAttackMyCellCancel,
  onDirectAttackConfirm,
  onDirectAttackCancel,
  attackMessage,
  connectivityChoice,
  onConnectivityChoice,
  effectPendingAtom,
  onEffectConfirm,
  onEffectCancel,
}) {
  const [showRules, setShowRules] = useState(false)
  const [showEndPlaceConfirm, setShowEndPlaceConfirm] = useState(false)
  const [showEndTurnConfirm, setShowEndTurnConfirm] = useState(false)
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
      {state.phase === PHASE_ACTION && !connectivityChoice && (
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
          {actionSubstate === 'attack_confirm' && attackMyCell && attackEnemyCell && (
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
    </>
  )
}
