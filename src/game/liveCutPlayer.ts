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

/**
 * Retard maximum toléré dans la file, en somme des durées des cuts en
 * attente (secondes) — pas un nombre d'entrées : un seul événement peut
 * légitimement pousser plusieurs cuts d'un coup (ex. un 'hit' produit
 * attack-solo + impact-flash + hit-reaction). Trimmer par LONGUEUR
 * (ancien MAX_QUEUE=1) sabrait ces séquences dès leur naissance, même
 * sans aucun retard réel (trouvé en audit, 2026-08-16).
 */
export const MAX_QUEUE_LAG_S = 2.5

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

  /**
   * Remplace la bibliothèque après coup — utile car prefetchForMatchup()
   * est async (préchargement pendant le coin du ring) alors que le
   * lecteur, lui, doit exister dès la création du match.
   */
  setLibrary(library: CutClipLibrary): void {
    this.library = library
  }

  /** À appeler à chaque tick avec l'état de match courant. */
  update(m: MatchState): void {
    let freshCount = 0
    for (const cut of this.sequencer.ingest(m)) {
      const clip = this.library.getClip(cut.kind, cut.chars)
      if (clip) {
        this.queue.push({ cut, clip })
        freshCount++
      }
      // Pas de clip prêt : silence — aucune trace, le vectoriel comble l'instant.
    }
    // Garde-fou : jamais de retard qui s'accumule au-delà d'un budget de
    // DURÉE — on saute les plus vieux jusqu'à repasser sous le budget,
    // sans jamais sabrer une séquence fraîche d'un seul event (voir
    // MAX_QUEUE_LAG_S). `removable` borne le nombre de cuts PRÉEXISTANTS
    // (potentiellement périmés) qu'on peut encore retirer, sans jamais
    // mordre sur le lot tout juste ingéré CETTE frame (`freshCount`) —
    // sans cette borne, la boucle sabrait déjà le PREMIER cut d'un event
    // fraîchement ingéré dès que la somme de SES PROPRES cuts dépassait
    // le budget à elle seule (un crit 'hit' : 1,2+0,3+0,9+0,8 = 3,2 s >
    // 2,5 s ; un 'special' : 3,3 s ; un 'ulti' : 5,2 s — voir
    // cutsForEvent() dans cutPlanner.ts) : exactement ce que ce garde-fou
    // prétend empêcher selon son propre commentaire, un crit/spécial/
    // Ulti perdant systématiquement son plan-titre (attack-solo/
    // special-cast/ulti-cast) dès sa toute première apparition, SANS le
    // moindre retard réel accumulé (trouvé en audit, 2026-08-20 — la
    // même famille de bug que le garde-fou par LONGUEUR déjà remplacé le
    // 2026-08-16, resurgie via ce nouveau garde-fou par durée).
    let removable = this.queue.length - freshCount
    while (
      removable > 0 &&
      this.queue.length > 1 &&
      this.queue.reduce((sum, q) => sum + q.cut.duration, 0) > MAX_QUEUE_LAG_S
    ) {
      this.queue.shift()
      removable--
    }

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
