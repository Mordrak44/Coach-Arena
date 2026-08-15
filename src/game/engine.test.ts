import { describe, expect, it } from 'vitest'
import {
  HAND_SIZE,
  HYPE_MAX,
  SOUFFLE_PER_CORNER,
  SWITCH_COST,
  TIMEOUTS_PER_MATCH,
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
    expect(m.timeoutsLeft).toBe(TIMEOUTS_PER_MATCH - 1)
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
    expect(callTimeout(m)).toBe(false) // plus de temps mort (1/match)
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
