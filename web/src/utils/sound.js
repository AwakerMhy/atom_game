/**
 * Sound effects using Web Audio API (no external files).
 */
let audioContext = null

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
  }
  return audioContext
}

function playTone(frequency, duration, type = 'sine', volume = 0.15) {
  try {
    const ctx = getAudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = frequency
    osc.type = type
    gain.gain.setValueAtTime(volume, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + duration)
  } catch (_) {}
}

/** 原子破坏音效 - 短促爆破感 */
export function playDestroySound() {
  playTone(180, 0.08, 'sawtooth', 0.12)
  setTimeout(() => playTone(120, 0.1, 'square', 0.08), 40)
}

/** 效果发动音效 - 柔和提示 */
export function playEffectSound() {
  playTone(440, 0.1, 'sine', 0.12)
  setTimeout(() => playTone(554, 0.08, 'sine', 0.08), 80)
}

/** 点击/选择音效 */
export function playClickSound() {
  playTone(320, 0.05, 'sine', 0.1)
}
