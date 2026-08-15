// Détection de hauteur de voix (pitch) par autocorrélation normalisée —
// 100 % locale (WebAudio time-domain), zéro coût, zéro réseau. Sert la
// prosodie : un coach qui monte dans les aigus n'est pas un coach qui
// parle fort — l'intonation devient un signal de jeu à part entière.

/** Plage utile de la voix parlée/criée (Hz). */
const MIN_HZ = 70
const MAX_HZ = 500

/**
 * Détecte la fréquence fondamentale d'un buffer temporel, ou null si le
 * signal est trop faible / non voisé (silence, bruit, consonnes).
 */
export function detectPitch(buf: Float32Array, sampleRate: number): number | null {
  const n = buf.length
  // Énergie : en dessous d'un seuil, pas de voix.
  let rms = 0
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i]
  rms = Math.sqrt(rms / n)
  if (rms < 0.01) return null

  const maxLag = Math.floor(sampleRate / MIN_HZ)
  const minLag = Math.floor(sampleRate / MAX_HZ)
  if (maxLag >= n) return null

  // Autocorrélation normalisée (NAC) sur la plage de lags utile.
  let bestLag = -1
  let bestVal = 0
  for (let lag = minLag; lag <= maxLag; lag++) {
    let num = 0
    let den = 0
    for (let i = 0; i < n - lag; i++) {
      num += buf[i] * buf[i + lag]
      den += buf[i] * buf[i] + buf[i + lag] * buf[i + lag]
    }
    const val = den > 0 ? (2 * num) / den : 0
    if (val > bestVal) {
      bestVal = val
      bestLag = lag
    }
  }
  // Un vrai son voisé corrèle fort ; le bruit blanc reste bas.
  if (bestLag === -1 || bestVal < 0.5) return null
  return sampleRate / bestLag
}

/**
 * Suivi de prosodie : ligne de base adaptative (la voix « normale » du
 * coach) et ratio courant. ratio > 1 = plus aigu que d'habitude.
 */
export class PitchTracker {
  /** ligne de base lissée (Hz), 0 tant que rien n'est entendu */
  baseline = 0
  /** pitch lissé courant (Hz) */
  current = 0

  update(hz: number | null): void {
    if (hz === null) return
    this.current = this.current === 0 ? hz : this.current * 0.7 + hz * 0.3
    // La ligne de base apprend lentement — elle représente la voix posée.
    this.baseline = this.baseline === 0 ? hz : this.baseline * 0.995 + hz * 0.005
  }

  /** ratio courant/ligne de base, borné [0.5..2] ; 1 si inconnu. */
  ratio(): number {
    if (this.baseline === 0 || this.current === 0) return 1
    return Math.max(0.5, Math.min(2, this.current / this.baseline))
  }
}
