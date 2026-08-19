import type { CombatEvent, MatchState } from './types'

// Le commentateur shōnen — narration locale par templates (v0 du mode
// cinématique). Chaque ligne est datée et conservée : elle nourrira les
// prompts des scènes générées et le montage final.
// v1 : remplacé/enrichi par l'API Claude (voir ROADMAP).

export interface CommentLine {
  t: number
  text: string
  /** importance 1-3 : pilote la taille/durée d'affichage */
  weight: 1 | 2 | 3
}

// {P} = perso joueur, {E} = adversaire, {W}/{L} = vainqueur/perdant du
// moment, {S} = nom de technique, {r} = numéro de round, {dmg} = dégâts.

const T = {
  roundStart: [
    'ROUND {r} !! Le gong retentit !',
    'Round {r} — les coachs hurlent déjà !',
    "C'est reparti ! Round {r} !",
  ],
  crit: [
    'QUEL COUP !! {E} part en vrille !',
    'Impact MONSTRUEUX de {P} !!',
    'Ça, ça se ressentira demain matin !!',
    '{P} frappe comme un train lancé !!',
  ],
  critTaken: [
    'AÏE !! {P} encaisse un coup terrible !',
    '{E} traverse la garde de {P} !!',
    'Le coach de {P} doit réagir, et VITE !',
  ],
  dodge: [
    'Trop lent ! {D} n’est déjà plus là !',
    '{D} danse entre les coups !',
    'Esquive de fantôme signée {D} !',
  ],
  block: ['Garde de fer de {D} !', '{D} encaisse sans broncher !'],
  counter: [
    'CONTRE !!! La leçon est magistrale !',
    'Il/elle l’attendait depuis le début !! CONTRE !',
    'PIÈGE ! {C} renverse tout sur un contre !',
  ],
  special: [
    'INCROYABLE !! {A} déchaîne {S} !!',
    '{S} !!! L’arène tremble !!',
    'LA TECHNIQUE SECRÈTE : {S} !!',
  ],
  hypeFull: [
    'La jauge de {W} EXPLOSE ! Le spécial est prêt !',
    '{W} brûle d’énergie — coach, c’est le moment !',
  ],
  ultiReady: [
    'L’AURA DE {W} DEVIENT ÉCARLATE… L’ULTIME EST PRÊT !!',
    'Tout le stade le sent : {W} peut TOUT finir, là, maintenant !',
  ],
  ulti: [
    'ÇA NE SE PRODUIT QU’UNE FOIS PAR MATCH !!! {S} !!!',
    'L’ARÈNE S’EFFONDRE !! {A} LIBÈRE {S} !!!',
  ],
  confused: [
    '{W} ne sait plus qui écouter… le coin s’emmêle !',
    'Trop d’ordres ! {W} est perdu(e) !',
  ],
  card: ['Le coin de {P} joue « {S} » !', 'Carte sur le ring : « {S} » !'],
  cardAdverse: ['Le coin de {E} riposte avec « {S} » !', 'Carte adverse sur le ring : « {S} » !'],
  switch: ['{N} monte sur le ring !', 'Relève ! {N} entre dans la bataille !'],
  timeout: [
    "TEMPS MORT ! Le coin de {W} s'arrête pour réfléchir…",
    '{W} appelle le temps mort — moment stratégique !',
  ],
  roundEndWin: [
    'Le round est pour {P} !! Le coaching paie !',
    '{P} prend le round — quelle gestion du coin !',
  ],
  roundEndLose: [
    '{E} prend ce round… il faut ajuster le plan, coach !',
    'Round pour {E}. Rien n’est perdu, mais ça se complique !',
  ],
  matchEndWin: ['C’EST TERMINÉ !! {P} L’EMPORTE !! QUEL MATCH !!'],
  matchEndLose: ['Fin du combat… {E} s’impose. {P} reviendra plus fort.'],
} as const

export class Commentator {
  lines: CommentLine[] = []
  private lastEventIndex = 0
  private lastCommentAt = -10
  private lastTemplate = ''
  private rng = () => Math.random()

  /** Consomme les nouveaux events et produit éventuellement une ligne. */
  ingest(m: MatchState): CommentLine | null {
    let produced: CommentLine | null = null
    for (; this.lastEventIndex < m.events.length; this.lastEventIndex++) {
      const line = this.comment(m, m.events[this.lastEventIndex])
      if (line) produced = line
    }
    return produced
  }

  recent(n: number): CommentLine[] {
    return this.lines.slice(-n)
  }

  private pick(pool: readonly string[]): string {
    let text = pool[Math.floor(this.rng() * pool.length)]
    if (pool.length > 1 && text === this.lastTemplate) {
      text = pool[(pool.indexOf(text) + 1) % pool.length]
    }
    this.lastTemplate = text
    return text
  }

  private emit(m: MatchState, template: string, weight: 1 | 2 | 3, vars: Record<string, string>): CommentLine {
    let text = template
    for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(v)
    const line: CommentLine = { t: m.t, text, weight }
    this.lines.push(line)
    this.lastCommentAt = m.t
    return line
  }

  private comment(m: MatchState, ev: CombatEvent): CommentLine | null {
    const P = m.player.char.name
    const E = m.enemy.char.name
    const base = { P, E, r: String(m.round) }
    // Les événements mineurs respectent un temps de silence ; les majeurs parlent toujours.
    const quiet = m.t - this.lastCommentAt < 3

    switch (ev.kind) {
      case 'roundStart':
        return this.emit(m, this.pick(T.roundStart), 2, base)
      case 'hit':
        if (!ev.crit || quiet) return null
        return ev.target === 'enemy'
          ? this.emit(m, this.pick(T.crit), 2, base)
          : this.emit(m, this.pick(T.critTaken), 2, base)
      case 'dodged':
        if (quiet) return null
        return this.emit(m, this.pick(T.dodge), 1, { ...base, D: ev.target === 'player' ? P : E })
      case 'blocked':
        if (quiet) return null
        return this.emit(m, this.pick(T.block), 1, { ...base, D: ev.target === 'player' ? P : E })
      case 'countered':
        return this.emit(m, this.pick(T.counter), 2, { ...base, C: ev.by === 'player' ? P : E })
      case 'special':
        return this.emit(m, this.pick(T.special), 3, {
          ...base,
          A: ev.by === 'player' ? P : E,
          S: ev.name,
        })
      case 'hypeFull':
        return this.emit(m, this.pick(T.hypeFull), 2, { ...base, W: ev.who === 'player' ? P : E })
      case 'ultiReady':
        return this.emit(m, this.pick(T.ultiReady), 3, { ...base, W: ev.who === 'player' ? P : E })
      case 'ulti':
        return this.emit(m, this.pick(T.ulti), 3, {
          ...base,
          A: ev.by === 'player' ? P : E,
          S: ev.name,
        })
      case 'confused':
        return this.emit(m, this.pick(T.confused), 1, { ...base, W: ev.who === 'player' ? P : E })
      case 'card': {
        // L'event 'card' n'a PAS de champ `side` (types.ts) — le coin
        // adverse encode ça dans `name` lui-même, en suffixe (« (coin
        // adverse) » / « (temps mort adverse) », voir combat.ts), même
        // convention déjà utilisée par ArenaScreen.tsx pour la visio des
        // coachs. Sans cette détection, TOUTE carte adverse était narrée
        // « Le coin de {P} joue… » — créditant le joueur d'un coup de
        // l'IA, alors que `name` disait explicitement le contraire
        // (trouvé en audit, 2026-08-18).
        const adverse = ev.name.includes('adverse')
        const label = adverse
          ? ev.name.replace(' (coin adverse)', '').replace(' (temps mort adverse)', '')
          : ev.name
        return this.emit(m, this.pick(adverse ? T.cardAdverse : T.card), 1, { ...base, S: label })
      }
      case 'cardProc':
        // Texte déjà entièrement écrit par combat.ts (FRÉNÉSIE, CONTRE
        // PARFAIT, CŒUR VAILLANT, DERNIÈRE CHANCE, LEÇON D'EXPÉRIENCE,
        // CRI DE GUERRE, Souffle volé…) — pas de gabarit à tirer, ce
        // `case` manquait entièrement et chacun de ces coups de théâtre
        // ne produisait aucun commentaire (trouvé en audit, 2026-08-18).
        return this.emit(m, ev.text, 2, base)
      case 'trait':
        // Idem : « X T'IGNORE… », « X BOUDE… », « X EST PROVOQUÉ·E ! »,
        // « TROP DE BRUIT… » — le moment où un ordre du coach est
        // silencieusement rejeté par la personnalité du perso méritait
        // justement une explication à l'écran, jamais donnée jusqu'ici.
        return quiet ? null : this.emit(m, ev.text, 1, base)
      case 'switch':
        return this.emit(m, this.pick(T.switch), 2, { ...base, N: ev.name })
      case 'timeout':
        return this.emit(m, this.pick(T.timeout), 2, { ...base, W: ev.side === 'player' ? P : E })
      case 'roundEnd':
        return this.emit(
          m,
          this.pick(ev.winner === 'player' ? T.roundEndWin : T.roundEndLose),
          3,
          base,
        )
      case 'matchEnd':
        return this.emit(
          m,
          this.pick(ev.winner === 'player' ? T.matchEndWin : T.matchEndLose),
          3,
          base,
        )
      default:
        return null
    }
  }
}
