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


def resolve_attack(
    attacker_cell: Cell,
    defender_cell: Cell,
    black_to_destroy: GridPoint,
    defender_keep_component: Optional[Set[GridPoint]] = None,
) -> tuple[int, int]:
    """
    执行一次格对格攻击结算。
    - 破坏进攻方指定的防守格黑原子 black_to_destroy。
    - 红：进攻方可多破坏 n 个原子（此处简化为多破坏 n 个，由调用方或后续扩展指定具体目标）。
    - 蓝：防守方减少被破坏数 n（最终破坏数不低于 0）。
    - 若破坏后不连通，用 defender_keep_component 指定保留的连通分量；若不传则保留第一个含黑的分量。
    返回 (对防守方玩家造成的伤害, 实际破坏的原子数)。
    """
    atk = attack_power(attacker_cell)
    def_ = defense_power(defender_cell)
    if atk <= def_:
        return 0, 0

    # 1. 破坏指定黑原子
    color_removed = defender_cell.remove(black_to_destroy[0], black_to_destroy[1])
    if color_removed != ATOM_BLACK:
        return 0, 0
    destroy_count = 1

    # 红/蓝：额外可破坏数 = 进攻格红数；防守格蓝数减少破坏数
    extra = attacker_cell.count_by_color().get(ATOM_RED, 0)
    blue_def = defender_cell.count_by_color().get(ATOM_BLUE, 0)
    # 实际可多破坏 = max(0, extra - blue_def)，此处简化为：可多破坏 extra 个，但总共被破坏数不少于 1，且受蓝减少
    # 规则：攻击时能多破坏 n 个；被攻击时被破坏数目减少 n。所以 可破坏数 = 1 + red - blue（不低于 0）
    can_destroy = max(0, 1 + extra - blue_def)
    # 已经破坏了 1 个，还可再破坏 (can_destroy - 1) 个；若不扩展“选择多个目标”逻辑，这里只做连通分量处理
    destroy_count = can_destroy  # 若 can_destroy==1 则只破坏了一个；>1 时需要调用方再选目标，这里只处理连通分量

    # 2. 连通分量：若不连通，保留一个含黑的分量
    components = defender_cell.connected_components()
    if len(components) > 1:
        to_keep = defender_keep_component
        if to_keep is None:
            for comp in components:
                if any(defender_cell.get(r, c) == ATOM_BLACK for r, c in comp):
                    to_keep = comp
                    break
            if to_keep is None:
                to_keep = set()
        to_remove = []
        for comp in components:
            if comp != to_keep:
                to_remove.extend(comp)
        for r, c in to_remove:
            defender_cell.remove(r, c)
            destroy_count += 1

    # 对玩家伤害：攻击力 - 防守格绿数（不低于 0）
    green_def = defender_cell.count_by_color().get(ATOM_GREEN, 0)
    damage_to_player = max(0, int(atk) - green_def)
    return damage_to_player, destroy_count


def resolve_direct_attack(attacker_cell: Cell) -> int:
    """直接攻击玩家：伤害 = 进攻格攻击力，不受对方绿等影响。"""
    return int(attack_power(attacker_cell))


def destroy_one_black_and_get_components(
    attacker_cell: Cell,
    defender_cell: Cell,
    black_to_destroy: GridPoint,
) -> tuple[int, List[Set[GridPoint]]]:
    """
    只破坏防守格中指定的一个黑原子，不自动处理连通分量。
    返回 (对玩家造成的伤害, 破坏后的连通分量列表)。
    用于 UI 先选黑再选保留分量。
    """
    atk = attack_power(attacker_cell)
    def_ = defense_power(defender_cell)
    if atk <= def_:
        return 0, []
    if defender_cell.remove(black_to_destroy[0], black_to_destroy[1]) != ATOM_BLACK:
        return 0, []
    green_def = defender_cell.count_by_color().get(ATOM_GREEN, 0)
    damage = max(0, int(atk) - green_def)
    components = defender_cell.connected_components()
    return damage, components


def remove_components_except(cell: Cell, to_keep: Set[GridPoint]) -> None:
    """保留 to_keep 所在连通分量，移除其余分量中的原子。"""
    components = cell.connected_components()
    for comp in components:
        if comp != to_keep:
            for (r, c) in comp:
                cell.remove(r, c)


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
    对方必须破坏 y 个原子，atoms_to_destroy 为 [(defender, cell_i, (r,c)), ...] 共 y 个。
    若某格破坏后无黑，该格全部原子破坏。
    """
    cells = state.player_cells(attacker)
    if cell_index < 0 or cell_index >= len(cells):
        return False
    cell = cells[cell_index]
    if cell.get(r, c) != ATOM_RED:
        return False
    y = cell.count_black_neighbors(r, c)
    if len(atoms_to_destroy) != y:
        return False
    cell.remove(r, c)
    defender = state.opponent(attacker)
    def_cells = state.player_cells(defender)
    for (pi, ci, pt) in atoms_to_destroy:
        if pi != defender or ci < 0 or ci >= len(def_cells):
            return False
        def_cells[ci].remove(pt[0], pt[1])
    for ci, cell_def in enumerate(def_cells):
        if not cell_def.has_black() and not cell_def.is_empty():
            for p in list(cell_def.all_atoms().keys()):
                cell_def.remove(p[0], p[1])
    return True


def apply_effect_blue(state: GameState, player: int, cell_index: int, r: int, c: int) -> bool:
    """发动蓝效果：移除己方 (cell_index, r, c) 上的蓝原子，己方获得 y 个黑原子。"""
    cells = state.player_cells(player)
    if cell_index < 0 or cell_index >= len(cells):
        return False
    cell = cells[cell_index]
    if cell.get(r, c) != ATOM_BLUE:
        return False
    y = cell.count_black_neighbors(r, c)
    cell.remove(r, c)
    state.pool(player)[ATOM_BLACK] = state.pool(player).get(ATOM_BLACK, 0) + y
    return True


def apply_effect_green(state: GameState, player: int, cell_index: int, r: int, c: int) -> bool:
    """发动绿效果：移除己方 (cell_index, r, c) 上的绿原子，己方恢复 y 点生命。"""
    cells = state.player_cells(player)
    if cell_index < 0 or cell_index >= len(cells):
        return False
    cell = cells[cell_index]
    if cell.get(r, c) != ATOM_GREEN:
        return False
    y = cell.count_black_neighbors(r, c)
    cell.remove(r, c)
    state.hp[player] = min(state.hp[player] + y, 20)  # 可选：不设上限则去掉 min
    return True