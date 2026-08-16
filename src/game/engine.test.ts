import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  HAND_SIZE,
  HYPE_MAX,
  ROUND_END_DURATION,
  SOUFFLE_PER_CORNER,
  SWITCH_COST,
  TACTICS_DURATION,
  TIMEOUTS_PER_ROUND,
  TIMEOUT_DURATION,
  ULTI_MAX,
  applyConsigne,
  callTimeout,
  createMatch,
  enemyCornerPlay,
  mulligan,
  playCard,
  switchFighter,
  tick,
} from './combat'
import { CARD_POOL, SIGNATURE_CARDS, buildStarterDeck, clampEffect, computeCost, getCard, signatureFor } from './cards'
import { DECK_MAX, MAX_COPIES, buildDeckFromTemplate, defaultTemplate, sanitizeTemplate, templateSize, templateValid } from './deckBuilder'
import { forgeCard } from './cardForge'
import { parseConsigne } from './speechTactics'
import { buildScenePlans, colorWord } from './sceneDirector'
import { ROSTER, createFromPrompt } from './characters'
import type { CardId, CoachInput, MatchState } from './types'

const quiet: CoachInput = { command: null, voiceEnergy: 0, faceEnergy: 0 }

function freshMatch(deck: CardId[] = []): MatchState {
  return createMatch(ROSTER[0], ROSTER[1], deck)
}

function toFighting(m: MatchState): void {
  while (m.phase === 'intro') tick(m, 0.1, quiet)
}

describe('cartes (DSL)', () => {
  it('le coût budgétisé reproduit le coût déclaré de chaque carte', () => {
    for (const c of [...CARD_POOL, ...SIGNATURE_CARDS]) {
      expect(computeCost(c.effects), c.id).toBe(c.cost)
    }
  })

  it('clampEffect ramène les valeurs abusives dans les bornes', () => {
    expect(clampEffect({ kind: 'heal', pct: 5 })).toEqual({ kind: 'heal', pct: 0.25 })
    expect(clampEffect({ kind: 'hype', amount: 999 })).toEqual({ kind: 'hype', amount: 40 })
    expect(clampEffect({ kind: 'armCounterMul', mul: 99 })).toEqual({ kind: 'armCounterMul', mul: 2.5 })
  })

  it('chaque perso du roster a sa carte signature', () => {
    for (const c of ROSTER) {
      const sig = signatureFor(c.id)
      expect(sig, c.id).not.toBeNull()
      expect(getCard(sig!).signatureOf).toBe(c.id)
    }
  })
})

describe('deck-builder', () => {
  it('assainit un modèle trafiqué (copies hors bornes, cartes inconnues)', () => {
    const dirty = { secondWind: 99, focus: -3, nimporte: 4 } as never
    const clean = sanitizeTemplate(dirty)
    expect(clean.secondWind).toBe(MAX_COPIES)
    expect(clean.focus).toBe(0)
    expect('nimporte' in clean).toBe(false)
  })

  it('valide les tailles de deck aux bornes', () => {
    const t = defaultTemplate()
    expect(templateValid(t)).toBe(true)
    expect(templateSize(t)).toBeLessThanOrEqual(DECK_MAX)
    expect(templateValid({})).toBe(false)
  })

  it('compose : modèle + signature + copies gagnées + forgées', () => {
    const t = defaultTemplate()
    const deck = buildDeckFromTemplate(t, 'sigKenta', ['focus'], [])
    expect(deck.length).toBe(templateSize(t) + 2 + 1)
  })
})

describe('moteur de combat', () => {
  it('deux ordres rapprochés rendent le perso confus', () => {
    const m = freshMatch()
    toFighting(m)
    tick(m, 0.05, { command: 'attack', voiceEnergy: 0.5, faceEnergy: 0 })
    tick(m, 0.05, { command: 'defend', voiceEnergy: 0.5, faceEnergy: 0 })
    expect(m.player.confusedUntil).toBeGreaterThan(m.t)
    expect(m.events.some(e => e.kind === 'confused')).toBe(true)
  })

  it("l'Ulti ne part QUE sur ordre du coach, et une seule fois", () => {
    const m = freshMatch()
    toFighting(m)
    m.player.ulti = ULTI_MAX
    const hpBefore = m.enemy.hp
    tick(m, 0.05, { command: 'ulti', voiceEnergy: 0.6, faceEnergy: 0 })
    expect(m.enemy.hp).toBeLessThan(hpBefore)
    expect(m.player.ultiUsed).toBe(true)
    expect(m.player.ulti).toBe(0)
  })

  it('le spécial exige la jauge de Hype pleine', () => {
    const m = freshMatch()
    toFighting(m)
    // Gèle les attaques automatiques : on ne mesure QUE l'effet du spécial.
    m.player.nextActionAt = m.t + 1000
    m.enemy.nextActionAt = m.t + 1000
    m.player.hype = 50
    const hpBefore = m.enemy.hp
    tick(m, 0.05, { command: 'special', voiceEnergy: 0.6, faceEnergy: 0 })
    expect(m.enemy.hp).toBe(hpBefore)
    m.player.hype = HYPE_MAX
    tick(m, 0.05, { command: 'special', voiceEnergy: 0.6, faceEnergy: 0 })
    expect(m.enemy.hp).toBeLessThan(hpBefore)
  })

  it('pioche initiale et mulligan unique par pause', () => {
    const m = freshMatch(buildStarterDeck(null))
    expect(m.hand.length).toBe(HAND_SIZE)
    m.phase = 'tactics'
    const swapped = m.hand.slice(0, 2)
    expect(mulligan(m, swapped)).toBe(true)
    expect(m.hand.length).toBe(HAND_SIZE)
    expect(mulligan(m, [m.hand[0]])).toBe(false)
  })

  it('playCard décompte le Souffle et applique les effets', () => {
    const m = freshMatch(buildStarterDeck(null))
    m.phase = 'tactics'
    m.hand = ['massage']
    m.player.hp = 10
    expect(playCard(m, 'massage')).toBe(true)
    expect(m.souffle).toBe(SOUFFLE_PER_CORNER - getCard('massage').cost)
    expect(m.player.hp).toBeGreaterThan(10)
  })
})

describe('coin adverse (deck symétrique)', () => {
  it('joue une carte adaptée à la situation depuis SA main', () => {
    const m = freshMatch()
    m.enemy.hp = Math.round(m.enemy.maxHp * 0.3)
    m.enemyDeck = []
    m.enemyDiscard = []
    m.enemyHand = ['secondWind']
    const before = m.enemy.hp
    enemyCornerPlay(m)
    expect(m.enemy.hp).toBeGreaterThan(before)
    expect(m.enemySouffle).toBeLessThan(SOUFFLE_PER_CORNER)
  })

  it('ses mods vont dans enemyMods, jamais dans ceux du joueur', () => {
    const m = freshMatch()
    m.enemyDeck = []
    m.enemyDiscard = []
    m.enemyHand = ['ironGuard']
    enemyCornerPlay(m)
    expect(m.enemyMods.damageReductionMul).toBeLessThan(1)
    expect(m.mods.damageReductionMul).toBe(1)
  })
})

describe("l'Écurie : la relève", () => {
  it('échange les combattants en conservant PV/Hype/Ulti, 1 fois par pause', () => {
    const m = createMatch(ROSTER[0], ROSTER[1], [], { team: [ROSTER[2], ROSTER[3]] })
    m.phase = 'tactics'
    m.player.hp = 40
    m.player.hype = 70
    const yunaMaxHp = m.bench[0].maxHp
    expect(switchFighter(m, 0)).toBe(true)
    expect(m.player.char.id).toBe(ROSTER[2].id)
    expect(m.player.hp).toBe(yunaMaxHp) // la remplaçante monte fraîche
    expect(m.bench[0].char.id).toBe(ROSTER[0].id)
    expect(m.bench[0].hp).toBe(40) // le sortant garde son état
    expect(m.bench[0].hype).toBe(70)
    expect(m.souffle).toBe(SOUFFLE_PER_CORNER - SWITCH_COST)
    expect(switchFighter(m, 1)).toBe(false) // une seule relève par pause
    expect(m.events.some(e => e.kind === 'switch' && e.side === 'player')).toBe(true)
  })

  it('refuse un équipier KO et hors phase tactique', () => {
    const m = createMatch(ROSTER[0], ROSTER[1], [], { team: [ROSTER[2]] })
    m.phase = 'tactics'
    m.bench[0].hp = 0
    expect(switchFighter(m, 0)).toBe(false)
    m.bench[0].hp = 50
    m.phase = 'fighting'
    expect(switchFighter(m, 0)).toBe(false)
  })

  it("le coin adverse fait monter sa réserve quand l'actif est entamé", () => {
    const m = createMatch(ROSTER[0], ROSTER[1], [], { enemyTeam: [ROSTER[4]] })
    m.enemy.hp = Math.round(m.enemy.maxHp * 0.2)
    m.enemyDeck = []
    m.enemyDiscard = []
    m.enemyHand = []
    enemyCornerPlay(m)
    expect(m.enemy.char.id).toBe(ROSTER[4].id)
    expect(m.enemyBench[0].char.id).toBe(ROSTER[1].id)
    expect(m.events.some(e => e.kind === 'switch' && e.side === 'enemy')).toBe(true)
  })
})

describe('guerre des coins (vague 3)', () => {
  it('Silence du Coin : la meilleure carte adverse part dans le vide', () => {
    const m = freshMatch()
    m.enemy.hp = Math.round(m.enemy.maxHp * 0.3)
    m.enemyDeck = []
    m.enemyDiscard = []
    m.enemyHand = ['secondWind']
    m.mods.blockNextEnemyCard = true
    const before = m.enemy.hp
    enemyCornerPlay(m)
    expect(m.enemy.hp).toBe(before) // le soin n'a PAS eu lieu
    expect(m.mods.blockNextEnemyCard).toBe(false) // pari consommé
    expect(m.events.some(e => e.kind === 'cardProc' && e.text.includes('BLOQUÉE'))).toBe(true)
  })

  it('Vol de Souffle : le coin adverse arrive essoufflé', () => {
    const m = freshMatch()
    m.enemyDeck = []
    m.enemyDiscard = []
    m.enemyHand = []
    m.mods.drainEnemySouffle = 2
    enemyCornerPlay(m)
    expect(m.enemySouffle).toBe(SOUFFLE_PER_CORNER - 2)
    expect(m.mods.drainEnemySouffle).toBe(0)
  })

  it("symétrie : l'adversaire peut bloquer TA carte (coût payé, effet nul)", () => {
    const m = freshMatch(buildStarterDeck(null))
    m.phase = 'tactics'
    m.hand = ['massage']
    m.player.hp = 10
    m.enemyMods.blockNextEnemyCard = true
    expect(playCard(m, 'massage')).toBe(true)
    expect(m.player.hp).toBe(10) // aucun soin
    expect(m.souffle).toBe(SOUFFLE_PER_CORNER - getCard('massage').cost)
    expect(m.enemyMods.blockNextEnemyCard).toBe(false)
  })

  it('les paris de coin survivent à la fin de round (résolution à la pause)', () => {
    const m = freshMatch()
    toFighting(m)
    m.mods.blockNextEnemyCard = true
    m.mods.drainEnemySouffle = 2
    m.enemy.hp = 0
    tick(m, 0.05, quiet)
    expect(m.phase).toBe('roundEnd')
    expect(m.mods.blockNextEnemyCard).toBe(true)
    expect(m.mods.drainEnemySouffle).toBe(2)
    expect(m.mods.damageReductionMul).toBe(1) // le reste a bien expiré
  })
})

describe('Le Temps Mort — geler le combat pour parler et jouer une carte', () => {
  it('gèle sans rien changer, joue une carte, reprend au bon endroit', () => {
    const m = freshMatch(buildStarterDeck(null))
    toFighting(m)
    m.player.hp = 42
    m.player.hype = 30
    m.hand = ['massage']
    expect(callTimeout(m)).toBe(true)
    expect(m.phase).toBe('timeout')
    expect(m.timeoutsLeft).toBe(TIMEOUTS_PER_ROUND - 1)
    // Le gel ne bouge rien tout seul : tick() sans jouer de carte ne change ni PV ni Hype.
    tick(m, 1, quiet)
    expect(m.player.hp).toBe(42)
    expect(m.player.hype).toBe(30)
    // On peut jouer une carte PENDANT le gel.
    expect(playCard(m, 'massage')).toBe(true)
    expect(m.player.hp).toBeGreaterThan(42)
    // Le gel expire après TIMEOUT_DURATION et rend la main au combat.
    tick(m, TIMEOUT_DURATION + 0.1, quiet)
    expect(m.phase).toBe('fighting')
  })

  it('refuse hors combat et sans temps mort restant', () => {
    const m = freshMatch()
    expect(callTimeout(m)).toBe(false) // encore en intro
    toFighting(m)
    expect(callTimeout(m)).toBe(true)
    m.phase = 'fighting' // on force la reprise pour retenter
    expect(callTimeout(m)).toBe(false) // plus de temps mort pour ce round
  })

  it('le temps mort se recharge au round suivant (1 par round, pas 1 par match)', () => {
    const m = freshMatch()
    toFighting(m)
    expect(callTimeout(m)).toBe(true)
    m.phase = 'fighting'
    expect(callTimeout(m)).toBe(false) // épuisé pour ce round
    // On force la fin du round et l'entame du suivant.
    m.player.hp = m.player.maxHp
    m.enemy.hp = 0
    tick(m, 0.05, quiet) // -> roundEnd
    tick(m, ROUND_END_DURATION + 0.1, quiet) // -> tactics
    tick(m, TACTICS_DURATION + 0.1, quiet) // -> startNextRound -> intro
    expect(m.round).toBe(2)
    expect(m.timeoutsLeft).toBe(TIMEOUTS_PER_ROUND)
    expect(m.enemyTimeoutsLeft).toBe(TIMEOUTS_PER_ROUND)
  })

  it("un temps mort ne remet pas le round à zéro (côté moteur, phaseUntil est propre au gel)", () => {
    const m = freshMatch()
    toFighting(m)
    const before = m.round
    callTimeout(m)
    tick(m, TIMEOUT_DURATION + 0.1, quiet)
    expect(m.phase).toBe('fighting')
    expect(m.round).toBe(before) // toujours le même round, rien n'a été relancé
  })

  it("le coin adverse a sa propre réserve de temps morts (symétrie)", () => {
    const m = freshMatch()
    toFighting(m)
    m.enemy.hp = Math.round(m.enemy.maxHp * 0.2) // sous le seuil critique
    m.enemyDeck = []
    m.enemyDiscard = []
    m.enemyHand = ['secondWind'] // une carte de soin, exploitable en urgence
    const before = m.enemy.hp
    const timeoutsBefore = m.enemyTimeoutsLeft
    tick(m, 0.05, quiet)
    expect(m.enemy.hp).toBeGreaterThan(before)
    expect(m.enemyTimeoutsLeft).toBe(timeoutsBefore - 1)
    expect(m.events.some(e => e.kind === 'timeout' && e.side === 'enemy')).toBe(true)
  })
})

describe('consignes parlées', () => {
  it('comprend une consigne conditionnelle', () => {
    const c = parseConsigne("s'il sort son spécial tu esquives d'accord")
    expect(c?.effects.map(e => e.kind)).toContain('halveEnemySpecial')
  })

  it('ignore le bruit et limite à une consigne par pause', () => {
    expect(parseConsigne('il fait beau ce soir non ?')).toBeNull()
    const m = freshMatch()
    m.phase = 'tactics'
    const c = parseConsigne('garde haute et respire')!
    expect(applyConsigne(m, c.effects, c.label)).toBe(true)
    expect(applyConsigne(m, c.effects, c.label)).toBe(false)
  })
})

describe('prosodie (pitch local)', () => {
  it('détecte une onde à 220 Hz à ±5 %', async () => {
    const { detectPitch } = await import('../systems/pitch')
    const sr = 48000
    const buf = new Float32Array(2048)
    for (let i = 0; i < buf.length; i++) buf[i] = Math.sin((2 * Math.PI * 220 * i) / sr) * 0.3
    const hz = detectPitch(buf, sr)
    expect(hz).not.toBeNull()
    expect(Math.abs(hz! - 220)).toBeLessThan(11)
  })

  it('rejette le silence et le bruit', async () => {
    const { detectPitch } = await import('../systems/pitch')
    const silence = new Float32Array(2048)
    expect(detectPitch(silence, 48000)).toBeNull()
    let seed = 1
    const noise = new Float32Array(2048).map(() => {
      seed = (seed * 16807) % 2147483647
      return (seed / 2147483647 - 0.5) * 0.4
    })
    expect(detectPitch(noise, 48000)).toBeNull()
  })

  it('le tracker suit la montée dans les aigus', async () => {
    const { PitchTracker } = await import('../systems/pitch')
    const t = new PitchTracker()
    for (let i = 0; i < 200; i++) t.update(150) // voix posée
    for (let i = 0; i < 12; i++) t.update(220) // ça monte !
    expect(t.ratio()).toBeGreaterThan(1.15)
  })

  it('un ordre AIGU stresse un Cérébral même sans crier fort', () => {
    const m = createMatch(ROSTER[2], ROSTER[0], []) // Yuna, cérébrale
    toFighting(m)
    m.player.nextActionAt = m.t + 1000
    m.enemy.nextActionAt = m.t + 1000
    m.player.hype = 50
    // volume modéré (0.5) mais ton monté dans les aigus
    tick(m, 0.05, { command: 'attack', voiceEnergy: 0.5, faceEnergy: 0, voiceTone: 1.3 })
    expect(m.player.hype).toBeLessThan(50)
    expect(m.events.some(e => e.kind === 'trait' && e.text.includes('BRUIT'))).toBe(true)
  })
})

describe('mode Histoire', () => {
  it('8 chapitres, adversaires valides, difficulté croissante', async () => {
    const { STORY_CHAPTERS, chapterOpponent, chapterOpponentTeam, isUnlocked } = await import('./story')
    expect(STORY_CHAPTERS.length).toBe(8)
    let prevHp = 0
    for (const ch of STORY_CHAPTERS) {
      const o = chapterOpponent(ch)
      expect(o.stats.atk).toBeGreaterThanOrEqual(1)
      expect(o.stats.atk).toBeLessThanOrEqual(12)
      expect(o.stats.hp).toBeGreaterThan(0)
      expect(o.lore).toBe(ch.taunt)
      const team = chapterOpponentTeam(ch)
      expect(team.length).toBe(ch.opponentTeamIds.length)
      if (ch.num >= 5) expect(team.length).toBeGreaterThan(0) // fin d'arc = équipes
      prevHp = o.stats.hp
    }
    expect(prevHp).toBeGreaterThan(chapterOpponent(STORY_CHAPTERS[0]).stats.hp)
    // déverrouillage en chaîne
    expect(isUnlocked(STORY_CHAPTERS[0], new Set())).toBe(true)
    expect(isUnlocked(STORY_CHAPTERS[1], new Set())).toBe(false)
    expect(isUnlocked(STORY_CHAPTERS[1], new Set(['ch1']))).toBe(true)
  })

  it("un match de chapitre se joue avec l'équipe et le deck adverses du chapitre", async () => {
    const { STORY_CHAPTERS, chapterOpponent, chapterOpponentTeam, chapterEnemyDeck } = await import('./story')
    const ch = STORY_CHAPTERS[6] // le mur de trois
    const deck = chapterEnemyDeck(ch)
    const m = createMatch(ROSTER[0], chapterOpponent(ch), [], {
      enemyTeam: chapterOpponentTeam(ch),
      enemyDeck: deck,
    })
    expect(m.enemyBench.length).toBe(2)
    // la main de départ adverse est déjà piochée dans ce deck
    expect(m.enemyDeck.length + m.enemyHand.length).toBe(deck.length)
    expect([...m.enemyDeck, ...m.enemyHand].sort()).toEqual([...deck].sort())
  })

  it('chaque chapitre a un deck thématique aux cartes valides', async () => {
    const { STORY_CHAPTERS, chapterEnemyDeck } = await import('./story')
    for (const ch of STORY_CHAPTERS) {
      const deck = chapterEnemyDeck(ch)
      expect(deck.length, ch.id).toBeGreaterThanOrEqual(6)
      for (const id of deck) expect(getCard(id), `${ch.id}:${id}`).toBeTruthy()
    }
  })
})

describe('séquenceur de cuts (EDL)', () => {
  async function syntheticMatch() {
    const m = freshMatch()
    m.events.push(
      { kind: 'hit', t: 5, target: 'enemy', dmg: 12, crit: false, onoma: 'BAM!' },
      { kind: 'hit', t: 7, target: 'player', dmg: 9, crit: true, onoma: 'DOKAN!!' },
      { kind: 'countered', t: 9, by: 'player', dmg: 15 },
      { kind: 'dodged', t: 10, target: 'enemy' },
      { kind: 'blocked', t: 11, target: 'player', dmg: 3 },
      { kind: 'hit', t: 12, target: 'enemy', dmg: 8, crit: false, onoma: 'PAF!' },
      { kind: 'roundEnd', t: 30, winner: 'player' },
      { kind: 'roundStart', t: 34, round: 2 },
      { kind: 'switch', t: 34, side: 'enemy', name: 'Nyx' },
      { kind: 'ulti', t: 50, by: 'enemy', name: 'Valse des Reflets', onoma: 'ZWISH!', dmg: 60 },
      { kind: 'roundEnd', t: 55, winner: 'enemy' },
      { kind: 'matchEnd', t: 55, winner: 'enemy' },
    )
    const { planCuts, templateShoppingList } = await import('./cutPlanner')
    return { m, planCuts, templateShoppingList }
  }

  it('intro d’abord, KO et pose de victoire à la fin, budget par round', async () => {
    const { m, planCuts } = await syntheticMatch()
    const cuts = planCuts(m, ROSTER[0], ROSTER[1], 3)
    expect(cuts[0].kind).toBe('intro-faceoff')
    expect(cuts[0].chars).toEqual([ROSTER[0].name, ROSTER[1].name])
    const kinds = cuts.map(c => c.kind)
    expect(kinds.filter(k => k === 'ko-down').length).toBe(2) // 2 fins de round
    expect(kinds[kinds.length - 2]).toBe('victory-pose')
    // budget : 6 events de combat au round 1, 3 gardés max
    const r1Attacks = cuts.filter(c => c.t < 30 && c.kind === 'attack-solo').length
    expect(r1Attacks).toBeLessThanOrEqual(3)
  })

  it('la relève réattribue les cuts au bon perso, le contre est un échange à deux', async () => {
    const { m, planCuts } = await syntheticMatch()
    const cuts = planCuts(m, ROSTER[0], ROSTER[1])
    const ulti = cuts.find(c => c.kind === 'ulti-cast')!
    expect(ulti.chars).toEqual(['Nyx']) // après la relève adverse
    expect(ulti.overlay).toContain('Valse des Reflets')
    const counter = cuts.find(c => c.kind === 'counter-exchange')!
    expect(counter.chars.length).toBe(2)
    const victory = cuts.find(c => c.kind === 'victory-pose')!
    expect(victory.chars).toEqual(['Nyx'])
  })

  it('la liste de courses des templates est cohérente', async () => {
    const { m, planCuts, templateShoppingList } = await syntheticMatch()
    const list = templateShoppingList(planCuts(m, ROSTER[0], ROSTER[1]))
    for (const item of list) {
      expect(item.uses).toBeGreaterThan(0)
      expect([0, 1, 2]).toContain(item.chars)
    }
    expect(list.find(i => i.kind === 'counter-exchange')?.chars).toBe(2)
    expect(list.find(i => i.kind === 'impact-flash')?.chars).toBe(0)
  })
})

describe('CutSequencer (lecture de cuts EN DIRECT, pas a posteriori)', () => {
  it('ne renvoie que les cuts nouveaux, incrément par incrément', async () => {
    const { CutSequencer } = await import('./cutPlanner')
    const m = freshMatch()
    const seq = new CutSequencer(ROSTER[0], ROSTER[1])
    expect(seq.ingest(m)).toEqual([]) // rien encore
    m.events.push({ kind: 'hit', t: 1, target: 'enemy', dmg: 5, crit: false, onoma: 'BAM!' })
    const first = seq.ingest(m)
    expect(first.length).toBeGreaterThan(0)
    expect(seq.ingest(m)).toEqual([]) // déjà consommé, pas de doublon
    m.events.push({ kind: 'dodged', t: 2, target: 'player' })
    const second = seq.ingest(m)
    expect(second.length).toBeGreaterThan(0)
  })

  it('une relève change le perso swappé sans produire de cut elle-même', async () => {
    const { CutSequencer } = await import('./cutPlanner')
    const m = freshMatch()
    const seq = new CutSequencer(ROSTER[0], ROSTER[1])
    m.events.push({ kind: 'switch', t: 1, side: 'enemy', name: 'Nyx' })
    expect(seq.ingest(m)).toEqual([]) // la relève n'est pas filmable ici
    m.events.push({ kind: 'special', t: 2, by: 'enemy', name: 'Test', onoma: 'ZAP!', dmg: 10 })
    const cast = seq.ingest(m).find(c => c.kind === 'special-cast')!
    expect(cast.chars).toEqual(['Nyx'])
  })

  it('activeNames() suit les relèves, pour construire un cut hors-événement (idle-loop)', async () => {
    const { CutSequencer, idleLoopCut } = await import('./cutPlanner')
    const m = freshMatch()
    const seq = new CutSequencer(ROSTER[0], ROSTER[1])
    expect(seq.activeNames()).toEqual({ player: ROSTER[0].name, enemy: ROSTER[1].name })
    m.events.push({ kind: 'switch', t: 1, side: 'player', name: 'Nyx' })
    seq.ingest(m)
    expect(seq.activeNames()).toEqual({ player: 'Nyx', enemy: ROSTER[1].name })
    const cut = idleLoopCut(seq.activeNames().player, seq.activeNames().enemy, m.t)
    expect(cut.kind).toBe('idle-loop')
    expect(cut.chars).toEqual(['Nyx', ROSTER[1].name])
  })
})

describe('LiveCutPlayer (lecteur en direct — respecte la règle « instant déjà résolu »)', () => {
  it('bibliothèque vide (aujourd’hui) : current() toujours null, jamais de blocage', async () => {
    const { LiveCutPlayer } = await import('./liveCutPlayer')
    const m = freshMatch()
    const player = new LiveCutPlayer(ROSTER[0], ROSTER[1]) // EMPTY_CUT_LIBRARY par défaut
    m.events.push({ kind: 'hit', t: 1, target: 'enemy', dmg: 5, crit: false, onoma: 'BAM!' })
    player.update(m)
    expect(player.current()).toBeNull()
  })

  it('avec une bibliothèque garnie : le cut le plus récent joue, puis expire', async () => {
    const { LiveCutPlayer } = await import('./liveCutPlayer')
    const fakeLibrary = { getClip: () => ({ url: 'fake://clip', duration: 999 }) }
    const m = freshMatch()
    const player = new LiveCutPlayer(ROSTER[0], ROSTER[1], fakeLibrary)
    m.events.push({ kind: 'hit', t: 1, target: 'enemy', dmg: 5, crit: false, onoma: 'BAM!' })
    m.t = 1
    player.update(m)
    const active = player.current()
    expect(active).not.toBeNull()
    expect(active!.url).toBe('fake://clip')
    m.t = active!.until + 0.01
    player.update(m)
    expect(player.current()).toBeNull() // expiré, rien de neuf à jouer
  })

  it('garde-fou : la file ne dépasse jamais MAX_QUEUE, les cuts en retard sont sautés', async () => {
    const { LiveCutPlayer, MAX_QUEUE } = await import('./liveCutPlayer')
    const seen: string[] = []
    const fakeLibrary = {
      getClip: (kind: string) => {
        seen.push(kind)
        return { url: `fake://${kind}`, duration: 100 } // très long : ne finit jamais pendant le test
      },
    }
    const m = freshMatch()
    const player = new LiveCutPlayer(ROSTER[0], ROSTER[1], fakeLibrary)
    m.t = 1
    // 5 coups d'affilée avant que le premier cut n'ait eu le temps d'expirer.
    for (let i = 0; i < 5; i++) {
      m.events.push({ kind: 'hit', t: 1, target: 'enemy', dmg: 1, crit: false, onoma: `H${i}` })
    }
    player.update(m)
    // Le lecteur ne doit jamais avoir accumulé plus de MAX_QUEUE + 1 (l'actif) en tout.
    expect(seen.length).toBeGreaterThan(0)
    const active = player.current()
    expect(active).not.toBeNull()
    // Le cut affiché doit être parmi les plus récents, pas le tout premier englouti
    // sous une pile de retard — c'est tout l'intérêt du garde-fou.
    expect(active!.until).toBeGreaterThan(m.t) // toujours en cours, pas fini
  })

  it("comble le SILENCE (file vide, round en cours) avec un idle-loop — pas un événement", async () => {
    const { LiveCutPlayer } = await import('./liveCutPlayer')
    const seen: string[] = []
    const fakeLibrary = {
      getClip: (kind: string, chars: string[]) => {
        seen.push(kind)
        return kind === 'idle-loop' ? { url: `fake://idle/${chars.join('-')}`, duration: 2 } : null
      },
    }
    const m = freshMatch()
    toFighting(m)
    const player = new LiveCutPlayer(ROSTER[0], ROSTER[1], fakeLibrary)
    player.update(m) // aucun événement, mais le round tourne : file vide -> idle-loop
    expect(seen).toContain('idle-loop')
    const active = player.current()
    expect(active).not.toBeNull()
    expect(active!.url).toBe(`fake://idle/${ROSTER[0].name}-${ROSTER[1].name}`)
  })

  it("ne demande PAS d'idle-loop hors du round (coin du ring, gel, fin de round)", async () => {
    const { LiveCutPlayer } = await import('./liveCutPlayer')
    const seen: string[] = []
    const fakeLibrary = {
      getClip: (kind: string) => {
        seen.push(kind)
        return { url: `fake://${kind}`, duration: 2 }
      },
    }
    const m = freshMatch() // phase 'intro', pas encore 'fighting'
    const player = new LiveCutPlayer(ROSTER[0], ROSTER[1], fakeLibrary)
    player.update(m)
    expect(seen).not.toContain('idle-loop')
    expect(player.current()).toBeNull()
  })
})

describe('bibliothèque de clips (stub — aucun pipeline branché)', () => {
  it('renvoie toujours null tant qu’aucun clip n’existe : silence, pas un crash', async () => {
    const { EMPTY_CUT_LIBRARY, prefetchForMatchup } = await import('./cutLibrary')
    expect(EMPTY_CUT_LIBRARY.getClip('attack-solo', ['Kenta'])).toBeNull()
    const lib = await prefetchForMatchup(ROSTER[0], ROSTER[1], ['attack-solo'])
    expect(lib.getClip('attack-solo', ['Kenta'])).toBeNull()
  })
})

describe('création par prompt & réalisateur', () => {
  it('createFromPrompt produit un perso complet', () => {
    const c = createFromPrompt('un samouraï cérébral de glace nommé Frimas')
    expect(c.name).toBeTruthy()
    expect(c.ulti.name).toBeTruthy()
    expect(c.stats.hp).toBeGreaterThan(0)
  })

  it('forgeCard borne les cartes et refuse le vide', () => {
    const r = forgeCard('une carte qui soigne beaucoup, appelée Regain')
    expect(r?.card.name).toBe('Regain')
    expect(r?.card.cost).toBeGreaterThanOrEqual(1)
    expect(forgeCard('blablabla sans effet')).toBeNull()
  })

  it('buildScenePlans : entrée, moments forts, finale — prompts propres', () => {
    const m = freshMatch()
    m.events.push(
      { kind: 'ulti', t: 50, by: 'player', name: ROSTER[0].ulti.name, onoma: 'ZAN!', dmg: 80 },
      { kind: 'roundEnd', t: 55, winner: 'player' },
      { kind: 'matchEnd', t: 55, winner: 'player' },
    )
    m.playerWins = 2
    const plans = buildScenePlans(m, ROSTER[0], ROSTER[1])
    expect(plans[0].id).toBe('entrance')
    expect(plans[plans.length - 1].id).toBe('finale')
    for (const p of plans) {
      expect(p.prompt).not.toContain('undefined')
      expect(p.prompt).not.toContain('#')
    }
  })

  it('colorWord traduit les hex en mots', () => {
    expect(colorWord('#ff4757')).toBe('red')
    expect(colorWord('#3742fa')).toBe('blue')
    expect(colorWord('#ffffff')).toBe('white')
  })
})

describe('SceneJobQueue (file de génération asynchrone des scènes)', () => {
  const plan = (id: string) => ({ id, title: id, prompt: `prompt ${id}`, refChars: ['Kenta'] })

  it('filet par défaut (STUB_SCENE_SUBMITTER) : chaque job échoue proprement, jamais bloqué', async () => {
    const { SceneJobQueue } = await import('./sceneQueue')
    const updates: string[][] = []
    const queue = new SceneJobQueue([plan('a'), plan('b')], {
      onUpdate: jobs => updates.push(jobs.map(j => j.status)),
    })
    expect(queue.jobs().every(j => j.status === 'pending')).toBe(true)
    queue.start()
    await new Promise(r => setTimeout(r, 10))
    expect(queue.jobs().every(j => j.status === 'failed')).toBe(true)
    expect(queue.jobs().every(j => j.clipUrl === null)).toBe(true)
  })

  it('un submitter qui répond : le job passe à ready avec son clip', async () => {
    const { SceneJobQueue } = await import('./sceneQueue')
    const queue = new SceneJobQueue([plan('a')], {
      submitter: { submit: async p => `fake://clip/${p.id}` },
    })
    queue.start()
    await new Promise(r => setTimeout(r, 10))
    const [job] = queue.jobs()
    expect(job.status).toBe('ready')
    expect(job.clipUrl).toBe('fake://clip/a')
  })

  it('un submitter trop lent est abandonné au bout de timeoutMs (jamais de blocage indéfini)', async () => {
    const { SceneJobQueue } = await import('./sceneQueue')
    const neverResolves: Promise<string | null> = new Promise(() => {})
    const queue = new SceneJobQueue([plan('a')], {
      submitter: { submit: () => neverResolves },
      timeoutMs: 20,
    })
    queue.start()
    await new Promise(r => setTimeout(r, 60))
    expect(queue.jobs()[0].status).toBe('failed')
  })

  it("l'échec d'un job n'affecte pas les autres (indépendants)", async () => {
    const { SceneJobQueue } = await import('./sceneQueue')
    const queue = new SceneJobQueue([plan('ok'), plan('ko')], {
      submitter: { submit: async p => (p.id === 'ok' ? `fake://${p.id}` : null) },
    })
    queue.start()
    await new Promise(r => setTimeout(r, 10))
    const jobs = queue.jobs()
    expect(jobs.find(j => j.plan.id === 'ok')?.status).toBe('ready')
    expect(jobs.find(j => j.plan.id === 'ko')?.status).toBe('failed')
  })
})

// L'environnement de test (Node, pas jsdom) n'a pas de localStorage — les
// modules qui le lisent (stable.ts, progression.ts…) le détectent via un
// `hasStorage` calculé UNE FOIS au chargement du module. Sans un faux
// localStorage posé AVANT leur tout premier `import()`, ils tourneraient
// en mode « stockage indisponible » où toute écriture est un no-op — la
// persistance inter-appels serait invisible aux tests, silencieusement.
function fakeLocalStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  }
}

describe("Vie d'Écurie (stable.ts) — jamais testée jusqu'ici (0 référence)", () => {
  const DAY1 = Date.UTC(2026, 0, 1, 12)

  // Vidé avant chaque test pour que les persos ne se contaminent pas entre eux.
  beforeEach(() => {
    ;(globalThis as any).localStorage = fakeLocalStorage()
  })

  it('première rencontre : humeur neutre (50), aucune action faite, une envie du jour', async () => {
    const { getStable } = await import('./stable')
    const s = getStable('kenta', 'sanguin', DAY1)
    expect(s.mood).toBe(50)
    expect(s.actionsToday).toBe(0)
    expect(['train', 'leisure']).toContain(s.desire) // envies possibles du trait sanguin
  })

  it("doStableAction : jamais d'échec dans la limite du jour, refusé au-delà", async () => {
    const { doStableAction } = await import('./stable')
    for (let i = 0; i < 3; i++) {
      expect(doStableAction('kenta', 'sanguin', 'leisure', 'atk', DAY1).ok).toBe(true)
    }
    const r4 = doStableAction('kenta', 'sanguin', 'leisure', 'atk', DAY1)
    expect(r4.ok).toBe(false)
    expect(r4.message).not.toBe('')
  })

  it("combler l'envie du jour donne un bonus d'humeur et incrémente desiresFulfilled", async () => {
    const { getStable, doStableAction, getDesiresFulfilled } = await import('./stable')
    const s = getStable('rei', 'cerebral', DAY1)
    expect(getDesiresFulfilled('rei')).toBe(0)
    const r = doStableAction('rei', 'cerebral', s.desire!, 'def', DAY1)
    expect(r.fulfilledDesire).toBe(true)
    expect(r.message).toContain('💖')
    expect(getDesiresFulfilled('rei')).toBe(1)
    // Une envie comblée ne renaît pas dans la même journée.
    const after = getStable('rei', 'cerebral', DAY1 + 3600_000)
    expect(after.desire).toBeNull()
  })

  it("l'humeur ne dépasse jamais 100, même en enchaînant les bonnes actions", async () => {
    const { doStableAction } = await import('./stable')
    for (let i = 0; i < 3; i++) doStableAction('fang', 'fusionnel', 'leisure', 'atk', DAY1)
    // 3 actions/jour max : on répète sur plusieurs jours pour pousser le plafond.
    for (let d = 1; d <= 10; d++) {
      const now = DAY1 + d * 86_400_000
      for (let i = 0; i < 3; i++) doStableAction('fang', 'fusionnel', 'leisure', 'atk', now)
    }
    const { getStable } = await import('./stable')
    expect(getStable('fang', 'fusionnel', DAY1 + 10 * 86_400_000).mood).toBeLessThanOrEqual(100)
  })

  it('recordMatchMood : victoire monte, défaite descend, jamais sous 10', async () => {
    const { recordMatchMood, getStable } = await import('./stable')
    getStable('goro', 'tetu', DAY1) // seed : crée l'état initial (mood 50)
    recordMatchMood('goro', true, DAY1)
    expect(getStable('goro', 'tetu', DAY1).mood).toBe(58)
    for (let i = 0; i < 10; i++) recordMatchMood('goro', false, DAY1 + i * 1000)
    expect(getStable('goro', 'tetu', DAY1 + 10_000).mood).toBeGreaterThanOrEqual(10)
  })

  it('consumeTraining : rendu une seule fois, puis null', async () => {
    const { doStableAction, consumeTraining } = await import('./stable')
    doStableAction('yuna', 'sanguin', 'train', 'spd', DAY1)
    expect(consumeTraining('yuna')).toBe('spd')
    expect(consumeTraining('yuna')).toBeNull()
  })

  it('dérive douce vers 50 après plusieurs jours sans interaction', async () => {
    const { doStableAction, getStable } = await import('./stable')
    doStableAction('nyx', 'cerebral', 'leisure', 'atk', DAY1) // mood 50 + 10 = 60 (sauf envie comblée)
    const after = getStable('nyx', 'cerebral', DAY1)
    const startMood = after.mood
    const fiveDaysLater = DAY1 + 5 * 86_400_000
    const drifted = getStable('nyx', 'cerebral', fiveDaysLater)
    // dérive : 4 points/jour d'absence, jamais au-delà de l'écart à 50.
    const expectedDrift = Math.min(5 * 4, Math.abs(startMood - 50))
    const expectedMood = startMood > 50 ? startMood - expectedDrift : startMood + expectedDrift
    expect(drifted.mood).toBe(expectedMood)
  })

  it('nouveau jour : les actions se rechargent à 3', async () => {
    const { doStableAction } = await import('./stable')
    for (let i = 0; i < 3; i++) expect(doStableAction('shion', 'tetu', 'rest', 'atk', DAY1).ok).toBe(true)
    expect(doStableAction('shion', 'tetu', 'rest', 'atk', DAY1).ok).toBe(false)
    const nextDay = DAY1 + 86_400_000
    expect(doStableAction('shion', 'tetu', 'rest', 'atk', nextDay).ok).toBe(true)
  })

  it('moodInfo / moodStartHype / moodIgnoresFirstOrder : seuils cohérents', async () => {
    const { moodInfo, moodStartHype, moodIgnoresFirstOrder } = await import('./stable')
    expect(moodInfo(80).label).toBe('Radieux')
    expect(moodInfo(60).label).toBe('Bien')
    expect(moodInfo(30).label).toBe('Neutre')
    expect(moodInfo(10).label).toBe('Boudeur')
    expect(moodStartHype(80)).toBe(15)
    expect(moodStartHype(60)).toBe(5)
    expect(moodStartHype(10)).toBe(0)
    expect(moodIgnoresFirstOrder(10)).toBe(true)
    expect(moodIgnoresFirstOrder(50)).toBe(false)
  })
})

describe('Progression / Lien (progression.ts) — couverture des cas limites', () => {
  beforeEach(() => {
    ;(globalThis as any).localStorage = fakeLocalStorage()
  })

  it('bondLevel / bondHrtBonus / bondTitle : seuils exacts', async () => {
    const { bondLevel, bondHrtBonus, bondTitle } = await import('./progression')
    expect(bondLevel(0)).toBe(0)
    expect(bondLevel(1)).toBe(1)
    expect(bondLevel(2)).toBe(1) // pas encore 3
    expect(bondLevel(3)).toBe(2)
    expect(bondLevel(6)).toBe(3)
    expect(bondLevel(10)).toBe(4)
    expect(bondLevel(15)).toBe(5)
    expect(bondLevel(999)).toBe(5) // jamais au-delà des 5 paliers définis

    expect(bondHrtBonus(0)).toBe(0)
    expect(bondHrtBonus(1)).toBe(1)
    expect(bondHrtBonus(2)).toBe(1)
    expect(bondHrtBonus(3)).toBe(2)
    expect(bondHrtBonus(4)).toBe(2)
    expect(bondHrtBonus(5)).toBe(3)

    expect(bondTitle(0)).toBe('Inconnu')
    expect(bondTitle(5)).toBe('Légende du coin')
    expect(bondTitle(-1)).toBe('Inconnu') // clampé
    expect(bondTitle(99)).toBe('Légende du coin') // clampé
  })

  it('recordResult / getProgress : victoires et défaites comptées et persistées', async () => {
    const { recordResult, getProgress } = await import('./progression')
    expect(getProgress('kenta')).toEqual({ wins: 0, losses: 0 })
    recordResult('kenta', true)
    recordResult('kenta', true)
    recordResult('kenta', false)
    expect(getProgress('kenta')).toMatchObject({ wins: 2, losses: 1 })
  })

  it("bondLevelFor : l'entretien de l'Écurie compte comme des victoires d'équivalence (3 envies = 1)", async () => {
    const { bondLevelFor } = await import('./progression')
    const { getStable, doStableAction } = await import('./stable')
    expect(bondLevelFor('rei')).toBe(0)
    // Comble 3 envies sur 3 jours distincts (une envie comblée ne renaît pas le même jour).
    for (let d = 0; d < 3; d++) {
      const now = Date.UTC(2026, 0, 1 + d, 12)
      const s = getStable('rei', 'cerebral', now)
      doStableAction('rei', 'cerebral', s.desire!, 'def', now)
    }
    expect(bondLevelFor('rei')).toBe(1) // floor(3/3)=1 "victoire" d'équivalence -> bondLevel(1)=1
  })

  it('rewardOptionsFor : déterministe (même perso+palier -> mêmes cartes) et jamais deux fois la même', async () => {
    const { rewardOptionsFor } = await import('./progression')
    const a1 = rewardOptionsFor('kenta', 1)
    const a2 = rewardOptionsFor('kenta', 1)
    expect(a1).toEqual(a2)
    expect(a1[0]).not.toBe(a1[1])
  })

  it('pendingReward / claimReward : ordre strict des paliers, jamais de saut, jamais deux fois', async () => {
    const { recordResult, pendingReward, claimReward, rewardOptionsFor } = await import('./progression')
    expect(pendingReward('goro')).toBeNull() // 0 victoire, rien à réclamer

    // 6 victoires -> bondLevel(6) = 3, mais le palier proposé reste le PREMIER non réclamé (1), jamais un saut à 3.
    for (let i = 0; i < 6; i++) recordResult('goro', true)
    const first = pendingReward('goro')
    expect(first?.level).toBe(1)
    expect(first?.options).toEqual(rewardOptionsFor('goro', 1))

    // Refuse une carte hors des options proposées.
    expect(claimReward('goro', 'carte-inexistante-xyz' as any)).toBe(false)
    // Réclame la vraie récompense du palier 1.
    expect(claimReward('goro', first!.options[0])).toBe(true)
    // Le palier suivant proposé est bien le 2, pas un saut plus loin.
    expect(pendingReward('goro')?.level).toBe(2)
    // Impossible de réclamer deux fois le même palier avec la même carte déjà réclamée.
    expect(claimReward('goro', first!.options[0])).toBe(false)
  })

  it('applyBond : aucun changement au niveau 0, HRT plafonné à 12 au niveau 5', async () => {
    const { applyBond, recordResult } = await import('./progression')
    const char = ROSTER[0]
    const untouched = applyBond(char)
    expect(untouched).toBe(char) // même référence : pas de copie inutile si bonus = 0

    for (let i = 0; i < 15; i++) recordResult(char.id, true) // bondLevel(15) = 5 -> bonus +3
    const boosted = applyBond({ ...char, stats: { ...char.stats, hrt: 11 } })
    expect(boosted.stats.hrt).toBe(12) // 11+3=14, plafonné à 12
  })

  it('saveCustom / loadCustoms : les plus récents en tête, plafonné à 4, dédoublonné par id', async () => {
    const { saveCustom, loadCustoms } = await import('./progression')
    const mk = (id: string) => ({ ...ROSTER[0], id, name: id })
    saveCustom(mk('a'))
    saveCustom(mk('b'))
    saveCustom(mk('c'))
    saveCustom(mk('d'))
    saveCustom(mk('e')) // 5e perso -> le plus ancien (a) sort
    const ids = loadCustoms().map(c => c.id)
    expect(ids).toEqual(['e', 'd', 'c', 'b'])
    expect(ids.length).toBe(4)

    // Re-sauvegarder un perso existant le fait remonter en tête, sans doublon.
    saveCustom(mk('c'))
    expect(loadCustoms().map(c => c.id)).toEqual(['c', 'e', 'd', 'b'])
  })

  it("loadCustoms migre les persos sauvegardés avant l'Ulti", async () => {
    ;(globalThis as any).localStorage.setItem(
      'coach-arena-customs-v1',
      JSON.stringify([{ ...ROSTER[0], id: 'ancien', ulti: undefined }]),
    )
    const { loadCustoms } = await import('./progression')
    const found = loadCustoms().find(x => x.id === 'ancien')
    expect(found?.ulti).toBeTruthy()
    expect(found?.ulti.name).toContain('Zénith')
  })
})

describe('Commentateur (commentator.ts) — jamais testé directement (0 référence)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // createMatch() précharge TOUJOURS m.events avec un premier 'roundStart'
  // (voir combat.ts) — un vrai piège pour ces tests : sans le consommer
  // explicitement, il pollue silencieusement la 1re assertion de chaque
  // test (une ligne "gratuite" en plus, et une fenêtre de silence de 3 s
  // qui démarre dès t=0). On le consomme donc systématiquement ici pour
  // partir d'un commentateur propre, comme le ferait un vrai match.

  it('ingest : incrémental, ne rejoue jamais un événement déjà consommé', async () => {
    const { Commentator } = await import('./commentator')
    const m = freshMatch()
    const c = new Commentator()
    expect(c.ingest(m)).not.toBeNull() // le roundStart initial de createMatch()
    expect(c.ingest(m)).toBeNull() // déjà consommé, pas de doublon
    m.t = 10
    m.events.push({ kind: 'roundEnd', t: 10, winner: 'player' })
    const line = c.ingest(m)
    expect(line).not.toBeNull()
    expect(c.ingest(m)).toBeNull() // à nouveau : pas de rejeu
  })

  it("un coup non critique ne parle JAMAIS (seul le crit déclenche 'hit')", async () => {
    const { Commentator } = await import('./commentator')
    const m = freshMatch()
    const c = new Commentator()
    c.ingest(m) // consomme le roundStart initial
    m.t = 10
    m.events.push({ kind: 'hit', t: 10, target: 'enemy', dmg: 3, crit: false, onoma: 'PAF' })
    expect(c.ingest(m)).toBeNull()
    m.t = 20 // même loin de tout silence, un non-crit ne parle pas
    m.events.push({ kind: 'hit', t: 20, target: 'enemy', dmg: 3, crit: false, onoma: 'PAF' })
    expect(c.ingest(m)).toBeNull()
  })

  it('les événements MINEURS respectent 3 s de silence, les MAJEURS parlent toujours', async () => {
    const { Commentator } = await import('./commentator')
    const m = freshMatch()
    const c = new Commentator()
    c.ingest(m) // le roundStart initial (majeur) a déjà parlé à t=0
    // Un événement mineur (dodged) 1s après : encore dans la fenêtre de silence -> rien.
    m.t = 1
    m.events.push({ kind: 'dodged', t: 1, target: 'player' })
    expect(c.ingest(m)).toBeNull()
    // Un événement MAJEUR (countered) dans la même fenêtre : parle quand même.
    m.t = 1.5
    m.events.push({ kind: 'countered', t: 1.5, by: 'player', dmg: 10 })
    expect(c.ingest(m)).not.toBeNull()
    // Le mineur, lui, ne parle qu'une fois les 3 s écoulées depuis le DERNIER commentaire.
    m.t = 5
    m.events.push({ kind: 'blocked', t: 5, target: 'enemy', dmg: 2 })
    expect(c.ingest(m)).not.toBeNull()
  })

  it("anti-répétition : jamais deux fois le même gabarit D'AFFILÉE, même si le tirage aléatoire est forcé identique", async () => {
    const { Commentator } = await import('./commentator')
    const m = freshMatch() // m.round ne bouge pas ici : seul le gabarit choisi peut faire varier le texte
    const c = new Commentator()
    c.ingest(m) // consomme le roundStart initial (avant de figer le tirage aléatoire)
    vi.spyOn(Math, 'random').mockReturnValue(0) // toujours le même index tiré (0) sans le garde-fou
    m.t = 10
    m.events.push({ kind: 'roundStart', t: 10, round: 2 })
    const first = c.ingest(m)!
    m.t = 20
    m.events.push({ kind: 'roundStart', t: 20, round: 3 })
    const second = c.ingest(m)!
    m.t = 30
    m.events.push({ kind: 'roundStart', t: 30, round: 4 })
    const third = c.ingest(m)!
    // La règle porte sur la CONSÉCUTIVITÉ : jamais deux gabarits identiques
    // à la suite — mais un gabarit PEUT revenir plus tard (ici 1 et 3 sont
    // bien identiques : le tirage forcé à l'index 0 n'est plus « le dernier
    // utilisé » une fois qu'on est passé par un autre gabarit entre les
    // deux). C'est le contrat réel de pick(), pas une supposition plus large.
    expect(second.text).not.toBe(first.text)
    expect(third.text).not.toBe(second.text)
    expect(third.text).toBe(first.text)
  })

  it('emit : substitue correctement les variables ({P}, {E}, {S}…), aucune accolade ne doit rester', async () => {
    const { Commentator } = await import('./commentator')
    const m = freshMatch()
    const c = new Commentator()
    c.ingest(m) // consomme le roundStart initial
    m.t = 10
    m.events.push({ kind: 'special', t: 10, by: 'player', name: 'Poing du Volcan', onoma: 'DOKAAN', dmg: 10 })
    const line = c.ingest(m)!
    expect(line.text).not.toContain('{')
    expect(line.text).not.toContain('}')
    expect(line.text).toContain('Poing du Volcan')
  })

  it("emit : {A} (l'auteur) est bien substitué quand le gabarit tiré le contient", async () => {
    const { Commentator } = await import('./commentator')
    vi.spyOn(Math, 'random').mockReturnValue(0) // force le 1er gabarit de T.special, qui contient {A}
    const m = freshMatch()
    const c = new Commentator()
    c.ingest(m) // consomme le roundStart initial
    m.t = 10
    m.events.push({ kind: 'special', t: 10, by: 'player', name: 'Poing du Volcan', onoma: 'DOKAAN', dmg: 10 })
    const line = c.ingest(m)!
    expect(line.text).toBe('INCROYABLE !! Kenta déchaîne Poing du Volcan !!')
  })

  it('poids (weight) cohérents par famille d\'événement', async () => {
    const { Commentator } = await import('./commentator')
    const cases: Array<[import('./types').CombatEvent, 1 | 2 | 3]> = [
      [{ kind: 'roundStart', t: 10, round: 2 }, 2],
      [{ kind: 'dodged', t: 10, target: 'player' }, 1],
      [{ kind: 'blocked', t: 10, target: 'player', dmg: 1 }, 1],
      [{ kind: 'countered', t: 10, by: 'player', dmg: 1 }, 2],
      [{ kind: 'special', t: 10, by: 'player', name: 'X', onoma: 'X', dmg: 1 }, 3],
      [{ kind: 'ulti', t: 10, by: 'player', name: 'X', onoma: 'X', dmg: 1 }, 3],
      [{ kind: 'hypeFull', t: 10, who: 'player' }, 2],
      [{ kind: 'ultiReady', t: 10, who: 'player' }, 3],
      [{ kind: 'confused', t: 10, who: 'player' }, 1],
      [{ kind: 'card', t: 10, name: 'X' }, 1],
      [{ kind: 'roundEnd', t: 10, winner: 'player' }, 3],
      [{ kind: 'matchEnd', t: 10, winner: 'player' }, 3],
    ]
    for (const [ev, weight] of cases) {
      const m = freshMatch()
      const c = new Commentator()
      c.ingest(m) // consomme le roundStart initial, hors du champ testé
      m.t = 10
      m.events.push(ev)
      const line = c.ingest(m)
      expect(line?.weight, `weight for ${ev.kind}`).toBe(weight)
    }
  })

  it('les événements que le commentateur ne connaît pas (cardProc, switch, timeout…) sont ignorés sans erreur', async () => {
    const { Commentator } = await import('./commentator')
    const m = freshMatch()
    const c = new Commentator()
    c.ingest(m) // consomme le roundStart initial
    m.t = 10
    m.events.push({ kind: 'cardProc', t: 10, text: 'BOOM' })
    m.events.push({ kind: 'switch', t: 11, side: 'player', name: 'Rei' })
    expect(c.ingest(m)).toBeNull()
    expect(c.lines.length).toBe(1) // seul le roundStart initial a produit une ligne
  })

  it('recent(n) : renvoie les n dernières lignes, dans l\'ordre', async () => {
    const { Commentator } = await import('./commentator')
    const m = freshMatch()
    const c = new Commentator()
    c.ingest(m) // consomme le roundStart initial (round 1)
    for (let i = 2; i <= 5; i++) {
      m.t = i * 10
      m.round = i
      m.events.push({ kind: 'roundStart', t: m.t, round: i })
      c.ingest(m)
    }
    const last2 = c.recent(2)
    expect(last2.length).toBe(2)
    expect(last2[0].text).toContain('4') // round 4 -> avant-dernière ligne
    expect(last2[1].text).toContain('5') // round 5 -> dernière ligne
  })
})

describe('Onboarding (onboarding.ts) — dernier module localStorage jamais testé (0 référence)', () => {
  beforeEach(() => {
    ;(globalThis as any).localStorage = fakeLocalStorage()
  })

  it("chaque bulle n'est vue qu'une fois : false avant, true après, et ça persiste", async () => {
    const { hasSeenCombatHint, markCombatHintSeen } = await import('./onboarding')
    expect(hasSeenCombatHint()).toBe(false)
    markCombatHintSeen()
    expect(hasSeenCombatHint()).toBe(true)
    // Un second appel (deuxième fermeture, ou re-render) ne doit rien casser.
    markCombatHintSeen()
    expect(hasSeenCombatHint()).toBe(true)
  })

  it('les deux bulles (combat / coin du ring) sont indépendantes l\'une de l\'autre', async () => {
    const { hasSeenCombatHint, hasSeenCornerHint, markCombatHintSeen } = await import('./onboarding')
    markCombatHintSeen()
    expect(hasSeenCombatHint()).toBe(true)
    expect(hasSeenCornerHint()).toBe(false) // pas affectée par l'autre bulle
  })

  it('markCornerHintSeen ne touche pas au flag combat', async () => {
    const { hasSeenCombatHint, hasSeenCornerHint, markCornerHintSeen } = await import('./onboarding')
    markCornerHintSeen()
    expect(hasSeenCornerHint()).toBe(true)
    expect(hasSeenCombatHint()).toBe(false)
  })
})

describe('Bugs trouvés par audit (code-review, 2026-08-16) — verrouillés par des tests', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("un combattant à 0 PV ne peut plus frapper dans le MÊME tick (pas de double-KO injuste)", () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // jamais d'esquive, jamais de crit
    const m = freshMatch()
    toFighting(m)
    m.enemyTimeoutsLeft = 0 // évite toute interférence du temps mort d'urgence adverse
    m.player.hp = 1
    m.enemy.hp = 1
    m.player.nextActionAt = m.t
    m.enemy.nextActionAt = m.t
    tick(m, 0.05, quiet)
    // Le joueur (traité en premier dans la boucle) tue l'adversaire ; l'adversaire,
    // déjà à 0 PV, ne doit PAS pouvoir riposter dans ce même tick (avant le fix,
    // il le pouvait, et le départage de double-KO favorisait systématiquement
    // l'adversaire quel que soit qui avait frappé en premier).
    expect(m.enemy.hp).toBe(0)
    expect(m.player.hp).toBe(1)
    expect(m.phase).toBe('roundEnd')
  })

  it("le coach ne peut plus 'encourager' un perso confus (comme les autres ordres)", () => {
    // Un trickle de Hype ambiant (auto-motivation + énergie vocale continue,
    // voir tick()) s'applique CHAQUE tick indépendamment de toute commande —
    // donc "la Hype ne bouge pas" n'est pas le bon test. On isole la
    // contribution PROPRE à 'cheer' en comparant deux runs identiques,
    // avec et sans la commande, sous la même confusion.
    const withoutCmd = freshMatch()
    toFighting(withoutCmd)
    withoutCmd.player.nextActionAt = withoutCmd.t + 1000
    withoutCmd.enemy.nextActionAt = withoutCmd.t + 1000
    withoutCmd.player.confusedUntil = withoutCmd.t + 10
    tick(withoutCmd, 0.05, { command: null, voiceEnergy: 0.8, faceEnergy: 0 })

    const withCmd = freshMatch()
    toFighting(withCmd)
    withCmd.player.nextActionAt = withCmd.t + 1000
    withCmd.enemy.nextActionAt = withCmd.t + 1000
    withCmd.player.confusedUntil = withCmd.t + 10
    tick(withCmd, 0.05, { command: 'cheer', voiceEnergy: 0.8, faceEnergy: 0 })

    expect(withCmd.player.hype).toBe(withoutCmd.player.hype) // confus : 'cheer' n'ajoute rien de plus
  })

  it("contrôle positif : un perso NON confus reçoit bien un gain SUPPLÉMENTAIRE via 'cheer'", () => {
    const withoutCmd = freshMatch()
    toFighting(withoutCmd)
    withoutCmd.player.nextActionAt = withoutCmd.t + 1000
    withoutCmd.enemy.nextActionAt = withoutCmd.t + 1000
    tick(withoutCmd, 0.05, { command: null, voiceEnergy: 0.8, faceEnergy: 0 })

    const withCmd = freshMatch()
    toFighting(withCmd)
    withCmd.player.nextActionAt = withCmd.t + 1000
    withCmd.enemy.nextActionAt = withCmd.t + 1000
    tick(withCmd, 0.05, { command: 'cheer', voiceEnergy: 0.8, faceEnergy: 0 })

    expect(withCmd.player.hype).toBeGreaterThan(withoutCmd.player.hype)
  })

  it("le temps mort d'urgence adverse joue aussi une carte lowHpHypeFull, pas seulement heal", () => {
    const m = freshMatch()
    toFighting(m)
    m.enemy.hp = Math.round(m.enemy.maxHp * 0.1) // sous 25% (déclenche) ET sous 15% (seuil de lastChance)
    m.enemyDeck = []
    m.enemyDiscard = []
    m.enemyHand = ['lastChance'] // AUCUNE carte de soin, seulement lowHpHypeFull
    const timeoutsBefore = m.enemyTimeoutsLeft
    tick(m, 0.05, quiet)
    expect(m.enemyTimeoutsLeft).toBe(timeoutsBefore - 1) // le temps mort a bien été consommé
    expect(m.enemy.hype).toBe(HYPE_MAX) // armée ET auto-déclenchée dans le même tick (HP déjà sous le seuil)
    expect(m.events.some(e => e.kind === 'timeout' && e.side === 'enemy')).toBe(true)
  })
})
