import type { CardId, CoachCard } from './types'

// Le Carnet du Coach — pool v0 : 2 cartes par famille.
// Directes : effet immédiat. Armées : préparent un déclencheur vocal du
// prochain round. Conditionnelles : pari sur le scénario du round.

export const CARD_POOL: CoachCard[] = [
  {
    id: 'secondWind',
    name: 'Second Souffle',
    family: 'direct',
    icon: '💨',
    desc: 'Ton perso récupère 20 % de ses PV immédiatement.',
  },
  {
    id: 'ironGuard',
    name: 'Garde de Fer',
    family: 'direct',
    icon: '🛡️',
    desc: 'Prochain round : les dégâts reçus sont réduits de 35 %.',
  },
  {
    id: 'perfectCounter',
    name: 'Contre Parfait',
    family: 'armed',
    icon: '⚡',
    desc: 'Le prochain « CONTRE ! » que tu cries inflige des dégâts doublés.',
  },
  {
    id: 'warCry',
    name: 'Cri de Guerre',
    family: 'armed',
    icon: '📣',
    desc: 'Ton prochain encouragement remplit massivement la Hype (+35).',
  },
  {
    id: 'lastChance',
    name: 'Dernière Chance',
    family: 'conditional',
    icon: '🔥',
    desc: 'Si ton perso tombe sous 15 % PV au prochain round, sa Hype se remplit d’un coup.',
  },
  {
    id: 'provocation',
    name: 'Provocation',
    family: 'conditional',
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
    family: 'conditional',
    icon: '❤️‍🔥',
    desc: 'Si Kenta encaisse 3 coups ce round, sa Hype bondit de +40. La douleur le nourrit.',
    signatureOf: 'kenta',
  },
  {
    id: 'sigRei',
    name: "Orgueil du Rival",
    family: 'armed',
    icon: '🌑',
    desc: 'Le prochain contre de Rei remplit 50 % de sa Hype. Humilier, c’est son art.',
    signatureOf: 'rei',
  },
  {
    id: 'sigYuna',
    name: 'Concentration Absolue',
    family: 'direct',
    icon: '🎯',
    desc: 'Yuna est immunisée à la confusion ce round. Crie ce que tu veux, elle reste limpide.',
    signatureOf: 'yuna',
  },
  {
    id: 'sigGoro',
    name: "Leçon d'Expérience",
    family: 'conditional',
    icon: '🛡️',
    desc: 'Le premier spécial adverse de ce round est réduit de moitié. Gorō l’a vu venir.',
    signatureOf: 'goro',
  },
  {
    id: 'sigFang',
    name: 'Frénésie',
    family: 'armed',
    icon: '🩸',
    desc: 'Le prochain « ATTAQUE ! » lâche la bête : +50 % de dégâts pendant 5 s.',
    signatureOf: 'fang',
  },
  {
    id: 'sigNyx',
    name: "Pas de l'Ombre",
    family: 'direct',
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

export const DEFAULT_DECK: CardId[] = ['secondWind', 'perfectCounter', 'lastChance']

export const FAMILY_LABEL: Record<CoachCard['family'], string> = {
  direct: 'Directe',
  armed: 'Armée',
  conditional: 'Pari',
}
