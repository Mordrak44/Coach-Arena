// Premiers pas — deux courtes bulles d'aide montrées UNE SEULE FOIS dans
// la vie du joueur (localStorage), pour réduire le décrochage des
// arrivées TikTok qui ne savent pas encore qu'on parle à son perso.
// Jamais punitif, jamais bloquant : un joueur pressé peut les fermer
// immédiatement, elles ne reviennent plus jamais après.

const KEY = 'coach-arena-onboarding-v1'
const hasStorage = typeof localStorage !== 'undefined'

interface Seen {
  combat?: boolean
  corner?: boolean
}

function load(): Seen {
  if (!hasStorage) return {}
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    // JSON.parse('null') = null SANS exception — load() le renverrait tel
    // quel, et l'accès à `.combat`/`.corner` a lieu chez l'APPELANT
    // (hasSeenCombatHint), hors de ce try/catch : un stockage corrompu par
    // la chaîne "null" aurait planté le tout premier rendu d'ArenaScreen
    // (appelé en synchrone dans ses useState/useRef initiaux) — trouvé en
    // balayant tous les `JSON.parse` du dépôt après le 3e bug de cette
    // famille en autant de jours (stable.ts, deckBuilder.ts, story.ts).
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Seen) : {}
  } catch {
    return {}
  }
}

function save(s: Seen): void {
  if (!hasStorage) return
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* stockage indisponible */
  }
}

export function hasSeenCombatHint(): boolean {
  return !!load().combat
}

export function markCombatHintSeen(): void {
  const s = load()
  if (s.combat) return
  save({ ...s, combat: true })
}

export function hasSeenCornerHint(): boolean {
  return !!load().corner
}

export function markCornerHintSeen(): void {
  const s = load()
  if (s.corner) return
  save({ ...s, corner: true })
}
