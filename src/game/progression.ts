import type { CardId, Character } from './types'
import { CARD_POOL } from './cards'
import { getDesiresFulfilled } from './stable'

// Lien coach-perso : progression persistante (localStorage).
// Gagner des matchs avec un perso monte son Lien → bonus de Cœur (HRT) par
// paliers. Les cartes signatures par perso viendront s'accrocher aux paliers
// (voir ROADMAP). Les persos créés par prompt sont aussi sauvegardés pour
// que leur Lien survive aux sessions.

const PROG_KEY = 'coach-arena-progress-v1'
const CUSTOM_KEY = 'coach-arena-customs-v1'
const MAX_CUSTOMS = 4

export interface CharProgress {
  wins: number
  losses: number
  /** copies supplémentaires choisies aux paliers de Lien (« 1 parmi 2 ») */
  extraCopies?: CardId[]
  /** dernier palier dont la récompense a été réclamée */
  lastRewardLevel?: number
}

type ProgressMap = Record<string, CharProgress>

const hasStorage = typeof localStorage !== 'undefined'

function readJson<T>(key: string, fallback: T): T {
  if (!hasStorage) return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  if (!hasStorage) return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* stockage plein ou bloqué : la progression devient simplement volatile */
  }
}

export function getProgress(charId: string): CharProgress {
  const map = readJson<ProgressMap>(PROG_KEY, {})
  return map[charId] ?? { wins: 0, losses: 0 }
}

export function recordResult(charId: string, won: boolean): CharProgress {
  const map = readJson<ProgressMap>(PROG_KEY, {})
  const p = map[charId] ?? { wins: 0, losses: 0 }
  if (won) p.wins++
  else p.losses++
  map[charId] = p
  writeJson(PROG_KEY, map)
  return p
}

/** Victoires nécessaires pour atteindre chaque niveau de Lien (1..5). */
export const BOND_THRESHOLDS = [1, 3, 6, 10, 15]

export function bondLevel(wins: number): number {
  let level = 0
  for (const t of BOND_THRESHOLDS) if (wins >= t) level++
  return level
}

/** Bonus de Cœur conféré par le Lien : +1 aux niveaux 1 et 2, +2 aux 3-4, +3 au 5. */
export function bondHrtBonus(level: number): number {
  if (level <= 0) return 0
  if (level <= 2) return 1
  if (level <= 4) return 2
  return 3
}

export const BOND_TITLES = [
  'Inconnu',
  'Poulain',
  'Protégé',
  'Complice',
  "Frère d'armes",
  'Légende du coin',
]

export function bondTitle(level: number): string {
  return BOND_TITLES[Math.max(0, Math.min(BOND_TITLES.length - 1, level))]
}

/**
 * Niveau de Lien effectif d'un perso : victoires + soin de la Vie d'Écurie
 * (3 envies comblées valent une victoire). La relation se construit, elle ne
 * fait pas que se gagner.
 */
export function bondLevelFor(charId: string): number {
  const wins = getProgress(charId).wins
  const care = Math.floor(getDesiresFulfilled(charId) / 3)
  return bondLevel(wins + care)
}

// --- Paliers « choisis 1 carte parmi 2 » -----------------------------------

function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Les 2 cartes proposées à un palier donné — déterministes par (perso,
 * palier) pour qu'un rafraîchissement d'écran ne relance pas les dés.
 */
export function rewardOptionsFor(charId: string, level: number): [CardId, CardId] {
  const pool = CARD_POOL.map(c => c.id)
  const a = hash(`${charId}:${level}:a`) % pool.length
  let b = hash(`${charId}:${level}:b`) % pool.length
  if (b === a) b = (b + 1) % pool.length
  return [pool[a], pool[b]]
}

export interface PendingReward {
  level: number
  options: [CardId, CardId]
}

/** Récompense de palier en attente (une à la fois, dans l'ordre des paliers). */
export function pendingReward(charId: string): PendingReward | null {
  const p = getProgress(charId)
  const claimed = p.lastRewardLevel ?? 0
  const level = bondLevelFor(charId)
  if (level <= claimed) return null
  const next = claimed + 1
  return { level: next, options: rewardOptionsFor(charId, next) }
}

/** Le joueur garde une des deux cartes : +1 copie dans le deck de ce perso. */
export function claimReward(charId: string, cardId: CardId): boolean {
  const map = readJson<ProgressMap>(PROG_KEY, {})
  const p = map[charId] ?? { wins: 0, losses: 0 }
  const claimed = p.lastRewardLevel ?? 0
  // Palier + options recalculés depuis `p` (déjà en main) plutôt que via
  // pendingReward(charId), qui relirait et re-parserait PROG_KEY en double
  // (trouvé en audit, 2026-08-16 — sans effet observable, juste du travail
  // en trop à chaque clic de récompense).
  const care = Math.floor(getDesiresFulfilled(charId) / 3)
  const level = bondLevel(p.wins + care)
  if (level <= claimed) return false
  const next = claimed + 1
  const options = rewardOptionsFor(charId, next)
  if (!options.includes(cardId)) return false
  p.extraCopies = [...(p.extraCopies ?? []), cardId]
  p.lastRewardLevel = next
  map[charId] = p
  writeJson(PROG_KEY, map)
  return true
}

export function getExtraCopies(charId: string): CardId[] {
  return getProgress(charId).extraCopies ?? []
}

/** Retourne une copie du perso avec le bonus de Lien appliqué (HRT plafonné à 12). */
export function applyBond(char: Character): Character {
  const level = bondLevelFor(char.id)
  const bonus = bondHrtBonus(level)
  if (bonus === 0) return char
  return {
    ...char,
    stats: { ...char.stats, hrt: Math.min(12, char.stats.hrt + bonus) },
  }
}

// --- Persos créés par prompt : sauvegarde locale ---------------------------

export function loadCustoms(): Character[] {
  const customs = readJson<Character[]>(CUSTOM_KEY, [])
  // Migration : les persos sauvegardés avant l'Ulti n'en ont pas.
  for (const c of customs) {
    if (!c.ulti) {
      c.ulti = {
        name: `${c.special?.name ?? 'Frappe Légendaire'} : Zénith`,
        power: 6.0,
        onomatopoeia: 'KABOOOOM!!!',
      }
    }
  }
  return customs
}

export function saveCustom(char: Character) {
  const customs = loadCustoms().filter(c => c.id !== char.id)
  customs.unshift(char)
  writeJson(CUSTOM_KEY, customs.slice(0, MAX_CUSTOMS))
}
