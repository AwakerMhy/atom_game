import { useState } from 'react'
import { COLORS } from '../game/config.js'
import { RULES_OVERLAY_LINES } from './rulesOverlay.js'

const LABELS = { black: '黑', red: '红', blue: '蓝', green: '绿', yellow: '黄', purple: '紫', white: '白', gray: '灰' }
const BADGES = { black: 'bg-black', red: 'bg-red-700', blue: 'bg-blue-700', green: 'bg-green-700', yellow: 'bg-amber-600', purple: 'bg-violet-600', white: 'bg-gray-200', gray: 'bg-gray-500' }

const DEFAULT_WEIGHTS = [3, 1, 1, 1, 1, 0, 0, 0]

function StartScreen({ onStart, defaultConfig = {} }) {
  const [showRules, setShowRules] = useState(false)
  const [showAILevelSelect, setShowAILevelSelect] = useState(false)
  const [gameMode, setGameMode] = useState(defaultConfig.gameMode ?? 'normal')
  const [aiSpeedMultiplier, setAiSpeedMultiplier] = useState(defaultConfig.aiSpeedMultiplier ?? 1)
  const [baseDrawCount, setBaseDrawCount] = useState(defaultConfig.baseDrawCount ?? 10)
  const [basePlaceLimit, setBasePlaceLimit] = useState(defaultConfig.basePlaceLimit ?? 10)
  const [initialHp, setInitialHp] = useState(defaultConfig.initialHp ?? 20)
  const [cellCount, setCellCount] = useState(defaultConfig.cellCount ?? 3)
  const [synthesis, setSynthesis] = useState(defaultConfig.synthesis !== false)
  const [aiBlackPerTurn, setAiBlackPerTurn] = useState(defaultConfig.aiBlackPerTurn ?? 8)
  const [aiPlaceLimit, setAiPlaceLimit] = useState(defaultConfig.aiPlaceLimit ?? 15)
  const [ai2DrawCount, setAi2DrawCount] = useState(defaultConfig.ai2DrawCount ?? 10)
  const [ai2PlaceLimit, setAi2PlaceLimit] = useState(defaultConfig.ai2PlaceLimit ?? 12)
  const [ai2WeightBlack, setAi2WeightBlack] = useState(defaultConfig.ai2WeightBlack ?? 5)
  const [ai2WeightRed, setAi2WeightRed] = useState(defaultConfig.ai2WeightRed ?? 2)
  const [ai2WeightBlue, setAi2WeightBlue] = useState(defaultConfig.ai2WeightBlue ?? 2)
  const [ai3InitialBlack, setAi3InitialBlack] = useState(defaultConfig.ai3InitialBlack ?? 3)
  const [ai3ProliferatePerBlack, setAi3ProliferatePerBlack] = useState(defaultConfig.ai3ProliferatePerBlack ?? 2)
  const [drawWeights, setDrawWeights] = useState(
    () => {
      const w = defaultConfig.drawWeights
      const numColors = 8
      if (Array.isArray(w) && w.length >= numColors) return [...w]
      if (Array.isArray(w)) return [...w, ...Array(numColors - w.length).fill(0)].slice(0, numColors)
      return [...DEFAULT_WEIGHTS]
    }
  )

  const updateWeight = (index, value) => {
    const v = Math.max(0, Math.min(20, Number(value) || 0))
    setDrawWeights((w) => {
      const next = [...w]
      if (index >= next.length) next.push(...Array(index - next.length + 1).fill(0))
      next[index] = v
      return next.slice(0, 8)
    })
  }

  const handleStart = () => {
    const config = {
      gameMode,
      synthesis,
      baseDrawCount: Math.max(1, Math.min(30, Math.round(Number(baseDrawCount) || 10))),
      basePlaceLimit: Math.max(1, Math.min(30, basePlaceLimit)),
      initialHp: Math.max(1, Math.min(99, initialHp)),
      cellCount: Math.max(2, Math.min(6, cellCount)),
      drawWeights: drawWeights.map((x) => Math.max(0, Math.min(20, x))),
    }
    if (gameMode === 'ai_level1') {
      config.aiBlackPerTurn = Math.max(0, Math.min(30, aiBlackPerTurn))
      config.aiPlaceLimit = Math.max(0, Math.min(30, aiPlaceLimit))
    }
    if (gameMode === 'ai_level2') {
      config.ai2DrawCount = Math.max(1, Math.min(20, ai2DrawCount))
      config.ai2PlaceLimit = Math.max(1, Math.min(25, ai2PlaceLimit))
      config.ai2WeightBlack = Math.max(0, Math.min(10, ai2WeightBlack))
      config.ai2WeightRed = Math.max(0, Math.min(10, ai2WeightRed))
      config.ai2WeightBlue = Math.max(0, Math.min(10, ai2WeightBlue))
      config.ai2DrawWeights = [
        Math.max(0, Math.min(10, ai2WeightBlack)),
        Math.max(0, Math.min(10, ai2WeightRed)),
        Math.max(0, Math.min(10, ai2WeightBlue)),
        0, 0, 0, 0, 0,
      ]
    }
    if (gameMode === 'ai_level3') {
      config.ai3InitialBlack = Math.max(1, Math.min(20, ai3InitialBlack))
      config.ai3ProliferatePerBlack = Math.max(1, Math.min(6, ai3ProliferatePerBlack))
    }
    if (gameMode === 'ai_level1' || gameMode === 'ai_level2' || gameMode === 'ai_level3') {
      config.aiSpeedMultiplier = Math.max(0.25, Math.min(4, Number(aiSpeedMultiplier) || 1))
    }
    onStart(config)
  }

  const colorKeys = COLORS
  const totalWeight = drawWeights.reduce((a, b) => a + b, 0)
  const weightPcts = totalWeight > 0 ? drawWeights.map((w) => ((w / totalWeight) * 100).toFixed(0)) : drawWeights.map(() => '0')

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

  if (showAILevelSelect) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/95 backdrop-blur-sm">
        <div className="relative w-full max-w-md rounded-2xl border border-gray-600 bg-gray-800/95 p-6 shadow-2xl">
          <div className="absolute top-4 right-4">
            <button
              type="button"
              onClick={() => setShowRules(true)}
              className="px-3 py-1.5 rounded text-sm bg-gray-600 hover:bg-gray-500 text-gray-200"
            >
              规则
            </button>
          </div>
          <h1 className="mb-2 text-center text-2xl font-bold text-amber-400">AI 对战</h1>
          <p className="mb-6 text-center text-sm text-gray-400">选择关卡</p>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => { setGameMode('ai_level1'); setShowAILevelSelect(false) }}
              className="px-6 py-3 rounded-lg text-base font-medium bg-gray-600 hover:bg-amber-600 text-white transition"
            >
              第一关（AI 仅使用黑原子）
            </button>
            <button
              type="button"
              onClick={() => { setGameMode('ai_level2'); setShowAILevelSelect(false) }}
              className="px-6 py-3 rounded-lg text-base font-medium bg-gray-600 hover:bg-amber-600 text-white transition"
            >
              第二关（AI 使用黑/红/蓝，可发动红/蓝效果）
            </button>
            <button
              type="button"
              onClick={() => { setGameMode('ai_level3'); setShowAILevelSelect(false) }}
              className="px-6 py-3 rounded-lg text-base font-medium bg-gray-600 hover:bg-amber-600 text-white transition"
            >
              第三关（增殖：AI 仅黑原子，无排布，每回合结束增殖）
            </button>
            <button
              type="button"
              onClick={() => { setShowAILevelSelect(false); setGameMode('normal') }}
              className="px-6 py-2 rounded-lg text-sm font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 mt-2"
            >
              返回
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/95 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-2xl border border-gray-600 bg-gray-800/95 p-6 shadow-2xl">
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
          <button
            type="button"
            onClick={() => setShowRules(true)}
            className="px-3 py-1.5 rounded text-sm bg-gray-600 hover:bg-gray-500 text-gray-200"
          >
            规则
          </button>
        </div>
        <h1 className="mb-6 text-center text-2xl font-bold text-amber-400">原子对战</h1>
        <p className="mb-6 text-center text-sm text-gray-400">
          {gameMode === 'normal' ? '配置本局规则后点击开始' : gameMode === 'ai_level1' ? '第一关配置 · 可返回上方「返回选择关卡」切换关卡' : gameMode === 'ai_level2' ? '第二关配置 · 可返回上方「返回选择关卡」切换关卡' : '第三关配置 · 可返回上方「返回选择关卡」切换关卡'}
        </p>

        <div className="mb-6 flex gap-2 justify-center flex-wrap items-center">
          <button
            type="button"
            onClick={() => setGameMode('normal')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${gameMode === 'normal' ? 'bg-amber-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
          >
            主游戏
          </button>
          {gameMode === 'normal' ? (
            <button
              type="button"
              onClick={() => setShowAILevelSelect(true)}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-600 text-gray-300 hover:bg-gray-500"
            >
              进入 AI 对战
            </button>
          ) : (
            <>
              <span className="text-sm text-gray-400 px-1">当前关卡：</span>
              <span className="text-sm font-medium text-amber-400 px-2 py-1 rounded bg-gray-700">
                {gameMode === 'ai_level1' ? '第一关' : gameMode === 'ai_level2' ? '第二关' : '第三关'}
              </span>
              <button
                type="button"
                onClick={() => setShowAILevelSelect(true)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-600 text-white"
              >
                返回选择关卡
              </button>
            </>
          )}
        </div>

        {gameMode === 'ai_level1' && (
          <div className="mb-6 p-4 rounded-lg bg-gray-700/50 border border-gray-600">
            <p className="text-sm font-medium text-amber-300 mb-3">第一关（AI 仅使用黑原子）</p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">AI 每局获得黑原子</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={30}
                    value={aiBlackPerTurn}
                    onChange={(e) => setAiBlackPerTurn(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="w-8 text-right font-mono text-amber-400 text-sm">{aiBlackPerTurn}</span>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">AI 每回合可排布黑原子数</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={30}
                    value={aiPlaceLimit}
                    onChange={(e) => setAiPlaceLimit(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="w-8 text-right font-mono text-amber-400 text-sm">{aiPlaceLimit}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {gameMode === 'ai_level2' && (
          <div className="mb-6 p-4 rounded-lg bg-gray-700/50 border border-gray-600">
            <p className="text-sm font-medium text-amber-300 mb-3">第二关（AI 使用黑/红/蓝，可发动红/蓝效果）</p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">AI 每回合获得原子数</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={1}
                    max={20}
                    value={ai2DrawCount}
                    onChange={(e) => setAi2DrawCount(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="w-8 text-right font-mono text-amber-400 text-sm">{ai2DrawCount}</span>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">AI 每回合可排布原子数</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={1}
                    max={25}
                    value={ai2PlaceLimit}
                    onChange={(e) => setAi2PlaceLimit(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="w-8 text-right font-mono text-amber-400 text-sm">{ai2PlaceLimit}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-400">黑权重</label>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={ai2WeightBlack}
                    onChange={(e) => setAi2WeightBlack(Number(e.target.value))}
                    className="w-full"
                  />
                  <span className="font-mono text-amber-400 text-sm">{ai2WeightBlack}</span>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-400">红权重</label>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={ai2WeightRed}
                    onChange={(e) => setAi2WeightRed(Number(e.target.value))}
                    className="w-full"
                  />
                  <span className="font-mono text-amber-400 text-sm">{ai2WeightRed}</span>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-400">蓝权重</label>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={ai2WeightBlue}
                    onChange={(e) => setAi2WeightBlue(Number(e.target.value))}
                    className="w-full"
                  />
                  <span className="font-mono text-amber-400 text-sm">{ai2WeightBlue}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {gameMode === 'ai_level3' && (
          <div className="mb-6 p-4 rounded-lg bg-gray-700/50 border border-gray-600">
            <p className="text-sm font-medium text-amber-300 mb-3">第三关（增殖：AI 仅黑原子，无排布，每回合结束增殖）</p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">每格初始黑原子数 x（1~20）</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={1}
                    max={20}
                    value={ai3InitialBlack}
                    onChange={(e) => setAi3InitialBlack(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="w-8 text-right font-mono text-amber-400 text-sm">{ai3InitialBlack}</span>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">每黑原子每回合增殖邻居数 y（1~6）</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={1}
                    max={6}
                    value={ai3ProliferatePerBlack}
                    onChange={(e) => setAi3ProliferatePerBlack(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="w-8 text-right font-mono text-amber-400 text-sm">{ai3ProliferatePerBlack}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {(gameMode === 'ai_level1' || gameMode === 'ai_level2' || gameMode === 'ai_level3') && (
          <div className="mb-6 p-4 rounded-lg bg-gray-700/50 border border-gray-600">
            <p className="text-sm font-medium text-amber-300 mb-3">AI 操作展示速度</p>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">展示时间倍数（1=正常，2=每步时间×2）</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0.25}
                  max={4}
                  step={0.25}
                  value={aiSpeedMultiplier}
                  onChange={(e) => setAiSpeedMultiplier(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="w-12 text-right font-mono text-amber-400 text-sm">{Number(aiSpeedMultiplier) === Math.floor(aiSpeedMultiplier) ? aiSpeedMultiplier : aiSpeedMultiplier.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        <div className={`flex gap-6 sm:gap-8 ${gameMode === 'ai_level1' || gameMode === 'ai_level2' || gameMode === 'ai_level3' ? 'flex-row items-start' : 'flex-col'}`}>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8 flex-1 min-w-0">
          <div className="flex-1 space-y-5 min-w-0">
            <p className="text-xs text-gray-500">{(gameMode === 'ai_level1' || gameMode === 'ai_level2' || gameMode === 'ai_level3') ? '玩家（P0）配置' : '双方配置'}</p>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">每局获得原子数</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={30}
                  step={1}
                  value={baseDrawCount}
                  onChange={(e) => setBaseDrawCount(Math.round(Number(e.target.value)) || 1)}
                  className="flex-1"
                />
                <span className="w-10 text-right font-mono text-amber-400">{baseDrawCount}</span>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">每回合开始时抽取的原子数量</p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">双方玩家血量</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={99}
                  value={initialHp}
                  onChange={(e) => setInitialHp(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="w-10 text-right font-mono text-amber-400">{initialHp}</span>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">每方初始生命值</p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">双方格子数目</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={2}
                  max={6}
                  value={cellCount}
                  onChange={(e) => setCellCount(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="w-10 text-right font-mono text-amber-400">{cellCount}</span>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">每方场地格子数（2~6）</p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">每回合可排布原子数</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={30}
                  value={basePlaceLimit}
                  onChange={(e) => setBasePlaceLimit(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="w-10 text-right font-mono text-amber-400">{basePlaceLimit}</span>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">本回合可放置的原子总数上限（所有颜色合计，黑+红+蓝等不超过此数）</p>
            </div>

            <div className="flex items-center gap-3">
              <input
                id="synthesis"
                type="checkbox"
                checked={synthesis}
                onChange={(e) => setSynthesis(e.target.checked)}
                className="rounded border-gray-500 bg-gray-700 text-amber-500 focus:ring-amber-500"
              />
              <label htmlFor="synthesis" className="text-sm font-medium text-gray-300 cursor-pointer">
                原子合成
              </label>
            </div>
            <p className="mt-0.5 text-xs text-gray-500">勾选后仅抽取黑/红/蓝/黄；排布阶段可将基本原子合成为紫/绿/白/灰</p>
          </div>

          <div className="shrink-0 sm:w-64">
            <label className="mb-2 block text-sm font-medium text-gray-300">各原子抽取权重（0~20）</label>
            <p className="mb-2 text-xs text-gray-500">权重越高，抽到该颜色概率越大。{synthesis && '勾选原子合成时仅可抽取黑/红/蓝/黄。'} {totalWeight === 0 ? '和为 0 时默认等概率。' : ''}</p>
            <div className="space-y-2">
              {colorKeys.map((color, i) => {
                if (synthesis && ['green', 'purple', 'white', 'gray'].includes(color)) return null
                return (
                  <div key={color} className="flex items-center gap-2">
                    <span className={`w-10 shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${color === 'white' ? 'text-black' : 'text-white'} ${BADGES[color] ?? 'bg-gray-600'}`}>
                      {LABELS[color]}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={20}
                      value={drawWeights[i] ?? 0}
                      onChange={(e) => updateWeight(i, e.target.value)}
                      className="flex-1 min-w-0"
                    />
                    <span className="w-5 shrink-0 text-right text-xs text-gray-400">{drawWeights[i] ?? 0}</span>
                    <span className="w-7 shrink-0 text-right text-xs text-gray-500">~{weightPcts[i]}%</span>
                  </div>
                )
              })}
            </div>
            <p className="mt-1 text-xs text-gray-500">总权重: {totalWeight}，{totalWeight === 0 ? '等概率' : '按权重随机'}</p>
          </div>
          </div>

          {(gameMode === 'ai_level1' || gameMode === 'ai_level2' || gameMode === 'ai_level3') ? (
            <div className="shrink-0 flex flex-col items-center justify-center pt-2">
              <button
                onClick={handleStart}
                className="rounded-lg bg-amber-600 px-8 py-2.5 font-semibold text-white shadow-lg transition hover:bg-amber-500 active:scale-95 whitespace-nowrap"
              >
                开始游戏
              </button>
            </div>
          ) : (
            <div className="flex justify-center">
              <button
                onClick={handleStart}
                className="rounded-lg bg-amber-600 px-8 py-2.5 font-semibold text-white shadow-lg transition hover:bg-amber-500 active:scale-95"
              >
                开始游戏
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default StartScreen
