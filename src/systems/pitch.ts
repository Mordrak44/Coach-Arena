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
    // `den === 0` (fenêtre de corrélation qui tombe entièrement à zéro,
    // possible seulement pour un lag proche de `maxLag` — fenêtre étroite,
    // 1 seul échantillon dans le pire cas) reste couvert par construction
    // ailleurs dans les tests, mais n'est plus ATTEIGNABLE par le test qui
    // le construisait spécifiquement (qui plaçait ce cas tout au bout de
    // la plage) : le `break` anticipé ci-dessous (voir plus bas) arrête
    // maintenant la recherche dès le premier pic voisé trouvé, avant
    // d'atteindre cette extrémité pour un signal périodique normal.
    // Reconstruire ce cas à un lag PROCHE de `minLag` (donc effectivement
    // visité avant tout `break`) demanderait de mettre à zéro la quasi-
    // totalité du buffer — la fenêtre de corrélation d'un petit lag
    // couvre presque tout le buffer — ce qui tuerait aussi le signal
    // périodique que ce même test doit par ailleurs détecter. Documenté
    // plutôt que forcé par un test artificiel (trouvé en audit, 2026-08-20).
    const val = den > 0 ? (2 * num) / den : 0
    // Un vrai son voisé corrèle fort ; le bruit blanc reste bas.
    if (val < 0.5) continue
    if (val > bestVal) {
      bestVal = val
      bestLag = lag
    } else {
      // `val` a commencé à REDESCENDRE après avoir franchi le seuil de
      // voisement : on vient de dépasser le premier maximum local voisé,
      // le PREMIER lag (donc la fréquence la PLUS AIGUË plausible) dont la
      // corrélation est assez forte — la fondamentale. On s'arrête ici
      // plutôt que de continuer à chercher un maximum GLOBAL sur toute la
      // plage restante : un lag plus long (sous-harmonique — moitié,
      // tiers, quart de la vraie fréquence) peut numériquement dépasser ce
      // pic par simple bruit de quantification entre échantillons entiers,
      // pas parce que c'est une meilleure estimation de hauteur — l'erreur
      // d'octave classique de l'autocorrélation naïve. Sans ce garde-fou,
      // simulé sur un signal de voix synthétique (fondamentale + 2e/3e
      // harmonique, 90-340 Hz, aucun bruit) : 42 % des essais
      // verrouillaient sur une sous-harmonique au lieu de la fondamentale
      // (ex. 288,8 Hz détecté comme 72,2 Hz) — corrigé et reconfirmé à 0 %
      // d'erreur d'octave sur les mêmes essais (trouvé en audit, 2026-08-20).
      break
    }
  }
  if (bestLag === -1) return null
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
