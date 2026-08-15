import type { Character, MatchState } from './types'
import { CutSequencer, idleLoopCut, type Cut } from './cutPlanner'
import { EMPTY_CUT_LIBRARY, type CutClip, type CutClipLibrary } from './cutLibrary'

// Le lecteur de cuts EN DIRECT — respecte la règle posée dans
// TEMPLATES_SPEC.md : un cut n'illustre jamais qu'un instant déjà résolu
// par la simulation, donc peut s'afficher PENDANT le round sans jamais
// bloquer la voix du coach (tick() tourne indépendamment de ce qui est
// montré). Garde-fou : la file n'accumule jamais de retard — un cut trop
// vieux est sauté au profit du plus récent, pour ne jamais paraître
// décroché de la réalité.
//
// Tant que `library` ne renvoie aucun clip (EMPTY_CUT_LIBRARY, le cas
// aujourd'hui), current() reste toujours null : le rendu vectoriel est
// visible en permanence, sans aucun changement de comportement. Câbler
// un <video> par-dessus le canvas dans ArenaScreen est le travail
// restant, mécanique, le jour où de vrais clips existent.

/** Cuts en attente au-delà de cette taille : les plus vieux sont sautés. */
export const MAX_QUEUE = 1

export interface ActiveCut {
  cut: Cut
  url: string
  /** horloge de match (m.t) à laquelle ce cut se termine */
  until: number
}

interface QueuedCut {
  cut: Cut
  clip: CutClip
}

export class LiveCutPlayer {
  private sequencer: CutSequencer
  private queue: QueuedCut[] = []
  private active: ActiveCut | null = null

  constructor(
    player: Character,
    enemy: Character,
    private library: CutClipLibrary = EMPTY_CUT_LIBRARY,
  ) {
    this.sequencer = new CutSequencer(player, enemy)
  }

  /** À appeler à chaque tick avec l'état de match courant. */
  update(m: MatchState): void {
    for (const cut of this.sequencer.ingest(m)) {
      const clip = this.library.getClip(cut.kind, cut.chars)
      if (clip) this.queue.push({ cut, clip })
      // Pas de clip prêt : silence — aucune trace, le vectoriel comble l'instant.
    }
    // Garde-fou : jamais de retard qui s'accumule — on saute les plus vieux.
    while (this.queue.length > MAX_QUEUE) this.queue.shift()

    if (this.active && m.t >= this.active.until) this.active = null
    if (!this.active && this.queue.length > 0) {
      const { cut, clip } = this.queue.shift()!
      this.active = { cut, url: clip.url, until: m.t + cut.duration }
    }
    // File vide, round toujours en cours : sans ça, le SILENCE entre deux
    // événements résolus resterait un trou vidéo (voir CutKind.idle-loop).
    // Bibliothèque vide aujourd'hui → getClip renvoie null → aucun effet.
    if (!this.active && this.queue.length === 0 && m.phase === 'fighting') {
      const { player, enemy } = this.sequencer.activeNames()
      const cut = idleLoopCut(player, enemy, m.t)
      const clip = this.library.getClip(cut.kind, cut.chars)
      if (clip) this.active = { cut, url: clip.url, until: m.t + cut.duration }
    }
  }

  /** Le clip à afficher maintenant, ou null (le vectoriel doit alors être visible). */
  current(): ActiveCut | null {
    return this.active
  }
}
