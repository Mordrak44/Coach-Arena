import type { Character, CombatEvent, MatchState } from './types'

// Le Séquenceur de cuts — convertit les événements d'un match en EDL
// (edit decision list) : la liste ordonnée des cuts vidéo à jouer, avec
// pour chacun le TEMPLATE à utiliser, les persos à y swapper et
// l'habillage (onomatopées, noms de techniques). C'est le contrat entre
// le moteur (qui émet des événements) et le futur lecteur de cuts /
// pipeline d'assets (voir GAME_DESIGN — « le combat en cuts »).
//
// Grammaire anime : les cuts solo ne montrent qu'UN perso (banque par
// perso, pré-générée) ; les échanges à deux (counter, faceoff) sont des
// templates swappés PAR MATCHUP (cache par paire) ; les flashs d'impact
// et plans de foule sont des templates neutres, sans swap.

export type CutKind =
  | 'intro-faceoff' // échange : les deux persos, staredown
  | 'attack-solo' // l'attaquant frappe (gros plan)
  | 'impact-flash' // flash d'impact plein écran (neutre, aucun swap)
  | 'hit-reaction' // le défenseur encaisse (contrechamp)
  | 'dodge-solo' // esquive
  | 'block-solo' // garde
  | 'counter-exchange' // échange à deux : le contre complet
  | 'special-cast' // le spécial du perso (template + FX à ses couleurs)
  | 'ulti-cast' // template d'Ulti swappé (collection)
  | 'ko-down' // le perdant s'effondre (slow-motion)
  | 'victory-pose' // le vainqueur célèbre
  | 'crowd' // plan de foule (neutre)

export interface Cut {
  kind: CutKind
  /** noms des persos à swapper dans le template (0, 1 ou 2) */
  chars: string[]
  /** habillage : onomatopée, nom de technique, dégâts… */
  overlay?: string
  /** horodatage de l'événement source dans le match (s) */
  t: number
  /** durée cible du cut (s) */
  duration: number
}

/** Combien de persos chaque type de template doit savoir swapper. */
export const TEMPLATE_CHARS: Record<CutKind, 0 | 1 | 2> = {
  'intro-faceoff': 2,
  'attack-solo': 1,
  'impact-flash': 0,
  'hit-reaction': 1,
  'dodge-solo': 1,
  'block-solo': 1,
  'counter-exchange': 2,
  'special-cast': 1,
  'ulti-cast': 1,
  'ko-down': 1,
  'victory-pose': 1,
  crowd: 0,
}

/** Importance d'un événement pour la sélection du montage. */
function eventScore(e: CombatEvent): number {
  switch (e.kind) {
    case 'ulti':
      return 10
    case 'special':
      return 7
    case 'countered':
      return 5
    case 'hit':
      return e.crit ? 4 : 1
    case 'dodged':
      return 2
    case 'blocked':
      return 1.5
    default:
      return 0
  }
}

/** Cuts produits par un événement de combat (grammaire du découpage). */
export function cutsForEvent(e: CombatEvent, nameOf: (side: 'player' | 'enemy') => string): Cut[] {
  switch (e.kind) {
    case 'hit': {
      const attacker = nameOf(e.target === 'player' ? 'enemy' : 'player')
      const defender = nameOf(e.target)
      const cuts: Cut[] = [
        { kind: 'attack-solo', chars: [attacker], t: e.t, duration: 1.2 },
        { kind: 'impact-flash', chars: [], overlay: e.onoma, t: e.t, duration: 0.3 },
        { kind: 'hit-reaction', chars: [defender], overlay: `-${e.dmg}`, t: e.t, duration: 0.9 },
      ]
      if (e.crit) cuts.push({ kind: 'crowd', chars: [], t: e.t, duration: 0.8 })
      return cuts
    }
    case 'dodged':
      return [
        { kind: 'attack-solo', chars: [nameOf(e.target === 'player' ? 'enemy' : 'player')], t: e.t, duration: 1 },
        { kind: 'dodge-solo', chars: [nameOf(e.target)], overlay: 'SWOOSH', t: e.t, duration: 0.9 },
      ]
    case 'blocked':
      return [{ kind: 'block-solo', chars: [nameOf(e.target)], overlay: 'GUARD!', t: e.t, duration: 0.9 }]
    case 'countered':
      return [
        {
          kind: 'counter-exchange',
          chars: [nameOf(e.by === 'player' ? 'enemy' : 'player'), nameOf(e.by)],
          overlay: 'CONTRE !!',
          t: e.t,
          duration: 2.2,
        },
      ]
    case 'special':
      return [
        { kind: 'special-cast', chars: [nameOf(e.by)], overlay: `${e.name} — ${e.onoma}`, t: e.t, duration: 2.4 },
        { kind: 'hit-reaction', chars: [nameOf(e.by === 'player' ? 'enemy' : 'player')], overlay: `-${e.dmg}`, t: e.t, duration: 0.9 },
      ]
    case 'ulti':
      return [
        { kind: 'ulti-cast', chars: [nameOf(e.by)], overlay: `★ ${e.name} ★ ${e.onoma}`, t: e.t, duration: 3.2 },
        { kind: 'hit-reaction', chars: [nameOf(e.by === 'player' ? 'enemy' : 'player')], overlay: `-${e.dmg}`, t: e.t, duration: 1 },
        { kind: 'crowd', chars: [], t: e.t, duration: 1 },
      ]
    default:
      return []
  }
}

/**
 * Construit l'EDL du montage d'un match TERMINÉ : intro, meilleurs
 * moments de chaque round (budget de cuts par round), finale.
 * `playerName`/`enemyName` = combattants INITIAUX ; les relèves (events
 * `switch`) sont rejouées pour attribuer chaque cut au bon perso.
 */
export function planCuts(
  m: MatchState,
  player: Character,
  enemy: Character,
  maxEventsPerRound = 5,
): Cut[] {
  const active = { player: player.name, enemy: enemy.name }
  const nameOf = (side: 'player' | 'enemy') => active[side]

  const cuts: Cut[] = [
    { kind: 'intro-faceoff', chars: [player.name, enemy.name], t: 0, duration: 3 },
    { kind: 'crowd', chars: [], t: 0, duration: 1 },
  ]

  // Sélection par round : on garde les maxEventsPerRound mieux notés,
  // rejoués dans l'ordre chronologique.
  let roundEvents: CombatEvent[] = []
  const flushRound = () => {
    const kept = [...roundEvents]
      .sort((a, b) => eventScore(b) - eventScore(a))
      .slice(0, maxEventsPerRound)
      .sort((a, b) => a.t - b.t)
    for (const e of kept) cuts.push(...cutsForEvent(e, nameOf))
    roundEvents = []
  }

  for (const e of m.events) {
    if (e.kind === 'switch') {
      // La relève change QUI est à l'écran pour les cuts suivants.
      flushRound() // les events d'avant la relève appartiennent à l'ancien actif
      active[e.side] = e.name
      continue
    }
    if (e.kind === 'roundEnd') {
      flushRound()
      const loser = nameOf(e.winner === 'player' ? 'enemy' : 'player')
      cuts.push({ kind: 'ko-down', chars: [loser], t: e.t, duration: 2 })
      continue
    }
    if (e.kind === 'matchEnd') {
      flushRound()
      const winner = nameOf(e.winner)
      cuts.push(
        { kind: 'victory-pose', chars: [winner], t: e.t, duration: 2.5 },
        { kind: 'crowd', chars: [], t: e.t, duration: 1.2 },
      )
      continue
    }
    if (eventScore(e) > 0) roundEvents.push(e)
  }
  flushRound()
  return cuts
}

/**
 * Consommation INCRÉMENTALE des cuts, événement par événement — le
 * lecteur de cuts EN DIRECT pendant le round, par opposition à planCuts
 * (qui monte un récap a posteriori sur tout le match terminé). Même
 * contrat que ArenaRenderer.ingestEvents : ne renvoie que les cuts
 * NOUVEAUX depuis le dernier appel.
 *
 * C'est la pièce qui garde le combat en cuts fidèle au principe fondateur
 * (§7 GAME_DESIGN) : un cut illustre un événement qui vient RÉELLEMENT
 * de se produire dans la simulation — il ne remplace jamais la décision
 * du coach par une vidéo déjà jouée d'avance. Le préchargement pendant
 * le coin du ring (voir cutLibrary.ts) porte sur le matchup et les
 * techniques débloquées, JAMAIS sur le déroulé du round à venir : ça,
 * personne ne le connaît avant que le coach n'agisse.
 */
export class CutSequencer {
  private lastEventIndex = 0
  private active: { player: string; enemy: string }

  constructor(player: Character, enemy: Character) {
    this.active = { player: player.name, enemy: enemy.name }
  }

  /** Cuts apparus depuis le dernier appel — à transmettre tels quels au lecteur. */
  ingest(m: MatchState): Cut[] {
    const out: Cut[] = []
    for (; this.lastEventIndex < m.events.length; this.lastEventIndex++) {
      const e = m.events[this.lastEventIndex]
      if (e.kind === 'switch') {
        // La relève change QUI sera swappé dans les cuts suivants — ce
        // n'est pas elle-même un moment filmable (pas de cut associé).
        this.active[e.side] = e.name
        continue
      }
      out.push(...cutsForEvent(e, side => this.active[side]))
    }
    return out
  }
}

/**
 * Cahier des charges dérivé d'une EDL : quels templates produire, pour
 * combien de persos, et combien de fois ils servent — la liste de courses
 * du pipeline d'assets.
 */
export function templateShoppingList(cuts: Cut[]): Array<{ kind: CutKind; chars: number; uses: number }> {
  const counts = new Map<CutKind, number>()
  for (const c of cuts) counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1)
  return [...counts.entries()]
    .map(([kind, uses]) => ({ kind, chars: TEMPLATE_CHARS[kind], uses }))
    .sort((a, b) => b.uses - a.uses)
}
