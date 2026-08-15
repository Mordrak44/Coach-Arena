import { describe, expect, it } from 'vitest'
import {
  HAND_SIZE,
  HYPE_MAX,
  SOUFFLE_PER_CORNER,
  SWITCH_COST,
  ULTI_MAX,
  applyConsigne,
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
