"""
绘制单格正三角形网格与格点、原子。
支持大正六边形网格：三角形边长固定为格子边长的 1/4，仅绘制六边形内且位于可见窗口内的点。
"""
import math
from typing import Dict, Tuple, Optional, Set, List

import pygame

from src.config import (
    COLORS,
    TRI_HEIGHT,
    DEFAULT_GRID_ROWS,
    DEFAULT_GRID_COLS,
    VISIBLE_GRID_ROWS,
    VISIBLE_GRID_COLS,
    CELL_SIDE_FOR_SCALE,
    GRID_CENTER_R,
    GRID_CENTER_C,
    HEX_RADIUS,
)
from src.grid.triangle import point_to_xy, neighbors, distance_between, GridPoint

# 原子颜色到 config 键
ATOM_COLOR_KEYS = {
    "black": "atom_black",
    "red": "atom_red",
    "blue": "atom_blue",
    "green": "atom_green",
}


def _grid_transform_view(
    rect: Tuple[int, int, int, int],
    view_origin: Tuple[int, int],
) -> Tuple[float, float, float, float]:
    """
    三角形边长 = 格子边长的 1/4（固定 scale）；可见窗口中心对齐到 rect 中心。
    view_origin: (r0, c0) 可见窗口左上角格点。
    """
    r0, c0 = view_origin
    rw, rh = rect[2], rect[3]
    cx = rect[0] + rw / 2.0
    cy = rect[1] + rh / 2.0
    cell_side = min(rw, rh, CELL_SIDE_FOR_SCALE)
    scale = cell_side / 4.0
    r_center = r0 + VISIBLE_GRID_ROWS // 2
    c_center = c0 + VISIBLE_GRID_COLS // 2
    x_c, y_c = point_to_xy(r_center, c_center)
    ox = cx - x_c * scale
    oy = cy - y_c * scale
    return scale, ox, oy


def _to_screen(
    r: int, c: int, scale: float, ox: float, oy: float
) -> Tuple[float, float]:
    x, y = point_to_xy(r, c)
    return (ox + x * scale, oy + y * scale)


def hexagon_screen_polygon(
    cell_rect: Tuple[int, int, int, int],
    view_origin: Tuple[int, int],
    center_r: int = GRID_CENTER_R,
    center_c: int = GRID_CENTER_C,
    radius: int = HEX_RADIUS,
) -> List[Tuple[float, float]]:
    """
    返回正六边形在屏幕坐标系下的 6 个顶点（与当前视窗的 scale/ox/oy 一致），
    用于绘制六边形背景或遮蔽格子外的区域。
    """
    scale, ox, oy = _grid_transform_view(cell_rect, view_origin)
    # 轴向坐标下正六边形的 6 个顶点（相对中心）
    # 顺序：右、(右下)、下、(左下)、左、(左上)、上、(右上) 即绕一圈
    dr_dc = [(radius, 0), (radius, -radius), (0, -radius), (-radius, 0), (-radius, radius), (0, radius)]
    out = []
    for dr, dc in dr_dc:
        r, c = center_r + dr, center_c + dc
        x, y = point_to_xy(r, c)
        out.append((ox + x * scale, oy + y * scale))
    return out


def screen_to_grid(
    cell_rect: Tuple[int, int, int, int],
    view_origin: Tuple[int, int],
    screen_x: float,
    screen_y: float,
    rows: int = DEFAULT_GRID_ROWS,
    cols: int = DEFAULT_GRID_COLS,
) -> Optional[Tuple[int, int]]:
    """将屏幕坐标转换为格点 (r, c)；越界时钳位到有效范围。"""
    scale, ox, oy = _grid_transform_view(cell_rect, view_origin)
    x = (screen_x - ox) / scale
    y = (screen_y - oy) / scale
    r = round(y / TRI_HEIGHT)
    c = round(x - 0.5 * r)
    r = max(0, min(r, rows - 1))
    c = max(0, min(c, cols - 1))
    return (r, c)


def draw_cell_grid(
    screen: pygame.Surface,
    cell_rect: Tuple[int, int, int, int],
    cell_atoms: Dict[GridPoint, str],
    view_origin: Tuple[int, int],
    valid_points: Optional[Set[GridPoint]] = None,
    highlight_points: Optional[Set[GridPoint]] = None,
) -> None:
    """
    在 cell_rect 内绘制正三角形网格、格点与原子。
    仅绘制在 valid_points 内且位于可见窗口 [r0..r0+VISIBLE_ROWS) x [c0..c0+VISIBLE_COLS) 内的点；
    若 valid_points 为 None 则视为整个矩形网格。
    三角形边长固定为格子边长的 1/4。
    """
    r0, c0 = view_origin
    scale, ox, oy = _grid_transform_view(cell_rect, view_origin)
    r1 = r0 + VISIBLE_GRID_ROWS
    c1 = c0 + VISIBLE_GRID_COLS

    def in_view(pr: int, pc: int) -> bool:
        if not (r0 <= pr < r1 and c0 <= pc < c1):
            return False
        if valid_points is not None and (pr, pc) not in valid_points:
            return False
        return True

    _tol = 1e-6
    # 边：仅可见窗口内且与 triangle 邻居一致
    for r in range(r0, r1):
        for c in range(c0, c1):
            if not in_view(r, c):
                continue
            pt = _to_screen(r, c, scale, ox, oy)
            for (nr, nc) in neighbors(r, c):
                if not in_view(nr, nc):
                    continue
                if (nr, nc) <= (r, c):
                    continue
                if abs(distance_between((r, c), (nr, nc)) - 1.0) < _tol:
                    pt2 = _to_screen(nr, nc, scale, ox, oy)
                    pygame.draw.line(screen, COLORS["grid_line"], pt, pt2, 1)

    # 格点小圆
    radius = max(2, int(scale * 0.2))
    for r in range(r0, r1):
        for c in range(c0, c1):
            if not in_view(r, c):
                continue
            pos = _to_screen(r, c, scale, ox, oy)
            pygame.draw.circle(screen, COLORS["grid_point"], (int(pos[0]), int(pos[1])), radius)

    # 原子与高亮
    atom_radius = max(3, int(scale * 0.26))
    highlight_set = highlight_points or set()
    for (r, c), color in cell_atoms.items():
        if not in_view(r, c):
            continue
        xy = _to_screen(r, c, scale, ox, oy)
        pos = (int(xy[0]), int(xy[1]))
        key = ATOM_COLOR_KEYS.get(color, "atom_black")
        pygame.draw.circle(screen, COLORS[key], pos, atom_radius)
        pygame.draw.circle(screen, COLORS["grid_line"], pos, atom_radius, 1)
        if (r, c) in highlight_set:
            pygame.draw.circle(screen, (255, 220, 80), pos, atom_radius + 4, 2)
