"""
可选音效：若 assets/sounds/ 下存在对应 ogg 文件则播放，否则静默。
放置音效：place.ogg；进攻：attack.ogg；效果：effect.ogg；回合结束：turn.ogg。
"""
import os
import pygame

_SOUNDS: dict = {}
_initialized = False


def _init():
    global _initialized
    if _initialized:
        return
    _initialized = True
    try:
        pygame.mixer.init(frequency=22050, size=-16, channels=2, buffer=512)
    except Exception:
        pass


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
