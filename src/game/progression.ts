import type { Character } from './types'

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

/** Retourne une copie du perso avec le bonus de Lien appliqué (HRT plafonné à 12). */
export function applyBond(char: Character): Character {
  const level = bondLevel(getProgress(char.id).wins)
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
