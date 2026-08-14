import type { CardId, CardTiming, CoachCard, EffectPrimitive } from './types'

// --- Budget de puissance ----------------------------------------------------
// Chaque primitive a un coût en puissance ; le coût en Souffle d'une carte
// est la somme arrondie, bornée à [1..3]. C'est CE calcul qui rendra les
// cartes créées par prompt équitables : l'IA choisit les primitives,
// le budget fixe le prix.

export function primitivePower(e: EffectPrimitive): number {
  switch (e.kind) {
    case 'heal':
      return e.pct * 10 // 8 % → 0.8 ; 20 % → 2
    case 'hype':
      return e.amount / 15
    case 'enemyHype':
      return Math.abs(e.amount) / 15
    case 'damageReduction':
      return (1 - e.mul) * 5.7 // −35 % → 2
    case 'dodgeBonus':
      return e.add * 13.4 // +15 % → 2
    case 'immuneConfusion':
      return 1
    case 'armCounterMul':
      return e.mul // ×2 → 2
    case 'armCheerHype':
      return e.amount / 35
    case 'armAttackFrenzy':
      return 1 + (e.mul - 1) * 2 * (e.duration / 5) // ×1.5 / 5 s → 2
    case 'lowHpHypeFull':
      return 2
    case 'provoke':
      return e.duration / 5
    case 'counterHype':
      return e.amount / 25
    case 'hitsTakenHype':
      return e.amount / 20
    case 'halveEnemySpecial':
      return 2
  }
}

export function computeCost(effects: EffectPrimitive[]): number {
  const sum = effects.reduce((s, e) => s + primitivePower(e), 0)
  return Math.max(1, Math.min(3, Math.round(sum)))
}

/**
 * Bornes de sécurité pour les effets générés (cartes par prompt, v2) :
 * ramène chaque paramètre dans sa plage autorisée.
 */
export function clampEffect(e: EffectPrimitive): EffectPrimitive {
  const c = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  switch (e.kind) {
    case 'heal':
      return { ...e, pct: c(e.pct, 0.02, 0.25) }
    case 'hype':
      return { ...e, amount: c(e.amount, 5, 40) }
    case 'enemyHype':
      return { ...e, amount: c(e.amount, -40, -5) }
    case 'damageReduction':
      return { ...e, mul: c(e.mul, 0.5, 0.95) }
    case 'dodgeBonus':
      return { ...e, add: c(e.add, 0.05, 0.2) }
    case 'armCounterMul':
      return { ...e, mul: c(e.mul, 1.2, 2.5) }
    case 'armCheerHype':
      return { ...e, amount: c(e.amount, 10, 50) }
    case 'armAttackFrenzy':
      return { ...e, mul: c(e.mul, 1.1, 1.8), duration: c(e.duration, 2, 8) }
    case 'lowHpHypeFull':
      return { ...e, threshold: c(e.threshold, 0.05, 0.25) }
    case 'provoke':
      return { ...e, duration: c(e.duration, 4, 12) }
    case 'counterHype':
      return { ...e, amount: c(e.amount, 15, 60) }
    case 'hitsTakenHype':
      return { ...e, hits: c(Math.round(e.hits), 2, 5), amount: c(e.amount, 15, 50) }
    default:
      return e
  }
}

// Le Deck du Coach — système de cartes façon TCG :
// - deck mélangé, main de HAND_SIZE, pioche à chaque coin du ring
// - chaque carte coûte du Souffle (SOUFFLE_PER_CORNER points par pause)
// - timings : 'pause' (effet immédiat au coin du ring), 'armed' (instant
//   préchargé, libéré PAR LA VOIX au prochain round), 'condition' (instant
//   pari, déclenché par le scénario du round)
// Les mains ne touchent jamais les cartes pendant le round : la voix reste
// la manette, le deck prépare.

export const CARD_POOL: CoachCard[] = [
  // --- Cartes Coach (timing pause) ---
  {
    id: 'secondWind',
    name: 'Second Souffle',
    timing: 'pause',
    cost: 2,
    icon: '💨',
    desc: 'Ton perso récupère 20 % de ses PV immédiatement.',
    effects: [{ kind: 'heal', pct: 0.2 }],
  },
  {
    id: 'massage',
    name: 'Massage Éclair',
    timing: 'pause',
    cost: 1,
    icon: '🤲',
    desc: 'Récupère 8 % des PV. Petit prix, petit soin.',
    effects: [{ kind: 'heal', pct: 0.08 }],
  },
  {
    id: 'focus',
    name: 'Mise au Point',
    timing: 'pause',
    cost: 1,
    icon: '🗣️',
    desc: 'Un mot juste : +15 Hype immédiate.',
    effects: [{ kind: 'hype', amount: 15 }],
  },
  {
    id: 'coldShower',
    name: 'Douche Froide',
    timing: 'pause',
    cost: 2,
    icon: '🧊',
    desc: "L'adversaire perd 30 Hype. Casse-lui son momentum.",
    effects: [{ kind: 'enemyHype', amount: -30 }],
  },
  {
    id: 'ironGuard',
    name: 'Garde de Fer',
    timing: 'pause',
    cost: 2,
    icon: '🛡️',
    desc: 'Prochain round : les dégâts reçus sont réduits de 35 %.',
    effects: [{ kind: 'damageReduction', mul: 0.65 }],
  },
  // --- Instants armés (préchargés, libérés à la voix) ---
  {
    id: 'perfectCounter',
    name: 'Contre Parfait',
    timing: 'armed',
    cost: 2,
    icon: '⚡',
    desc: 'Le prochain « CONTRE ! » que tu cries inflige des dégâts doublés.',
    effects: [{ kind: 'armCounterMul', mul: 2 }],
  },
  {
    id: 'warCry',
    name: 'Cri de Guerre',
    timing: 'armed',
    cost: 1,
    icon: '📣',
    desc: 'Ton prochain encouragement remplit massivement la Hype (+35).',
    effects: [{ kind: 'armCheerHype', amount: 35 }],
  },
  // --- Instants pari (conditionnels) ---
  {
    id: 'lastChance',
    name: 'Dernière Chance',
    timing: 'condition',
    cost: 2,
    icon: '🔥',
    desc: 'Si ton perso tombe sous 15 % PV au prochain round, sa Hype se remplit d’un coup.',
    effects: [{ kind: 'lowHpHypeFull', threshold: 0.15 }],
  },
  {
    id: 'provocation',
    name: 'Provocation',
    timing: 'condition',
    cost: 2,
    icon: '😤',
    desc: "L'adversaire démarre le round fou de rage : agressif verrouillé 10 s. Tu sais ce qui arrive.",
    effects: [{ kind: 'provoke', duration: 10 }],
  },
]

// Cartes signatures — une par perso du roster, débloquées au palier de
// Lien « Protégé » (niveau 2). Jouables uniquement en coachant ce perso.
export const SIGNATURE_CARDS: CoachCard[] = [
  {
    id: 'sigKenta',
    name: 'Cœur Vaillant',
    timing: 'condition',
    cost: 2,
    icon: '❤️‍🔥',
    desc: 'Si Kenta encaisse 3 coups ce round, sa Hype bondit de +40. La douleur le nourrit.',
    effects: [{ kind: 'hitsTakenHype', hits: 3, amount: 40 }],
    signatureOf: 'kenta',
  },
  {
    id: 'sigRei',
    name: "Orgueil du Rival",
    timing: 'armed',
    cost: 2,
    icon: '🌑',
    desc: 'Le prochain contre de Rei remplit 50 % de sa Hype. Humilier, c’est son art.',
    effects: [{ kind: 'counterHype', amount: 50 }],
    signatureOf: 'rei',
  },
  {
    id: 'sigYuna',
    name: 'Concentration Absolue',
    timing: 'pause',
    cost: 1,
    icon: '🎯',
    desc: 'Yuna est immunisée à la confusion ce round. Crie ce que tu veux, elle reste limpide.',
    effects: [{ kind: 'immuneConfusion' }],
    signatureOf: 'yuna',
  },
  {
    id: 'sigGoro',
    name: "Leçon d'Expérience",
    timing: 'condition',
    cost: 2,
    icon: '🛡️',
    desc: 'Le premier spécial adverse de ce round est réduit de moitié. Gorō l’a vu venir.',
    effects: [{ kind: 'halveEnemySpecial' }],
    signatureOf: 'goro',
  },
  {
    id: 'sigFang',
    name: 'Frénésie',
    timing: 'armed',
    cost: 2,
    icon: '🩸',
    desc: 'Le prochain « ATTAQUE ! » lâche la bête : +50 % de dégâts pendant 5 s.',
    effects: [{ kind: 'armAttackFrenzy', mul: 1.5, duration: 5 }],
    signatureOf: 'fang',
  },
  {
    id: 'sigNyx',
    name: "Pas de l'Ombre",
    timing: 'pause',
    cost: 2,
    icon: '👤',
    desc: 'Nyx gagne +15 % d’esquive ce round. Frapper la fumée, bonne chance.',
    effects: [{ kind: 'dodgeBonus', add: 0.15 }],
    signatureOf: 'nyx',
  },
]

const ALL_CARDS = [...CARD_POOL, ...SIGNATURE_CARDS]

export function getCard(id: CardId): CoachCard {
  return ALL_CARDS.find(c => c.id === id)!
}

/** Palier de Lien requis pour débloquer la carte signature d'un perso. */
export const SIGNATURE_BOND_LEVEL = 2

export const TIMING_LABEL: Record<CardTiming, string> = {
  pause: 'Coach',
  armed: 'Instant · voix',
  condition: 'Instant · pari',
}

// --- Deck de départ -------------------------------------------------------

/** Copies de chaque carte dans le deck de départ auto-construit. */
export const DECK_COPIES = 2

/**
 * Deck de départ : 2 copies de chaque carte de base (+2 de la signature si
 * fournie). Le deck-builder complet (30-60 cartes, collection) viendra en v1.
 */
export function buildStarterDeck(signatureId: CardId | null): CardId[] {
  const deck: CardId[] = []
  for (const c of CARD_POOL) for (let i = 0; i < DECK_COPIES; i++) deck.push(c.id)
  if (signatureId) for (let i = 0; i < DECK_COPIES; i++) deck.push(signatureId)
  return deck
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
