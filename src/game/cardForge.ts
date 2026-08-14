import type { CardTiming, CoachCard, EffectPrimitive } from './types'
import { clampEffect, computeCost, registerCustomCard } from './cards'

// La Forge de cartes — création de cartes par prompt, v0 locale.
// Le prompt choisit l'HABILLAGE et oriente les PRIMITIVES ; clampEffect
// borne chaque paramètre et computeCost fixe le prix : impossible de forger
// une carte cassée. v1 : le parseur mots-clés sera remplacé par l'API
// Claude, avec exactement les mêmes garde-fous.

interface ForgeRule {
  re: RegExp
  make: () => EffectPrimitive
  icon: string
  namePool: string[]
}

const RULES: ForgeRule[] = [
  {
    re: /soigne|soin|répare|régénère|récupère|guérit/i,
    make: () => ({ kind: 'heal', pct: 0.12 }),
    icon: '💊',
    namePool: ['Regain', 'Souffle Neuf', 'Pansement Miracle'],
  },
  {
    re: /motive|inspire|galvanise|discours|exalte/i,
    make: () => ({ kind: 'hype', amount: 20 }),
    icon: '🔥',
    namePool: ['Étincelle', 'Harangue', 'Feu Sacré'],
  },
  {
    re: /sabote|gèle|refroidit|déstabilise|casse le moral|démoralise/i,
    make: () => ({ kind: 'enemyHype', amount: -25 }),
    icon: '🧊',
    namePool: ['Coup au Moral', 'Vent Glacial', 'Doute'],
  },
  {
    re: /bouclier|garde|armure|protège|carapace|blinde/i,
    make: () => ({ kind: 'damageReduction', mul: 0.7 }),
    icon: '🛡️',
    namePool: ['Carapace', 'Rempart', 'Peau de Fer'],
  },
  {
    re: /esquive|fantôme|fumée|insaisissable|glisse/i,
    make: () => ({ kind: 'dodgeBonus', add: 0.12 }),
    icon: '💨',
    namePool: ['Brume', 'Pas Fantôme', 'Silhouette'],
  },
  {
    re: /zen|concentr|sérénité|calme absolu|imperturbable/i,
    make: () => ({ kind: 'immuneConfusion' }),
    icon: '🎯',
    namePool: ['Zénitude', 'Esprit Clair', 'Roc Mental'],
  },
  {
    re: /contre|riposte|renvoie/i,
    make: () => ({ kind: 'armCounterMul', mul: 1.8 }),
    icon: '⚡',
    namePool: ['Riposte Éclair', 'Miroir', 'Punition'],
  },
  {
    re: /cri|hurle|rugis|clameur/i,
    make: () => ({ kind: 'armCheerHype', amount: 30 }),
    icon: '📣',
    namePool: ['Clameur', 'Voix du Coin', 'Tonnerre'],
  },
  {
    re: /rage|frénésie|déchaîne|furie|berserk/i,
    make: () => ({ kind: 'armAttackFrenzy', mul: 1.4, duration: 5 }),
    icon: '🩸',
    namePool: ['Furie', 'Sang Chaud', 'Déchaînement'],
  },
  {
    re: /désespoir|dernier|acculé|dos au mur|survie/i,
    make: () => ({ kind: 'lowHpHypeFull', threshold: 0.18 }),
    icon: '🕯️',
    namePool: ['Dos au Mur', 'Ultime Lueur', 'Instinct de Survie'],
  },
  {
    re: /provoque|insulte|nargue|chauffe/i,
    make: () => ({ kind: 'provoke', duration: 8 }),
    icon: '😤',
    namePool: ['Pique', 'Bras d’Honneur', 'Chiffon Rouge'],
  },
  {
    re: /humilie|leçon|orgueil/i,
    make: () => ({ kind: 'counterHype', amount: 35 }),
    icon: '🌑',
    namePool: ['Humiliation', 'Leçon', 'Revers Cinglant'],
  },
  {
    re: /encaisse|douleur|souffre|masochiste|endur/i,
    make: () => ({ kind: 'hitsTakenHype', hits: 3, amount: 30 }),
    icon: '❤️‍🔥',
    namePool: ['Peau Dure', 'Nourri de Coups', 'Cuir Tanné'],
  },
  {
    re: /anticipe|lit le jeu|prévoit|voit venir/i,
    make: () => ({ kind: 'halveEnemySpecial' }),
    icon: '👁️',
    namePool: ['Lecture Parfaite', 'Sixième Sens', 'Déjà-Vu'],
  },
]

/** timing déduit des primitives : armé > pari > pause. */
function deriveTiming(effects: EffectPrimitive[]): CardTiming {
  if (effects.some(e => e.kind.startsWith('arm'))) return 'armed'
  if (
    effects.some(e =>
      ['lowHpHypeFull', 'provoke', 'counterHype', 'hitsTakenHype', 'halveEnemySpecial'].includes(
        e.kind,
      ),
    )
  )
    return 'condition'
  return 'pause'
}

function describe(e: EffectPrimitive): string {
  switch (e.kind) {
    case 'heal':
      return `récupère ${Math.round(e.pct * 100)} % des PV`
    case 'hype':
      return `+${Math.round(e.amount)} Hype`
    case 'enemyHype':
      return `l'adversaire perd ${Math.abs(Math.round(e.amount))} Hype`
    case 'damageReduction':
      return `dégâts reçus −${Math.round((1 - e.mul) * 100)} % ce round`
    case 'dodgeBonus':
      return `+${Math.round(e.add * 100)} % d'esquive ce round`
    case 'immuneConfusion':
      return 'immunisé à la confusion ce round'
    case 'armCounterMul':
      return `le prochain « CONTRE ! » inflige ×${e.mul} dégâts`
    case 'armCheerHype':
      return `le prochain encouragement donne +${Math.round(e.amount)} Hype`
    case 'armAttackFrenzy':
      return `« ATTAQUE ! » → dégâts ×${e.mul} pendant ${Math.round(e.duration)} s`
    case 'lowHpHypeFull':
      return `sous ${Math.round(e.threshold * 100)} % PV : Hype pleine`
    case 'provoke':
      return `l'adversaire démarre agressif ${Math.round(e.duration)} s`
    case 'counterHype':
      return `un contre réussi donne +${Math.round(e.amount)} Hype`
    case 'hitsTakenHype':
      return `encaisser ${e.hits} coups donne +${Math.round(e.amount)} Hype`
    case 'halveEnemySpecial':
      return 'le premier spécial adverse est réduit de moitié'
  }
}

export interface ForgeResult {
  card: CoachCard
  /** primitives reconnues dans le prompt (pour le feedback) */
  matched: number
}

/**
 * Forge une carte depuis une description libre. Maximum 2 primitives par
 * carte (les premières reconnues) ; chaque paramètre est borné ; le coût
 * est budgétisé. Retourne null si aucun effet n'est reconnu.
 */
export function forgeCard(prompt: string): ForgeResult | null {
  const matchedRules = RULES.filter(r => r.re.test(prompt)).slice(0, 2)
  if (matchedRules.length === 0) return null

  const effects = matchedRules.map(r => clampEffect(r.make()))
  const cost = computeCost(effects)
  const timing = deriveTiming(effects)

  // Nom : « appelée X » / « nommée X », sinon pioché dans les pools.
  const m = prompt.match(/(?:appelée?|nommée?|s'appelle)\s+([A-ZÀ-Ý][\wà-ÿ' -]{1,20})/i)
  const name = m
    ? m[1].trim()
    : matchedRules[Math.floor(Math.random() * matchedRules.length)].namePool[
        Math.floor(Math.random() * 3)
      ]

  const card: CoachCard = {
    id: `forge-${Math.random().toString(36).slice(2, 8)}`,
    name,
    timing,
    cost,
    icon: matchedRules[0].icon,
    desc: effects.map(describe).join(' · ') + ' (forgée par le coach)',
    effects,
  }
  return { card, matched: matchedRules.length }
}

// --- Persistance -----------------------------------------------------------

const FORGE_KEY = 'coach-arena-forged-cards-v1'
const MAX_FORGED = 8
const hasStorage = typeof localStorage !== 'undefined'

export function saveForgedCard(card: CoachCard): void {
  registerCustomCard(card)
  if (!hasStorage) return
  try {
    const all: CoachCard[] = JSON.parse(localStorage.getItem(FORGE_KEY) ?? '[]')
    all.unshift(card)
    localStorage.setItem(FORGE_KEY, JSON.stringify(all.slice(0, MAX_FORGED)))
  } catch {
    /* stockage indisponible : la carte vit le temps de la session */
  }
}

/** Recharge et ré-enregistre les cartes forgées (avec re-clamp de sécurité). */
export function loadForgedCards(): CoachCard[] {
  if (!hasStorage) return []
  try {
    const all: CoachCard[] = JSON.parse(localStorage.getItem(FORGE_KEY) ?? '[]')
    for (const c of all) {
      c.effects = (c.effects ?? []).map(clampEffect)
      c.cost = computeCost(c.effects)
      registerCustomCard(c)
    }
    return all
  } catch {
    return []
  }
}
