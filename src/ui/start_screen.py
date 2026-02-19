"""
游戏开始界面：开局原子数、基础抽牌数、抽牌权重，开始游戏按钮。
"""
from typing import Dict, List, Tuple, Any
import pygame
from src.config import COLORS, SCREEN_WIDTH, SCREEN_HEIGHT, get_font
from src.game.game_config import GameConfig, default_config
from src.grid.cell import ATOM_BLACK, ATOM_RED, ATOM_BLUE, ATOM_GREEN
from src.ui.hud import draw_rules_overlay

_BTN_W = 36
_BTN_H = 28
_ROW_H = 36
_LEFT = 120
_LABEL_W = 200
_VAL_W = 48
_GAP = 8


def _draw_num_row(
    screen: pygame.Surface,
    y: int,
    label: str,
    value: int,
    min_val: int,
    max_val: int,
    font: pygame.font.Font,
) -> List[Tuple[pygame.Rect, str]]:
    """绘制一行：标签、数值、[-] [+] 按钮。返回 [(rect, key), ...]。"""
    rects = []
    # 标签
    t0 = font.render(label, True, COLORS["ui_text"])
    screen.blit(t0, (_LEFT, y + (_ROW_H - t0.get_height()) // 2))
    # 数值
    tx = _LEFT + _LABEL_W
    t1 = font.render(str(value), True, (255, 255, 255))
    screen.blit(t1, (tx + (_VAL_W - t1.get_width()) // 2, y + (_ROW_H - t1.get_height()) // 2))
    # [-]
    r_minus = pygame.Rect(tx + _VAL_W + _GAP, y + (_ROW_H - _BTN_H) // 2, _BTN_W, _BTN_H)
    pygame.draw.rect(screen, (50, 58, 70), r_minus)
    pygame.draw.rect(screen, COLORS["ui_accent"], r_minus, 1)
    screen.blit(font.render("-", True, COLORS["ui_text"]), (r_minus.centerx - 6, r_minus.centery - 10))
    rects.append((r_minus, "minus"))
    # [+]
    r_plus = pygame.Rect(r_minus.right + _GAP, r_minus.y, _BTN_W, _BTN_H)
    pygame.draw.rect(screen, (50, 58, 70), r_plus)
    pygame.draw.rect(screen, COLORS["ui_accent"], r_plus, 1)
    screen.blit(font.render("+", True, COLORS["ui_text"]), (r_plus.centerx - 6, r_plus.centery - 10))
    rects.append((r_plus, "plus"))
    return rects


def draw_start_screen(
    screen: pygame.Surface,
    values: Dict[str, Any],
) -> List[Tuple[pygame.Rect, str]]:
    """
    绘制开始界面，返回可点击区域 [(rect, key), ...]。
    values 含: initial_black, initial_red, initial_blue, initial_green,
              base_draw_count, weight_black, weight_red, weight_blue, weight_green.
    key 格式: "initial_black_minus", "initial_black_plus", "base_draw_minus", "start" 等。
    """
    screen.fill(COLORS["background"])
    font = get_font(18)
    font_title = get_font(28)
    title = font_title.render("Atom Game - 游戏设置", True, COLORS["ui_accent"])
    screen.blit(title, ((SCREEN_WIDTH - title.get_width()) // 2, 40))

    out: List[Tuple[pygame.Rect, str]] = []
    y = 100

    # 开局原子数（双方相同）
    t_section = font.render("开局原子数（双方）", True, (200, 200, 200))
    screen.blit(t_section, (_LEFT, y))
    y += _ROW_H + 4

    for key, label in [
        ("initial_black", "黑原子"),
        ("initial_red", "红原子"),
        ("initial_blue", "蓝原子"),
        ("initial_green", "绿原子"),
    ]:
        row_rects = _draw_num_row(
            screen, y, label, values[key], 0, 99, font,
        )
        for r, action in row_rects:
            out.append((r, f"{key}_{action}"))
        y += _ROW_H

    y += 12
    t2 = font.render("每回合基础抽牌数", True, (200, 200, 200))
    screen.blit(t2, (_LEFT, y))
    y += _ROW_H + 4
    row_rects = _draw_num_row(
        screen, y, "抽牌数", values["base_draw_count"], 1, 20, font,
    )
    for r, action in row_rects:
        out.append((r, f"base_draw_count_{action}"))
    y += _ROW_H

    y += 4
    row_rects = _draw_num_row(
        screen, y, "每局可排布原子数", values["base_place_limit"], 1, 20, font,
    )
    for r, action in row_rects:
        out.append((r, f"base_place_limit_{action}"))
    y += _ROW_H

    y += 12
    t3 = font.render("抽牌权重（黑/红/蓝/绿，相对比例）", True, (200, 200, 200))
    screen.blit(t3, (_LEFT, y))
    y += _ROW_H + 4
    for key, label in [
        ("weight_black", "黑"),
        ("weight_red", "红"),
        ("weight_blue", "蓝"),
        ("weight_green", "绿"),
    ]:
        row_rects = _draw_num_row(
            screen, y, label, values[key], 0, 20, font,
        )
        for r, action in row_rects:
            out.append((r, f"{key}_{action}"))
        y += _ROW_H

    y += 24
    rules_r = pygame.Rect(SCREEN_WIDTH // 2 - 220, y, 120, 44)
    pygame.draw.rect(screen, (50, 70, 90), rules_r)
    pygame.draw.rect(screen, COLORS["ui_accent"], rules_r, 2)
    rules_t = get_font(20).render("规则明细", True, COLORS["ui_text"])
    screen.blit(rules_t, rules_t.get_rect(center=rules_r.center))
    out.append((rules_r, "rules"))

    start_r = pygame.Rect(SCREEN_WIDTH // 2 - 80, y, 160, 44)
    pygame.draw.rect(screen, (50, 70, 90), start_r)
    pygame.draw.rect(screen, COLORS["ui_accent"], start_r, 2)
    start_t = get_font(22).render("开始游戏", True, COLORS["ui_text"])
    screen.blit(start_t, start_t.get_rect(center=start_r.center))
    out.append((start_r, "start"))

    return out


def run_start_screen(screen: pygame.Surface) -> GameConfig:
    """
    显示开始界面，处理加减与开始按钮，返回用户确认的 GameConfig。
    """
    cfg = default_config()
    values = {
        "initial_black": cfg.initial_pool[ATOM_BLACK],
        "initial_red": cfg.initial_pool[ATOM_RED],
        "initial_blue": cfg.initial_pool[ATOM_BLUE],
        "initial_green": cfg.initial_pool[ATOM_GREEN],
        "base_draw_count": cfg.base_draw_count,
        "base_place_limit": cfg.base_place_limit,
        "weight_black": cfg.draw_weights[0],
        "weight_red": cfg.draw_weights[1],
        "weight_blue": cfg.draw_weights[2],
        "weight_green": cfg.draw_weights[3],
    }
    clock = pygame.time.Clock()
    from src.config import FPS
    show_rules = False

    while True:
        rects_keys = draw_start_screen(screen, values)
        if show_rules:
            close_rect = draw_rules_overlay(screen)
            rects_keys = [(close_rect, "rules_close")]
        pygame.display.flip()

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                raise SystemExit(0)
            if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                if show_rules:
                    show_rules = False
                else:
                    pygame.quit()
                    raise SystemExit(0)
            if event.type == pygame.MOUSEBUTTONUP and event.button == 1:
                mx, my = event.pos
                for rect, key in rects_keys:
                    if rect.collidepoint(mx, my):
                        if key == "rules_close":
                            show_rules = False
                            break
                        if key == "rules":
                            show_rules = True
                            break
                        if key == "start":
                            return GameConfig(
                                initial_pool={
                                    ATOM_BLACK: values["initial_black"],
                                    ATOM_RED: values["initial_red"],
                                    ATOM_BLUE: values["initial_blue"],
                                    ATOM_GREEN: values["initial_green"],
                                },
                                base_draw_count=values["base_draw_count"],
                                base_place_limit=values["base_place_limit"],
                                draw_weights=[
                                    values["weight_black"],
                                    values["weight_red"],
                                    values["weight_blue"],
                                    values["weight_green"],
                                ],
                            )
                        # key 格式: "initial_black_minus" 等
                        parts = key.rsplit("_", 1)
                        if len(parts) == 2:
                            name, action = parts
                            if action == "minus":
                                if name in values:
                                    lo = 1 if name in ("base_draw_count", "base_place_limit") else 0
                                    if values[name] > lo:
                                        values[name] -= 1
                            elif action == "plus":
                                if name in values:
                                    max_v = 99 if name.startswith("initial") else 20
                                    if values[name] < max_v:
                                        values[name] += 1
                        break

        clock.tick(FPS)
