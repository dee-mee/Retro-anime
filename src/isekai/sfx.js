/**
 * Combat sounds, made from oscillators and noise on the spot, like the rest of the colony's
 * audio. Routed through the ambience's effects bus when it has one, so the existing volume
 * settings still apply.
 */
export class Sfx {
  constructor(ambience) {
    this.ambience = ambience
    this.noise = null
  }

  get ctx() {
    return this.ambience?.ctx || null
  }

  get out() {
    return this.ambience?.effectsBus || this.ctx?.destination
  }

  _noise(ctx) {
    if (this.noise) return this.noise
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    return (this.noise = buf)
  }

  _tone(type, f0, f1, dur, gain = 0.3, delay = 0) {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const t = ctx.currentTime + delay
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(f0, t)
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(this.out)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  _hiss(dur, lo, hi, gain = 0.3, delay = 0) {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const t = ctx.currentTime + delay
    const src = ctx.createBufferSource()
    src.buffer = this._noise(ctx)
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.setValueAtTime(lo, t)
    f.frequency.exponentialRampToValueAtTime(hi, t + dur)
    f.Q.value = 1.2
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(this.out)
    src.start(t)
    src.stop(t + dur + 0.05)
  }

  swing() {
    this._hiss(0.18, 900, 2800, 0.25)
  }
  hit() {
    this._tone('square', 220, 70, 0.12, 0.22)
    this._hiss(0.08, 2000, 600, 0.2)
  }
  squish() {
    this._tone('sine', 420, 90, 0.25, 0.3)
  }
  hurt() {
    this._tone('sawtooth', 180, 90, 0.22, 0.2)
  }
  fireball() {
    this._hiss(0.35, 400, 1600, 0.3)
    this._tone('triangle', 300, 600, 0.2, 0.1)
  }
  boom() {
    this._hiss(0.5, 1200, 120, 0.45)
    this._tone('sine', 120, 40, 0.4, 0.35)
  }
  thunder() {
    this._hiss(0.7, 3000, 200, 0.5)
    this._tone('square', 90, 40, 0.5, 0.2, 0.05)
  }
  heal() {
    ;[523, 659, 784, 1047].forEach((f, i) => this._tone('sine', f, f * 1.01, 0.35, 0.12, i * 0.07))
  }
  coin() {
    this._tone('square', 988, 988, 0.07, 0.08)
    this._tone('square', 1319, 1319, 0.18, 0.08, 0.07)
  }
  pickup() {
    this._tone('sine', 660, 1320, 0.18, 0.18)
  }
  levelUp() {
    ;[523, 659, 784, 1047, 1319].forEach((f, i) => this._tone('triangle', f, f, 0.3, 0.16, i * 0.09))
  }
  quest() {
    ;[392, 523, 659].forEach((f, i) => this._tone('triangle', f, f, 0.28, 0.14, i * 0.11))
  }
  ui() {
    this._tone('sine', 880, 1100, 0.06, 0.08)
  }
  dash() {
    this._hiss(0.2, 600, 2400, 0.2)
  }
}
