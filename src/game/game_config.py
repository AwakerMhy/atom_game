"""
开局与抽牌配置：双方初始原子数、每回合基础抽牌数、各颜色抽牌权重。
"""
from dataclasses import dataclass
from typing import Dict, List

from src.grid.cell import ATOM_BLACK, ATOM_RED, ATOM_BLUE, ATOM_GREEN


@dataclass
class GameConfig:
    """一局游戏的规则参数。"""
    # 开局双方原子池（各一份，双方相同）
    initial_pool: Dict[str, int]
    # 每回合基础抽牌数（阶段 0 选「多抽」时为 base_draw_count + x）
    base_draw_count: int
    # 每回合基础可排布原子数（阶段 0 选「多放置」时为 base_place_limit + x）
    base_place_limit: int
    # 抽牌权重 [黑, 红, 蓝, 绿]，整数，按权重随机
    draw_weights: List[int]


def default_config() -> GameConfig:
    return GameConfig(
        initial_pool={
            ATOM_BLACK: 7,
            ATOM_RED: 1,
            ATOM_BLUE: 1,
            ATOM_GREEN: 1,
        },
        base_draw_count=5,
        base_place_limit=4,
        draw_weights=[3, 1, 1, 1],  # 黑 3 : 红 1 : 蓝 1 : 绿 1
    )
