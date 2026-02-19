"""网格与格点：邻接、距离、Cell 连通性。"""
import unittest
from src.grid.triangle import (
    point_to_xy,
    distance_between,
    neighbors,
    vertical_distance_units,
    horizontal_distance_units,
    TriangleGrid,
)
from src.grid.cell import Cell, ATOM_BLACK, ATOM_RED


class TestTriangleGrid(unittest.TestCase):
    def test_neighbors_count(self):
        # 无限网格中每点 6 邻
        n = neighbors(2, 2)
        self.assertEqual(len(n), 6)
        self.assertIn((1, 2), n)
        self.assertIn((1, 3), n)
        self.assertIn((2, 1), n)
        self.assertIn((2, 3), n)
        self.assertIn((3, 1), n)
        self.assertIn((3, 2), n)

    def test_distance_one(self):
        for (r, c), (nr, nc) in [(0, 0), (1, 0)], [(0, 0), (0, 1)]:
            d = distance_between((r, c), (nr, nc))
            self.assertAlmostEqual(d, 1.0, delta=1e-5)

    def test_vertical_distance_units(self):
        pts = {(0, 0), (2, 1)}
        self.assertAlmostEqual(vertical_distance_units(pts), 2.0, delta=1e-5)

    def test_horizontal_distance_units(self):
        pts = {(0, 0), (0, 3)}
        self.assertAlmostEqual(horizontal_distance_units(pts), 3.0, delta=1e-5)

    def test_grid_neighbors_of_in_bounds(self):
        g = TriangleGrid(3, 4)
        n = g.neighbors_of(1, 1)
        self.assertLessEqual(len(n), 6)
        for (nr, nc) in n:
            self.assertTrue(g.in_bounds(nr, nc))
            self.assertAlmostEqual(distance_between((1, 1), (nr, nc)), 1.0, delta=1e-5)


class TestCell(unittest.TestCase):
    def test_place_remove(self):
        cell = Cell(3, 4)
        self.assertTrue(cell.place(0, 0, ATOM_BLACK))
        self.assertEqual(cell.get(0, 0), ATOM_BLACK)
        self.assertEqual(cell.remove(0, 0), ATOM_BLACK)
        self.assertIsNone(cell.get(0, 0))

    def test_connected_single(self):
        cell = Cell(3, 4)
        cell.place(0, 0, ATOM_BLACK)
        self.assertTrue(cell.is_connected())

    def test_connected_two_adjacent(self):
        cell = Cell(3, 4)
        cell.place(0, 0, ATOM_BLACK)
        cell.place(0, 1, ATOM_RED)
        self.assertTrue(cell.is_connected())

    def test_not_connected_two_separate(self):
        cell = Cell(5, 6)
        cell.place(0, 0, ATOM_BLACK)
        cell.place(0, 2, ATOM_RED)
        self.assertFalse(cell.is_connected())

    def test_black_points(self):
        cell = Cell(3, 4)
        cell.place(0, 0, ATOM_BLACK)
        cell.place(0, 1, ATOM_RED)
        self.assertEqual(cell.black_points(), {(0, 0)})

    def test_count_black_neighbors(self):
        cell = Cell(3, 4)
        cell.place(0, 0, ATOM_BLACK)
        cell.place(0, 1, ATOM_RED)
        self.assertEqual(cell.count_black_neighbors(0, 1), 1)


if __name__ == "__main__":
    unittest.main()
