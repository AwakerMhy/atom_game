"""
Atom Game - 程序入口
"""
import pygame
from src.config import TITLE, SCREEN_SIZE, FPS, COLORS, get_font
from src.game.state import GameState, PHASE_CONFIRM, PHASE_PLACE, PHASE_ACTION
from src.game.turn import (
    start_turn_default,
    validate_place,
    apply_place,
    batch_place_on_cell,
    end_place_phase,
    end_turn,
)
from src.game import combat
from src.game.combat import (
    clear_cell_if_no_black,
    remove_components_without_black_and_return_rest,
    remove_black_atoms_except,
    apply_green_end_of_turn,
)
from src.ui.board import draw_board, layout_cell_rects, hit_test_cell, _default_view_origin, CELL_FRAME_W
from src.ui import sound as ui_sound
from src.ui.hud import (
    draw_hud,
    draw_phase_2_prompt,
    draw_phase_3_prompt,
    draw_rules_overlay,
    draw_attack_defense_hint,
    draw_end_screen,
    get_end_screen_rects,
)
from src.ui.buttons import (
    draw_atom_pool_and_end,
    draw_batch_place_button,
    draw_batch_place_panel,
    batch_place_value_from_track,
    draw_confirm_dialog,
    draw_direct_attack_confirm,
    draw_phase3_buttons,
    draw_rules_button,
    draw_pan_mode_button,
    draw_grid_scale_slider,
    grid_scale_value_from_track,
    draw_dragging_ghost,
    hit_button,
)
from src.grid.cell import ATOM_BLACK
from src.ui.grid_render import get_scale_for_cell, clamp_view_origin
from src.ui.start_screen import run_start_screen
import random


def main():
    pygame.init()
    pygame.display.set_mode(SCREEN_SIZE)
    screen = pygame.display.get_surface()
    screen.fill(COLORS["background"])
    pygame.display.set_caption(TITLE)

    game_config = run_start_screen(screen)
    state = GameState(config=game_config)
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
    effect_red_target_cell = None  # 红效果选定的对方格子索引（0/1/2），仅该格内可选破坏
    effect_red_components_pending = None  # (def_player, [(cell_i, components), ...]) 红效果后多分量格选连通子集
    attack_black_components_pending = None  # (opp, cell_i, [black_comp, ...]) 进攻后选黑原子连通子集
    effect_red_black_components_pending = None  # (def_player, cell_i, [black_comp, ...]) 红效果后选黑原子连通子集
    show_rules = False
    dragging_color = None
    mouse_pos = (0, 0)
    place_history = []
    last_atom_pool_rects = []
    last_phase3_rects = []
    last_rules_rect = None
    last_rules_close_rect = None
    last_pan_rect = None
    pan_mode = False
    pan_start = None  # (p, ci, start_r0, start_c0, start_mx, start_my, start_pan_x, start_pan_y)
    grid_scale_denom = 4  # 三角形边长 : 格子边长 = 1 : grid_scale_denom（3~10 可调）
    grid_slider_dragging = False
    last_grid_slider_track_rect = None
    batch_place_mode = False  # 批量放置面板打开时为 True
    batch_place_slider_value = 0  # 滑条当前数量
    batch_place_slider_dragging = False
    last_batch_place_btn_rect = None
    last_batch_cell1_rect = None
    last_batch_cell2_rect = None
    last_batch_cell3_rect = None
    last_batch_cancel_rect = None
    last_batch_slider_track_rect = None
    last_direct_attack_yes_rect = None
    last_direct_attack_no_rect = None
    last_confirm_yes_rect = None
    last_confirm_no_rect = None
    # 每格视窗原点 (r0, c0) 与像素偏移 (pan_x, pan_y)，后者实现连续滑动
    _vo = _default_view_origin()
    view_offsets = [[_vo for _ in range(3)] for _ in range(2)]
    view_pan_px = [[(0.0, 0.0) for _ in range(3)] for _ in range(2)]

    def _red_effect_remove_no_black(state, def_player):
        """红效果结算后：被攻击方各格若无黑原子则整格清空。"""
        for cell in state.cells[def_player]:
            if not cell.has_black() and not cell.is_empty():
                for p in list(cell.all_atoms().keys()):
                    cell.remove(p[0], p[1])

    def reset_action():
        nonlocal action_substate, attack_my_cell, attack_enemy_cell, attack_components, attack_extra_pending
        nonlocal effect_red_pending, effect_red_target_cell, effect_red_components_pending
        nonlocal attack_black_components_pending, effect_red_black_components_pending
        action_substate = "idle"
        attack_my_cell = None
        attack_enemy_cell = None
        attack_components = None
        attack_extra_pending = None
        effect_red_pending = None
        effect_red_target_cell = None
        effect_red_components_pending = None
        attack_black_components_pending = None
        effect_red_black_components_pending = None

    while running:
        # 取消回合开始三选一：直接按默认抽牌与放置进入排布阶段
        if state.phase == PHASE_CONFIRM:
            start_turn_default(state)

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            if event.type == pygame.KEYDOWN:
                if batch_place_mode:
                    if event.key == pygame.K_ESCAPE:
                        batch_place_mode = False
                        batch_place_slider_value = 0
                elif event.key == pygame.K_ESCAPE:
                    if show_rules:
                        show_rules = False
                    else:
                        running = False

            if event.type == pygame.MOUSEMOTION:
                mouse_pos = event.pos
                if grid_slider_dragging and last_grid_slider_track_rect is not None:
                    grid_scale_denom = grid_scale_value_from_track(last_grid_slider_track_rect, mouse_pos[0])
                elif batch_place_slider_dragging and last_batch_slider_track_rect is not None:
                    bmax = min(
                        state.pool(state.current_player).get(ATOM_BLACK, 0),
                        state.turn_place_limit - state.turn_placed_count,
                    )
                    batch_place_slider_value = batch_place_value_from_track(
                        last_batch_slider_track_rect, mouse_pos[0], max(1, bmax)
                    )
                elif pan_start is not None:
                    p, ci, start_r0, start_c0, start_mx, start_my, start_pan_x, start_pan_y = pan_start
                    dx = mouse_pos[0] - start_mx
                    dy = mouse_pos[1] - start_my
                    view_pan_px[p][ci] = (start_pan_x + dx, start_pan_y + dy)

            if event.type == pygame.MOUSEBUTTONUP and event.button == 1:
                if grid_slider_dragging:
                    grid_slider_dragging = False
                elif batch_place_slider_dragging:
                    batch_place_slider_dragging = False
                elif pan_start is not None:
                    pan_start = None
                elif dragging_color is not None:
                    mx, my = event.pos[0], event.pos[1]
                    cur = state.current_player
                    hit = hit_test_cell(cell_rects, cur, mx, my, view_offsets, view_pan_px, grid_scale_denom)
                    if hit is not None:
                        _, cell_index, (r, c) = hit
                        cell = state.cells[cur][cell_index]
                        ok, msg = None, None
                        if (
                            getattr(state.config, "random_place_black_on_neighbor", False)
                            and dragging_color == "black"
                            and not cell.is_empty()
                        ):
                            pt = cell.random_empty_neighbor()
                            if pt is not None:
                                r, c = pt[0], pt[1]
                            else:
                                ok, msg = False, "该格无空邻格可放黑原子"
                        if ok is None:
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
                # 视角模式优先：点击格子即拖动整格几何（六边形+网格+原子一起动）
                if pan_mode and dragging_color is None:
                    for p in range(2):
                        for ci in range(3):
                            x, y, w, h = cell_rects[p][ci]
                            xf, yf = x - CELL_FRAME_W, y - CELL_FRAME_W
                            wf, hf = w + 2 * CELL_FRAME_W, h + 2 * CELL_FRAME_W
                            if xf <= mx <= xf + wf and yf <= my <= yf + hf:
                                r0, c0 = view_offsets[p][ci]
                                r0, c0 = clamp_view_origin(r0, c0)
                                view_offsets[p][ci] = (r0, c0)
                                pan_x, pan_y = view_pan_px[p][ci]
                                pan_start = (p, ci, r0, c0, mx, my, pan_x, pan_y)
                                consumed = True
                                break
                        if pan_start is not None:
                            break
                if not consumed and show_rules and last_rules_close_rect is not None and last_rules_close_rect.collidepoint(mx, my):
                    show_rules = False
                    consumed = True
                elif winner_check is not None:
                    r1, r2 = get_end_screen_rects()
                    if r1.collidepoint(mx, my):
                        state = GameState(config=game_config)
                        reset_action()
                        place_history.clear()
                        _vo = _default_view_origin()
                        view_offsets[:] = [[_vo for _ in range(3)] for _ in range(2)]
                        view_pan_px[:] = [[(0.0, 0.0) for _ in range(3)] for _ in range(2)]
                        ui_sound.play_click()
                        message = "新对局开始，P0 先手，请点击下方按钮选择效果"
                        consumed = True
                    elif r2.collidepoint(mx, my):
                        ui_sound.play_click()
                        running = False
                        consumed = True
                if not consumed and last_rules_rect is not None and last_rules_rect.collidepoint(mx, my):
                    show_rules = not show_rules
                    ui_sound.play_click()
                    consumed = True
                if not consumed and last_pan_rect is not None and last_pan_rect.collidepoint(mx, my):
                    pan_mode = not pan_mode
                    ui_sound.play_click()
                    consumed = True
                if not consumed and last_grid_slider_track_rect is not None and last_grid_slider_track_rect.collidepoint(mx, my):
                    grid_slider_dragging = True
                    grid_scale_denom = grid_scale_value_from_track(last_grid_slider_track_rect, mx)
                    consumed = True
                if not consumed and batch_place_mode and last_batch_slider_track_rect is not None and last_batch_slider_track_rect.collidepoint(mx, my):
                    batch_place_slider_dragging = True
                    bmax = min(
                        state.pool(state.current_player).get(ATOM_BLACK, 0),
                        state.turn_place_limit - state.turn_placed_count,
                    )
                    batch_place_slider_value = batch_place_value_from_track(last_batch_slider_track_rect, mx, max(1, bmax))
                    consumed = True
                if not consumed and batch_place_mode and last_batch_cancel_rect is not None:
                    if last_batch_cancel_rect.collidepoint(mx, my):
                        batch_place_mode = False
                        batch_place_slider_value = 0
                        consumed = True
                    else:
                        n = batch_place_slider_value
                        if last_batch_cell1_rect is not None and last_batch_cell1_rect.collidepoint(mx, my):
                            ok, msg = batch_place_on_cell(state, 0, n)
                            message = msg
                            if ok:
                                ui_sound.play_place()
                                batch_place_mode = False
                            consumed = True
                        elif last_batch_cell2_rect is not None and last_batch_cell2_rect.collidepoint(mx, my):
                            ok, msg = batch_place_on_cell(state, 1, n)
                            message = msg
                            if ok:
                                ui_sound.play_place()
                                batch_place_mode = False
                            consumed = True
                        elif last_batch_cell3_rect is not None and last_batch_cell3_rect.collidepoint(mx, my):
                            ok, msg = batch_place_on_cell(state, 2, n)
                            message = msg
                            if ok:
                                ui_sound.play_place()
                                batch_place_mode = False
                            consumed = True
                if not consumed and last_batch_place_btn_rect is not None and last_batch_place_btn_rect.collidepoint(mx, my):
                    batch_place_mode = True
                    batch_place_slider_value = 0
                    consumed = True
                if not consumed and batch_place_mode:
                    consumed = True  # 批量放置面板打开时，其他点击不处理
                if not consumed and action_substate == "confirm_end_place" and last_confirm_yes_rect is not None and last_confirm_no_rect is not None:
                    if last_confirm_yes_rect.collidepoint(mx, my):
                        end_place_phase(state)
                        reset_action()
                        place_history.clear()
                        ui_sound.play_click()
                        message = "进入动作阶段；点「结束回合」结束"
                        action_substate = "idle"
                        consumed = True
                    elif last_confirm_no_rect.collidepoint(mx, my):
                        action_substate = "idle"
                        ui_sound.play_click()
                        consumed = True
                if not consumed and action_substate == "confirm_end_turn" and last_confirm_yes_rect is not None and last_confirm_no_rect is not None:
                    if last_confirm_yes_rect.collidepoint(mx, my):
                        cur_ending = state.current_player
                        green_gain = apply_green_end_of_turn(state, cur_ending)
                        end_turn(state)
                        ui_sound.play_turn_end()
                        reset_action()
                        message = f"P{state.current_player} 回合，请点击下方按钮选择效果"
                        if green_gain > 0:
                            message = f"绿持续效果：获得 {green_gain} 黑 | " + message
                        action_substate = "idle"
                        consumed = True
                    elif last_confirm_no_rect.collidepoint(mx, my):
                        action_substate = "idle"
                        ui_sound.play_click()
                        consumed = True
                if not consumed and state.phase == PHASE_PLACE and last_atom_pool_rects:
                    bid = hit_button(last_atom_pool_rects, mx, my)
                    if bid == "end_place":
                        action_substate = "confirm_end_place"
                        ui_sound.play_click()
                        consumed = True
                    elif bid == "undo" and place_history:
                        cell_index, r, c, color = place_history.pop()
                        state.cells[state.current_player][cell_index].remove(r, c)
                        state.pool(state.current_player)[color] = state.pool(state.current_player).get(color, 0) + 1
                        state.turn_placed_count -= 1
                        ui_sound.play_undo()
                        message = "已撤回一步"
                        consumed = True
                    elif bid in ("black", "red", "blue", "green") and state.pool(state.current_player).get(bid, 0) > 0 and not pan_mode:
                        dragging_color = bid
                        consumed = True
                if not consumed and state.phase == PHASE_ACTION and last_phase3_rects:
                    bid = hit_button(last_phase3_rects, mx, my)
                    if bid == "end_turn" and action_substate == "idle":
                        action_substate = "confirm_end_turn"
                        ui_sound.play_click()
                        consumed = True
                    elif bid == "cancel":
                        reset_action()
                        ui_sound.play_click()
                        message = "已取消"
                        consumed = True
                if not consumed:
                    cur = state.current_player
                    opp = state.opponent(cur)

                    if state.phase == PHASE_PLACE:
                        pass

                    elif state.phase == PHASE_ACTION:
                        if action_substate == "effect_red_choose_cell" and effect_red_pending is not None:
                            att, ci, rr, cc, y, picked = effect_red_pending
                            def_player = state.opponent(att)
                            hit = hit_test_cell(cell_rects, def_player, mx, my, view_offsets, view_pan_px, grid_scale_denom)
                            if hit is not None:
                                _, cell_i, pt = hit
                                target_cell = state.cells[def_player][cell_i]
                                if not target_cell.is_empty():
                                    effect_red_target_cell = cell_i
                                    if getattr(state.config, "random_destroy_on_attack", False):
                                        blacks = [
                                            pt for pt in target_cell.black_points()
                                            if not state.is_black_protected(def_player, cell_i, pt)
                                        ]
                                        k = min(y, len(blacks))
                                        sampled = random.sample(blacks, k) if blacks else []
                                        picked = [(def_player, cell_i, pt) for pt in sampled]
                                        combat.apply_effect_red(state, att, ci, rr, cc, picked)
                                        ui_sound.play_effect()
                                        cells_with_components = [
                                            (c_i, state.cells[def_player][c_i].connected_components())
                                            for c_i in range(3)
                                            if len(state.cells[def_player][c_i].connected_components()) > 1
                                        ]
                                        if cells_with_components:
                                            effect_red_components_pending = (def_player, cells_with_components)
                                            action_substate = "effect_red_choose_component"
                                            message = "红效果：被攻击方请选择要保留的连通区域（点击格点）；选无黑子集则该子集也破坏"
                                        else:
                                            _red_effect_remove_no_black(state, def_player)
                                            reset_action()
                                            message = "红效果已结算"
                                    else:
                                        action_substate = "effect_red_pick"
                                        message = f"请点击该格子内 {y} 个要破坏的黑原子"
                                else:
                                    message = "该格子为空，请点击对方有原子的格子"
                            else:
                                message = "请点击对方的一个格子（窗口）以选择红效果作用目标"

                        elif action_substate == "effect_red_pick" and effect_red_pending is not None and effect_red_target_cell is not None:
                            att, ci, rr, cc, y, picked = effect_red_pending
                            def_player = state.opponent(att)
                            hit = hit_test_cell(cell_rects, def_player, mx, my, view_offsets, view_pan_px, grid_scale_denom)
                            if hit is not None:
                                _, cell_i, pt = hit
                                if cell_i != effect_red_target_cell:
                                    message = "请点击已选格子内的原子"
                                elif state.is_black_protected(def_player, cell_i, pt):
                                    message = "该黑原子受蓝效果保护，无法选择"
                                else:
                                    cell = state.cells[def_player][cell_i]
                                    if cell.get(pt[0], pt[1]) is not None:
                                        if (def_player, cell_i, pt) not in picked:
                                            picked.append((def_player, cell_i, pt))
                                            if len(picked) >= y:
                                                combat.apply_effect_red(state, att, ci, rr, cc, picked)
                                                ui_sound.play_effect()
                                                def_player = state.opponent(att)
                                                cells_with_components = [
                                                    (c_i, state.cells[def_player][c_i].connected_components())
                                                    for c_i in range(3)
                                                    if len(state.cells[def_player][c_i].connected_components()) > 1
                                                ]
                                                if cells_with_components:
                                                    effect_red_components_pending = (def_player, cells_with_components)
                                                    action_substate = "effect_red_choose_component"
                                                    message = "红效果：被攻击方请选择要保留的连通区域（点击格点）；选无黑子集则该子集也破坏"
                                                else:
                                                    _red_effect_remove_no_black(state, def_player)
                                                    reset_action()
                                                    message = "红效果已结算"
                                            else:
                                                message = f"已选 {len(picked)}/{y} 个要破坏的原子"
                                    else:
                                        message = "请点击该格子内的原子"

                        elif action_substate == "effect_red_choose_component" and effect_red_components_pending is not None:
                            def_player, cell_comps_list = effect_red_components_pending
                            hit = hit_test_cell(cell_rects, def_player, mx, my, view_offsets, view_pan_px, grid_scale_denom)
                            if hit is not None:
                                _, cell_i, pt = hit
                                cell = state.cells[def_player][cell_i]
                                pt_tuple = (pt[0], pt[1])
                                if cell.get(pt[0], pt[1]) is None:
                                    message = "请点击有原子的格点"
                                else:
                                    # 找到该格在 pending 中的条目及包含 pt 的连通分量
                                    found = False
                                    for idx, (c_i, components) in enumerate(cell_comps_list):
                                        if c_i != cell_i:
                                            continue
                                        comp_containing = None
                                        for comp in components:
                                            if pt_tuple in comp:
                                                comp_containing = comp
                                                break
                                        if comp_containing is None:
                                            continue
                                        found = True
                                        has_black = bool(comp_containing & cell.black_points())
                                        if has_black:
                                            combat.remove_components_except(cell, comp_containing)
                                        else:
                                            combat.remove_component(cell, comp_containing)
                                        black_comps = cell.black_connected_components()
                                        if len(black_comps) > 1:
                                            effect_red_black_components_pending = (def_player, cell_i, black_comps)
                                            cell_comps_list.pop(idx)
                                            action_substate = "effect_red_choose_black_component"
                                            message = "红效果：请选择要保留的黑原子连通子集（点击其中一格点）"
                                        else:
                                            remove_components_without_black_and_return_rest(cell)
                                            comps_after = cell.connected_components()
                                            if len(comps_after) <= 1:
                                                cell_comps_list.pop(idx)
                                            else:
                                                cell_comps_list[idx] = (cell_i, comps_after)
                                            if not cell_comps_list:
                                                _red_effect_remove_no_black(state, def_player)
                                                reset_action()
                                                message = "红效果已结算"
                                            else:
                                                message = "红效果：请继续选择要保留的连通区域（或选无黑子集则破坏该子集）"
                                        break
                                    if not found:
                                        message = "请点击当前需选择的格子内的格点"
                            else:
                                message = "请点击被攻击方格子内的格点"

                        elif action_substate == "attack_choose_component" and attack_components is not None and attack_my_cell is not None and attack_enemy_cell is not None:
                            hit = hit_test_cell(cell_rects, opp, mx, my, view_offsets, view_pan_px, grid_scale_denom)
                            if hit is not None:
                                _, cell_i, pt = hit
                                if cell_i != attack_enemy_cell[1]:
                                    message = "请点击被攻击的格子内的格点"
                                else:
                                    defender_cell = state.cells[opp][attack_enemy_cell[1]]
                                    for comp in attack_components:
                                        if (pt[0], pt[1]) in comp:
                                            combat.remove_components_except(defender_cell, comp)
                                            ui_sound.play_attack()
                                            black_comps = defender_cell.black_connected_components()
                                            if len(black_comps) > 1:
                                                attack_black_components_pending = (opp, attack_enemy_cell[1], black_comps)
                                                action_substate = "attack_choose_black_component"
                                                message = "请选择要保留的黑原子连通子集（点击其中一格点）"
                                            else:
                                                remove_components_without_black_and_return_rest(defender_cell)
                                                state.turn_attack_used += 1
                                                reset_action()
                                                message = "进攻结算完成"
                                            break
                                    else:
                                        message = "请点击要保留的连通区域内的格点"

                        elif action_substate == "attack_choose_black_component" and attack_black_components_pending is not None and attack_enemy_cell is not None:
                            opp_b, cell_i_b, black_comps = attack_black_components_pending
                            hit = hit_test_cell(cell_rects, opp_b, mx, my, view_offsets, view_pan_px, grid_scale_denom)
                            if hit is not None:
                                _, cell_i, pt = hit
                                if cell_i != cell_i_b:
                                    message = "请点击被攻击的格子内的格点"
                                else:
                                    defender_cell = state.cells[opp_b][cell_i_b]
                                    pt_tuple = (pt[0], pt[1])
                                    if defender_cell.get(pt[0], pt[1]) != "black":
                                        message = "请点击黑原子所在格点"
                                    else:
                                        comp_containing = None
                                        for comp in black_comps:
                                            if pt_tuple in comp:
                                                comp_containing = comp
                                                break
                                        if comp_containing is not None:
                                            remove_black_atoms_except(defender_cell, comp_containing)
                                            remove_components_without_black_and_return_rest(defender_cell)
                                            state.turn_attack_used += 1
                                            ui_sound.play_attack()
                                            reset_action()
                                            message = "进攻结算完成"
                                        else:
                                            message = "请点击要保留的黑原子连通子集内的格点"
                            else:
                                message = "请点击被攻击的格子内的黑原子"

                        elif action_substate == "effect_red_choose_black_component" and effect_red_black_components_pending is not None and effect_red_components_pending is not None:
                            def_player_b, cell_i_b, black_comps = effect_red_black_components_pending
                            hit = hit_test_cell(cell_rects, def_player_b, mx, my, view_offsets, view_pan_px, grid_scale_denom)
                            if hit is not None:
                                _, cell_i, pt = hit
                                if cell_i != cell_i_b:
                                    message = "请点击当前需选择的格子内的格点"
                                else:
                                    cell = state.cells[def_player_b][cell_i_b]
                                    pt_tuple = (pt[0], pt[1])
                                    if cell.get(pt[0], pt[1]) != "black":
                                        message = "请点击黑原子所在格点"
                                    else:
                                        comp_containing = None
                                        for comp in black_comps:
                                            if pt_tuple in comp:
                                                comp_containing = comp
                                                break
                                        if comp_containing is not None:
                                            remove_black_atoms_except(cell, comp_containing)
                                            remove_components_without_black_and_return_rest(cell)
                                            _, cell_comps_list = effect_red_components_pending
                                            if not cell_comps_list:
                                                _red_effect_remove_no_black(state, def_player_b)
                                                reset_action()
                                                message = "红效果已结算"
                                            else:
                                                action_substate = "effect_red_choose_component"
                                                effect_red_black_components_pending = None
                                                message = "红效果：请继续选择要保留的连通区域（或选无黑子集则破坏该子集）"
                                        else:
                                            message = "请点击要保留的黑原子连通子集内的格点"
                            else:
                                message = "请点击当前需选择的格子内的黑原子"

                        elif action_substate == "attack_choose_extra" and attack_extra_pending is not None and attack_enemy_cell is not None:
                            extra_count, picked = attack_extra_pending
                            hit = hit_test_cell(cell_rects, opp, mx, my, view_offsets, view_pan_px, grid_scale_denom)
                            if hit is not None:
                                _, cell_i, pt = hit
                                if cell_i != attack_enemy_cell[1]:
                                    message = "请点击被攻击的格子内的原子"
                                else:
                                    defender_cell = state.cells[opp][attack_enemy_cell[1]]
                                    if defender_cell.get(pt[0], pt[1]) is not None:
                                        if defender_cell.get(pt[0], pt[1]) == "black" and state.is_black_protected(opp, attack_enemy_cell[1], pt):
                                            message = "该黑原子受蓝效果保护，无法选择"
                                        else:
                                            defender_cell.remove(pt[0], pt[1])
                                            picked.append(pt)
                                            ui_sound.play_attack()
                                            if len(picked) >= extra_count or defender_cell.is_empty():
                                                for def_cell in state.cells[opp]:
                                                    clear_cell_if_no_black(def_cell)
                                                comps = remove_components_without_black_and_return_rest(defender_cell)
                                                if len(comps) > 1:
                                                    attack_components = comps
                                                    action_substate = "attack_choose_component"
                                                    message = "请选择要保留的连通区域"
                                                else:
                                                    attack_extra_pending = None
                                                    black_comps = defender_cell.black_connected_components()
                                                    if len(black_comps) > 1:
                                                        attack_black_components_pending = (opp, attack_enemy_cell[1], black_comps)
                                                        action_substate = "attack_choose_black_component"
                                                        message = "请选择要保留的黑原子连通子集（点击其中一格点）"
                                                    else:
                                                        state.turn_attack_used += 1
                                                        reset_action()
                                                        message = "进攻完成"
                                            else:
                                                message = f"已选 {len(picked)}/{extra_count} 个额外破坏，请继续点击"
                                    else:
                                        message = "该格点无原子"

                        elif action_substate == "attack_choose_black" and attack_my_cell is not None and attack_enemy_cell is not None:
                            hit = hit_test_cell(cell_rects, opp, mx, my, view_offsets, view_pan_px, grid_scale_denom)
                            if hit is not None:
                                _, cell_i, pt = hit
                                cell = state.cells[opp][cell_i]
                                if cell_i == attack_enemy_cell[1] and cell.get(pt[0], pt[1]) == "black":
                                    if state.is_black_protected(opp, cell_i, pt):
                                        message = "该黑原子受蓝效果保护，无法选择"
                                    else:
                                        atk_cell = state.cells[cur][attack_my_cell[1]]
                                        extra = combat.extra_destroys(atk_cell, cell)
                                        dmg, _ = combat.destroy_one_black_and_get_components(
                                            atk_cell,
                                            cell,
                                            pt,
                                        )
                                        state.hp[opp] = max(0, state.hp[opp] - dmg)
                                        for def_cell in state.cells[opp]:
                                            clear_cell_if_no_black(def_cell)
                                        comps = remove_components_without_black_and_return_rest(cell)
                                        if extra > 0 and not cell.is_empty():
                                            attack_extra_pending = (extra, [])
                                            action_substate = "attack_choose_extra"
                                            message = f"请再点击对方格中要破坏的原子（还可选 {extra} 个）"
                                        elif len(comps) > 1:
                                            attack_components = comps
                                            action_substate = "attack_choose_component"
                                            message = "请选择要保留的连通区域"
                                        else:
                                            black_comps = cell.black_connected_components()
                                            if len(black_comps) > 1:
                                                attack_black_components_pending = (opp, cell_i, black_comps)
                                                action_substate = "attack_choose_black_component"
                                                message = "请选择要保留的黑原子连通子集（点击其中一格点）"
                                            else:
                                                state.turn_attack_used += 1
                                                ui_sound.play_attack()
                                                reset_action()
                                                message = "进攻完成"
                                else:
                                    message = "请点击被攻击格内的一个黑原子"

                        elif action_substate == "attack_my" and attack_my_cell is not None:
                            hit = hit_test_cell(cell_rects, opp, mx, my, view_offsets, view_pan_px, grid_scale_denom)
                            if hit is not None:
                                _, cell_i, _ = hit
                                defender_cell = state.cells[opp][cell_i]
                                if not defender_cell.is_empty():
                                    attack_enemy_cell = (opp, cell_i)
                                    atk_cell = state.cells[cur][attack_my_cell[1]]
                                    if combat.attack_beats_defense(atk_cell, defender_cell):
                                        if getattr(state.config, "random_destroy_on_attack", False):
                                            blacks = [
                                                pt for pt in defender_cell.black_points()
                                                if not state.is_black_protected(opp, cell_i, pt)
                                            ]
                                            if blacks:
                                                pt = random.choice(blacks)
                                                dmg, _ = combat.destroy_one_black_and_get_components(
                                                    atk_cell, defender_cell, pt
                                                )
                                                state.hp[opp] = max(0, state.hp[opp] - dmg)
                                                # 随机破坏模式下，红原子造成的额外破坏也随机选择
                                                extra = combat.extra_destroys(atk_cell, defender_cell)
                                                if extra > 0 and not defender_cell.is_empty():
                                                    all_pts = list(defender_cell.all_atoms().keys())
                                                    to_remove = random.sample(all_pts, min(extra, len(all_pts)))
                                                    for (r, c) in to_remove:
                                                        defender_cell.remove(r, c)
                                                for def_cell in state.cells[opp]:
                                                    clear_cell_if_no_black(def_cell)
                                                comps = remove_components_without_black_and_return_rest(defender_cell)
                                                if len(comps) > 1:
                                                    attack_components = comps
                                                    action_substate = "attack_choose_component"
                                                    message = "请选择要保留的连通区域"
                                                else:
                                                    black_comps = defender_cell.black_connected_components()
                                                    if len(black_comps) > 1:
                                                        attack_black_components_pending = (opp, cell_i, black_comps)
                                                        action_substate = "attack_choose_black_component"
                                                        message = "请选择要保留的黑原子连通子集（点击其中一格点）"
                                                    else:
                                                        state.turn_attack_used += 1
                                                        ui_sound.play_attack()
                                                        reset_action()
                                                        message = "进攻完成"
                                                ui_sound.play_destroy()
                                            else:
                                                action_substate = "attack_choose_black"
                                                message = "请点击要破坏的黑原子"
                                        else:
                                            action_substate = "attack_choose_black"
                                            message = "请点击要破坏的黑原子"
                                    else:
                                        message = "攻击力未大于防御力，无效果"
                                        reset_action()
                            else:
                                pass  # 对方有格子非空时点击空白处无操作；对方全空时已走 direct_attack_confirm

                        elif action_substate == "direct_attack_confirm" and attack_my_cell is not None:
                            if last_direct_attack_yes_rect is not None and last_direct_attack_yes_rect.collidepoint(mx, my):
                                opp = state.opponent(cur)
                                dmg = combat.resolve_direct_attack(state.cells[cur][attack_my_cell[1]])
                                state.hp[opp] = max(0, state.hp[opp] - dmg)
                                state.turn_attack_used += 1
                                ui_sound.play_attack()
                                reset_action()
                                message = f"直接攻击，造成 {dmg} 点伤害"
                                consumed = True
                            elif last_direct_attack_no_rect is not None and last_direct_attack_no_rect.collidepoint(mx, my):
                                reset_action()
                                message = "已取消直接攻击"
                                consumed = True
                            else:
                                consumed = True  # 弹窗打开时点击别处仅忽略，不触发其他操作

                        elif action_substate == "idle":
                            hit_my = hit_test_cell(cell_rects, cur, mx, my, view_offsets, view_pan_px, grid_scale_denom)
                            if hit_my is not None:
                                _, cell_i, (r, c) = hit_my
                                cell = state.cells[cur][cell_i]
                                color = cell.get(r, c)
                                if color in ("red", "blue", "green"):
                                    if color == "blue":
                                        if combat.apply_effect_blue(state, cur, cell_i, r, c):
                                            ui_sound.play_effect()
                                            message = "蓝效果：相邻黑原子下一回合内不可被破坏"
                                    elif color == "green":
                                        if combat.apply_effect_green(state, cur, cell_i, r, c):
                                            ui_sound.play_effect()
                                            message = "绿效果：该格点变为黑原子"
                                    elif color == "red":
                                        y = cell.count_black_neighbors(r, c)
                                        if y > 0:
                                            effect_red_pending = (cur, cell_i, r, c, y, [])
                                            action_substate = "effect_red_choose_cell"
                                            message = "请先点击对方要作用的一个格子（窗口）"
                                        else:
                                            message = "该红原子未与黑相邻，无法发动"
                                elif not cell.is_empty() and state.can_attack_this_turn():
                                    attack_my_cell = (cur, cell_i)
                                    # 仅当对方三格皆空时可被直接攻击，此时弹出确认
                                    if all(state.cells[opp][i].is_empty() for i in range(3)):
                                        action_substate = "direct_attack_confirm"
                                        message = "对方三格皆空，是否要直接攻击？"
                                    else:
                                        action_substate = "attack_my"
                                        message = "请点击对方格子进攻"

        screen.fill(COLORS["background"])
        highlight = (attack_my_cell[0], attack_my_cell[1]) if attack_my_cell else None
        highlight_atoms_by_cell = {}
        if state.phase == PHASE_PLACE and place_history:
            for (ci, r, c, _) in place_history:
                highlight_atoms_by_cell.setdefault(ci, set()).add((r, c))
        highlight_atoms_red_for_player = None
        if effect_red_pending is not None:
            _, _, _, _, _, picked = effect_red_pending
            if picked:
                def_p = state.opponent(effect_red_pending[0])
                red_dict = {}
                for (_dp, ci, pt) in picked:
                    red_dict.setdefault(ci, set()).add(pt)
                highlight_atoms_red_for_player = (def_p, red_dict)
        highlight_atoms_blue_for_player = {}
        for p in (0, 1):
            highlight_atoms_blue_for_player[p] = {0: set(), 1: set(), 2: set()}
            for (cell_i, pt) in state.blue_protected_points.get(p, set()):
                if cell_i in (0, 1, 2):
                    highlight_atoms_blue_for_player[p][cell_i].add(pt)
        cell_rects = draw_board(
            screen,
            state.cells,
            highlight_cell=highlight,
            current_player=state.current_player if state.phase == PHASE_PLACE else None,
            highlight_atoms_by_cell=highlight_atoms_by_cell if state.phase == PHASE_PLACE else None,
            highlight_atoms_red_for_player=highlight_atoms_red_for_player,
            highlight_atoms_blue_for_player=highlight_atoms_blue_for_player,
            view_offsets=view_offsets,
            view_pan_px=view_pan_px,
            grid_scale_denom=grid_scale_denom,
        )
        draw_hud(screen, state, message)

        if state.phase == PHASE_PLACE:
            last_atom_pool_rects = draw_atom_pool_and_end(
                screen,
                state.pool(state.current_player),
                state.turn_place_limit,
                state.turn_placed_count,
                state.current_player,
            )
            draw_phase_2_prompt(screen, state.turn_place_limit, state.turn_placed_count, state.current_player)
            if getattr(state.config, "random_place_black_on_neighbor", False):
                last_batch_place_btn_rect = draw_batch_place_button(screen)
            else:
                last_batch_place_btn_rect = None
        else:
            last_atom_pool_rects = []
            last_batch_place_btn_rect = None
        if batch_place_mode:
            bmax = min(
                state.pool(state.current_player).get(ATOM_BLACK, 0),
                state.turn_place_limit - state.turn_placed_count,
            )
            last_batch_cell1_rect, last_batch_cell2_rect, last_batch_cell3_rect, last_batch_cancel_rect, last_batch_slider_track_rect = draw_batch_place_panel(
                screen, batch_place_slider_value, bmax
            )
        else:
            last_batch_cell1_rect = None
            last_batch_cell2_rect = None
            last_batch_cell3_rect = None
            last_batch_cancel_rect = None
            last_batch_slider_track_rect = None
        if action_substate == "confirm_end_place":
            last_confirm_yes_rect, last_confirm_no_rect = draw_confirm_dialog(screen, "是否确认结束排布？")
            last_direct_attack_yes_rect = None
            last_direct_attack_no_rect = None
        elif action_substate == "confirm_end_turn":
            last_confirm_yes_rect, last_confirm_no_rect = draw_confirm_dialog(screen, "是否确认结束回合？")
            last_direct_attack_yes_rect = None
            last_direct_attack_no_rect = None
        elif action_substate == "direct_attack_confirm":
            last_direct_attack_yes_rect, last_direct_attack_no_rect = draw_direct_attack_confirm(screen)
            last_confirm_yes_rect = None
            last_confirm_no_rect = None
        else:
            last_direct_attack_yes_rect = None
            last_direct_attack_no_rect = None
            last_confirm_yes_rect = None
            last_confirm_no_rect = None
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
        last_pan_rect = draw_pan_mode_button(screen, pan_mode)
        last_grid_slider_track_rect = draw_grid_scale_slider(screen, grid_scale_denom)

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
