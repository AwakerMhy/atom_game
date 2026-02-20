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
from src.grid.triangle import (
    point_to_xy,
    neighbors,
    distance_between,
    GridPoint,
    hexagon_corners_offset,
)

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
    view_pan_px: Tuple[float, float] = (0.0, 0.0),
    grid_scale_denom: int = 4,
) -> Tuple[float, float, float, float]:
    """
    三角形边长 = 格子边长的 1/grid_scale_denom（3~10 可调）；可见窗口中心对齐到 rect 中心。
    view_pan_px: (px, py) 像素偏移，使网格相对屏幕连续滑动。
    """
    r0, c0 = view_origin
    pan_x, pan_y = view_pan_px
    rw, rh = rect[2], rect[3]
    cx = rect[0] + rw / 2.0
    cy = rect[1] + rh / 2.0
    cell_side = min(rw, rh, CELL_SIDE_FOR_SCALE)
    denom = max(3, min(10, grid_scale_denom))
    scale = cell_side / float(denom)
    r_center = r0 + VISIBLE_GRID_ROWS // 2
    c_center = c0 + VISIBLE_GRID_COLS // 2
    x_c, y_c = point_to_xy(r_center, c_center)
    ox = cx - x_c * scale + pan_x
    oy = cy - y_c * scale + pan_y
    return scale, ox, oy


def get_scale_for_cell(
    rect: Tuple[int, int, int, int],
    view_origin: Tuple[int, int],
    grid_scale_denom: int = 4,
) -> float:
    """用于主循环将拖动像素差转为网格差（视角拖动）。"""
    scale, _, _ = _grid_transform_view(rect, view_origin, (0.0, 0.0), grid_scale_denom)
    return scale


def clamp_view_origin(
    r0: int, c0: int,
    rows: int = DEFAULT_GRID_ROWS,
    cols: int = DEFAULT_GRID_COLS,
    visible_rows: int = VISIBLE_GRID_ROWS,
    visible_cols: int = VISIBLE_GRID_COLS,
) -> Tuple[int, int]:
    """将视窗原点限制在有效范围内，使可见窗口不越出网格。"""
    r0 = max(0, min(r0, rows - visible_rows))
    c0 = max(0, min(c0, cols - visible_cols))
    return (r0, c0)


def _to_screen(
    r: int, c: int, scale: float, ox: float, oy: float
) -> Tuple[float, float]:
    x, y = point_to_xy(r, c)
    return (ox + x * scale, oy + y * scale)


def hexagon_screen_polygon(
    cell_rect: Tuple[int, int, int, int],
    view_origin: Tuple[int, int],
    view_pan_px: Tuple[float, float] = (0.0, 0.0),
    center_r: int = GRID_CENTER_R,
    center_c: int = GRID_CENTER_C,
    radius: int = HEX_RADIUS,
    grid_scale_denom: int = 4,
) -> List[Tuple[float, float]]:
    """
    返回正六边形在屏幕坐标系下的 6 个顶点（与 point_to_xy、hex_distance 一致），
    用于绘制与格点对齐的六边形背景。
    """
    scale, ox, oy = _grid_transform_view(cell_rect, view_origin, view_pan_px, grid_scale_denom)
    corners = hexagon_corners_offset(center_r, center_c, radius)
    out = []
    for r, c in corners:
        x, y = point_to_xy(r, c)
        out.append((ox + x * scale, oy + y * scale))
    return out


def _visible_window_screen_polygon(
    cell_rect: Tuple[int, int, int, int],
    view_origin: Tuple[int, int],
    view_pan_px: Tuple[float, float],
    grid_scale_denom: int,
) -> List[Tuple[float, float]]:
    """可见窗口 [r0..r1)[c0..c1) 在屏幕坐标系下的平行四边形（与 draw_cell_grid 一致）。"""
    r0, c0 = view_origin
    r1 = r0 + VISIBLE_GRID_ROWS
    c1 = c0 + VISIBLE_GRID_COLS
    scale, ox, oy = _grid_transform_view(cell_rect, view_origin, view_pan_px, grid_scale_denom)
    # 四角逆时针（屏幕 y 向下）：左上→左下→右下→右上，使“内侧”在边左侧
    corners = [(r0, c0), (r1 - 1, c0), (r1 - 1, c1 - 1), (r0, c1 - 1)]
    return [_to_screen(r, c, scale, ox, oy) for r, c in corners]


def _clip_polygon_by_convex(
    subject: List[Tuple[float, float]],
    clip: List[Tuple[float, float]],
) -> List[Tuple[float, float]]:
    """Sutherland-Hodgman：用凸多边形 clip 裁剪 subject，返回 subject ∩ clip。"""
    if not subject or not clip:
        return []
    out = list(subject)
    for i in range(len(clip)):
        a, b = clip[i], clip[(i + 1) % len(clip)]
        ax, ay = a
        bx, by = b
        edge_x, edge_y = bx - ax, by - ay
        new_out = []
        for j in range(len(out)):
            p = out[j]
            q = out[(j + 1) % len(out)]
            px, py = p
            qx, qy = q
            # 点 p 在 clip 边 (a->b) 的“内侧”：屏幕 y 向下时可见矩形为顺时针，内侧在边右侧
            side_p = edge_x * (py - ay) - edge_y * (px - ax)
            side_q = edge_x * (qy - ay) - edge_y * (qx - ax)
            if side_p <= 0:
                new_out.append(p)
            if (side_p <= 0) != (side_q <= 0) and (side_p - side_q) != 0:
                t = side_p / (side_p - side_q)
                new_out.append((px + t * (qx - px), py + t * (qy - py)))
        out = new_out
        if not out:
            return []
    return out


def cell_beige_region_polygon(
    cell_rect: Tuple[int, int, int, int],
    view_origin: Tuple[int, int],
    view_pan_px: Tuple[float, float] = (0.0, 0.0),
    center_r: int = GRID_CENTER_R,
    center_c: int = GRID_CENTER_C,
    radius: int = HEX_RADIUS,
    grid_scale_denom: int = 4,
) -> List[Tuple[float, float]]:
    """
    返回“可见窗口 ∩ 六边形”在屏幕坐标系下的多边形顶点，
    使米色背景与可见格点区域一致。
    """
    hex_poly = hexagon_screen_polygon(
        cell_rect, view_origin, view_pan_px, center_r, center_c, radius, grid_scale_denom
    )
    visible_poly = _visible_window_screen_polygon(cell_rect, view_origin, view_pan_px, grid_scale_denom)
    return _clip_polygon_by_convex(hex_poly, visible_poly)


def grid_point_to_screen(
    cell_rect: Tuple[int, int, int, int],
    view_origin: Tuple[int, int],
    r: int,
    c: int,
    view_pan_px: Tuple[float, float] = (0.0, 0.0),
    grid_scale_denom: int = 4,
) -> Tuple[float, float]:
    """将格点 (r, c) 转为该格在屏幕上的像素坐标。"""
    scale, ox, oy = _grid_transform_view(cell_rect, view_origin, view_pan_px, grid_scale_denom)
    return _to_screen(r, c, scale, ox, oy)


def screen_to_grid(
    cell_rect: Tuple[int, int, int, int],
    view_origin: Tuple[int, int],
    screen_x: float,
    screen_y: float,
    view_pan_px: Tuple[float, float] = (0.0, 0.0),
    rows: int = DEFAULT_GRID_ROWS,
    cols: int = DEFAULT_GRID_COLS,
    grid_scale_denom: int = 4,
) -> Optional[Tuple[int, int]]:
    """将屏幕坐标转换为格点 (r, c)；越界时钳位到有效范围。"""
    scale, ox, oy = _grid_transform_view(cell_rect, view_origin, view_pan_px, grid_scale_denom)
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
    highlight_points_red: Optional[Set[GridPoint]] = None,
    highlight_points_blue: Optional[Set[GridPoint]] = None,
    view_pan_px: Tuple[float, float] = (0.0, 0.0),
    grid_scale_denom: int = 4,
) -> None:
    """
    在 cell_rect 内绘制正三角形网格、格点与原子。
    仅绘制在 valid_points 内且位于可见窗口内的点。
    view_pan_px: 像素偏移，使网格相对屏幕连续滑动。
    """
    r0, c0 = view_origin
    scale, ox, oy = _grid_transform_view(cell_rect, view_origin, view_pan_px, grid_scale_denom)
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

    # 格点小圆：无原子的节点画小一点、颜色浅一点；有原子的由下面原子圆绘制
    radius_empty = max(1, int(scale * 0.12))
    color_empty = (130, 138, 155)
    for r in range(r0, r1):
        for c in range(c0, c1):
            if not in_view(r, c):
                continue
            if (r, c) in cell_atoms:
                continue
            pos = _to_screen(r, c, scale, ox, oy)
            pygame.draw.circle(screen, color_empty, (int(pos[0]), int(pos[1])), radius_empty)

    # 原子与高亮
    atom_radius = max(3, int(scale * 0.26))
    highlight_set = highlight_points or set()
    highlight_red_set = highlight_points_red if highlight_points_red is not None else set()
    highlight_blue_set = highlight_points_blue if highlight_points_blue is not None else set()
    for (r, c), color in cell_atoms.items():
        if not in_view(r, c):
            continue
        xy = _to_screen(r, c, scale, ox, oy)
        pos = (int(xy[0]), int(xy[1]))
        key = ATOM_COLOR_KEYS.get(color, "atom_black")
        pygame.draw.circle(screen, COLORS[key], pos, atom_radius)
        pygame.draw.circle(screen, COLORS["grid_line"], pos, atom_radius, 1)
        if (r, c) in highlight_red_set:
            pygame.draw.circle(screen, (255, 80, 80), pos, atom_radius + 4, 2)
        elif (r, c) in highlight_blue_set:
            pygame.draw.circle(screen, (80, 120, 255), pos, atom_radius + 4, 2)
        elif (r, c) in highlight_set:
            pygame.draw.circle(screen, (255, 220, 80), pos, atom_radius + 4, 2)
