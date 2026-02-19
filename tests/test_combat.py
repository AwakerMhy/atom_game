"""战斗：攻击力、防御力、破坏、直接攻击。"""
import unittest
from src.grid.cell import Cell, ATOM_BLACK, ATOM_RED, ATOM_BLUE, ATOM_GREEN
from src.game import combat


class TestCombat(unittest.TestCase):
    def test_attack_power_vertical(self):
        cell = Cell(5, 6)
        cell.place(0, 0, ATOM_BLACK)
        cell.place(2, 0, ATOM_BLACK)
        self.assertAlmostEqual(combat.attack_power(cell), 2.0, delta=1e-5)

    def test_defense_power_horizontal(self):
        cell = Cell(5, 6)
        cell.place(0, 0, ATOM_BLACK)
        cell.place(0, 3, ATOM_BLACK)
        self.assertAlmostEqual(combat.defense_power(cell), 3.0, delta=1e-5)

    def test_attack_beats_defense(self):
        atk = Cell(5, 6)
        atk.place(0, 0, ATOM_BLACK)
        atk.place(3, 0, ATOM_BLACK)
        def_ = Cell(5, 6)
        def_.place(0, 0, ATOM_BLACK)
        def_.place(0, 1, ATOM_BLACK)
        self.assertTrue(combat.attack_beats_defense(atk, def_))

    def test_resolve_direct_attack(self):
        cell = Cell(5, 6)
        cell.place(0, 0, ATOM_BLACK)
        cell.place(2, 0, ATOM_BLACK)
        self.assertEqual(combat.resolve_direct_attack(cell), 2)

    def test_destroy_one_black_and_components(self):
        atk = Cell(5, 6)
        atk.place(0, 0, ATOM_BLACK)
        atk.place(2, 0, ATOM_BLACK)
        def_ = Cell(5, 6)
        def_.place(0, 0, ATOM_BLACK)
        def_.place(0, 1, ATOM_BLACK)
        def_.place(0, 2, ATOM_GREEN)
        dmg, comps = combat.destroy_one_black_and_get_components(atk, def_, (0, 0))
        self.assertGreater(dmg, 0)
        self.assertIsNone(def_.get(0, 0))
        self.assertIsNotNone(def_.get(0, 1))

    def test_extra_destroys(self):
        atk = Cell(5, 6)
        atk.place(0, 0, ATOM_BLACK)
        atk.place(0, 1, ATOM_RED)
        atk.place(0, 2, ATOM_RED)
        def_ = Cell(5, 6)
        def_.place(0, 0, ATOM_BLUE)
        self.assertEqual(combat.extra_destroys(atk, def_), 1)
        def_.place(0, 1, ATOM_BLUE)
        self.assertEqual(combat.extra_destroys(atk, def_), 0)

    def test_remove_components_except(self):
        cell = Cell(5, 6)
        cell.place(0, 0, ATOM_BLACK)
        cell.place(0, 1, ATOM_RED)
        cell.place(0, 3, ATOM_BLACK)
        comps = cell.connected_components()
        self.assertEqual(len(comps), 2)
        combat.remove_components_except(cell, {(0, 0), (0, 1)})
        self.assertIsNone(cell.get(0, 3))
        self.assertIsNotNone(cell.get(0, 0))


if __name__ == "__main__":
    unittest.main()
