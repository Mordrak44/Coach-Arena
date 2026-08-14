import type { Character, ListenTrait } from './types'

// La Vie d'Écurie — tamagotchi bienveillant (voir GAME_DESIGN.md §4 quater).
// Règle d'or : JAMAIS punitif. L'humeur dérive doucement vers Neutre si on
// ignore le perso ; s'en occuper le rend meilleur. Les actions sont limitées
// à 3 par jour réel : un rituel, pas une corvée.

export type StableAction = 'train' | 'leisure' | 'rest'

export interface StableState {
  /** humeur 0..100 */
  mood: number
  /** actions déjà faites aujourd'hui (max 3) */
  actionsToday: number
  /** clé du jour (YYYY-MM-DD) pour le reset quotidien */
  dayKey: string
  /** dernière mise à jour (ms epoch) pour la dérive d'humeur */
  updatedAt: number
  /** envie active : l'action qui la comble */
  desire: StableAction | null
  /** stat boostée pour le prochain match (consommée au lancement) */
  trainedStat: 'atk' | 'def' | 'spd' | null
  /** envies comblées au total (3 = +1 palier de soin vers le Lien) */
  desiresFulfilled: number
}

export const ACTIONS_PER_DAY = 3
const KEY = 'coach-arena-stable-v1'

const hasStorage = typeof localStorage !== 'undefined'

function readAll(): Record<string, StableState> {
  if (!hasStorage) return {}
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
}

function writeAll(map: Record<string, StableState>) {
  if (!hasStorage) return
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    /* stockage indisponible : l'écurie devient volatile, pas bloquante */
  }
}

function dayKeyOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

function freshState(now: number): StableState {
  return {
    mood: 50,
    actionsToday: 0,
    dayKey: dayKeyOf(now),
    updatedAt: now,
    desire: null,
    trainedStat: null,
    desiresFulfilled: 0,
  }
}

/** Envies possibles par trait — cohérentes avec la personnalité. */
const DESIRES: Record<ListenTrait, Array<{ action: StableAction; text: string }>> = {
  sanguin: [
    { action: 'train', text: 'veut se défouler — entraîne-le !' },
    { action: 'leisure', text: 'veut chasser quelque chose. Un loisir fera l’affaire.' },
  ],
  cerebral: [
    { action: 'rest', text: 'veut du calme et du silence. Laisse-le se reposer.' },
    { action: 'train', text: 'veut perfectionner un détail technique.' },
  ],
  tetu: [
    { action: 'train', text: 'ne demandera jamais rien… mais un entraînement lui ferait du bien.' },
    { action: 'rest', text: 'boude dans son coin. Un peu de repos calmera son ego.' },
  ],
  fusionnel: [
    { action: 'leisure', text: 'veut du temps avec toi, juste vous deux.' },
    { action: 'rest', text: 'veut que tu restes à côté pendant qu’il récupère.' },
  ],
}

export function desireText(char: Character, state: StableState): string | null {
  if (!state.desire) return null
  const pool = DESIRES[char.trait].filter(d => d.action === state.desire)
  return pool.length ? `${char.name} ${pool[0].text}` : null
}

/** Charge l'état d'écurie d'un perso, en appliquant dérive douce + reset du jour + envie. */
export function getStable(charId: string, trait: ListenTrait, now = Date.now()): StableState {
  const all = readAll()
  const existed = charId in all
  const s = all[charId] ?? freshState(now)
  let changed = !existed
  // Première rencontre : le perso arrive avec une envie du jour.
  if (!existed) {
    const pool = DESIRES[trait]
    s.desire = pool[Math.floor(Math.random() * pool.length)].action
  }

  // Dérive DOUCE vers Neutre (50) : 4 points par jour d'absence, jamais en dessous.
  const days = Math.floor((now - s.updatedAt) / 86_400_000)
  if (days > 0 && s.mood !== 50) {
    const drift = Math.min(days * 4, Math.abs(s.mood - 50))
    s.mood += s.mood > 50 ? -drift : drift
    s.updatedAt = now
    changed = true
  }

  // Nouveau jour : les actions se rechargent, et une envie (au plus une par
  // jour) peut naître. Une envie comblée ne renaît PAS dans la journée —
  // sinon le « c'était exactement ce qu'il voulait » est aussitôt remplacé
  // par une nouvelle exigence.
  if (s.dayKey !== dayKeyOf(now)) {
    s.dayKey = dayKeyOf(now)
    s.actionsToday = 0
    if (!s.desire) {
      const pool = DESIRES[trait]
      s.desire = pool[Math.floor(Math.random() * pool.length)].action
    }
    changed = true
  }

  // Écriture uniquement si quelque chose a changé : getStable est appelé
  // pendant le rendu React, un write systématique y serait un effet de bord.
  if (changed) {
    all[charId] = s
    writeAll(all)
  }
  return s
}

export interface ActionResult {
  ok: boolean
  message: string
  fulfilledDesire: boolean
}

/** Effectue une action d'écurie. Tout est bonus — l'échec n'existe pas, seule la limite du jour. */
export function doStableAction(
  charId: string,
  trait: ListenTrait,
  action: StableAction,
  trainStat: 'atk' | 'def' | 'spd' = 'atk',
  now = Date.now(),
): ActionResult {
  const all = readAll()
  const s = all[charId] ?? freshState(now)
  if (s.dayKey !== dayKeyOf(now)) {
    s.dayKey = dayKeyOf(now)
    s.actionsToday = 0
  }
  if (s.actionsToday >= ACTIONS_PER_DAY) {
    return { ok: false, message: 'Il a eu sa journée — reviens demain !', fulfilledDesire: false }
  }
  s.actionsToday++

  const fulfilled = s.desire === action
  let message: string
  switch (action) {
    case 'train':
      s.trainedStat = trainStat
      s.mood = Math.min(100, s.mood + 5)
      message = `Entraînement ${trainStat.toUpperCase()} : +1 ${trainStat.toUpperCase()} au prochain match.`
      break
    case 'leisure':
      s.mood = Math.min(100, s.mood + 10)
      message = 'Un bon moment ensemble. Son humeur remonte.'
      break
    case 'rest':
      s.mood = Math.min(100, s.mood + 8)
      message = 'Il récupère, apaisé.'
      break
  }
  if (fulfilled) {
    s.mood = Math.min(100, s.mood + 10)
    s.desire = null
    s.desiresFulfilled++
    message += ' 💖 C’était exactement ce dont il avait envie !'
  }
  s.updatedAt = now
  all[charId] = s
  writeAll(all)
  return { ok: true, message, fulfilledDesire: fulfilled }
}

/** Résultat de match → humeur (le sport, pas la punition d'absence). */
export function recordMatchMood(charId: string, won: boolean, now = Date.now()): void {
  const all = readAll()
  const s = all[charId] ?? freshState(now)
  s.mood = won ? Math.min(100, s.mood + 8) : Math.max(10, s.mood - 5)
  s.updatedAt = now
  all[charId] = s
  writeAll(all)
}

/** Consomme le boost d'entraînement (une seule fois, au lancement du match). */
export function consumeTraining(charId: string): 'atk' | 'def' | 'spd' | null {
  const all = readAll()
  const s = all[charId]
  if (!s?.trainedStat) return null
  const stat = s.trainedStat
  s.trainedStat = null
  writeAll(all)
  return stat
}

export function moodInfo(mood: number): { label: string; icon: string } {
  if (mood >= 75) return { label: 'Radieux', icon: '🤩' }
  if (mood >= 50) return { label: 'Bien', icon: '🙂' }
  if (mood >= 25) return { label: 'Neutre', icon: '😐' }
  return { label: 'Boudeur', icon: '😾' }
}

/** Hype de départ conférée par l'humeur (léger, jamais décisif seul). */
export function moodStartHype(mood: number): number {
  if (mood >= 75) return 15
  if (mood >= 50) return 5
  return 0
}

/** Humeur basse : le premier ordre du match est ignoré (comme un Têtu passager). */
export function moodIgnoresFirstOrder(mood: number): boolean {
  return mood < 25
}
