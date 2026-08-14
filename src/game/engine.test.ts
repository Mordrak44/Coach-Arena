import { describe, expect, it } from 'vitest'
import {
  HAND_SIZE,
  HYPE_MAX,
  SOUFFLE_PER_CORNER,
  ULTI_MAX,
  applyConsigne,
  createMatch,
  enemyCornerPlay,
  mulligan,
  playCard,
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
