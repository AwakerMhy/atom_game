"""
全局配置：窗口、颜色、网格常数、字体（中文支持）
"""
import math
import pygame

# 窗口
TITLE = "Atom Game"
SCREEN_WIDTH = 1024
SCREEN_HEIGHT = 768
SCREEN_SIZE = (SCREEN_WIDTH, SCREEN_HEIGHT)
FPS = 60

# 正三角形网格（规则：边长=1，高=√3/2）
TRI_SIDE = 1.0
TRI_HEIGHT = math.sqrt(3) / 2

# 颜色（便于后续替换为主题）
COLORS = {
    "background": (24, 28, 32),
    "cell_bg": (245, 235, 210),  # 米色格子内背景
    "cell_frame": (80, 70, 60),
    "grid_line": (60, 70, 85),
    "grid_point": (90, 100, 120),
    "atom_black": (40, 42, 48),
    "atom_red": (200, 70, 70),
    "atom_blue": (70, 120, 200),
    "atom_green": (70, 160, 100),
    "ui_text": (220, 220, 220),
    "ui_accent": (120, 180, 220),
}

# 单格网格显示用：每格默认行列数（可调）
DEFAULT_GRID_ROWS = 5
DEFAULT_GRID_COLS = 6

# 中文字体：优先使用系统支持的 CJK 字体，避免中文显示为方框
FONT_NAMES_CJK = [
    "Microsoft YaHei",
    "Microsoft YaHei UI",
    "SimHei",
    "SimSun",
    "KaiTi",
    "FangSong",
    "Noto Sans CJK SC",
    "WenQuanYi Micro Hei",
    "WenQuanYi Zen Hei",
    "sans-serif",
]


def get_font(size: int, bold: bool = False) -> pygame.font.Font:
    """返回支持中文的字体。"""
    for name in FONT_NAMES_CJK:
        try:
            f = pygame.font.SysFont(name, size, bold=bold)
            # 简单验证：渲染一个中文字符看是否正常
            s = f.render("\u4e2d", True, (255, 255, 255))
            if s.get_width() > 0:
                return f
        except Exception:
            continue
    return pygame.font.SysFont("arial", size, bold=bold)
