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
    const t = JSON.parse(raw)
    // JSON.parse réussit aussi sur du JSON valide mais de mauvaise FORME
    // (ex. la chaîne "42" ou '"oops"') — sanitizeTemplate(42) ou
    // sanitizeTemplate("oops") ne plante pas non plus (l'accès par index
    // sur un nombre/une chaîne renvoie juste `undefined`, pas d'exception),
    // donc chaque carte retombait silencieusement à 0 copie au lieu du
    // modèle par défaut : un deck vide et invalide sans raison visible
    // (trouvé en écrivant les tests de couverture, 2026-08-16 — même
    // classe de bug déjà corrigée dans stable.ts).
    if (!t || typeof t !== 'object' || Array.isArray(t)) return defaultTemplate()
    return sanitizeTemplate(t as DeckTemplate)
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
