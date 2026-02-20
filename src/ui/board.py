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
    get_font,
)
from src.ui.grid_render import draw_cell_grid, screen_to_grid, hexagon_screen_polygon
from src.grid.cell import Cell, ATOM_RED, ATOM_BLUE, ATOM_GREEN
from src.grid.triangle import GridPoint
from src.game import combat


# 每格占用的像素宽高
CELL_W = 220
CELL_H = 200
GAP = 32
# 双方格子上下间距（留出 ATK/DEF 与红蓝绿效果两行文字）
ROW_GAP = 90
# 场地整体向右偏移（为左侧竖排按钮留空）
BOARD_OFFSET_X = 80
# 格子边框宽度（外框）
CELL_FRAME_W = 4


def layout_cell_rects() -> List[List[Tuple[int, int, int, int]]]:
    """
    返回 [玩家0的3个rect, 玩家1的3个rect]。
    双方场地偏右、垂直居中：P1 在上、P0 在下，两行之间 ROW_GAP 间距。
    """
    total_w = 3 * CELL_W + 2 * GAP
    left = (SCREEN_WIDTH - total_w) // 2 + BOARD_OFFSET_X
    board_h = 2 * CELL_H + ROW_GAP
    top1 = (SCREEN_HEIGHT - board_h) // 2
    y1 = top1
    row1 = [
        (left + i * (CELL_W + GAP), y1, CELL_W, CELL_H)
        for i in range(3)
    ]
    y0 = top1 + CELL_H + ROW_GAP
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
    highlight_atoms_red_for_player: Optional[Tuple[int, Dict[int, Set[GridPoint]]]] = None,
    view_offsets: Optional[List[List[Tuple[int, int]]]] = None,
    view_pan_px: Optional[List[List[Tuple[float, float]]]] = None,
    grid_scale_denom: int = 4,
) -> List[List[Tuple[int, int, int, int]]]:
    """
    绘制双方各 3 格，返回 layout_cell_rects() 的 rect 列表。
    grid_scale_denom: 三角形边长与格子边长比例的分母（3~8，即 1:3 到 1:8）。
    """
    rects = layout_cell_rects()
    beige = COLORS.get("cell_bg", (245, 235, 210))
    frame_color = COLORS.get("cell_frame", (80, 70, 60))
    default_vo = _default_view_origin()
    default_pan = (0.0, 0.0)
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
            pan_px = default_pan
            if view_pan_px and player < len(view_pan_px) and cell_index < len(view_pan_px[player]):
                pan_px = view_pan_px[player][cell_index]
            # 格子内先填遮蔽色，再只画六边形区域为米色，使六边形外网格被遮住
            clip_rect = pygame.Rect(x, y, w, h)
            old_clip = screen.get_clip()
            screen.set_clip(clip_rect)
            pygame.draw.rect(screen, frame_color, clip_rect)
            hex_poly = hexagon_screen_polygon(rect, view_origin, pan_px, grid_scale_denom=grid_scale_denom)
            pygame.draw.polygon(screen, beige, [(int(px), int(py)) for px, py in hex_poly])
            cell = cells[player][cell_index]
            valid_points = set(cell.grid.all_points())
            atoms = cell.all_atoms()
            hp = None
            if current_player is not None and highlight_atoms_by_cell is not None and player == current_player:
                hp = highlight_atoms_by_cell.get(cell_index, set())
            hp_red = None
            if highlight_atoms_red_for_player is not None and player == highlight_atoms_red_for_player[0]:
                hp_red = highlight_atoms_red_for_player[1].get(cell_index, set())
            draw_cell_grid(
                screen,
                cell_rect=rect,
                cell_atoms=atoms,
                view_origin=view_origin,
                valid_points=valid_points,
                highlight_points=hp,
                highlight_points_red=hp_red,
                view_pan_px=pan_px,
                grid_scale_denom=grid_scale_denom,
            )
            screen.set_clip(old_clip)
            if highlight_cell is not None and highlight_cell == (player, cell_index):
                pygame.draw.rect(screen, (255, 200, 80), rect, 3)
            # 格子下方显示 ATK/DEF 及红蓝绿效果
            atk = combat.attack_power(cell)
            def_ = combat.defense_power(cell)
            red_y = blue_y = green_y = 0
            for (r, c), color in cell.all_atoms().items():
                y = cell.count_black_neighbors(r, c)
                if color == ATOM_RED:
                    red_y += y
                elif color == ATOM_BLUE:
                    blue_y += y
                elif color == ATOM_GREEN:
                    green_y += y
            font = get_font(14)
            text = font.render(f"ATK: {atk:.1f}  DEF: {def_:.1f}", True, COLORS["ui_text"])
            tx = rect[0] + (rect[2] - text.get_width()) // 2
            ty = rect[1] + rect[3] + 4
            screen.blit(text, (tx, ty))
            parts = []
            if red_y > 0:
                parts.append(f"红破{red_y}")
            if blue_y > 0:
                parts.append(f"蓝+{blue_y}黑")
            if green_y > 0:
                parts.append(f"绿+{green_y}血")
            if parts:
                effect_str = "  ".join(parts)
                for font_size in (12, 11, 10):
                    font_sm = get_font(font_size)
                    effect_text = font_sm.render(effect_str, True, COLORS["ui_text"])
                    if effect_text.get_width() <= rect[2]:
                        break
                tx2 = rect[0] + (rect[2] - effect_text.get_width()) // 2
                screen.blit(effect_text, (tx2, ty + 18))
    return rects


def hit_test_cell(
    rects: List[List[Tuple[int, int, int, int]]],
    player: int,
    screen_x: int,
    screen_y: int,
    view_offsets: Optional[List[List[Tuple[int, int]]]] = None,
    view_pan_px: Optional[List[List[Tuple[float, float]]]] = None,
    grid_scale_denom: int = 4,
) -> Optional[Tuple[int, int, int]]:
    """
    若 (screen_x, screen_y) 在指定玩家的某格内，返回 (player, cell_index, (r,c))。
    view_offsets、view_pan_px 与 draw_board 一致。
    """
    default_vo = _default_view_origin()
    default_pan = (0.0, 0.0)
    row = rects[player]
    for cell_index, rect in enumerate(row):
        x, y, w, h = rect
        if x <= screen_x <= x + w and y <= screen_y <= y + h:
            view_origin = default_vo
            if view_offsets and player < len(view_offsets) and cell_index < len(view_offsets[player]):
                view_origin = view_offsets[player][cell_index]
            pan_px = default_pan
            if view_pan_px and player < len(view_pan_px) and cell_index < len(view_pan_px[player]):
                pan_px = view_pan_px[player][cell_index]
            pt = screen_to_grid(rect, view_origin, screen_x, screen_y, view_pan_px=pan_px, grid_scale_denom=grid_scale_denom)
            if pt is not None:
                return (player, cell_index, pt)
    return None
