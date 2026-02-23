import { useMemo, useState, useRef, useCallback } from 'react'
import { pointToXy, neighbors, distanceBetween } from '../game/grid.js'
import { pixelToGrid } from '../utils/hex.js'
import { attackPower, defensePower } from '../game/combat.js'
import { ATOM_BLACK, ATOM_RED, ATOM_BLUE, ATOM_GREEN, ATOM_YELLOW, ATOM_GRAY } from '../game/config.js'
import { isBlackProtected, isBlackYellowPriority } from '../game/state.js'

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
  yellow: '#c8a832',
  purple: '#7c3aed',
  white: '#e8e8e8',
  gray: '#6b7280',
}

function toPx(r, c, scale, ox, oy) {
  const { x, y } = pointToXy(r, c)
  return { x: ox + x * scale, y: oy + y * scale }
}

const DRAG_THRESHOLD = 4

const COMPONENT_COLORS = ['#f59e0b', '#06b6d4', '#ec4899', '#22c55e', '#8b5cf6']

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
  connectivityChoiceCell,
  destroyingAtoms = [],
  effectFlashAtom = null,
  effectPendingAtom = null,
  testMode = false,
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
    let pt = pixelToGrid(px, py, scale, ox, oy, cell.grid)
    if (selectedColor === 'white' && (!pt || cell.get(pt[0], pt[1]) == null)) {
      const atoms = cell.allAtoms()
      if (atoms.length > 0) {
        const hitRadius = scale * 0.6
        let best = null
        let bestD = hitRadius * hitRadius
        for (const [[r, c]] of atoms) {
          const p = toPx(r, c, scale, ox, oy)
          const d = (p.x - px) ** 2 + (p.y - py) ** 2
          if (d < bestD) {
            bestD = d
            best = [r, c]
          }
        }
        if (best) pt = best
      }
    }
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
  const occupiedPoints = useMemo(() => new Set(atoms.map(([[r, c]]) => `${r},${c}`)), [atoms])
  const graySilencedInCell = useMemo(() => {
    const until = state?.graySilencedUntilTurn?.[player]
    if (until == null || state?.turnNumber >= until) return new Set()
    const points = state?.graySilencedPoints?.[player]
    if (!points) return new Set()
    const prefix = `${cellIndex}:`
    const set = new Set()
    points.forEach((key) => {
      if (key.startsWith(prefix)) set.add(key.slice(prefix.length))
    })
    return set
  }, [state, player, cellIndex, state?.graySilencedPoints, state?.graySilencedUntilTurn, state?.turnNumber])
  const grayPreviewSilence = useMemo(() => {
    if (effectPendingAtom?.color !== 'gray' || effectPendingAtom?.player !== player || effectPendingAtom?.cellIndex !== cellIndex)
      return new Set()
    const set = new Set()
    for (const [nr, nc] of cell.grid.neighborsOf(effectPendingAtom.r, effectPendingAtom.c)) {
      set.add(`${nr},${nc}`)
    }
    return set
  }, [effectPendingAtom, player, cellIndex, cell])
  const atk = attackPower(cell)
  const def = defensePower(cell)
  let redY = 0
  let blueY = 0
  let greenY = 0
  let yellowY = 0
  let purpleCount = 0
  let grayCount = 0
  for (const [[r, c], color] of atoms) {
    const y = cell.effectiveBlackNeighborCount(r, c)
    if (color === ATOM_RED) redY += y
    else if (color === ATOM_BLUE) blueY += y
    else if (color === ATOM_GREEN) greenY += y
    else if (color === ATOM_YELLOW) yellowY += y
    else if (color === 'purple') purpleCount += 1
    else if (color === ATOM_GRAY) grayCount += 1
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
          const bothHaveAtom = occupiedPoints.has(`${r1},${c1}`) && occupiedPoints.has(`${r2},${c2}`)
          return (
            <line
              key={i}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke="#5c6a7a"
              strokeWidth={Math.max(1, scale * (bothHaveAtom ? 0.08 : 0.06))}
              strokeOpacity={bothHaveAtom ? 1 : 0.28}
              strokeDasharray={bothHaveAtom ? undefined : '3 4'}
            />
          )
        })}
        {gridPoints.map(([r, c]) => {
          const p = toPx(r, c, scale, ox, oy)
          const hasAtom = atoms.some(([[ar, ac]]) => ar === r && ac === c)
          const dotR = hasAtom ? 0 : Math.max(1, scale * 0.1)
          const fill = hasAtom ? 'transparent' : '#8a9c78'
          const isGraySilenced = graySilencedInCell.has(`${r},${c}`) || grayPreviewSilence.has(`${r},${c}`)
          if (dotR <= 0 && !isGraySilenced) return null
          return (
            <g key={`dot-${r},${c}`}>
              {dotR > 0 && (
                <circle cx={p.x} cy={p.y} r={dotR} fill={fill} />
              )}
              {isGraySilenced && (
                <circle cx={p.x} cy={p.y} r={scale * 0.34} fill="none" stroke="#6b7280" strokeWidth={scale * 0.06} strokeOpacity={0.9} />
              )}
            </g>
          )
        })}
        {destroyingAtoms.map(({ r, c, color }) => {
          const p = toPx(r, c, scale, ox, oy)
          const fill = ATOM_COLORS[color] ?? '#888'
          return (
            <g key={`destroy-${r},${c}`} className="atom-destroying" style={{ transformOrigin: `${p.x}px ${p.y}px` }}>
              <circle cx={p.x} cy={p.y} r={scale * 0.34} fill={fill} stroke="#333" />
            </g>
          )
        })}
        {atoms.map(([[r, c], color]) => {
          const p = toPx(r, c, scale, ox, oy)
          const fill = ATOM_COLORS[color] ?? '#888'
          const isEffectFlash = effectFlashAtom && effectFlashAtom.player === player && effectFlashAtom.cellIndex === cellIndex && effectFlashAtom.r === r && effectFlashAtom.c === c
          const isEffectPending = effectPendingAtom && effectPendingAtom.player === player && effectPendingAtom.cellIndex === cellIndex && effectPendingAtom.r === r && effectPendingAtom.c === c
          const compIdx = connectivityChoiceCell?.components?.findIndex((comp) => comp.includes(`${r},${c}`))
          const compColor = compIdx >= 0 ? COMPONENT_COLORS[compIdx % COMPONENT_COLORS.length] : null
          const protectedByBlue = color === ATOM_BLACK && state && isBlackProtected(state, player, cellIndex, [r, c])
          const yellowPriority = color === ATOM_BLACK && state && isBlackYellowPriority(state, player, cellIndex, [r, c])
          const bothBlueAndYellow = protectedByBlue && yellowPriority
          const ringR = scale * 0.34
          const ringW = scale * 0.06
          return (
            <g key={`${r},${c}`}>
              {compColor != null && (
                <circle cx={p.x} cy={p.y} r={scale * 0.36} fill={compColor} fillOpacity={0.4} stroke={compColor} strokeWidth={2} />
              )}
              {bothBlueAndYellow ? (
                <g>
                  <circle cx={p.x} cy={p.y} r={ringR} fill="none" stroke="#c8a832" strokeWidth={ringW} strokeOpacity={0.9} strokeDasharray="6 6" strokeDashoffset={0} />
                  <circle cx={p.x} cy={p.y} r={ringR} fill="none" stroke="#4678c8" strokeWidth={ringW} strokeOpacity={0.9} strokeDasharray="6 6" strokeDashoffset={6} />
                </g>
              ) : (
                <>
                  {yellowPriority && (
                    <circle cx={p.x} cy={p.y} r={ringR} fill="none" stroke="#c8a832" strokeWidth={ringW} strokeOpacity={0.9} />
                  )}
                  {protectedByBlue && (
                    <circle cx={p.x} cy={p.y} r={ringR} fill="none" stroke="#4678c8" strokeWidth={ringW} strokeOpacity={0.9} />
                  )}
                </>
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={scale * 0.28}
                fill={fill}
                stroke={protectedByBlue ? '#4678c8' : yellowPriority ? '#c8a832' : '#333'}
                className={isEffectFlash ? 'atom-effect-flash' : undefined}
              />
              {isEffectPending && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={ringR + ringW}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth={ringW * 1.5}
                  strokeOpacity={0.95}
                />
              )}
            </g>
          )
        })}
        {connectivityChoiceCell?.components?.map((comp, i) => {
          if (!comp?.length) return null
          const pts = comp.map((k) => k.split(',').map(Number))
          const avgR = pts.reduce((s, [r]) => s + r, 0) / pts.length
          const avgC = pts.reduce((s, [, c]) => s + c, 0) / pts.length
          const cen = toPx(avgR, avgC, scale, ox, oy)
          const col = COMPONENT_COLORS[i % COMPONENT_COLORS.length]
          return (
            <g key={`comp-${i}`}>
              <circle cx={cen.x} cy={cen.y} r={scale * 0.44} fill={col} fillOpacity={0.6} stroke={col} strokeWidth={2} />
              <text x={cen.x} y={cen.y} textAnchor="middle" dominantBaseline="middle" fill="#111" fontSize={scale * 0.5} fontWeight="bold">
                {i + 1}
              </text>
            </g>
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
        红: {redY}  蓝: {blueY}  绿: {greenY}  黄: {yellowY}  紫: {purpleCount}  灰: {grayCount}
        {testMode && (
          <tspan fill="#fbbf24" fontWeight="bold">
            {'  |  连通: '}{cell.connectedComponents().length}
            {cell.hasBlack() ? `  黑连通: ${cell.blackConnectedComponents().length}` : ''}
          </tspan>
        )}
      </text>
    </g>
  )
}

function cellKey(p, i) {
  return `${p}-${i}`
}

function Board({
  state,
  selectedColor,
  onClick: onCellClick,
  gridScaleDenom,
  interactionMode = 'operate',
  attackHighlightCell = null,
  connectivityChoice = null,
  destroyingAtoms = [],
  effectFlashAtom = null,
  effectPendingAtom = null,
  actionSubstate = null,
  attackMyCell = null,
  attackEnemyCell = null,
  testMode = false,
}) {
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

  const INFO_H = 44
  const numCells = state.cells[0]?.length ?? 3
  const layout = useMemo(() => {
    const left = 24
    const top0 = 24
    const row1Y = 0
    const row1 = Array.from({ length: numCells }, (_, i) => ({
      x: left + i * (CELL_W + GAP),
      y: row1Y,
      w: CELL_W,
      h: CELL_H,
    }))
    const row0 = Array.from({ length: numCells }, (_, i) => ({
      x: left + i * (CELL_W + GAP),
      y: top0 + CELL_H + ROW_GAP,
      w: CELL_W,
      h: CELL_H,
    }))
    return [row0, row1]
  }, [numCells])

  const LABEL_H = 44
  const width = numCells * CELL_W + Math.max(0, numCells - 1) * GAP + 48
  const height = 2 * (CELL_H + LABEL_H) + ROW_GAP + 24

  const p1Bottom = layout[1][0].y + CELL_H + INFO_H
  const p0Top = layout[0][0].y
  const dividerY = (p1Bottom + p0Top) / 2
  const dividerLeft = -32
  const dividerRight = width + 32
  const currentPlayer = state.currentPlayer
  const rowBlockH = CELL_H + INFO_H
  const highlightPad = 24

  const showAttackArrow = actionSubstate === 'attack_confirm' && attackMyCell && attackEnemyCell
  const attackFromRect = showAttackArrow ? layout[attackMyCell[0]][attackMyCell[1]] : null
  const attackToRect = showAttackArrow ? layout[attackEnemyCell[0]][attackEnemyCell[1]] : null
  const arrowFrom = attackFromRect
    ? { x: attackFromRect.x + attackFromRect.w / 2, y: attackFromRect.y + attackFromRect.h / 2 }
    : null
  const arrowTo = attackToRect
    ? { x: attackToRect.x + attackToRect.w / 2, y: attackToRect.y + attackToRect.h / 2 }
    : null

  return (
    <svg width={width} height={height} className="select-none flex-shrink-0" style={{ overflow: 'visible' }}>
      <defs>
        <marker
          id="attack-arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="#c84646" stroke="#8b2a2a" strokeWidth="1" />
        </marker>
      </defs>
      {showAttackArrow && arrowFrom && arrowTo && (
        <line
          x1={arrowFrom.x}
          y1={arrowFrom.y}
          x2={arrowTo.x}
          y2={arrowTo.y}
          stroke="#c84646"
          strokeWidth="3"
          markerEnd="url(#attack-arrowhead)"
        />
      )}
      {currentPlayer === 1 && (
        <rect x={-highlightPad} y={layout[1][0].y} width={width + highlightPad * 2} height={rowBlockH} fill="rgba(100, 140, 200, 0.1)" rx={4} />
      )}
      {currentPlayer === 0 && (
        <rect x={-highlightPad} y={layout[0][0].y} width={width + highlightPad * 2} height={rowBlockH} fill="rgba(100, 140, 200, 0.1)" rx={4} />
      )}
      <text x={-17} y={layout[1][0].y + CELL_H / 2} fill="#ccc" fontSize="18" fontWeight="bold">
        P1
      </text>
      {layout[1].map((rect, i) => (
        <CellView
          key={`1-${i}`}
          cell={state.cells[1][i]}
          player={1}
          cellIndex={i}
          connectivityChoiceCell={connectivityChoice?.defender === 1 && connectivityChoice?.cellIndex === i ? connectivityChoice : null}
          rect={rect}
          state={state}
          selectedColor={selectedColor}
          onClick={wrappedOnClick}
          clipId={`clip-1-${i}`}
          gridScaleDenom={gridScaleDenom}
          interactionMode={interactionMode}
          pan={getPan(1, i)}
          onDragStart={handleDragStart}
          onPan={handlePan}
          onDragEnd={handleDragEnd}
          isAttackHighlight={attackHighlightCell?.player === 1 && attackHighlightCell?.cellIndex === i}
          destroyingAtoms={destroyingAtoms.filter((d) => d.defender === 1 && d.cellIndex === i)}
          effectFlashAtom={effectFlashAtom}
          effectPendingAtom={effectPendingAtom}
          testMode={testMode}
        />
      ))}
      <line x1={dividerLeft} y1={dividerY} x2={dividerRight} y2={dividerY} stroke="#555" strokeWidth={1} strokeDasharray="4 4" />
      <text x={-17} y={layout[0][0].y + CELL_H / 2} fill="#ccc" fontSize="18" fontWeight="bold">
        P0
      </text>
      {layout[0].map((rect, i) => (
        <CellView
          key={`0-${i}`}
          cell={state.cells[0][i]}
          player={0}
          cellIndex={i}
          connectivityChoiceCell={connectivityChoice?.defender === 0 && connectivityChoice?.cellIndex === i ? connectivityChoice : null}
          rect={rect}
          state={state}
          selectedColor={selectedColor}
          onClick={wrappedOnClick}
          clipId={`clip-0-${i}`}
          gridScaleDenom={gridScaleDenom}
          interactionMode={interactionMode}
          pan={getPan(0, i)}
          onDragStart={handleDragStart}
          onPan={handlePan}
          onDragEnd={handleDragEnd}
          isAttackHighlight={attackHighlightCell?.player === 0 && attackHighlightCell?.cellIndex === i}
          destroyingAtoms={destroyingAtoms.filter((d) => d.defender === 0 && d.cellIndex === i)}
          effectFlashAtom={effectFlashAtom}
          effectPendingAtom={effectPendingAtom}
          testMode={testMode}
        />
      ))}
    </svg>
  )
}

export default Board
