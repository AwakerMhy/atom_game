"""
游戏状态：双方原子池、生命、场地（各 3 格）、当前玩家与回合阶段等。
"""
from typing import Dict, List, Optional, Set, Tuple
from src.grid.cell import Cell, ATOM_BLACK, ATOM_RED, ATOM_BLUE, ATOM_GREEN, COLORS as ATOM_COLORS

GridPoint = Tuple[int, int]
from src.game.game_config import GameConfig, default_config

# 阶段
PHASE_CONFIRM = 0   # 确认场上状态，选 a/b/c
PHASE_DRAW = 1      # 获取原子
PHASE_PLACE = 2     # 排布
PHASE_ACTION = 3    # 动作（进攻与效果）

# 阶段 0 选项
CHOICE_EXTRA_DRAW = "a"   # 本回合获得 5+x 原子
CHOICE_EXTRA_PLACE = "b"  # 本回合最多放置 4+x 原子
CHOICE_EXTRA_ATTACK = "c" # 本回合可进攻 x 次

INITIAL_HP = 20
INITIAL_POOL = {ATOM_BLACK: 7, ATOM_RED: 1, ATOM_BLUE: 1, ATOM_GREEN: 1}


def make_initial_pool() -> Dict[str, int]:
    return dict(INITIAL_POOL)


def make_cells() -> List[Cell]:
    from src.config import (
        DEFAULT_GRID_ROWS,
        DEFAULT_GRID_COLS,
        GRID_CENTER_R,
        GRID_CENTER_C,
        HEX_RADIUS,
    )
    return [
        Cell(
            DEFAULT_GRID_ROWS,
            DEFAULT_GRID_COLS,
            center_r=GRID_CENTER_R,
            center_c=GRID_CENTER_C,
            hex_radius=HEX_RADIUS,
        )
        for _ in range(3)
    ]


class GameState:
    def __init__(self, config: Optional[GameConfig] = None):
        cfg = config or default_config()
        self.config = cfg
        # 玩家 0 与 1：原子池（按配置）、生命、3 个格子
        pool_copy = dict(cfg.initial_pool)
        self.pools = [dict(pool_copy), dict(pool_copy)]
        self.hp: List[int] = [INITIAL_HP, INITIAL_HP]
        self.cells: List[List[Cell]] = [make_cells(), make_cells()]

        self.current_player: int = 0
        self.phase: int = PHASE_CONFIRM
        self.phase_0_choice: Optional[str] = None  # "a" | "b" | "c"

        self.base_draw_count: int = cfg.base_draw_count
        self.base_place_limit: int = cfg.base_place_limit
        self.draw_weights: List[int] = list(cfg.draw_weights)

        # 本回合限制（在阶段 0 选择后设定）
        self.turn_draw_count: int = cfg.base_draw_count
        self.turn_place_limit: int = cfg.base_place_limit
        self.turn_attack_limit: int = 1

        # 本回合已用
        self.turn_placed_count: int = 0
        self.turn_attack_used: int = 0

        # 先手第一回合不能进攻
        self.turn_number: int = 0
        self.is_first_turn: bool = True

        # 蓝效果：与该蓝相邻的黑原子在下一回合内不可被破坏。(player -> set of (cell_i, (r,c)))
        self.blue_protected_points: Dict[int, Set[Tuple[int, GridPoint]]] = {0: set(), 1: set()}
        self.blue_protection_until_turn: Dict[int, int] = {}  # player -> 保护持续到该回合号（不含）

    def is_black_protected(self, player: int, cell_i: int, pt: GridPoint) -> bool:
        """该玩家的该格该格点上的黑原子是否处于蓝效果保护中。"""
        s = self.blue_protected_points.get(player)
        if not s:
            return False
        return (cell_i, pt) in s

    def opponent(self, player: int) -> int:
        return 1 - player

    def pool(self, player: int) -> Dict[str, int]:
        return self.pools[player]

    def player_cells(self, player: int) -> List[Cell]:
        return self.cells[player]

    def non_empty_cell_count(self, player: int) -> int:
        return sum(1 for c in self.player_cells(player) if not c.is_empty())

    def cells_with_black_count(self, player: int) -> int:
        """有至少一个黑原子的格子数量；每回合该玩家可进攻次数即为此数。"""
        return sum(1 for c in self.player_cells(player) if c.has_black())

    def x_for_turn(self) -> int:
        """当前回合玩家的 x（非空格子数）。"""
        return self.non_empty_cell_count(self.current_player)

    def can_attack_this_turn(self) -> bool:
        if self.turn_attack_used >= self.turn_attack_limit:
            return False
        if self.is_first_turn:
            return False
        return True

    def winner(self) -> Optional[int]:
        """0 或 1 表示胜者，None 表示未结束。"""
        if self.hp[0] <= 0:
            return 1
        if self.hp[1] <= 0:
            return 0
        return None
