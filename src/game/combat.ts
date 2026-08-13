import type {
  Character,
  CoachCommand,
  CoachInput,
  CombatEvent,
  FighterState,
  MatchState,
  Stance,
  TacticPlan,
} from './types'

// ---------------------------------------------------------------------------
// Constantes d'équilibrage
// ---------------------------------------------------------------------------

export const ROUND_TIME_LIMIT = 60 // s ; au-delà, le round va au plus haut % de PV
export const INTRO_DURATION = 3
export const ROUND_END_DURATION = 3.5
export const TACTICS_DURATION = 20
export const HYPE_MAX = 100
export const CONFUSION_ORDER_WINDOW = 2 // s : deux ordres à moins de 2 s = confusion
export const CONFUSION_DURATION = 3

const STANCE_MODS: Record<Stance, { atk: number; def: number; dodge: number }> = {
  neutral: { atk: 1, def: 1, dodge: 0.08 },
  aggressive: { atk: 1.45, def: 0.7, dodge: 0.05 },
  defensive: { atk: 0.65, def: 1.6, dodge: 0.1 },
  evasive: { atk: 0.8, def: 0.9, dodge: 0.32 },
  counter: { atk: 0.9, def: 1.1, dodge: 0.1 },
}

const PLAN_EFFECTS: Record<TacticPlan, { stance: Stance; atk: number; def: number; healPct: number; hypeKeep: number }> = {
  pressure: { stance: 'aggressive', atk: 1.12, def: 1, healPct: 0.06, hypeKeep: 0.5 },
  concrete: { stance: 'defensive', atk: 1, def: 1.15, healPct: 0.1, hypeKeep: 0.5 },
  counterplay: { stance: 'counter', atk: 1.06, def: 1.06, healPct: 0.06, hypeKeep: 0.5 },
  coldblood: { stance: 'neutral', atk: 1, def: 1, healPct: 0.16, hypeKeep: 1.0 },
}

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

function makeFighter(char: Character, side: 'player' | 'enemy'): FighterState {
  return {
    char,
    hp: char.stats.hp,
    maxHp: char.stats.hp,
    hype: 0,
    stance: 'neutral',
    confusedUntil: 0,
    counterUntil: 0,
    nextActionAt: 0,
    lastOrderAt: -10,
    x: side === 'player' ? 0.28 : 0.72,
    facing: side === 'player' ? 1 : -1,
    anim: { kind: 'idle', until: 0 },
  }
}

export function createMatch(playerChar: Character, enemyChar: Character): MatchState {
  return {
    player: makeFighter(playerChar, 'player'),
    enemy: makeFighter(enemyChar, 'enemy'),
    round: 1,
    playerWins: 0,
    enemyWins: 0,
    phase: 'intro',
    t: 0,
    phaseUntil: INTRO_DURATION,
    plan: null,
    events: [{ kind: 'roundStart', t: 0, round: 1 }],
  }
}

// ---------------------------------------------------------------------------
// Coaching
// ---------------------------------------------------------------------------

const COMMAND_STANCE: Partial<Record<CoachCommand, Stance>> = {
  attack: 'aggressive',
  defend: 'defensive',
  dodge: 'evasive',
  counter: 'counter',
}

/** Applique une commande du coach au perso joueur. Retourne les events générés. */
function applyCommand(m: MatchState, cmd: CoachCommand): void {
  const f = m.player
  const hrtScale = 0.5 + f.char.stats.hrt / 12 // 0.66..1.5 : le Cœur amplifie tout

  if (cmd === 'cheer') {
    f.hype = Math.min(HYPE_MAX, f.hype + 6 * hrtScale)
    return
  }

  if (cmd === 'special') {
    if (f.hype >= HYPE_MAX && m.t >= f.confusedUntil) {
      fireSpecial(m, 'player')
    }
    return
  }

  // Ordres de posture : détection du spam d'ordres contradictoires.
  if (m.t - f.lastOrderAt < CONFUSION_ORDER_WINDOW && m.t >= f.confusedUntil) {
    f.confusedUntil = m.t + CONFUSION_DURATION
    m.events.push({ kind: 'confused', t: m.t, who: 'player' })
    f.lastOrderAt = m.t
    return
  }
  f.lastOrderAt = m.t

  if (m.t < f.confusedUntil) return // confus : n'écoute plus

  const stance = COMMAND_STANCE[cmd]
  if (stance) {
    f.stance = stance
    if (cmd === 'counter') f.counterUntil = m.t + 2.5
    f.hype = Math.min(HYPE_MAX, f.hype + 2 * hrtScale)
  }
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------

function attackInterval(f: FighterState): number {
  // SPD 2 → ~2.6 s entre actions ; SPD 12 → ~1.1 s
  return 3 - f.char.stats.spd * 0.155
}

function resolveAttack(m: MatchState, atkSide: 'player' | 'enemy'): void {
  const a = atkSide === 'player' ? m.player : m.enemy
  const d = atkSide === 'player' ? m.enemy : m.player
  const defSide = atkSide === 'player' ? 'enemy' : 'player'
  const aMod = STANCE_MODS[a.stance]
  const dMod = STANCE_MODS[d.stance]

  a.anim = { kind: 'attack', until: m.t + 0.35 }

  // Fenêtre de contre du défenseur : renvoie une frappe.
  if (m.t < d.counterUntil) {
    d.counterUntil = 0
    const dmg = Math.round((6 + d.char.stats.atk * 1.6) * 1.3)
    a.hp = Math.max(0, a.hp - dmg)
    a.anim = { kind: 'hurt', until: m.t + 0.4 }
    d.anim = { kind: 'attack', until: m.t + 0.35 }
    d.hype = Math.min(HYPE_MAX, d.hype + 14)
    m.events.push({ kind: 'countered', t: m.t, by: defSide, dmg })
    return
  }

  // Esquive
  const dodgeChance = dMod.dodge + d.char.stats.spd * 0.012 - (m.t < d.confusedUntil ? 0.08 : 0)
  if (Math.random() < dodgeChance) {
    d.anim = { kind: 'dodge', until: m.t + 0.3 }
    d.hype = Math.min(HYPE_MAX, d.hype + 5)
    m.events.push({ kind: 'dodged', t: m.t, target: defSide })
    return
  }

  const base = 5 + a.char.stats.atk * 1.5
  const crit = Math.random() < 0.12 + (a.stance === 'aggressive' ? 0.08 : 0)
  let dmg = base * aMod.atk * (crit ? 1.7 : 1)
  const mitigation = 1 - Math.min(0.65, (d.char.stats.def * dMod.def) / 24)
  dmg *= mitigation
  if (m.t < a.confusedUntil) dmg *= 0.7

  const blocked = d.stance === 'defensive' && Math.random() < 0.35
  if (blocked) {
    dmg *= 0.35
    d.anim = { kind: 'guard', until: m.t + 0.35 }
    d.hp = Math.max(0, d.hp - Math.round(dmg))
    d.hype = Math.min(HYPE_MAX, d.hype + 6)
    m.events.push({ kind: 'blocked', t: m.t, target: defSide, dmg: Math.round(dmg) })
    return
  }

  d.hp = Math.max(0, d.hp - Math.round(dmg))
  d.anim = { kind: 'hurt', until: m.t + 0.35 }
  a.hype = Math.min(HYPE_MAX, a.hype + (crit ? 10 : 6))
  d.hype = Math.min(HYPE_MAX, d.hype + 3) // encaisser fait monter la rage
  const onoma = crit ? pick(['DOKAN!!', 'BAKOOM!', 'GYAAA!']) : pick(['BAM!', 'PAF!', 'DOGO!', 'BISHI!'])
  m.events.push({ kind: 'hit', t: m.t, target: defSide, dmg: Math.round(dmg), crit, onoma })
}

function fireSpecial(m: MatchState, side: 'player' | 'enemy'): void {
  const a = side === 'player' ? m.player : m.enemy
  const d = side === 'player' ? m.enemy : m.player
  const defSide = side === 'player' ? 'enemy' : 'player'
  a.hype = 0
  a.anim = { kind: 'special', until: m.t + 1.2 }
  const dMod = STANCE_MODS[d.stance]
  let dmg = (5 + a.char.stats.atk * 1.5) * a.char.special.power
  dmg *= 1 - Math.min(0.4, (d.char.stats.def * dMod.def) / 40) // les specials percent la garde
  d.hp = Math.max(0, d.hp - Math.round(dmg))
  d.anim = { kind: 'hurt', until: m.t + 0.8 }
  m.events.push({
    kind: 'special',
    t: m.t,
    by: side,
    name: a.char.special.name,
    onoma: a.char.special.onomatopoeia,
    dmg: Math.round(dmg),
  })
  void defSide
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ---------------------------------------------------------------------------
// IA adverse : un « coach fantôme » simple pilote l'ennemi.
// ---------------------------------------------------------------------------

function enemyCoachAI(m: MatchState): void {
  const e = m.enemy
  if (e.hype >= HYPE_MAX && Math.random() < 0.02) {
    fireSpecial(m, 'enemy')
    return
  }
  // Change de posture de temps en temps selon la situation.
  if (Math.random() < 0.008) {
    const hpRatio = e.hp / e.maxHp
    const pHpRatio = m.player.hp / m.player.maxHp
    if (hpRatio < 0.3) e.stance = pick(['defensive', 'evasive', 'counter'])
    else if (pHpRatio < 0.35) e.stance = 'aggressive'
    else e.stance = pick(['neutral', 'aggressive', 'defensive', 'evasive', 'counter'])
  }
}

// ---------------------------------------------------------------------------
// Boucle : tick(m, dt, coachInput)
// ---------------------------------------------------------------------------

export function tick(m: MatchState, dt: number, input: CoachInput): void {
  m.t += dt

  switch (m.phase) {
    case 'intro':
      if (m.t >= m.phaseUntil) m.phase = 'fighting'
      return
    case 'roundEnd':
      if (m.t >= m.phaseUntil) {
        if (m.playerWins >= 2 || m.enemyWins >= 2) {
          m.phase = 'matchEnd'
          m.events.push({
            kind: 'matchEnd',
            t: m.t,
            winner: m.playerWins >= 2 ? 'player' : 'enemy',
          })
        } else {
          m.phase = 'tactics'
          m.phaseUntil = m.t + TACTICS_DURATION
        }
      }
      return
    case 'tactics':
      if (m.t >= m.phaseUntil) startNextRound(m, m.plan ?? 'coldblood')
      return
    case 'matchEnd':
      return
    case 'fighting':
      break
  }

  // --- Coaching temps réel ---
  if (input.command) applyCommand(m, input.command)

  const p = m.player
  const hrtScale = 0.5 + p.char.stats.hrt / 12
  // L'énergie du coach (voix + visage) nourrit la Hype en continu.
  const energy = input.voiceEnergy * 0.6 + input.faceEnergy * 0.4
  if (energy > 0.15) {
    const wasFull = p.hype >= HYPE_MAX
    p.hype = Math.min(HYPE_MAX, p.hype + energy * 4 * hrtScale * dt * 10)
    if (!wasFull && p.hype >= HYPE_MAX) m.events.push({ kind: 'hypeFull', t: m.t, who: 'player' })
  }

  enemyCoachAI(m)

  // --- Actions des combattants ---
  for (const side of ['player', 'enemy'] as const) {
    const f = side === 'player' ? m.player : m.enemy
    if (m.t >= f.nextActionAt) {
      const slow = m.t < f.confusedUntil ? 1.4 : 1
      f.nextActionAt = m.t + attackInterval(f) * slow * (0.85 + Math.random() * 0.3)
      // En posture défensive on frappe moins souvent.
      if (f.stance === 'defensive' && Math.random() < 0.45) continue
      resolveAttack(m, side)
    }
  }

  // Micro-déplacements pour la vie de l'arène.
  const dist = m.enemy.x - m.player.x
  const targetDist = 0.34
  const drift = (dist - targetDist) * 0.5 * dt
  m.player.x += drift
  m.enemy.x -= drift

  // --- Fin de round ---
  const roundElapsed = m.t // approximation : timer affiché géré côté UI par roundStartT
  void roundElapsed
  if (m.player.hp <= 0 || m.enemy.hp <= 0) {
    const winner = m.player.hp <= 0 ? 'enemy' : 'player'
    endRound(m, winner)
  }
}

let roundStartT = 0

export function getRoundElapsed(m: MatchState): number {
  return m.t - roundStartT
}

function endRound(m: MatchState, winner: 'player' | 'enemy'): void {
  if (winner === 'player') m.playerWins++
  else m.enemyWins++
  const loser = winner === 'player' ? m.enemy : m.player
  loser.anim = { kind: 'ko', until: m.t + ROUND_END_DURATION }
  m.phase = 'roundEnd'
  m.phaseUntil = m.t + ROUND_END_DURATION
  m.events.push({ kind: 'roundEnd', t: m.t, winner })
}

/** Vérifie la limite de temps du round (appelé par l'UI avec son propre timer). */
export function forceRoundTimeout(m: MatchState): void {
  if (m.phase !== 'fighting') return
  const winner = m.player.hp / m.player.maxHp >= m.enemy.hp / m.enemy.maxHp ? 'player' : 'enemy'
  endRound(m, winner)
}

export function chooseTacticPlan(m: MatchState, plan: TacticPlan): void {
  m.plan = plan
}

/** Bonus de Hype gagné pendant le « discours de coach » de la phase tactique. */
export function addSpeechHype(m: MatchState, amount: number): void {
  const hrtScale = 0.5 + m.player.char.stats.hrt / 12
  m.player.hype = Math.min(HYPE_MAX, m.player.hype + amount * hrtScale)
}

function startNextRound(m: MatchState, plan: TacticPlan): void {
  m.round++
  roundStartT = m.t
  const eff = PLAN_EFFECTS[plan]

  const p = m.player
  p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * eff.healPct) + Math.round(p.maxHp * 0.25))
  p.hype = Math.round(p.hype * eff.hypeKeep)
  p.stance = eff.stance
  p.confusedUntil = 0
  p.counterUntil = 0
  p.anim = { kind: 'idle', until: 0 }

  const e = m.enemy
  e.hp = Math.min(e.maxHp, e.hp + Math.round(e.maxHp * 0.3))
  e.hype = Math.round(e.hype * 0.5)
  e.stance = 'neutral'
  e.anim = { kind: 'idle', until: 0 }

  m.plan = plan
  m.phase = 'intro'
  m.phaseUntil = m.t + INTRO_DURATION
  m.events.push({ kind: 'roundStart', t: m.t, round: m.round })
}

/** Multiplicateurs du plan actif (utilisés par le rendu HUD). */
export function planLabel(plan: TacticPlan): string {
  return {
    pressure: 'PRESSION',
    concrete: 'BÉTON',
    counterplay: 'CONTRE-JEU',
    coldblood: 'SANG-FROID',
  }[plan]
}
