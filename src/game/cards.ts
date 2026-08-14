import type { CardId, CardTiming, CoachCard } from './types'

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
  },
  {
    id: 'massage',
    name: 'Massage Éclair',
    timing: 'pause',
    cost: 1,
    icon: '🤲',
    desc: 'Récupère 8 % des PV. Petit prix, petit soin.',
  },
  {
    id: 'focus',
    name: 'Mise au Point',
    timing: 'pause',
    cost: 1,
    icon: '🗣️',
    desc: 'Un mot juste : +15 Hype immédiate.',
  },
  {
    id: 'coldShower',
    name: 'Douche Froide',
    timing: 'pause',
    cost: 2,
    icon: '🧊',
    desc: "L'adversaire perd 30 Hype. Casse-lui son momentum.",
  },
  {
    id: 'ironGuard',
    name: 'Garde de Fer',
    timing: 'pause',
    cost: 2,
    icon: '🛡️',
    desc: 'Prochain round : les dégâts reçus sont réduits de 35 %.',
  },
  // --- Instants armés (préchargés, libérés à la voix) ---
  {
    id: 'perfectCounter',
    name: 'Contre Parfait',
    timing: 'armed',
    cost: 2,
    icon: '⚡',
    desc: 'Le prochain « CONTRE ! » que tu cries inflige des dégâts doublés.',
  },
  {
    id: 'warCry',
    name: 'Cri de Guerre',
    timing: 'armed',
    cost: 1,
    icon: '📣',
    desc: 'Ton prochain encouragement remplit massivement la Hype (+35).',
  },
  // --- Instants pari (conditionnels) ---
  {
    id: 'lastChance',
    name: 'Dernière Chance',
    timing: 'condition',
    cost: 2,
    icon: '🔥',
    desc: 'Si ton perso tombe sous 15 % PV au prochain round, sa Hype se remplit d’un coup.',
  },
  {
    id: 'provocation',
    name: 'Provocation',
    timing: 'condition',
    cost: 2,
    icon: '😤',
    desc: "L'adversaire démarre le round fou de rage : agressif verrouillé 10 s. Tu sais ce qui arrive.",
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
    signatureOf: 'kenta',
  },
  {
    id: 'sigRei',
    name: "Orgueil du Rival",
    timing: 'armed',
    cost: 2,
    icon: '🌑',
    desc: 'Le prochain contre de Rei remplit 50 % de sa Hype. Humilier, c’est son art.',
    signatureOf: 'rei',
  },
  {
    id: 'sigYuna',
    name: 'Concentration Absolue',
    timing: 'pause',
    cost: 1,
    icon: '🎯',
    desc: 'Yuna est immunisée à la confusion ce round. Crie ce que tu veux, elle reste limpide.',
    signatureOf: 'yuna',
  },
  {
    id: 'sigGoro',
    name: "Leçon d'Expérience",
    timing: 'condition',
    cost: 2,
    icon: '🛡️',
    desc: 'Le premier spécial adverse de ce round est réduit de moitié. Gorō l’a vu venir.',
    signatureOf: 'goro',
  },
  {
    id: 'sigFang',
    name: 'Frénésie',
    timing: 'armed',
    cost: 2,
    icon: '🩸',
    desc: 'Le prochain « ATTAQUE ! » lâche la bête : +50 % de dégâts pendant 5 s.',
    signatureOf: 'fang',
  },
  {
    id: 'sigNyx',
    name: "Pas de l'Ombre",
    timing: 'pause',
    cost: 2,
    icon: '👤',
    desc: 'Nyx gagne +15 % d’esquive ce round. Frapper la fumée, bonne chance.',
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
