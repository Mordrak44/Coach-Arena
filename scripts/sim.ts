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
      else if (m.mods.armedCounterMul > 0) command = 'counter'
      else if (m.mods.armedCheerHype > 0) command = 'cheer'
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
  m.mods.immuneConfusion = true
  tick(m, 1 / 60, { command: 'defend', voiceEnergy: 0.3, faceEnergy: 0 })
  tick(m, 1 / 60, { command: 'attack', voiceEnergy: 0.3, faceEnergy: 0 }) // spam volontaire
  if (m.player.confusedUntil > m.t) throw new Error('yunaFocus : la confusion aurait dû être bloquée')
  console.log('Signature Concentration Absolue OK (pas de confusion)')
}

// Signatures : Frénésie (Fang) armée puis déclenchée par « attaque ! ».
{
  const m = makeFightingMatch(4)
  m.mods.armedFrenzyMul = 1.5
  m.mods.armedFrenzyDuration = 5
  // premier ordre ignoré ? Fang est sanguin, pas têtu — l'ordre passe.
  tick(m, 1 / 60, { command: 'attack', voiceEnergy: 0.7, faceEnergy: 0 })
  if (m.mods.frenzyUntil <= m.t - 1 || m.mods.armedFrenzyDuration !== 0)
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

// DSL d'effets : le coût calculé de chaque carte correspond au coût déclaré.
{
  const { CARD_POOL, SIGNATURE_CARDS, computeCost } = await import('../src/game/cards')
  for (const c of [...CARD_POOL, ...SIGNATURE_CARDS]) {
    const computed = computeCost(c.effects)
    if (computed !== c.cost)
      throw new Error(`coût DSL incohérent pour ${c.id} : déclaré ${c.cost}, calculé ${computed}`)
  }
  console.log(`DSL OK : coût budgétisé = coût déclaré pour ${CARD_POOL.length + SIGNATURE_CARDS.length} cartes`)
}

// Deck-builder : sanitation, bornes, et composition du deck jouable.
{
  const {
    buildDeckFromTemplate,
    defaultTemplate,
    sanitizeTemplate,
    templateSize,
    templateValid,
  } = await import('../src/game/deckBuilder')
  const dflt = defaultTemplate()
  if (!templateValid(dflt)) throw new Error('deck-builder : le modèle par défaut devrait être valide')
  // Un modèle trafiqué (copies négatives / absurdes / cartes inconnues) est nettoyé.
  const dirty = sanitizeTemplate({ secondWind: -5, massage: 99, ['forge-hack' as any]: 3 } as any)
  if ((dirty.secondWind ?? -1) !== 0 || (dirty.massage ?? -1) !== 3)
    throw new Error('deck-builder : sanitation KO')
  if ('forge-hack' in dirty) throw new Error('deck-builder : carte inconnue non filtrée')
  // Composition : modèle + signature (2) + paliers + forgées.
  const deck = buildDeckFromTemplate(dflt, 'sigKenta', ['focus'], [])
  const expected = templateSize(dflt) + 2 + 1
  if (deck.length !== expected)
    throw new Error(`deck-builder : taille ${deck.length}, attendu ${expected}`)
  console.log(`Deck-builder OK (défaut ${templateSize(dflt)} cartes, composition ${deck.length})`)
}

// Coin adverse : vrai deck — sabotage, soin, mods symétriques, provocation.
{
  const { enemyCornerPlay } = await import('../src/game/combat')
  const forceHand = (m: MatchState, ids: CardId[]) => {
    m.enemyDeck = []
    m.enemyDiscard = []
    m.enemyHand = [...ids]
  }

  // Sabotage : Hype joueur haute + Douche Froide en main → elle est jouée.
  const m = createMatch(ROSTER[0], ROSTER[1], [])
  m.player.hype = 80
  forceHand(m, ['coldShower'])
  enemyCornerPlay(m)
  const ev = m.events[m.events.length - 1]
  if (ev.kind !== 'card' || !ev.name.includes('adverse'))
    throw new Error('coin adverse : événement manquant')
  if (m.player.hype >= 80) throw new Error('coin adverse : la Douche Froide aurait dû saper la Hype')
  if (m.enemySouffle >= 3) throw new Error('coin adverse : le Souffle aurait dû être dépensé')

  // Soin : PV bas + Second Souffle en main → il se soigne.
  const m2 = createMatch(ROSTER[0], ROSTER[1], [])
  m2.enemy.hp = Math.round(m2.enemy.maxHp * 0.3)
  forceHand(m2, ['secondWind'])
  const hpBefore = m2.enemy.hp
  enemyCornerPlay(m2)
  if (m2.enemy.hp <= hpBefore) throw new Error('coin adverse : il aurait dû se soigner')

  // Mods symétriques : sa Garde de Fer arme SES mods, pas ceux du joueur.
  const m3 = createMatch(ROSTER[0], ROSTER[1], [])
  forceHand(m3, ['ironGuard'])
  enemyCornerPlay(m3)
  if (m3.enemyMods.damageReductionMul >= 1)
    throw new Error('coin adverse : ironGuard aurait dû armer enemyMods.damageReductionMul')
  if (m3.mods.damageReductionMul < 1)
    throw new Error('coin adverse : les mods du joueur ne doivent pas bouger')

  // Provocation adverse : le perso du joueur démarre le round agressif.
  const m4 = createMatch(ROSTER[0], ROSTER[1], [])
  forceHand(m4, ['provocation'])
  enemyCornerPlay(m4)
  if (m4.enemyMods.provokedUntil !== -1) throw new Error('coin adverse : provocation non armée')
  m4.phase = 'tactics'
  m4.phaseUntil = m4.t // expire immédiatement → startNextRound
  tick(m4, 1 / 60, { command: null, voiceEnergy: 0, faceEnergy: 0 })
  if (m4.player.stance !== 'aggressive')
    throw new Error('coin adverse : le joueur provoqué devrait être verrouillé agressif')
  console.log('Coin adverse (vrai deck) OK : sabotage, soin, mods symétriques, provocation')
}

// Consignes parlées au coin du ring (parseur local v0, futur fallback Claude).
{
  const { parseConsigne } = await import('../src/game/speechTactics')
  const { applyConsigne } = await import('../src/game/combat')

  const c1 = parseConsigne("s'il sort son spécial tu esquives d'accord")
  if (!c1 || !c1.effects.some(e => e.kind === 'halveEnemySpecial'))
    throw new Error('consigne : le spécial adverse aurait dû être anticipé')
  const c2 = parseConsigne('respire un bon coup et garde haute surtout')
  if (!c2 || c2.effects.length !== 2)
    throw new Error(`consigne : heal + garde attendus (reçu ${c2?.effects.length ?? 0})`)
  if (parseConsigne('euh') !== null) throw new Error('consigne : le bruit court devrait être ignoré')
  if (parseConsigne('il fait beau ce soir non ?') !== null)
    throw new Error('consigne : une phrase sans mot-clé devrait être ignorée')

  const m = createMatch(ROSTER[0], ROSTER[1], [])
  m.phase = 'tactics'
  if (!applyConsigne(m, c1.effects, c1.label)) throw new Error('consigne : application refusée')
  if (!m.mods.halveEnemySpecial) throw new Error('consigne : mod non appliqué')
  const ev = m.events[m.events.length - 1]
  if (ev.kind !== 'card' || !ev.name.startsWith('🎤'))
    throw new Error('consigne : événement 🎤 manquant')
  if (applyConsigne(m, c2.effects, c2.label)) throw new Error('consigne : une seule par pause')
  console.log(`Consignes parlées OK (« ${c1.label} », une par pause)`)
}

// Réalisateur : moments forts détectés → prompts de scènes prêts pour Kling.
{
  const { buildScenePlans, colorWord } = await import('../src/game/sceneDirector')
  if (colorWord('#ff4757') !== 'red' || colorWord('#3742fa') !== 'blue')
    throw new Error(`réalisateur : colorWord (${colorWord('#ff4757')}, ${colorWord('#3742fa')})`)

  const m = createMatch(ROSTER[0], ROSTER[1], [])
  // Match synthétique : round 1 avec spécial adverse, round 2 avec Ulti joueur.
  m.events.push(
    { kind: 'special', t: 10, by: 'enemy', name: ROSTER[1].special.name, onoma: ROSTER[1].special.onomatopoeia, dmg: 40 },
    { kind: 'roundEnd', t: 30, winner: 'enemy' },
    { kind: 'roundStart', t: 34, round: 2 },
    { kind: 'ulti', t: 50, by: 'player', name: ROSTER[0].ulti.name, onoma: ROSTER[0].ulti.onomatopoeia, dmg: 80 },
    { kind: 'roundEnd', t: 55, winner: 'player' },
    { kind: 'roundStart', t: 59, round: 3 },
    { kind: 'hit', t: 70, target: 'enemy', dmg: 20, crit: true, onoma: 'DOKAN!!' },
    { kind: 'roundEnd', t: 75, winner: 'player' },
    { kind: 'matchEnd', t: 75, winner: 'player' },
  )
  m.playerWins = 2
  m.enemyWins = 1
  const plans = buildScenePlans(m, ROSTER[0], ROSTER[1])
  if (plans.length !== 4) throw new Error(`réalisateur : 4 scènes attendues, reçu ${plans.length}`)
  if (plans[0].id !== 'entrance' || plans[plans.length - 1].id !== 'finale')
    throw new Error('réalisateur : entrée/finale manquantes')
  if (!plans.some(p => p.prompt.includes(ROSTER[0].ulti.name)))
    throw new Error("réalisateur : l'Ulti du joueur aurait dû être un moment fort")
  for (const p of plans) {
    if (p.prompt.includes('undefined') || p.prompt.includes('#'))
      throw new Error(`réalisateur : prompt sale (${p.id})`)
  }
  console.log(`Réalisateur OK (${plans.length} scènes : ${plans.map(p => p.id).join(', ')})`)
}

// Forge de cartes : prompt → primitives bornées + coût budgétisé + jouable en match.
{
  const { forgeCard } = await import('../src/game/cardForge')
  const { registerCustomCard } = await import('../src/game/cards')
  const r = forgeCard('une carte qui soigne un peu et motive les troupes, appelée Regain')
  if (!r) throw new Error('forge : aucun effet reconnu')
  const kinds = r.card.effects.map(e => e.kind).sort()
  if (JSON.stringify(kinds) !== JSON.stringify(['heal', 'hype']))
    throw new Error(`forge : primitives inattendues ${kinds}`)
  if (r.card.name !== 'Regain') throw new Error(`forge : nom ${r.card.name}`)
  if (r.card.cost < 1 || r.card.cost > 3) throw new Error(`forge : coût hors bornes ${r.card.cost}`)
  if (forgeCard('blablabla sans aucun sens') !== null)
    throw new Error('forge : un prompt sans effet devrait être refusé')
  // La carte forgée est jouable : dans un match, elle soigne réellement.
  registerCustomCard(r.card)
  const m = createMatch(ROSTER[0], ROSTER[1], [r.card.id, r.card.id, r.card.id, r.card.id, r.card.id])
  // avance jusqu'à la première phase tactique
  let lastCmdAt = -10
  let roundStart = 0
  let prevPhase: string = m.phase
  while (m.phase !== 'tactics' && m.phase !== 'matchEnd') {
    let command: any = null
    if (m.phase === 'fighting' && m.t - lastCmdAt > 4) {
      command = 'attack'
      lastCmdAt = m.t
    }
    tick(m, 1 / 60, { command, voiceEnergy: 0.5, faceEnergy: 0.5 })
    if (prevPhase !== 'fighting' && m.phase === 'fighting') roundStart = m.t
    prevPhase = m.phase
    if (m.phase === 'fighting' && m.t - roundStart > ROUND_TIME_LIMIT) forceRoundTimeout(m)
  }
  if (m.phase === 'tactics') {
    const hpBefore = m.player.hp
    const hypeBefore = m.player.hype
    if (!playCard(m, r.card.id)) throw new Error('forge : carte injouable en phase tactique')
    if (m.player.hp <= hpBefore && m.player.hype <= hypeBefore)
      throw new Error('forge : la carte jouée n’a eu aucun effet')
  }
  console.log(`Forge OK : « ${r.card.name} » (${kinds.join('+')}, coût ${r.card.cost}) jouée en match`)
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
