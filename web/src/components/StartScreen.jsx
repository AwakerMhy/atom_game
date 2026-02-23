import { useState } from 'react'
import { COLORS } from '../game/config.js'
import { RULES_OVERLAY_LINES } from './HUD.jsx'

const LABELS = { black: '黑', red: '红', blue: '蓝', green: '绿', yellow: '黄', purple: '紫', white: '白', gray: '灰' }
const BADGES = { black: 'bg-black', red: 'bg-red-700', blue: 'bg-blue-700', green: 'bg-green-700', yellow: 'bg-amber-600', purple: 'bg-violet-600', white: 'bg-gray-200', gray: 'bg-gray-500' }

const DEFAULT_WEIGHTS = [3, 1, 1, 1, 1, 0, 0, 0]

export default function StartScreen({ onStart, defaultConfig = {} }) {
  const [showRules, setShowRules] = useState(false)
  const [baseDrawCount, setBaseDrawCount] = useState(defaultConfig.baseDrawCount ?? 10)
  const [basePlaceLimit, setBasePlaceLimit] = useState(defaultConfig.basePlaceLimit ?? 10)
  const [initialHp, setInitialHp] = useState(defaultConfig.initialHp ?? 20)
  const [cellCount, setCellCount] = useState(defaultConfig.cellCount ?? 3)
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
    onStart({
      baseDrawCount: Math.max(1, Math.min(30, baseDrawCount)),
      basePlaceLimit: Math.max(1, Math.min(30, basePlaceLimit)),
      initialHp: Math.max(1, Math.min(99, initialHp)),
      cellCount: Math.max(2, Math.min(6, cellCount)),
      drawWeights: drawWeights.map((x) => Math.max(0, Math.min(20, x))),
    })
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
        <p className="mb-6 text-center text-sm text-gray-400">配置本局规则后点击开始</p>

        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
          <div className="flex-1 space-y-5">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">每局获得原子数</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={30}
                  value={baseDrawCount}
                  onChange={(e) => setBaseDrawCount(Number(e.target.value))}
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
              <label className="mb-1 block text-sm font-medium text-gray-300">每局可排布原子数</label>
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
              <p className="mt-0.5 text-xs text-gray-500">每回合可放置的原子数量上限</p>
            </div>
          </div>

          <div className="shrink-0 sm:w-64">
            <label className="mb-2 block text-sm font-medium text-gray-300">各原子抽取权重（0~20）</label>
            <p className="mb-2 text-xs text-gray-500">权重越高，抽到该颜色概率越大。和为 0 时默认等概率。</p>
            <div className="space-y-2">
              {colorKeys.map((color, i) => (
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
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-500">总权重: {totalWeight}，{totalWeight === 0 ? '等概率' : '按权重随机'}</p>
          </div>
        </div>

        <div className="mt-8 flex justify-center">
          <button
            onClick={handleStart}
            className="rounded-lg bg-amber-600 px-8 py-2.5 font-semibold text-white shadow-lg transition hover:bg-amber-500 active:scale-95"
          >
            开始游戏
          </button>
        </div>
      </div>
    </div>
  )
}
