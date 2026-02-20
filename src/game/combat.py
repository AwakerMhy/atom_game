"""
攻击力/防御力计算，破坏与连通分量结算，直接攻击，红/蓝/绿效果。
"""
from __future__ import annotations
from typing import Set, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from src.game.state import GameState

from src.grid.cell import Cell, ATOM_BLACK, ATOM_RED, ATOM_BLUE, ATOM_GREEN
from src.grid.triangle import vertical_distance_units, horizontal_distance_units, GridPoint


def attack_power(cell: Cell) -> float:
    """进攻格攻击力：最高与最低黑原子的竖向距离（单位：三角形高 √3/2）。"""
    blacks = cell.black_points()
    return vertical_distance_units(blacks)


def defense_power(cell: Cell) -> float:
    """防守格防御力：最左与最右黑原子的横向距离（单位：边长 1）。"""
    blacks = cell.black_points()
    return horizontal_distance_units(blacks)


def attack_beats_defense(attacker: Cell, defender: Cell) -> bool:
    return attack_power(attacker) > defense_power(defender)


def extra_destroys(attacker_cell: Cell, defender_cell: Cell) -> int:
    """
    进攻格红原子数 n、防守格蓝原子数 m 时，在破坏 1 个黑原子后还可多破坏的原子数。
    规则：可破坏数 = max(0, 1 + n - m)，已破坏 1 黑，故额外 = max(0, n - m)。
    """
    n = attacker_cell.count_by_color().get(ATOM_RED, 0)
    m = defender_cell.count_by_color().get(ATOM_BLUE, 0)
    return max(0, n - m)


def destroy_atom(cell: Cell, r: int, c: int) -> Optional[str]:
    """移除格点上的原子，返回被移除的颜色。"""
    return cell.remove(r, c)


def destroy_one_black_and_get_components(
    attacker_cell: Cell,
    defender_cell: Cell,
    black_to_destroy: GridPoint,
) -> tuple[int, List[Set[GridPoint]]]:
    """
    只破坏防守格中指定的一个黑原子，不自动处理连通分量。
    返回 (对玩家造成的伤害, 破坏后的连通分量列表)。
    伤害为 1（破坏 1 个黑原子）。
    """
    if defender_cell.get(black_to_destroy[0], black_to_destroy[1]) != ATOM_BLACK:
        return 0, []
    defender_cell.remove(black_to_destroy[0], black_to_destroy[1])
    components = defender_cell.connected_components()
    return 1, components


def remove_components_except(cell: Cell, to_keep: Set[GridPoint]) -> None:
    """保留 to_keep 所在连通分量，移除其余分量上的所有原子。"""
    components = cell.connected_components()
    for comp in components:
        if to_keep & comp:
            continue
        for (r, c) in comp:
            cell.remove(r, c)


def remove_component(cell: Cell, component: Set[GridPoint]) -> None:
    """移除该连通分量上的所有原子（红效果选到无黑子集时整块破坏）。"""
    for (r, c) in component:
        cell.remove(r, c)


def remove_black_atoms_except(cell: Cell, to_keep: Set[GridPoint]) -> None:
    """仅移除黑原子：保留 to_keep 中的黑原子，移除其余格点上的黑原子。"""
    blacks = cell.black_points()
    for pt in blacks:
        if pt not in to_keep:
            cell.remove(pt[0], pt[1])


def clear_cell_if_no_black(cell: Cell) -> None:
    """若格子内无黑原子则清空整格（攻击/红效果结算后调用）。"""
    if not cell.has_black() and not cell.is_empty():
        for p in list(cell.all_atoms().keys()):
            cell.remove(p[0], p[1])


def remove_components_without_black_and_return_rest(cell: Cell) -> List[Set[GridPoint]]:
    """
    移除所有不包含黑原子的连通分量；返回剩余分量（每个都含黑）。
    若剩余 0 或 1 个则无需被攻击方选择；2+ 个时需选择保留哪一个。
    """
    if cell.is_empty():
        return []
    components = cell.connected_components()
    blacks = cell.black_points()
    remaining: List[Set[GridPoint]] = []
    for comp in components:
        if comp & blacks:
            remaining.append(comp)
        else:
            for (r, c) in comp:
                cell.remove(r, c)
    return remaining


def resolve_direct_attack(cell: Cell) -> int:
    """直接攻击玩家时造成的伤害 = 进攻格攻击力（整数）。"""
    return int(attack_power(cell))


def apply_effect_red(
    state: GameState,
    attacker: int,
    cell_index: int,
    r: int,
    c: int,
    atoms_to_destroy: List[tuple[int, int, GridPoint]],
) -> bool:
    """
    发动红效果：移除己方 (cell_index, r, c) 上的红原子；
    对方必须破坏若干黑原子，atoms_to_destroy 为 [(defender, cell_i, (r,c)), ...]，
    数量为 min(y, 对方当前黑原子数)，且每个目标必须为黑原子。
    若某格破坏后无黑，该格全部原子破坏。
    """
    cells = state.cells[attacker]
    if cell_index < 0 or cell_index >= len(cells):
        return False
    cell = cells[cell_index]
    if cell.get(r, c) != ATOM_RED:
        return False
    y = cell.count_black_neighbors(r, c)
    if len(atoms_to_destroy) > y:
        return False
    defender = state.opponent(attacker)
    def_cells = state.cells[defender]
    for (pi, ci, pt) in atoms_to_destroy:
        if pi != defender or ci < 0 or ci >= len(def_cells):
            return False
        if def_cells[ci].get(pt[0], pt[1]) != ATOM_BLACK:
            return False
    cell.remove(r, c)
    for (pi, ci, pt) in atoms_to_destroy:
        def_cells[ci].remove(pt[0], pt[1])
    # 结算后：无黑则整格清空；多分量时先清掉不含黑的子集，再让被攻击方选择保留哪一子集（仅当仍剩 2+ 个子集时）
    for cell_def in def_cells:
        clear_cell_if_no_black(cell_def)
    for cell_def in def_cells:
        remove_components_without_black_and_return_rest(cell_def)
    return True


def apply_effect_blue(state: GameState, player: int, cell_index: int, r: int, c: int) -> bool:
    """发动蓝效果：移除该蓝原子，与其相邻的黑原子在下一回合内不可被破坏。"""
    cells = state.cells[player]
    if cell_index < 0 or cell_index >= len(cells):
        return False
    cell = cells[cell_index]
    if cell.get(r, c) != ATOM_BLUE:
        return False
    protected = cell.black_neighbors_of(r, c)
    cell.remove(r, c)
    for pt in protected:
        state.blue_protected_points[player].add((cell_index, pt))
    state.blue_protection_until_turn[player] = state.turn_number + 1
    return True


def apply_effect_green(state: GameState, player: int, cell_index: int, r: int, c: int) -> bool:
    """发动绿效果（点击）：该绿原子就地变为一个黑原子，不消耗池中黑原子。"""
    cells = state.cells[player]
    if cell_index < 0 or cell_index >= len(cells):
        return False
    cell = cells[cell_index]
    if cell.get(r, c) != ATOM_GREEN:
        return False
    cell.remove(r, c)
    cell.place(r, c, ATOM_BLACK)
    return True


def apply_green_end_of_turn(state: GameState, player: int) -> int:
    """绿持续效果：回合结束时该玩家获得「己方所有绿原子邻接黑原子数」之和的黑原子。返回本次获得的数目。"""
    total = 0
    for cell in state.cells[player]:
        for (r, c), color in list(cell.all_atoms().items()):
            if color == ATOM_GREEN:
                total += cell.count_black_neighbors(r, c)
    if total > 0:
        state.pools[player][ATOM_BLACK] = state.pools[player].get(ATOM_BLACK, 0) + total
    return total
