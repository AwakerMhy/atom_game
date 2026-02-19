"""
按概率抽原子：黑 0.5，红/蓝/绿 各 1/6。
"""
import random
from typing import List

BLACK, RED, BLUE, GREEN = "black", "red", "blue", "green"
WEIGHTS = [BLACK, RED, BLUE, GREEN]
PROBS = [0.5, 1 / 6, 1 / 6, 1 / 6]


def draw_atoms(count: int) -> List[str]:
    """随机抽取 count 个原子，返回颜色列表。"""
    return random.choices(WEIGHTS, weights=PROBS, k=count)
