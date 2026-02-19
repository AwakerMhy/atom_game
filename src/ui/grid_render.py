"""
绘制单格正三角形网格与格点、原子。
"""
import math
from typing import Dict, Tuple, Any, Optional, Set

import pygame

from src.config import COLORS, TRI_HEIGHT, DEFAULT_GRID_ROWS, DEFAULT_GRID_COLS
from src.grid.triangle import point_to_xy, neighbors, distance_between, GridPoint

# 原子颜色到 config 键
ATOM_COLOR_KEYS = {
    "black": "atom_black",
    "red": "atom_red",
    "blue": "atom_blue",
    "green": "atom_green",
}


def _grid_transform(
    rect: Tuple[int, int, int, int], rows: int, cols: int, view_offset_px: Tuple[float, float] = (0.0, 0.0)
) -> Tuple[float, float, float, float]:
    """
    计算将几何坐标映射到 rect 内像素的 scale 和偏移。
    view_offset_px: (pan_x, pan_y) 像素，拖动视角时的平移。
    """
    rw, rh = rect[2], rect[3]
    gw = cols + 0.5
    gh = rows * TRI_HEIGHT
    scale = min(rw / gw, rh / gh)
    sw = gw * scale
    sh = gh * scale
    ox = rect[0] + (rw - sw) / 2 + view_offset_px[0]
    oy = rect[1] + (rh - sh) / 2 + view_offset_px[1]
    return scale, ox, oy


def _to_screen(
    r: int, c: int, scale: float, ox: float, oy: float
) -> Tuple[float, float]:
    x, y = point_to_xy(r, c)
    return (ox + x * scale, oy + y * scale)


def screen_to_grid(
    cell_rect: Tuple[int, int, int, int],
    rows: int,
    cols: int,
    screen_x: float,
    screen_y: float,
    view_offset_px: Tuple[float, float] = (0.0, 0.0),
) -> Optional[Tuple[int, int]]:
    """将屏幕坐标转换为格点 (r, c)，若不在格点附近则返回 None。"""
    scale, ox, oy = _grid_transform(cell_rect, rows, cols, view_offset_px)
    # 反算：screen = ox + x*scale, oy + y*scale => x = (sx - ox)/scale, y = (sy - oy)/scale
    x = (screen_x - ox) / scale
    y = (screen_y - oy) / scale
    # 几何坐标 (x,y) 对应 (r,c): y = r * TRI_HEIGHT, x = c + 0.5*r => r = y/TRI_HEIGHT, c = x - 0.5*r
    r = round(y / TRI_HEIGHT)
    c = round(x - 0.5 * r)
    if 0 <= r < rows and 0 <= c < cols:
        return (r, c)
    return None


def draw_cell_grid(
    screen: pygame.Surface,
    cell_rect: Tuple[int, int, int, int],
    cell_atoms: Dict[GridPoint, str],
    rows: int = DEFAULT_GRID_ROWS,
    cols: int = DEFAULT_GRID_COLS,
    highlight_points: Optional[Set[GridPoint]] = None,
    view_offset_px: Tuple[float, float] = (0.0, 0.0),
) -> None:
    """
    在 cell_rect 内绘制正三角形网格、格点与原子。
    view_offset_px: 视角平移（像素），用于拖动视角。
    """
    scale, ox, oy = _grid_transform(cell_rect, rows, cols, view_offset_px)

    # 绘制边：仅连接“与其最接近的节点”（几何距离为 1），与 triangle 中邻居定义一致，不画错误对角线
    # 每条边只画一次：(r,c) -> (nr,nc) 仅当 (nr,nc) > (r,c) 字典序
    _tol = 1e-6
    for r in range(rows):
        for c in range(cols):
            pt = _to_screen(r, c, scale, ox, oy)
            for (nr, nc) in neighbors(r, c):
                if 0 <= nr < rows and 0 <= nc < cols:
                    if (nr, nc) <= (r, c):
                        continue
                    if abs(distance_between((r, c), (nr, nc)) - 1.0) < _tol:
                        pt2 = _to_screen(nr, nc, scale, ox, oy)
                        pygame.draw.line(
                            screen, COLORS["grid_line"], pt, pt2, 1
                        )

    # 格点小圆
    radius = max(2, int(scale * 0.2))
    for r in range(rows):
        for c in range(cols):
            pos = _to_screen(r, c, scale, ox, oy)
            pygame.draw.circle(screen, COLORS["grid_point"], (int(pos[0]), int(pos[1])), radius)

    # 原子（较小，带边框）；本回合新放的高亮
    atom_radius = max(3, int(scale * 0.26))
    highlight_set = highlight_points or set()
    for (r, c), color in cell_atoms.items():
        if 0 <= r < rows and 0 <= c < cols:
            xy = _to_screen(r, c, scale, ox, oy)
            pos = (int(xy[0]), int(xy[1]))
            key = ATOM_COLOR_KEYS.get(color, "atom_black")
            pygame.draw.circle(screen, COLORS[key], pos, atom_radius)
            pygame.draw.circle(screen, COLORS["grid_line"], pos, atom_radius, 1)
            if (r, c) in highlight_set:
                pygame.draw.circle(screen, (255, 220, 80), pos, atom_radius + 4, 2)
