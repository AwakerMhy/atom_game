"""
全局配置：窗口、颜色、网格常数、字体（中文支持）
"""
import math
import pygame

# 版本（发布时在此更新）
VERSION = "1.4.0"

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

# 单格网格：大正六边形，中心向四周
# 背板矩形边长（格点索引 0..size-1）
DEFAULT_GRID_SIZE = 100
DEFAULT_GRID_ROWS = DEFAULT_GRID_SIZE
DEFAULT_GRID_COLS = DEFAULT_GRID_SIZE

# 可放置原子与米色/可见范围（统一由六边形参数决定）
# 六边形半径（每边 2*HEX_RADIUS+1 个节点）
HEX_RADIUS = 15
GRID_CENTER_R = DEFAULT_GRID_SIZE // 2
GRID_CENTER_C = DEFAULT_GRID_SIZE // 2
# 可见窗口与六边形范围一致：由 HEX_RADIUS 推导，无需单独配置
VISIBLE_GRID_ROWS = 2 * HEX_RADIUS + 1
VISIBLE_GRID_COLS = 2 * HEX_RADIUS + 1
# 三角形边长 = 格子边长的 1/4（用于 scale）
CELL_SIDE_FOR_SCALE = 200

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
