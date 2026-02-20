"""
HUD：生命、原子池、当前阶段与操作提示、规则 overlay、攻防数值提示。
"""
import pygame
from typing import Optional, Tuple
from src.config import COLORS, SCREEN_WIDTH, SCREEN_HEIGHT, get_font
from src.ui.buttons import draw_phase0_buttons_at
from src.game.state import (
    GameState,
    PHASE_CONFIRM,
    PHASE_DRAW,
    PHASE_PLACE,
    PHASE_ACTION,
)

# 规则摘要（点击规则按钮显示）
RULES_OVERLAY_LINES = [
    "【规则摘要】 点击「规则」按钮或下方关闭按钮关闭",
    "目标：将对方生命降至 0。每方 3 格，格点放原子（黑/红/蓝/绿）。",
    "阶段1：拖动原子到己方格放置，点「结束排布」。",
    "阶段2：点击己方格子进攻再点对方格；或点击己方红/蓝/绿原子发动效果；点「结束回合」。",
    "三角形网格的边长为1",
    "攻击力=己格黑原子竖向跨度除以sqrt(3)/2；防御力=对方格黑原子横向跨度。攻>防可破坏黑原子。",
    "红=对方选 y 个黑原子破坏（y=该红原子相邻黑数）。",
    "",
    "【原子持续性效果】",
    "黑：决定己格攻击力（黑原子竖向跨度）与对方格防御力（黑原子横向跨度）；",
    "每回合己方「有黑原子的格子」各可以发动一次进攻；非空格至少需有一黑。",
    "红：发动效果时对方须破坏 y 个黑原子；进攻时己方格红数 n、对方格蓝数 m，额外可破坏数=max(0,n-m)。",
    "蓝（点击）：与该蓝相邻的黑原子下一回合内不可被破坏，期间以蓝色高亮。",
    "绿（点击）：该绿原子就地变为一个黑原子（不消耗池）。",
    "绿（持续）：回合结束时获得「己方所有绿原子邻接黑原子数」之和的黑原子。",
]


# 原子颜色（与 config 一致）
_POOL_COLORS = [
    ("black", COLORS.get("atom_black", (40, 42, 48))),
    ("red", COLORS.get("atom_red", (200, 70, 70))),
    ("blue", COLORS.get("atom_blue", (70, 120, 200))),
    ("green", COLORS.get("atom_green", (70, 160, 100))),
]
_HP_BAR_W = 120
_HP_BAR_H = 16
_HP_BAR_MAX = 20  # 显示参考上限
_PANEL_PAD = 10
_ATOM_DOT_R = 6
_AVATAR_SIZE = 40  # 血条旁头像占位大小
_AVATAR_GAP = 8   # 头像与面板内容间距
# 提示区域（右上角）：两行小框上下排布，不重叠，框稍长以完整框住文字
_PROMPT_ANCHOR_RIGHT = SCREEN_WIDTH - 24
_PROMPT_BOX_W = 560
_PROMPT_BOX2_W = 800  # 玩家操作提示框更宽，容纳效果说明
_PROMPT_BOX_PAD = 8
_PROMPT_BOX_GAP = 6
_PROMPT_BOX1_TOP = 13
_PROMPT_BOX1_H = 32
_PROMPT_BOX2_TOP = _PROMPT_BOX1_TOP + _PROMPT_BOX1_H + _PROMPT_BOX_GAP
_PROMPT_BOX2_H = 80
# 回合状态框与操作提示框区分颜色
_PROMPT_BOX1_BG = (36, 42, 54)
_PROMPT_BOX1_BORDER = (70, 110, 180)
_PROMPT_BOX2_BG = (38, 50, 44)
_PROMPT_BOX2_BORDER = (80, 140, 100)


def _wrap_text(
    font: pygame.font.Font,
    text: str,
    max_width: int,
) -> list:
    """按最大宽度将文字拆成多行（按字符，适合中文）。"""
    if max_width <= 0:
        return [text] if text else []
    lines = []
    line = ""
    for ch in text:
        candidate = line + ch
        if font.size(candidate)[0] <= max_width:
            line = candidate
        else:
            if line:
                lines.append(line)
            line = ch if font.size(ch)[0] <= max_width else ""
    if line:
        lines.append(line)
    return lines if lines else [""]


def _draw_prompt_box(
    screen: pygame.Surface,
    top: int,
    height: int,
    text: str,
    font: pygame.font.Font,
    color: Tuple[int, int, int],
    box_bg: Optional[Tuple[int, int, int]] = None,
    box_border: Optional[Tuple[int, int, int]] = None,
    box_w: Optional[int] = None,
    wrap: bool = False,
) -> None:
    """在右上角绘制带边框的小框并填入文字。wrap 为 True 时按框宽换行多行显示（右对齐）。"""
    if box_bg is None:
        box_bg = (38, 44, 52)
    if box_border is None:
        box_border = COLORS["ui_accent"]
    w = box_w if box_w is not None else _PROMPT_BOX_W
    box_left = _PROMPT_ANCHOR_RIGHT - w
    rect = pygame.Rect(box_left, top, w, height)
    pygame.draw.rect(screen, box_bg, rect)
    pygame.draw.rect(screen, box_border, rect, 1)
    max_line_w = w - 2 * _PROMPT_BOX_PAD
    if wrap and max_line_w > 0:
        lines = _wrap_text(font, text, max_line_w)
        line_height = font.get_height()
        total_h = len(lines) * line_height
        y0 = top + max(0, (height - total_h) // 2)
        for i, line in enumerate(lines):
            t = font.render(line, True, color)
            tx = _PROMPT_ANCHOR_RIGHT - _PROMPT_BOX_PAD - t.get_width()
            ty = y0 + i * line_height
            screen.blit(t, (tx, ty))
    else:
        t = font.render(text, True, color)
        tx = _PROMPT_ANCHOR_RIGHT - _PROMPT_BOX_PAD - t.get_width()
        ty = top + (height - t.get_height()) // 2
        screen.blit(t, (tx, ty))


def _draw_player_panel(
    screen: pygame.Surface,
    player: int,
    hp: int,
    pool: dict,
    x: int,
    y: int,
    is_current: bool,
) -> None:
    """绘制单方玩家信息面板：头像 + HP 条 + 原子数量（血条上方不再显示 P0/P1 文字）。"""
    font_hp = get_font(20)     # 血条数值大号
    font_pool = get_font(18)   # 原子数量
    top_pad = 6
    content_x = x + _AVATAR_SIZE + _AVATAR_GAP
    bar_y = y + top_pad
    # 宽度：头像 + 间距 + HP 条右侧留出数值位 + 4 个原子
    content_w = _HP_BAR_W + 36 + 4 * (_ATOM_DOT_R * 2 + 6 + 20) + _PANEL_PAD * 2
    panel_w = _AVATAR_SIZE + _AVATAR_GAP + content_w
    panel_h = top_pad + _HP_BAR_H + _PANEL_PAD + 4
    panel = pygame.Rect(x, y, panel_w, panel_h)
    bg = (42, 48, 56) if not is_current else (50, 58, 70)
    pygame.draw.rect(screen, bg, panel)
    pygame.draw.rect(screen, COLORS["ui_accent"] if is_current else (70, 78, 90), panel, 2)

    # 头像（血条左侧）：圆形占位，内显 P0/P1
    avatar_rect = pygame.Rect(x + 4, y + (panel_h - _AVATAR_SIZE) // 2, _AVATAR_SIZE, _AVATAR_SIZE)
    avatar_bg = (60, 68, 80) if not is_current else (70, 85, 110)
    pygame.draw.ellipse(screen, avatar_bg, avatar_rect)
    pygame.draw.ellipse(screen, COLORS["ui_accent"] if is_current else (80, 88, 100), avatar_rect, 2)
    font_avatar = get_font(18)
    avatar_label = font_avatar.render(f"P{player}", True, COLORS["ui_text"])
    screen.blit(avatar_label, avatar_label.get_rect(center=avatar_rect.center))

    # HP 条（不再在血条上方画 P0/P1 文字）
    bar_x = content_x + _PANEL_PAD
    pygame.draw.rect(screen, (40, 35, 35), (bar_x, bar_y, _HP_BAR_W, _HP_BAR_H))
    fill_w = min(_HP_BAR_W, max(0, int(_HP_BAR_W * hp / max(1, _HP_BAR_MAX))))
    if fill_w > 0:
        hp_color = (120, 200, 100) if hp >= _HP_BAR_MAX else (200, 80, 80)
        pygame.draw.rect(screen, hp_color, (bar_x, bar_y, fill_w, _HP_BAR_H))
    pygame.draw.rect(screen, (60, 65, 75), (bar_x, bar_y, _HP_BAR_W, _HP_BAR_H), 1)
    # 血条数值在血条右侧，不压住血条
    hp_text = font_hp.render(str(hp), True, (255, 255, 255))
    screen.blit(hp_text, (bar_x + _HP_BAR_W + 8, bar_y + (_HP_BAR_H - hp_text.get_height()) // 2))
    # 原子：小圆点 + 数量（bar_x 已含 content_x）
    cx = bar_x + _HP_BAR_W + 36
    for key, rgb in _POOL_COLORS:
        n = pool.get(key, 0)
        pygame.draw.circle(screen, rgb, (int(cx + _ATOM_DOT_R), int(bar_y + _HP_BAR_H // 2)), _ATOM_DOT_R)
        pygame.draw.circle(screen, (80, 85, 95), (int(cx + _ATOM_DOT_R), int(bar_y + _HP_BAR_H // 2)), _ATOM_DOT_R, 1)
        screen.blit(font_pool.render(str(n), True, COLORS["ui_text"]), (cx + _ATOM_DOT_R * 2 + 2, bar_y + (_HP_BAR_H - 18) // 2))
        cx += _ATOM_DOT_R * 2 + 6 + 20


def draw_hud(
    screen: pygame.Surface,
    state: GameState,
    message: str = "",
) -> None:
    """绘制生命、原子池（图形面板）、阶段与 message。"""
    cur = state.current_player
    # 玩家 1 面板（上方偏左）
    _draw_player_panel(
        screen, 1, state.hp[1], state.pool(1),
        x=20, y=12, is_current=(cur == 1),
    )
    # 玩家 0 面板（下方偏左）
    _panel_h = 6 + _HP_BAR_H + _PANEL_PAD + 4
    _draw_player_panel(
        screen, 0, state.hp[0], state.pool(0),
        x=20, y=SCREEN_HEIGHT - 12 - _panel_h,
        is_current=(cur == 0),
    )
    # 回合状态框（右上角第 1 框）
    phase_names = {
        PHASE_CONFIRM: "阶段1-选效果",
        PHASE_DRAW: "阶段1-抽原子",
        PHASE_PLACE: "阶段2-排布",
        PHASE_ACTION: "阶段3-动作",
    }
    phase_text = f"当前: P{cur}  {phase_names.get(state.phase, '')}"
    _draw_prompt_box(
        screen,
        _PROMPT_BOX1_TOP,
        _PROMPT_BOX1_H,
        phase_text,
        get_font(20),
        COLORS["ui_accent"],
        box_bg=_PROMPT_BOX1_BG,
        box_border=_PROMPT_BOX1_BORDER,
    )
    # 玩家操作提示框（第 2 框，下方；阶段 0 固定文案，阶段 2/3 由各阶段提示函数绘制）
    if state.phase == PHASE_CONFIRM:
        _draw_prompt_box(
            screen,
            _PROMPT_BOX2_TOP,
            _PROMPT_BOX2_H,
            "请点击左侧按钮选择本回合效果（多抽原子/多放置/多进攻）",
            get_font(18),
            (255, 220, 100),
            box_bg=_PROMPT_BOX2_BG,
            box_border=_PROMPT_BOX2_BORDER,
            box_w=_PROMPT_BOX2_W,
            wrap=True,
        )
    elif message and state.phase not in (PHASE_PLACE, PHASE_ACTION):
        _draw_prompt_box(
            screen,
            _PROMPT_BOX2_TOP,
            _PROMPT_BOX2_H,
            message[:50],
            get_font(18),
            (255, 220, 100),
            box_bg=_PROMPT_BOX2_BG,
            box_border=_PROMPT_BOX2_BORDER,
            box_w=_PROMPT_BOX2_W,
            wrap=True,
        )


def draw_phase_0_prompt(screen: pygame.Surface) -> None:
    """阶段 0 提示文案（已由弹窗替代，保留供兼容）。"""
    pass


# 阶段 0 弹窗尺寸与布局
_PHASE0_MODAL_W = 560
_PHASE0_MODAL_H = 220
_PHASE0_MODAL_PAD = 24


def draw_phase0_modal(
    screen: pygame.Surface, current_player: int
) -> list:
    """
    阶段 0 弹窗：半透明遮罩 + 居中面板，标明当前玩家，提示文案 + 三选一按钮。
    返回 [(rect, "a"|"b"|"c"), ...] 供点击检测。
    """
    overlay = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT))
    overlay.set_alpha(200)
    overlay.fill((10, 12, 18))
    screen.blit(overlay, (0, 0))

    cx = SCREEN_WIDTH // 2
    cy = SCREEN_HEIGHT // 2
    panel = pygame.Rect(
        cx - _PHASE0_MODAL_W // 2,
        cy - _PHASE0_MODAL_H // 2,
        _PHASE0_MODAL_W,
        _PHASE0_MODAL_H,
    )
    pygame.draw.rect(screen, (38, 44, 52), panel)
    pygame.draw.rect(screen, COLORS["ui_accent"], panel, 2)

    font_title = get_font(24)
    font_prompt = get_font(20)
    title = font_title.render(f"P{current_player} 请选择本回合效果", True, COLORS["ui_accent"])
    prompt = font_prompt.render("请点击下方一个按钮选择本回合效果", True, COLORS["ui_text"])
    title_r = title.get_rect(centerx=panel.centerx, y=panel.y + _PHASE0_MODAL_PAD)
    prompt_r = prompt.get_rect(centerx=panel.centerx, y=panel.y + _PHASE0_MODAL_PAD + 34)
    screen.blit(title, title_r)
    screen.blit(prompt, prompt_r)

    btn_cy = panel.y + _PHASE0_MODAL_H - 24 - 22
    return draw_phase0_buttons_at(screen, cx, btn_cy)


def draw_phase_2_prompt(screen: pygame.Surface, place_limit: int, placed: int, current_player: int = 0) -> None:
    """阶段 2 排布提示（画在下方小框内）。"""
    direction = "上方" if current_player == 0 else "下方"
    text = f"拖动{direction}原子到己方格子放置，已放 {placed}/{place_limit}，完成后点「结束排布」"
    _draw_prompt_box(
        screen,
        _PROMPT_BOX2_TOP,
        _PROMPT_BOX2_H,
        text,
        get_font(18),
        COLORS["ui_accent"],
        box_bg=_PROMPT_BOX2_BG,
        box_border=_PROMPT_BOX2_BORDER,
        box_w=_PROMPT_BOX2_W,
        wrap=True,
    )


def draw_phase_3_prompt(
    screen: pygame.Surface,
    action_substate: str,
    attack_remaining: int,
    can_attack: bool,
) -> None:
    """阶段 3 动作提示（画在下方小框内）。含红/蓝/绿效果数目说明。"""
    effect_rule = "红=破坏y个对方黑 蓝=相邻黑下一回合不可被破坏 绿=该格变黑/回合结束得黑(y=邻黑数)。"
    if action_substate == "idle":
        if can_attack:
            text = effect_rule + "点击己方格进攻或红/蓝/绿发动效果；点「结束回合」"
        else:
            text = effect_rule + "点击己方红/蓝/绿发动效果；点「结束回合」（先手首回合不可进攻）"
    elif action_substate == "attack_my":
        text = "已选进攻格，请点击对方一个非空格子（或对方全空则直接造成伤害）"
    elif action_substate == "attack_choose_black":
        text = "请点击对方格中要破坏的一个黑原子"
    elif action_substate == "attack_choose_extra":
        text = "红格多破坏：请点击对方格中要额外破坏的黑原子"
    elif action_substate == "attack_choose_component":
        text = "请点击要保留的连通区域中任意一格点"
    elif action_substate == "attack_choose_black_component":
        text = "请选择要保留的黑原子连通子集（点击其中一格点）"
    elif action_substate == "effect_red_choose_cell":
        text = "红效果：请先点击对方要作用的一个格子（窗口），效果仅作用于该格"
    elif action_substate == "effect_red_pick":
        text = "红效果仅破坏黑原子：点击已选格子内黑原子选中（红高亮），选够后点「确认」"
    elif action_substate == "effect_red_choose_component":
        text = "红效果：被攻击方请选择要保留的连通区域（点击格点）；选无黑子集则该子集也破坏"
    elif action_substate == "effect_red_choose_black_component":
        text = "红效果：请选择要保留的黑原子连通子集（点击其中一格点）"
    else:
        text = f"剩余进攻次数: {attack_remaining} | E 结束回合"
    _draw_prompt_box(
        screen,
        _PROMPT_BOX2_TOP,
        _PROMPT_BOX2_H,
        text,
        get_font(18),
        COLORS["ui_accent"] if action_substate == "idle" else (255, 200, 100),
        box_bg=_PROMPT_BOX2_BG,
        box_border=_PROMPT_BOX2_BORDER,
        box_w=_PROMPT_BOX2_W,
        wrap=True,
    )


def get_rules_close_rect() -> pygame.Rect:
    """规则 overlay 上「关闭」按钮的 rect。"""
    return pygame.Rect(SCREEN_WIDTH // 2 - 60, SCREEN_HEIGHT - 80, 120, 40)


def draw_rules_overlay(screen: pygame.Surface) -> pygame.Rect:
    """半透明规则摘要覆盖层，并绘制「关闭」按钮，返回关闭按钮 rect。"""
    overlay = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT))
    overlay.set_alpha(230)
    overlay.fill((20, 22, 28))
    screen.blit(overlay, (0, 0))
    font = get_font(20)
    y = 40
    for line in RULES_OVERLAY_LINES:
        t = font.render(line, True, (220, 220, 220))
        screen.blit(t, (30, y))
        y += 28
    t = font.render("点击下方「关闭」按钮关闭", True, COLORS["ui_accent"])
    screen.blit(t, (30, y + 20))
    close_r = get_rules_close_rect()
    pygame.draw.rect(screen, (60, 70, 90), close_r)
    pygame.draw.rect(screen, COLORS["ui_accent"], close_r, 2)
    t2 = get_font(22).render("关闭", True, COLORS["ui_text"])
    screen.blit(t2, t2.get_rect(center=close_r.center))
    return close_r


def get_end_screen_rects():
    """结束界面两个按钮的 rect，用于点击检测。返回 (rect_restart, rect_quit)。"""
    cx = SCREEN_WIDTH // 2
    cy = SCREEN_HEIGHT // 2
    w, h = 200, 44
    gap = 24
    r1 = pygame.Rect(cx - w - gap // 2 - w, cy + 20 - h // 2, w, h)
    r2 = pygame.Rect(cx + gap // 2, cy + 20 - h // 2, w, h)
    return r1, r2


def draw_end_screen(screen: pygame.Surface, winner: int):
    """绘制结束界面：半透明面板、获胜者、再来一局 / 退出 按钮。"""
    font = get_font(36)
    title = font.render(f"P{winner} 获胜！", True, (255, 200, 80))
    r1, r2 = get_end_screen_rects()
    overlay = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT))
    overlay.set_alpha(200)
    overlay.fill((10, 12, 18))
    screen.blit(overlay, (0, 0))
    tr = title.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2 - 50))
    screen.blit(title, tr)
    font_btn = get_font(24)
    btn1 = font_btn.render("再来一局 (Enter)", True, (220, 220, 220))
    btn2 = font_btn.render("退出 (ESC)", True, (220, 220, 220))
    screen.blit(btn1, btn1.get_rect(center=r1.center))
    screen.blit(btn2, btn2.get_rect(center=r2.center))
    pygame.draw.rect(screen, (80, 90, 100), r1, 2)
    pygame.draw.rect(screen, (80, 90, 100), r2, 2)


def draw_attack_defense_hint(
    screen: pygame.Surface,
    state: GameState,
    attack_my_cell: Optional[Tuple[int, int]],
    attack_enemy_cell: Optional[Tuple[int, int]],
) -> None:
    """阶段 3 已选进攻格与目标格时，显示攻击力与防御力。"""
    if attack_my_cell is None:
        return
    cur = state.current_player
    opp = state.opponent(cur)
    atk_cell = state.cells[cur][attack_my_cell[1]]
    if atk_cell.is_empty():
        return
    from src.game import combat
    atk = combat.attack_power(atk_cell)
    def_val = None
    if attack_enemy_cell is not None and attack_enemy_cell[0] == opp:
        def_cell = state.cells[opp][attack_enemy_cell[1]]
        if not def_cell.is_empty():
            def_val = combat.defense_power(def_cell)
    font = get_font(20)
    if def_val is not None:
        t = font.render(f"攻击力: {atk:.1f}  防御力: {def_val:.1f}  (攻>防可破坏)", True, (200, 220, 200))
    else:
        t = font.render(f"攻击力: {atk:.1f}  (对方全空则直接造成此伤害)", True, (200, 220, 200))
    r = t.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2 + 25))
    screen.blit(t, r)
