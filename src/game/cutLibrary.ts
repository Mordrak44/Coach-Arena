import type { Character } from './types'
import type { CutKind } from './cutPlanner'

// Bibliothèque de clips — le pont entre le Séquenceur (QUOI jouer) et de
// VRAIS fichiers vidéo (pas encore produits, voir docs/TEMPLATES_SPEC.md
// et le test bloquant n°1 : swap de paire sur counter-exchange). Tant
// qu'aucun clip n'existe, getClip renvoie toujours null : le lecteur de
// cuts (à brancher côté UI) reste alors silencieux et le rendu vectoriel
// continue, intact — le combat en cuts est un HABILLAGE, jamais une
// dépendance du gameplay (même principe que le mode Cinématique §7).

export interface CutClip {
  url: string
  duration: number
}

export interface CutClipLibrary {
  /** Le clip pour ce type de cut + ces persos (dans l'ordre attendu), ou null si absent. */
  getClip(kind: CutKind, chars: string[]): CutClip | null
}

/** Bibliothèque vide — comportement par défaut tant qu'aucun pipeline n'est branché. */
export const EMPTY_CUT_LIBRARY: CutClipLibrary = {
  getClip: () => null,
}

/**
 * Précharge les clips d'un matchup donné PENDANT le coin du ring : le
 * timer de la phase tactique EST la fenêtre de préchargement (le
 * matchup et les techniques débloquées sont connus à cet instant — le
 * déroulé du round, lui, ne l'est jamais : voir CutSequencer).
 *
 * Stub aujourd'hui (aucun backend/API de swap branché) — résout
 * immédiatement une bibliothèque vide, sans latence ni risque. Le
 * contrat est posé : quand un vrai pipeline existe (Viggle API, cache
 * CDN de templates swappés, ComfyUI auto-hébergé), cette fonction
 * change de CORPS, jamais de SIGNATURE — rien à toucher côté appelant.
 */
export async function prefetchForMatchup(
  _player: Character,
  _enemy: Character,
  _neededKinds: CutKind[],
): Promise<CutClipLibrary> {
  return EMPTY_CUT_LIBRARY
}
