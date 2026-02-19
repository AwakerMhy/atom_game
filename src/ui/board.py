"""
绘制双方场地：每方 3 个格子，并返回各格 rect 供点击检测。
"""
from typing import List, Tuple, Optional, Dict, Set
import pygame
from src.config import SCREEN_WIDTH, SCREEN_HEIGHT, DEFAULT_GRID_ROWS, DEFAULT_GRID_COLS
from src.ui.grid_render import draw_cell_grid, screen_to_grid
from src.grid.cell import Cell
from src.grid.triangle import GridPoint


# 每格占用的像素宽高（估算）
CELL_W = 220
CELL_H = 200
GAP = 16


def layout_cell_rects() -> List[List[Tuple[int, int, int, int]]]:
    """
    返回 [玩家0的3个rect, 玩家1的3个rect]。
    玩家0在下方，玩家1在上方；每行 3 格横向排列。
    """
    # 下方：玩家 0
    y0 = SCREEN_HEIGHT - GAP - CELL_H
    row0 = [
        (GAP + i * (CELL_W + GAP), y0, CELL_W, CELL_H)
        for i in range(3)
    ]
    # 上方：玩家 1
    y1 = GAP
    row1 = [
        (GAP + i * (CELL_W + GAP), y1, CELL_W, CELL_H)
        for i in range(3)
    ]
    return [row0, row1]


def draw_board(
    screen: pygame.Surface,
    cells: List[List[Cell]],
    highlight_cell: Optional[Tuple[int, int]] = None,
    current_player: Optional[int] = None,
    highlight_atoms_by_cell: Optional[Dict[int, Set[GridPoint]]] = None,
) -> List[List[Tuple[int, int, int, int]]]:
    """
    绘制双方各 3 格，返回 layout_cell_rects() 的 rect 列表。
    highlight_cell: (player, cell_index) 时在该格绘制高亮边框。
    current_player + highlight_atoms_by_cell: 该玩家本回合新放原子按 cell_index 高亮。
    """
    rects = layout_cell_rects()
    for player in range(2):
        for cell_index in range(3):
            rect = rects[player][cell_index]
            atoms = cells[player][cell_index].all_atoms()
            hp = None
            if current_player is not None and highlight_atoms_by_cell is not None and player == current_player:
                hp = highlight_atoms_by_cell.get(cell_index, set())
            draw_cell_grid(
                screen,
                cell_rect=rect,
                cell_atoms=atoms,
                rows=DEFAULT_GRID_ROWS,
                cols=DEFAULT_GRID_COLS,
                highlight_points=hp,
            )
            if highlight_cell is not None and highlight_cell == (player, cell_index):
                x, y, w, h = rect
                pygame.draw.rect(screen, (255, 200, 80), (x, y, w, h), 3)
    return rects


def hit_test_cell(
    rects: List[List[Tuple[int, int, int, int]]],
    player: int,
    screen_x: int,
    screen_y: int,
) -> Optional[Tuple[int, int, int]]:
    """
    若 (screen_x, screen_y) 在指定玩家的某格内，返回 (player, cell_index, (r,c))；
    否则返回 None。需要 grid 的 rows/cols 与 rect 一致。
    """
    from src.ui.grid_render import screen_to_grid
    from src.config import DEFAULT_GRID_ROWS, DEFAULT_GRID_COLS
    row = rects[player]
    for cell_index, rect in enumerate(row):
        x, y, w, h = rect
        if x <= screen_x <= x + w and y <= screen_y <= y + h:
            pt = screen_to_grid(rect, DEFAULT_GRID_ROWS, DEFAULT_GRID_COLS, screen_x, screen_y)
            if pt is not None:
                return (player, cell_index, pt)
    return None
