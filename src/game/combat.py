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
    for ci, cell_def in enumerate(def_cells):
        if not cell_def.has_black() and not cell_def.is_empty():
            for p in list(cell_def.all_atoms().keys()):
                cell_def.remove(p[0], p[1])
    return True


def apply_effect_blue(state: GameState, player: int, cell_index: int, r: int, c: int) -> bool:
    """发动蓝效果：移除己方 (cell_index, r, c) 上的蓝原子，己方获得 y 个黑原子。"""
    cells = state.cells[player]
    if cell_index < 0 or cell_index >= len(cells):
        return False
    cell = cells[cell_index]
    if cell.get(r, c) != ATOM_BLUE:
        return False
    y = cell.count_black_neighbors(r, c)
    cell.remove(r, c)
    state.pools[player][ATOM_BLACK] = state.pools[player].get(ATOM_BLACK, 0) + y
    return True


def apply_effect_green(state: GameState, player: int, cell_index: int, r: int, c: int) -> bool:
    """发动绿效果：移除己方 (cell_index, r, c) 上的绿原子，己方恢复 y 点生命。"""
    cells = state.cells[player]
    if cell_index < 0 or cell_index >= len(cells):
        return False
    cell = cells[cell_index]
    if cell.get(r, c) != ATOM_GREEN:
        return False
    y = cell.count_black_neighbors(r, c)
    cell.remove(r, c)
    state.hp[player] = state.hp[player] + y
    return True
