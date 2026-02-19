"""抽原子：数量与颜色集合。"""
import unittest
from src.atoms.draw import draw_atoms, WEIGHTS, PROBS


class TestAtomsDraw(unittest.TestCase):
    def test_draw_count(self):
        for n in [1, 5, 10]:
            out = draw_atoms(n)
            self.assertEqual(len(out), n)

    def test_draw_colors_valid(self):
        out = draw_atoms(20)
        for c in out:
            self.assertIn(c, WEIGHTS)

    def test_probs_sum(self):
        self.assertAlmostEqual(sum(PROBS), 1.0, delta=1e-9)

    def test_black_half(self):
        out = draw_atoms(1000)
        black_ratio = out.count("black") / 1000
        self.assertGreater(black_ratio, 0.4)
        self.assertLess(black_ratio, 0.6)


if __name__ == "__main__":
    unittest.main()
