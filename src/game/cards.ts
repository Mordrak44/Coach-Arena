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

export function getCard(id: CardId): CoachCard {
  return CARD_POOL.find(c => c.id === id)!
}

export const DEFAULT_DECK: CardId[] = ['secondWind', 'perfectCounter', 'lastChance']

export const FAMILY_LABEL: Record<CoachCard['family'], string> = {
  direct: 'Directe',
  armed: 'Armée',
  conditional: 'Pari',
}
