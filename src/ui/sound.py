"""
音效：优先使用 assets/sounds/*.ogg；若无则用程序合成的短音。
"""
import os
import math
import pygame

_SOUNDS: dict = {}
_initialized = False
_SAMPLE_RATE = 22050


def _init():
    global _initialized
    if _initialized:
        return
    _initialized = True
    try:
        pygame.mixer.init(frequency=_SAMPLE_RATE, size=-16, channels=2, buffer=512)
    except Exception:
        pass


def _synth_tone(freq: float, duration: float, volume: float = 0.3, decay: bool = True):
    """生成短促音：正弦波，可选衰减。返回 (samples, 2) int16 数组。"""
    try:
        import numpy as np
    except ImportError:
        return None
    n = int(_SAMPLE_RATE * duration)
    t = np.linspace(0, duration, n, dtype=np.float32)
    s = np.sin(2 * math.pi * freq * t)
    if decay:
        s *= np.exp(-t / (duration * 0.4))
    s = (s * volume * 32767).astype(np.int16)
    stereo = np.column_stack((s, s))
    return stereo


def _make_sound_from_array(arr):
    """用 numpy 数组创建 pygame Sound（立体声 int16）。"""
    if arr is None:
        return None
    try:
        return pygame.sndarray.make_sound(arr)
    except Exception:
        return None


def _load(name: str) -> bool:
    _init()
    if name in _SOUNDS:
        return _SOUNDS[name] is not None
    path = os.path.join(os.path.dirname(__file__), "..", "..", "assets", "sounds", f"{name}.ogg")
    try:
        if os.path.isfile(path):
            _SOUNDS[name] = pygame.mixer.Sound(path)
            return True
    except Exception:
        pass
    # 合成音效
    if name == "place":
        arr = _synth_tone(520, 0.08, 0.25, True)
    elif name == "attack":
        arr = _synth_tone(180, 0.12, 0.35, True)
    elif name == "effect":
        arr = _synth_tone(340, 0.1, 0.3, True)
    elif name == "turn":
        arr = _synth_tone(400, 0.15, 0.3, True)
    elif name == "click":
        arr = _synth_tone(600, 0.05, 0.2, True)
    elif name == "undo":
        arr = _synth_tone(300, 0.07, 0.25, True)
    elif name == "destroy":
        arr = _synth_tone(120, 0.15, 0.4, True)
    else:
        arr = _synth_tone(440, 0.08, 0.2, True)
    if arr is not None:
        _SOUNDS[name] = _make_sound_from_array(arr)
        return _SOUNDS[name] is not None
    _SOUNDS[name] = None
    return False


def play_place():
    if _load("place") and _SOUNDS["place"]:
        _SOUNDS["place"].play()


def play_attack():
    if _load("attack") and _SOUNDS["attack"]:
        _SOUNDS["attack"].play()


def play_effect():
    if _load("effect") and _SOUNDS["effect"]:
        _SOUNDS["effect"].play()


def play_turn_end():
    if _load("turn") and _SOUNDS["turn"]:
        _SOUNDS["turn"].play()


def play_click():
    if _load("click") and _SOUNDS["click"]:
        _SOUNDS["click"].play()


def play_undo():
    if _load("undo") and _SOUNDS["undo"]:
        _SOUNDS["undo"].play()


def play_destroy():
    """原子被破坏时播放。"""
    if _load("destroy") and _SOUNDS["destroy"]:
        _SOUNDS["destroy"].play()
