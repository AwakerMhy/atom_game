"""
绘制双方场地：每方 3 个格子，并返回各格 rect 供点击检测。
"""
from typing import List, Tuple, Optional, Dict, Set
import pygame
from src.config import (
    SCREEN_WIDTH,
    SCREEN_HEIGHT,
    DEFAULT_GRID_ROWS,
    DEFAULT_GRID_COLS,
    GRID_CENTER_R,
    GRID_CENTER_C,
    VISIBLE_GRID_ROWS,
    VISIBLE_GRID_COLS,
    COLORS,
)
from src.ui.grid_render import draw_cell_grid, screen_to_grid, hexagon_screen_polygon
from src.grid.cell import Cell
from src.grid.triangle import GridPoint


# 每格占用的像素宽高
CELL_W = 220
CELL_H = 200
GAP = 16
# 格子边框宽度（外框）
CELL_FRAME_W = 4


def layout_cell_rects() -> List[List[Tuple[int, int, int, int]]]:
    """
    返回 [玩家0的3个rect, 玩家1的3个rect]。
    双方场地居中：每行 3 格横向排列，整体在屏幕水平中央；P1 在上、P0 在下，垂直居中。
    """
    total_w = 3 * CELL_W + 2 * GAP
    left = (SCREEN_WIDTH - total_w) // 2
    # 两行场地 + 中间空隙，整体垂直居中
    board_h = 2 * CELL_H + 2 * GAP
    top1 = (SCREEN_HEIGHT - board_h) // 2
    y1 = top1
    row1 = [
        (left + i * (CELL_W + GAP), y1, CELL_W, CELL_H)
        for i in range(3)
    ]
    y0 = top1 + CELL_H + 2 * GAP
    row0 = [
        (left + i * (CELL_W + GAP), y0, CELL_W, CELL_H)
        for i in range(3)
    ]
    return [row0, row1]


def _default_view_origin() -> Tuple[int, int]:
    """六边形居中时的视窗原点 (r0, c0)。"""
    r0 = max(0, GRID_CENTER_R - VISIBLE_GRID_ROWS // 2)
    c0 = max(0, GRID_CENTER_C - VISIBLE_GRID_COLS // 2)
    return (r0, c0)


def draw_board(
    screen: pygame.Surface,
    cells: List[List[Cell]],
    highlight_cell: Optional[Tuple[int, int]] = None,
    current_player: Optional[int] = None,
    highlight_atoms_by_cell: Optional[Dict[int, Set[GridPoint]]] = None,
    view_offsets: Optional[List[List[Tuple[int, int]]]] = None,
) -> List[List[Tuple[int, int, int, int]]]:
    """
    绘制双方各 3 格，返回 layout_cell_rects() 的 rect 列表。
    view_offsets: [player][cell_index] = (r0, c0) 视窗原点；None 时使用六边形居中。
    """
    rects = layout_cell_rects()
    beige = COLORS.get("cell_bg", (245, 235, 210))
    frame_color = COLORS.get("cell_frame", (80, 70, 60))
    default_vo = _default_view_origin()
    for player in range(2):
        for cell_index in range(3):
            rect = rects[player][cell_index]
            x, y, w, h = rect
            frame_rect = pygame.Rect(x - CELL_FRAME_W, y - CELL_FRAME_W, w + 2 * CELL_FRAME_W, h + 2 * CELL_FRAME_W)
            pygame.draw.rect(screen, frame_color, frame_rect)
            pygame.draw.rect(screen, (60, 55, 50), frame_rect, 2)
            view_origin = default_vo
            if view_offsets and player < len(view_offsets) and cell_index < len(view_offsets[player]):
                view_origin = view_offsets[player][cell_index]
            # 格子内先填遮蔽色，再只画六边形区域为米色，使六边形外网格被遮住
            clip_rect = pygame.Rect(x, y, w, h)
            old_clip = screen.get_clip()
            screen.set_clip(clip_rect)
            pygame.draw.rect(screen, frame_color, clip_rect)
            hex_poly = hexagon_screen_polygon(rect, view_origin)
            pygame.draw.polygon(screen, beige, [(int(px), int(py)) for px, py in hex_poly])
            cell = cells[player][cell_index]
            valid_points = set(cell.grid.all_points())
            atoms = cell.all_atoms()
            hp = None
            if current_player is not None and highlight_atoms_by_cell is not None and player == current_player:
                hp = highlight_atoms_by_cell.get(cell_index, set())
            draw_cell_grid(
                screen,
                cell_rect=rect,
                cell_atoms=atoms,
                view_origin=view_origin,
                valid_points=valid_points,
                highlight_points=hp,
            )
            screen.set_clip(old_clip)
            if highlight_cell is not None and highlight_cell == (player, cell_index):
                pygame.draw.rect(screen, (255, 200, 80), rect, 3)
    return rects


def hit_test_cell(
    rects: List[List[Tuple[int, int, int, int]]],
    player: int,
    screen_x: int,
    screen_y: int,
    view_offsets: Optional[List[List[Tuple[int, int]]]] = None,
) -> Optional[Tuple[int, int, int]]:
    """
    若 (screen_x, screen_y) 在指定玩家的某格内，返回 (player, cell_index, (r,c))。
    view_offsets 与 draw_board 一致：(r0, c0) 视窗原点。
    """
    default_vo = _default_view_origin()
    row = rects[player]
    for cell_index, rect in enumerate(row):
        x, y, w, h = rect
        if x <= screen_x <= x + w and y <= screen_y <= y + h:
            view_origin = default_vo
            if view_offsets and player < len(view_offsets) and cell_index < len(view_offsets[player]):
                view_origin = view_offsets[player][cell_index]
            pt = screen_to_grid(rect, view_origin, screen_x, screen_y)
            if pt is not None:
                return (player, cell_index, pt)
    return None
