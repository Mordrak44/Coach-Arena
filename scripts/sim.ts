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

/** Durées de round collectées sur l'ensemble des matchs simulés. */
const roundDurations: number[] = []

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
      if (m.player.ulti >= 100 && !m.player.ultiUsed) command = 'ulti'
      else if (m.player.hype >= 100) command = 'special'
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
    if (prevPhase === 'fighting' && m.phase !== 'fighting') roundDurations.push(m.t - roundStart)
    prevPhase = m.phase
    if (m.phase === 'fighting' && m.t - roundStart > ROUND_TIME_LIMIT) forceRoundTimeout(m)
    if (m.phase === 'tactics') {
      if (m.plan === null) chooseTacticPlan(m, 'pressure')
      // Joue tant que le Souffle le permet (première carte abordable de la main).
      let played = true
      while (played) {
        played = false
        for (const id of [...m.hand]) {
          if (playCard(m, id)) {
            played = true
            break
          }
        }
      }
    }
    if (m.phase === 'matchEnd') {
      return { winner: m.playerWins >= 2 ? 'player' : 'enemy', cardProcs }
    }
  }
  throw new Error(`match non terminé : phase=${m.phase} t=${m.t.toFixed(1)}`)
}

const N = 100
let coachedWins = 0
let idleWins = 0
let deckWins = 0
let totalProcs = 0

import { buildStarterDeck } from '../src/game/cards'
const testDeck: CardId[] = buildStarterDeck(null)

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

roundDurations.sort((a, b) => a - b)
const avg = roundDurations.reduce((s, d) => s + d, 0) / roundDurations.length
const med = roundDurations[Math.floor(roundDurations.length / 2)]
const timeouts = roundDurations.filter(d => d >= ROUND_TIME_LIMIT - 0.1).length
console.log(
  `Durée de round : moyenne ${avg.toFixed(1)} s, médiane ${med.toFixed(1)} s, ` +
    `timeouts ${timeouts}/${roundDurations.length} (cible 45-60 s)`,
)

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

// Signatures : Concentration Absolue (Yuna) bloque la confusion.
{
  const m = makeFightingMatch(2)
  m.mods.yunaFocus = true
  tick(m, 1 / 60, { command: 'defend', voiceEnergy: 0.3, faceEnergy: 0 })
  tick(m, 1 / 60, { command: 'attack', voiceEnergy: 0.3, faceEnergy: 0 }) // spam volontaire
  if (m.player.confusedUntil > m.t) throw new Error('yunaFocus : la confusion aurait dû être bloquée')
  console.log('Signature Concentration Absolue OK (pas de confusion)')
}

// Signatures : Frénésie (Fang) armée puis déclenchée par « attaque ! ».
{
  const m = makeFightingMatch(4)
  m.mods.fangFrenzy = true
  // premier ordre ignoré ? Fang est sanguin, pas têtu — l'ordre passe.
  tick(m, 1 / 60, { command: 'attack', voiceEnergy: 0.7, faceEnergy: 0 })
  if (m.mods.frenzyUntil <= m.t - 1 || m.mods.fangFrenzy)
    throw new Error('fangFrenzy : « attaque ! » aurait dû déclencher la Frénésie')
  console.log('Signature Frénésie OK (armée par la carte, déclenchée à la voix)')
}

// Onboarding guidé : le prompt composé par les 3 questions donne un perso cohérent.
{
  const g = createFromPrompt(
    'un combattant tank blindé, un mur défensif, calme, sage et précis comme un maître stratège, né de la glace et du froid, appelé Frimas',
  )
  if (g.name !== 'Frimas') throw new Error(`nom guidé KO : ${g.name}`)
  if (g.trait !== 'cerebral') throw new Error(`trait guidé KO : ${g.trait}`)
  if (g.stats.def <= g.stats.atk) throw new Error('le style Mur devrait dominer en DEF')
  console.log(`Onboarding guidé OK : ${g.name} (${g.trait}, DEF ${g.stats.def})`)
}

// Vie d'Écurie : humeur → Hype de départ ; bouderie → premier ordre ignoré.
{
  const m = createMatch(ROSTER[0], ROSTER[1], [], { startHype: 15, sulky: true })
  if (m.player.hype !== 15) throw new Error(`startHype KO : ${m.player.hype}`)
  while (m.phase === 'intro') tick(m, 1 / 60, { command: null, voiceEnergy: 0, faceEnergy: 0 })
  m.player.nextActionAt = m.t + 1000
  m.enemy.nextActionAt = m.t + 1000
  const before = m.player.stance
  tick(m, 1 / 60, { command: 'defend', voiceEnergy: 0.3, faceEnergy: 0 })
  if (m.player.stance !== before) throw new Error('sulky : le premier ordre aurait dû être boudé')
  while (m.t - m.player.lastOrderAt < 2.1 && m.phase === 'fighting')
    tick(m, 1 / 60, { command: null, voiceEnergy: 0, faceEnergy: 0 })
  tick(m, 1 / 60, { command: 'defend', voiceEnergy: 0.3, faceEnergy: 0 })
  if (m.phase === 'fighting' && m.player.stance !== 'defensive')
    throw new Error('sulky : le second ordre aurait dû passer (Kenta n’est pas têtu)')
  console.log('Vie d’Écurie OK (Hype de départ + bouderie du premier ordre)')
}

// Paliers de Lien : options de récompense déterministes et distinctes.
{
  const { rewardOptionsFor } = await import('../src/game/progression')
  const [a1, b1] = rewardOptionsFor('kenta', 1)
  const [a2, b2] = rewardOptionsFor('kenta', 1)
  if (a1 !== a2 || b1 !== b2) throw new Error('récompense non déterministe pour un même palier')
  if (a1 === b1) throw new Error('les deux options de récompense sont identiques')
  const [a3] = rewardOptionsFor('kenta', 2)
  void a3 // niveau différent → tirage différent possible (pas d'assertion stricte)
  console.log(`Récompenses de palier OK (niv.1 : ${a1} vs ${b1})`)
}

// Commentateur : un match coaché produit une narration avec début et fin.
{
  const { Commentator } = await import('../src/game/commentator')
  const com = new Commentator()
  const m = createMatch(ROSTER[0], ROSTER[1], buildStarterDeck(null))
  let roundStart = 0
  let prevPhase: string = m.phase
  let lastCmdAt = -10
  for (let i = 0; i < 60 * 60 * 10 && m.phase !== 'matchEnd'; i++) {
    let command: any = null
    if (m.phase === 'fighting' && m.t - lastCmdAt > 4) {
      command = m.player.hype >= 100 ? 'special' : 'attack'
      lastCmdAt = m.t
    }
    tick(m, 1 / 60, { command, voiceEnergy: 0.6, faceEnergy: 0.5 })
    com.ingest(m)
    if (prevPhase !== 'fighting' && m.phase === 'fighting') roundStart = m.t
    prevPhase = m.phase
    if (m.phase === 'fighting' && m.t - roundStart > ROUND_TIME_LIMIT) forceRoundTimeout(m)
    if (m.phase === 'tactics' && m.plan === null) chooseTacticPlan(m, 'pressure')
  }
  if (com.lines.length < 5) throw new Error(`commentateur trop discret : ${com.lines.length} lignes`)
  const last = com.lines[com.lines.length - 1]
  if (!/TERMINÉ|impose/i.test(last.text)) throw new Error(`dernière ligne inattendue : ${last.text}`)
  if (com.lines.some(l => /\{[A-Za-z]+\}/.test(l.text)))
    throw new Error('placeholder non substitué dans la narration')
  console.log(`Commentateur OK (${com.lines.length} lignes, finit sur : « ${last.text} »)`)
}

console.log('OK — tous les matchs se terminent.')
