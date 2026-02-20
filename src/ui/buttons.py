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


def draw_phase0_buttons_at(
    screen: pygame.Surface, center_x: int, center_y: int
) -> List[Tuple[pygame.Rect, str]]:
    """在指定中心点绘制阶段 0 三个按钮，返回 [(rect, "a"|"b"|"c"), ...]。"""
    w = 180
    total_w = 3 * w + 2 * BTN_GAP
    x0 = center_x - total_w // 2
    rects = []
    for i, (key, label) in enumerate([("a", "多抽原子"), ("b", "多放置"), ("c", "多进攻")]):
        r = pygame.Rect(x0 + i * (w + BTN_GAP), center_y - BTN_H // 2, w, BTN_H)
        _draw_button(screen, r, label, 24)
        rects.append((r, key))
    return rects


def draw_phase0_buttons(screen: pygame.Surface) -> List[Tuple[pygame.Rect, str]]:
    """绘制阶段 0 三个按钮（屏幕中央），返回 [(rect, "a"|"b"|"c"), ...]。"""
    return draw_phase0_buttons_at(screen, SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2)


# 阶段 0 竖向按钮：放在拖拽原子列（排布时左侧竖列）的右侧
PHASE0_VERTICAL_LEFT = 24 + POOL_BOX_SIZE + BTN_GAP  # 与 atom pool 列右对齐再右移一格间距
PHASE0_VERTICAL_BTN_W = 130


def draw_phase0_buttons_vertical(screen: pygame.Surface) -> List[Tuple[pygame.Rect, str]]:
    """
    阶段 0 三选一按钮竖向绘制，位于拖拽原子按钮列的右侧，垂直居中。
    返回 [(rect, "a"|"b"|"c"), ...]。
    """
    total_h = 3 * BTN_H + 2 * BTN_GAP
    y0 = (SCREEN_HEIGHT - total_h) // 2
    rects = []
    for i, (key, label) in enumerate([("a", "多抽原子"), ("b", "多放置"), ("c", "多进攻")]):
        r = pygame.Rect(PHASE0_VERTICAL_LEFT, y0 + i * (BTN_H + BTN_GAP), PHASE0_VERTICAL_BTN_W, BTN_H)
        _draw_button(screen, r, label, 20)
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
    绘制当前玩家的原子池（可拖动）与「撤回」「结束排布」按钮。
    竖排于屏幕左侧：黑/红/蓝/绿 → 撤回 → 结束排布。
    返回 [(rect, "black"|"red"|"blue"|"green"|"undo"|"end_place"), ...]，仅包含数量>0的颜色。
    """
    font = get_font(18)
    out = []
    left_x = 24
    # 垂直居中：6 个控件，总高 6*(POOL_BOX_SIZE+BTN_GAP)-BTN_GAP
    total_h = 6 * (POOL_BOX_SIZE + BTN_GAP) - BTN_GAP
    y0 = (SCREEN_HEIGHT - total_h) // 2
    for color_key, (col_name, _) in ATOM_BUTTON_COLORS.items():
        count = pool.get(color_key, 0)
        r = pygame.Rect(left_x, y0, POOL_BOX_SIZE, POOL_BOX_SIZE)
        color_rgb = COLORS.get(col_name, (100, 100, 100))
        pygame.draw.rect(screen, color_rgb, r)
        pygame.draw.rect(screen, COLORS["grid_line"], r, 2)
        t = font.render(str(count), True, (255, 255, 255))
        tr = t.get_rect(center=r.center)
        screen.blit(t, tr)
        if count > 0:
            out.append((r, color_key))
        y0 += POOL_BOX_SIZE + BTN_GAP
    undo_r = pygame.Rect(left_x, y0, POOL_BOX_SIZE, POOL_BOX_SIZE)
    _draw_button(screen, undo_r, "撤回", 20)
    out.append((undo_r, "undo"))
    y0 += POOL_BOX_SIZE + BTN_GAP
    end_btn_w = 160
    end_r = pygame.Rect(left_x, y0, end_btn_w, POOL_BOX_SIZE)
    _draw_button(screen, end_r, f"结束排布 ({placed}/{place_limit})", 18)
    out.append((end_r, "end_place"))
    return out


def draw_batch_place_button(screen: pygame.Surface) -> pygame.Rect:
    """
    绘制「批量放置」按钮（排布阶段且开启随机放置时显示）。
    从池中取原子放到指定格子。放在结束排布按钮下方。
    """
    left_x = 24
    end_btn_w = 160
    total_h = 6 * (POOL_BOX_SIZE + BTN_GAP) - BTN_GAP
    y0 = (SCREEN_HEIGHT - total_h) // 2
    y0 += 5 * (POOL_BOX_SIZE + BTN_GAP)
    y0 += POOL_BOX_SIZE + BTN_GAP
    r = pygame.Rect(left_x, y0, end_btn_w, POOL_BOX_SIZE)
    _draw_button(screen, r, "批量放置", 18)
    return r


# 批量放置数量滑条：0 ~ value_max
BATCH_SLIDER_TRACK_W = 240
BATCH_SLIDER_TRACK_H = 16

# 取消按钮样式（与选格子按钮区分）
_BTN_CANCEL_BG = (58, 52, 48)
_BTN_CANCEL_BORDER = (160, 120, 100)


def _draw_button_cancel(screen: pygame.Surface, rect: pygame.Rect, text: str, font_size: int = 18) -> None:
    """绘制取消/确认类按钮，颜色与普通操作按钮区分。"""
    pygame.draw.rect(screen, _BTN_CANCEL_BG, rect)
    pygame.draw.rect(screen, _BTN_CANCEL_BORDER, rect, 2)
    font = get_font(font_size)
    t = font.render(text, True, COLORS["ui_text"])
    tr = t.get_rect(center=rect.center)
    screen.blit(t, tr)


def draw_batch_place_panel(
    screen: pygame.Surface,
    value: int,
    value_max: int,
) -> Tuple[pygame.Rect, pygame.Rect, pygame.Rect, pygame.Rect, pygame.Rect]:
    """
    绘制批量放置面板：仅黑原子，数量用滑条选择、目标格子 1/2/3、取消。
    返回 (格子1, 格子2, 格子3, 取消, 滑条轨道) 的 rect。value_max 为滑条最大值（池中黑原子数与剩余可放数取 min）。
    """
    font = get_font(18)
    panel_w = 520
    panel_h = 175
    panel_pad = 28
    cx = SCREEN_WIDTH // 2
    cy = SCREEN_HEIGHT // 2
    panel = pygame.Rect(cx - panel_w // 2, cy - panel_h // 2, panel_w, panel_h)
    pygame.draw.rect(screen, (40, 48, 58), panel)
    pygame.draw.rect(screen, COLORS["ui_accent"], panel, 2)
    title = font.render("批量放置黑原子：拖动滑条选数量，点击目标格子", True, COLORS["ui_text"])
    if title.get_width() > panel.w - 2 * panel_pad:
        title = font.render("批量放置黑原子 · 滑条选数量，点击目标格子", True, COLORS["ui_text"])
    screen.blit(title, (panel.x + (panel.w - title.get_width()) // 2, panel.y + 14))
    num_label = font.render("数量:", True, COLORS["ui_text"])
    screen.blit(num_label, (panel.x + panel_pad, panel.y + 48))
    # 滑条轨道（左侧留出「数量」标签位）
    track_x = panel.x + panel_pad + 52
    track_y = panel.y + 46
    track_rect = pygame.Rect(track_x, track_y, BATCH_SLIDER_TRACK_W, BATCH_SLIDER_TRACK_H)
    pygame.draw.rect(screen, (50, 58, 70), track_rect)
    pygame.draw.rect(screen, COLORS["ui_accent"], track_rect, 1)
    v_max = max(1, value_max)
    val_clamped = max(0, min(value, v_max))
    t = val_clamped / v_max if v_max else 0
    thumb_x = track_rect.x + int(t * (track_rect.w - 14))
    thumb_rect = pygame.Rect(thumb_x, track_rect.y - 2, 14, track_rect.h + 4)
    pygame.draw.rect(screen, COLORS["ui_accent"], thumb_rect)
    val_txt = font.render(str(val_clamped), True, (255, 255, 255))
    screen.blit(val_txt, (track_rect.right + 10, track_rect.y + (BATCH_SLIDER_TRACK_H - val_txt.get_height()) // 2))
    target_label = font.render("目标格子:", True, COLORS["ui_text"])
    screen.blit(target_label, (panel.x + panel_pad, panel.y + 88))
    # 选格子按钮在左侧区域内均匀分布，取消按钮在右侧且颜色不同
    btn_w = 88
    btn_h = 36
    row_y = panel.y + panel_h - 20 - btn_h
    cancel_w = 80
    cancel_r = pygame.Rect(panel.x + panel.w - panel_pad - cancel_w, row_y, cancel_w, btn_h)
    gap_before_cancel = 20
    space_for_three = cancel_r.left - (panel.x + panel_pad) - gap_before_cancel
    gap = max(12, (space_for_three - 3 * btn_w) // 2)  # 两段间隔，使三钮均匀
    block_w = 3 * btn_w + 2 * gap
    start_x = panel.x + panel_pad + (space_for_three - block_w) // 2
    cell1_r = pygame.Rect(start_x, row_y, btn_w, btn_h)
    cell2_r = pygame.Rect(cell1_r.right + gap, row_y, btn_w, btn_h)
    cell3_r = pygame.Rect(cell2_r.right + gap, row_y, btn_w, btn_h)
    _draw_button(screen, cell1_r, "格子1", 17)
    _draw_button(screen, cell2_r, "格子2", 17)
    _draw_button(screen, cell3_r, "格子3", 17)
    _draw_button_cancel(screen, cancel_r, "取消", 18)
    return (cell1_r, cell2_r, cell3_r, cancel_r, track_rect)


def batch_place_value_from_track(track_rect: pygame.Rect, mouse_x: int, value_max: int) -> int:
    """根据滑条轨道与鼠标 x 计算数量 0~value_max，用于拖动更新。"""
    if track_rect.w <= 0 or value_max <= 0:
        return 0
    t = (mouse_x - track_rect.x) / track_rect.w
    t = max(0.0, min(1.0, t))
    return int(round(t * value_max))


def draw_confirm_dialog(screen: pygame.Surface, message: str) -> Tuple[pygame.Rect, pygame.Rect]:
    """绘制通用确认对话框。返回 (是 rect, 否 rect)。"""
    font = get_font(18)
    panel_w = 340
    panel_h = 100
    cx = SCREEN_WIDTH // 2
    cy = SCREEN_HEIGHT // 2
    panel = pygame.Rect(cx - panel_w // 2, cy - panel_h // 2, panel_w, panel_h)
    pygame.draw.rect(screen, (40, 48, 58), panel)
    pygame.draw.rect(screen, COLORS["ui_accent"], panel, 2)
    title = font.render(message, True, COLORS["ui_text"])
    screen.blit(title, (panel.x + (panel.w - title.get_width()) // 2, panel.y + 16))
    btn_w = 80
    yes_r = pygame.Rect(panel.x + panel.w // 2 - btn_w - 10, panel.y + 54, btn_w, 34)
    no_r = pygame.Rect(panel.x + panel.w // 2 + 10, panel.y + 54, btn_w, 34)
    _draw_button(screen, yes_r, "是", 20)
    _draw_button(screen, no_r, "否", 20)
    return (yes_r, no_r)


def draw_direct_attack_confirm(screen: pygame.Surface) -> Tuple[pygame.Rect, pygame.Rect]:
    """绘制直接攻击确认对话框：对方三格皆空时。返回 (是 rect, 否 rect)。"""
    return draw_confirm_dialog(screen, "对方三格皆空，是否要直接攻击？")


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


def draw_red_confirm_button(screen: pygame.Surface) -> pygame.Rect:
    """红效果选完黑原子后的「确认」按钮，居中偏下。返回 rect 供点击检测。"""
    cx = SCREEN_WIDTH // 2
    y = SCREEN_HEIGHT - 120
    r = pygame.Rect(cx - 50, y, 100, BTN_H)
    _draw_button(screen, r, "确认", 22)
    return r


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


# 网格比例滑块：三角形边长/格子边长 = 1/denom，denom 从 3 到 10
GRID_SCALE_DENOM_MIN = 3
GRID_SCALE_DENOM_MAX = 10
GRID_SLIDER_TRACK_W = 140
GRID_SLIDER_TRACK_H = 14


def draw_grid_scale_slider(screen: pygame.Surface, value: int) -> pygame.Rect:
    """
    绘制「网格比例 1:3~1:10」滑块。value 为当前分母（3~10）。
    返回滑条轨道 rect，供主循环根据鼠标位置更新 value。
    """
    font = get_font(14)
    label = font.render("网格 1:3~1:10", True, COLORS["ui_text"])
    track_x = SCREEN_WIDTH - 24 - GRID_SLIDER_TRACK_W
    track_y = SCREEN_HEIGHT - 70
    track_rect = pygame.Rect(track_x, track_y, GRID_SLIDER_TRACK_W, GRID_SLIDER_TRACK_H)
    screen.blit(label, (track_x - label.get_width() - 8, track_y + (GRID_SLIDER_TRACK_H - label.get_height()) // 2))
    pygame.draw.rect(screen, (50, 58, 70), track_rect)
    pygame.draw.rect(screen, COLORS["ui_accent"], track_rect, 1)
    denom = max(GRID_SCALE_DENOM_MIN, min(GRID_SCALE_DENOM_MAX, value))
    t = (denom - GRID_SCALE_DENOM_MIN) / (GRID_SCALE_DENOM_MAX - GRID_SCALE_DENOM_MIN)
    thumb_x = track_rect.x + int(t * (track_rect.w - 12))  # 拇指宽约 12
    thumb_rect = pygame.Rect(thumb_x, track_rect.y - 2, 12, track_rect.h + 4)
    pygame.draw.rect(screen, COLORS["ui_accent"], thumb_rect)
    val_txt = font.render(f"1:{denom}", True, (255, 255, 255))
    screen.blit(val_txt, (track_rect.right + 6, track_rect.y + (GRID_SLIDER_TRACK_H - val_txt.get_height()) // 2))
    return track_rect


def grid_scale_value_from_track(track_rect: pygame.Rect, mouse_x: int) -> int:
    """根据滑条轨道与鼠标 x 计算分母（3~10），用于拖动更新。"""
    if track_rect.w <= 0:
        return GRID_SCALE_DENOM_MIN
    t = (mouse_x - track_rect.x) / track_rect.w
    t = max(0.0, min(1.0, t))
    return int(round(GRID_SCALE_DENOM_MIN + t * (GRID_SCALE_DENOM_MAX - GRID_SCALE_DENOM_MIN)))


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
