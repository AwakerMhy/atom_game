"""
回合流程：阶段 0/1/2/3 与阶段切换，先手第一回合禁止进攻。
"""
import random
from typing import Optional, Tuple, List

from src.grid.cell import ATOM_BLACK, ATOM_RED, ATOM_BLUE, ATOM_GREEN

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
    base_draw = state.base_draw_count
    base_place = state.base_place_limit
    if choice == CHOICE_EXTRA_DRAW:
        state.turn_draw_count = base_draw + x
        state.turn_place_limit = base_place
        state.turn_attack_limit = 1
    elif choice == CHOICE_EXTRA_PLACE:
        state.turn_draw_count = base_draw
        state.turn_place_limit = base_place + x
        state.turn_attack_limit = 1
    else:
        state.turn_draw_count = base_draw
        state.turn_place_limit = base_place
        state.turn_attack_limit = max(1, x)
    return True


def advance_to_phase_1(state: GameState) -> None:
    """阶段 0 结束后进入阶段 1 并执行抽原子。"""
    state.phase = PHASE_DRAW
    drawn = draw_atoms(state.turn_draw_count, weights=state.draw_weights)
    pool = state.pool(state.current_player)
    for color in drawn:
        pool[color] = pool.get(color, 0) + 1
    state.phase = PHASE_PLACE
    state.turn_placed_count = 0


def start_turn_default(state: GameState) -> None:
    """回合开始：不使用三选一，按默认抽 base_draw_count、可放 base_place_limit、可进攻 1 次，直接抽原子并进入排布。"""
    state.turn_draw_count = state.base_draw_count
    state.turn_place_limit = state.base_place_limit
    state.turn_attack_limit = 1
    state.phase_0_choice = None
    advance_to_phase_1(state)


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


def batch_place_on_cell(
    state: GameState,
    cell_index: int,
    n: int,
) -> Tuple[bool, str]:
    """
    从当前玩家池中取最多 n 个黑原子，批量放到指定格子的空位上（保持连通）。
    返回 (成功, 提示信息)。
    """
    if state.phase != PHASE_PLACE:
        return False, "当前不是排布阶段"
    pool = state.pool(state.current_player)
    cells = state.player_cells(state.current_player)
    if cell_index < 0 or cell_index >= len(cells):
        return False, "无效格子"
    cell = cells[cell_index]
    count = min(pool.get(ATOM_BLACK, 0), max(0, n))
    to_place: List[str] = [ATOM_BLACK] * count
    if not to_place:
        return False, "数量为 0 或池中无黑原子"
    remaining = state.turn_place_limit - state.turn_placed_count
    if len(to_place) > remaining:
        return False, f"本回合最多还可放 {remaining} 个"
    # 空位；放置过程保证连通，且新增黑原子必须与现有某个黑原子相邻（无黑时第一个可作“种子”）
    occupied = set(cell.all_atoms().keys())
    black_points = set(cell.black_points())  # 已有黑原子；批量放置过程中会追加本批新放的黑
    valid = set(cell.grid.all_points())
    empty = {p for p in valid if p not in occupied}
    if not empty:
        return False, "该格已无空位"
    placed_this_batch: List[Tuple[int, int, str]] = []

    def empty_neighbors_of(pts: set) -> List[Tuple[int, int]]:
        """与 pts 中任一点相邻、在 valid 内且当前为空的格点。"""
        out = set()
        for (r, c) in pts:
            for nr, nc in cell.grid.neighbors_of(r, c):
                if (nr, nc) in valid and (nr, nc) not in occupied:
                    out.add((nr, nc))
        return [p for p in out if p in empty]

    def empty_neighbors_of_black() -> List[Tuple[int, int]]:
        """与任意黑原子相邻且为空的格点（新增黑只能放这些位置）。"""
        if not black_points:
            return []
        return empty_neighbors_of(black_points)

    # 第一个黑原子：格子无原子则放中心；无黑但有其他颜色则放其邻格（种子）；已有黑则必须放在某黑原子邻格
    center_pt = (cell.grid.center_r, cell.grid.center_c)
    if not occupied and center_pt in empty:
        r0, c0 = center_pt
    elif black_points:
        first_candidates = empty_neighbors_of_black()
        if not first_candidates:
            return False, "该格无与现有黑原子相邻的空位"
        r0, c0 = random.choice(first_candidates)
    elif occupied:
        first_candidates = empty_neighbors_of(occupied)
        if not first_candidates:
            return False, "该格无与现有原子相邻的空位，无法保持连通"
        r0, c0 = random.choice(first_candidates)
    else:
        r0, c0 = random.choice(tuple(empty))
    cell.place(r0, c0, to_place[0])
    pool[to_place[0]] -= 1
    state.turn_placed_count += 1
    placed_this_batch.append((r0, c0, to_place[0]))
    occupied.add((r0, c0))
    black_points.add((r0, c0))
    empty.discard((r0, c0))
    # 其余黑原子：仅从“与现有黑原子相邻的空邻格”中选位
    for color in to_place[1:]:
        candidates = empty_neighbors_of_black()
        if not candidates:
            for (r, c, col) in placed_this_batch:
                cell.remove(r, c)
                pool[col] = pool.get(col, 0) + 1
                state.turn_placed_count -= 1
            return False, "空位不足或无与黑原子相邻的空位"
        pt = max(candidates, key=lambda p: len(empty_neighbors_of(black_points | {p})))
        r, c = pt
        cell.place(r, c, color)
        pool[color] -= 1
        state.turn_placed_count += 1
        placed_this_batch.append((r, c, color))
        occupied.add(pt)
        black_points.add(pt)
        empty.discard(pt)
    return True, f"已在格子 {cell_index + 1} 放置 {len(to_place)} 个黑原子"


def end_place_phase(state: GameState) -> None:
    """玩家结束排布阶段，进入动作阶段。本回合进攻次数 = 有黑原子的格子数。"""
    if state.phase != PHASE_PLACE:
        return
    state.phase = PHASE_ACTION
    state.turn_attack_used = 0
    state.turn_attack_limit = state.cells_with_black_count(state.current_player)


def end_turn(state: GameState) -> None:
    """回合结束：切换玩家，进入下一回合阶段 0；过期蓝效果保护清除。"""
    state.current_player = state.opponent(state.current_player)
    state.phase = PHASE_CONFIRM
    state.phase_0_choice = None
    state.turn_draw_count = state.base_draw_count
    state.turn_place_limit = state.base_place_limit
    state.turn_attack_limit = 1
    state.turn_placed_count = 0
    state.turn_attack_used = 0
    state.turn_number += 1
    state.is_first_turn = False
    for p in (0, 1):
        if state.turn_number > state.blue_protection_until_turn.get(p, -1):
            state.blue_protected_points[p] = set()
