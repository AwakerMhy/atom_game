"""
正三角形网格：格点索引、邻接、竖向/横向距离。
规则：边长=1，高=√3/2；竖向沿高，横向沿底边。
相邻定义：每个节点的邻居是与其最接近的六个节点（即几何距离为 1 的格点）。
"""
import math
from typing import Set, Tuple, List

from src.config import TRI_HEIGHT, TRI_SIDE

# 格点用 (row, col) 表示，row 为竖向（高），col 为横向（宽）
GridPoint = Tuple[int, int]

# 距离为 1（边长）时视为相邻，浮点比较容差
_DIST_ONE_TOL = 1e-6


def point_to_xy(r: int, c: int) -> Tuple[float, float]:
    """格点 (r, c) 在几何平面上的坐标：x 横向，y 竖向。边长=1，高=√3/2。"""
    x = c + 0.5 * r
    y = r * TRI_HEIGHT
    return (x, y)


def distance_between(p1: GridPoint, p2: GridPoint) -> float:
    """两格点间的欧氏距离（几何边长）。"""
    x1, y1 = point_to_xy(p1[0], p1[1])
    x2, y2 = point_to_xy(p2[0], p2[1])
    return math.hypot(x2 - x1, y2 - y1)


def neighbors(r: int, c: int) -> List[GridPoint]:
    """
    与 (r, c) 最接近的六个格点（几何距离为 1）。
    在无限网格中即为共享边的 6 邻；本函数返回这 6 个候选，不检查边界。
    """
    return [
        (r - 1, c),
        (r - 1, c + 1),
        (r, c - 1),
        (r, c + 1),
        (r + 1, c - 1),
        (r + 1, c),
    ]


def vertical_distance_units(points: Set[GridPoint]) -> float:
    """
    点集中最高与最低的竖向距离，单位为三角形高 √3/2。
    用于进攻格攻击力。
    """
    if not points:
        return 0.0
    rows = [r for r, _ in points]
    return float(max(rows) - min(rows))


def horizontal_distance_units(points: Set[GridPoint]) -> float:
    """
    点集中最左与最右的横向距离，单位为边长 1。
    使用坐标 x = c + 0.5*r 比较左右。
    用于防守格防御力。
    """
    if not points:
        return 0.0

    def x_val(rc: GridPoint) -> float:
        r, c = rc
        return c + 0.5 * r

    xs = [x_val(p) for p in points]
    return float(max(xs) - min(xs))


class TriangleGrid:
    """
    正三角形网格的辅助类：生成指定范围内的格点、邻接、距离。
    不持有原子状态，仅几何。
    """

    def __init__(self, rows: int, cols: int):
        self.rows = rows
        self.cols = cols
        self._points: List[GridPoint] = []
        self._rebuild()

    def _rebuild(self) -> None:
        self._points = []
        for r in range(self.rows):
            for c in range(self.cols):
                self._points.append((r, c))

    def all_points(self) -> List[GridPoint]:
        return list(self._points)

    def neighbors_of(self, r: int, c: int) -> List[GridPoint]:
        """
        返回在网格范围内、与该节点几何距离为 1 的格点（即与其最接近的节点，最多 6 个）。
        """
        out = []
        here = (r, c)
        for nr, nc in neighbors(r, c):
            if 0 <= nr < self.rows and 0 <= nc < self.cols:
                if abs(distance_between(here, (nr, nc)) - 1.0) < _DIST_ONE_TOL:
                    out.append((nr, nc))
        return out

    def in_bounds(self, r: int, c: int) -> bool:
        return 0 <= r < self.rows and 0 <= c < self.cols
