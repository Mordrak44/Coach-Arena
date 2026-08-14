// Bande-son 100 % synthétisée en WebAudio — zéro asset, zéro requête réseau.
// Impacts, gong de round, montée de spécial, KO, et une foule qui gronde
// avec la Hype du match.

export class SoundSystem {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private crowdGain: GainNode | null = null
  private crowdTarget = 0.04
  muted = false

  /** À appeler depuis un geste utilisateur (les navigateurs bloquent l'audio sinon). */
  start() {
    if (this.ctx) return
    try {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.7
      this.master.connect(this.ctx.destination)
      this.startCrowd()
    } catch {
      this.ctx = null
    }
  }

  setMuted(m: boolean) {
    this.muted = m
    if (this.master) this.master.gain.value = m ? 0 : 0.7
  }

  stop() {
    this.ctx?.close().catch(() => {})
    this.ctx = null
    this.master = null
    this.crowdGain = null
  }

  // -- briques de synthèse --------------------------------------------------

  private noiseBuffer(dur: number): AudioBuffer {
    const ctx = this.ctx!
    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    return buf
  }

  /** Bruit filtré avec enveloppe — la base des impacts. */
  private noiseHit(dur: number, freq: number, gain: number, type: BiquadFilterType = 'lowpass') {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer(dur)
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
    src.connect(filter).connect(g).connect(this.master)
    src.start()
  }

  /** Sinus percussif (thump grave, gong, bips). */
  private tone(
    freq: number,
    dur: number,
    gain: number,
    opts: { type?: OscillatorType; slideTo?: number; delay?: number } = {},
  ) {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const t0 = ctx.currentTime + (opts.delay ?? 0)
    const osc = ctx.createOscillator()
    osc.type = opts.type ?? 'sine'
    osc.frequency.setValueAtTime(freq, t0)
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
    osc.connect(g).connect(this.master)
    osc.start(t0)
    osc.stop(t0 + dur + 0.05)
  }

  // -- foule ---------------------------------------------------------------

  private startCrowd() {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer(2)
    src.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 500
    filter.Q.value = 0.6
    this.crowdGain = ctx.createGain()
    this.crowdGain.gain.value = 0.04
    src.connect(filter).connect(this.crowdGain).connect(this.master)
    src.start()
  }

  /** hype 0..1 → la foule gronde de plus en plus fort. */
  setCrowdHype(hype: number) {
    if (!this.ctx || !this.crowdGain) return
    const target = 0.03 + hype * 0.1
    if (Math.abs(target - this.crowdTarget) > 0.005) {
      this.crowdTarget = target
      this.crowdGain.gain.linearRampToValueAtTime(target, this.ctx.currentTime + 0.4)
    }
  }

  /** Clameur ponctuelle de la foule (beau coup, KO). */
  private crowdRoar(intensity: number) {
    if (!this.ctx || !this.crowdGain) return
    const t = this.ctx.currentTime
    const g = this.crowdGain.gain
    g.cancelScheduledValues(t)
    g.setValueAtTime(g.value, t)
    g.linearRampToValueAtTime(Math.min(0.35, 0.12 + intensity * 0.2), t + 0.08)
    g.linearRampToValueAtTime(this.crowdTarget, t + 1.2 + intensity)
  }

  // -- événements de jeu ----------------------------------------------------

  hit(crit: boolean) {
    this.noiseHit(crit ? 0.22 : 0.12, crit ? 900 : 1400, crit ? 0.5 : 0.3)
    this.tone(crit ? 90 : 120, crit ? 0.25 : 0.15, crit ? 0.5 : 0.3, { slideTo: 45 })
    if (crit) this.crowdRoar(0.5)
  }

  block() {
    this.noiseHit(0.08, 2500, 0.2, 'highpass')
    this.tone(220, 0.1, 0.15, { type: 'triangle' })
  }

  dodge() {
    this.noiseHit(0.15, 3000, 0.12, 'highpass')
  }

  counter() {
    this.tone(300, 0.12, 0.3, { type: 'square', slideTo: 600 })
    this.noiseHit(0.18, 1200, 0.4)
    this.tone(100, 0.22, 0.45, { slideTo: 50, delay: 0.05 })
    this.crowdRoar(0.6)
  }

  special() {
    // riser…
    this.tone(150, 0.7, 0.25, { type: 'sawtooth', slideTo: 900 })
    // …puis l'explosion
    this.tone(70, 0.9, 0.6, { slideTo: 35, delay: 0.65 })
    this.noiseHit(0.5, 700, 0.5)
    this.crowdRoar(1)
  }

  /** L'Ultime : double riser, explosion plus grave, la foule perd la tête. */
  ulti() {
    this.tone(100, 0.9, 0.3, { type: 'sawtooth', slideTo: 1200 })
    this.tone(101, 0.9, 0.2, { type: 'square', slideTo: 1180 })
    this.tone(50, 1.4, 0.8, { slideTo: 24, delay: 0.85 })
    this.noiseHit(0.9, 500, 0.6)
    this.tone(45, 1.0, 0.4, { slideTo: 30, delay: 1.3 })
    this.crowdRoar(1.6)
  }

  gong() {
    this.tone(180, 1.6, 0.4, { type: 'triangle' })
    this.tone(182.5, 1.6, 0.25, { type: 'sine' }) // battement de gong
    this.tone(360, 0.8, 0.12, { type: 'sine' })
  }

  ko() {
    this.tone(60, 1.4, 0.7, { slideTo: 28 })
    this.noiseHit(0.8, 500, 0.5)
    this.crowdRoar(1.2)
  }

  hypeFull() {
    this.tone(660, 0.1, 0.2, { type: 'square' })
    this.tone(880, 0.12, 0.2, { type: 'square', delay: 0.1 })
    this.tone(1320, 0.2, 0.2, { type: 'square', delay: 0.2 })
  }

  cardPlay() {
    this.tone(520, 0.08, 0.18, { type: 'triangle' })
    this.tone(780, 0.12, 0.18, { type: 'triangle', delay: 0.07 })
  }

  confused() {
    this.tone(400, 0.3, 0.15, { type: 'sine', slideTo: 200 })
  }
}
