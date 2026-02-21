import { useMemo, useState, useRef, useCallback } from 'react'
import { pointToXy, neighbors, distanceBetween } from '../game/grid.js'
import { pixelToGrid } from '../utils/hex.js'
import { attackPower, defensePower } from '../game/combat.js'
import { ATOM_RED, ATOM_BLUE, ATOM_GREEN } from '../game/config.js'

const CELL_SIDE = 200
const CELL_W = CELL_SIDE
const CELL_H = CELL_SIDE
const GAP = 24
const ROW_GAP = 48
const HEX_R = 15
const CENTER_R = 50
const CENTER_C = 50
const DIST_TOL = 1e-6

const ATOM_COLORS = {
  black: '#2a2a30',
  red: '#c84646',
  blue: '#4678c8',
  green: '#46a064',
}

function toPx(r, c, scale, ox, oy) {
  const { x, y } = pointToXy(r, c)
  return { x: ox + x * scale, y: oy + y * scale }
}

const DRAG_THRESHOLD = 4

function CellView({
  cell,
  player,
  cellIndex,
  rect,
  state,
  selectedColor,
  onClick,
  clipId,
  gridScaleDenom,
  pan,
  onPan,
  onDragStart,
  onDragEnd,
  interactionMode,
  isAttackHighlight,
}) {
  const { x, y, w, h } = rect
  const denom = Math.max(3, Math.min(10, gridScaleDenom ?? 4))
  const scale = Math.min(w, h) / denom
  const cx = x + w / 2
  const cy = y + h / 2
  const baseOx = cx - pointToXy(CENTER_R, CENTER_C).x * scale
  const baseOy = cy - pointToXy(CENTER_R, CENTER_C).y * scale
  const ox = baseOx + (pan?.dx ?? 0)
  const oy = baseOy + (pan?.dy ?? 0)

  const isDragMode = interactionMode === 'drag'

  const handlePointerDown = (e) => {
    if (!isDragMode) return
    e.target.setPointerCapture?.(e.pointerId)
    onDragStart?.(player, cellIndex, e.clientX, e.clientY)
  }

  const handlePointerMove = (e) => {
    if (!isDragMode) return
    onPan?.(player, cellIndex, e.clientX, e.clientY)
  }

  const handlePointerUp = (e) => {
    if (!isDragMode) return
    e.target.releasePointerCapture?.(e.pointerId)
    onDragEnd?.(player, cellIndex)
  }

  const handleClick = (e) => {
    if (e.defaultPrevented) return
    if (isDragMode) return
    const svg = e.target.closest('svg')
    if (!svg) return
    const rectSvg = svg.getBoundingClientRect()
    const px = e.clientX - rectSvg.left
    const py = e.clientY - rectSvg.top
    const pt = pixelToGrid(px, py, scale, ox, oy, cell.grid)
    const viewCenter = pixelToGrid(cx, cy, scale, ox, oy, cell.grid)
    onClick?.(player, cellIndex, pt?.[0] ?? null, pt?.[1] ?? null, viewCenter)
  }

  const gridPoints = useMemo(() => cell.grid.allPoints(), [cell])
  const gridEdges = useMemo(() => {
    const seen = new Set()
    const edges = []
    for (const [r, c] of gridPoints) {
      for (const [nr, nc] of neighbors(r, c)) {
        if (!cell.grid.inBounds(nr, nc)) continue
        if (Math.abs(distanceBetween([r, c], [nr, nc]) - 1.0) >= DIST_TOL) continue
        const a = [r, c].join(',')
        const b = [nr, nc].join(',')
        const key = a < b ? `${a}-${b}` : `${b}-${a}`
        if (seen.has(key)) continue
        seen.add(key)
        edges.push([[r, c], [nr, nc]])
      }
    }
    return edges
  }, [cell, gridPoints])

  const atoms = cell.allAtoms()
  const atk = attackPower(cell)
  const def = defensePower(cell)
  let redY = 0
  let blueY = 0
  let greenY = 0
  for (const [[r, c], color] of atoms) {
    const y = cell.countBlackNeighbors(r, c)
    if (color === ATOM_RED) redY += y
    else if (color === ATOM_BLUE) blueY += y
    else if (color === ATOM_GREEN) greenY += y
  }

  return (
    <g
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={isDragMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={x} y={y} width={w} height={h} />
        </clipPath>
      </defs>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="#f5ebd2"
        stroke={isAttackHighlight ? '#c84646' : '#50463c'}
        strokeWidth={isAttackHighlight ? 4 : 2}
      />
      <g clipPath={clipId ? `url(#${clipId})` : undefined}>
        {gridEdges.map(([[r1, c1], [r2, c2]], i) => {
          const p1 = toPx(r1, c1, scale, ox, oy)
          const p2 = toPx(r2, c2, scale, ox, oy)
          return (
            <line
              key={i}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke="#5c6a7a"
              strokeWidth={Math.max(1, scale * 0.08)}
            />
          )
        })}
        {gridPoints.map(([r, c]) => {
          const p = toPx(r, c, scale, ox, oy)
          const hasAtom = atoms.some(([[ar, ac]]) => ar === r && ac === c)
          const dotR = hasAtom ? 0 : Math.max(1, scale * 0.1)
          const fill = hasAtom ? 'transparent' : '#8a9c78'
          if (dotR <= 0) return null
          return (
            <circle
              key={`dot-${r},${c}`}
              cx={p.x}
              cy={p.y}
              r={dotR}
              fill={fill}
            />
          )
        })}
        {atoms.map(([[r, c], color]) => {
          const p = toPx(r, c, scale, ox, oy)
          const fill = ATOM_COLORS[color] ?? '#888'
          return (
            <circle
              key={`${r},${c}`}
              cx={p.x}
              cy={p.y}
              r={scale * 0.32}
              fill={fill}
              stroke="#333"
            />
          )
        })}
      </g>
      <rect
        x={x}
        y={y + h}
        width={w}
        height={44}
        fill="#2d3748"
        stroke="#4a5568"
        strokeWidth="1"
      />
      <text
        x={cx}
        y={y + h + 16}
        textAnchor="middle"
        fill="#fff"
        fontSize="12"
      >
        ATK: {atk.toFixed(1)}, DEF: {def.toFixed(1)}
      </text>
      <text
        x={cx}
        y={y + h + 34}
        textAnchor="middle"
        fill="#e2e8f0"
        fontSize="11"
      >
        红: {redY}  蓝: {blueY}  绿: {greenY}
      </text>
    </g>
  )
}

function cellKey(p, i) {
  return `${p}-${i}`
}

export default function Board({
  state,
  selectedColor,
  onClick: onCellClick,
  gridScaleDenom,
  interactionMode = 'operate',
  attackHighlightCell = null,
}) {
  const cur = state.currentPlayer
  const opp = 1 - cur
  const [viewPan, setViewPan] = useState({})
  const dragRef = useRef(null)

  const getPan = useCallback((p, i) => viewPan[cellKey(p, i)] ?? { dx: 0, dy: 0 }, [viewPan])

  const handleDragStart = useCallback((player, cellIndex, clientX, clientY) => {
    const key = cellKey(player, cellIndex)
    const current = viewPan[key] ?? { dx: 0, dy: 0 }
    dragRef.current = { player, cellIndex, startX: clientX, startY: clientY, startDx: current.dx, startDy: current.dy }
  }, [viewPan])

  const handlePan = useCallback((player, cellIndex, clientX, clientY) => {
    const d = dragRef.current
    if (!d || d.player !== player || d.cellIndex !== cellIndex) return
    const dx = d.startDx + (clientX - d.startX)
    const dy = d.startDy + (clientY - d.startY)
    d.didMove = d.didMove || Math.abs(clientX - d.startX) > DRAG_THRESHOLD || Math.abs(clientY - d.startY) > DRAG_THRESHOLD
    setViewPan((prev) => ({ ...prev, [cellKey(player, cellIndex)]: { dx, dy } }))
  }, [])

  const justDraggedRef = useRef(false)

  const handleDragEnd = useCallback(() => {
    justDraggedRef.current = dragRef.current?.didMove ?? false
    dragRef.current = null
  }, [])

  const wrappedOnClick = useCallback((player, cellIndex, r, c, viewCenter) => {
    if (justDraggedRef.current) {
      justDraggedRef.current = false
      return
    }
    onCellClick?.(player, cellIndex, r, c, viewCenter)
  }, [onCellClick])

  const layout = useMemo(() => {
    const totalW = 3 * CELL_W + 2 * GAP
    const totalH = 2 * CELL_H + ROW_GAP
    const left = 24
    const top = 24
    const row1 = Array.from({ length: 3 }, (_, i) => ({
      x: left + i * (CELL_W + GAP),
      y: top,
      w: CELL_W,
      h: CELL_H,
    }))
    const row0 = Array.from({ length: 3 }, (_, i) => ({
      x: left + i * (CELL_W + GAP),
      y: top + CELL_H + ROW_GAP,
      w: CELL_W,
      h: CELL_H,
    }))
    return [row0, row1]
  }, [])

  const LABEL_H = 44
  const width = 3 * CELL_W + 2 * GAP + 48
  const height = 2 * (CELL_H + LABEL_H) + ROW_GAP + 24

  return (
    <svg width={width} height={height} className="select-none flex-shrink-0">
      <text x={8} y={layout[1][0].y + CELL_H / 2} fill="#ccc" fontSize="12">
        P{opp}
      </text>
      {layout[1].map((rect, i) => (
        <CellView
          key={`1-${i}`}
          cell={state.cells[opp][i]}
          player={opp}
          cellIndex={i}
          rect={rect}
          state={state}
          selectedColor={selectedColor}
          onClick={wrappedOnClick}
          clipId={`clip-1-${i}`}
          gridScaleDenom={gridScaleDenom}
          interactionMode={interactionMode}
          pan={getPan(opp, i)}
          onDragStart={handleDragStart}
          onPan={handlePan}
          onDragEnd={handleDragEnd}
          isAttackHighlight={attackHighlightCell?.player === opp && attackHighlightCell?.cellIndex === i}
        />
      ))}
      <text x={8} y={layout[0][0].y + CELL_H / 2} fill="#ccc" fontSize="12">
        P{cur}
      </text>
      {layout[0].map((rect, i) => (
        <CellView
          key={`0-${i}`}
          cell={state.cells[cur][i]}
          player={cur}
          cellIndex={i}
          rect={rect}
          state={state}
          selectedColor={selectedColor}
          onClick={wrappedOnClick}
          clipId={`clip-0-${i}`}
          gridScaleDenom={gridScaleDenom}
          interactionMode={interactionMode}
          pan={getPan(cur, i)}
          onDragStart={handleDragStart}
          onPan={handlePan}
          onDragEnd={handleDragEnd}
          isAttackHighlight={attackHighlightCell?.player === cur && attackHighlightCell?.cellIndex === i}
        />
      ))}
    </svg>
  )
}
