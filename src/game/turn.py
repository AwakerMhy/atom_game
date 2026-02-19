"""
回合流程：阶段 0/1/2/3 与阶段切换，先手第一回合禁止进攻。
"""
from typing import Optional
from src.game.state import (
    GameState,
    PHASE_CONFIRM,
    PHASE_DRAW,
    PHASE_PLACE,
    PHASE_ACTION,
    CHOICE_EXTRA_DRAW,
    CHOICE_EXTRA_PLACE,
    CHOICE_EXTRA_ATTACK,
)
from src.atoms.draw import draw_atoms


def apply_phase_0_choice(state: GameState, choice: str) -> bool:
    """
    阶段 0：玩家选择 a/b/c。返回是否成功。
    """
    if state.phase != PHASE_CONFIRM or state.phase_0_choice is not None:
        return False
    if choice not in (CHOICE_EXTRA_DRAW, CHOICE_EXTRA_PLACE, CHOICE_EXTRA_ATTACK):
        return False
    state.phase_0_choice = choice
    x = state.x_for_turn()
    if choice == CHOICE_EXTRA_DRAW:
        state.turn_draw_count = 5 + x
        state.turn_place_limit = 4
        state.turn_attack_limit = 1
    elif choice == CHOICE_EXTRA_PLACE:
        state.turn_draw_count = 5
        state.turn_place_limit = 4 + x
        state.turn_attack_limit = 1
    else:
        state.turn_draw_count = 5
        state.turn_place_limit = 4
        state.turn_attack_limit = max(1, x)
    return True


def advance_to_phase_1(state: GameState) -> None:
    """阶段 0 结束后进入阶段 1 并执行抽原子。"""
    state.phase = PHASE_DRAW
    drawn = draw_atoms(state.turn_draw_count)
    pool = state.pool(state.current_player)
    for color in drawn:
        pool[color] = pool.get(color, 0) + 1
    state.phase = PHASE_PLACE
    state.turn_placed_count = 0


def validate_place(state: GameState, cell_index: int, r: int, c: int, color: str) -> tuple[bool, str]:
    """
    检查是否可以在指定格子的 (r,c) 放置 color。不修改状态。
    返回 (ok, message)。
    """
    if state.phase != PHASE_PLACE:
        return False, "当前不是排布阶段"
    if state.turn_placed_count >= state.turn_place_limit:
        return False, "本回合放置数已达上限"
    pool = state.pool(state.current_player)
    if pool.get(color, 0) <= 0:
        return False, "没有该颜色原子"
    cells = state.player_cells(state.current_player)
    if cell_index < 0 or cell_index >= len(cells):
        return False, "无效格子"
    cell = cells[cell_index]
    if not cell.grid.in_bounds(r, c) or (r, c) in cell.all_atoms():
        return False, "该格点已有原子或越界"
    cell.place(r, c, color)
    if not cell.is_connected():
        cell.remove(r, c)
        return False, "放置后该格原子不连通"
    if not cell.has_black():
        cell.remove(r, c)
        return False, "非空格至少需一个黑原子"
    cell.remove(r, c)
    return True, ""


def apply_place(state: GameState, cell_index: int, r: int, c: int, color: str) -> bool:
    """执行放置：放置原子、校验连通与至少一黑，失败则撤销并返回 False。"""
    ok, _ = validate_place(state, cell_index, r, c, color)
    if not ok:
        return False
    cells = state.player_cells(state.current_player)
    cell = cells[cell_index]
    cell.place(r, c, color)
    state.pool(state.current_player)[color] -= 1
    state.turn_placed_count += 1
    return True


def end_place_phase(state: GameState) -> None:
    """玩家结束排布阶段，进入动作阶段。"""
    if state.phase != PHASE_PLACE:
        return
    state.phase = PHASE_ACTION
    state.turn_attack_used = 0


def end_turn(state: GameState) -> None:
    """回合结束：切换玩家，进入下一回合阶段 0。"""
    state.current_player = state.opponent(state.current_player)
    state.phase = PHASE_CONFIRM
    state.phase_0_choice = None
    state.turn_draw_count = 5
    state.turn_place_limit = 4
    state.turn_attack_limit = 1
    state.turn_placed_count = 0
    state.turn_attack_used = 0
    state.turn_number += 1
    state.is_first_turn = False
