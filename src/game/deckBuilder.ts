import type { CardId, CoachCard } from './types'
import { CARD_POOL, DECK_COPIES } from './cards'

// Le Deck-Builder — le coach compose son deck : nombre de copies par carte
// de base (0..MAX_COPIES), persisté. Les cartes gagnées (paliers de Lien),
// forgées, et la signature du perso s'ajoutent PAR-DESSUS le modèle : elles
// se méritent, elles ne se configurent pas.

export const MAX_COPIES = 3
/** bornes du modèle configurable (les ajouts mérités peuvent dépasser) */
export const DECK_MIN = 12
export const DECK_MAX = 60

export type DeckTemplate = Partial<Record<CardId, number>>

const KEY = 'coach-arena-deck-v1'
const hasStorage = typeof localStorage !== 'undefined'

/** Modèle par défaut : DECK_COPIES copies de chaque carte de base. */
export function defaultTemplate(): DeckTemplate {
  const t: DeckTemplate = {}
  for (const c of CARD_POOL) t[c.id] = DECK_COPIES
  return t
}

export function loadTemplate(): DeckTemplate {
  if (!hasStorage) return defaultTemplate()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultTemplate()
    const t = JSON.parse(raw) as DeckTemplate
    return sanitizeTemplate(t)
  } catch {
    return defaultTemplate()
  }
}

export function saveTemplate(t: DeckTemplate): void {
  if (!hasStorage) return
  try {
    localStorage.setItem(KEY, JSON.stringify(sanitizeTemplate(t)))
  } catch {
    /* stockage indisponible */
  }
}

/** Ne garde que les cartes de base connues, copies bornées 0..MAX_COPIES. */
export function sanitizeTemplate(t: DeckTemplate): DeckTemplate {
  const clean: DeckTemplate = {}
  for (const c of CARD_POOL) {
    const n = Math.round(Number(t[c.id] ?? 0))
    clean[c.id] = Math.max(0, Math.min(MAX_COPIES, Number.isFinite(n) ? n : 0))
  }
  return clean
}

export function templateSize(t: DeckTemplate): number {
  return Object.values(t).reduce((s: number, n) => s + (n ?? 0), 0)
}

export function templateValid(t: DeckTemplate): boolean {
  const size = templateSize(t)
  return size >= DECK_MIN && size <= DECK_MAX
}

/**
 * Construit la liste de deck jouable : modèle configuré + signature (2
 * copies si débloquée) + copies de paliers + cartes forgées (1 copie).
 */
export function buildDeckFromTemplate(
  template: DeckTemplate,
  signatureId: CardId | null,
  extraCopies: CardId[],
  forged: CoachCard[],
): CardId[] {
  const deck: CardId[] = []
  const t = sanitizeTemplate(template)
  for (const c of CARD_POOL) {
    for (let i = 0; i < (t[c.id] ?? 0); i++) deck.push(c.id)
  }
  if (signatureId) for (let i = 0; i < DECK_COPIES; i++) deck.push(signatureId)
  deck.push(...extraCopies)
  deck.push(...forged.map(c => c.id))
  return deck
}
