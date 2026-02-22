import { useState } from 'react'
import { COLORS } from '../game/config.js'

const LABELS = { black: '黑', red: '红', blue: '蓝', green: '绿', yellow: '黄' }
const BADGES = { black: 'bg-gray-800', red: 'bg-red-700', blue: 'bg-blue-700', green: 'bg-green-700', yellow: 'bg-amber-600' }

const DEFAULT_WEIGHTS = [3, 1, 1, 1, 1]

export default function StartScreen({ onStart, defaultConfig = {} }) {
  const [baseDrawCount, setBaseDrawCount] = useState(defaultConfig.baseDrawCount ?? 10)
  const [basePlaceLimit, setBasePlaceLimit] = useState(defaultConfig.basePlaceLimit ?? 10)
  const [drawWeights, setDrawWeights] = useState(
    () => defaultConfig.drawWeights && defaultConfig.drawWeights.length >= 5
      ? [...defaultConfig.drawWeights]
      : [...DEFAULT_WEIGHTS]
  )

  const updateWeight = (index, value) => {
    const v = Math.max(0, Math.min(20, Number(value) || 0))
    setDrawWeights((w) => {
      const next = [...w]
      next[index] = v
      return next
    })
  }

  const handleStart = () => {
    onStart({
      baseDrawCount: Math.max(1, Math.min(30, baseDrawCount)),
      basePlaceLimit: Math.max(1, Math.min(30, basePlaceLimit)),
      drawWeights: drawWeights.map((x) => Math.max(0, Math.min(20, x))),
    })
  }

  const colorKeys = COLORS
  const totalWeight = drawWeights.reduce((a, b) => a + b, 0)
  const weightPcts = totalWeight > 0 ? drawWeights.map((w) => ((w / totalWeight) * 100).toFixed(0)) : drawWeights.map(() => '0')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/95 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-600 bg-gray-800/95 p-6 shadow-2xl">
        <h1 className="mb-6 text-center text-2xl font-bold text-amber-400">原子对战</h1>
        <p className="mb-6 text-center text-sm text-gray-400">配置本局规则后点击开始</p>

        <div className="space-y-5">
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

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-300">各原子抽取权重（0~20）</label>
            <p className="mb-2 text-xs text-gray-500">权重越高，抽到该颜色概率越大。和为 0 时默认等概率。</p>
            <div className="space-y-2">
              {colorKeys.map((color, i) => (
                <div key={color} className="flex items-center gap-2">
                  <span className={`w-12 rounded px-1.5 py-0.5 text-xs font-medium text-white ${BADGES[color] ?? 'bg-gray-600'}`}>
                    {LABELS[color]}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    value={drawWeights[i] ?? 0}
                    onChange={(e) => updateWeight(i, e.target.value)}
                    className="flex-1"
                  />
                  <span className="w-6 text-right text-xs text-gray-400">{drawWeights[i] ?? 0}</span>
                  <span className="w-8 text-right text-xs text-gray-500">~{weightPcts[i]}%</span>
                </div>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-500">当前总权重: {totalWeight}，{totalWeight === 0 ? '将使用等概率' : '抽取按权重随机'}</p>
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
