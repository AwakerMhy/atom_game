"""
按钮与可点击区域：阶段 0 三选一、阶段 2 原子池（拖动源）+ 结束排布、阶段 3 结束回合/取消、规则。
"""
from typing import List, Tuple, Optional, Dict
import pygame
from src.config import COLORS, SCREEN_WIDTH, SCREEN_HEIGHT, get_font

# 原子颜色与 config 键、中文名
ATOM_BUTTON_COLORS = {
    "black": ("atom_black", "黑"),
    "red": ("atom_red", "红"),
    "blue": ("atom_blue", "蓝"),
    "green": ("atom_green", "绿"),
}

BTN_H = 44
BTN_GAP = 16
POOL_BOX_SIZE = 48


def _draw_button(screen: pygame.Surface, rect: pygame.Rect, text: str, font_size: int = 22) -> None:
    pygame.draw.rect(screen, (50, 58, 70), rect)
    pygame.draw.rect(screen, COLORS["ui_accent"], rect, 2)
    font = get_font(font_size)
    t = font.render(text, True, COLORS["ui_text"])
    tr = t.get_rect(center=rect.center)
    screen.blit(t, tr)


def draw_phase0_buttons(screen: pygame.Surface) -> List[Tuple[pygame.Rect, str]]:
    """绘制阶段 0 三个按钮，返回 [(rect, "a"|"b"|"c"), ...]。"""
    w = 180
    cx = SCREEN_WIDTH // 2
    cy = SCREEN_HEIGHT // 2
    total_w = 3 * w + 2 * BTN_GAP
    x0 = cx - total_w // 2
    rects = []
    for i, (key, label) in enumerate([("a", "多抽原子"), ("b", "多放置"), ("c", "多进攻")]):
        r = pygame.Rect(x0 + i * (w + BTN_GAP), cy - BTN_H // 2, w, BTN_H)
        _draw_button(screen, r, label, 24)
        rects.append((r, key))
    return rects


def draw_atom_pool_and_end(
    screen: pygame.Surface,
    pool: Dict[str, int],
    place_limit: int,
    placed: int,
    current_player: int,
) -> List[Tuple[pygame.Rect, str]]:
    """
    绘制当前玩家的原子池（可拖动）与「结束排布」按钮。
    原子池在己方场地上方：四个颜色块（黑/红/蓝/绿）+ 结束排布。
    返回 [(rect, "black"|"red"|"blue"|"green"|"end_place"), ...]，仅包含数量>0的颜色。
    """
    from src.ui.board import layout_cell_rects
    rects = layout_cell_rects()
    # 当前玩家场地：P0 在下方，P1 在上方
    if current_player == 0:
        row_y = rects[0][0][1]
        pool_y = row_y - POOL_BOX_SIZE - 20
    else:
        row_y = rects[1][0][1]
        pool_y = row_y + 200 + 20
    font = get_font(18)
    out = []
    x0 = 30
    for color_key, (col_name, label) in ATOM_BUTTON_COLORS.items():
        count = pool.get(color_key, 0)
        r = pygame.Rect(x0, pool_y, POOL_BOX_SIZE, POOL_BOX_SIZE)
        color_rgb = COLORS.get(col_name, (100, 100, 100))
        pygame.draw.rect(screen, color_rgb, r)
        pygame.draw.rect(screen, COLORS["grid_line"], r, 2)
        t = font.render(f"{label}{count}", True, (255, 255, 255))
        screen.blit(t, (x0 + 4, pool_y + 4))
        if count > 0:
            out.append((r, color_key))
        x0 += POOL_BOX_SIZE + BTN_GAP
    undo_r = pygame.Rect(x0, pool_y, 70, POOL_BOX_SIZE)
    _draw_button(screen, undo_r, "撤回", 20)
    out.append((undo_r, "undo"))
    x0 += 70 + BTN_GAP
    end_r = pygame.Rect(x0, pool_y, 120, POOL_BOX_SIZE)
    _draw_button(screen, end_r, f"结束排布 ({placed}/{place_limit})", 20)
    out.append((end_r, "end_place"))
    return out


def draw_phase3_buttons(
    screen: pygame.Surface,
    action_substate: str,
) -> List[Tuple[pygame.Rect, str]]:
    """绘制阶段 3：「结束回合」；若 substate != idle 则还有「取消」。返回 [(rect, "end_turn"|"cancel"), ...]。"""
    out = []
    cx = SCREEN_WIDTH // 2
    y = SCREEN_HEIGHT - 60
    r1 = pygame.Rect(cx - 70, y, 140, BTN_H)
    _draw_button(screen, r1, "结束回合", 22)
    out.append((r1, "end_turn"))
    if action_substate != "idle":
        r2 = pygame.Rect(cx + 90, y, 80, BTN_H)
        _draw_button(screen, r2, "取消", 22)
        out.append((r2, "cancel"))
    return out


def draw_rules_button(screen: pygame.Surface) -> pygame.Rect:
    """绘制「规则」按钮，返回其 rect。"""
    r = pygame.Rect(SCREEN_WIDTH - 100, SCREEN_HEIGHT - 32, 80, 28)
    _draw_button(screen, r, "规则", 20)
    return r


def draw_pan_mode_button(screen: pygame.Surface, pan_mode: bool) -> pygame.Rect:
    """绘制「拖动视角」切换按钮，返回其 rect。"""
    r = pygame.Rect(SCREEN_WIDTH - 200, SCREEN_HEIGHT - 32, 90, 28)
    label = "视角开" if pan_mode else "拖动视角"
    _draw_button(screen, r, label, 18)
    return r


def draw_dragging_ghost(screen: pygame.Surface, color: str, mouse_pos: Tuple[int, int]) -> None:
    """拖动时在鼠标位置绘制半透明原子（无外框）。"""
    col_name = ATOM_BUTTON_COLORS.get(color, ("atom_black", ""))[0]
    rgb = COLORS.get(col_name, (80, 80, 80))
    r = 14
    s = pygame.Surface((r * 2 + 4, r * 2 + 4))
    s.set_alpha(220)
    pygame.draw.circle(s, rgb, (r + 2, r + 2), r)
    screen.blit(s, (mouse_pos[0] - r - 2, mouse_pos[1] - r - 2))


def hit_button(rects: List[Tuple[pygame.Rect, str]], x: int, y: int) -> Optional[str]:
    """若 (x,y) 在某个按钮内，返回其 id，否则 None。"""
    for r, bid in rects:
        if r.collidepoint(x, y):
            return bid
    return None
