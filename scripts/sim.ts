// Simulation headless du moteur de combat — outil d'équilibrage.
// Usage : npx tsx scripts/sim.ts
import {
  createMatch,
  tick,
  chooseTacticPlan,
  forceRoundTimeout,
  playCard,
  ROUND_TIME_LIMIT,
} from '../src/game/combat'
import { ROSTER, createFromPrompt } from '../src/game/characters'
import type { CardId, MatchState } from '../src/game/types'

interface SimOptions {
  coached: boolean
  deck?: CardId[]
}

function runMatch(opts: SimOptions): { winner: 'player' | 'enemy'; cardProcs: number } {
  // Matchup aléatoire pour mesurer l'équilibrage global, pas un duel précis.
  const pi = Math.floor(Math.random() * ROSTER.length)
  let ei = Math.floor(Math.random() * ROSTER.length)
  if (ei === pi) ei = (ei + 1) % ROSTER.length
  const m: MatchState = createMatch(ROSTER[pi], ROSTER[ei], opts.deck ?? [])
  let roundStart = 0
  let prevPhase: string = m.phase
  let lastCmdAt = -10
  let cardProcs = 0
  let seenEvents = 0

  for (let i = 0; i < 60 * 60 * 10; i++) {
    const dt = 1 / 60
    let command: any = null
    if (opts.coached && m.phase === 'fighting' && m.t - lastCmdAt > 4) {
      // Coach simulé : varie ses appels pour exercer contres, cris et spéciaux.
      if (m.player.hype >= 100) command = 'special'
      else if (m.mods.perfectCounter) command = 'counter'
      else if (m.mods.warCry) command = 'cheer'
      else command = Math.random() < 0.6 ? 'attack' : 'cheer'
      lastCmdAt = m.t
    }
    tick(m, dt, {
      command,
      voiceEnergy: opts.coached ? 0.6 : 0,
      faceEnergy: opts.coached ? 0.5 : 0,
    })
    for (; seenEvents < m.events.length; seenEvents++) {
      if (m.events[seenEvents].kind === 'cardProc') cardProcs++
    }
    if (prevPhase !== 'fighting' && m.phase === 'fighting') roundStart = m.t
    prevPhase = m.phase
    if (m.phase === 'fighting' && m.t - roundStart > ROUND_TIME_LIMIT) forceRoundTimeout(m)
    if (m.phase === 'tactics') {
      if (m.plan === null) chooseTacticPlan(m, 'pressure')
      if (!m.cardPlayedThisCorner && m.hand.length) playCard(m, m.hand[0])
    }
    if (m.phase === 'matchEnd') {
      return { winner: m.playerWins >= 2 ? 'player' : 'enemy', cardProcs }
    }
  }
  throw new Error(`match non terminé : phase=${m.phase} t=${m.t.toFixed(1)}`)
}

const N = 60
let coachedWins = 0
let idleWins = 0
let deckWins = 0
let totalProcs = 0

const testDeck: CardId[] = ['perfectCounter', 'warCry', 'lastChance']

for (let i = 0; i < N; i++) {
  if (runMatch({ coached: true }).winner === 'player') coachedWins++
  if (runMatch({ coached: false }).winner === 'player') idleWins++
  const r = runMatch({ coached: true, deck: testDeck })
  if (r.winner === 'player') deckWins++
  totalProcs += r.cardProcs
}

console.log(`Coach actif, sans cartes : ${coachedWins}/${N} (${Math.round((coachedWins / N) * 100)}%)`)
console.log(`Coach absent            : ${idleWins}/${N} (${Math.round((idleWins / N) * 100)}%)`)
console.log(`Coach actif + carnet    : ${deckWins}/${N} (${Math.round((deckWins / N) * 100)}%)`)
console.log(`Déclenchements de cartes armées/conditionnelles : ${totalProcs} sur ${N} matchs`)

// Sanity création par prompt
const c = createFromPrompt('un vieux maître cyborg ultra rapide mais fragile, appelé Zenko')
if (c.name !== 'Zenko') throw new Error('extraction du nom KO')
if (c.trait !== 'cerebral') throw new Error(`trait attendu cerebral, obtenu ${c.trait}`)
console.log(`Perso prompt OK : ${c.name} ${JSON.stringify(c.stats)} trait=${c.trait}`)

// --- Micro-tests des traits d'écoute --------------------------------------

function makeFightingMatch(playerIdx: number): MatchState {
  const m = createMatch(ROSTER[playerIdx], ROSTER[0], [])
  // passe l'intro
  while (m.phase === 'intro') tick(m, 1 / 60, { command: null, voiceEnergy: 0, faceEnergy: 0 })
  // gèle les échanges de coups : on ne teste que le canal de coaching
  m.player.nextActionAt = m.t + 1000
  m.enemy.nextActionAt = m.t + 1000
  return m
}

// Têtu (Rei, idx 1) : le premier ordre de posture est ignoré, le second écouté.
{
  const m = makeFightingMatch(1)
  const before = m.player.stance
  tick(m, 1 / 60, { command: 'defend', voiceEnergy: 0.3, faceEnergy: 0 })
  if (m.player.stance !== before) throw new Error('têtu : le premier ordre aurait dû être ignoré')
  // attend la fin de la fenêtre anti-spam avant le second ordre
  while (m.t - m.player.lastOrderAt < 2.1 && m.phase === 'fighting')
    tick(m, 1 / 60, { command: null, voiceEnergy: 0, faceEnergy: 0 })
  tick(m, 1 / 60, { command: 'defend', voiceEnergy: 0.3, faceEnergy: 0 })
  if (m.phase === 'fighting' && m.player.stance !== 'defensive')
    throw new Error('têtu : le second ordre aurait dû passer')
  console.log('Trait Têtu OK (premier ordre ignoré, second écouté)')
}

// Cérébral (Yuna, idx 2) : un ordre hurlé fait perdre de la Hype, un ordre calme en donne.
{
  const m = makeFightingMatch(2)
  m.player.hype = 50
  tick(m, 1 / 60, { command: 'defend', voiceEnergy: 0.9, faceEnergy: 0 })
  if (m.player.hype >= 50) throw new Error('cérébral : hurler aurait dû coûter de la Hype')
  const afterShout = m.player.hype
  while (m.t - m.player.lastOrderAt < 2.1 && m.phase === 'fighting')
    tick(m, 1 / 60, { command: null, voiceEnergy: 0, faceEnergy: 0 })
  tick(m, 1 / 60, { command: 'attack', voiceEnergy: 0.2, faceEnergy: 0 })
  if (m.phase === 'fighting' && m.player.hype <= afterShout)
    throw new Error('cérébral : un ordre calme aurait dû donner de la Hype')
  console.log('Trait Cérébral OK (hurler pénalise, le calme transcende)')
}

console.log('OK — tous les matchs se terminent.')
