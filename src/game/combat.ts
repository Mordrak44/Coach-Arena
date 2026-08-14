import type {
  CardId,
  Character,
  CoachCommand,
  CoachInput,
  CombatEvent,
  FighterState,
  MatchState,
  Stance,
  TacticPlan,
} from './types'
import { DEFAULT_DECK, getCard } from './cards'

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

/** Dégâts de base d'un coup normal — calibré pour des rounds de 45-60 s. */
function baseDamage(atk: number): number {
  return 2 + atk * 0.6
}

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

/** Les PV affichés (stat) sont multipliés en combat pour tenir la durée de round cible. */
const HP_SCALE = 2.6

function makeFighter(char: Character, side: 'player' | 'enemy'): FighterState {
  const hp = Math.round(char.stats.hp * HP_SCALE)
  return {
    char,
    hp,
    maxHp: hp,
    hype: 0,
    stance: 'neutral',
    confusedUntil: 0,
    counterUntil: 0,
    nextActionAt: 0,
    lastOrderAt: -10,
    ordersThisRound: 0,
    hypeFullSince: 0,
    x: side === 'player' ? 0.28 : 0.72,
    facing: side === 'player' ? 1 : -1,
    anim: { kind: 'idle', until: 0 },
  }
}

export function createMatch(
  playerChar: Character,
  enemyChar: Character,
  deck: CardId[] = DEFAULT_DECK,
): MatchState {
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
    hand: [...deck],
    cardPlayedThisCorner: false,
    mods: {
      perfectCounter: false,
      warCry: false,
      ironGuard: false,
      lastChance: false,
      provokedUntil: 0,
      kentaHeart: false,
      hitsTakenThisRound: 0,
      reiCounterHype: false,
      yunaFocus: false,
      goroLesson: false,
      fangFrenzy: false,
      frenzyUntil: 0,
      nyxShadow: false,
    },
    events: [{ kind: 'roundStart', t: 0, round: 1 }],
  }
}

// ---------------------------------------------------------------------------
// Carnet du Coach
// ---------------------------------------------------------------------------

/** Joue une carte pendant la phase tactique. Une seule par coin du ring. */
export function playCard(m: MatchState, id: CardId): boolean {
  if (m.phase !== 'tactics' || m.cardPlayedThisCorner) return false
  const idx = m.hand.indexOf(id)
  if (idx === -1) return false
  m.hand.splice(idx, 1)
  m.cardPlayedThisCorner = true
  m.events.push({ kind: 'card', t: m.t, name: getCard(id).name })

  switch (id) {
    case 'secondWind':
      m.player.hp = Math.min(m.player.maxHp, m.player.hp + Math.round(m.player.maxHp * 0.2))
      break
    case 'ironGuard':
      m.mods.ironGuard = true
      break
    case 'perfectCounter':
      m.mods.perfectCounter = true
      break
    case 'warCry':
      m.mods.warCry = true
      break
    case 'lastChance':
      m.mods.lastChance = true
      break
    case 'provocation':
      // Prend effet au démarrage du round suivant (voir startNextRound).
      m.mods.provokedUntil = -1
      break
    case 'sigKenta':
      m.mods.kentaHeart = true
      m.mods.hitsTakenThisRound = 0
      break
    case 'sigRei':
      m.mods.reiCounterHype = true
      break
    case 'sigYuna':
      m.mods.yunaFocus = true
      break
    case 'sigGoro':
      m.mods.goroLesson = true
      break
    case 'sigFang':
      m.mods.fangFrenzy = true
      break
    case 'sigNyx':
      m.mods.nyxShadow = true
      break
  }
  return true
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
function applyCommand(m: MatchState, cmd: CoachCommand, voiceEnergy: number): void {
  const f = m.player
  const hrtScale = 0.5 + f.char.stats.hrt / 12 // 0.66..1.5 : le Cœur amplifie tout
  const trait = f.char.trait
  const shouting = voiceEnergy > 0.55
  const calm = voiceEnergy < 0.45

  if (cmd === 'cheer') {
    let gain = 6 * hrtScale
    // Sanguin : les cris l'enflamment. Cérébral : hurler ne l'aide pas.
    if (trait === 'sanguin' && shouting) gain *= 1.5
    if (trait === 'cerebral' && shouting) gain *= 0.4
    if (m.mods.warCry) {
      m.mods.warCry = false
      gain += 35
      m.events.push({ kind: 'cardProc', t: m.t, text: 'CRI DE GUERRE !!' })
    }
    f.hype = Math.min(HYPE_MAX, f.hype + gain)
    return
  }

  if (cmd === 'special') {
    if (f.hype >= HYPE_MAX && m.t >= f.confusedUntil) {
      fireSpecial(m, 'player')
    }
    return
  }

  // Ordres de posture : détection du spam d'ordres contradictoires.
  // (Concentration Absolue : Yuna ne peut pas être confuse.)
  if (m.t - f.lastOrderAt < CONFUSION_ORDER_WINDOW && m.t >= f.confusedUntil && !m.mods.yunaFocus) {
    f.confusedUntil = m.t + CONFUSION_DURATION
    m.events.push({ kind: 'confused', t: m.t, who: 'player' })
    f.lastOrderAt = m.t
    return
  }
  f.lastOrderAt = m.t

  if (m.t < f.confusedUntil) return // confus : n'écoute plus

  const stance = COMMAND_STANCE[cmd]
  if (stance) {
    f.ordersThisRound++
    // Têtu : le premier ordre de posture du round est superbement ignoré.
    if (trait === 'tetu' && f.ordersThisRound === 1) {
      m.events.push({ kind: 'trait', t: m.t, text: `${f.char.name.toUpperCase()} T'IGNORE…`, color: '#a29bfe' })
      return
    }
    // Cérébral : un ordre hurlé le stresse (appliqué, mais sans élan).
    let orderHype = 2 * hrtScale
    if (trait === 'cerebral') {
      if (shouting) {
        orderHype = 0
        f.hype = Math.max(0, f.hype - 4)
        m.events.push({ kind: 'trait', t: m.t, text: 'TROP DE BRUIT…', color: '#81ecec' })
      } else if (calm) {
        orderHype = 5 * hrtScale // la précision le transcende
      }
    }
    f.stance = stance
    if (cmd === 'counter') f.counterUntil = m.t + 2.5
    // Frénésie (Fang) : l'ordre d'attaque lâche la bête.
    if (cmd === 'attack' && m.mods.fangFrenzy) {
      m.mods.fangFrenzy = false
      m.mods.frenzyUntil = m.t + 5
      m.events.push({ kind: 'cardProc', t: m.t, text: 'FRÉNÉSIE !!' })
    }
    f.hype = Math.min(HYPE_MAX, f.hype + orderHype)
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
    let counterMul = 1.3
    if (defSide === 'player' && m.mods.perfectCounter) {
      m.mods.perfectCounter = false
      counterMul *= 2
      m.events.push({ kind: 'cardProc', t: m.t, text: 'CONTRE PARFAIT !!' })
    }
    // Orgueil du Rival (Rei) : humilier remplit la Hype.
    if (defSide === 'player' && m.mods.reiCounterHype) {
      m.mods.reiCounterHype = false
      d.hype = Math.min(HYPE_MAX, d.hype + 50)
      m.events.push({ kind: 'cardProc', t: m.t, text: 'ORGUEIL DU RIVAL !!' })
    }
    const dmg = Math.round((3 + d.char.stats.atk * 0.7) * counterMul)
    a.hp = Math.max(0, a.hp - dmg)
    a.anim = { kind: 'hurt', until: m.t + 0.4 }
    d.anim = { kind: 'attack', until: m.t + 0.35 }
    d.hype = Math.min(HYPE_MAX, d.hype + 14)
    m.events.push({ kind: 'countered', t: m.t, by: defSide, dmg })
    return
  }

  // Esquive (Pas de l'Ombre : +15 % pour le joueur)
  const shadowBonus = defSide === 'player' && m.mods.nyxShadow ? 0.15 : 0
  const dodgeChance =
    dMod.dodge + shadowBonus + d.char.stats.spd * 0.012 - (m.t < d.confusedUntil ? 0.08 : 0)
  if (Math.random() < dodgeChance) {
    d.anim = { kind: 'dodge', until: m.t + 0.3 }
    d.hype = Math.min(HYPE_MAX, d.hype + 5)
    m.events.push({ kind: 'dodged', t: m.t, target: defSide })
    return
  }

  // Bonus du plan tactique du joueur (actif jusqu'à la fin du round)
  const plan = m.plan ? PLAN_EFFECTS[m.plan] : null
  const base = baseDamage(a.char.stats.atk)
  const crit = Math.random() < 0.12 + (a.stance === 'aggressive' ? 0.08 : 0)
  let dmg = base * aMod.atk * (crit ? 1.7 : 1)
  if (plan && atkSide === 'player') dmg *= plan.atk
  const defPlanMul = plan && defSide === 'player' ? plan.def : 1
  const mitigation = 1 - Math.min(0.65, (d.char.stats.def * dMod.def * defPlanMul) / 24)
  dmg *= mitigation
  if (m.t < a.confusedUntil) dmg *= 0.7
  if (defSide === 'player' && m.mods.ironGuard) dmg *= 0.65 // Garde de Fer
  if (atkSide === 'player' && m.t < m.mods.frenzyUntil) dmg *= 1.5 // Frénésie

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
  // Cœur Vaillant (Kenta) : la douleur le nourrit.
  if (defSide === 'player' && m.mods.kentaHeart) {
    m.mods.hitsTakenThisRound++
    if (m.mods.hitsTakenThisRound >= 3) {
      m.mods.kentaHeart = false
      d.hype = Math.min(HYPE_MAX, d.hype + 40)
      m.events.push({ kind: 'cardProc', t: m.t, text: 'CŒUR VAILLANT !!' })
    }
  }
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
  // Un spécial est un haymaker : ~40-50 % de la vie d'un perso moyen.
  let dmg = baseDamage(a.char.stats.atk) * a.char.special.power * 2.2
  dmg *= 1 - Math.min(0.4, (d.char.stats.def * dMod.def) / 40) // les specials percent la garde
  // Leçon d'Expérience (Gorō) : il a vu venir le premier spécial adverse.
  if (side === 'enemy' && m.mods.goroLesson) {
    m.mods.goroLesson = false
    dmg *= 0.5
    m.events.push({ kind: 'cardProc', t: m.t, text: "LEÇON D'EXPÉRIENCE !!" })
  }
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

function enemyCoachAI(m: MatchState, dt: number): void {
  const e = m.enemy
  // Le coach fantôme encourage son poulain en continu (équivalent voix+visage).
  e.hype = Math.min(HYPE_MAX, e.hype + 1.2 * dt * (0.5 + e.char.stats.hrt / 12))
  // Provoqué : agressif verrouillé, n'écoute plus son coach.
  if (m.t < m.mods.provokedUntil) {
    e.stance = 'aggressive'
    return
  }
  if (e.hype >= HYPE_MAX && Math.random() < 0.02) {
    fireSpecial(m, 'enemy')
    return
  }
  // Change de posture selon la situation (lecture du match).
  if (Math.random() < 0.015) {
    const hpRatio = e.hp / e.maxHp
    const pHpRatio = m.player.hp / m.player.maxHp
    if (hpRatio < 0.3) e.stance = pick(['defensive', 'evasive', 'counter'])
    else if (pHpRatio < 0.35) e.stance = 'aggressive'
    else if (m.player.stance === 'aggressive') e.stance = pick(['counter', 'defensive', 'evasive'])
    else if (m.player.stance === 'defensive') e.stance = pick(['neutral', 'aggressive'])
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
          m.cardPlayedThisCorner = false
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
  if (input.command) applyCommand(m, input.command, input.voiceEnergy)

  const p = m.player
  const hrtScale = 0.5 + p.char.stats.hrt / 12
  // L'énergie du coach (voix + visage) nourrit la Hype en continu.
  // Fusionnel : la facecam compte double. Sanguin : la voix forte porte plus.
  let voiceW = 0.6
  let faceW = 0.4
  if (p.char.trait === 'fusionnel') {
    voiceW = 0.4
    faceW = 0.8
  } else if (p.char.trait === 'sanguin' && input.voiceEnergy > 0.55) {
    voiceW = 0.9
  }
  // Auto-motivation de base : même sans coach, un combattant se bat
  // (symétrique du trickle du coach fantôme adverse).
  p.hype = Math.min(HYPE_MAX, p.hype + 1.2 * dt * hrtScale)

  const energy = input.voiceEnergy * voiceW + input.faceEnergy * faceW
  if (energy > 0.15) {
    const wasFull = p.hype >= HYPE_MAX
    // Une énergie soutenue (~0,65) remplit la jauge en ~35 s (auto-motivation incluse).
    p.hype = Math.min(HYPE_MAX, p.hype + energy * 4 * hrtScale * dt)
    if (!wasFull && p.hype >= HYPE_MAX) m.events.push({ kind: 'hypeFull', t: m.t, who: 'player' })
  }

  // Initiative : jauge pleine et coach silencieux → le perso tire seul.
  // Le skill du coach, c'est de crier « SPÉCIAL ! » au meilleur moment avant ça.
  if (p.hype >= HYPE_MAX) {
    if (p.hypeFullSince === 0) p.hypeFullSince = m.t
    else if (m.t - p.hypeFullSince > 6 && m.t >= p.confusedUntil) {
      fireSpecial(m, 'player')
    }
  } else {
    p.hypeFullSince = 0
  }

  // Dernière Chance : sous 15 % PV, la Hype se remplit d'un coup (une fois).
  if (m.mods.lastChance && p.hp > 0 && p.hp < p.maxHp * 0.15) {
    m.mods.lastChance = false
    p.hype = HYPE_MAX
    m.events.push({ kind: 'cardProc', t: m.t, text: 'DERNIÈRE CHANCE !!' })
    m.events.push({ kind: 'hypeFull', t: m.t, who: 'player' })
  }

  enemyCoachAI(m, dt)

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
  // Les effets « durée d'un round » expirent.
  m.mods.ironGuard = false
  m.mods.perfectCounter = false
  m.mods.warCry = false
  m.mods.lastChance = false
  m.mods.kentaHeart = false
  m.mods.hitsTakenThisRound = 0
  m.mods.reiCounterHype = false
  m.mods.yunaFocus = false
  m.mods.goroLesson = false
  m.mods.fangFrenzy = false
  m.mods.frenzyUntil = 0
  m.mods.nyxShadow = false
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
  p.ordersThisRound = 0
  p.anim = { kind: 'idle', until: 0 }

  const e = m.enemy
  e.hp = Math.min(e.maxHp, e.hp + Math.round(e.maxHp * 0.3))
  e.hype = Math.round(e.hype * 0.5)
  e.stance = 'neutral'
  e.anim = { kind: 'idle', until: 0 }

  // Provocation jouée au coin du ring : prend effet maintenant.
  if (m.mods.provokedUntil === -1) {
    m.mods.provokedUntil = m.t + INTRO_DURATION + 10
    e.stance = 'aggressive'
  }

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
