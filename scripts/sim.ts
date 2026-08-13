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
  const m: MatchState = createMatch(ROSTER[0], ROSTER[1], opts.deck ?? [])
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
console.log(`Perso prompt OK : ${c.name} ${JSON.stringify(c.stats)}`)
console.log('OK — tous les matchs se terminent.')
