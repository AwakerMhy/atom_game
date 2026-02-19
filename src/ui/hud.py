"""
HUD：生命、原子池、当前阶段与操作提示、规则 overlay、攻防数值提示。
"""
import pygame
from typing import Optional, Tuple
from src.config import COLORS, SCREEN_WIDTH, SCREEN_HEIGHT, get_font
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
    "阶段0：点击「多抽原子」「多放置」「多进攻」之一。阶段2：拖动原子到己方格放置，点「结束排布」。",
    "阶段3：点击己方格子进攻再点对方格；或点击己方红/蓝/绿原子发动效果；点「结束回合」。",
    "攻击力=己格黑原子竖向跨度；防御力=对方格黑原子横向跨度。攻>防可破坏黑原子。",
    "红=对方选 y 个原子破坏；蓝=己方得 y 黑；绿=己方回 y 血。y=该原子相邻黑原子数。",
]


def draw_hud(
    screen: pygame.Surface,
    state: GameState,
    message: str = "",
) -> None:
    """绘制生命、原子池、阶段与 message。"""
    font = get_font(22)
    # 玩家 1（上方）
    t = font.render(
        f"P1 HP: {state.hp[1]}  |  黑:{state.pool(1).get('black',0)} 红:{state.pool(1).get('red',0)} 蓝:{state.pool(1).get('blue',0)} 绿:{state.pool(1).get('green',0)}",
        True, COLORS["ui_text"]
    )
    screen.blit(t, (20, 8))
    # 玩家 0（下方）
    t = font.render(
        f"P0 HP: {state.hp[0]}  |  黑:{state.pool(0).get('black',0)} 红:{state.pool(0).get('red',0)} 蓝:{state.pool(0).get('blue',0)} 绿:{state.pool(0).get('green',0)}",
        True, COLORS["ui_text"]
    )
    screen.blit(t, (20, SCREEN_HEIGHT - 28))
    # 当前玩家与阶段
    phase_names = {
        PHASE_CONFIRM: "阶段0-选效果",
        PHASE_DRAW: "阶段1-抽原子",
        PHASE_PLACE: "阶段2-排布",
        PHASE_ACTION: "阶段3-动作",
    }
    cur = state.current_player
    t = font.render(f"当前: P{cur}  |  {phase_names.get(state.phase, '')}", True, COLORS["ui_accent"])
    screen.blit(t, (20, SCREEN_HEIGHT // 2 - 20))
    if message:
        t = font.render(message, True, (255, 220, 100))
        screen.blit(t, (20, SCREEN_HEIGHT // 2 + 8))


def draw_phase_0_prompt(screen: pygame.Surface) -> None:
    """阶段 0 提示文案（按钮由 buttons 绘制）。"""
    font = get_font(22)
    t = font.render("请点击下方一个按钮选择本回合效果", True, COLORS["ui_accent"])
    r = t.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2 - 55))
    screen.blit(t, r)


def draw_phase_2_prompt(screen: pygame.Surface, place_limit: int, placed: int, current_player: int = 0) -> None:
    """阶段 2 排布提示。P0 原子池在上方，P1 在下方。"""
    font = get_font(22)
    direction = "上方" if current_player == 0 else "下方"
    t = font.render(f"拖动{direction}原子到己方格子放置，已放 {placed}/{place_limit}，完成后点「结束排布」", True, COLORS["ui_accent"])
    r = t.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2 - 55))
    screen.blit(t, r)


def draw_phase_3_prompt(
    screen: pygame.Surface,
    action_substate: str,
    attack_remaining: int,
    can_attack: bool,
) -> None:
    """阶段 3 动作提示。action_substate 为 main 中的 action_* 状态。"""
    font = get_font(22)
    if action_substate == "idle":
        if can_attack:
            t = font.render("点击己方格子进攻再点对方格，或点击己方红/蓝/绿原子发动效果；点「结束回合」结束", True, COLORS["ui_accent"])
        else:
            t = font.render("点击己方红/蓝/绿原子发动效果；点「结束回合」结束（先手首回合不可进攻）", True, COLORS["ui_accent"])
    elif action_substate == "attack_my":
        t = font.render("已选进攻格，请点击对方一个非空格子（或对方全空则直接造成伤害）", True, (255, 200, 100))
    elif action_substate == "attack_choose_black":
        t = font.render("请点击对方格中要破坏的一个黑原子", True, (255, 200, 100))
    elif action_substate == "attack_choose_extra":
        t = font.render("红格多破坏：请点击对方格中要额外破坏的原子（任意颜色）", True, (255, 200, 100))
    elif action_substate == "attack_choose_component":
        t = font.render("请点击要保留的连通区域中任意一格点", True, (255, 200, 100))
    elif action_substate == "effect_red_pick":
        t = font.render("对方需点击己方场上要破坏的原子（由防守方操作）", True, (255, 200, 100))
    else:
        t = font.render(f"剩余进攻次数: {attack_remaining} | E 结束回合", True, COLORS["ui_accent"])
    r = t.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2 - 50))
    screen.blit(t, r)


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
