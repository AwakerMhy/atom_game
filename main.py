"""
Atom Game - 程序入口
"""
import pygame
from src.config import TITLE, SCREEN_SIZE, FPS, COLORS, get_font
from src.game.state import GameState, PHASE_CONFIRM, PHASE_PLACE, PHASE_ACTION
from src.game.turn import (
    apply_phase_0_choice,
    advance_to_phase_1,
    validate_place,
    apply_place,
    end_place_phase,
    end_turn,
)
from src.game import combat
from src.ui.board import draw_board, layout_cell_rects, hit_test_cell
from src.ui import sound as ui_sound
from src.ui.hud import (
    draw_hud,
    draw_phase_0_prompt,
    draw_phase_2_prompt,
    draw_phase_3_prompt,
    draw_rules_overlay,
    draw_attack_defense_hint,
    draw_end_screen,
    get_end_screen_rects,
)
from src.ui.buttons import (
    draw_phase0_buttons,
    draw_atom_pool_and_end,
    draw_phase3_buttons,
    draw_rules_button,
    draw_dragging_ghost,
    hit_button,
)


def main():
    pygame.init()
    pygame.display.set_mode(SCREEN_SIZE)
    screen = pygame.display.get_surface()
    screen.fill(COLORS["background"])
    pygame.display.set_caption(TITLE)

    state = GameState()
    clock = pygame.time.Clock()
    running = True
    message = ""
    cell_rects = layout_cell_rects()

    action_substate = "idle"
    attack_my_cell = None
    attack_enemy_cell = None
    attack_components = None
    attack_extra_pending = None
    effect_red_pending = None
    show_rules = False
    dragging_color = None
    mouse_pos = (0, 0)
    place_history = []
    last_phase0_rects = []
    last_atom_pool_rects = []
    last_phase3_rects = []
    last_rules_rect = None
    last_rules_close_rect = None

    def reset_action():
        nonlocal action_substate, attack_my_cell, attack_enemy_cell, attack_components, attack_extra_pending, effect_red_pending
        action_substate = "idle"
        attack_my_cell = None
        attack_enemy_cell = None
        attack_components = None
        attack_extra_pending = None
        effect_red_pending = None

    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    if show_rules:
                        show_rules = False
                    else:
                        running = False

            if event.type == pygame.MOUSEMOTION:
                mouse_pos = event.pos

            if event.type == pygame.MOUSEBUTTONUP and event.button == 1:
                if dragging_color is not None:
                    mx, my = event.pos[0], event.pos[1]
                    cur = state.current_player
                    hit = hit_test_cell(cell_rects, cur, mx, my)
                    if hit is not None:
                        _, cell_index, (r, c) = hit
                        ok, msg = validate_place(state, cell_index, r, c, dragging_color)
                        if ok:
                            apply_place(state, cell_index, r, c, dragging_color)
                            place_history.append((cell_index, r, c, dragging_color))
                            ui_sound.play_place()
                            message = f"已放置，还可放 {state.turn_place_limit - state.turn_placed_count} 个"
                        else:
                            message = msg
                    dragging_color = None

            if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                mx, my = event.pos[0], event.pos[1]
                winner_check = state.winner()
                consumed = False
                if show_rules and last_rules_close_rect is not None and last_rules_close_rect.collidepoint(mx, my):
                    show_rules = False
                    consumed = True
                elif winner_check is not None:
                    r1, r2 = get_end_screen_rects()
                    if r1.collidepoint(mx, my):
                        state = GameState()
                        reset_action()
                        place_history.clear()
                        message = "新对局开始，P0 先手，请点击下方按钮选择效果"
                        consumed = True
                    elif r2.collidepoint(mx, my):
                        running = False
                        consumed = True
                if not consumed and last_rules_rect is not None and last_rules_rect.collidepoint(mx, my):
                    show_rules = not show_rules
                    consumed = True
                if not consumed and state.phase == PHASE_CONFIRM and last_phase0_rects:
                    bid = hit_button(last_phase0_rects, mx, my)
                    if bid == "a" and apply_phase_0_choice(state, "a"):
                        advance_to_phase_1(state)
                        message = "已选多抽原子，已抽并进入排布"
                        consumed = True
                    elif bid == "b" and apply_phase_0_choice(state, "b"):
                        advance_to_phase_1(state)
                        message = "已选多放置，进入排布"
                        consumed = True
                    elif bid == "c" and apply_phase_0_choice(state, "c"):
                        advance_to_phase_1(state)
                        message = "已选多进攻，进入排布"
                        consumed = True
                if not consumed and state.phase == PHASE_PLACE and last_atom_pool_rects:
                    bid = hit_button(last_atom_pool_rects, mx, my)
                    if bid == "end_place":
                        end_place_phase(state)
                        reset_action()
                        place_history.clear()
                        message = "进入动作阶段；点「结束回合」结束"
                        consumed = True
                    elif bid == "undo" and place_history:
                        cell_index, r, c, color = place_history.pop()
                        state.cells[state.current_player][cell_index].remove(r, c)
                        state.pool(state.current_player)[color] = state.pool(state.current_player).get(color, 0) + 1
                        state.turn_placed_count -= 1
                        message = "已撤回一步"
                        consumed = True
                    elif bid in ("black", "red", "blue", "green") and state.pool(state.current_player).get(bid, 0) > 0:
                        dragging_color = bid
                        consumed = True
                if not consumed and state.phase == PHASE_ACTION and last_phase3_rects:
                    bid = hit_button(last_phase3_rects, mx, my)
                    if bid == "end_turn" and action_substate == "idle":
                        end_turn(state)
                        ui_sound.play_turn_end()
                        reset_action()
                        message = f"P{state.current_player} 回合，请点击下方按钮选择效果"
                        consumed = True
                    elif bid == "cancel":
                        reset_action()
                        message = "已取消"
                        consumed = True
                if not consumed:
                    cur = state.current_player
                    opp = state.opponent(cur)

                    if state.phase == PHASE_PLACE:
                        pass

                    elif state.phase == PHASE_ACTION:
                        if action_substate == "effect_red_pick" and effect_red_pending is not None:
                            att, ci, rr, cc, y, picked = effect_red_pending
                            def_player = state.opponent(att)
                            hit = hit_test_cell(cell_rects, def_player, mx, my)
                            if hit is not None:
                                _, cell_i, pt = hit
                                cell = state.cells[def_player][cell_i]
                                if cell.get(pt[0], pt[1]) is not None:
                                    if (def_player, cell_i, pt) not in picked:
                                        picked.append((def_player, cell_i, pt))
                                        if len(picked) >= y:
                                            combat.apply_effect_red(state, att, ci, rr, cc, picked)
                                            ui_sound.play_effect()
                                            reset_action()
                                            message = "红效果已结算"
                                        else:
                                            message = f"已选 {len(picked)}/{y} 个要破坏的原子"

                        elif action_substate == "attack_choose_component" and attack_components is not None and attack_my_cell is not None and attack_enemy_cell is not None:
                            hit = hit_test_cell(cell_rects, opp, mx, my)
                            if hit is not None:
                                _, cell_i, pt = hit
                                if cell_i != attack_enemy_cell[1]:
                                    message = "请点击被攻击的格子内的格点"
                                else:
                                    defender_cell = state.cells[opp][attack_enemy_cell[1]]
                                    for comp in attack_components:
                                        if (pt[0], pt[1]) in comp:
                                            combat.remove_components_except(defender_cell, comp)
                                            state.turn_attack_used += 1
                                            ui_sound.play_attack()
                                            reset_action()
                                            message = "进攻结算完成"
                                            break
                                    else:
                                        message = "请点击要保留的连通区域内的格点"

                        elif action_substate == "attack_choose_extra" and attack_extra_pending is not None and attack_enemy_cell is not None:
                            extra_count, picked = attack_extra_pending
                            hit = hit_test_cell(cell_rects, opp, mx, my)
                            if hit is not None:
                                _, cell_i, pt = hit
                                if cell_i != attack_enemy_cell[1]:
                                    message = "请点击被攻击的格子内的原子"
                                else:
                                    defender_cell = state.cells[opp][attack_enemy_cell[1]]
                                    if defender_cell.get(pt[0], pt[1]) is not None:
                                        defender_cell.remove(pt[0], pt[1])
                                        picked.append(pt)
                                        ui_sound.play_attack()
                                        if len(picked) >= extra_count or defender_cell.is_empty():
                                            comps = defender_cell.connected_components()
                                            if len(comps) > 1:
                                                attack_components = comps
                                                action_substate = "attack_choose_component"
                                                message = "请选择要保留的连通区域"
                                            else:
                                                state.turn_attack_used += 1
                                                reset_action()
                                                attack_extra_pending = None
                                                message = "进攻完成"
                                        else:
                                            message = f"已选 {len(picked)}/{extra_count} 个额外破坏，请继续点击"
                                    else:
                                        message = "该格点无原子"

                        elif action_substate == "attack_choose_black" and attack_my_cell is not None and attack_enemy_cell is not None:
                            hit = hit_test_cell(cell_rects, opp, mx, my)
                            if hit is not None:
                                _, cell_i, pt = hit
                                cell = state.cells[opp][cell_i]
                                if cell_i == attack_enemy_cell[1] and cell.get(pt[0], pt[1]) == "black":
                                    atk_cell = state.cells[cur][attack_my_cell[1]]
                                    extra = combat.extra_destroys(atk_cell, cell)
                                    dmg, comps = combat.destroy_one_black_and_get_components(
                                        atk_cell,
                                        cell,
                                        pt,
                                    )
                                    state.hp[opp] = max(0, state.hp[opp] - dmg)
                                    if extra > 0 and not cell.is_empty():
                                        attack_extra_pending = (extra, [])
                                        action_substate = "attack_choose_extra"
                                        message = f"请再点击对方格中要破坏的原子（还可选 {extra} 个）"
                                    elif len(comps) > 1:
                                        attack_components = comps
                                        action_substate = "attack_choose_component"
                                        message = "请选择要保留的连通区域"
                                    else:
                                        state.turn_attack_used += 1
                                        ui_sound.play_attack()
                                        reset_action()
                                        message = "进攻完成"
                                else:
                                    message = "请点击被攻击格内的一个黑原子"

                        elif action_substate == "attack_my" and attack_my_cell is not None:
                            hit = hit_test_cell(cell_rects, opp, mx, my)
                            if hit is not None:
                                _, cell_i, _ = hit
                                defender_cell = state.cells[opp][cell_i]
                                if not defender_cell.is_empty():
                                    attack_enemy_cell = (opp, cell_i)
                                    if combat.attack_beats_defense(
                                        state.cells[cur][attack_my_cell[1]], defender_cell
                                    ):
                                        action_substate = "attack_choose_black"
                                        message = "请点击要破坏的黑原子"
                                    else:
                                        message = "攻击力未大于防御力，无效果"
                                        reset_action()
                            else:
                                if all(state.cells[opp][i].is_empty() for i in range(3)):
                                    dmg = combat.resolve_direct_attack(state.cells[cur][attack_my_cell[1]])
                                    state.hp[opp] = max(0, state.hp[opp] - dmg)
                                    state.turn_attack_used += 1
                                    ui_sound.play_attack()
                                    reset_action()
                                    message = f"直接攻击，造成 {dmg} 点伤害"

                        elif action_substate == "idle":
                            hit_my = hit_test_cell(cell_rects, cur, mx, my)
                            if hit_my is not None:
                                _, cell_i, (r, c) = hit_my
                                cell = state.cells[cur][cell_i]
                                color = cell.get(r, c)
                                if color in ("red", "blue", "green"):
                                    if color == "blue":
                                        if combat.apply_effect_blue(state, cur, cell_i, r, c):
                                            ui_sound.play_effect()
                                            message = "蓝效果：获得黑原子"
                                    elif color == "green":
                                        if combat.apply_effect_green(state, cur, cell_i, r, c):
                                            ui_sound.play_effect()
                                            message = "绿效果：恢复生命"
                                    elif color == "red":
                                        y = cell.count_black_neighbors(r, c)
                                        if y > 0:
                                            effect_red_pending = (cur, cell_i, r, c, y, [])
                                            action_substate = "effect_red_pick"
                                            message = f"请点击对方场上 {y} 个要破坏的原子"
                                        else:
                                            message = "该红原子未与黑相邻，无法发动"
                                elif not cell.is_empty() and state.can_attack_this_turn():
                                    attack_my_cell = (cur, cell_i)
                                    action_substate = "attack_my"
                                    message = "请点击对方格子进攻（或对方全空则直接伤害）"

        screen.fill(COLORS["background"])
        highlight = (attack_my_cell[0], attack_my_cell[1]) if attack_my_cell else None
        highlight_atoms_by_cell = {}
        if state.phase == PHASE_PLACE and place_history:
            for (ci, r, c, _) in place_history:
                highlight_atoms_by_cell.setdefault(ci, set()).add((r, c))
        cell_rects = draw_board(
            screen,
            state.cells,
            highlight_cell=highlight,
            current_player=state.current_player if state.phase == PHASE_PLACE else None,
            highlight_atoms_by_cell=highlight_atoms_by_cell if state.phase == PHASE_PLACE else None,
        )
        draw_hud(screen, state, message)

        if state.phase == PHASE_CONFIRM:
            last_phase0_rects = draw_phase0_buttons(screen)
            draw_phase_0_prompt(screen)
        else:
            last_phase0_rects = []
        if state.phase == PHASE_PLACE:
            last_atom_pool_rects = draw_atom_pool_and_end(
                screen,
                state.pool(state.current_player),
                state.turn_place_limit,
                state.turn_placed_count,
                state.current_player,
            )
            draw_phase_2_prompt(screen, state.turn_place_limit, state.turn_placed_count, state.current_player)
        else:
            last_atom_pool_rects = []
        if state.phase == PHASE_ACTION:
            last_phase3_rects = draw_phase3_buttons(screen, action_substate)
            draw_phase_3_prompt(
                screen,
                action_substate,
                state.turn_attack_limit - state.turn_attack_used,
                state.can_attack_this_turn(),
            )
            draw_attack_defense_hint(screen, state, attack_my_cell, attack_enemy_cell)
        else:
            last_phase3_rects = []

        last_rules_rect = draw_rules_button(screen)

        if show_rules:
            last_rules_close_rect = draw_rules_overlay(screen)
        else:
            last_rules_close_rect = None

        if dragging_color is not None:
            draw_dragging_ghost(screen, dragging_color, mouse_pos)

        winner = state.winner()
        if winner is not None:
            draw_end_screen(screen, winner)

        pygame.display.flip()
        clock.tick(FPS)

    pygame.quit()


if __name__ == "__main__":
    main()
