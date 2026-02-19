"""
单格状态：格点 -> 原子颜色，放置/移除，连通性检查。
"""
from typing import Dict, Set, List, Optional
from collections import deque

from src.grid.triangle import GridPoint, TriangleGrid, neighbors


# 原子颜色
ATOM_BLACK = "black"
ATOM_RED = "red"
ATOM_BLUE = "blue"
ATOM_GREEN = "green"
COLORS = (ATOM_BLACK, ATOM_RED, ATOM_BLUE, ATOM_GREEN)


class Cell:
    """一个格子：正三角形网格上的原子排布。支持正六边形区域（hex_radius）。"""

    def __init__(
        self,
        rows: int,
        cols: int,
        center_r: Optional[int] = None,
        center_c: Optional[int] = None,
        hex_radius: Optional[int] = None,
    ):
        self.grid = TriangleGrid(
            rows, cols,
            center_r=center_r,
            center_c=center_c,
            hex_radius=hex_radius,
        )
        # 格点 -> 颜色
        self._atoms: Dict[GridPoint, str] = {}

    def get(self, r: int, c: int) -> Optional[str]:
        return self._atoms.get((r, c))

    def place(self, r: int, c: int, color: str) -> bool:
        """放置原子。若格点已有原子或越界则返回 False。"""
        if not self.grid.in_bounds(r, c) or (r, c) in self._atoms:
            return False
        if color not in COLORS:
            return False
        self._atoms[(r, c)] = color
        return True

    def remove(self, r: int, c: int) -> Optional[str]:
        """移除格点上的原子，返回原颜色；若无则返回 None。"""
        return self._atoms.pop((r, c), None)

    def all_atoms(self) -> Dict[GridPoint, str]:
        return dict(self._atoms)

    def black_points(self) -> Set[GridPoint]:
        return {p for p, c in self._atoms.items() if c == ATOM_BLACK}

    def is_empty(self) -> bool:
        return len(self._atoms) == 0

    def is_connected(self) -> bool:
        """同格内所有原子是否连通（仅考虑相邻格点都有原子的边）。"""
        if not self._atoms:
            return True
        points = set(self._atoms.keys())
        start = next(iter(points))
        visited = {start}
        q = deque([start])
        while q:
            r, c = q.popleft()
            for nr, nc in self.grid.neighbors_of(r, c):
                if (nr, nc) in points and (nr, nc) not in visited:
                    visited.add((nr, nc))
                    q.append((nr, nc))
        return len(visited) == len(points)

    def has_black(self) -> bool:
        return any(c == ATOM_BLACK for c in self._atoms.values())

    def count_by_color(self) -> Dict[str, int]:
        out = {c: 0 for c in COLORS}
        for color in self._atoms.values():
            out[color] = out.get(color, 0) + 1
        return out

    def connected_components(self) -> List[Set[GridPoint]]:
        """返回当前原子集合的连通分量列表（仅沿有原子的相邻边）。"""
        points = set(self._atoms.keys())
        if not points:
            return []
        components = []
        remaining = set(points)
        while remaining:
            start = remaining.pop()
            comp = {start}
            q = deque([start])
            while q:
                r, c = q.popleft()
                for nr, nc in self.grid.neighbors_of(r, c):
                    p = (nr, nc)
                    if p in remaining:
                        remaining.discard(p)
                        comp.add(p)
                        q.append(p)
            components.append(comp)
        return components

    def count_black_neighbors(self, r: int, c: int) -> int:
        """格点 (r,c) 上原子与多少黑原子相邻。用于发动效果时的 y。"""
        color = self._atoms.get((r, c))
        if not color or color == ATOM_BLACK:
            return 0
        blacks = self.black_points()
        n = 0
        for nr, nc in self.grid.neighbors_of(r, c):
            if (nr, nc) in blacks:
                n += 1
        return n
