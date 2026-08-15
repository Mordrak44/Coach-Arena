import type {
  CardId,
  Character,
  CoachCard,
  EffectPrimitive,
  CoachCommand,
  CoachInput,
  CombatEvent,
  FighterState,
  MatchState,
  Stance,
  TacticPlan,
} from './types'
import { buildStarterDeck, clampEffect, getCard, shuffle, signatureFor } from './cards'

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
export const HAND_SIZE = 5
export const SOUFFLE_PER_CORNER = 3

/** Dégâts de base d'un coup normal — calibré pour des rounds de 45-60 s. */
function baseDamage(atk: number): number {
  return 2 + atk * 0.6
}

export const ULTI_MAX = 100

/**
 * Charge d'Ulti par les dégâts : encaisser charge deux fois plus que
 * frapper (mécanique de comeback). Calibrée pour un Ulti disponible vers le
 * round 2-3.
 */
function chargeUlti(m: MatchState, f: FighterState, dmg: number, took: boolean): void {
  if (f.ultiUsed) return
  const wasFull = f.ulti >= ULTI_MAX
  f.ulti = Math.min(ULTI_MAX, f.ulti + (dmg / f.maxHp) * (took ? 46 : 23))
  if (!wasFull && f.ulti >= ULTI_MAX) {
    m.events.push({ kind: 'ultiReady', t: m.t, who: f === m.player ? 'player' : 'enemy' })
  }
}

function fireUlti(m: MatchState, side: 'player' | 'enemy'): void {
  const a = side === 'player' ? m.player : m.enemy
  const d = side === 'player' ? m.enemy : m.player
  a.ulti = 0
  a.ultiUsed = true
  a.anim = { kind: 'special', until: m.t + 1.6 }
  // L'Ultime perce tout : ni garde ni esquive, dégâts sur la vie max cible.
  const dmg = Math.round(d.maxHp * (0.32 + a.char.ulti.power * 0.035))
  d.hp = Math.max(0, d.hp - dmg)
  d.anim = { kind: 'hurt', until: m.t + 1.2 }
  m.events.push({
    kind: 'ulti',
    t: m.t,
    by: side,
    name: a.char.ulti.name,
    onoma: a.char.ulti.onomatopoeia,
    dmg,
  })
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
    ulti: 0,
    ultiUsed: false,
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

export interface MatchOpts {
  /** Hype de départ (humeur de la Vie d'Écurie) */
  startHype?: number
  /** humeur basse : le premier ordre du match est boudé */
  sulky?: boolean
  /** l'Écurie : équipiers en réserve (max 2), relève au coin du ring */
  team?: Character[]
  /** équipe adverse (même taille que la tienne en général) */
  enemyTeam?: Character[]
  /** deck du coin adverse (Histoire : decks thématiques par chapitre) */
  enemyDeck?: CardId[]
}

/** Coût en Souffle d'une relève au coin du ring. */
export const SWITCH_COST = 1

export function createMatch(
  playerChar: Character,
  enemyChar: Character,
  deckList?: CardId[],
  opts: MatchOpts = {},
): MatchState {
  const deck = shuffle(deckList ?? buildStarterDeck(null))
  const m: MatchState = {
    player: makeFighter(playerChar, 'player'),
    enemy: makeFighter(enemyChar, 'enemy'),
    round: 1,
    playerWins: 0,
    enemyWins: 0,
    phase: 'intro',
    t: 0,
    phaseUntil: INTRO_DURATION,
    plan: null,
    deck,
    hand: [],
    discard: [],
    souffle: SOUFFLE_PER_CORNER,
    mulliganUsed: false,
    consigneUsed: false,
    sulky: opts.sulky ?? false,
    mods: freshMods(),
    bench: (opts.team ?? []).map(c => makeFighter(c, 'player')),
    enemyBench: (opts.enemyTeam ?? []).map(c => makeFighter(c, 'enemy')),
    switchUsed: false,
    enemyDeck: shuffle(opts.enemyDeck ?? buildStarterDeck(signatureFor(enemyChar.id))),
    enemyHand: [],
    enemyDiscard: [],
    enemySouffle: SOUFFLE_PER_CORNER,
    enemyMods: freshMods(),
    events: [{ kind: 'roundStart', t: 0, round: 1 }],
  }
  m.player.hype = Math.min(HYPE_MAX, opts.startHype ?? 0)
  drawCards(m, HAND_SIZE)
  drawEnemyCards(m, HAND_SIZE)
  return m
}

// ---------------------------------------------------------------------------
// Le Deck du Coach : pioche, Souffle, mulligan
// ---------------------------------------------------------------------------

export function drawCards(m: MatchState, n: number): void {
  while (n-- > 0 && m.hand.length < HAND_SIZE) {
    if (m.deck.length === 0) {
      // La défausse redevient la pioche (mélangée).
      if (m.discard.length === 0) return
      m.deck = shuffle(m.discard)
      m.discard = []
    }
    m.hand.push(m.deck.shift()!)
  }
}

/** Pioche du coin adverse — mêmes règles que le joueur (défausse remélangée). */
function drawEnemyCards(m: MatchState, n: number): void {
  while (n-- > 0 && m.enemyHand.length < HAND_SIZE) {
    if (m.enemyDeck.length === 0) {
      if (m.enemyDiscard.length === 0) return
      m.enemyDeck = shuffle(m.enemyDiscard)
      m.enemyDiscard = []
    }
    m.enemyHand.push(m.enemyDeck.shift()!)
  }
}

/**
 * Mulligan : échange 1 à 5 cartes de la main contre autant de pioches.
 * Une seule fois par coin du ring.
 */
export function mulligan(m: MatchState, ids: CardId[]): boolean {
  if (m.phase !== 'tactics' || m.mulliganUsed || ids.length === 0) return false
  const discarded: CardId[] = []
  for (const id of ids) {
    const idx = m.hand.indexOf(id)
    if (idx !== -1) {
      m.hand.splice(idx, 1)
      discarded.push(id)
    }
  }
  if (discarded.length === 0) return false
  m.mulliganUsed = true
  const count = discarded.length
  drawCards(m, count)
  m.discard.push(...discarded) // défaussées APRÈS la pioche : on ne les repioche pas
  return true
}

export function freshMods(): MatchState['mods'] {
  return {
    damageReductionMul: 1,
    dodgeBonus: 0,
    immuneConfusion: false,
    armedCounterMul: 0,
    armedCheerHype: 0,
    armedFrenzyMul: 0,
    armedFrenzyDuration: 0,
    frenzyUntil: 0,
    lowHpThreshold: 0,
    provokedUntil: 0,
    counterHypeAmount: 0,
    hitsTakenTarget: 0,
    hitsTakenHype: 0,
    hitsTakenCount: 0,
    halveEnemySpecial: false,
    blockNextEnemyCard: false,
    drainEnemySouffle: 0,
  }
}

/** Mods du camp donné (le joueur et le coin adverse en ont un chacun). */
function modsOf(m: MatchState, side: 'player' | 'enemy'): MatchState['mods'] {
  return side === 'player' ? m.mods : m.enemyMods
}

/**
 * Applique les primitives d'une carte sur l'état runtime (DSL → runtime),
 * du point de vue du camp qui la joue : « soi » et « l'adversaire » sont
 * relatifs, les mods vont dans ceux du camp joueur de la carte.
 */
function applyCardEffects(m: MatchState, effects: EffectPrimitive[], side: 'player' | 'enemy'): void {
  const self = side === 'player' ? m.player : m.enemy
  const foe = side === 'player' ? m.enemy : m.player
  const mods = modsOf(m, side)
  for (const e of effects) {
    switch (e.kind) {
      case 'heal':
        self.hp = Math.min(self.maxHp, self.hp + Math.round(self.maxHp * e.pct))
        break
      case 'hype':
        self.hype = Math.min(HYPE_MAX, self.hype + e.amount)
        break
      case 'enemyHype':
        foe.hype = Math.max(0, Math.min(HYPE_MAX, foe.hype + e.amount))
        break
      case 'damageReduction':
        mods.damageReductionMul = Math.min(mods.damageReductionMul, e.mul)
        break
      case 'dodgeBonus':
        mods.dodgeBonus += e.add
        break
      case 'immuneConfusion':
        mods.immuneConfusion = true
        break
      case 'armCounterMul':
        mods.armedCounterMul = e.mul
        break
      case 'armCheerHype':
        mods.armedCheerHype = e.amount
        break
      case 'armAttackFrenzy':
        mods.armedFrenzyMul = e.mul
        mods.armedFrenzyDuration = e.duration
        break
      case 'lowHpHypeFull':
        mods.lowHpThreshold = e.threshold
        break
      case 'provoke':
        mods.provokedUntil = -1 // prend effet au démarrage du round suivant
        break
      case 'counterHype':
        mods.counterHypeAmount = e.amount
        break
      case 'hitsTakenHype':
        mods.hitsTakenTarget = e.hits
        mods.hitsTakenHype = e.amount
        mods.hitsTakenCount = 0
        break
      case 'halveEnemySpecial':
        mods.halveEnemySpecial = true
        break
      case 'blockEnemyCard':
        mods.blockNextEnemyCard = true
        break
      case 'drainSouffle':
        mods.drainEnemySouffle += e.amount
        break
    }
  }
}

/** Joue une carte pendant la phase tactique, si le Souffle le permet. */
export function playCard(m: MatchState, id: CardId): boolean {
  if (m.phase !== 'tactics') return false
  const card = getCard(id)
  if (m.souffle < card.cost) return false
  const idx = m.hand.indexOf(id)
  if (idx === -1) return false
  m.hand.splice(idx, 1)
  m.discard.push(id)
  m.souffle -= card.cost
  // Silence du Coin adverse : ta carte part dans le vide (coût payé).
  if (m.enemyMods.blockNextEnemyCard) {
    m.enemyMods.blockNextEnemyCard = false
    m.events.push({ kind: 'cardProc', t: m.t, text: `🚫 ${card.name.toUpperCase()} BLOQUÉE !!` })
    return true
  }
  m.events.push({ kind: 'card', t: m.t, name: card.name })

  applyCardEffects(m, card.effects, 'player')
  return true
}

/** Réinitialise l'état « ring » d'un combattant qui monte (relève). */
function enterRing(f: FighterState, side: 'player' | 'enemy', t: number): void {
  f.x = side === 'player' ? 0.28 : 0.72
  f.facing = side === 'player' ? 1 : -1
  f.stance = 'neutral'
  f.confusedUntil = 0
  f.counterUntil = 0
  f.ordersThisRound = 0
  f.hypeFullSince = 0
  f.nextActionAt = t + 0.5
  f.anim = { kind: 'idle', until: 0 }
}

/**
 * La relève (Écurie) : au coin du ring, échange le combattant actif avec un
 * équipier vivant du banc. PV/Hype/Ulti de chacun sont CONSERVÉS — le
 * sortant récupérera sur le banc… ou pas. Une relève par pause, 1 Souffle.
 */
export function switchFighter(m: MatchState, benchIndex: number): boolean {
  if (m.phase !== 'tactics' || m.switchUsed || m.souffle < SWITCH_COST) return false
  const incoming = m.bench[benchIndex]
  if (!incoming || incoming.hp <= 0) return false
  m.bench[benchIndex] = m.player
  m.player = incoming
  enterRing(incoming, 'player', m.t)
  m.souffle -= SWITCH_COST
  m.switchUsed = true
  m.events.push({ kind: 'switch', t: m.t, side: 'player', name: incoming.char.name })
  return true
}

/**
 * Consigne parlée comprise au coin du ring (discours → primitives DSL,
 * voir speechTactics.ts). Gratuite mais bornée (clampEffect) et une seule
 * par pause : la parole est la ressource, pas le Souffle.
 */
export function applyConsigne(m: MatchState, effects: EffectPrimitive[], label: string): boolean {
  if (m.phase !== 'tactics' || m.consigneUsed || effects.length === 0) return false
  m.consigneUsed = true
  applyCardEffects(m, effects.slice(0, 2).map(clampEffect), 'player')
  m.events.push({ kind: 'card', t: m.t, name: `🎤 ${label}` })
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
    if (m.mods.armedCheerHype > 0) {
      gain += m.mods.armedCheerHype
      m.mods.armedCheerHype = 0
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

  if (cmd === 'ulti') {
    if (f.ulti >= ULTI_MAX && !f.ultiUsed && m.t >= f.confusedUntil) {
      fireUlti(m, 'player')
    }
    return
  }

  // Ordres de posture : détection du spam d'ordres contradictoires.
  // (Concentration Absolue : Yuna ne peut pas être confuse.)
  if (m.t - f.lastOrderAt < CONFUSION_ORDER_WINDOW && m.t >= f.confusedUntil && !m.mods.immuneConfusion) {
    f.confusedUntil = m.t + CONFUSION_DURATION
    m.events.push({ kind: 'confused', t: m.t, who: 'player' })
    f.lastOrderAt = m.t
    return
  }
  f.lastOrderAt = m.t

  if (m.t < f.confusedUntil) return // confus : n'écoute plus

  const stance = COMMAND_STANCE[cmd]
  if (stance) {
    // Provoqué par une carte adverse : verrouillé agressif, sourd au coach.
    if (m.t < m.enemyMods.provokedUntil) {
      m.events.push({ kind: 'trait', t: m.t, text: `${f.char.name.toUpperCase()} EST PROVOQUÉ·E !`, color: '#ff7675' })
      return
    }
    f.ordersThisRound++
    // Boudeur (Vie d'Écurie) : le premier ordre du match passe à la trappe.
    if (m.sulky) {
      m.sulky = false
      m.events.push({ kind: 'trait', t: m.t, text: `${f.char.name.toUpperCase()} BOUDE…`, color: '#cc88ff' })
      return
    }
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
    // armedFrenzyDuration > 0 = armée ; le multiplicateur reste lisible
    // pendant frenzyUntil, mais le déclencheur est consommé.
    if (cmd === 'attack' && m.mods.armedFrenzyDuration > 0) {
      m.mods.frenzyUntil = m.t + m.mods.armedFrenzyDuration
      m.mods.armedFrenzyDuration = 0
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
  const atkMods = modsOf(m, atkSide)
  const defMods = modsOf(m, defSide)
  // suffixe des procs de cartes adverses : le joueur doit savoir qui proc
  const adv = defSide === 'enemy' ? ' ADVERSE' : ''

  a.anim = { kind: 'attack', until: m.t + 0.35 }

  // Fenêtre de contre du défenseur : renvoie une frappe.
  if (m.t < d.counterUntil) {
    d.counterUntil = 0
    let counterMul = 1.3
    if (defMods.armedCounterMul > 0) {
      counterMul *= defMods.armedCounterMul
      defMods.armedCounterMul = 0
      m.events.push({ kind: 'cardProc', t: m.t, text: `CONTRE PARFAIT${adv} !!` })
    }
    // Orgueil du Rival (Rei) : humilier remplit la Hype.
    if (defMods.counterHypeAmount > 0) {
      d.hype = Math.min(HYPE_MAX, d.hype + defMods.counterHypeAmount)
      defMods.counterHypeAmount = 0
      m.events.push({ kind: 'cardProc', t: m.t, text: `ORGUEIL DU RIVAL${adv} !!` })
    }
    const dmg = Math.round((3 + d.char.stats.atk * 0.7) * counterMul)
    a.hp = Math.max(0, a.hp - dmg)
    a.anim = { kind: 'hurt', until: m.t + 0.4 }
    d.anim = { kind: 'attack', until: m.t + 0.35 }
    d.hype = Math.min(HYPE_MAX, d.hype + 14)
    m.events.push({ kind: 'countered', t: m.t, by: defSide, dmg })
    return
  }

  // Esquive (Pas de l'Ombre & co — bonus du camp défenseur)
  const shadowBonus = defMods.dodgeBonus
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
  dmg *= defMods.damageReductionMul // Garde de Fer & co (camp défenseur)
  if (m.t < atkMods.frenzyUntil) dmg *= Math.max(1.1, atkMods.armedFrenzyMul) // Frénésie

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
  chargeUlti(m, a, dmg, false)
  chargeUlti(m, d, dmg, true)
  // Cœur Vaillant (Kenta) : la douleur le nourrit.
  if (defMods.hitsTakenTarget > 0) {
    defMods.hitsTakenCount++
    if (defMods.hitsTakenCount >= defMods.hitsTakenTarget) {
      d.hype = Math.min(HYPE_MAX, d.hype + defMods.hitsTakenHype)
      defMods.hitsTakenTarget = 0
      m.events.push({ kind: 'cardProc', t: m.t, text: `CŒUR VAILLANT${adv} !!` })
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
  // Leçon d'Expérience (Gorō) : le camp qui encaisse a vu venir le premier
  // spécial adverse (mods du défenseur, symétrique).
  const specDefMods = modsOf(m, defSide)
  if (specDefMods.halveEnemySpecial) {
    specDefMods.halveEnemySpecial = false
    dmg *= 0.5
    m.events.push({
      kind: 'cardProc',
      t: m.t,
      text: defSide === 'enemy' ? "LEÇON D'EXPÉRIENCE ADVERSE !!" : "LEÇON D'EXPÉRIENCE !!",
    })
  }
  d.hp = Math.max(0, d.hp - Math.round(dmg))
  d.anim = { kind: 'hurt', until: m.t + 0.8 }
  chargeUlti(m, d, dmg, true) // encaisser un spécial charge fort l'Ulti
  m.events.push({
    kind: 'special',
    t: m.t,
    by: side,
    name: a.char.special.name,
    onoma: a.char.special.onomatopoeia,
    dmg: Math.round(dmg),
  })
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ---------------------------------------------------------------------------
// IA adverse : un « coach fantôme » simple pilote l'ennemi.
// ---------------------------------------------------------------------------

/**
 * Valeur situationnelle d'une carte pour le coin adverse — l'heuristique du
 * coach fantôme. Somme par primitive, comparable au coût en Souffle.
 */
function enemyCardValue(m: MatchState, card: CoachCard): number {
  const e = m.enemy
  const p = m.player
  let v = 0
  for (const ef of card.effects) {
    switch (ef.kind) {
      case 'heal': {
        const missing = 1 - e.hp / e.maxHp
        v += ef.pct * 10 * (missing > 0.35 ? 2 : missing > 0.15 ? 1 : 0)
        break
      }
      case 'hype':
        v += e.hype < 75 ? ef.amount / 15 : 0
        break
      case 'enemyHype': // sabotage : vise le joueur
        v += p.hype > 50 ? Math.abs(ef.amount) / 15 : 0
        break
      case 'damageReduction':
        v += (1 - ef.mul) * 4
        break
      case 'dodgeBonus':
        v += ef.add * 10
        break
      case 'immuneConfusion':
        break // l'adversaire ne peut pas être confus : carte morte pour lui
      case 'armCounterMul':
        v += 0.5 // son coach fantôme prend parfois la posture contre
        break
      case 'armCheerHype':
        v += 0.5
        break
      case 'armAttackFrenzy':
        v += 1
        break
      case 'lowHpHypeFull':
        v += e.hp / e.maxHp < 0.5 ? 1.4 : 0.6
        break
      case 'provoke':
        v += 1.3 // verrouiller le perso du joueur, sourd à son coach : fort
        break
      case 'counterHype':
        v += 0.4
        break
      case 'hitsTakenHype':
        v += 0.7
        break
      case 'halveEnemySpecial':
        v += p.hype > 60 ? 1.6 : 0.6
        break
      case 'blockEnemyCard':
        v += 0.8
        break
      case 'drainSouffle':
        v += 0.7
        break
    }
  }
  return v
}

/**
 * Le coin adverse joue son VRAI deck au coin du ring : Souffle rechargé,
 * main recomplétée, puis il joue gloutonnement la meilleure carte abordable
 * tant que la situation le justifie. Chaque carte est annoncée par un
 * événement — lisible par le joueur, et à terme bloquable.
 */
export function enemyCornerPlay(m: MatchState): void {
  m.enemySouffle = SOUFFLE_PER_CORNER
  // La relève adverse : si son actif est entamé et qu'un équipier est plus
  // frais, le coin adverse fait monter la réserve (coûte 1 Souffle).
  if (m.enemyBench.length > 0 && m.enemySouffle >= SWITCH_COST) {
    const ratio = m.enemy.hp / m.enemy.maxHp
    let best = -1
    let bestRatio = ratio + 0.15 // ça doit valoir le coup
    for (let i = 0; i < m.enemyBench.length; i++) {
      const b = m.enemyBench[i]
      const r = b.hp / b.maxHp
      if (b.hp > 0 && r > bestRatio) {
        best = i
        bestRatio = r
      }
    }
    if (best !== -1 && ratio < 0.35) {
      const incoming = m.enemyBench[best]
      m.enemyBench[best] = m.enemy
      m.enemy = incoming
      enterRing(incoming, 'enemy', m.t)
      m.enemySouffle -= SWITCH_COST
      m.events.push({ kind: 'switch', t: m.t, side: 'enemy', name: incoming.char.name })
    }
  }
  // Vol de Souffle joué par le joueur au round précédent : le coin adverse
  // arrive essoufflé à sa pause.
  if (m.mods.drainEnemySouffle > 0) {
    m.enemySouffle = Math.max(0, m.enemySouffle - m.mods.drainEnemySouffle)
    m.mods.drainEnemySouffle = 0
    m.events.push({ kind: 'cardProc', t: m.t, text: '🌬️ SOUFFLE ADVERSE VOLÉ !!' })
  }
  drawEnemyCards(m, HAND_SIZE - m.enemyHand.length)
  for (;;) {
    let best: CardId | null = null
    let bestValue = 0.75 // seuil : en dessous, il garde son Souffle
    for (const id of new Set(m.enemyHand)) {
      const card = getCard(id)
      if (card.cost > m.enemySouffle) continue
      const v = enemyCardValue(m, card)
      if (v > bestValue) {
        best = id
        bestValue = v
      }
    }
    if (!best) return
    const card = getCard(best)
    m.enemyHand.splice(m.enemyHand.indexOf(best), 1)
    m.enemyDiscard.push(best)
    m.enemySouffle -= card.cost
    // Silence du Coin : sa meilleure carte part dans le vide (coût payé),
    // il peut encore jouer le reste de son Souffle.
    if (m.mods.blockNextEnemyCard) {
      m.mods.blockNextEnemyCard = false
      m.events.push({ kind: 'cardProc', t: m.t, text: `🚫 ${card.name.toUpperCase()} ADVERSE BLOQUÉE !!` })
      continue
    }
    m.events.push({ kind: 'card', t: m.t, name: `${card.name} (coin adverse)` })
    applyCardEffects(m, card.effects, 'enemy')
  }
}

function enemyCoachAI(m: MatchState, dt: number): void {
  const e = m.enemy
  // Le coach fantôme encourage son poulain en continu (équivalent voix+visage).
  e.hype = Math.min(HYPE_MAX, e.hype + 1.2 * dt * (0.5 + e.char.stats.hrt / 12))
  // Provoqué : agressif verrouillé, n'écoute plus son coach.
  if (m.t < m.mods.provokedUntil) {
    e.stance = 'aggressive'
    return
  }
  // Probabilités en taux PAR SECONDE (× dt) : la difficulté ne doit pas
  // dépendre du refresh de l'écran (144 Hz ≠ 2,4× plus d'ultis qu'à 60 Hz).
  if (e.ulti >= ULTI_MAX && !e.ultiUsed && Math.random() < 0.9 * dt) {
    fireUlti(m, 'enemy')
    return
  }
  if (e.hype >= HYPE_MAX && Math.random() < 1.2 * dt) {
    fireSpecial(m, 'enemy')
    return
  }
  // Change de posture selon la situation (lecture du match). Un changement
  // de posture est « l'ordre » du coach fantôme : il libère les instants
  // armés de son deck, comme la voix du joueur libère les siens.
  if (Math.random() < 0.9 * dt) {
    const hpRatio = e.hp / e.maxHp
    const pHpRatio = m.player.hp / m.player.maxHp
    if (hpRatio < 0.3) e.stance = pick(['defensive', 'evasive', 'counter'])
    else if (pHpRatio < 0.35) e.stance = 'aggressive'
    else if (m.player.stance === 'aggressive') e.stance = pick(['counter', 'defensive', 'evasive'])
    else if (m.player.stance === 'defensive') e.stance = pick(['neutral', 'aggressive'])
    else e.stance = pick(['neutral', 'aggressive', 'defensive', 'evasive', 'counter'])

    const em = m.enemyMods
    // Fenêtre de contre UNIQUEMENT quand une carte l'arme : une fenêtre à
    // chaque prise de posture (~1/s) contrerait presque toutes les attaques
    // du joueur — mesuré en sim : winrate coach 82 % → 0 %.
    if (e.stance === 'counter' && em.armedCounterMul > 0) e.counterUntil = m.t + 2.5
    if (e.stance === 'aggressive' && em.armedFrenzyDuration > 0) {
      em.frenzyUntil = m.t + em.armedFrenzyDuration
      em.armedFrenzyDuration = 0
      m.events.push({ kind: 'cardProc', t: m.t, text: 'FRÉNÉSIE ADVERSE !!' })
    }
    if (em.armedCheerHype > 0) {
      e.hype = Math.min(HYPE_MAX, e.hype + em.armedCheerHype)
      em.armedCheerHype = 0
      m.events.push({ kind: 'cardProc', t: m.t, text: 'CRI DE GUERRE ADVERSE !!' })
    }
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
          // Nouveau coin du ring : Souffle rechargé, main recomplétée,
          // et le plan REMIS À ZÉRO — sinon l'ancien plan est silencieusement
          // reconduit alors que l'UI affiche « aucun plan choisi ».
          m.plan = null
          m.souffle = SOUFFLE_PER_CORNER
          // Vol de Souffle adverse : tu arrives essoufflé à ta pause.
          if (m.enemyMods.drainEnemySouffle > 0) {
            m.souffle = Math.max(0, m.souffle - m.enemyMods.drainEnemySouffle)
            m.enemyMods.drainEnemySouffle = 0
            m.events.push({ kind: 'cardProc', t: m.t, text: '🌬️ TON SOUFFLE EST VOLÉ !!' })
          }
          m.mulliganUsed = false
          m.consigneUsed = false
          m.switchUsed = false
          drawCards(m, HAND_SIZE - m.hand.length)
          enemyCornerPlay(m)
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
  // L'Ultime n'a PAS d'initiative automatique : c'est le cri du coach qui
  // le libère (bouton/clavier en secours). Un Ulti gâché sans le coach
  // n'aurait aucune saveur — et l'IA adverse, elle, n'attend personne.

  // Provoqué par le coin adverse : agressif verrouillé, symétrique de la
  // provocation du joueur (le refus des ordres est dans applyCommand).
  if (m.t < m.enemyMods.provokedUntil) p.stance = 'aggressive'

  // Dernière Chance : sous 15 % PV, la Hype se remplit d'un coup (une fois).
  if (m.mods.lowHpThreshold > 0 && p.hp > 0 && p.hp < p.maxHp * m.mods.lowHpThreshold) {
    m.mods.lowHpThreshold = 0
    p.hype = HYPE_MAX
    m.events.push({ kind: 'cardProc', t: m.t, text: 'DERNIÈRE CHANCE !!' })
    m.events.push({ kind: 'hypeFull', t: m.t, who: 'player' })
  }
  // … et sa version adverse (deck symétrique).
  const en = m.enemy
  if (m.enemyMods.lowHpThreshold > 0 && en.hp > 0 && en.hp < en.maxHp * m.enemyMods.lowHpThreshold) {
    m.enemyMods.lowHpThreshold = 0
    en.hype = HYPE_MAX
    m.events.push({ kind: 'cardProc', t: m.t, text: 'DERNIÈRE CHANCE ADVERSE !!' })
    m.events.push({ kind: 'hypeFull', t: m.t, who: 'enemy' })
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

  // --- Fin de round --- (le timer de round est tenu par l'UI/sim)
  if (m.player.hp <= 0 || m.enemy.hp <= 0) {
    const winner = m.player.hp <= 0 ? 'enemy' : 'player'
    endRound(m, winner)
  }
}

function endRound(m: MatchState, winner: 'player' | 'enemy'): void {
  if (winner === 'player') m.playerWins++
  else m.enemyWins++
  const loser = winner === 'player' ? m.enemy : m.player
  // Perdre un round nourrit l'Ulti : le comeback est dans l'ADN du jeu.
  if (!loser.ultiUsed) {
    const wasFull = loser.ulti >= ULTI_MAX
    loser.ulti = Math.min(ULTI_MAX, loser.ulti + 15)
    if (!wasFull && loser.ulti >= ULTI_MAX)
      m.events.push({ kind: 'ultiReady', t: m.t, who: loser === m.player ? 'player' : 'enemy' })
  }
  loser.anim = { kind: 'ko', until: m.t + ROUND_END_DURATION }
  // Les effets « durée d'un round » expirent — des deux côtés. Exceptions :
  // provokedUntil (temporel) et les paris de guerre des coins
  // (blocage/drain), qui se résolvent à la PROCHAINE pause.
  const keep = (mods: MatchState['mods']) => {
    const fresh = freshMods()
    fresh.provokedUntil = mods.provokedUntil
    fresh.blockNextEnemyCard = mods.blockNextEnemyCard
    fresh.drainEnemySouffle = mods.drainEnemySouffle
    return fresh
  }
  m.mods = keep(m.mods)
  m.enemyMods = keep(m.enemyMods)
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

  // Provocations jouées au coin du ring : prennent effet maintenant.
  if (m.mods.provokedUntil === -1) {
    m.mods.provokedUntil = m.t + INTRO_DURATION + 10
    e.stance = 'aggressive'
  }
  if (m.enemyMods.provokedUntil === -1) {
    m.enemyMods.provokedUntil = m.t + INTRO_DURATION + 10
    p.stance = 'aggressive'
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
