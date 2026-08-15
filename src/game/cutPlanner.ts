import type { Character, CombatEvent, MatchState } from './types'

// Le Séquenceur de cuts — convertit les événements d'un match en EDL
// (edit decision list) : la liste ordonnée des cuts vidéo à jouer, avec
// pour chacun le TEMPLATE à utiliser, les persos à y swapper et
// l'habillage (onomatopées, noms de techniques).
//
// RÈGLE (voir TEMPLATES_SPEC.md, 2026-08-15) : ce qui gouverne l'usage
// vidéo n'est pas « pendant vs après le round », c'est « l'événement
// est-il déjà résolu par la simulation ? ». tick() tourne en continu,
// indépendamment du rendu — un ordre du coach est traité immédiatement
// par la simulation, jamais bloqué par un cut en cours. Un cut illustre
// TOUJOURS un instant déjà tranché (un coup qui a touché, un contre qui
// est tombé) — jamais une décision encore ouverte. La vidéo est donc
// AUTORISÉE pendant le round, sur tout événement déjà résolu ; seul
// l'état d'ATTENTE continu entre deux événements doit rester du temps
// réel (rien n'y est encore décidé). Un futur lecteur en direct DOIT
// pouvoir sauter un cut en retard si la file s'accumule (jamais plus
// d'un battement de décalage avec la réalité).
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
  | 'idle-loop' // les deux persos en garde, plan large — comble l'ATTENTE
  // continue entre deux événements résolus (pas déclenché par un event :
  // rien n'y est encore tranché). C'est le seul cut que le vectoriel
  // remplace « gratuitement » aujourd'hui en rendant en continu ; sans
  // lui, du 100 % vidéo laisserait un trou à chaque silence du combat.
  // Demandé explicitement par le LECTEUR (jamais par cutsForEvent) via
  // idleLoopCut() — voir CutSequencer.activeNames().

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
  'idle-loop': 2,
}

/** Durée cible d'une boucle d'attente (voir CutKind.idle-loop). */
export const IDLE_LOOP_DURATION = 2

/**
 * Cut d'attente à la demande du LECTEUR — jamais produit par
 * cutsForEvent (rien n'y est résolu par la simulation, ce n'est pas un
 * événement). À utiliser quand la file du lecteur est vide ET que le
 * round tourne toujours, pour que la vidéo comble le même silence que le
 * vectoriel comble aujourd'hui gratuitement.
 */
export function idleLoopCut(player: string, enemy: string, t: number): Cut {
  return { kind: 'idle-loop', chars: [player, enemy], t, duration: IDLE_LOOP_DURATION }
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
 * Consommation INCRÉMENTALE des cuts, événement par événement — la
 * pièce destinée à un futur LECTEUR DE CUTS EN DIRECT, pendant que le
 * round se joue (voir la règle en tête de fichier : autorisé, car
 * chaque cut illustre un instant déjà résolu par la simulation, jamais
 * une décision encore ouverte). Même contrat que
 * ArenaRenderer.ingestEvents : ne renvoie que les cuts NOUVEAUX depuis
 * le dernier appel — au futur lecteur de respecter le garde-fou de file
 * bornée (sauter un cut en retard plutôt que de prendre du retard sur
 * la réalité).
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

  /** Qui est actuellement à l'écran (après relèves) — pour un cut d'attente. */
  activeNames(): { player: string; enemy: string } {
    return { ...this.active }
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
