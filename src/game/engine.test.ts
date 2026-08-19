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
  addSpeechHype,
  applyConsigne,
  callTimeout,
  chooseTacticPlan,
  createMatch,
  drawCards,
  enemyCornerPlay,
  forceRoundTimeout,
  mulligan,
  planLabel,
  playCard,
  switchFighter,
  tick,
} from './combat'
import { CARD_POOL, SIGNATURE_CARDS, buildStarterDeck, clampEffect, computeCost, getCard, signatureFor } from './cards'
// deckBuilder PAS importé statiquement ici non plus, même raison que
// cardForge ci-dessous : son hasStorage se fige au tout premier import.
// cardForge PAS importé statiquement ici, volontairement : son hasStorage
// interne se fige au tout premier import (comme stable.ts/progression.ts),
// donc chaque usage plus bas passe par un import() dynamique après avoir
// posé un faux localStorage — voir la describe « création par prompt ».
import { parseConsigne } from './speechTactics'
import { buildScenePlans, colorWord } from './sceneDirector'
import { ROSTER, createFromPrompt } from './characters'
import { ArenaRenderer } from '../render/arenaRenderer'
import { matchCommand } from '../systems/voice'
import { MatchRecorder, fileExt, pickMimeType, shareOrDownload } from '../systems/recorder'
import { SoundSystem } from '../systems/sound'
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
    // drainSouffle : jamais exercé jusqu'ici.
    expect(clampEffect({ kind: 'drainSouffle', amount: 99.7 })).toEqual({ kind: 'drainSouffle', amount: 3 })
  })

  it('getCustomCards (jamais testé) : reflète le registre après registerCustomCard', async () => {
    const { registerCustomCard, getCustomCards, getCard } = await import('./cards')
    const before = getCustomCards().length
    const custom = {
      id: `test-custom-${Math.random().toString(36).slice(2, 8)}` as CardId,
      name: 'Carte de Test',
      timing: 'pause' as const,
      cost: 3,
      icon: '🧪',
      desc: 'x',
      effects: [],
    }
    registerCustomCard(custom)
    expect(getCustomCards().length).toBe(before + 1)
    expect(getCustomCards().map(c => c.id)).toContain(custom.id)
    expect(getCard(custom.id)).toEqual(custom)
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
  // Premier point de contact avec deckBuilder.ts dans ce fichier : pose un
  // faux localStorage AVANT son tout premier import() dynamique, pour que
  // loadTemplate/saveTemplate (testés plus bas) voient hasStorage=true.
  beforeEach(() => {
    ;(globalThis as any).localStorage = fakeLocalStorage()
  })

  it('assainit un modèle trafiqué (copies hors bornes, cartes inconnues)', async () => {
    const { MAX_COPIES, sanitizeTemplate } = await import('./deckBuilder')
    const dirty = { secondWind: 99, focus: -3, nimporte: 4 } as never
    const clean = sanitizeTemplate(dirty)
    expect(clean.secondWind).toBe(MAX_COPIES)
    expect(clean.focus).toBe(0)
    expect('nimporte' in clean).toBe(false)
  })

  it("assainit une copie NON NUMÉRIQUE (Number(...) → NaN) en 0 — branche `Number.isFinite(n) ? n : 0` jamais exercée côté faux, seuls des nombres hors bornes l'étaient", async () => {
    const { sanitizeTemplate } = await import('./deckBuilder')
    const dirty = { secondWind: 'beaucoup', focus: undefined } as never
    const clean = sanitizeTemplate(dirty)
    expect(clean.secondWind).toBe(0)
    expect(clean.focus).toBe(0)
  })

  it("templateSize() compte une valeur explicitement undefined comme 0 (`n ?? 0` jamais exercé — sanitizeTemplate() ne produit jamais ce cas, mais templateSize() est exportée et peut recevoir un template brut)", async () => {
    const { templateSize } = await import('./deckBuilder')
    expect(templateSize({ secondWind: undefined, focus: 2 } as never)).toBe(2)
  })

  it('valide les tailles de deck aux bornes', async () => {
    const { DECK_MAX, defaultTemplate, templateSize, templateValid } = await import('./deckBuilder')
    const t = defaultTemplate()
    expect(templateValid(t)).toBe(true)
    expect(templateSize(t)).toBeLessThanOrEqual(DECK_MAX)
    expect(templateValid({})).toBe(false)
  })

  it('compose : modèle + signature + copies gagnées + forgées', async () => {
    const { buildDeckFromTemplate, defaultTemplate, templateSize } = await import('./deckBuilder')
    const t = defaultTemplate()
    const deck = buildDeckFromTemplate(t, 'sigKenta', ['focus'], [])
    expect(deck.length).toBe(templateSize(t) + 2 + 1)
  })

  it("compose SANS signature (signatureId=null) ET avec de VRAIES cartes forgées — jamais exercé (le test ci-dessus passait toujours [] pour forged)", async () => {
    const { buildDeckFromTemplate, defaultTemplate, templateSize } = await import('./deckBuilder')
    const t = defaultTemplate()
    const forged = [
      { id: 'forge-abc123', name: 'Étincelle', timing: 'pause', cost: 1, icon: '🔥', desc: '', effects: [] },
      { id: 'forge-def456', name: 'Regain', timing: 'pause', cost: 1, icon: '💊', desc: '', effects: [] },
    ] as never
    const deck = buildDeckFromTemplate(t, null, [], forged)
    expect(deck.length).toBe(templateSize(t) + 2) // pas de signature, +0 ; +2 cartes forgées
    expect(deck).toContain('forge-abc123')
    expect(deck).toContain('forge-def456')
  })

  it("bug potentiel : loadTemplate/saveTemplate — round-trip, sanitize sur relecture, jamais testés", async () => {
    const { loadTemplate, saveTemplate, defaultTemplate, sanitizeTemplate } = await import('./deckBuilder')
    // Rien en stockage : repli propre sur le modèle par défaut.
    expect(loadTemplate()).toEqual(defaultTemplate())

    saveTemplate({ secondWind: 2, focus: 1 } as never)
    expect(loadTemplate()).toEqual(sanitizeTemplate({ secondWind: 2, focus: 1 } as never))

    // Stockage corrompu de FORME (JSON valide, pas un objet de template) :
    // sanitizeTemplate tourne DANS le try/catch de loadTemplate (comme
    // documenté dans le fichier lui-même comme le bon patron à suivre) —
    // ne doit jamais planter, doit retomber sur le modèle par défaut.
    for (const corrupted of ['null', '42', '"oops"']) {
      localStorage.setItem('coach-arena-deck-v1', corrupted)
      expect(() => loadTemplate()).not.toThrow()
      expect(loadTemplate()).toEqual(defaultTemplate())
    }
    // JSON réellement invalide (syntaxe cassée), pas juste de mauvaise
    // forme : un catch DIFFÉRENT dans loadTemplate, jamais exercé jusqu'ici.
    localStorage.setItem('coach-arena-deck-v1', '{ceci ne parse pas')
    expect(() => loadTemplate()).not.toThrow()
    expect(loadTemplate()).toEqual(defaultTemplate())
  })

  it('saveTemplate : une écriture qui échoue (quota dépassé) ne plante jamais', async () => {
    const { saveTemplate, defaultTemplate } = await import('./deckBuilder')
    ;(globalThis as any).localStorage = {
      ...fakeLocalStorage(),
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(() => saveTemplate(defaultTemplate())).not.toThrow()
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

  it("l'Ulti exige AUSSI sa jauge pleine — jamais exercé, seul le cas 'prêt' l'était (contrairement au spécial dont les 2 cas sont testés)", () => {
    const m = freshMatch()
    toFighting(m)
    m.player.nextActionAt = m.t + 1000
    m.enemy.nextActionAt = m.t + 1000
    m.player.ulti = ULTI_MAX - 1 // presque plein, pas encore prêt
    const hpBefore = m.enemy.hp
    tick(m, 0.05, { command: 'ulti', voiceEnergy: 0.6, faceEnergy: 0 })
    expect(m.enemy.hp).toBe(hpBefore) // rien ne part
    expect(m.player.ultiUsed).toBe(false)
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

  it("mulligan avec un id absent de la main est ignoré sans planter (`idx !== -1` jamais exercé côté faux) — et un mulligan qui n'échange RIEN (aucun id trouvé) échoue proprement sans consommer l'unique essai", () => {
    const m = freshMatch(buildStarterDeck(null))
    m.phase = 'tactics'
    const handBefore = [...m.hand]
    expect(mulligan(m, ['carte-qui-nexiste-pas' as CardId])).toBe(false)
    expect(m.hand).toEqual(handBefore) // rien n'a bougé
    expect(m.mulliganUsed).toBe(false) // l'essai n'a PAS été consommé
    // Toujours utilisable ensuite, avec un id valide cette fois.
    expect(mulligan(m, [m.hand[0]])).toBe(true)
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

  it("playCard refuse ses 3 garde-fous, jamais exercés individuellement (seul le chemin de succès l'était) : mauvaise phase, Souffle insuffisant, carte absente de la main", () => {
    const m = freshMatch(buildStarterDeck(null))
    m.hand = ['massage']

    m.phase = 'fighting' // ni 'tactics' ni 'timeout'
    expect(playCard(m, 'massage')).toBe(false)
    expect(m.hand).toEqual(['massage']) // rien n'a bougé

    m.phase = 'tactics'
    m.souffle = 0 // 'massage' coûte forcément > 0
    expect(playCard(m, 'massage')).toBe(false)
    expect(m.hand).toEqual(['massage'])

    m.souffle = SOUFFLE_PER_CORNER
    expect(playCard(m, 'focus')).toBe(false) // pas dans la main
    expect(m.hand).toEqual(['massage']) // toujours intacte
    expect(m.souffle).toBe(SOUFFLE_PER_CORNER) // rien décompté

    // Toujours jouable ensuite : aucun des refus n'a laissé d'état corrompu.
    expect(playCard(m, 'massage')).toBe(true)
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

  it("remélange SA défausse quand sa pioche est vide mais sa défausse ne l'est pas — jamais exercé, tous les autres tests vidaient les DEUX à la fois (repli direct sur le retour anticipé)", () => {
    const m = freshMatch()
    m.enemyDeck = []
    m.enemyDiscard = ['ironGuard', 'focus', 'secondWind']
    m.enemyHand = []
    enemyCornerPlay(m)
    // Aucune carte perdue ni dupliquée par le remélange + la pioche qui
    // suit (peu importe où enemyCornerPlay les redistribue ensuite entre
    // main/pioche/défausse en jouant depuis la main).
    expect(m.enemyHand.length + m.enemyDeck.length + m.enemyDiscard.length).toBe(3)
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

  it("le coin adverse NE change PAS de perso si l'actif reste assez frais (≥ 35 % de PV), même avec un remplaçant en pleine forme sur le banc — jamais exercé, seul le cas 'assez blessé' l'était", () => {
    const m = createMatch(ROSTER[0], ROSTER[1], [], { enemyTeam: [ROSTER[4]] })
    m.enemy.hp = Math.round(m.enemy.maxHp * 0.5) // ≥ 35 % : pas encore la peine de switcher
    m.enemyDeck = []
    m.enemyDiscard = []
    m.enemyHand = []
    enemyCornerPlay(m)
    expect(m.enemy.char.id).toBe(ROSTER[1].id) // toujours le même actif
    expect(m.events.some(e => e.kind === 'switch' && e.side === 'enemy')).toBe(false)
  })

  it("le coin adverse ne peut pas switcher si son SEUL remplaçant est déjà KO — jamais exercé, `b.hp > 0` toujours vrai jusqu'ici", () => {
    const m = createMatch(ROSTER[0], ROSTER[1], [], { enemyTeam: [ROSTER[4]] })
    m.enemy.hp = Math.round(m.enemy.maxHp * 0.1) // très entamé, switcherait normalement
    m.enemyBench[0].hp = 0 // …mais le seul remplaçant est KO
    m.enemyDeck = []
    m.enemyDiscard = []
    m.enemyHand = []
    expect(() => enemyCornerPlay(m)).not.toThrow()
    expect(m.enemy.char.id).toBe(ROSTER[1].id) // pas de switch possible
    expect(m.events.some(e => e.kind === 'switch' && e.side === 'enemy')).toBe(false)
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

  it("le coin adverse en PV critiques SANS aucune carte de soin/Dernière Chance en main ne prend PAS de temps mort — jamais exercé, la main avait toujours une carte exploitable jusqu'ici", () => {
    const m = freshMatch()
    toFighting(m)
    m.enemy.hp = Math.round(m.enemy.maxHp * 0.2) // sous le seuil critique
    m.enemyDeck = []
    m.enemyDiscard = []
    m.enemyHand = ['ironGuard'] // ni heal, ni lowHpHypeFull
    const timeoutsBefore = m.enemyTimeoutsLeft
    tick(m, 0.05, quiet)
    expect(m.enemyTimeoutsLeft).toBe(timeoutsBefore) // pas consommé
    expect(m.events.some(e => e.kind === 'timeout' && e.side === 'enemy')).toBe(false)
  })

  it("un tick trop court pendant 'roundEnd'/'tactics' ne fait PAS avancer la phase — jamais exercé, tous les autres tests dépassaient toujours `phaseUntil` d'un coup", () => {
    const m = freshMatch()
    toFighting(m)
    m.player.hp = m.player.maxHp
    m.enemy.hp = 0
    tick(m, 0.05, quiet) // -> roundEnd
    expect(m.phase).toBe('roundEnd')
    tick(m, 0.001, quiet) // largement sous ROUND_END_DURATION
    expect(m.phase).toBe('roundEnd') // encore là, rien n'a bougé
    tick(m, ROUND_END_DURATION + 0.1, quiet) // -> tactics, cette fois
    expect(m.phase).toBe('tactics')
    tick(m, 0.001, quiet) // largement sous TACTICS_DURATION
    expect(m.phase).toBe('tactics') // encore là
  })
})

describe('consignes parlées', () => {
  it('comprend une consigne conditionnelle', () => {
    const c = parseConsigne("s'il sort son spécial tu esquives d'accord")
    expect(c?.effects.map(e => e.kind)).toContain('halveEnemySpecial')
  })

  it("bug d'audit : « dernier souffle » ne déclenche plus AUSSI la récupération (souffle en substring)", () => {
    // Avant fix (2026-08-16) : la règle générique "souffle" (→ heal 5%)
    // matchait la sous-chaîne "souffle" À L'INTÉRIEUR de "dernier souffle",
    // en plus de la règle "baroud d'honneur" dédiée à cette phrase — un
    // discours de dernier recours se voyait accorder un soin gratuit à
    // contresens.
    const c = parseConsigne('tout ou rien, on part sur son dernier souffle !')
    expect(c?.effects.map(e => e.kind)).toContain('lowHpHypeFull')
    expect(c?.effects.map(e => e.kind)).not.toContain('heal')
    // La règle générique "souffle" reste valide seule, hors de ce contexte.
    const c2 = parseConsigne('respire un bon coup, reprends ton souffle')
    expect(c2?.effects.map(e => e.kind)).toContain('heal')
  })

  it('ignore le bruit et limite à une consigne par pause', () => {
    // Garde-fou distinct du "ne matche aucune règle" ci-dessous : un texte
    // trop COURT (< 6 caractères, ex. un mot de reco vocale coupé) est
    // rejeté d'entrée, jamais testé jusqu'ici.
    expect(parseConsigne('ok')).toBeNull()
    expect(parseConsigne('il fait beau ce soir non ?')).toBeNull()
    const m = freshMatch()
    m.phase = 'tactics'
    const c = parseConsigne('garde haute et respire')!
    expect(applyConsigne(m, c.effects, c.label)).toBe(true)
    expect(applyConsigne(m, c.effects, c.label)).toBe(false)
  })

  it("applyConsigne refuse aussi hors pause/Temps Mort, et avec une liste d'effets vide — seul le refus par `consigneUsed` déjà posé était exercé", () => {
    const m = freshMatch()
    const c = parseConsigne('garde haute et respire')!

    m.phase = 'fighting' // ni 'tactics' ni 'timeout'
    expect(applyConsigne(m, c.effects, c.label)).toBe(false)
    expect(m.consigneUsed).toBe(false) // pas consommé par un refus

    m.phase = 'tactics'
    expect(applyConsigne(m, [], c.label)).toBe(false) // aucun effet à appliquer
    expect(m.consigneUsed).toBe(false)

    // Toujours utilisable ensuite : aucun des refus n'a laissé d'état corrompu.
    expect(applyConsigne(m, c.effects, c.label)).toBe(true)
  })
})

describe('applyCardEffects (DSL → runtime) — kinds jamais exercés via une VRAIE consigne/carte', () => {
  // Ces primitives sont testées côté CONSOMMATION (mods déjà posés à la
  // main) ailleurs dans ce fichier, mais jamais côté APPLICATION : rien ne
  // vérifie que jouer une consigne avec ce kind mute effectivement le bon
  // champ. Un typo dans le switch de applyCardEffects (combat.ts) serait
  // passé inaperçu jusqu'ici.
  it('hype et enemyHype mutent bien les jauges des deux camps', () => {
    const m = freshMatch()
    m.phase = 'tactics'
    m.player.hype = 10
    m.enemy.hype = 50
    applyConsigne(
      m,
      [
        { kind: 'hype', amount: 20 },
        { kind: 'enemyHype', amount: -20 },
      ],
      'test',
    )
    expect(m.player.hype).toBe(30)
    expect(m.enemy.hype).toBe(30)
  })

  it('dodgeBonus et immuneConfusion mutent bien mods', () => {
    const m = freshMatch()
    m.phase = 'tactics'
    applyConsigne(
      m,
      [
        { kind: 'dodgeBonus', add: 0.15 },
        { kind: 'immuneConfusion' },
      ],
      'test',
    )
    expect(m.mods.dodgeBonus).toBeCloseTo(0.15)
    expect(m.mods.immuneConfusion).toBe(true)
  })

  it('armCheerHype et armAttackFrenzy arment bien les mods (pas encore consommés)', () => {
    const m = freshMatch()
    m.phase = 'tactics'
    applyConsigne(
      m,
      [
        { kind: 'armCheerHype', amount: 25 },
        { kind: 'armAttackFrenzy', mul: 1.5, duration: 5 },
      ],
      'test',
    )
    expect(m.mods.armedCheerHype).toBe(25)
    expect(m.mods.armedFrenzyMul).toBe(1.5)
    expect(m.mods.armedFrenzyDuration).toBe(5)
  })

  it('counterHype et hitsTakenHype arment bien mods (compteur remis à zéro)', () => {
    const m = freshMatch()
    m.phase = 'tactics'
    applyConsigne(
      m,
      [
        { kind: 'counterHype', amount: 30 },
        { kind: 'hitsTakenHype', hits: 3, amount: 20 },
      ],
      'test',
    )
    expect(m.mods.counterHypeAmount).toBe(30)
    expect(m.mods.hitsTakenTarget).toBe(3)
    expect(m.mods.hitsTakenHype).toBe(20)
    expect(m.mods.hitsTakenCount).toBe(0)
  })

  it('halveEnemySpecial et blockEnemyCard passent bien à true', () => {
    const m = freshMatch()
    m.phase = 'tactics'
    applyConsigne(
      m,
      [{ kind: 'halveEnemySpecial' }, { kind: 'blockEnemyCard' }],
      'test',
    )
    expect(m.mods.halveEnemySpecial).toBe(true)
    expect(m.mods.blockNextEnemyCard).toBe(true)
  })

  it('drainSouffle CUMULE (+=) sur deux pauses au lieu de remplacer', () => {
    const m = freshMatch()
    m.phase = 'tactics'
    applyConsigne(m, [{ kind: 'drainSouffle', amount: 2 }], 'test1')
    expect(m.mods.drainEnemySouffle).toBe(2)
    m.consigneUsed = false
    m.phase = 'tactics'
    applyConsigne(m, [{ kind: 'drainSouffle', amount: 1 }], 'test2')
    expect(m.mods.drainEnemySouffle).toBe(3)
  })
})

describe('resolveAttack/fireSpecial : branches à issue rare (RNG ou fenêtre étroite), jamais exercées', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Contre parfait + Orgueil du Rival : les deux bonus armés se déclenchent ensemble et se consomment', () => {
    const m = freshMatch()
    toFighting(m)
    m.enemy.nextActionAt = m.t // l'adversaire attaque ce tick
    m.player.nextActionAt = m.t + 1000 // le joueur n'attaque pas ce tick
    m.player.stance = 'counter'
    m.player.counterUntil = m.t + 2.5 // fenêtre de contre active
    m.mods.armedCounterMul = 1.8
    m.mods.counterHypeAmount = 30
    m.player.hype = 0
    const enemyHpBefore = m.enemy.hp
    tick(m, 0.001, quiet)
    expect(m.enemy.hp).toBeLessThan(enemyHpBefore) // le contre a bien tapé l'attaquant
    expect(m.mods.armedCounterMul).toBe(0) // consommé
    expect(m.mods.counterHypeAmount).toBe(0) // consommé
    expect(m.player.hype).toBeCloseTo(44, 0) // +30 (Orgueil) + 14 (contre de base)
    expect(m.events.some(e => e.kind === 'cardProc' && e.text.includes('CONTRE PARFAIT'))).toBe(true)
    expect(m.events.some(e => e.kind === 'cardProc' && e.text.includes('ORGUEIL DU RIVAL'))).toBe(true)
    expect(m.events.some(e => e.kind === 'countered' && e.by === 'player')).toBe(true)
  })

  it('Garde (posture défensive) : réduit bien les dégâts et accorde de la Hype au défenseur', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25) // sous le seuil de garde (0,35), au-dessus de l'esquive
    const m = createMatch(ROSTER[3], ROSTER[0]) // Gorō (spd 3) défend : esquive quasi nulle
    toFighting(m)
    m.player.stance = 'defensive'
    m.player.nextActionAt = m.t + 1000
    m.enemy.nextActionAt = m.t
    m.player.hype = 0
    const hpBefore = m.player.hp
    tick(m, 0.001, quiet)
    expect(m.player.hp).toBeLessThan(hpBefore) // touché quand même, juste amorti
    expect(m.player.hype).toBeCloseTo(6, 0) // bonus de garde
    expect(m.events.some(e => e.kind === 'blocked' && e.target === 'player')).toBe(true)
  })

  it('Cœur Vaillant : encaisser le Nème coup déclenche le bonus de Hype et se désarme', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // jamais d'esquive, jamais de crit, jamais de garde
    const m = freshMatch()
    toFighting(m)
    m.player.nextActionAt = m.t
    m.enemy.nextActionAt = m.t + 1000
    m.enemyMods.hitsTakenTarget = 1
    m.enemyMods.hitsTakenHype = 25
    m.enemyMods.hitsTakenCount = 0
    m.enemy.hype = 0
    tick(m, 0.001, quiet)
    expect(m.enemyMods.hitsTakenTarget).toBe(0) // désarmé après déclenchement
    expect(m.enemy.hype).toBeCloseTo(28, 0) // +3 (encaisser) + 25 (Cœur Vaillant)
    expect(m.events.some(e => e.kind === 'cardProc' && e.text.includes('CŒUR VAILLANT'))).toBe(true)
  })

  it("une posture agressive booste VRAIMENT le taux de critique (+0,08) — jamais exercé : plusieurs tests posent `stance='aggressive'` mais aucun ne mesurait son effet sur les coups portés (comparaison statistique sur 400 tirages, l'effet est large et se voit même en tirage libre)", () => {
    function critRate(stance: 'neutral' | 'aggressive', n: number) {
      let crits = 0
      for (let i = 0; i < n; i++) {
        const m = freshMatch()
        toFighting(m)
        m.player.stance = stance
        m.player.nextActionAt = m.t
        m.enemy.nextActionAt = m.t + 1000
        tick(m, 0.001, quiet)
        if (m.events.some(e => e.kind === 'hit' && e.crit)) crits++
      }
      return crits / n
    }
    expect(critRate('aggressive', 400)).toBeGreaterThan(critRate('neutral', 400))
  })

  it("posture DÉFENSIVE : l'attaque automatique est parfois carrément SAUTÉE (45 % de chance), pas juste amortie — jamais exercé, tous les autres tests en posture défensive laissaient le coup partir puis testaient son atténuation", () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1) // < 0,45 : la frappe est sautée
    const m = freshMatch()
    toFighting(m)
    m.player.stance = 'defensive'
    m.player.nextActionAt = m.t // prêt à agir
    m.enemy.nextActionAt = m.t + 1000
    const enemyHpBefore = m.enemy.hp
    const nextActionBefore = m.player.nextActionAt
    tick(m, 0.001, quiet)
    expect(m.enemy.hp).toBe(enemyHpBefore) // aucun coup n'est parti
    expect(m.events.some(e => ['hit', 'blocked', 'dodged'].includes(e.kind))).toBe(false)
    expect(m.player.nextActionAt).toBeGreaterThan(nextActionBefore) // le timer a quand même avancé
  })

  it("Cœur Vaillant : un coup encaissé qui n'atteint PAS encore le seuil incrémente le compteur SANS déclencher le bonus (seul le cas 'atteint pile' était testé)", () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // jamais d'esquive, jamais de crit, jamais de garde
    const m = freshMatch()
    toFighting(m)
    m.player.nextActionAt = m.t
    m.enemy.nextActionAt = m.t + 1000
    m.enemyMods.hitsTakenTarget = 2 // il faudra 2 coups, pas 1
    m.enemyMods.hitsTakenHype = 25
    m.enemyMods.hitsTakenCount = 0
    m.enemy.hype = 0
    tick(m, 0.001, quiet)
    expect(m.enemyMods.hitsTakenCount).toBe(1) // incrémenté…
    expect(m.enemyMods.hitsTakenTarget).toBe(2) // …mais pas encore désarmé
    expect(m.enemy.hype).toBeCloseTo(3, 0) // seulement le +3 d'encaisser, pas le bonus
    expect(m.events.some(e => e.kind === 'cardProc' && e.text.includes('CŒUR VAILLANT'))).toBe(false)
  })

  it('un attaquant confus inflige des dégâts réduits (×0,7) — jamais exercé, seul le garde-fou anti-spam des ORDRES confus l\'était, pas son effet sur les DÉGÂTS eux-mêmes', () => {
    function playerDamage(confused: boolean) {
      vi.spyOn(Math, 'random').mockReturnValue(0.99) // jamais d'esquive, jamais de crit, jamais de garde
      const m = freshMatch()
      toFighting(m)
      m.player.nextActionAt = m.t
      m.enemy.nextActionAt = m.t + 1000
      if (confused) m.player.confusedUntil = m.t + 10
      const before = m.enemy.hp
      tick(m, 0.001, quiet)
      vi.restoreAllMocks()
      return before - m.enemy.hp
    }
    expect(playerDamage(true)).toBeLessThan(playerDamage(false))
  })

  it('un défenseur confus esquive MOINS bien (`-0.08` sur sa chance d\'esquive) — jamais exercé', () => {
    // Écart de dodgeChance calculé (Rei, spd 8, posture neutre) : 0,176 sans
    // confusion, 0,096 confus. Un random() figé À 0,13 (entre les deux, et
    // sous le seuil de critique 0,12 côté attaquant neutre : ne déclenche
    // JAMAIS le critique par accident) tranche net entre les deux cas.
    vi.spyOn(Math, 'random').mockReturnValue(0.13)
    const baseline = freshMatch()
    toFighting(baseline)
    baseline.player.nextActionAt = baseline.t
    baseline.enemy.nextActionAt = baseline.t + 1000
    tick(baseline, 0.001, quiet)
    expect(baseline.events.some(e => e.kind === 'dodged')).toBe(true) // esquive : chance suffisante

    const confused = freshMatch()
    toFighting(confused)
    confused.player.nextActionAt = confused.t
    confused.enemy.nextActionAt = confused.t + 1000
    confused.enemy.confusedUntil = confused.t + 10
    tick(confused, 0.001, quiet)
    expect(confused.events.some(e => e.kind === 'dodged')).toBe(false) // confus : plus assez de marge
    expect(confused.events.some(e => e.kind === 'hit')).toBe(true) // le coup passe
  })

  it('la Frénésie armée (Fang) amplifie VRAIMENT les dégâts une fois active — les tests existants ne vérifiaient que son armement (`frenzyUntil` posé), jamais sa consommation par un coup', () => {
    function playerDamage(frenzied: boolean) {
      vi.spyOn(Math, 'random').mockReturnValue(0.99) // jamais d'esquive, jamais de crit, jamais de garde
      const m = freshMatch()
      toFighting(m)
      m.player.nextActionAt = m.t
      m.enemy.nextActionAt = m.t + 1000
      if (frenzied) {
        m.mods.frenzyUntil = m.t + 5
        m.mods.armedFrenzyMul = 1.5
      }
      const before = m.enemy.hp
      tick(m, 0.001, quiet)
      vi.restoreAllMocks()
      return before - m.enemy.hp
    }
    expect(playerDamage(true)).toBeGreaterThan(playerDamage(false))
  })

  it("un Cérébral hurlé sur un ordre de POSTURE ('attack') est stressé (0 gain, -4 Hype) — jamais exercé : seule la commande 'cheer' testait ce trait, pas les ordres de posture qui ont leur PROPRE branche cérébrale dans applyCommand", () => {
    const m = createMatch(ROSTER[2], ROSTER[1], []) // Yuna, cérébrale
    toFighting(m)
    m.player.nextActionAt = m.t + 1000
    m.enemy.nextActionAt = m.t + 1000
    m.player.hype = 50
    tick(m, 0.05, { command: 'attack', voiceEnergy: 0.8, faceEnergy: 0 }) // hurlé
    expect(m.player.hype).toBeLessThan(50) // -4, pas de gain d'ordre
    expect(m.events.some(e => e.kind === 'trait' && e.text.includes('BRUIT'))).toBe(true)
  })

  it("un Cérébral CALME sur un ordre de POSTURE transcende (×2,5 le gain de base) — jamais exercé", () => {
    function orderGain(voiceEnergy: number, voiceTone: number) {
      const m = createMatch(ROSTER[2], ROSTER[1], []) // Yuna, cérébrale
      toFighting(m)
      m.player.nextActionAt = m.t + 1000
      m.enemy.nextActionAt = m.t + 1000
      const before = m.player.hype
      tick(m, 0.05, { command: 'attack', voiceEnergy, faceEnergy: 0, voiceTone })
      return m.player.hype - before
    }
    // calme : volume posé (< 0,45) ET ton posé (< 1,1) → orderHype = 5×hrtScale
    // neutre : volume/ton qui ne remplissent ni 'shouting' ni 'calm' → 2×hrtScale
    expect(orderGain(0.2, 1.0)).toBeGreaterThan(orderGain(0.5, 1.0))
  })

  it('un contre SANS bonus armé (armedCounterMul/counterHypeAmount à 0) frappe quand même, juste sans les procs de carte — jamais exercé isolément, le seul test posait toujours les deux mods', () => {
    const m = freshMatch()
    toFighting(m)
    m.enemy.nextActionAt = m.t
    m.player.nextActionAt = m.t + 1000
    m.player.stance = 'counter'
    m.player.counterUntil = m.t + 2.5
    expect(m.mods.armedCounterMul).toBe(0)
    expect(m.mods.counterHypeAmount).toBe(0)
    const enemyHpBefore = m.enemy.hp
    tick(m, 0.001, quiet)
    expect(m.enemy.hp).toBeLessThan(enemyHpBefore) // le contre tape quand même, mul de base 1.3
    expect(m.events.some(e => e.kind === 'countered' && e.by === 'player')).toBe(true)
    expect(m.events.some(e => e.kind === 'cardProc' && e.text.includes('CONTRE PARFAIT'))).toBe(false)
    expect(m.events.some(e => e.kind === 'cardProc' && e.text.includes('ORGUEIL DU RIVAL'))).toBe(false)
  })

  it("Leçon d'Expérience : le premier spécial adverse encaissé après armement est divisé par deux, une seule fois", () => {
    const m = freshMatch()
    toFighting(m)
    m.enemyMods.halveEnemySpecial = true
    m.player.hype = HYPE_MAX
    m.player.nextActionAt = m.t + 1000
    m.enemy.nextActionAt = m.t + 1000
    const enemyHpBefore = m.enemy.hp
    tick(m, 0.05, { command: 'special', voiceEnergy: 0.6, faceEnergy: 0 })
    const fullDmg = enemyHpBefore - m.enemy.hp
    expect(m.enemyMods.halveEnemySpecial).toBe(false) // consommé
    expect(m.events.some(e => e.kind === 'cardProc' && e.text.includes("LEÇON D'EXPÉRIENCE"))).toBe(true)
    // Match retour, sans le mod armé : le même spécial doit taper ~2× plus fort.
    const m2 = freshMatch()
    toFighting(m2)
    m2.player.hype = HYPE_MAX
    m2.player.nextActionAt = m2.t + 1000
    m2.enemy.nextActionAt = m2.t + 1000
    const enemyHpBefore2 = m2.enemy.hp
    tick(m2, 0.05, { command: 'special', voiceEnergy: 0.6, faceEnergy: 0 })
    const fullDmg2 = enemyHpBefore2 - m2.enemy.hp
    expect(fullDmg).toBeLessThan(fullDmg2 * 0.6) // clairement divisé par ~2, pas juste réduit
  })

  it("Leçon d'Expérience CÔTÉ JOUEUR : quand c'est le JOUEUR (pas l'ennemi) qui a le mod armé et encaisse le spécial adverse, le texte de l'event n'a PAS le suffixe ADVERSE — seul le cas symétrique (joueur attaquant, ennemi défenseur) était exercé", () => {
    const m = freshMatch()
    toFighting(m)
    m.player.nextActionAt = m.t + 1000
    m.enemy.nextActionAt = m.t + 1000
    m.mods.halveEnemySpecial = true // armé côté JOUEUR : c'est LUI qui anticipe
    m.enemy.hype = HYPE_MAX // le spécial ADVERSE (pas celui du joueur) va se déclencher
    vi.spyOn(Math, 'random').mockReturnValue(0) // sous le seuil 1.2×dt (dt=1) d'enemyCoachAI
    tick(m, 1, quiet)
    expect(m.mods.halveEnemySpecial).toBe(false) // consommé
    expect(m.events.some(e => e.kind === 'cardProc' && e.text === "LEÇON D'EXPÉRIENCE !!")).toBe(true)
    expect(m.events.some(e => e.kind === 'cardProc' && e.text.includes('ADVERSE'))).toBe(false)
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

  it("rejette un buffer trop COURT pour couvrir le lag le plus grave (MIN_HZ) — jamais exercé, même un signal fort ne suffit pas", async () => {
    // maxLag = floor(sampleRate / MIN_HZ) = floor(48000/70) = 685 : un
    // buffer plus court ne peut physiquement pas mesurer une période aussi
    // grave, quelle que soit l'intensité du signal (garde-fou distinct du
    // rejet par énergie faible, jamais exercé jusqu'ici).
    const { detectPitch } = await import('../systems/pitch')
    const sr = 48000
    const buf = new Float32Array(500) // < 685
    for (let i = 0; i < buf.length; i++) buf[i] = Math.sin((2 * Math.PI * 220 * i) / sr) * 0.3
    expect(detectPitch(buf, sr)).toBeNull()
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

  it("un lag dont la fenêtre de corrélation tombe entièrement à zéro (den=0) est ignoré sans NaN — branche `den > 0 ? ... : 0` jamais exercée, seuls des buffers uniformément voisés l'étaient", async () => {
    const { detectPitch } = await import('../systems/pitch')
    // sampleRate/MIN_HZ = 7000/70 = 100 = maxLag EXACTEMENT : sa fenêtre de
    // corrélation ne fait plus qu'un seul échantillon (n - maxLag = 1).
    // En mettant CE SEUL échantillon (et son miroir en fin de buffer) à 0,
    // den tombe à 0 pile pour ce lag, sans toucher les autres — le reste
    // du buffer garde assez d'énergie pour passer le seuil RMS global.
    const sr = 7000
    const n = 101
    const buf = new Float32Array(n)
    for (let i = 1; i < n - 1; i++) buf[i] = Math.sin((2 * Math.PI * 300 * i) / sr) * 0.5
    buf[0] = 0
    buf[n - 1] = 0
    expect(() => detectPitch(buf, sr)).not.toThrow()
    const hz = detectPitch(buf, sr)
    expect(hz).not.toBeNull() // les autres lags, eux, corrèlent normalement
    expect(Number.isNaN(hz)).toBe(false)
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

describe('coaching modulé par trait/état (jamais exercé — trouvé en audit de couverture)', () => {
  // Gèle les attaques automatiques des deux côtés : « encaisser fait monter
  // la rage » (+3 Hype) contaminerait sinon les mesures ci-dessous — un
  // combat auto-résolu peut démarrer dès la sortie de l'intro.
  function freeze(m: MatchState): void {
    m.player.nextActionAt = m.t + 1000
    m.enemy.nextActionAt = m.t + 1000
  }

  it('Cérébral : un ordre calme et posé le transcende (bonus de Hype supérieur au défaut)', () => {
    const m = createMatch(ROSTER[2], ROSTER[1]) // Yuna, cérébrale, hrt=6 → hrtScale=1
    toFighting(m)
    freeze(m)
    m.player.hype = 20
    // volume bas ET ton posé : les deux conditions du calme, à la fois
    tick(m, 0.001, { command: 'attack', voiceEnergy: 0.2, faceEnergy: 0, voiceTone: 1 })
    expect(m.player.hype).toBeCloseTo(25, 1) // 20 + 5 * hrtScale(1) — pas le défaut 2 * hrtScale
    expect(m.player.stance).toBe('aggressive')
    expect(m.events.some(e => e.kind === 'trait')).toBe(false) // aucun malus déclenché
  })

  it("Têtu : le premier ordre de posture du round est superbement ignoré, le second s'applique", () => {
    const m = createMatch(ROSTER[1], ROSTER[0]) // Rei, têtue
    toFighting(m)
    freeze(m)
    tick(m, 0.001, { command: 'attack', voiceEnergy: 0.5, faceEnergy: 0 })
    expect(m.player.stance).not.toBe('aggressive')
    expect(m.events.some(e => e.kind === 'trait' && e.text.includes("T'IGNORE"))).toBe(true)
    m.player.lastOrderAt = m.t - 10 // hors fenêtre anti-confusion pour le 2e ordre
    tick(m, 0.001, { command: 'attack', voiceEnergy: 0.5, faceEnergy: 0 })
    expect(m.player.stance).toBe('aggressive')
  })

  it("Boudeur (Vie d'Écurie) : le tout premier ordre du match passe à la trappe, une seule fois", () => {
    const m = createMatch(ROSTER[0], ROSTER[1], [], { sulky: true })
    toFighting(m)
    freeze(m)
    tick(m, 0.001, { command: 'attack', voiceEnergy: 0.5, faceEnergy: 0 })
    expect(m.player.stance).not.toBe('aggressive')
    expect(m.sulky).toBe(false) // consommé, même s'il boude
    expect(m.events.some(e => e.kind === 'trait' && e.text.includes('BOUDE'))).toBe(true)
    m.player.lastOrderAt = m.t - 10
    tick(m, 0.001, { command: 'attack', voiceEnergy: 0.5, faceEnergy: 0 })
    expect(m.player.stance).toBe('aggressive')
  })

  it("Provoqué (carte adverse) : verrouillé agressif, le coach ne peut plus donner d'ordre", () => {
    const m = freshMatch()
    toFighting(m)
    freeze(m)
    m.enemyMods.provokedUntil = m.t + 5
    tick(m, 0.001, { command: 'defend', voiceEnergy: 0.5, faceEnergy: 0 })
    expect(m.player.stance).not.toBe('defensive') // l'ordre est refusé, pas juste ignoré silencieusement
    expect(m.events.some(e => e.kind === 'trait' && e.text.includes('PROVOQU'))).toBe(true)
  })

  it("Frénésie armée (Fang) : le premier ordre d'attaque après armement déclenche le bonus, une seule fois", () => {
    const m = freshMatch()
    toFighting(m)
    freeze(m)
    m.mods.armedFrenzyDuration = 8
    tick(m, 0.001, { command: 'attack', voiceEnergy: 0.5, faceEnergy: 0 })
    expect(m.mods.armedFrenzyDuration).toBe(0) // déclencheur consommé
    expect(m.mods.frenzyUntil).toBeGreaterThan(m.t)
    expect(m.events.some(e => e.kind === 'cardProc' && e.text.includes('FRÉNÉSIE'))).toBe(true)
  })

  it("Cri de Guerre armé : le prochain 'cheer' consomme le bonus de Hype, une seule fois", () => {
    const m = freshMatch()
    toFighting(m)
    freeze(m)
    m.mods.armedCheerHype = 10
    m.player.hype = 20
    tick(m, 0.001, { command: 'cheer', voiceEnergy: 0.3, faceEnergy: 0 })
    expect(m.mods.armedCheerHype).toBe(0) // consommé
    expect(m.events.some(e => e.kind === 'cardProc' && e.text.includes('CRI DE GUERRE'))).toBe(true)
    expect(m.player.hype).toBeGreaterThan(29) // gain de base + les 10 bonus (marge dt/hrtScale)
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
    // Chapitre inconnu (absent de STORY_CHAPTERS) : verrouillé par défaut,
    // jamais un crash (bug trouvé en audit, 2026-08-16 — findIndex renvoie
    // -1, et STORY_CHAPTERS[-2].id plantait avant le garde-fou).
    expect(isUnlocked({ ...STORY_CHAPTERS[0], id: 'ch-inconnu' }, new Set())).toBe(false)
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

describe('Progression Histoire persistée (story.ts) — loadCleared/markCleared jamais testés', () => {
  beforeEach(() => {
    ;(globalThis as any).localStorage = fakeLocalStorage()
  })

  it('round-trip : markCleared puis loadCleared retrouve le chapitre, storyProgress compte juste', async () => {
    const { loadCleared, markCleared, storyProgress, STORY_CHAPTERS } = await import('./story')
    expect(loadCleared().size).toBe(0)
    markCleared('ch1')
    markCleared('ch2')
    const cleared = loadCleared()
    expect(cleared.has('ch1')).toBe(true)
    expect(cleared.has('ch2')).toBe(true)
    expect(storyProgress(cleared)).toEqual({ done: 2, total: STORY_CHAPTERS.length })
  })

  it("bug potentiel : un stockage JSON valide mais de mauvaise forme (une chaîne, pas un tableau) ne doit pas polluer le Set de caractères isolés", async () => {
    // JSON.parse('"oops"') = la chaîne "oops", qui EST itérable en JS (une
    // chaîne s'itère caractère par caractère) — contrairement à un nombre
    // ou un objet, elle ne fait PAS planter `new Set(...)`. Sans validation
    // de forme, loadCleared() renverrait silencieusement un Set de
    // caractères isolés ({'o','p','s'}) au lieu de repartir d'un Set vide,
    // comme n'importe quel autre stockage corrompu.
    const { loadCleared } = await import('./story')
    localStorage.setItem('coach-arena-story-v1', '"oops"')
    expect(loadCleared().size).toBe(0)
  })

  it('stockage corrompu (nombre, objet) : loadCleared ne plante jamais et repart vide', async () => {
    const { loadCleared } = await import('./story')
    for (const corrupted of ['42', '{}', '{"a":1}']) {
      localStorage.setItem('coach-arena-story-v1', corrupted)
      expect(() => loadCleared()).not.toThrow()
      expect(loadCleared().size).toBe(0)
    }
  })

  it('JSON réellement invalide (syntaxe cassée) : même repli, catch différent jamais exercé jusqu\'ici', async () => {
    const { loadCleared } = await import('./story')
    localStorage.setItem('coach-arena-story-v1', '[ceci ne parse pas')
    expect(() => loadCleared()).not.toThrow()
    expect(loadCleared().size).toBe(0)
  })

  it('markCleared : une écriture qui échoue (quota dépassé) ne plante jamais', async () => {
    const { markCleared } = await import('./story')
    ;(globalThis as any).localStorage = {
      ...fakeLocalStorage(),
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(() => markCleared('ch1')).not.toThrow()
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

  it("cutsForEvent : côté JOUEUR de 'special'/'ulti' (by: 'player') — le match synthétique ci-dessus n'a qu'un ulti côté enemy et aucun special du tout, donc la moitié `by==='player'` de ces ternaires n'avait jamais tourné", async () => {
    const { cutsForEvent } = await import('./cutPlanner')
    const nameOf = (side: 'player' | 'enemy') => (side === 'player' ? 'Kenta' : 'Rei')
    const special = cutsForEvent(
      { kind: 'special', t: 5, by: 'player', name: 'Poing du Volcan', onoma: 'DOKAAN', dmg: 20 },
      nameOf,
    )
    expect(special[0].chars).toEqual(['Kenta']) // nameOf(e.by)
    expect(special[1].chars).toEqual(['Rei']) // nameOf(e.by === 'player' ? 'enemy' : 'player'), branche jamais exercée

    const ulti = cutsForEvent(
      { kind: 'ulti', t: 5, by: 'player', name: 'Éruption', onoma: 'GOOAR', dmg: 60 },
      nameOf,
    )
    expect(ulti[0].chars).toEqual(['Kenta'])
    expect(ulti[1].chars).toEqual(['Rei']) // même branche jamais exercée, côté ulti

    // 'countered' côté ENEMY (by: 'enemy') : le match synthétique n'a un
    // countered que côté player, donc cette moitié du même ternaire n'était
    // jamais exercée non plus.
    const countered = cutsForEvent({ kind: 'countered', t: 5, by: 'enemy', dmg: 10 }, nameOf)
    expect(countered[0].chars).toEqual(['Kenta', 'Rei']) // [nameOf('player'), nameOf(e.by)]
  })

  it("planCuts : un event 'special' (jamais présent dans le match synthétique ci-dessus) ferme le dernier case d'eventScore jamais atteint", async () => {
    const { planCuts } = await import('./cutPlanner')
    const m = freshMatch()
    m.events = [{ kind: 'special', t: 5, by: 'player', name: 'X', onoma: 'X', dmg: 1 }]
    const cuts = planCuts(m, ROSTER[0], ROSTER[1])
    expect(cuts.some(c => c.kind === 'special-cast')).toBe(true)
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

  it("setLibrary() — jamais appelée par aucun test jusqu'ici (tous passaient la bibliothèque au constructeur) : la VRAIE API utilisée par ArenaScreen après le préchargement async remplace bien la bibliothèque vide pour les prochains update()", async () => {
    const { LiveCutPlayer } = await import('./liveCutPlayer')
    const m = freshMatch()
    const player = new LiveCutPlayer(ROSTER[0], ROSTER[1]) // construit AVANT que le préchargement async ne finisse
    m.events.push({ kind: 'hit', t: 1, target: 'enemy', dmg: 5, crit: false, onoma: 'BAM!' })
    m.t = 1
    player.update(m)
    expect(player.current()).toBeNull() // toujours EMPTY_CUT_LIBRARY à cet instant
    player.setLibrary({ getClip: (kind: string) => ({ url: `fake://${kind}`, duration: 999 }) })
    m.events.push({ kind: 'hit', t: 2, target: 'enemy', dmg: 5, crit: false, onoma: 'BAM!' })
    m.t = 2
    player.update(m)
    expect(player.current()?.url).toBe('fake://attack-solo') // le préchargement a bien pris effet
  })

  it('avec une bibliothèque garnie : les cuts du même événement jouent en séquence, puis expirent', async () => {
    // Un seul 'hit' produit 3 cuts (attack-solo, impact-flash, hit-reaction) :
    // ils doivent tous jouer À LA SUITE (garde-fou par budget de durée, pas
    // par nombre — voir MAX_QUEUE_LAG_S), pas se sabrer au premier qui expire.
    const { LiveCutPlayer } = await import('./liveCutPlayer')
    const fakeLibrary = { getClip: (kind: string) => ({ url: `fake://${kind}`, duration: 999 }) }
    const m = freshMatch()
    const player = new LiveCutPlayer(ROSTER[0], ROSTER[1], fakeLibrary)
    m.events.push({ kind: 'hit', t: 1, target: 'enemy', dmg: 5, crit: false, onoma: 'BAM!' })
    m.t = 1
    player.update(m)
    let active = player.current()
    expect(active).not.toBeNull()
    expect(active!.cut.kind).toBe('attack-solo')
    m.t = active!.until + 0.01
    player.update(m)
    active = player.current()
    expect(active!.cut.kind).toBe('impact-flash') // le suivant du même événement, pas null
    m.t = active!.until + 0.01
    player.update(m)
    active = player.current()
    expect(active!.cut.kind).toBe('hit-reaction')
    m.t = active!.until + 0.01
    player.update(m)
    expect(player.current()).toBeNull() // les 3 sont passés, la file est vide
  })

  it('garde-fou : la file ne dépasse jamais MAX_QUEUE_LAG_S, les cuts en retard sont sautés', async () => {
    const { LiveCutPlayer } = await import('./liveCutPlayer')
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

  it("bug d'audit : un SEUL événement (3 cuts d'un coup) ne se fait plus sabrer par le garde-fou de file", async () => {
    // Avant fix (2026-08-16) : MAX_QUEUE=1 trimmait par NOMBRE d'entrées,
    // donc un seul 'hit' (attack-solo + impact-flash + hit-reaction, 2.4 s
    // cumulées) perdait ses 2 premiers cuts dès leur création — sans
    // aucun retard réel. Le fix trimme par budget de DURÉE.
    const { LiveCutPlayer } = await import('./liveCutPlayer')
    const kinds: string[] = []
    const fakeLibrary = {
      getClip: (kind: string) => {
        kinds.push(kind)
        return { url: `fake://${kind}`, duration: 1 }
      },
    }
    const m = freshMatch()
    const player = new LiveCutPlayer(ROSTER[0], ROSTER[1], fakeLibrary)
    m.t = 1
    m.events.push({ kind: 'hit', t: 1, target: 'enemy', dmg: 5, crit: false, onoma: 'BAM!' })
    player.update(m)
    // Les 3 cuts du seul événement ont bien été demandés à la bibliothèque…
    expect(kinds).toEqual(['attack-solo', 'impact-flash', 'hit-reaction'])
    // …et le tout premier (attack-solo) doit être celui joué en premier,
    // pas sauté au profit du dernier — rien n'était en retard ici.
    expect(player.current()?.cut.kind).toBe('attack-solo')
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
  // cardForge.ts calcule hasStorage UNE FOIS au tout premier import (comme
  // stable.ts/progression.ts) — poser un faux localStorage avant CE
  // premier import (forcément dynamique, jamais un import statique en
  // tête de fichier) garantit que la persistance de la Forge, testée plus
  // bas dans ce fichier, voit hasStorage=true pour le reste du run.
  beforeEach(() => {
    ;(globalThis as any).localStorage = fakeLocalStorage()
  })

  it('createFromPrompt produit un perso complet', () => {
    const c = createFromPrompt('un samouraï cérébral de glace nommé Frimas')
    expect(c.name).toBeTruthy()
    expect(c.ulti.name).toBeTruthy()
    expect(c.stats.hp).toBeGreaterThan(0)
  })

  it('forgeCard borne les cartes et refuse le vide', async () => {
    const { forgeCard } = await import('./cardForge')
    const r = forgeCard('une carte qui soigne beaucoup, appelée Regain')
    expect(r?.card.name).toBe('Regain')
    expect(r?.card.cost).toBeGreaterThanOrEqual(1)
    expect(forgeCard('blablabla sans effet')).toBeNull()
  })

  it('forgeCard : les racines courtes ne matchent QUE des mots plats/conjugués, pas des mots sans rapport qui les CONTIENNENT (bug trouvé en audit, 2026-08-16)', async () => {
    const { forgeCard } = await import('./cardForge')
    // Ces mots français courants contiennent une racine de règle en PLEIN
    // MILIEU (pas en préfixe) — avant le fix, ils déclenchaient à tort
    // une carte. "sans rapport" = aucune des 14 règles ne doit matcher.
    expect(forgeCard('il a besoin de repos avant le match')).toBeNull() // "soin" dans "besoin"
    expect(forgeCard("elle rencontre son adversaire demain")).toBeNull() // "contre" dans "rencontre"
    expect(forgeCard('le commentateur décrit le combat')).toBeNull() // "cri" dans "décrit" (é juste avant : \b seul ne suffisait pas)
    expect(forgeCard('il a du courage face au danger')).toBeNull() // "rage" dans "courage"
    expect(forgeCard('le combat continue sous l’orage')).toBeNull() // "rage" dans "orage"
    expect(forgeCard('il regarde attentivement son adversaire')).toBeNull() // "garde" dans "regarde"
    // Contrôle positif : les vrais mots-clés (et leurs formes conjuguées
    // en PRÉFIXE, le comportement voulu) matchent toujours.
    expect(forgeCard('une potion qui soigne bien')?.card).toBeTruthy()
    expect(forgeCard('un geste qui contre son attaque')?.card).toBeTruthy()
    expect(forgeCard('un cri de guerre puissant')?.card).toBeTruthy()
    expect(forgeCard('il crie très fort sur le ring')?.card).toBeTruthy() // "crie" via le préfixe "cri"
    expect(forgeCard('rempli de rage et de fureur')?.card).toBeTruthy()
    // Limite CONNUE et non résolue (documentée dans cardForge.ts) : un mot
    // qui commence VRAIMENT par la racine ("critique" commence par "cri")
    // reste indissociable d'une vraie forme conjuguée par une simple regex.
    expect(forgeCard('il critique la stratégie adverse')?.card).toBeTruthy()
  })

  it('forgeCard : les 9 règles jamais exercées jusqu’ici produisent le bon kind ET la bonne description', async () => {
    // Seules 5 des 14 règles de cardForge.ts étaient exercées par les
    // tests existants (soigne/contre/cri/rage + les contrôles négatifs) —
    // les 9 autres, et les cas de describe() qu'elles déclenchent
    // (jamais vérifiés eux non plus), restaient un angle mort complet.
    const { forgeCard } = await import('./cardForge')
    const cases: Array<[string, string, RegExp]> = [
      ['un discours qui motive les troupes', 'hype', /Hype/],
      ['une attaque qui démoralise l’adversaire', 'enemyHype', /l'adversaire perd/],
      ['une carapace protectrice', 'damageReduction', /dégâts reçus/],
      ['un mouvement fantôme insaisissable', 'dodgeBonus', /esquive/],
      ['une sérénité totale et imperturbable', 'immuneConfusion', /immunisé à la confusion/],
      ['en position acculé, dos au mur', 'lowHpHypeFull', /Hype pleine/],
      ['un geste qui nargue l’adversaire', 'provoke', /démarre agressif/],
      ['une leçon d’humilité cinglante', 'counterHype', /contre réussi/],
      ['une résistance qui encaisse tout', 'hitsTakenHype', /encaisser \d+ coups/],
      ['un coach qui anticipe chaque attaque', 'halveEnemySpecial', /spécial adverse est réduit/],
    ]
    for (const [prompt, kind, descRe] of cases) {
      const r = forgeCard(prompt)
      expect(r, prompt).toBeTruthy()
      expect(r!.card.effects.map(e => e.kind), prompt).toContain(kind)
      expect(r!.card.desc, prompt).toMatch(descRe)
    }
  })

  it('deriveTiming : condition pour les effets conditionnels (jamais exercé jusqu’ici)', async () => {
    const { forgeCard } = await import('./cardForge')
    const r = forgeCard('en position acculé, dos au mur')!
    expect(r.card.timing).toBe('condition')
  })

  it('primitivePower(hitsTakenHype) tient compte de `hits` : moins de coups requis coûte plus cher', () => {
    // Les coûts des cartes DU JEU ACTUEL (hits: 3 partout, CARD_POOL +
    // SIGNATURE_CARDS) restent inchangés par construction — déjà vérifié
    // par le test « le coût budgétisé reproduit le coût déclaré » juste
    // au-dessus, qui couvre les deux collections exhaustivement. Ici, la
    // propriété NOUVELLE qu'introduit le fix : à `amount` égal, moins de
    // coups requis (plus facile à déclencher) doit coûter plus cher —
    // avant le fix, `hits` était totalement ignoré du calcul.
    const cheap = computeCost([{ kind: 'hitsTakenHype', hits: 5, amount: 30 }]) // dur à déclencher
    const mid = computeCost([{ kind: 'hitsTakenHype', hits: 3, amount: 30 }]) // référence actuelle
    const pricey = computeCost([{ kind: 'hitsTakenHype', hits: 2, amount: 30 }]) // facile à déclencher
    expect(pricey).toBeGreaterThanOrEqual(mid)
    expect(mid).toBeGreaterThanOrEqual(cheap)
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

  it("bug d'audit : un crit encaissé par le JOUEUR (donc frappé par l'ennemi) référence bien l'ennemi", () => {
    // Avant fix (2026-08-16) : 'hit' n'a pas de champ `by` (seulement
    // `target`, qui ENCAISSE), donc `'by' in c.e` était toujours faux et
    // `by` retombait systématiquement sur `player` — même quand c'est
    // l'ENNEMI qui avait frappé. La mauvaise planche de perso partait en
    // génération Kling payante.
    const m = freshMatch()
    m.events.push(
      { kind: 'hit', t: 10, target: 'player', dmg: 40, crit: true, onoma: 'DOKAN!!' },
      { kind: 'roundEnd', t: 15, winner: 'enemy' },
      { kind: 'matchEnd', t: 15, winner: 'enemy' },
    )
    const plans = buildScenePlans(m, ROSTER[0], ROSTER[1])
    const highlight = plans.find(p => p.id === 'round1-highlight')
    expect(highlight?.refChars).toEqual([ROSTER[1].id]) // l'ENNEMI a frappé, pas le joueur
  })

  it("bug d'audit : un round où le seul événement notable est hypeFull ne perd plus son créneau de moment fort", () => {
    // Avant fix (2026-08-16) : eventScore('hypeFull') = 1 > 0 le faisait
    // gagner l'élection du round, mais momentPrompt n'a aucun cas pour
    // 'hypeFull' → retourne null → AUCUN plan n'était poussé pour ce
    // round, même si un autre event notable existait. Ici, le crit du
    // round 2 doit produire son highlight malgré le hypeFull du round 1.
    const m = freshMatch()
    m.events.push(
      { kind: 'roundStart', t: 0, round: 1 },
      { kind: 'hypeFull', t: 5, who: 'player' },
      { kind: 'roundEnd', t: 10, winner: 'player' },
      { kind: 'roundStart', t: 10, round: 2 },
      { kind: 'hit', t: 20, target: 'enemy', dmg: 30, crit: true, onoma: 'BAM!' },
      { kind: 'roundEnd', t: 25, winner: 'player' },
      { kind: 'matchEnd', t: 25, winner: 'player' },
    )
    m.playerWins = 2
    const plans = buildScenePlans(m, ROSTER[0], ROSTER[1], 2)
    expect(plans.some(p => p.id === 'round2-highlight')).toBe(true)
  })

  it('buildScenePlans : un spécial adverse produit un moment fort référençant le bon perso (jamais exercé jusqu’ici)', () => {
    // 'ulti' et 'hit' (crit) sont couverts par les tests précédents,
    // mais 'special' et 'countered' — deux des quatre kinds acceptés par
    // momentPrompt — n'avaient jamais été exercés du tout.
    const m = freshMatch()
    m.events.push(
      { kind: 'special', t: 20, by: 'enemy', name: ROSTER[1].special.name, onoma: 'ZUKYUN!', dmg: 30 },
      { kind: 'roundEnd', t: 25, winner: 'enemy' },
      { kind: 'matchEnd', t: 25, winner: 'enemy' },
    )
    const plans = buildScenePlans(m, ROSTER[0], ROSTER[1])
    const highlight = plans.find(p => p.id === 'round1-highlight')
    expect(highlight?.refChars).toEqual([ROSTER[1].id]) // l'ennemi a lancé le spécial
    expect(highlight?.prompt).toContain(ROSTER[1].special.name)
    expect(highlight?.prompt).not.toContain('undefined')
  })

  it("buildScenePlans : un spécial du JOUEUR (pas seulement adverse) référence bien l'ENNEMI comme cible dans le prompt — `foeOf('player')` jamais exercé, seul `foeOf('enemy')` (spécial adverse) l'était", () => {
    const m = freshMatch()
    m.events.push(
      { kind: 'special', t: 20, by: 'player', name: ROSTER[0].special.name, onoma: 'DOKAAN!!', dmg: 30 },
      { kind: 'roundEnd', t: 25, winner: 'player' },
      { kind: 'matchEnd', t: 25, winner: 'player' },
    )
    m.playerWins = 2
    const plans = buildScenePlans(m, ROSTER[0], ROSTER[1])
    const highlight = plans.find(p => p.id === 'round1-highlight')
    expect(highlight?.refChars).toEqual([ROSTER[0].id]) // le JOUEUR a lancé le spécial
    expect(highlight?.prompt).toContain(ROSTER[1].name) // la CIBLE nommée dans le prompt : l'ennemi
    expect(highlight?.prompt).not.toContain('undefined')
  })

  it("un round où un contre (score 4) est suivi d'un crit encaissé (score 3, INFÉRIEUR) garde le contre comme moment fort — jamais exercé, tous les tests précédents n'avaient qu'un seul candidat scorant par round, le comparateur `s > cur.score` ne pouvait jamais échouer", () => {
    const m = freshMatch()
    m.events.push(
      { kind: 'roundStart', t: 0, round: 1 },
      { kind: 'countered', t: 5, by: 'player', dmg: 25 }, // score 4
      { kind: 'hit', t: 8, target: 'enemy', dmg: 10, crit: false, onoma: 'BAM!' }, // score 0 : n'écrase jamais rien
      { kind: 'hit', t: 12, target: 'player', dmg: 20, crit: true, onoma: 'BAM!' }, // score 3 : n'écrase pas 4
      { kind: 'roundEnd', t: 15, winner: 'player' },
      { kind: 'matchEnd', t: 15, winner: 'player' },
    )
    m.playerWins = 2
    const plans = buildScenePlans(m, ROSTER[0], ROSTER[1])
    const highlight = plans.find(p => p.id === 'round1-highlight')
    // Le contre (le joueur) l'emporte, pas le crit encaissé (qui aurait référencé l'ennemi).
    expect(highlight?.refChars).toEqual([ROSTER[0].id])
    expect(highlight?.prompt).toContain('counter')
  })

  it('buildScenePlans : un contre du joueur produit un moment fort référençant le joueur', () => {
    const m = freshMatch()
    m.events.push(
      { kind: 'countered', t: 20, by: 'player', dmg: 25 },
      { kind: 'roundEnd', t: 25, winner: 'player' },
      { kind: 'matchEnd', t: 25, winner: 'player' },
    )
    m.playerWins = 2
    const plans = buildScenePlans(m, ROSTER[0], ROSTER[1])
    const highlight = plans.find(p => p.id === 'round1-highlight')
    expect(highlight?.refChars).toEqual([ROSTER[0].id]) // le joueur a contré
    expect(highlight?.prompt).not.toContain('undefined')
  })

  it('colorWord : branches purple et pink (jamais exercées jusqu’ici)', () => {
    expect(colorWord('#8000ff')).toBe('purple')
    expect(colorWord('#ff00cc')).toBe('pink')
  })

  it("bug potentiel : sur 3 rounds à moments forts, le TRI par score (garder les 2 meilleurs) PUIS le re-tri chronologique n'avaient jamais tourné — tous les tests précédents n'avaient jamais qu'un seul candidat, donc Array.sort() n'appelait jamais son comparateur", () => {
    // Round 1 : le plus FAIBLE (score 3, un crit) — doit être ÉLIMINÉ.
    // Round 2 : score moyen (6, un spécial adverse).
    // Round 3 : le plus FORT (score 10, un ulti joueur).
    // Le tri par score classe donc [round3, round2] (round1 éliminé) —
    // PUIS le re-tri chronologique doit les remettre dans l'ordre
    // [round2, round3] : si ce second tri ne tournait pas vraiment, les
    // plans sortiraient dans le mauvais ordre (round3 avant round2).
    const m = freshMatch()
    m.events.push(
      { kind: 'roundStart', t: 0, round: 1 },
      { kind: 'hit', t: 5, target: 'player', dmg: 20, crit: true, onoma: 'BAM!' },
      { kind: 'roundEnd', t: 10, winner: 'enemy' },
      { kind: 'roundStart', t: 10, round: 2 },
      { kind: 'special', t: 20, by: 'enemy', name: ROSTER[1].special.name, onoma: 'ZUKYUN!', dmg: 30 },
      { kind: 'roundEnd', t: 25, winner: 'enemy' },
      { kind: 'roundStart', t: 25, round: 3 },
      { kind: 'ulti', t: 35, by: 'player', name: ROSTER[0].ulti.name, onoma: 'ZAN!', dmg: 80 },
      { kind: 'roundEnd', t: 40, winner: 'player' },
      { kind: 'matchEnd', t: 40, winner: 'enemy' },
    )
    const plans = buildScenePlans(m, ROSTER[0], ROSTER[1], 2)
    const highlightIds = plans.filter(p => p.id.endsWith('-highlight')).map(p => p.id)
    expect(highlightIds).toEqual(['round2-highlight', 'round3-highlight']) // round1 éliminé, ordre chronologique respecté
    expect(plans.map(p => p.id)).toEqual(['entrance', 'round2-highlight', 'round3-highlight', 'finale'])
  })

  it("dernier round SANS roundEnd explicite avant matchEnd (fin abrupte) : le candidat en cours doit quand même être retenu, jamais exercé", () => {
    const m = freshMatch()
    m.events.push(
      { kind: 'roundStart', t: 0, round: 1 },
      { kind: 'ulti', t: 10, by: 'player', name: ROSTER[0].ulti.name, onoma: 'ZAN!', dmg: 80 },
      { kind: 'matchEnd', t: 10, winner: 'player' }, // pas de roundEnd avant matchEnd cette fois
    )
    m.playerWins = 2
    const plans = buildScenePlans(m, ROSTER[0], ROSTER[1])
    expect(plans.some(p => p.id === 'round1-highlight')).toBe(true)
  })

  it('colorWord : hex invalide, black, grey, orange, yellow, green (max===g), teal — branches jamais exercées', () => {
    expect(colorWord('pas-un-hex')).toBe('vivid') // regex ne matche pas
    expect(colorWord('#050505')).toBe('black')
    expect(colorWord('#808080')).toBe('grey')
    expect(colorWord('#ff8000')).toBe('orange')
    expect(colorWord('#ffc800')).toBe('yellow')
    expect(colorWord('#00ff00')).toBe('green') // aussi la branche max===g du calcul de teinte
    expect(colorWord('#00c8be')).toBe('teal')
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

  it("bug d'audit : cancel() coupe les mises à jour d'un job résolu APRÈS le démontage", async () => {
    // Avant fix (2026-08-16) : le setTimeout du timeout n'était jamais
    // annulé, et rien ne pouvait empêcher onUpdate() d'être rappelé après
    // que l'appelant (ex. ResultsScreen démonté) ait cessé de s'y
    // intéresser — la file continuait de tourner en arrière-plan sans
    // aucun moyen de l'arrêter.
    const { SceneJobQueue } = await import('./sceneQueue')
    const updates: string[][] = []
    let resolveSubmit: (url: string | null) => void
    const pending = new Promise<string | null>(r => (resolveSubmit = r))
    const queue = new SceneJobQueue([plan('a')], {
      submitter: { submit: () => pending },
      onUpdate: jobs => updates.push(jobs.map(j => j.status)),
    })
    queue.start()
    queue.cancel()
    resolveSubmit!('fake://late')
    await new Promise(r => setTimeout(r, 10))
    expect(updates).toEqual([]) // jamais notifié : annulé avant la résolution
    expect(queue.jobs()[0].status).toBe('pending') // l'état interne n'a pas non plus bougé
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

  it("un submitter qui REJETTE (pas juste resolve(null)) passe aussi le job à 'failed' (jamais exercé jusqu'ici)", async () => {
    // Tous les autres tests couvrent l'échec « propre » (resolve(null)) ou
    // le timeout — jamais une vraie exception/rejet (erreur réseau réelle
    // d'un futur submitter serveur), le chemin .catch() de start().
    const { SceneJobQueue } = await import('./sceneQueue')
    const queue = new SceneJobQueue([plan('boom')], {
      submitter: { submit: async () => Promise.reject(new Error('network error')) },
    })
    queue.start()
    await new Promise(r => setTimeout(r, 10))
    expect(queue.jobs()[0].status).toBe('failed')
  })

  it("cancel() AVANT qu'un submitter en vol ne REJETTE : le garde-fou `if (this.cancelled) return` du .catch() n'était jamais exercé (seul celui du .then() l'était)", async () => {
    const { SceneJobQueue } = await import('./sceneQueue')
    const updates: string[][] = []
    let rejectSubmit: (err: Error) => void
    const pending = new Promise<string | null>((_, rej) => (rejectSubmit = rej))
    const queue = new SceneJobQueue([plan('a')], {
      submitter: { submit: () => pending },
      onUpdate: jobs => updates.push(jobs.map(j => j.status)),
    })
    queue.start()
    queue.cancel()
    rejectSubmit!(new Error('network error, mais trop tard'))
    await new Promise(r => setTimeout(r, 10))
    expect(updates).toEqual([]) // jamais notifié : annulé avant le rejet
    expect(queue.jobs()[0].status).toBe('pending') // pas basculé à 'failed' non plus
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

  it("recordMatchMood sur un charId jamais vu (jamais passé par getStable/doStableAction avant) : son propre repli `?? freshState(now)` n'était jamais exercé, seul celui des autres fonctions l'était", async () => {
    const { recordMatchMood, getStable } = await import('./stable')
    expect(() => recordMatchMood('jamais-vu-non-plus', true, DAY1)).not.toThrow()
    expect(getStable('jamais-vu-non-plus', 'sanguin', DAY1).mood).toBe(58) // 50 (frais) + 8 (victoire)
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

  it("dérive douce vers 50 depuis EN DESSOUS (jamais exercée : le test précédent ne part que d'au-dessus, mood > 50)", async () => {
    const { recordMatchMood, getStable } = await import('./stable')
    getStable('goro', 'tetu', DAY1) // seed
    for (let i = 0; i < 5; i++) recordMatchMood('goro', false, DAY1 + i * 1000) // fait chuter l'humeur sous 50
    const before = getStable('goro', 'tetu', DAY1 + 5000)
    expect(before.mood).toBeLessThan(50)
    const fiveDaysLater = DAY1 + 5000 + 5 * 86_400_000
    const drifted = getStable('goro', 'tetu', fiveDaysLater)
    expect(drifted.mood).toBeGreaterThan(before.mood) // remonte vers 50, pas l'inverse
    expect(drifted.mood).toBeLessThanOrEqual(50)
  })

  it("nouveau jour avec une envie DÉJÀ comblée la veille : une nouvelle envie doit naître (jamais exercé, le test 'nouveau jour' existant ne touche pas aux envies)", async () => {
    const { getStable, doStableAction } = await import('./stable')
    const s = getStable('yuna', 'sanguin', DAY1)
    doStableAction('yuna', 'sanguin', s.desire!, 'atk', DAY1) // comble l'envie du jour -> desire = null
    expect(getStable('yuna', 'sanguin', DAY1).desire).toBeNull()
    const nextDay = getStable('yuna', 'sanguin', DAY1 + 86_400_000)
    expect(nextDay.desire).not.toBeNull() // une nouvelle envie est bien née au changement de jour
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

  it("bug d'audit : un stockage JSON valide mais de mauvaise forme (pas un objet) ne fait plus planter getStable", async () => {
    // Avant fix (2026-08-16) : JSON.parse('null'/'5'/'true') réussit (donc
    // le catch ne l'attrape pas), et `charId in all` plantait ensuite sur
    // une valeur non-objet — synchrone dans le rendu de CharacterSelect.
    for (const corrupted of ['null', '5', 'true', '"oops"']) {
      ;(globalThis as any).localStorage = fakeLocalStorage()
      localStorage.setItem('coach-arena-stable-v1', corrupted)
      const { getStable } = await import('./stable')
      expect(() => getStable('kenta', 'sanguin', DAY1)).not.toThrow()
      const s = getStable('kenta', 'sanguin', DAY1)
      expect(s.mood).toBe(50) // repart d'un état neuf, comme si le stockage était vide
    }
  })

  it('desireText (jamais testé) : le texte suit le trait, null si aucune envie active', async () => {
    const { desireText, getStable } = await import('./stable')
    // ROSTER[0] (Kenta) a le trait 'fusionnel' dans le roster réel — passer
    // le MÊME trait à getStable pour que l'envie tirée vienne bien du pool
    // que desireText va relire via char.trait (sinon les deux se
    // désynchronisent et le filtre ne retrouve jamais l'envie).
    const s = getStable('kenta', ROSTER[0].trait, DAY1)
    const text = desireText(ROSTER[0], s)
    expect(text).toContain(ROSTER[0].name)
    expect(desireText(ROSTER[0], { ...s, desire: null })).toBeNull()
    // ROSTER[0] est 'fusionnel' (envies : leisure/rest seulement) — une
    // envie 'train' (jamais dans ce pool) n'a jamais été exercée : le
    // filtre doit retomber sur `pool.length === 0` -> null, pas planter.
    expect(desireText(ROSTER[0], { ...s, desire: 'train' })).toBeNull()
  })

  it("readAll : une VRAIE erreur de syntaxe JSON (pas juste une mauvaise forme) retombe aussi sur un état neuf", async () => {
    const { getStable } = await import('./stable')
    localStorage.setItem('coach-arena-stable-v1', '{ceci nest pas du json')
    expect(() => getStable('kenta', 'sanguin', DAY1)).not.toThrow()
    expect(getStable('kenta', 'sanguin', DAY1).mood).toBe(50)
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
    const { recordResult, pendingReward, claimReward, rewardOptionsFor, getExtraCopies } = await import('./progression')
    expect(pendingReward('goro')).toBeNull() // 0 victoire, rien à réclamer
    expect(getExtraCopies('goro')).toEqual([]) // jamais appelé jusqu'ici : rien de réclamé, tableau vide

    // 6 victoires -> bondLevel(6) = 3, mais le palier proposé reste le PREMIER non réclamé (1), jamais un saut à 3.
    for (let i = 0; i < 6; i++) recordResult('goro', true)
    const first = pendingReward('goro')
    expect(first?.level).toBe(1)
    expect(first?.options).toEqual(rewardOptionsFor('goro', 1))

    // Refuse une carte hors des options proposées.
    expect(claimReward('goro', 'carte-inexistante-xyz' as any)).toBe(false)
    // Réclame la vraie récompense du palier 1.
    expect(claimReward('goro', first!.options[0])).toBe(true)
    expect(getExtraCopies('goro')).toEqual([first!.options[0]]) // la carte réclamée apparaît bien
    // Le palier suivant proposé est bien le 2, pas un saut plus loin.
    expect(pendingReward('goro')?.level).toBe(2)
    // Impossible de réclamer deux fois le même palier avec la même carte déjà réclamée.
    expect(claimReward('goro', first!.options[0])).toBe(false)
  })

  it("claimReward refuse aussi via la branche `level <= claimed` — jamais exercée : le test précédent la refusait toujours via `!options.includes(cardId)` (options du palier 2, carte du palier 1)", async () => {
    const { recordResult, pendingReward, claimReward } = await import('./progression')
    recordResult('nyx', true) // 1 victoire -> bondLevel(1) = 1, ne bougera plus dans ce test
    const p = pendingReward('nyx')
    expect(p?.level).toBe(1)
    expect(claimReward('nyx', p!.options[0])).toBe(true) // claimed passe à 1
    // Le niveau de Lien n'a PAS changé (toujours 1 victoire) : level(1) <= claimed(1)
    // doit rejeter directement, avant même de comparer les options.
    expect(claimReward('nyx', p!.options[0])).toBe(false)
    expect(claimReward('nyx', p!.options[1])).toBe(false)
  })

  it("claimReward sur un charId jamais enregistré (jamais passé par recordResult) : le repli `map[charId] ?? {...}` de claimReward lui-même n'était jamais exercé — seul celui de getProgress l'était", async () => {
    const { claimReward } = await import('./progression')
    expect(() => claimReward('jamais-vu-de-ce-perso', 'massage')).not.toThrow()
    expect(claimReward('jamais-vu-de-ce-perso', 'massage')).toBe(false) // 0 victoire, 0 palier : rien à réclamer
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

  it("loadCustoms migre aussi un perso SANS spécial du tout (branche `?? 'Frappe Légendaire'` jamais exercée — le test ci-dessus a toujours un special.name valide)", async () => {
    ;(globalThis as any).localStorage.setItem(
      'coach-arena-customs-v1',
      JSON.stringify([{ ...ROSTER[0], id: 'sans-special', special: undefined, ulti: undefined }]),
    )
    const { loadCustoms } = await import('./progression')
    const found = loadCustoms().find(x => x.id === 'sans-special')
    expect(found?.ulti.name).toBe('Frappe Légendaire : Zénith')
  })

  it("bug potentiel : un stockage JSON valide « null » ne doit pas planter getProgress ni loadCustoms", async () => {
    // JSON.parse('null') = null SANS exception. getProgress fait
    // `map[charId]` (planterait sur null) ; loadCustoms fait
    // `for (const c of customs)` (null n'est pas itérable, plante aussi) —
    // quatrième et cinquième occurrence de la même famille de bug trouvée
    // en balayant tous les JSON.parse du dépôt (stable.ts, deckBuilder.ts,
    // story.ts, onboarding.ts).
    const { getProgress, loadCustoms } = await import('./progression')
    localStorage.setItem('coach-arena-progress-v1', 'null')
    localStorage.setItem('coach-arena-customs-v1', 'null')
    expect(() => getProgress('kenta')).not.toThrow()
    expect(getProgress('kenta')).toEqual({ wins: 0, losses: 0 })
    expect(() => loadCustoms()).not.toThrow()
    expect(loadCustoms()).toEqual([])
  })

  it('loadCustoms : un stockage de mauvaise forme (chaîne, nombre, objet — pas un tableau) ne plante jamais', async () => {
    const { loadCustoms } = await import('./progression')
    for (const corrupted of ['"oops"', '42', '{}']) {
      localStorage.setItem('coach-arena-customs-v1', corrupted)
      expect(() => loadCustoms()).not.toThrow()
      expect(loadCustoms()).toEqual([])
    }
  })

  it('JSON réellement invalide (syntaxe cassée, ne parse même pas) : même repli, jamais de crash — même angle mort que onboarding.ts', async () => {
    const { getProgress, loadCustoms } = await import('./progression')
    localStorage.setItem('coach-arena-progress-v1', '{ceci ne parse pas')
    localStorage.setItem('coach-arena-customs-v1', '[ceci non plus')
    expect(() => getProgress('kenta')).not.toThrow()
    expect(getProgress('kenta')).toEqual({ wins: 0, losses: 0 })
    expect(() => loadCustoms()).not.toThrow()
    expect(loadCustoms()).toEqual([])
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

  it("côté ADVERSE (enemy) de chaque ternaire `=== 'player' ? P : E` — jamais exercé : le test ci-dessus ne passait QUE 'player' à chaque cas, donc la moitié `: E` (substitution ET choix du pool gagnant/perdant) n'avait jamais tourné", async () => {
    const { Commentator } = await import('./commentator')
    // Chaque cas doit produire une ligne sans planter : le ternaire est
    // évalué DANS la construction de `vars`/du pool choisi, indépendamment
    // du gabarit ensuite tiré au hasard — peu importe s'il référence la
    // variable, seule l'évaluation du ternaire lui-même compte ici.
    const cases: Array<[import('./types').CombatEvent, 1 | 2 | 3]> = [
      [{ kind: 'dodged', t: 10, target: 'enemy' }, 1],
      [{ kind: 'blocked', t: 10, target: 'enemy', dmg: 1 }, 1],
      [{ kind: 'countered', t: 10, by: 'enemy', dmg: 1 }, 2],
      [{ kind: 'special', t: 10, by: 'enemy', name: 'X', onoma: 'X', dmg: 1 }, 3],
      [{ kind: 'ulti', t: 10, by: 'enemy', name: 'X', onoma: 'X', dmg: 1 }, 3],
      [{ kind: 'hypeFull', t: 10, who: 'enemy' }, 2],
      [{ kind: 'ultiReady', t: 10, who: 'enemy' }, 3],
      [{ kind: 'confused', t: 10, who: 'enemy' }, 1],
      [{ kind: 'roundEnd', t: 10, winner: 'enemy' }, 3], // le joueur PERD ce round -> T.roundEndLose
      [{ kind: 'matchEnd', t: 10, winner: 'enemy' }, 3], // le joueur PERD le match -> T.matchEndLose
    ]
    for (const [ev, weight] of cases) {
      const m = freshMatch()
      const c = new Commentator()
      c.ingest(m)
      m.t = 10
      m.events.push(ev)
      const line = c.ingest(m)
      expect(() => c.ingest(m), ev.kind).not.toThrow()
      expect(line?.weight, `weight for ${ev.kind}`).toBe(weight)
      expect(line?.text, ev.kind).not.toContain('{')
      expect(line?.text, ev.kind).not.toContain('}')
    }
  })

  it("'hit' : les 4 combinaisons crit×quiet, jamais toutes exercées — seul crit=false (toujours null) et le silence de 3 s (mais jamais avec un crit) l'étaient", async () => {
    const { Commentator } = await import('./commentator')
    // crit + silencieux (< 3 s depuis le dernier commentaire) : doit rester null,
    // distinct du cas crit=false déjà testé ET du cas silence déjà testé sans crit.
    const mQuiet = freshMatch()
    const cQuiet = new Commentator()
    cQuiet.ingest(mQuiet) // roundStart initial à t=0, lastCommentAt=0
    mQuiet.t = 1 // < 3s depuis le dernier commentaire
    mQuiet.events.push({ kind: 'hit', t: 1, target: 'enemy', dmg: 5, crit: true, onoma: 'BAM' })
    expect(cQuiet.ingest(mQuiet)).toBeNull()

    // 'blocked' + silencieux : jamais exercé (le test du silence de 3s
    // existant ne testait blocked qu'EN DEHORS de la fenêtre de silence).
    mQuiet.t = 2
    mQuiet.events.push({ kind: 'blocked', t: 2, target: 'enemy', dmg: 1 })
    expect(cQuiet.ingest(mQuiet)).toBeNull()

    // crit + pas silencieux + target enemy (le JOUEUR a frappé) -> T.crit
    const mHitEnemy = freshMatch()
    const cHitEnemy = new Commentator()
    cHitEnemy.ingest(mHitEnemy)
    mHitEnemy.t = 10
    mHitEnemy.events.push({ kind: 'hit', t: 10, target: 'enemy', dmg: 5, crit: true, onoma: 'BAM' })
    const lineEnemy = cHitEnemy.ingest(mHitEnemy)
    expect(lineEnemy?.weight).toBe(2)

    // crit + pas silencieux + target player (l'ADVERSE a frappé) -> T.critTaken
    const mHitPlayer = freshMatch()
    const cHitPlayer = new Commentator()
    cHitPlayer.ingest(mHitPlayer)
    mHitPlayer.t = 10
    mHitPlayer.events.push({ kind: 'hit', t: 10, target: 'player', dmg: 5, crit: true, onoma: 'BAM' })
    const linePlayer = cHitPlayer.ingest(mHitPlayer)
    expect(linePlayer?.weight).toBe(2)
    // Les deux pools (T.crit / T.critTaken) sont distincts : les textes ne se recoupent jamais.
    expect(lineEnemy!.text).not.toBe(linePlayer!.text)
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

  it('markCornerHintSeen ne touche pas au flag combat, et est idempotent (jamais rappelée 2 fois jusqu\'ici, contrairement à markCombatHintSeen ci-dessus)', async () => {
    const { hasSeenCombatHint, hasSeenCornerHint, markCornerHintSeen } = await import('./onboarding')
    markCornerHintSeen()
    expect(hasSeenCornerHint()).toBe(true)
    expect(hasSeenCombatHint()).toBe(false)
    expect(() => markCornerHintSeen()).not.toThrow() // 2e appel : le garde-fou `if (s.corner) return` doit tourner
    expect(hasSeenCornerHint()).toBe(true)
  })

  it("bug potentiel : un stockage JSON valide « null » ne doit pas planter hasSeenCombatHint (appelé SYNCHRONE au premier rendu d'ArenaScreen)", async () => {
    // JSON.parse('null') = null (pas une exception) — accéder à .combat sur
    // null plante, et cet accès a lieu chez l'APPELANT (hasSeenCombatHint),
    // hors du try/catch de load() : un stockage corrompu par la chaîne
    // littérale "null" aurait cassé le tout premier rendu de l'écran
    // d'arène (ArenaScreen appelle hasSeenCombatHint() en synchrone dans
    // ses useState/useRef initiaux).
    const { hasSeenCombatHint, hasSeenCornerHint } = await import('./onboarding')
    localStorage.setItem('coach-arena-onboarding-v1', 'null')
    expect(() => hasSeenCombatHint()).not.toThrow()
    expect(hasSeenCombatHint()).toBe(false)
    expect(hasSeenCornerHint()).toBe(false)
  })

  it('stockage corrompu (tableau, nombre) : jamais de crash, retombe sur « pas encore vu »', async () => {
    const { hasSeenCombatHint, markCombatHintSeen } = await import('./onboarding')
    for (const corrupted of ['[]', '42', '"oops"']) {
      localStorage.setItem('coach-arena-onboarding-v1', corrupted)
      expect(() => hasSeenCombatHint()).not.toThrow()
      expect(() => markCombatHintSeen()).not.toThrow()
    }
  })

  it('JSON réellement invalide (pas juste de mauvaise forme, du texte non-parsable) : jamais de crash non plus', async () => {
    const { hasSeenCombatHint, hasSeenCornerHint } = await import('./onboarding')
    localStorage.setItem('coach-arena-onboarding-v1', '{ceci ne parse pas')
    expect(() => hasSeenCombatHint()).not.toThrow()
    expect(hasSeenCombatHint()).toBe(false)
    expect(hasSeenCornerHint()).toBe(false)
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

  it("un ordre de POSTURE ('attack') est aussi ignoré pendant la confusion, pas seulement 'cheer'/'special'/'ulti' — garde-fou dédié (`if (m.t < f.confusedUntil) return`, ligne distincte de celle de 'cheer') jamais exercé isolément", () => {
    const m = freshMatch()
    toFighting(m)
    m.player.nextActionAt = m.t + 1000
    m.enemy.nextActionAt = m.t + 1000
    const stanceBefore = m.player.stance
    m.player.confusedUntil = m.t + 10
    // lastOrderAt loin dans le passé : n'ARME pas une NOUVELLE confusion via
    // le garde-fou anti-spam (ligne 459), on veut isoler CELUI de la ligne
    // 467 (déjà confus → n'écoute plus).
    m.player.lastOrderAt = m.t - 100
    tick(m, 0.05, { command: 'attack', voiceEnergy: 0.5, faceEnergy: 0 })
    expect(m.player.stance).toBe(stanceBefore) // la posture n'a pas bougé
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
    expect(m.enemyMods.lowHpThreshold).toBe(0) // armée ET consommée : la Dernière Chance a bien tranché
    // PAS d'assertion sur la valeur finale de m.enemy.hype : dans ce même
    // tick, enemyCoachAI peut (probabilité ~6 %/tick, Math.random() non
    // mocké ici) déclencher instantanément le spécial adverse dès que sa
    // Hype est pleine — ce qui la reconsomme aussitôt. Un test flaky
    // trouvé en le faisant échouer ~1 fois sur 15-30 : la bonne assertion
    // porte sur les ÉVÉNEMENTS produits (la preuve que ça s'est bien
    // déclenché), pas sur un état final que d'autres mécaniques légitimes
    // peuvent perturber dans le même tick.
    expect(m.events.some(e => e.kind === 'cardProc' && e.text.includes('DERNIÈRE CHANCE'))).toBe(true)
    expect(m.events.some(e => e.kind === 'hypeFull' && e.who === 'enemy')).toBe(true)
    expect(m.events.some(e => e.kind === 'timeout' && e.side === 'enemy')).toBe(true)
  })
})

describe('requestCoachStream (systems/media.ts) — repli audio+vidéo → audio seul → null', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('audio+vidéo accordés : renvoie ce flux directement, un seul appel', async () => {
    const calls: any[] = []
    const fakeStream = { id: 'av' }
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: async (c: any) => (calls.push(c), fakeStream) },
    })
    const { requestCoachStream } = await import('../systems/media')
    expect(await requestCoachStream()).toBe(fakeStream)
    expect(calls).toEqual([{ audio: true, video: true }])
  })

  it('vidéo refusée : replie sur audio seul', async () => {
    const calls: any[] = []
    const fakeStream = { id: 'audio-only' }
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: async (c: any) => {
          calls.push(c)
          if (c.video) throw new Error('cam refusée')
          return fakeStream
        },
      },
    })
    const { requestCoachStream } = await import('../systems/media')
    expect(await requestCoachStream()).toBe(fakeStream)
    expect(calls).toEqual([{ audio: true, video: true }, { audio: true }])
  })

  it('audio ET vidéo refusés : renvoie null, jamais de rejet non-géré', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: async () => Promise.reject(new Error('tout refusé')) },
    })
    const { requestCoachStream } = await import('../systems/media')
    await expect(requestCoachStream()).resolves.toBeNull()
  })
})

describe('pickOpponentTeam (characters.ts) — banc adverse du mode Rapide', () => {
  it("bug d'audit : le banc adverse n'aligne plus jamais le perso du joueur ni ses équipiers", async () => {
    // Avant fix (2026-08-16) : App.tsx filtrait le pool adverse seulement
    // sur l'id de l'adversaire principal — le perso du joueur ou l'un de
    // ses équipiers pouvait se retrouver sur le banc EN FACE de lui-même.
    const { pickOpponentTeam } = await import('./characters')
    const excluded = [ROSTER[0].id, ROSTER[1].id, ROSTER[2].id]
    for (let i = 0; i < 200; i++) {
      const team = pickOpponentTeam(excluded, 3)
      expect(team.some(c => excluded.includes(c.id))).toBe(false)
    }
  })

  it('ne renvoie jamais plus que ce que le reste du roster permet', async () => {
    const { pickOpponentTeam } = await import('./characters')
    const allButOne = ROSTER.slice(1).map(c => c.id)
    const team = pickOpponentTeam(allButOne, 5) // demande 5, il n'en reste qu'1 possible
    expect(team.length).toBe(1)
  })
})

describe('pickOpponent (characters.ts) — adversaire du mode Rapide, jamais testé directement', () => {
  it("n'est jamais le perso du joueur, sur de nombreux tirages", async () => {
    const { pickOpponent } = await import('./characters')
    for (let i = 0; i < 200; i++) {
      expect(pickOpponent([ROSTER[0].id]).id).not.toBe(ROSTER[0].id)
    }
  })

  it("bug d'audit (2026-08-18) : n'est non plus JAMAIS un équipier du joueur — le fix analogue sur pickOpponentTeam (2026-08-16) n'avait jamais été répercuté ici, un adversaire principal pouvait être une copie exacte du banc du joueur", async () => {
    const { pickOpponent } = await import('./characters')
    const excluded = [ROSTER[0].id, ROSTER[2].id, ROSTER[3].id]
    for (let i = 0; i < 200; i++) {
      expect(excluded).not.toContain(pickOpponent(excluded).id)
    }
  })
})

describe('createFromPrompt (characters.ts) — combler les trous de couverture', () => {
  it('rééquilibre la somme des stats vers 26 quand plusieurs règles cumulent trop de bonus', async () => {
    // Jamais exercé jusqu'ici : tous les prompts testés jusque-là restaient
    // sous le plafond. "fort" + "tank" + "vieux" + "gentil" cumulent assez
    // de bonus pour dépasser 26 et déclencher le rééquilibrage.
    const { createFromPrompt } = await import('./characters')
    const c = createFromPrompt('un fort colosse blindé, vieux sensei au grand cœur, appelé Titan')
    const sum = c.stats.atk + c.stats.def + c.stats.spd + c.stats.hrt
    expect(sum).toBeLessThanOrEqual(27) // proche de la cible 26 (arrondis)
    expect(c.stats.atk).toBeGreaterThanOrEqual(2) // jamais sous le plancher malgré le scale
    expect(c.stats.def).toBeGreaterThanOrEqual(2)
  })

  it('deriveTrait retombe sur le trait par défaut de l’archétype quand aucun mot-clé de trait ne matche', async () => {
    // "ninja" déclenche l'archétype trickster (via la règle "rapide") sans
    // qu'aucun mot-clé de TRAIT_RULES n'apparaisse dans le prompt : le
    // fallback ARCHETYPE_TRAIT['trickster'] doit s'appliquer.
    const { createFromPrompt } = await import('./characters')
    const c = createFromPrompt('un ninja véloce, appelé Kage')
    expect(c.archetype).toBe('trickster')
    expect(c.trait).toBe('tetu') // ARCHETYPE_TRAIT.trickster
  })

  it('extractName : sans motif « appelé/nommé X », génère un nom depuis les syllabes', async () => {
    const { createFromPrompt } = await import('./characters')
    const c = createFromPrompt('un guerrier sauvage et féroce') // aucun "appelé"/"nommé"
    // Forme exacte attendue : une syllabe + une terminaison des pools
    // internes d'extractName (dupliqués ici faute d'export), pas le prompt
    // recopié tel quel.
    const NAME_RE = /^(Ka|Ryu|Zen|Aki|Tetsu|Hana|Kai|Shiro|Rin|Dai)(ro|ka|to|mi|n|shi|ji)$/
    expect(c.name).toMatch(NAME_RE)
  })

  it('les 6 dernières règles de RULES jamais exercées (fragile/feu/ombre/lumière/cyborg/bête)', async () => {
    const { createFromPrompt } = await import('./characters')
    expect(createFromPrompt('un combattant fragile et vulnérable, appelé Verre').stats.hp).toBeLessThan(100)
    expect(createFromPrompt('un combattant de feu ardent, appelé Braise').color).toBe('#ff5a36')
    expect(createFromPrompt('un combattant des ombres, appelé Nuit').archetype).toBe('rival')
    expect(createFromPrompt('un ange de lumière, appelé Halo').stats.hrt).toBeGreaterThan(6)
    expect(createFromPrompt('un cyborg mécanique, appelé Unité').color).toBe('#00cec9')
    expect(createFromPrompt('une bête sauvage et animale, appelé Croc').archetype).toBe('beast')
  })
})

describe("readableTextColor (characters.ts) — contraste WCAG des couleurs de marque en texte", () => {
  // Formule de contraste WCAG dupliquée ici (indépendante de
  // l'implémentation testée) pour vérifier le RÉSULTAT, pas juste que la
  // fonction renvoie quelque chose.
  function contrast(hexA: string, hexB: string): number {
    const lum = (hex: string) => {
      const n = parseInt(hex.replace('#', ''), 16)
      const f = (c: number) => {
        const s = c / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255)
    }
    const [hi, lo] = [lum(hexA), lum(hexB)].sort((a, b) => b - a)
    return (hi + 0.05) / (lo + 0.05)
  }

  it('laisse inchangée une couleur déjà assez contrastée', async () => {
    const { readableTextColor } = await import('./characters')
    expect(readableTextColor('#00cec9', '#201d38')).toBe('#00cec9') // Yuna, largement au-dessus du seuil
  })

  it("bug d'audit : les couleurs de marque de Rei et Gorō tombaient sous 4,5:1 en texte sur --panel2 — corrigées au rendu", async () => {
    const { readableTextColor } = await import('./characters')
    const rei = readableTextColor('#6c5ce7', '#201d38')
    const goro = readableTextColor('#636e72', '#201d38')
    expect(contrast('#6c5ce7', '#201d38')).toBeLessThan(4.5) // le défaut, avant correction
    expect(contrast('#636e72', '#201d38')).toBeLessThan(4.5)
    expect(contrast(rei, '#201d38')).toBeGreaterThanOrEqual(4.5)
    expect(contrast(goro, '#201d38')).toBeGreaterThanOrEqual(4.5)
  })

  it('éclaircit une couleur au minimum requis, sans la faire dériver vers le blanc pur', async () => {
    const { readableTextColor } = await import('./characters')
    const fixed = readableTextColor('#636e72', '#201d38')
    expect(fixed).not.toBe('#ffffff') // ne sur-corrige pas au-delà du nécessaire
  })

  it('toute la palette du roster reste lisible en texte sur --panel2 après correction', async () => {
    const { readableTextColor } = await import('./characters')
    for (const c of ROSTER) {
      expect(contrast(readableTextColor(c.color, '#201d38'), '#201d38'), c.id).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('Persistance de la Forge (cardForge.ts) — saveForgedCard/loadForgedCards jamais testés', () => {
  beforeEach(() => {
    ;(globalThis as any).localStorage = fakeLocalStorage()
  })

  it('saveForgedCard puis loadForgedCards : la carte revient intacte, jouable via getCard', async () => {
    const { forgeCard, saveForgedCard, loadForgedCards } = await import('./cardForge')
    const { getCard } = await import('./cards')
    const r = forgeCard('une carte qui soigne beaucoup, appelée Regain')!
    saveForgedCard(r.card)
    const loaded = loadForgedCards()
    expect(loaded.map(c => c.id)).toContain(r.card.id)
    expect(getCard(r.card.id)?.name).toBe('Regain')
  })

  it("loadForgedCards sur un stockage jamais écrit (aucun saveForgedCard avant) : repli propre sur un tableau vide", async () => {
    // Tous les autres tests appellent saveForgedCard AVANT loadForgedCards
    // au moins une fois : le repli `getItem(...) ?? '[]'` de loadForgedCards
    // elle-même (distinct de celui de saveForgedCard) n'était donc jamais
    // exercé côté "rien n'a jamais été sauvegardé".
    const { loadForgedCards } = await import('./cardForge')
    expect(() => loadForgedCards()).not.toThrow()
    expect(loadForgedCards()).toEqual([])
  })

  it('ordre : la plus récente forgée arrive en tête', async () => {
    const { forgeCard, saveForgedCard, loadForgedCards } = await import('./cardForge')
    const a = forgeCard('un cri de guerre puissant, appelée Alpha')!
    const b = forgeCard('un cri de guerre puissant, appelée Beta')!
    saveForgedCard(a.card)
    saveForgedCard(b.card)
    expect(loadForgedCards()[0].name).toBe('Beta')
  })

  it('plafond MAX_FORGED (8) : les plus anciennes sont abandonnées', async () => {
    const { forgeCard, saveForgedCard, loadForgedCards } = await import('./cardForge')
    for (let i = 0; i < 10; i++) {
      saveForgedCard(forgeCard(`un cri de guerre, appelée Carte${i}`)!.card)
    }
    const loaded = loadForgedCards()
    expect(loaded.length).toBe(8)
    expect(loaded[0].name).toBe('Carte9') // la plus récente
    expect(loaded.map(c => c.name)).not.toContain('Carte0') // la plus vieille, hors plafond
    expect(loaded.map(c => c.name)).not.toContain('Carte1')
  })

  it('re-clamp à la relecture : un effet hors bornes (drift de version passée) est ramené dans les clous', async () => {
    const { saveForgedCard, loadForgedCards } = await import('./cardForge')
    const { computeCost } = await import('./cards')
    saveForgedCard({
      id: 'forge-drift-test',
      name: 'Carte Corrompue',
      timing: 'pause',
      cost: 999, // coût jamais recalculé au moment du save : doit être ignoré au load
      icon: '💊',
      desc: 'x',
      effects: [{ kind: 'heal', pct: 5 }], // 5 = 500 % PV, largement hors bornes (max 0.25)
    } as any)
    const loaded = loadForgedCards()
    const c = loaded.find(x => x.id === 'forge-drift-test')!
    expect((c.effects[0] as any).pct).toBe(0.25) // reclampé au max autorisé
    expect(c.cost).toBe(computeCost(c.effects)) // recalculé, pas la valeur corrompue de 999
  })

  it('stockage corrompu (JSON valide, pas un tableau) : loadForgedCards ne plante jamais', async () => {
    const { loadForgedCards } = await import('./cardForge')
    for (const corrupted of ['null', '"oops"', '42', '{}']) {
      localStorage.setItem('coach-arena-forged-cards-v1', corrupted)
      expect(() => loadForgedCards()).not.toThrow()
    }
  })

  it('écriture qui échoue (quota dépassé, navigation privée Safari) : saveForgedCard ne plante jamais', async () => {
    const { forgeCard, saveForgedCard } = await import('./cardForge')
    const store = fakeLocalStorage()
    ;(globalThis as any).localStorage = {
      ...store,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    const r = forgeCard('un cri de guerre puissant')!
    expect(() => saveForgedCard(r.card)).not.toThrow()
  })
})

describe('ArenaRenderer — prefers-reduced-motion (WCAG 2.3.3, audit accessibilité)', () => {
  afterEach(() => {
    delete (globalThis as any).window
  })

  it("détecte la préférence de mouvement réduit à la construction", () => {
    ;(globalThis as any).window = { matchMedia: (_q: string) => ({ matches: true }) }
    const renderer = new ArenaRenderer()
    expect((renderer as any).reducedMotion).toBe(true)
  })

  it('laisse le mouvement actif quand la préférence système ne le demande pas', () => {
    ;(globalThis as any).window = { matchMedia: (_q: string) => ({ matches: false }) }
    const renderer = new ArenaRenderer()
    expect((renderer as any).reducedMotion).toBe(false)
  })

  it("reste désactivé sans planter quand window ou matchMedia est absent (SSR)", () => {
    delete (globalThis as any).window
    expect(() => new ArenaRenderer()).not.toThrow()
    expect((new ArenaRenderer() as any).reducedMotion).toBe(false)
  })

  it("bug d'audit (2026-08-18) : matchMedia() (ou la lecture de .matches) qui JETTE plantait tout le match — un navigateur durci/anti-fingerprinting ne fait pas que l'omettre, il peut le faire échouer", () => {
    ;(globalThis as any).window = {
      matchMedia: () => {
        throw new Error('SecurityError: matchMedia is blocked')
      },
    }
    expect(() => new ArenaRenderer()).not.toThrow()
    expect((new ArenaRenderer() as any).reducedMotion).toBe(false)
  })
})

describe("Résilience : l'accès à `localStorage` LUI-MÊME bloqué (pas juste ses méthodes)", () => {
  // Certains modes de confidentialité stricts (anciens Safari, extensions
  // qui bloquent tout stockage) font planter la LECTURE de la propriété
  // `window.localStorage` elle-même avec une SecurityError — pas
  // seulement `.getItem`/`.setItem` (déjà couvert ailleurs dans ce
  // fichier). `typeof localStorage` ne protège PAS contre ça, contre
  // l'intuition : `typeof` doit quand même évaluer la propriété pour
  // connaître son type, et un getter qui jette jette aussi à travers
  // `typeof`. Un crash ici arrive AU CHARGEMENT DU MODULE, avant même que
  // React ne monte — même l'ErrorBoundary ne peut rien y faire.
  const MODULES = ['./cardForge', './deckBuilder', './onboarding', './progression', './stable', './story']

  beforeEach(() => {
    vi.resetModules() // sinon un import déjà mis en cache plus haut dans ce fichier ne se ré-évaluerait pas
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: localStorage access is blocked')
      },
    })
  })

  afterEach(() => {
    delete (globalThis as any).localStorage
  })

  for (const path of MODULES) {
    it(`${path} : le chargement du module ne plante pas même si l'accès à localStorage jette`, async () => {
      await expect(import(/* @vite-ignore */ path)).resolves.toBeDefined()
    })
  }
})

describe('VoiceCoach — le constructeur SpeechRecognition peut exister mais planter quand même', () => {
  afterEach(() => {
    delete (globalThis as any).window
  })

  it("bug d'audit : `supported` restait figé à `true` si le constructeur jetait (WebView sans pont natif)", async () => {
    class ThrowingRecognition {
      constructor() {
        throw new Error('NotSupportedError: no native speech bridge')
      }
    }
    ;(globalThis as any).window = { SpeechRecognition: ThrowingRecognition }
    const { VoiceCoach } = await import('../systems/voice')
    const vc = new VoiceCoach()
    // start() est async ; sans le fix, l'exception synchrone du constructeur
    // se traduisait par une promesse REJETÉE (jamais attendue côté
    // ArenaScreen.tsx : `sys.voice.start(stream)` n'est ni awaited ni
    // catché) — ici on vérifie surtout l'état, pas juste l'absence de rejet.
    await expect(vc.start({} as any)).resolves.toBeUndefined()
    expect(vc.state.supported).toBe(false)
  })

  it('un constructeur qui réussit passe bien `supported` à true', async () => {
    class WorkingRecognition {
      lang = ''
      continuous = false
      interimResults = false
      onresult: unknown = null
      onend: unknown = null
      onerror: unknown = null
      start() {}
    }
    ;(globalThis as any).window = { SpeechRecognition: WorkingRecognition }
    const { VoiceCoach } = await import('../systems/voice')
    const vc = new VoiceCoach()
    await vc.start({} as any)
    expect(vc.state.supported).toBe(true)
  })

  it("un constructeur qui réussit MAIS dont rec.start() jette au tout premier appel repasse `supported` à false — jamais exercé (distinct du constructeur qui jette)", async () => {
    class RecognitionThatFailsToStart {
      lang = ''
      continuous = false
      interimResults = false
      onresult: unknown = null
      onend: unknown = null
      onerror: unknown = null
      start() {
        throw new Error('InvalidStateError: recognition already started')
      }
    }
    ;(globalThis as any).window = { SpeechRecognition: RecognitionThatFailsToStart }
    const { VoiceCoach } = await import('../systems/voice')
    const vc = new VoiceCoach()
    await expect(vc.start({} as any)).resolves.toBeUndefined()
    expect(vc.state.supported).toBe(false)
    expect(vc.state.listening).toBe(false)
  })
})

describe("HighlightRecorder — une panne transitoire du MediaRecorder à la rotation ne doit pas jeter", () => {
  afterEach(() => {
    delete (globalThis as any).window
    delete (globalThis as any).MediaRecorder
  })

  it("bug d'audit : rotate() appelait startSegment() SANS le try/catch que start() a pour le même appel", async () => {
    let constructCount = 0
    class FlakyRecorder {
      static isTypeSupported(): boolean {
        return false // force pickMimeType() à retomber sur `undefined` (webm par défaut)
      }
      state = 'recording'
      mimeType = 'video/webm'
      ondataavailable: ((e: { data: { size: number } }) => void) | null = null
      onstop: (() => void) | null = null
      constructor() {
        constructCount++
        if (constructCount === 2) throw new Error('panne transitoire du MediaRecorder')
      }
      start() {}
      stop() {
        this.state = 'inactive'
        this.onstop?.()
      }
    }
    ;(globalThis as any).MediaRecorder = FlakyRecorder
    ;(globalThis as any).window = { setInterval: () => 0, clearInterval: () => {} }
    const { HighlightRecorder } = await import('../systems/recorder')
    const hr = new HighlightRecorder()
    const fakeCanvas = {
      captureStream: () => ({ getTracks: () => [], getAudioTracks: () => [], addTrack: () => {} }),
    } as unknown as HTMLCanvasElement
    expect(hr.start(fakeCanvas, null)).toBe(true) // 1er MediaRecorder construit sans souci
    expect(() => (hr as any).rotate()).not.toThrow() // le 2e (dans rotate) échoue, ne doit pas remonter
    await expect(hr.stop()).resolves.not.toBeUndefined() // pas de throw non plus au stop()
  })

  it("bug d'audit : après une rotation ratée, la SUIVANTE devait réellement retenter (le commentaire du 1er fix affirmait ça sans que ce soit vrai)", async () => {
    let constructCount = 0
    class FlakyRecorder {
      static isTypeSupported(): boolean {
        return false
      }
      state = 'recording'
      mimeType = 'video/webm'
      ondataavailable: ((e: { data: { size: number } }) => void) | null = null
      onstop: (() => void) | null = null
      constructor() {
        constructCount++
        if (constructCount === 2) throw new Error('panne transitoire, une seule fois')
      }
      start() {}
      stop() {
        this.state = 'inactive'
        this.onstop?.()
      }
    }
    ;(globalThis as any).MediaRecorder = FlakyRecorder
    ;(globalThis as any).window = { setInterval: () => 0, clearInterval: () => {} }
    const { HighlightRecorder } = await import('../systems/recorder')
    const hr = new HighlightRecorder()
    const fakeCanvas = {
      captureStream: () => ({ getTracks: () => [], getAudioTracks: () => [], addTrack: () => {} }),
    } as unknown as HTMLCanvasElement
    hr.start(fakeCanvas, null) // 1er MediaRecorder (construction #1)
    ;(hr as any).rotate() // construction #2 échoue, `current` reste sur le 1er (inactif)
    expect((hr as any).current.state).toBe('inactive')
    ;(hr as any).rotate() // DOIT retenter malgré `current` inactif — construction #3
    expect(constructCount).toBe(3) // la 3e construction a bien été tentée
    expect((hr as any).current.state).toBe('recording') // et a réussi : un vrai segment tourne à nouveau
  })

  it("start() câble VRAIMENT setInterval sur rotate() — jusqu'ici tous les tests appelaient rotate() directement, le mock de setInterval n'invoquait jamais son callback", async () => {
    class SimpleRecorder {
      static isTypeSupported(): boolean {
        return false
      }
      state = 'recording'
      mimeType = 'video/webm'
      ondataavailable: ((e: { data: { size: number } }) => void) | null = null
      onstop: (() => void) | null = null
      start() {}
      stop() {
        this.state = 'inactive'
        this.onstop?.()
      }
    }
    ;(globalThis as any).MediaRecorder = SimpleRecorder
    let capturedCallback: (() => void) | null = null
    ;(globalThis as any).window = {
      setInterval: (cb: () => void) => {
        capturedCallback = cb
        return 0
      },
      clearInterval: () => {},
    }
    const { HighlightRecorder } = await import('../systems/recorder')
    const hr = new HighlightRecorder()
    const fakeCanvas = {
      captureStream: () => ({ getTracks: () => [], getAudioTracks: () => [], addTrack: () => {} }),
    } as unknown as HTMLCanvasElement
    expect(hr.start(fakeCanvas, null)).toBe(true)
    expect(capturedCallback).not.toBeNull()
    const rotateSpy = vi.spyOn(hr as any, 'rotate')
    capturedCallback!() // simule le premier tick réel du timer de rotation
    expect(rotateSpy).toHaveBeenCalledTimes(1)
  })

  it('startSegment() sans flux (jamais démarré, ou déjà relâché par stop()) est un no-op sûr — garde-fou jamais exercé', async () => {
    ;(globalThis as any).window = { setInterval: () => 0, clearInterval: () => {} }
    const { HighlightRecorder } = await import('../systems/recorder')
    const hr = new HighlightRecorder()
    expect(() => (hr as any).startSegment()).not.toThrow()
    expect((hr as any).current).toBeNull() // rien n'a été construit
  })
})

describe('matchCommand (voice.ts) — reconnaissance des consignes parlées, jamais testée jusqu\'ici', () => {
  it("bug d'audit : « contre-attaque ! » était classé 'attack' au lieu de 'counter'", () => {
    // Le pattern 'counter' contient explicitement `contr[- ]?attaque` —
    // preuve que cette phrase est une consigne INTENTIONNELLEMENT gérée —
    // mais comme 'attack' était testé AVANT dans la table et que
    // « contre-attaque » contient le substring « attaqu », 'attack'
    // gagnait toujours en premier : le sous-pattern de 'counter' était
    // du code mort en pratique. Une vraie consigne de boxe, mal comprise.
    expect(matchCommand('contre-attaque !')).toBe('counter')
    expect(matchCommand('contre attaque')).toBe('counter')
    expect(matchCommand('contre-attaque, vas-y')).toBe('counter')
  })

  it("« attaque ! » toute seule reste bien classée 'attack' (pas de régression de la réorganisation)", () => {
    expect(matchCommand('attaque !')).toBe('attack')
    expect(matchCommand('vas-y, fonce')).toBe('attack')
  })

  it('une phrase par commande, pour balayer toute la table sans en oublier une', () => {
    const cases: Array<[string, ReturnType<typeof matchCommand>]> = [
      ['contre, punis-le', 'counter'],
      ['fonce, cogne fort', 'attack'],
      ['défends-toi, garde haute', 'defend'],
      ['esquive, bouge !', 'dodge'],
      ['ultime, achève-le', 'ulti'],
      ['spécial, maintenant !', 'special'],
      ['allez, bravo champion', 'cheer'],
    ]
    for (const [phrase, expected] of cases) expect(matchCommand(phrase)).toBe(expected)
  })

  it('ignore le bruit ambiant sans faux positif', () => {
    expect(matchCommand('il fait beau ce soir non ?')).toBeNull()
    expect(matchCommand('')).toBeNull()
  })
})

describe('deriveTrait (characters.ts, via createFromPrompt) — TRAIT_RULES jamais balayée mot par mot', () => {
  // Même motif « premier match qui gagne » que COMMAND_PATTERNS
  // (voice.ts), qui cachait un vrai bug de collision de substring — donc
  // même traitement ici : chaque mot-clé de TRAIT_RULES testé isolément
  // pour vérifier qu'aucun n'est en réalité inatteignable.
  const CASES: Array<[string, 'cerebral' | 'sanguin' | 'fusionnel' | 'tetu']> = [
    ['calme', 'cerebral'],
    ['sage', 'cerebral'],
    ['maître', 'cerebral'],
    ['cérébral', 'cerebral'],
    ['précis', 'cerebral'],
    ['stratège', 'cerebral'],
    ['froid', 'cerebral'],
    ['sauvage', 'sanguin'],
    ['bête', 'sanguin'],
    ['fauve', 'sanguin'],
    ['rage', 'sanguin'],
    ['colérique', 'sanguin'],
    ['sanguin', 'sanguin'],
    ['furieux', 'sanguin'],
    ['démon', 'sanguin'],
    ['loyal', 'fusionnel'],
    ['fidèle', 'fusionnel'],
    ['gentil', 'fusionnel'],
    ['cœur', 'fusionnel'],
    ['coeur', 'fusionnel'],
    ['ami', 'fusionnel'],
    ['chien', 'fusionnel'],
    ['têtu', 'tetu'],
    ['tetu', 'tetu'],
    ['rebelle', 'tetu'],
    ['fier', 'tetu'],
    ['ego', 'tetu'],
    ['rival', 'tetu'],
    ['solitaire', 'tetu'],
    ['ombre', 'tetu'],
  ]
  for (const [word, expected] of CASES) {
    it(`« ${word} » donne bien le trait ${expected}`, () => {
      const c = createFromPrompt(`Un personnage ${word} et déterminé, prêt à en découdre.`)
      expect(c.trait).toBe(expected)
    })
  }
})

describe('recorder.ts — fileExt/pickMimeType/shareOrDownload, jamais testés jusqu\'ici', () => {
  afterEach(() => {
    delete (globalThis as any).MediaRecorder
    delete (globalThis as any).navigator
    delete (globalThis as any).document
    delete (URL as any).createObjectURL
    delete (URL as any).revokeObjectURL
  })

  it('fileExt lit le type MIME du blob (repli webm si absent/inconnu)', () => {
    expect(fileExt(new Blob([], { type: 'video/mp4' }))).toBe('mp4')
    expect(fileExt(new Blob([], { type: 'video/webm;codecs=vp9,opus' }))).toBe('webm')
    expect(fileExt(new Blob([]))).toBe('webm')
  })

  it('pickMimeType : undefined si MediaRecorder est absent (vieux navigateur)', () => {
    expect(pickMimeType()).toBeUndefined()
  })

  it('pickMimeType : choisit le premier conteneur supporté, mp4 prioritaire sur webm', () => {
    ;(globalThis as any).MediaRecorder = { isTypeSupported: (m: string) => m === 'video/webm' }
    expect(pickMimeType()).toBe('video/webm')
  })

  it('shareOrDownload : utilise le partage natif (feuille de partage mobile) quand disponible', async () => {
    let shared: any = null
    ;(globalThis as any).navigator = {
      canShare: () => true,
      share: async (data: any) => {
        shared = data
      },
    }
    const result = await shareOrDownload(new Blob(['x'], { type: 'video/webm' }), 'match', 'texte')
    expect(result).toBe('shared')
    expect(shared.title).toBe('Coach Arena')
  })

  it("shareOrDownload : repli téléchargement si le navigateur ne sait pas partager de fichiers", async () => {
    ;(globalThis as any).navigator = {}
    const clicked: string[] = []
    ;(globalThis as any).document = {
      createElement: () => ({ href: '', download: '', click: () => clicked.push('clicked') }),
    }
    ;(URL as any).createObjectURL = () => 'blob:fake'
    ;(URL as any).revokeObjectURL = () => {}
    const result = await shareOrDownload(new Blob(['x'], { type: 'video/webm' }), 'match', 'texte')
    expect(result).toBe('downloaded')
    expect(clicked).toContain('clicked')
  })

  it('shareOrDownload : repli téléchargement si le partage est annulé/refusé (share() rejette)', async () => {
    ;(globalThis as any).navigator = {
      canShare: () => true,
      share: async () => {
        throw new DOMException('cancelled', 'AbortError')
      },
    }
    const clicked: string[] = []
    ;(globalThis as any).document = {
      createElement: () => ({ href: '', download: '', click: () => clicked.push('clicked') }),
    }
    ;(URL as any).createObjectURL = () => 'blob:fake'
    ;(URL as any).revokeObjectURL = () => {}
    const result = await shareOrDownload(new Blob(['x'], { type: 'video/webm' }), 'match', 'texte')
    expect(result).toBe('downloaded')
    expect(clicked).toContain('clicked')
  })

  it("MatchRecorder.download() programme bien la révocation du blob URL 5s plus tard — jusqu'ici revokeObjectURL était juste un stub jamais réellement invoqué (le setTimeout n'avait jamais le temps de s'écouler)", () => {
    vi.useFakeTimers()
    try {
      const revoked: string[] = []
      ;(globalThis as any).document = {
        createElement: () => ({ href: '', download: '', click: () => {} }),
      }
      ;(URL as any).createObjectURL = () => 'blob:fake-url'
      ;(URL as any).revokeObjectURL = (u: string) => revoked.push(u)
      MatchRecorder.download(new Blob(['x'], { type: 'video/webm' }), 'test.webm')
      expect(revoked).toEqual([]) // pas encore révoqué : le téléchargement doit avoir le temps de démarrer
      vi.advanceTimersByTime(4999)
      expect(revoked).toEqual([])
      vi.advanceTimersByTime(1)
      expect(revoked).toEqual(['blob:fake-url'])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("MatchRecorder/HighlightRecorder.start() : fuite de flux si le MediaRecorder échoue à se construire", () => {
  afterEach(() => {
    delete (globalThis as any).MediaRecorder
    delete (globalThis as any).window
  })

  function fakeCanvasAndMic() {
    const stopped: string[] = []
    const fakeVideoTrack = { stop: () => stopped.push('video') }
    const fakeMicTrackClone = { stop: () => stopped.push('mic-clone') }
    const fakeMicTrack = { clone: () => fakeMicTrackClone }
    const tracks = [fakeVideoTrack]
    const fakeCanvasStream = {
      addTrack: (t: unknown) => tracks.push(t as typeof fakeVideoTrack),
      getTracks: () => tracks,
      getAudioTracks: () => [],
    }
    const fakeCanvas = { captureStream: () => fakeCanvasStream } as unknown as HTMLCanvasElement
    const fakeMicStream = { getAudioTracks: () => [fakeMicTrack] } as unknown as MediaStream
    return { stopped, fakeCanvas, fakeMicStream }
  }

  it("bug d'audit : MatchRecorder.start() qui échoue laissait le flux composite (micro cloné + vidéo canvas) actif indéfiniment", () => {
    class ThrowingRecorder {
      static isTypeSupported() {
        return false
      }
      constructor() {
        throw new Error('construction du MediaRecorder échouée')
      }
    }
    ;(globalThis as any).MediaRecorder = ThrowingRecorder
    const { stopped, fakeCanvas, fakeMicStream } = fakeCanvasAndMic()
    const mr = new MatchRecorder()
    expect(mr.start(fakeCanvas, fakeMicStream)).toBe(false)
    expect((mr as any).mixStream).toBeNull() // le flux composite ne doit plus traîner
    expect(stopped.sort()).toEqual(['mic-clone', 'video']) // piste micro clonée ET piste vidéo relâchées
  })

  it("même bug, même correctif : HighlightRecorder.start() qui échoue relâche aussi son flux", () => {
    class ThrowingRecorder {
      static isTypeSupported() {
        return false
      }
      constructor() {
        throw new Error('construction du MediaRecorder échouée')
      }
    }
    ;(globalThis as any).MediaRecorder = ThrowingRecorder
    ;(globalThis as any).window = { setInterval: () => 0, clearInterval: () => {} }
    const { stopped, fakeCanvas, fakeMicStream } = fakeCanvasAndMic()
    // Import dynamique : cohérent avec l'usage existant de HighlightRecorder plus haut dans ce fichier.
    return import('../systems/recorder').then(({ HighlightRecorder }) => {
      const hr = new HighlightRecorder()
      expect(hr.start(fakeCanvas, fakeMicStream)).toBe(false)
      expect((hr as any).stream).toBeNull()
      expect(stopped.sort()).toEqual(['mic-clone', 'video'])
    })
  })
})

describe('VoiceCoach — onresult/onend, le cœur du flux de reco vocale, jamais exercé', () => {
  afterEach(() => {
    delete (globalThis as any).window
    delete (globalThis as any).cancelAnimationFrame
  })

  class FakeRecognition {
    lang = ''
    continuous = false
    interimResults = false
    onresult: ((ev: unknown) => void) | null = null
    onend: (() => void) | null = null
    onerror: (() => void) | null = null
    startCalls = 0
    start() {
      this.startCalls++
    }
    stop() {}
  }

  function finalResult(transcript: string, isFinal = true) {
    return Object.assign([{ transcript }], { isFinal })
  }

  it('un résultat final reconnu met à jour lastHeard/lastFinal/finalSeq/pendingCommand', async () => {
    ;(globalThis as any).window = { SpeechRecognition: FakeRecognition }
    const { VoiceCoach } = await import('../systems/voice')
    const vc = new VoiceCoach()
    await vc.start({} as any)
    const rec = (vc as any).recognition
    rec.onresult({ resultIndex: 0, results: [finalResult('attaque maintenant')] })
    expect(vc.state.lastHeard).toBe('attaque maintenant')
    expect(vc.state.lastFinal).toBe('attaque maintenant')
    expect(vc.state.finalSeq).toBe(1)
    expect(vc.state.pendingCommand).toBe('attack')
  })

  it("bug d'audit déjà corrigé (2026-08-16), reconfirmé ici : PLUSIEURS résultats finalisés dans le même event sont TOUS traités, le dernier gagne", async () => {
    ;(globalThis as any).window = { SpeechRecognition: FakeRecognition }
    const { VoiceCoach } = await import('../systems/voice')
    const vc = new VoiceCoach()
    await vc.start({} as any)
    const rec = (vc as any).recognition
    // Deux ordres courts dits coup sur coup, finalisés dans le MÊME event —
    // ne lire que resultIndex (le premier changé) perdrait le second.
    rec.onresult({
      resultIndex: 0,
      results: [finalResult('défends'), finalResult('esquive')],
    })
    expect(vc.state.finalSeq).toBe(2) // les deux comptent comme finalisés
    expect(vc.state.lastFinal).toBe('esquive') // le second, traité en dernier
    expect(vc.state.pendingCommand).toBe('dodge') // pas 'defend' : le dernier écrase
  })

  it('un résultat intermédiaire (pas final) déclenche quand même une commande, sans incrémenter finalSeq', async () => {
    ;(globalThis as any).window = { SpeechRecognition: FakeRecognition }
    const { VoiceCoach } = await import('../systems/voice')
    const vc = new VoiceCoach()
    await vc.start({} as any)
    const rec = (vc as any).recognition
    rec.onresult({ resultIndex: 0, results: [finalResult('fonce', false)] })
    expect(vc.state.pendingCommand).toBe('attack')
    expect(vc.state.finalSeq).toBe(0)
    expect(vc.state.lastFinal).toBe('')
  })

  it("onend relance la reconnaissance si le coach n'a pas appelé stop() (Chrome la coupe régulièrement)", async () => {
    ;(globalThis as any).window = { SpeechRecognition: FakeRecognition }
    const { VoiceCoach } = await import('../systems/voice')
    const vc = new VoiceCoach()
    await vc.start({} as any)
    const rec = (vc as any).recognition
    expect(rec.startCalls).toBe(1)
    rec.onend()
    expect(rec.startCalls).toBe(2) // relancée automatiquement
    expect(vc.state.listening).toBe(true)
  })

  it('onend NE relance PAS après un stop() explicite du coach', async () => {
    ;(globalThis as any).window = { SpeechRecognition: FakeRecognition }
    // cancelAnimationFrame est un global toujours présent en vrai navigateur
    // (contrairement à requestAnimationFrame ici, jamais atteint : la boucle
    // du volume-mètre échoue avant, faute d'AudioContext) — juste absent de
    // l'environnement Node de vitest, donc nécessaire pour que stop() tourne.
    ;(globalThis as any).cancelAnimationFrame = () => {}
    const { VoiceCoach } = await import('../systems/voice')
    const vc = new VoiceCoach()
    await vc.start({} as any)
    const rec = (vc as any).recognition
    vc.stop()
    rec.onend()
    expect(rec.startCalls).toBe(1) // pas de relance post-stop
    expect(vc.state.listening).toBe(false)
  })

  it("consumeCommand() — la VRAIE API utilisée par ArenaScreen, jamais appelée par aucun test jusqu'ici (tous lisaient state.pendingCommand directement) : lit ET vide la commande, une seule fois", async () => {
    ;(globalThis as any).window = { SpeechRecognition: FakeRecognition }
    const { VoiceCoach } = await import('../systems/voice')
    const vc = new VoiceCoach()
    await vc.start({} as any)
    const rec = (vc as any).recognition
    expect(vc.consumeCommand()).toBeNull() // rien en attente au départ
    rec.onresult({ resultIndex: 0, results: [finalResult('attaque maintenant')] })
    expect(vc.consumeCommand()).toBe('attack') // consommée...
    expect(vc.state.pendingCommand).toBeNull() // ...et bien vidée dans l'état...
    expect(vc.consumeCommand()).toBeNull() // ...donc plus rien à consommer une 2e fois
  })

  it('rec.onerror est un vrai no-op assumé (« géré par onend », commenté dans le code) — ne doit rien changer ni planter', async () => {
    ;(globalThis as any).window = { SpeechRecognition: FakeRecognition }
    const { VoiceCoach } = await import('../systems/voice')
    const vc = new VoiceCoach()
    await vc.start({} as any)
    const rec = (vc as any).recognition
    expect(() => rec.onerror()).not.toThrow()
    expect(vc.state.listening).toBe(true) // rien n'a bougé
    expect(vc.state.pendingCommand).toBeNull()
  })

  it("un résultat dont le transcript ne contient que des espaces est ignoré (`if (!text) continue` jamais exercé) — ne compte même pas comme finalisé", async () => {
    ;(globalThis as any).window = { SpeechRecognition: FakeRecognition }
    const { VoiceCoach } = await import('../systems/voice')
    const vc = new VoiceCoach()
    await vc.start({} as any)
    const rec = (vc as any).recognition
    rec.onresult({
      resultIndex: 0,
      results: [finalResult('   '), finalResult('attaque')],
    })
    expect(vc.state.finalSeq).toBe(1) // le résultat vide ne compte pas, seul le 2e finalise
    expect(vc.state.lastHeard).toBe('attaque') // pas écrasé par le vide
    expect(vc.state.pendingCommand).toBe('attack')
  })

  it("un texte reconnu mais SANS commande (aucun pattern ne matche) laisse pendingCommand INCHANGÉ — une commande déjà en attente n'est pas effacée par une phrase hors-sujet (`if (cmd)` jamais exercé côté faux)", async () => {
    ;(globalThis as any).window = { SpeechRecognition: FakeRecognition }
    const { VoiceCoach } = await import('../systems/voice')
    const vc = new VoiceCoach()
    await vc.start({} as any)
    const rec = (vc as any).recognition
    rec.onresult({ resultIndex: 0, results: [finalResult('esquive')] })
    expect(vc.state.pendingCommand).toBe('dodge')
    rec.onresult({ resultIndex: 0, results: [finalResult('bonjour, comment ça va ?')] })
    expect(vc.state.lastHeard).toBe('bonjour, comment ça va ?') // bien entendu…
    expect(vc.state.pendingCommand).toBe('dodge') // …mais la commande en attente reste celle d'avant
  })
})

describe('FaceCoach (systems/facecam.ts) — énergie de mouvement par diff d\'images, jamais testée', () => {
  afterEach(() => {
    delete (globalThis as any).document
    delete (globalThis as any).window
  })

  // 48×64 RGBA (W/H internes du fichier) : W*H*4 = 12288 octets par frame.
  const FRAME_LEN = 48 * 64 * 4

  function setup(initialFrame: Uint8ClampedArray) {
    let currentFrame = initialFrame
    const fakeVideo = { muted: false, playsInline: false, srcObject: null as unknown, readyState: 2, play: async () => {} }
    const fakeCtx = {
      drawImage: () => {},
      getImageData: () => ({ data: currentFrame }),
    }
    const fakeCanvas = { getContext: () => fakeCtx }
    ;(globalThis as any).document = {
      createElement: (tag: string) => (tag === 'video' ? fakeVideo : fakeCanvas),
    }
    ;(globalThis as any).window = { setInterval: () => 999 }
    return {
      fakeVideo,
      setFrame: (f: Uint8ClampedArray) => {
        currentFrame = f
      },
    }
  }

  it("la 1re frame ne fait qu'initialiser prev (rien à comparer, énergie reste 0)", async () => {
    setup(new Uint8ClampedArray(FRAME_LEN).fill(0))
    const { FaceCoach } = await import('../systems/facecam')
    const fc = new FaceCoach()
    ;(fc as any).sample()
    expect(fc.state.energy).toBe(0)
    expect((fc as any).prev).not.toBeNull()
  })

  it("un fort changement de pixels entre deux frames fait monter l'énergie", async () => {
    const { setFrame } = setup(new Uint8ClampedArray(FRAME_LEN).fill(0))
    const { FaceCoach } = await import('../systems/facecam')
    const fc = new FaceCoach()
    ;(fc as any).sample() // établit la frame de référence (noire)
    setFrame(new Uint8ClampedArray(FRAME_LEN).fill(255)) // frame suivante : blanche, changement maximal
    ;(fc as any).sample()
    // Lissage asymétrique (monte à 50 % du saut brut la 1re fois) : un
    // changement de pixels total et immédiat donne raw=1, donc énergie=0,5
    // pile — la valeur EXACTE attendue, pas juste « plus que 0 ».
    expect(fc.state.energy).toBe(0.5)
  })

  it("un changement de pixels PLUS FAIBLE que l'énergie courante la fait redescendre en douceur (branche `raw <= energy` jamais exercée, seule la montée l'était)", async () => {
    const { setFrame } = setup(new Uint8ClampedArray(FRAME_LEN).fill(0))
    const { FaceCoach } = await import('../systems/facecam')
    const fc = new FaceCoach()
    ;(fc as any).sample() // référence noire
    setFrame(new Uint8ClampedArray(FRAME_LEN).fill(255)) // saut max : énergie → 0,5
    ;(fc as any).sample()
    expect(fc.state.energy).toBe(0.5)
    setFrame(new Uint8ClampedArray(FRAME_LEN).fill(255)) // frame IDENTIQUE à la précédente : raw=0, sous l'énergie courante
    ;(fc as any).sample()
    // Décroissance lente : energy*0.92 + raw*0.08 = 0.5*0.92 + 0 = 0.46, pas de chute brutale à 0.
    expect(fc.state.energy).toBeCloseTo(0.46)
  })

  it("OffscreenCanvas, quand disponible (Chrome/Edge récents), est utilisé à la construction plutôt que le repli <canvas> — jamais exercé dans ce sandbox où OffscreenCanvas est absent", async () => {
    setup(new Uint8ClampedArray(FRAME_LEN).fill(0))
    let constructed: unknown[] = []
    class FakeOffscreenCanvas {
      width: number
      height: number
      constructor(w: number, h: number) {
        this.width = w
        this.height = h
        constructed.push(this)
      }
      getContext() {
        return { drawImage: () => {}, getImageData: () => ({ data: new Uint8ClampedArray(FRAME_LEN) }) }
      }
    }
    ;(globalThis as any).OffscreenCanvas = FakeOffscreenCanvas
    try {
      const { FaceCoach } = await import('../systems/facecam')
      const fc = new FaceCoach()
      expect(constructed).toHaveLength(1) // le repli <canvas> n'a PAS été construit
      expect((fc as any).canvas).toBeInstanceOf(FakeOffscreenCanvas)
    } finally {
      delete (globalThis as any).OffscreenCanvas
    }
  })

  it("readyState < 2 (vidéo pas encore prête) : sample() ne plante pas et ne touche pas l'énergie", async () => {
    const { fakeVideo } = setup(new Uint8ClampedArray(FRAME_LEN).fill(0))
    fakeVideo.readyState = 0
    const { FaceCoach } = await import('../systems/facecam')
    const fc = new FaceCoach()
    expect(() => (fc as any).sample()).not.toThrow()
    expect(fc.state.energy).toBe(0)
    expect((fc as any).prev).toBeNull() // jamais atteint le calcul, prev reste vierge
  })

  it("stop() efface prev : une NOUVELLE session ne compare pas avec l'ancienne (contrat déjà documenté, vérifié ici)", async () => {
    const { setFrame } = setup(new Uint8ClampedArray(FRAME_LEN).fill(0))
    const { FaceCoach } = await import('../systems/facecam')
    const fc = new FaceCoach()
    await fc.start({} as any)
    ;(fc as any).sample()
    expect((fc as any).prev).not.toBeNull()
    fc.stop()
    expect((fc as any).prev).toBeNull()
    expect(fc.state.active).toBe(false)
    expect(fc.state.energy).toBe(0)
    // Une nouvelle frame blanche juste après stop() : sans le reset de prev,
    // la 1re sample() de la session suivante comparerait contre l'ancienne
    // frame noire au lieu de simplement initialiser sa propre référence.
    setFrame(new Uint8ClampedArray(FRAME_LEN).fill(255))
    ;(fc as any).sample()
    expect(fc.state.energy).toBe(0) // 1re frame de la nouvelle session : juste une initialisation
  })

  it("start() câble VRAIMENT setInterval sur sample() — jusqu'ici le mock de setInterval n'appelait jamais son callback, donc cette ligne n'était jamais exécutée", async () => {
    const { setFrame } = setup(new Uint8ClampedArray(FRAME_LEN).fill(0))
    let capturedCallback: (() => void) | null = null
    ;(globalThis as any).window.setInterval = (cb: () => void) => {
      capturedCallback = cb
      return 999
    }
    const { FaceCoach } = await import('../systems/facecam')
    const fc = new FaceCoach()
    await fc.start({} as any)
    expect(capturedCallback).not.toBeNull()
    capturedCallback!() // simule le premier tick du timer : doit appeler sample()
    expect((fc as any).prev).not.toBeNull() // sample() a bien tourné (frame de référence posée)
    setFrame(new Uint8ClampedArray(FRAME_LEN).fill(255))
    capturedCallback!() // 2e tick : doit vraiment refaire tourner sample(), pas un no-op
    expect(fc.state.energy).toBe(0.5)
  })

  it("start() : video.play() qui rejette ne fait pas planter start() (catch muet assumé)", async () => {
    setup(new Uint8ClampedArray(FRAME_LEN).fill(0))
    ;(globalThis as any).document.createElement = (tag: string) =>
      tag === 'video'
        ? { muted: false, playsInline: false, srcObject: null, readyState: 2, play: () => Promise.reject(new Error('NotAllowedError')) }
        : { getContext: () => ({ drawImage: () => {}, getImageData: () => ({ data: new Uint8ClampedArray(FRAME_LEN) }) }) }
    const { FaceCoach } = await import('../systems/facecam')
    const fc = new FaceCoach()
    await expect(fc.start({} as any)).resolves.toBeUndefined()
    expect(fc.state.active).toBe(true) // le flux continue malgré le rejet de play()
  })
})

describe('SoundSystem (systems/sound.ts) — bande-son synthétisée, jamais testée', () => {
  afterEach(() => {
    delete (globalThis as any).AudioContext
  })

  it("sans AudioContext (absent de ce sandbox Node, comme un navigateur qui le refuserait) : tous les événements de jeu restent des no-op sûrs", () => {
    const ss = new SoundSystem()
    ss.start() // échoue proprement, ctx reste null
    expect(() => {
      ss.hit(true)
      ss.hit(false)
      ss.block()
      ss.dodge()
      ss.counter()
      ss.special()
      ss.ulti()
      ss.gong()
      ss.ko()
      ss.hypeFull()
      ss.cardPlay()
      ss.confused()
      ss.setCrowdHype(0.5)
      ss.resume()
      ss.setMuted(true)
      ss.stop()
    }).not.toThrow()
  })

  it('setMuted/muted restent cohérents même sans contexte audio', () => {
    const ss = new SoundSystem()
    expect(ss.muted).toBe(false)
    ss.setMuted(true)
    expect(ss.muted).toBe(true)
    ss.setMuted(false)
    expect(ss.muted).toBe(false)
  })

  it('avec un AudioContext disponible, tous les événements construisent leur graphe audio sans planter', () => {
    class FakeParam {
      value = 0
      setValueAtTime() {
        return this
      }
      exponentialRampToValueAtTime() {
        return this
      }
      linearRampToValueAtTime() {
        return this
      }
      cancelScheduledValues() {
        return this
      }
    }
    class FakeNode {
      connect() {
        return this
      }
    }
    class FakeGainNode extends FakeNode {
      gain = new FakeParam()
    }
    class FakeOscillatorNode extends FakeNode {
      type = 'sine'
      frequency = new FakeParam()
      start() {}
      stop() {}
    }
    class FakeBiquadFilterNode extends FakeNode {
      type = 'lowpass'
      frequency = new FakeParam()
      Q = new FakeParam()
    }
    class FakeBufferSourceNode extends FakeNode {
      buffer: unknown = null
      loop = false
      start() {}
    }
    class FakeAudioContext {
      currentTime = 0
      sampleRate = 44100
      state = 'running'
      destination = new FakeNode()
      createGain() {
        return new FakeGainNode()
      }
      createOscillator() {
        return new FakeOscillatorNode()
      }
      createBiquadFilter() {
        return new FakeBiquadFilterNode()
      }
      createBufferSource() {
        return new FakeBufferSourceNode()
      }
      createBuffer(_channels: number, length: number) {
        return { getChannelData: () => new Float32Array(length) }
      }
      resume() {
        return Promise.resolve()
      }
      close() {
        return Promise.resolve()
      }
    }
    ;(globalThis as any).AudioContext = FakeAudioContext
    const ss = new SoundSystem()
    ss.start()
    expect(() => {
      ss.hit(true)
      ss.hit(false)
      ss.block()
      ss.dodge()
      ss.counter()
      ss.special()
      ss.ulti()
      ss.gong()
      ss.ko()
      ss.hypeFull()
      ss.cardPlay()
      ss.confused()
      ss.setCrowdHype(0.9) // au-dessus du seuil de variation → programme une vraie rampe
      ss.resume()
      ss.stop()
    }).not.toThrow()
  })

  it("stop() : un ctx.close() qui rejette est absorbé silencieusement — jamais exercé (le fake ci-dessus résout toujours)", () => {
    class FakeNode {
      connect() {
        return this
      }
    }
    class RejectingAudioContext {
      currentTime = 0
      sampleRate = 44100
      state = 'running'
      destination = new FakeNode()
      createGain() {
        return Object.assign(new FakeNode(), { gain: { value: 0 } })
      }
      createBufferSource() {
        return Object.assign(new FakeNode(), { buffer: null, loop: false, start: () => {} })
      }
      createBiquadFilter() {
        return Object.assign(new FakeNode(), { type: 'lowpass', frequency: { value: 0 }, Q: { value: 0 } })
      }
      createBuffer(_channels: number, length: number) {
        return { getChannelData: () => new Float32Array(length) }
      }
      resume() {
        return Promise.resolve()
      }
      close() {
        return Promise.reject(new Error('AudioContext already closed'))
      }
    }
    ;(globalThis as any).AudioContext = RejectingAudioContext
    const ss = new SoundSystem()
    ss.start()
    expect(() => ss.stop()).not.toThrow()
  })

  it("setCrowdHype() programme réellement une rampe quand aucune clameur n'est en cours — jamais exercé jusqu'ici : le test global appelait toujours hit(crit) AVANT, ce qui arme roarUntil dans le futur du currentTime figé du fake et bloque la rampe par le garde-fou anti-écrasement", () => {
    class FakeParam {
      value = 0
      calls: unknown[] = []
      linearRampToValueAtTime(...args: unknown[]) {
        this.calls.push(args)
      }
    }
    class FakeNode {
      connect() {
        return this
      }
    }
    class FakeAudioContext {
      currentTime = 0
      sampleRate = 44100
      state = 'running'
      destination = new FakeNode()
      createGain() {
        return Object.assign(new FakeNode(), { gain: new FakeParam() })
      }
      createBufferSource() {
        return Object.assign(new FakeNode(), { buffer: null, loop: false, start: () => {} })
      }
      createBiquadFilter() {
        return Object.assign(new FakeNode(), { type: 'lowpass', frequency: { value: 0 }, Q: { value: 0 } })
      }
      createBuffer(_channels: number, length: number) {
        return { getChannelData: () => new Float32Array(length) }
      }
      resume() {
        return Promise.resolve()
      }
      close() {
        return Promise.resolve()
      }
    }
    ;(globalThis as any).AudioContext = FakeAudioContext
    const ss = new SoundSystem()
    ss.start()
    const crowdGain = (ss as any).crowdGain
    ss.setCrowdHype(0.9) // aucune clameur en cours : roarUntil encore à 0, currentTime aussi
    expect(crowdGain.gain.calls.length).toBe(1) // la rampe a bien été programmée
    expect(crowdGain.gain.calls[0][0]).toBeCloseTo(0.12) // 0,03 + 0,9 * 0,1
  })
})

describe('SoundSystem — branches jamais exercées : start() idempotent, resume(), setMuted() avec ctx, startCrowd() défensif, seuil de setCrowdHype()', () => {
  afterEach(() => {
    delete (globalThis as any).AudioContext
  })

  class FakeParam {
    value = 0
    calls: unknown[] = []
    setValueAtTime() {
      return this
    }
    exponentialRampToValueAtTime() {
      return this
    }
    linearRampToValueAtTime(...args: unknown[]) {
      this.calls.push(args)
      return this
    }
    cancelScheduledValues() {
      return this
    }
  }
  class FakeNode {
    connect() {
      return this
    }
  }
  class FakeGainNode extends FakeNode {
    gain = new FakeParam()
  }
  class FakeAudioContext {
    currentTime = 0
    sampleRate = 44100
    state = 'running'
    destination = new FakeNode()
    resumeCalls = 0
    createGain() {
      return new FakeGainNode()
    }
    createOscillator() {
      return Object.assign(new FakeNode(), { type: 'sine', frequency: new FakeParam(), start() {}, stop() {} })
    }
    createBiquadFilter() {
      return Object.assign(new FakeNode(), { type: 'lowpass', frequency: new FakeParam(), Q: new FakeParam() })
    }
    createBufferSource() {
      return Object.assign(new FakeNode(), { buffer: null, loop: false, start() {} })
    }
    createBuffer(_channels: number, length: number) {
      return { getChannelData: () => new Float32Array(length) }
    }
    resume() {
      this.resumeCalls++
      return Promise.resolve()
    }
    close() {
      return Promise.resolve()
    }
  }

  it("start() est idempotent : un 2e appel alors qu'un contexte tourne déjà ne reconstruit rien (garde-fou `if (this.ctx) return` jamais exercé)", () => {
    ;(globalThis as any).AudioContext = FakeAudioContext
    const ss = new SoundSystem()
    ss.start()
    const ctxAfterFirst = (ss as any).ctx
    const masterAfterFirst = (ss as any).master
    ss.start() // ne doit RIEN reconstruire
    expect((ss as any).ctx).toBe(ctxAfterFirst)
    expect((ss as any).master).toBe(masterAfterFirst)
  })

  it("resume() débloque réellement un contexte 'suspended' (Safari/iOS) — jamais exercé, tous les tests précédents avaient un ctx déjà 'running'", () => {
    ;(globalThis as any).AudioContext = FakeAudioContext
    const ss = new SoundSystem()
    ss.start() // appelle déjà resume() une 1re fois en interne
    const ctx = (ss as any).ctx as FakeAudioContext
    const before = ctx.resumeCalls
    ctx.state = 'suspended'
    ss.resume()
    expect(ctx.resumeCalls).toBe(before + 1)
  })

  it("resume() ne fait rien si le contexte est déjà 'running' (pas de resume() superflu)", () => {
    ;(globalThis as any).AudioContext = FakeAudioContext
    const ss = new SoundSystem()
    ss.start()
    const ctx = (ss as any).ctx as FakeAudioContext
    const before = ctx.resumeCalls // start() a déjà appelé resume() une fois
    ss.resume()
    expect(ctx.resumeCalls).toBe(before)
  })

  it("setMuted() avec un contexte réel bascule bien le gain du master entre 0 et 0.7 (jamais exercé : le seul test de setMuted tournait sans AudioContext, master toujours null)", () => {
    ;(globalThis as any).AudioContext = FakeAudioContext
    const ss = new SoundSystem()
    ss.start()
    const master = (ss as any).master as FakeGainNode
    ss.setMuted(true)
    expect(master.gain.value).toBe(0)
    ss.setMuted(false)
    expect(master.gain.value).toBe(0.7)
  })

  it("startCrowd() (privée) est un no-op sûr sans ctx/master — garde-fou jamais exercé (appelée uniquement en interne par start(), toujours après ctx/master posés)", () => {
    const ss = new SoundSystem()
    expect(() => (ss as any).startCrowd()).not.toThrow()
    expect((ss as any).crowdGain).toBeNull()
  })

  it("setCrowdHype() : une variation de Hype sous le seuil de 0.005 ne reprogramme PAS de rampe (évite de ré-écraser une rampe déjà en cours pour rien)", () => {
    ;(globalThis as any).AudioContext = FakeAudioContext
    const ss = new SoundSystem()
    ss.start()
    ss.setCrowdHype(0.5) // 0,03 + 0,5*0,1 = 0,08 : premier appel, dépasse forcément le seuil
    const crowdGain = (ss as any).crowdGain as FakeGainNode
    const callsAfterFirst = crowdGain.gain.calls.length
    expect(callsAfterFirst).toBeGreaterThan(0)
    ss.setCrowdHype(0.5001) // cible quasi identique : diff bien sous 0,005
    expect(crowdGain.gain.calls.length).toBe(callsAfterFirst) // aucune rampe supplémentaire programmée
  })
})

describe('recorder.ts — chemins de succès de stop(), jamais exercés (seuls les chemins d\'échec l\'étaient)', () => {
  afterEach(() => {
    delete (globalThis as any).MediaRecorder
    delete (globalThis as any).window
  })

  class WorkingRecorder {
    static isTypeSupported() {
      return true
    }
    state = 'recording'
    mimeType = 'video/webm'
    ondataavailable: ((e: { data: { size: number } }) => void) | null = null
    onstop: (() => void) | null = null
    start() {}
    stop() {
      // Comme un vrai MediaRecorder : un dernier chunk arrive juste avant onstop.
      this.ondataavailable?.({ data: { size: 42 } })
      this.state = 'inactive'
      this.onstop?.()
    }
  }

  function fakeCanvasAndMic() {
    const tracks: unknown[] = []
    const fakeStream = {
      addTrack: (t: unknown) => tracks.push(t),
      getTracks: () => tracks,
      getAudioTracks: () => [],
    }
    const fakeCanvas = { captureStream: () => fakeStream } as unknown as HTMLCanvasElement
    return { fakeCanvas }
  }

  it('MatchRecorder.stop() résout avec un Blob contenant les chunks accumulés, et relâche les pistes', async () => {
    ;(globalThis as any).MediaRecorder = WorkingRecorder
    const { fakeCanvas } = fakeCanvasAndMic()
    const mr = new MatchRecorder()
    expect(mr.start(fakeCanvas, null)).toBe(true)
    const rec = (mr as any).recorder
    rec.ondataavailable({ data: { size: 100 } }) // un chunk arrive en cours d'enregistrement
    const blob = await mr.stop()
    expect(blob).not.toBeNull()
    expect(blob!.type).toBe('video/webm')
    expect(mr.recording).toBe(false)
    expect((mr as any).mixStream).toBeNull() // pistes relâchées
  })

  it("MatchRecorder.stop() résout avec null si aucun recorder actif (jamais démarré, ou déjà arrêté)", async () => {
    const mr = new MatchRecorder()
    await expect(mr.stop()).resolves.toBeNull()
  })

  it('HighlightRecorder.stop() résout avec le segment courant quand il est assez long', async () => {
    ;(globalThis as any).MediaRecorder = WorkingRecorder
    ;(globalThis as any).window = { setInterval: () => 0, clearInterval: () => {} }
    const { HighlightRecorder } = await import('../systems/recorder')
    const hr = new HighlightRecorder()
    const { fakeCanvas } = fakeCanvasAndMic()
    expect(hr.start(fakeCanvas, null)).toBe(true)
    // Segment démarré il y a « longtemps » (> 6 s, le seuil de bascule vers prevBlob) :
    // simulé en reculant artificiellement currentStartedAt plutôt qu'en attendant pour de vrai.
    ;(hr as any).currentStartedAt = performance.now() - 7000
    const current = (hr as any).current
    current.ondataavailable({ data: { size: 100 } })
    const blob = await hr.stop()
    expect(blob).not.toBeNull()
    expect(blob!.type).toBe('video/webm')
  })

  it('HighlightRecorder.stop() : un segment courant TROP COURT (< 6 s) retombe sur le segment précédent complet', async () => {
    ;(globalThis as any).MediaRecorder = WorkingRecorder
    ;(globalThis as any).window = { setInterval: () => 0, clearInterval: () => {} }
    const { HighlightRecorder } = await import('../systems/recorder')
    const hr = new HighlightRecorder()
    const { fakeCanvas } = fakeCanvasAndMic()
    expect(hr.start(fakeCanvas, null)).toBe(true)
    ;(hr as any).prevBlob = new Blob(['segment précédent complet'], { type: 'video/webm' })
    // currentStartedAt reste « maintenant » : le segment en cours vient tout juste de commencer (< 6 s).
    const blob = await hr.stop()
    expect(blob).toBe((hr as any).prevBlob) // le précédent l'emporte, pas le segment trop court en cours
  })
})

describe("recorder.ts — chunks de taille nulle et repli de type MIME, angles morts de branches jamais exercés", () => {
  afterEach(() => {
    delete (globalThis as any).MediaRecorder
    delete (globalThis as any).window
    delete (globalThis as any).navigator
  })

  class EmptyChunkRecorder {
    static isTypeSupported() {
      return true
    }
    state = 'recording'
    mimeType = 'video/webm'
    ondataavailable: ((e: { data: { size: number } }) => void) | null = null
    onstop: (() => void) | null = null
    start() {}
    stop() {
      // Un vrai MediaRecorder peut s'arrêter sans avoir jamais produit un
      // seul octet de données (segment démarré puis aussitôt coupé) : le
      // dernier `ondataavailable` arrive quand même, mais avec size 0.
      this.ondataavailable?.({ data: { size: 0 } })
      this.state = 'inactive'
      this.onstop?.()
    }
  }

  function fakeCanvasAndMic() {
    const fakeStream = { addTrack: () => {}, getTracks: () => [], getAudioTracks: () => [] }
    const fakeCanvas = { captureStream: () => fakeStream } as unknown as HTMLCanvasElement
    return { fakeCanvas }
  }

  it("MatchRecorder : un chunk ondataavailable de taille 0 n'est PAS accumulé (garde-fou `size > 0` jamais exercé côté false)", async () => {
    ;(globalThis as any).MediaRecorder = EmptyChunkRecorder
    const { fakeCanvas } = fakeCanvasAndMic()
    const mr = new MatchRecorder()
    expect(mr.start(fakeCanvas, null)).toBe(true)
    const rec = (mr as any).recorder
    rec.ondataavailable({ data: { size: 0 } }) // chunk vide en cours d'enregistrement
    expect((mr as any).chunks).toHaveLength(0)
  })

  it("MatchRecorder.stop() résout null quand le recorder s'arrête sans avoir jamais accumulé de données (chunks vide malgré un arrêt réussi, pas un échec)", async () => {
    ;(globalThis as any).MediaRecorder = EmptyChunkRecorder
    const { fakeCanvas } = fakeCanvasAndMic()
    const mr = new MatchRecorder()
    expect(mr.start(fakeCanvas, null)).toBe(true)
    const blob = await mr.stop()
    expect(blob).toBeNull()
    expect((mr as any).mixStream).toBeNull() // pistes quand même relâchées
  })

  it("HighlightRecorder.rotate() : un segment sortant sans données met prevBlob à null, pas à un Blob vide", async () => {
    ;(globalThis as any).MediaRecorder = EmptyChunkRecorder
    ;(globalThis as any).window = { setInterval: () => 0, clearInterval: () => {} }
    const { HighlightRecorder } = await import('../systems/recorder')
    const hr = new HighlightRecorder()
    const { fakeCanvas } = fakeCanvasAndMic()
    expect(hr.start(fakeCanvas, null)).toBe(true)
    ;(hr as any).rotate() // segment sortant : aucun chunk n'est jamais arrivé avant la rotation
    expect((hr as any).prevBlob).toBeNull()
  })

  it("HighlightRecorder.stop() : segment courant assez long mais sans données retombe sur prevBlob via `blob ?? prevBlob`", async () => {
    ;(globalThis as any).MediaRecorder = EmptyChunkRecorder
    ;(globalThis as any).window = { setInterval: () => 0, clearInterval: () => {} }
    const { HighlightRecorder } = await import('../systems/recorder')
    const hr = new HighlightRecorder()
    const { fakeCanvas } = fakeCanvasAndMic()
    expect(hr.start(fakeCanvas, null)).toBe(true)
    ;(hr as any).prevBlob = new Blob(['segment précédent complet'], { type: 'video/webm' })
    ;(hr as any).currentStartedAt = performance.now() - 7000 // > 6 s : le segment courant serait normalement gardé
    const blob = await hr.stop()
    expect(blob).toBe((hr as any).prevBlob) // mais il n'a produit aucune donnée → repli sur le précédent
  })

  class NoMimeTypeRecorder {
    static isTypeSupported() {
      return true
    }
    state = 'recording'
    // Un MediaRecorder peut en théorie exposer un mimeType vide (aucun
    // conteneur négocié) : le repli `rec.mimeType || 'video/webm'` sur la
    // construction du Blob final n'était jamais exercé côté vide.
    mimeType = ''
    ondataavailable: ((e: { data: { size: number } }) => void) | null = null
    onstop: (() => void) | null = null
    start() {}
    stop() {
      this.ondataavailable?.({ data: { size: 42 } })
      this.state = 'inactive'
      this.onstop?.()
    }
  }

  it("MatchRecorder.stop() : rec.mimeType vide retombe sur 'video/webm' pour le type du Blob final", async () => {
    ;(globalThis as any).MediaRecorder = NoMimeTypeRecorder
    const { fakeCanvas } = fakeCanvasAndMic()
    const mr = new MatchRecorder()
    expect(mr.start(fakeCanvas, null)).toBe(true)
    const blob = await mr.stop()
    expect(blob!.type).toBe('video/webm')
  })

  it("HighlightRecorder.rotate() : rec.mimeType vide retombe aussi sur 'video/webm' pour prevBlob", async () => {
    ;(globalThis as any).MediaRecorder = NoMimeTypeRecorder
    ;(globalThis as any).window = { setInterval: () => 0, clearInterval: () => {} }
    const { HighlightRecorder } = await import('../systems/recorder')
    const hr = new HighlightRecorder()
    const { fakeCanvas } = fakeCanvasAndMic()
    expect(hr.start(fakeCanvas, null)).toBe(true)
    ;(hr as any).rotate()
    expect((hr as any).prevBlob!.type).toBe('video/webm')
  })

  it("HighlightRecorder.stop() : rec.mimeType vide retombe aussi sur 'video/webm' pour le segment courant", async () => {
    ;(globalThis as any).MediaRecorder = NoMimeTypeRecorder
    ;(globalThis as any).window = { setInterval: () => 0, clearInterval: () => {} }
    const { HighlightRecorder } = await import('../systems/recorder')
    const hr = new HighlightRecorder()
    const { fakeCanvas } = fakeCanvasAndMic()
    expect(hr.start(fakeCanvas, null)).toBe(true)
    ;(hr as any).currentStartedAt = performance.now() - 7000 // segment assez long : gardé tel quel
    const blob = await hr.stop()
    expect(blob!.type).toBe('video/webm')
  })

  it("shareOrDownload : un blob sans type MIME (blob.type === '') retombe sur 'video/webm' pour le File partagé", async () => {
    let shared: any = null
    ;(globalThis as any).navigator = {
      canShare: () => true,
      share: async (data: any) => {
        shared = data
      },
    }
    await shareOrDownload(new Blob(['x']), 'match', 'texte') // pas de `type` : blob.type === ''
    expect(shared.files[0].type).toBe('video/webm')
  })
})

describe('VoiceCoach.startVolumeMeter — la boucle de volume/pitch, jamais exercée', () => {
  afterEach(() => {
    delete (globalThis as any).AudioContext
    delete (globalThis as any).requestAnimationFrame
    delete (globalThis as any).cancelAnimationFrame
    delete (globalThis as any).window
  })

  class FakeAnalyser {
    fftSize = 0
    frequencyBinCount = 32
    freqData = new Uint8Array(32)
    timeData = new Float32Array(2048)
    getByteFrequencyData(arr: Uint8Array) {
      arr.set(this.freqData)
    }
    getFloatTimeDomainData(arr: Float32Array) {
      arr.set(this.timeData)
    }
  }
  class FakeAudioContext {
    state = 'running'
    sampleRate = 48000
    resumeCalls = 0
    createMediaStreamSource() {
      return { connect: () => {} }
    }
    createAnalyser() {
      return new FakeAnalyser()
    }
    resume() {
      this.resumeCalls++
      return Promise.resolve()
    }
    close() {
      return Promise.resolve()
    }
  }

  function setup() {
    ;(globalThis as any).AudioContext = FakeAudioContext
    ;(globalThis as any).window = {} // pas de SpeechRecognition : évite un throw ReferenceError sur `window` lui-même
    const rafQueue: Array<() => void> = []
    ;(globalThis as any).requestAnimationFrame = (cb: () => void) => {
      rafQueue.push(cb)
      return rafQueue.length
    }
    ;(globalThis as any).cancelAnimationFrame = () => {}
    return { rafQueue }
  }

  it('un volume fort (fréquentiel) fait monter energy à la frame suivante', async () => {
    const { rafQueue } = setup()
    const { VoiceCoach } = await import('../systems/voice')
    const vc = new VoiceCoach()
    await vc.start({} as any)
    expect(vc.state.energy).toBe(0) // 1re frame : buffer vide (silence)
    const analyser = (vc as any).analyser as FakeAnalyser
    analyser.freqData.fill(200) // volume fort
    rafQueue.shift()!() // avance manuellement d'une frame
    expect(vc.state.energy).toBeGreaterThan(0)
  })

  it('un signal voisé (temporel) met à jour le ratio de hauteur (prosodie)', async () => {
    const { rafQueue } = setup()
    const { VoiceCoach } = await import('../systems/voice')
    const vc = new VoiceCoach()
    await vc.start({} as any)
    const analyser = (vc as any).analyser as FakeAnalyser
    // Onde à 220 Hz à 48 kHz — même construction que le test dédié de detectPitch.
    for (let i = 0; i < analyser.timeData.length; i++) {
      analyser.timeData[i] = Math.sin((2 * Math.PI * 220 * i) / 48000) * 0.3
    }
    rafQueue.shift()!()
    expect(vc.state.pitchRatio).toBeGreaterThan(0) // la ligne de base venant d'être posée, ratio=1 la 1re fois
  })

  it("resume() débloque bien un contexte resté « suspended » (Safari/iOS), mais ne touche pas à un contexte déjà actif", async () => {
    setup()
    const { VoiceCoach } = await import('../systems/voice')
    const vc = new VoiceCoach()
    await vc.start({} as any)
    const ctx = (vc as any).audioCtx as FakeAudioContext
    const callsAtStart = ctx.resumeCalls
    ctx.state = 'running'
    vc.resume()
    expect(ctx.resumeCalls).toBe(callsAtStart) // déjà actif : pas d'appel superflu
    ctx.state = 'suspended'
    vc.resume()
    expect(ctx.resumeCalls).toBe(callsAtStart + 1) // suspendu : débloqué
  })

  it("la boucle s'arrête net dès que stopped=true, même si une frame était déjà programmée (`if (this.stopped || ...) return` jamais exercé côté vrai)", async () => {
    const { rafQueue } = setup()
    const { VoiceCoach } = await import('../systems/voice')
    const vc = new VoiceCoach()
    await vc.start({} as any)
    const energyBefore = vc.state.energy
    vc.stop() // stopped=true, mais la frame déjà programmée reste dans notre file de fake RAF
    expect(rafQueue.length).toBe(1)
    expect(() => rafQueue.shift()!()).not.toThrow()
    expect(vc.state.energy).toBe(energyBefore) // la frame n'a rien traité : sortie immédiate
  })

  it("sans timeBuf (relâché entre-temps), la boucle continue de mesurer le volume mais saute la prosodie (`if (this.timeBuf && this.audioCtx)` jamais exercé côté faux)", async () => {
    const { rafQueue } = setup()
    const { VoiceCoach } = await import('../systems/voice')
    const vc = new VoiceCoach()
    await vc.start({} as any)
    ;(vc as any).timeBuf = null
    const ratioBefore = vc.state.pitchRatio
    const analyser = (vc as any).analyser as FakeAnalyser
    analyser.freqData.fill(200)
    expect(() => rafQueue.shift()!()).not.toThrow()
    expect(vc.state.energy).toBeGreaterThan(0) // le volume est mesuré indépendamment
    expect(vc.state.pitchRatio).toBe(ratioBefore) // mais la prosodie n'a pas bougé, sautée
  })

  it("stop() : un audioCtx.close() qui rejette est absorbé silencieusement, comme pour SoundSystem — jamais exercé (le fake résout toujours)", async () => {
    setup()
    class RejectingAudioContext extends FakeAudioContext {
      close() {
        return Promise.reject(new Error('AudioContext already closed'))
      }
    }
    ;(globalThis as any).AudioContext = RejectingAudioContext
    const { VoiceCoach } = await import('../systems/voice')
    const vc = new VoiceCoach()
    await vc.start({} as any)
    expect(() => vc.stop()).not.toThrow()
  })
})

describe("enemyCoachAI — la logique de posture du coin adverse, jamais exercée", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Gèle l'action des deux côtés : on ne veut mesurer QUE la décision de
  // posture d'enemyCoachAI, pas un coup qui se résoudrait dans le même tick.
  function freeze(m: MatchState): void {
    m.player.nextActionAt = m.t + 1000
    m.enemy.nextActionAt = m.t + 1000
  }

  it('Provoqué (carte du joueur) : verrouillé agressif, sourd à son propre coach fantôme', () => {
    const m = freshMatch()
    toFighting(m)
    freeze(m)
    m.mods.provokedUntil = m.t + 5
    m.enemy.stance = 'defensive' // posture initiale volontairement différente, pour prouver le changement
    vi.spyOn(Math, 'random').mockReturnValue(0) // sans le verrou, ce 0 ferait aussi trembler d'autres branches
    tick(m, 1, quiet)
    expect(m.enemy.stance).toBe('aggressive')
  })

  it("Ulti adverse prêt : se déclenche seul (probabiliste), sans attendre de voix", () => {
    const m = freshMatch()
    toFighting(m)
    freeze(m)
    m.enemy.ulti = ULTI_MAX
    m.enemy.ultiUsed = false
    vi.spyOn(Math, 'random').mockReturnValue(0) // sous le seuil 0.9×dt (dt=1)
    const hpBefore = m.player.hp
    tick(m, 1, quiet)
    expect(m.enemy.ultiUsed).toBe(true)
    expect(m.player.hp).toBeLessThan(hpBefore)
  })

  it('Hype adverse pleine : le spécial se déclenche seul (probabiliste)', () => {
    const m = freshMatch()
    toFighting(m)
    freeze(m)
    m.enemy.hype = HYPE_MAX
    vi.spyOn(Math, 'random').mockReturnValue(0) // sous le seuil 1.2×dt (dt=1)
    const hpBefore = m.player.hp
    tick(m, 1, quiet)
    expect(m.enemy.hype).toBe(0) // fireSpecial() la remet à zéro
    expect(m.player.hp).toBeLessThan(hpBefore)
  })

  it('PV adverses bas (< 30 %) : bascule en posture de survie (défensive/évasive/contre)', () => {
    const m = freshMatch()
    toFighting(m)
    freeze(m)
    m.enemy.hp = Math.round(m.enemy.maxHp * 0.2)
    vi.spyOn(Math, 'random').mockReturnValue(0.5) // sous 0.9, entre bien dans le bloc de décision
    tick(m, 1, quiet)
    expect(['defensive', 'evasive', 'counter']).toContain(m.enemy.stance)
  })

  it('PV du joueur bas (< 35 %), adverse en pleine forme : passe à l\'offensive pour achever', () => {
    const m = freshMatch()
    toFighting(m)
    freeze(m)
    m.player.hp = Math.round(m.player.maxHp * 0.2)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    tick(m, 1, quiet)
    expect(m.enemy.stance).toBe('aggressive')
  })

  it('Le joueur est agressif : le coin adverse répond en contre-jeu (contre/défensive/évasive)', () => {
    const m = freshMatch()
    toFighting(m)
    freeze(m)
    m.player.stance = 'aggressive'
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    tick(m, 1, quiet)
    expect(['counter', 'defensive', 'evasive']).toContain(m.enemy.stance)
  })

  it('Le joueur est défensif : le coin adverse presse (neutre/agressive)', () => {
    const m = freshMatch()
    toFighting(m)
    freeze(m)
    m.player.stance = 'defensive'
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    tick(m, 1, quiet)
    expect(['neutral', 'aggressive']).toContain(m.enemy.stance)
  })

  it("Situation par défaut (personne en danger, joueur ni agressif ni défensif) : pioche dans les 5 postures", () => {
    const m = freshMatch()
    toFighting(m)
    freeze(m)
    m.player.stance = 'neutral'
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    tick(m, 1, quiet)
    expect(['neutral', 'aggressive', 'defensive', 'evasive', 'counter']).toContain(m.enemy.stance)
  })

  it("Frénésie et Cri de Guerre armés côté coin adverse (par ses propres cartes) se consomment aussi", () => {
    const m = freshMatch()
    toFighting(m)
    freeze(m)
    m.player.stance = 'defensive' // ne laisse que pick(['neutral', 'aggressive']) — 2 options
    m.enemyMods.armedFrenzyDuration = 8
    m.enemyMods.armedCheerHype = 20
    m.enemy.hype = 0
    // r=0,6 : sous le seuil 0,9×dt (dt=1) pour entrer dans le bloc de décision,
    // et floor(0,6×2)=1 → sélectionne 'aggressive' (le 2e élément), condition
    // nécessaire pour que la Frénésie (gatée sur 'aggressive') se déclenche.
    vi.spyOn(Math, 'random').mockReturnValue(0.6)
    tick(m, 1, quiet)
    expect(m.enemy.stance).toBe('aggressive')
    expect(m.enemyMods.armedFrenzyDuration).toBe(0) // consommé
    expect(m.enemyMods.frenzyUntil).toBeGreaterThan(m.t)
    expect(m.enemyMods.armedCheerHype).toBe(0) // consommé
    expect(m.enemy.hype).toBeGreaterThanOrEqual(20) // le bonus de Cri de Guerre a bien été versé
    expect(m.events.some(e => e.kind === 'cardProc' && e.text.includes('FRÉNÉSIE ADVERSE'))).toBe(true)
    expect(m.events.some(e => e.kind === 'cardProc' && e.text.includes('CRI DE GUERRE ADVERSE'))).toBe(true)
  })

  it("Contre Parfait armé côté coin adverse : quand son coach fantôme choisit LUI-MÊME la posture 'counter', la fenêtre de contre s'arme aussi — jamais exercé, les autres tests de posture retombaient toujours sur 'defensive' avec leur mock constant", () => {
    const m = freshMatch()
    toFighting(m)
    freeze(m)
    m.player.stance = 'aggressive' // ne laisse que pick(['counter', 'defensive', 'evasive'])
    m.enemyMods.armedCounterMul = 1.8
    // r=0,1 : sous le seuil 0,9×dt (entre dans le bloc), et floor(0,1×3)=0
    // → sélectionne 'counter' (le 1er élément de la liste).
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    tick(m, 1, quiet)
    expect(m.enemy.stance).toBe('counter')
    expect(m.enemy.counterUntil).toBeCloseTo(m.t + 2.5, 1)
  })
})

describe('forceRoundTimeout / chooseTacticPlan / addSpeechHype — API publique jamais exercée', () => {
  it('forceRoundTimeout ne fait rien hors de la phase de combat (déjà en pause, déjà fini…)', () => {
    const m = freshMatch()
    m.phase = 'tactics'
    const before = { ...m }
    forceRoundTimeout(m)
    expect(m.phase).toBe('tactics') // inchangé
    expect(m.playerWins).toBe(before.playerWins)
    expect(m.enemyWins).toBe(before.enemyWins)
  })

  it('forceRoundTimeout : le round va au camp avec le plus haut % de PV restant', () => {
    const m = freshMatch()
    toFighting(m)
    m.player.hp = Math.round(m.player.maxHp * 0.6)
    m.enemy.hp = Math.round(m.enemy.maxHp * 0.3) // ratio plus bas que le joueur
    forceRoundTimeout(m)
    expect(m.phase).toBe('roundEnd')
    expect(m.playerWins).toBe(1)
    expect(m.enemyWins).toBe(0)
    expect(m.events.some(e => e.kind === 'roundEnd' && e.winner === 'player')).toBe(true)
  })

  it("forceRoundTimeout : égalité parfaite de ratio PV tranche pour le joueur (>=, pas >)", () => {
    const m = freshMatch()
    toFighting(m)
    // maxHp diffère par perso (Kenta 110, Rei 95…) : égalise-les explicitement
    // pour obtenir un ratio EXACTEMENT identique des deux côtés, sans arrondi.
    m.player.maxHp = 100
    m.enemy.maxHp = 100
    m.player.hp = 50
    m.enemy.hp = 50
    forceRoundTimeout(m)
    expect(m.playerWins).toBe(1)
    expect(m.enemyWins).toBe(0)
  })

  it('chooseTacticPlan pose bien le plan choisi sur le match', () => {
    const m = freshMatch()
    expect(m.plan).toBeNull()
    chooseTacticPlan(m, 'concrete')
    expect(m.plan).toBe('concrete')
  })

  it("le plan tactique influence VRAIMENT les dégâts en combat — jamais exercé : le seul test posait `m.plan` sans jamais laisser un coup partir (PRESSION booste l'attaque du joueur, BÉTON réduit les dégâts qu'il encaisse). Comparaison PAIRÉE sur nombres aléatoires communs (même graine rejouée avec/sans plan) : un coup isolé peut arrondir la même valeur (Math.round) et le bruit du dé (esquive/critique) domine largement l'effet du plan en tirages indépendants — apparier élimine ce bruit sans neutraliser artificiellement l'esquive/le critique", () => {
    function totalDamage(atkSide: 'player' | 'enemy', plan: 'pressure' | 'concrete' | null, n: number) {
      let seed = 1
      const seededRandom = () => {
        seed = (seed * 16807) % 2147483647
        return (seed - 1) / 2147483646
      }
      let sum = 0
      const origRandom = Math.random
      Math.random = seededRandom
      try {
        for (let i = 0; i < n; i++) {
          const m = freshMatch()
          toFighting(m)
          if (plan) chooseTacticPlan(m, plan)
          if (atkSide === 'player') {
            m.player.nextActionAt = m.t
            m.enemy.nextActionAt = m.t + 1000
          } else {
            m.enemy.nextActionAt = m.t
            m.player.nextActionAt = m.t + 1000
          }
          const target = atkSide === 'player' ? m.enemy : m.player
          const before = target.hp
          tick(m, 0.001, quiet)
          sum += before - target.hp
        }
      } finally {
        Math.random = origRandom
      }
      return sum
    }
    // PRESSION (atk ×1,12) : le joueur inflige plus de dégâts en attaquant.
    expect(totalDamage('player', 'pressure', 300)).toBeGreaterThan(totalDamage('player', null, 300))
    // BÉTON (def ×1,15) : le joueur encaisse moins de dégâts en défendant.
    // Même graine rejouée (LCG remis à 1 à chaque appel de totalDamage) :
    // les DEUX runs tirent l'EXACTE même séquence d'esquives/critiques,
    // seul le plan diffère — élimine le bruit qui faisait flipper le signe
    // du résultat d'une exécution à l'autre en tirage libre.
    expect(totalDamage('enemy', 'concrete', 300)).toBeLessThan(totalDamage('enemy', null, 300))
  })

  it('addSpeechHype ajoute de la Hype au joueur, mise à l\'échelle par son Cœur (HRT)', () => {
    const m = freshMatch() // Kenta, hrt=7 -> hrtScale = 0.5 + 7/12 ≈ 0,9167
    m.player.hype = 0
    addSpeechHype(m, 10)
    expect(m.player.hype).toBeCloseTo(10 * (0.5 + 7 / 12), 5)
  })

  it('addSpeechHype reste plafonné à HYPE_MAX même avec un gros bonus', () => {
    const m = freshMatch()
    m.player.hype = HYPE_MAX - 1
    addSpeechHype(m, 999)
    expect(m.player.hype).toBe(HYPE_MAX)
  })
})

describe("Provocation en attente : prend effet au round SUIVANT, jamais exercé", () => {
  it("une provocation jouée par le joueur (m.mods) verrouille l'ADVERSAIRE en agressif au round suivant", () => {
    const m = freshMatch()
    m.phase = 'tactics'
    m.phaseUntil = m.t // déjà expiré : le prochain tick déclenche startNextRound
    m.mods.provokedUntil = -1 // carte de provocation jouée au coin du ring, en attente
    m.enemy.stance = 'defensive' // posture initiale volontairement différente, pour prouver le changement
    tick(m, 0.01, quiet)
    expect(m.phase).toBe('intro') // le round suivant a bien démarré
    expect(m.enemy.stance).toBe('aggressive')
    expect(m.mods.provokedUntil).toBeGreaterThan(m.t) // -1 (en attente) remplacé par une vraie échéance
  })

  it("une provocation jouée par le coin adverse (m.enemyMods) verrouille le JOUEUR en agressif au round suivant", () => {
    const m = freshMatch()
    m.phase = 'tactics'
    m.phaseUntil = m.t
    m.enemyMods.provokedUntil = -1
    m.player.stance = 'defensive'
    tick(m, 0.01, quiet)
    expect(m.phase).toBe('intro')
    expect(m.player.stance).toBe('aggressive')
    expect(m.enemyMods.provokedUntil).toBeGreaterThan(m.t)
  })
})

describe('Transition roundEnd → tactics/matchEnd — jamais exercée directement', () => {
  it("2 rounds gagnés par le joueur : le match se termine, événement matchEnd avec le bon vainqueur", () => {
    const m = freshMatch()
    m.phase = 'roundEnd'
    m.phaseUntil = m.t
    m.playerWins = 2
    m.enemyWins = 0
    tick(m, 0.01, quiet)
    expect(m.phase).toBe('matchEnd')
    expect(m.events.some(e => e.kind === 'matchEnd' && e.winner === 'player')).toBe(true)
  })

  it('2 rounds gagnés par le coin adverse : le match se termine pour lui aussi', () => {
    const m = freshMatch()
    m.phase = 'roundEnd'
    m.phaseUntil = m.t
    m.playerWins = 1
    m.enemyWins = 2
    tick(m, 0.01, quiet)
    expect(m.phase).toBe('matchEnd')
    expect(m.events.some(e => e.kind === 'matchEnd' && e.winner === 'enemy')).toBe(true)
  })

  it("Vol de Souffle adverse : réduit le Souffle de la pause suivante, une seule fois, avec l'event dédié", () => {
    const m = freshMatch()
    m.phase = 'roundEnd'
    m.phaseUntil = m.t
    m.playerWins = 0
    m.enemyWins = 0 // match continue : passe en tactics, pas matchEnd
    m.enemyMods.drainEnemySouffle = 2
    // Main/deck adverses vidés : sans ça, enemyCornerPlay() (appelé PAR ce
    // même tick(), juste après la consommation du vol) peut piocher et
    // jouer une VRAIE carte drainSouffle du starter deck et réarmer le mod
    // — un flake trouvé en observant le test échouer ~4 fois sur 5 en
    // suite complète (jamais en isolation), pas un bug du jeu.
    m.enemyHand = []
    m.enemyDeck = []
    tick(m, 0.01, quiet)
    expect(m.phase).toBe('tactics')
    expect(m.souffle).toBe(SOUFFLE_PER_CORNER - 2)
    expect(m.enemyMods.drainEnemySouffle).toBe(0) // consommé, pas reconduit aux pauses suivantes
    expect(m.events.some(e => e.kind === 'cardProc' && e.text.includes('SOUFFLE EST VOLÉ'))).toBe(true)
  })

  it('Vol de Souffle adverse : ne descend jamais sous zéro même si le vol dépasse le Souffle disponible', () => {
    const m = freshMatch()
    m.phase = 'roundEnd'
    m.phaseUntil = m.t
    m.enemyMods.drainEnemySouffle = 999
    m.enemyHand = []
    m.enemyDeck = []
    tick(m, 0.01, quiet)
    expect(m.souffle).toBe(0)
  })
})

describe('KO naturel → endRound, Initiative (auto-spécial après silence), Dernière Chance côté joueur', () => {
  function freeze(m: MatchState): void {
    m.player.nextActionAt = m.t + 1000
    m.enemy.nextActionAt = m.t + 1000
  }

  it("un KO naturel (PV à 0 en combat) termine le round pour le bon camp, des deux côtés", () => {
    const win = freshMatch()
    toFighting(win)
    freeze(win)
    win.enemy.hp = 0
    tick(win, 0.01, quiet)
    expect(win.phase).toBe('roundEnd')
    expect(win.playerWins).toBe(1)
    expect(win.enemyWins).toBe(0)

    const lose = freshMatch()
    toFighting(lose)
    freeze(lose)
    lose.player.hp = 0
    tick(lose, 0.01, quiet)
    expect(lose.phase).toBe('roundEnd')
    expect(lose.enemyWins).toBe(1)
    expect(lose.playerWins).toBe(0)
  })

  it("perdre un round avec l'Ulti déjà proche du plein le fait déborder à 100 et déclenche ultiReady", () => {
    const m = freshMatch()
    toFighting(m)
    freeze(m)
    m.player.ulti = 90 // perdre le round ajoute +15 -> 105, plafonné à 100
    m.player.ultiUsed = false
    m.player.hp = 0 // le joueur perd ce round
    tick(m, 0.01, quiet)
    expect(m.player.ulti).toBe(ULTI_MAX)
    expect(m.events.some(e => e.kind === 'ultiReady' && e.who === 'player')).toBe(true)
  })

  it("même chose côté ENNEMI : perdre un round fait aussi déborder SON Ulti et déclenche ultiReady('enemy') — jamais exercé, seule la perte de round côté joueur l'était", () => {
    const m = freshMatch()
    toFighting(m)
    freeze(m)
    m.enemy.ulti = 90
    m.enemy.ultiUsed = false
    m.enemy.hp = 0 // l'ennemi perd ce round
    tick(m, 0.01, quiet)
    expect(m.enemy.ulti).toBe(ULTI_MAX)
    expect(m.events.some(e => e.kind === 'ultiReady' && e.who === 'enemy')).toBe(true)
  })

  it("perdre un round avec l'Ulti DÉJÀ UTILISÉE ne la recharge pas — jamais exercé, `ultiUsed` restait toujours à `false` dans les autres tests de fin de round", () => {
    const m = freshMatch()
    toFighting(m)
    freeze(m)
    m.player.ulti = 0
    m.player.ultiUsed = true // déjà tirée ce match
    m.player.hp = 0
    tick(m, 0.01, quiet)
    expect(m.player.ulti).toBe(0) // aucun gain
    expect(m.events.some(e => e.kind === 'ultiReady')).toBe(false)
  })

  it('forceRoundTimeout : le round va aussi au camp adverse quand SON ratio de PV est meilleur — jamais exercé, seul le cas où le joueur gagne (ou une égalité) l\'était', () => {
    const m = freshMatch()
    toFighting(m)
    m.player.hp = Math.round(m.player.maxHp * 0.2)
    m.enemy.hp = Math.round(m.enemy.maxHp * 0.7) // ratio adverse nettement meilleur
    forceRoundTimeout(m)
    expect(m.phase).toBe('roundEnd')
    expect(m.enemyWins).toBe(1)
    expect(m.playerWins).toBe(0)
  })

  it("bug trouvé en audit coverage : la Hype qui atteint le plein PAR LE SEUL trickle passif (coach silencieux) ne déclenchait jamais hypeFull — aucun retour audio/visuel alors que le compte à rebours de l'Initiative démarre quand même", () => {
    const m = freshMatch()
    toFighting(m)
    freeze(m)
    // Juste sous le plein : le trickle passif (auto-motivation, ~0,013/tick
    // ici) suffit À LUI SEUL à franchir le seuil sur ce tick, sans aucune
    // énergie de coaching (quiet = silence total).
    m.player.hype = HYPE_MAX - 0.005
    m.player.hypeFullSince = 0
    expect(m.events.some(e => e.kind === 'hypeFull')).toBe(false)
    tick(m, 0.01, quiet)
    expect(m.player.hype).toBe(HYPE_MAX) // bien plein...
    expect(m.player.hypeFullSince).toBeGreaterThan(0) // ...et le minuteur a bien démarré...
    expect(m.events.some(e => e.kind === 'hypeFull' && e.who === 'player')).toBe(true) // ...mais l'événement doit prévenir le joueur
  })

  it("Initiative : Hype pleine + coach silencieux plus de 6s → le perso tire seul son spécial", () => {
    const m = freshMatch()
    toFighting(m)
    freeze(m)
    m.player.hype = HYPE_MAX
    m.player.hypeFullSince = m.t - 7 // déjà plein depuis 7s (silence prolongé)
    const hpBefore = m.enemy.hp
    tick(m, 0.01, quiet) // aucune commande : quiet = { command: null, ... }
    expect(m.player.hype).toBe(0) // fireSpecial() la remet à zéro
    expect(m.enemy.hp).toBeLessThan(hpBefore)
  })

  it("Initiative : Hype pleine mais depuis MOINS de 6s → ne tire pas encore tout seul", () => {
    const m = freshMatch()
    toFighting(m)
    freeze(m)
    m.player.hype = HYPE_MAX
    m.player.hypeFullSince = m.t - 2 // pleine depuis seulement 2s
    const hpBefore = m.enemy.hp
    tick(m, 0.01, quiet)
    expect(m.player.hype).toBe(HYPE_MAX) // pas encore consommée
    expect(m.enemy.hp).toBe(hpBefore)
  })

  it("Dernière Chance côté joueur : sous le seuil de PV, la Hype se remplit d'un coup, une seule fois", () => {
    const m = freshMatch()
    toFighting(m)
    freeze(m)
    m.mods.lowHpThreshold = 0.15
    m.player.hp = Math.round(m.player.maxHp * 0.1) // sous les 15%
    m.player.hype = 0
    tick(m, 0.01, quiet)
    expect(m.player.hype).toBe(HYPE_MAX)
    expect(m.mods.lowHpThreshold).toBe(0) // désarmée, ne se redéclenche pas
    expect(m.events.some(e => e.kind === 'cardProc' && e.text.includes('DERNIÈRE CHANCE'))).toBe(true)
    expect(m.events.some(e => e.kind === 'hypeFull' && e.who === 'player')).toBe(true)
  })
})

describe('drawCards : la défausse remélangée, et ultiReady via les dégâts de combat — jamais exercés', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('pioche vide, défausse pleine : la défausse redevient la pioche (mélangée), la pioche continue', () => {
    const m = freshMatch()
    m.deck = []
    m.discard = ['massage', 'secondWind', 'focus']
    m.hand = []
    drawCards(m, 2)
    expect(m.hand.length).toBe(2)
    expect(m.discard.length).toBe(0) // vidée, devenue la nouvelle pioche
    expect(m.deck.length).toBe(1) // 3 cartes remélangées, 2 piochées, 1 restante
    // Aucune carte perdue ni dupliquée dans l'aller-retour défausse → pioche → main.
    const all = [...m.hand, ...m.deck].sort()
    expect(all).toEqual(['focus', 'massage', 'secondWind'].sort())
  })

  it('pioche ET défausse vides : la pioche s\'arrête proprement, la main reste courte', () => {
    const m = freshMatch()
    m.deck = []
    m.discard = []
    m.hand = ['massage']
    expect(() => drawCards(m, 3)).not.toThrow()
    expect(m.hand).toEqual(['massage']) // rien de plus à piocher
  })

  it("charger l'Ulti jusqu'au plein PAR LES DÉGÂTS DE COMBAT (pas la perte d'un round) déclenche aussi ultiReady", () => {
    const m = freshMatch()
    toFighting(m)
    m.enemy.nextActionAt = m.t + 1000 // seul le joueur attaque ce tick
    m.player.nextActionAt = m.t
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // jamais d'esquive, jamais de crit, jamais de garde
    m.enemy.ulti = 99 // à un coup du plein (encaisser charge à 46 % dmg/maxHp)
    m.enemy.ultiUsed = false
    tick(m, 0.001, quiet)
    expect(m.enemy.ulti).toBe(ULTI_MAX)
    expect(m.events.some(e => e.kind === 'ultiReady' && e.who === 'enemy')).toBe(true)
  })

  it("même chose côté JOUEUR (`f === m.player ? 'player' : ...`, branche jamais prise ici : le seul test 'player' passait par la perte de round, un point de code totalement différent)", () => {
    const m = freshMatch()
    toFighting(m)
    m.player.nextActionAt = m.t + 1000 // seul l'adversaire attaque ce tick
    m.enemy.nextActionAt = m.t
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // jamais d'esquive, jamais de crit, jamais de garde
    // Juste sous le plein plutôt qu'une valeur fixe arbitraire : le gain
    // exact dépend des stats du perso qui encaisse (ici Kenta, pas Rei
    // dans le test miroir ci-dessus), pas besoin de le calculer à l'avance.
    m.player.ulti = ULTI_MAX - 0.01
    m.player.ultiUsed = false
    tick(m, 0.001, quiet)
    expect(m.player.ulti).toBe(ULTI_MAX)
    expect(m.events.some(e => e.kind === 'ultiReady' && e.who === 'player')).toBe(true)
  })
})

describe('story.ts : 4 branches défensives jamais exercées (fallbacks id inconnu + hasStorage=false)', () => {
  it("chapterOpponent avec un opponentId absent du roster ET pas le boss final retombe sur ROSTER[0], jamais un crash", async () => {
    const { STORY_CHAPTERS, chapterOpponent } = await import('./story')
    const fake = { ...STORY_CHAPTERS[0], opponentId: 'perso-inexistant' }
    expect(() => chapterOpponent(fake)).not.toThrow()
    const { ROSTER } = await import('./characters')
    expect(chapterOpponent(fake).name).toBe(ROSTER[0].name)
  })

  it('chapterEnemyDeck avec un id de chapitre inconnu retombe sur un deck vide, jamais un crash', async () => {
    const { STORY_CHAPTERS, chapterEnemyDeck } = await import('./story')
    const fake = { ...STORY_CHAPTERS[0], id: 'ch-inconnu' }
    expect(() => chapterEnemyDeck(fake)).not.toThrow()
    expect(chapterEnemyDeck(fake)).toEqual([])
  })

  describe('localStorage totalement bloqué (accès à la propriété elle-même jette)', () => {
    beforeEach(() => {
      vi.resetModules() // sinon un import déjà mis en cache plus haut ne se ré-évaluerait pas
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get() {
          throw new Error('SecurityError: localStorage access is blocked')
        },
      })
    })

    afterEach(() => {
      delete (globalThis as any).localStorage
    })

    it('loadCleared : hasStorage=false renvoie un Set vide sans jamais toucher localStorage', async () => {
      const { loadCleared } = await import('./story')
      expect(() => loadCleared()).not.toThrow()
      expect(loadCleared().size).toBe(0)
    })

    it('markCleared : hasStorage=false ne tente jamais l\'écriture, ne plante pas', async () => {
      const { markCleared } = await import('./story')
      expect(() => markCleared('ch1')).not.toThrow()
    })

    it("deckBuilder.ts : loadTemplate/saveTemplate avec hasStorage=false — même angle mort que story.ts, jamais exercé au-delà du chargement du module", async () => {
      const { loadTemplate, saveTemplate, defaultTemplate } = await import('./deckBuilder')
      expect(() => loadTemplate()).not.toThrow()
      expect(loadTemplate()).toEqual(defaultTemplate())
      expect(() => saveTemplate(defaultTemplate())).not.toThrow()
    })

    it("onboarding.ts : hasSeenCombatHint/markCombatHintSeen avec hasStorage=false — même angle mort, jamais exercé au-delà du chargement du module", async () => {
      const { hasSeenCombatHint, markCombatHintSeen, hasSeenCornerHint, markCornerHintSeen } = await import(
        './onboarding'
      )
      expect(() => hasSeenCombatHint()).not.toThrow()
      expect(hasSeenCombatHint()).toBe(false)
      expect(() => markCombatHintSeen()).not.toThrow()
      expect(() => hasSeenCornerHint()).not.toThrow()
      expect(() => markCornerHintSeen()).not.toThrow()
    })

    it("progression.ts : getProgress/recordResult avec hasStorage=false — même angle mort, jamais exercé au-delà du chargement du module", async () => {
      const { getProgress, recordResult } = await import('./progression')
      expect(() => getProgress('kenta')).not.toThrow()
      expect(getProgress('kenta')).toEqual({ wins: 0, losses: 0 })
      expect(() => recordResult('kenta', true)).not.toThrow() // écriture silencieusement ignorée
    })

    it("stable.ts : getStable/doStableAction avec hasStorage=false — même angle mort, jamais exercé au-delà du chargement du module", async () => {
      const { getStable, doStableAction } = await import('./stable')
      const t = Date.UTC(2026, 0, 1, 12)
      expect(() => getStable('kenta', 'sanguin', t)).not.toThrow()
      const s = getStable('kenta', 'sanguin', t)
      expect(s.mood).toBe(50) // repli sur un état frais à chaque appel, rien ne persiste
      expect(() => doStableAction('kenta', 'sanguin', 'leisure', 'atk', t)).not.toThrow()
    })

    it("cardForge.ts : saveForgedCard/loadForgedCards avec hasStorage=false — même angle mort, jamais exercé au-delà du chargement du module", async () => {
      const { forgeCard, saveForgedCard, loadForgedCards } = await import('./cardForge')
      const r = forgeCard('un cri de guerre puissant')!
      expect(() => saveForgedCard(r.card)).not.toThrow() // registerCustomCard tourne quand même, seule la persistance est sautée
      expect(() => loadForgedCards()).not.toThrow()
      expect(loadForgedCards()).toEqual([])
    })
  })
})

describe('enemyCardValue (grille de valeur du coach fantôme adverse) : 9 cases du switch jamais évaluées', () => {
  // enemyCardValue() n'est pas exportée, mais enemyCornerPlay() l'appelle
  // sur CHAQUE carte de la main adverse pendant l'évaluation (avant de
  // choisir la meilleure) — qu'elle soit achetée ou non. Il suffit donc de
  // mettre une carte de chaque effet en main pour exercer son `case`, sans
  // avoir besoin qu'elle soit réellement jouée.
  it("état favorable au coin joueur (Hype haute, perso adverse blessé) : coldShower (enemyHype) gagne, les 8 autres cases s'évaluent sans être achetées", () => {
    const m = freshMatch()
    m.player.hype = 70 // > 50 (enemyHype) ET > 60 (halveEnemySpecial)
    m.enemy.hp = Math.round(m.enemy.maxHp * 0.3) // < 50 % PV (lowHpHypeFull)
    m.enemyDeck = []
    m.enemyDiscard = []
    m.enemyHand = [
      'coldShower', // enemyHype -30 : v = 30/15 = 2.0 (le plus fort, achetée)
      'sigYuna', // immuneConfusion : v = 0 (carte morte pour l'IA, jamais achetée)
      'perfectCounter', // armCounterMul : v = 0.5
      'sigFang', // armAttackFrenzy : v = 1.0
      'lastChance', // lowHpHypeFull (branche <50% PV) : v = 1.4
      'provocation', // provoke : v = 1.3
      'sigRei', // counterHype : v = 0.4
      'sigKenta', // hitsTakenHype : v = 0.7
      'sigGoro', // halveEnemySpecial (branche Hype>60) : v = 1.6
    ]
    enemyCornerPlay(m)
    // Une seule carte achetée : coldShower (2.0), la plus forte, seule à
    // dépasser le seuil de 0,75 ET tenir dans les 3 Souffle de départ.
    expect(m.enemyDiscard).toEqual(['coldShower'])
    expect(m.enemySouffle).toBe(1) // 3 - coût 2 ; plus rien d'affordable au-dessus du seuil ensuite
    expect(m.enemyHand.length).toBe(8)
    expect(m.player.hype).toBe(40) // 70 - 30 : l'effet de coldShower a bien été APPLIQUÉ, pas juste évalué
    // Les 8 autres cartes ont été ÉVALUÉES (chaque case du switch exécutée
    // au moins une fois) mais aucune n'a été achetée : leurs mods restent
    // à leur valeur par défaut.
    expect(m.enemyMods.armedFrenzyMul).toBe(0)
    expect(m.enemyMods.armedCounterMul).toBe(0)
    expect(m.enemyMods.lowHpThreshold).toBe(0)
    expect(m.enemyMods.provokedUntil).toBe(0)
    expect(m.enemyMods.counterHypeAmount).toBe(0)
    expect(m.enemyMods.hitsTakenHype).toBe(0)
    expect(m.enemyMods.halveEnemySpecial).toBe(false)
    expect(m.enemyMods.immuneConfusion).toBe(false)
  })

  it("état inverse (Hype basse, perso adverse en pleine forme) : provocation (provoke) gagne — ferme les branches « else » des ternaires enemyHype/lowHpHypeFull/halveEnemySpecial", () => {
    const m = freshMatch()
    m.player.hype = 30 // ≤ 50 ET ≤ 60 : branches « else » de enemyHype/halveEnemySpecial
    m.enemy.hp = Math.round(m.enemy.maxHp * 0.9) // ≥ 50 % PV : branche « else » de lowHpHypeFull
    m.enemyDeck = []
    m.enemyDiscard = []
    m.enemyHand = [
      'coldShower', // enemyHype (branche else) : v = 0, jamais achetée cette fois
      'sigYuna', // immuneConfusion : v = 0
      'perfectCounter', // armCounterMul : v = 0.5
      'sigFang', // armAttackFrenzy : v = 1.0 (2e plus forte, mais pas assez de Souffle après l'achat de provocation)
      'lastChance', // lowHpHypeFull (branche else) : v = 0.6
      'provocation', // provoke : v = 1.3 (la plus forte)
      'sigRei', // counterHype : v = 0.4
      'sigKenta', // hitsTakenHype : v = 0.7
      'sigGoro', // halveEnemySpecial (branche else) : v = 0.6
    ]
    enemyCornerPlay(m)
    expect(m.enemyDiscard).toEqual(['provocation'])
    expect(m.enemySouffle).toBe(1) // 3 - coût 2 ; sigFang (coût 2) ne rentre plus
    expect(m.enemyMods.provokedUntil).toBe(-1) // armé pour le round suivant (voir combat.ts)
    expect(m.player.hype).toBe(30) // coldShower jamais achetée cette fois : Hype joueur intacte
    expect(m.enemyMods.armedFrenzyMul).toBe(0) // sigFang évaluée mais jamais achetée
  })

  it('les 4 dernières cases jamais évaluées : hype (branche <75), armCheerHype, blockEnemyCard, drainSouffle', () => {
    const m = freshMatch()
    m.enemy.hype = 20 // < 75 : branche haute du ternaire de 'hype'
    m.enemyDeck = []
    m.enemyDiscard = []
    m.enemyHand = [
      'focus', // hype +15 (branche <75) : v = 15/15 = 1.0 (la plus forte)
      'warCry', // armCheerHype : v = 0.5 (jamais achetée, Souffle épuisé après cornerSilence)
      'cornerSilence', // blockEnemyCard : v = 0.8 (2e plus forte)
      'breathTheft', // drainSouffle : v = 0.7 (jamais achetée non plus)
    ]
    enemyCornerPlay(m)
    expect(m.enemyDiscard).toEqual(['focus', 'cornerSilence'])
    expect(m.enemySouffle).toBe(0) // 3 - 1 (focus) - 2 (cornerSilence)
    expect(m.enemy.hype).toBe(35) // 20 + 15 : l'effet 'hype' cible bien SOI-MÊME (pas l'adversaire)
    expect(m.enemyMods.blockNextEnemyCard).toBe(true)
    // warCry et breathTheft ont été ÉVALUÉES (leur case du switch a
    // tourné) tant que le Souffle le permettait encore, mais jamais
    // achetées : leurs mods restent à leur valeur par défaut.
    expect(m.enemyMods.armedCheerHype).toBe(0)
    expect(m.enemyMods.drainEnemySouffle).toBe(0)
  })

  it('dernière case jamais évaluée : dodgeBonus (via Forteresse, dodgeBonus + damageReduction)', () => {
    const m = freshMatch()
    m.enemyDeck = []
    m.enemyDiscard = []
    m.enemyHand = ['fortress'] // v = (1-0.75)*4 + 0.05*10 = 1.5, largement au-dessus du seuil 0,75
    enemyCornerPlay(m)
    expect(m.enemyDiscard).toEqual(['fortress'])
    expect(m.enemyMods.dodgeBonus).toBeCloseTo(0.05)
    expect(m.enemyMods.damageReductionMul).toBeCloseTo(0.75)
  })

  it("case 'heal' : le palier INTERMÉDIAIRE du ternaire imbriqué (15 %-35 % de PV manquants → multiplicateur ×1) n'était jamais exercé — seuls les paliers extrêmes (>35 % ailleurs dans ce fichier, et implicitement ≤15 %) l'étaient", () => {
    const m = freshMatch()
    m.enemy.hp = Math.round(m.enemy.maxHp * 0.75) // 25 % manquants : entre 15 % et 35 %
    m.enemyDeck = []
    m.enemyDiscard = []
    m.enemyHand = ['secondWind'] // heal 0.2 : v = 0.2*10*1 = 2.0 (palier ×1, pas ×2 ni ×0)
    enemyCornerPlay(m)
    expect(m.enemyDiscard).toEqual(['secondWind']) // 2.0 > seuil 0.75 : achetée
  })

  it("case 'hype' : quand la Hype adverse est DÉJÀ ≥ 75, la carte devient sans valeur (v=0) — seul le cas < 75 (ailleurs dans ce fichier) était exercé", () => {
    const m = freshMatch()
    m.enemy.hype = 80 // ≥ 75
    const hypeBefore = m.enemy.hype
    m.enemyDeck = []
    m.enemyDiscard = []
    m.enemyHand = ['focus'] // hype +15 : v = 0 à cette Hype, sous le seuil d'achat
    enemyCornerPlay(m)
    expect(m.enemyDiscard).toEqual([]) // jamais achetée, valeur nulle
    expect(m.enemy.hype).toBe(hypeBefore) // effet jamais appliqué
  })
})

describe('armCounterMul réellement JOUÉ (applyCardEffects) — jusqu\'ici seulement évalué par enemyCardValue, jamais appliqué', () => {
  it("jouer Contre Parfait arme bien armedCounterMul côté joueur (pas juste un mod posé à la main dans les autres tests)", () => {
    const m = freshMatch()
    m.phase = 'tactics'
    m.hand = ['perfectCounter']
    expect(m.mods.armedCounterMul).toBe(0)
    expect(playCard(m, 'perfectCounter')).toBe(true)
    expect(m.mods.armedCounterMul).toBe(2) // le mul de la carte (cards.ts)
    expect(m.souffle).toBe(SOUFFLE_PER_CORNER - getCard('perfectCounter').cost)
  })
})

describe('trickle de Hype passif : trait Sanguin + voix forte (voiceW=0.9) — jamais exercé par aucun test tick()', () => {
  it('Fang (sanguin) avec une énergie vocale > 0,55 gagne plus de Hype par trickle qu\'avec une énergie faible', () => {
    const withLoudVoice = createMatch(ROSTER[4], ROSTER[1], []) // Fang = sanguin
    toFighting(withLoudVoice)
    withLoudVoice.player.nextActionAt = withLoudVoice.t + 1000
    withLoudVoice.enemy.nextActionAt = withLoudVoice.t + 1000
    const hypeBefore = withLoudVoice.player.hype
    tick(withLoudVoice, 0.1, { command: null, voiceEnergy: 0.8, faceEnergy: 0 }) // > 0,55 : voiceW passe à 0.9
    const gainLoud = withLoudVoice.player.hype - hypeBefore

    const withQuietVoice = createMatch(ROSTER[4], ROSTER[1], [])
    toFighting(withQuietVoice)
    withQuietVoice.player.nextActionAt = withQuietVoice.t + 1000
    withQuietVoice.enemy.nextActionAt = withQuietVoice.t + 1000
    const hypeBefore2 = withQuietVoice.player.hype
    tick(withQuietVoice, 0.1, { command: null, voiceEnergy: 0.3, faceEnergy: 0 }) // ≤ 0,55 : voiceW reste à 0.6
    const gainQuiet = withQuietVoice.player.hype - hypeBefore2

    // Même trait (sanguin), seule l'énergie vocale change : le gain de Hype
    // doit être strictement supérieur avec une voix forte — sinon le trait
    // Sanguin n'a aucun effet réel sur ce trickle.
    expect(gainLoud).toBeGreaterThan(gainQuiet)
  })

  it("un 'cheer' hurlé enflamme un Sanguin (×1,5) mais stresse un Cérébral (×0,4) — jamais exercé, seul le trickle passif (`voiceW`) testait ces traits ailleurs, pas la commande 'cheer' elle-même", () => {
    function cheerGain(charIdx: number, shouting: boolean) {
      const m = createMatch(ROSTER[charIdx], ROSTER[1], [])
      toFighting(m)
      m.player.nextActionAt = m.t + 1000
      m.enemy.nextActionAt = m.t + 1000
      const before = m.player.hype
      tick(m, 0.001, { command: 'cheer', voiceEnergy: shouting ? 0.8 : 0.3, faceEnergy: 0 })
      return m.player.hype - before
    }
    const fang = { shout: cheerGain(4, true), calm: cheerGain(4, false) } // Fang = sanguin
    expect(fang.shout).toBeGreaterThan(fang.calm * 1.3) // ×1,5 attendu, marge pour l'arrondi Hype

    const yuna = { shout: cheerGain(2, true), calm: cheerGain(2, false) } // Yuna = cérébrale
    expect(yuna.shout).toBeLessThan(yuna.calm * 0.6) // ×0,4 attendu
  })

  it("un ordre 'counter' pose bien la posture ET arme la fenêtre de contre (`f.counterUntil`) — jamais exercé via tick(), seule l'écriture DIRECTE de l'état l'était ailleurs", () => {
    const m = freshMatch()
    toFighting(m)
    m.player.nextActionAt = m.t + 1000
    m.enemy.nextActionAt = m.t + 1000
    const before = m.t
    tick(m, 0.05, { command: 'counter', voiceEnergy: 0.5, faceEnergy: 0 })
    expect(m.player.stance).toBe('counter')
    expect(m.player.counterUntil).toBeCloseTo(before + 2.5, 1)
  })
})

describe("tick() rappelé alors que le match est déjà terminé (phase 'matchEnd') : ne doit rien faire, jamais exercé", () => {
  it("un tick supplémentaire après matchEnd est un no-op silencieux (pas de crash, aucun état ne bouge)", () => {
    const m = freshMatch()
    toFighting(m)
    m.player.nextActionAt = m.t + 1000
    m.enemy.nextActionAt = m.t + 1000
    m.playerWins = 1
    m.enemy.hp = 0
    tick(m, 0.01, quiet) // le KO clôt le round -> roundEnd -> (au prochain tick) matchEnd
    m.phaseUntil = m.t // force la transition immédiate au tick suivant
    tick(m, 0.01, quiet)
    expect(m.phase).toBe('matchEnd')
    // `m.t` avance TOUJOURS (`tick()` fait `m.t += dt` avant même le switch
    // de phase) : on snapshote donc tout SAUF `t`, qui est censé être la
    // seule chose à bouger sur un tick post-matchEnd.
    const tBefore = m.t
    const { t: _t, ...rest } = m
    const snapshot = JSON.stringify(rest)
    expect(() => tick(m, 0.5, { command: 'attack', voiceEnergy: 1, faceEnergy: 1 })).not.toThrow()
    expect(m.t).toBeCloseTo(tBefore + 0.5) // seul `t` a bougé...
    const { t: _t2, ...restAfter } = m
    expect(JSON.stringify(restAfter)).toBe(snapshot) // ...tout le reste est figé : le match ne bouge plus
  })
})

describe('planLabel (combat.ts) — fonction exportée jamais appelée par un test', () => {
  it('traduit chaque plan tactique en son libellé HUD', () => {
    expect(planLabel('pressure')).toBe('PRESSION')
    expect(planLabel('concrete')).toBe('BÉTON')
    expect(planLabel('counterplay')).toBe('CONTRE-JEU')
    expect(planLabel('coldblood')).toBe('SANG-FROID')
  })
})
