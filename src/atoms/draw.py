"""
按权重抽原子：默认黑 3 : 红 1 : 蓝 1 : 绿 1，可传入自定义权重。
"""
import random
from typing import List, Optional

BLACK, RED, BLUE, GREEN = "black", "red", "blue", "green"
WEIGHTS = [BLACK, RED, BLUE, GREEN]
DEFAULT_WEIGHTS = [3, 1, 1, 1]  # 黑/红/蓝/绿 整数权重


def draw_atoms(count: int, weights: Optional[List[int]] = None) -> List[str]:
    """随机抽取 count 个原子，返回颜色列表。weights 为 [黑,红,蓝,绿] 整数权重，默认 [3,1,1,1]。"""
    w = weights if weights is not None else DEFAULT_WEIGHTS
    if len(w) != 4 or sum(w) == 0:
        w = DEFAULT_WEIGHTS
    return random.choices(WEIGHTS, weights=w, k=count)
