// Modèle de données pur (aucune dépendance navigateur) — testable en isolation.

export interface Stats {
  /** Puissance : dégâts infligés */
  atk: number
  /** Garde : réduction des dégâts */
  def: number
  /** Vitesse : fréquence d'action + chances d'esquive */
  spd: number
  /** Cœur : réceptivité au coaching (multiplie les effets voix/facecam) */
  hrt: number
  /** Points de vie */
  hp: number
}

export type Archetype =
  | 'brawler' // brute au grand cœur
  | 'rival' // rival ténébreux
  | 'prodigy' // prodige technique
  | 'veteran' // vétéran défensif
  | 'beast' // bête sauvage
  | 'trickster' // fourbe insaisissable

export interface Special {
  name: string
  /** multiplicateur de dégâts appliqué sur une ATK de base */
  power: number
  onomatopoeia: string
}

/**
 * Trait d'écoute : comment le perso réagit au STYLE de coaching.
 * - sanguin : s'enflamme quand le coach crie (Hype boostée à fort volume)
 * - cerebral : veut du calme et de la précision — hurler le stresse
 * - tetu : ignore le premier ordre de posture de chaque round
 * - fusionnel : l'expressivité facecam du coach compte double
 */
export type ListenTrait = 'sanguin' | 'cerebral' | 'tetu' | 'fusionnel'

export interface Character {
  id: string
  name: string
  title: string
  archetype: Archetype
  /** couleur principale / secondaire (aura, tenue) */
  color: string
  color2: string
  stats: Stats
  special: Special
  /** l'Ultime : finisher unique du match, débloqué par la jauge d'Ulti */
  ulti: Special
  trait: ListenTrait
  lore: string
}

/** Posture de combat, pilotée par le coach */
export type Stance = 'neutral' | 'aggressive' | 'defensive' | 'evasive' | 'counter'

/** Commandes que le coach peut donner (voix ou boutons) */
export type CoachCommand = 'attack' | 'defend' | 'dodge' | 'counter' | 'special' | 'ulti' | 'cheer'

/** Plan tactique choisi entre les rounds */
export type TacticPlan = 'pressure' | 'concrete' | 'counterplay' | 'coldblood'

// --- Carnet du Coach -------------------------------------------------------

/**
 * Timing d'une carte :
 * - pause : carte Coach, effet immédiat au coin du ring
 * - armed : instant préchargé, libéré PAR LA VOIX pendant le round suivant
 * - condition : instant pari, déclenché par le scénario du round
 */
export type CardTiming = 'pause' | 'armed' | 'condition'

export type CardId =
  | 'secondWind' // pause : +20 % PV
  | 'massage' // pause : +8 % PV, coût 1
  | 'focus' // pause : +15 Hype
  | 'coldShower' // pause : l'adversaire perd 30 Hype
  | 'ironGuard' // pause : garde renforcée au prochain round
  | 'perfectCounter' // armed : le prochain « contre ! » crié fait ×2 dégâts
  | 'warCry' // armed : le prochain encouragement crié remplit fort la Hype
  | 'lastChance' // condition : sous 15 % PV → Hype pleine (une fois)
  | 'provocation' // condition : l'adversaire démarre le round agressif
  // Vague 2 (combos DSL)
  | 'adrenaline' // pause : petit soin + petite Hype
  | 'fortress' // pause : réduction de dégâts + esquive
  | 'verbalUppercut' // armed : encouragement boosté + Hype immédiate
  | 'totalCounter' // armed : contre ×1.5 qui donne de la Hype
  | 'lastStand' // condition : sous 20 % PV → Hype pleine, + petit soin
  | 'ambush' // condition : provoque ET arme un contre — le piège complet
  | 'coldBlood' // pause : sabote la Hype adverse + immunité confusion
  | 'steelSkin' // condition : encaisser nourrit + réduction légère
  // Vague 3 — la guerre des coins (interaction avec le coin adverse)
  | 'cornerSilence' // pause : la prochaine carte adverse part dans le vide
  | 'breathTheft' // pause : le coin adverse perd 2 Souffle
  | 'smokeScreen' // pause : carte adverse bloquée + esquive légère
  | 'championTax' // pause : drain 2 Souffle + petit moral
  | 'embargo' // pause : blocage + drain — l'étouffement complet
  // Cartes signatures (une par perso du roster, débloquées par le Lien)
  | 'sigKenta' // Cœur Vaillant : encaisser 3 coups → +40 Hype
  | 'sigRei' // Orgueil du Rival : le prochain contre remplit 50 % de la Hype
  | 'sigYuna' // Concentration Absolue : immunisée à la confusion ce round
  | 'sigGoro' // Leçon d'Expérience : le premier spécial adverse du round est réduit de moitié
  | 'sigFang' // Frénésie : le prochain « attaque ! » → +50 % dégâts pendant 5 s
  | 'sigNyx' // Pas de l'Ombre : +15 % d'esquive ce round
  // Cartes forgées par prompt (Forge de cartes) — id dynamique
  | `forge-${string}`

/**
 * Primitives d'effets — la DSL des cartes. Chaque carte est une combinaison
 * de primitives PARAMÉTRÉES ; le coût en Souffle est calculé depuis un
 * budget de puissance (voir cards.ts). C'est la fondation des centaines de
 * cartes et des cartes créées par prompt : l'habillage est libre, la
 * mécanique reste dans ces bornes.
 */
export type EffectPrimitive =
  // — effets immédiats (timing pause) —
  | { kind: 'heal'; pct: number } // % des PV max
  | { kind: 'hype'; amount: number } // Hype immédiate
  | { kind: 'enemyHype'; amount: number } // sabotage (négatif) de la Hype adverse
  | { kind: 'damageReduction'; mul: number } // dégâts reçus × mul ce round
  | { kind: 'dodgeBonus'; add: number } // + chance d'esquive ce round
  | { kind: 'immuneConfusion' } // pas de confusion ce round
  // — instants armés (libérés à la voix) —
  | { kind: 'armCounterMul'; mul: number } // prochain contre × mul
  | { kind: 'armCheerHype'; amount: number } // prochain encouragement +Hype
  | { kind: 'armAttackFrenzy'; mul: number; duration: number } // « attaque ! » → dégâts × mul pendant N s
  // — instants pari (conditionnels) —
  | { kind: 'lowHpHypeFull'; threshold: number } // sous X % PV → Hype pleine
  | { kind: 'provoke'; duration: number } // l'adversaire démarre agressif N s
  | { kind: 'counterHype'; amount: number } // prochain contre réussi → +Hype
  | { kind: 'hitsTakenHype'; hits: number; amount: number } // encaisser N coups → +Hype
  | { kind: 'halveEnemySpecial' } // premier spécial adverse ÷ 2
  // — guerre des coins (interaction avec le coin adverse, résolue à la
  //   PROCHAINE pause : ce sont des paris sur un round) —
  | { kind: 'blockEnemyCard' } // la prochaine carte du coin adverse part dans le vide
  | { kind: 'drainSouffle'; amount: number } // le coin adverse perd N Souffle à sa prochaine pause

export interface CoachCard {
  id: CardId
  name: string
  timing: CardTiming
  /** coût en Souffle — calculé depuis les effets (budget de puissance) */
  cost: number
  icon: string
  desc: string
  effects: EffectPrimitive[]
  /** id du perso dont c'est la carte signature (débloquée par le Lien) */
  signatureOf?: string
}

/**
 * État runtime GÉNÉRIQUE des effets de cartes actifs pour UN camp (le
 * joueur ET le coin adverse en ont un chacun) — alimenté par les primitives
 * (types.EffectPrimitive), lu par le moteur de combat. « L'ennemi » dans les
 * commentaires s'entend du point de vue du camp propriétaire des mods.
 * Expire à la fin du round (sauf provokedUntil/frenzyUntil, temporels).
 */
export interface CardMods {
  /** dégâts reçus × mul (1 = aucun effet) */
  damageReductionMul: number
  /** + chance d'esquive */
  dodgeBonus: number
  /** immunisé à la confusion ce round */
  immuneConfusion: boolean
  /** prochain contre × mul (0 = non armé) */
  armedCounterMul: number
  /** prochain encouragement : +Hype (0 = non armé) */
  armedCheerHype: number
  /** « attaque ! » → dégâts × mul pendant duration s (0 = non armé) */
  armedFrenzyMul: number
  armedFrenzyDuration: number
  frenzyUntil: number
  /** sous X % PV → Hype pleine (0 = off) */
  lowHpThreshold: number
  /** l'ennemi est provoqué : agressif verrouillé jusqu'à ce t (-1 = au prochain round) */
  provokedUntil: number
  /** prochain contre réussi → +Hype (0 = off) */
  counterHypeAmount: number
  /** encaisser N coups → +Hype */
  hitsTakenTarget: number
  hitsTakenHype: number
  hitsTakenCount: number
  /** premier spécial adverse ÷ 2 */
  halveEnemySpecial: boolean
  /** la prochaine carte jouée par le coin ADVERSE est annulée (survit à la fin de round) */
  blockNextEnemyCard: boolean
  /** Souffle retiré au coin adverse à sa prochaine pause (survit à la fin de round) */
  drainEnemySouffle: number
}

export interface CoachInput {
  /** commande ponctuelle émise depuis le dernier tick (ou null) */
  command: CoachCommand | null
  /** énergie vocale 0..1 (volume micro lissé) */
  voiceEnergy: number
  /** énergie facecam 0..1 (mouvement du visage/corps lissé) */
  faceEnergy: number
}

export interface FighterState {
  char: Character
  hp: number
  maxHp: number
  /** jauge de Hype 0..100 ; pleine → technique spéciale disponible */
  hype: number
  /**
   * jauge d'Ulti 0..100, conservée entre les rounds — chargée par le combat
   * (coups donnés, coups encaissés ×2, rounds perdus). Pleine → l'Ultime,
   * une fois par match.
   */
  ulti: number
  ultiUsed: boolean
  stance: Stance
  /** timestamp de combat (s) jusqu'auquel le perso est Confus (ordres spammés) */
  confusedUntil: number
  /** fenêtre de contre armée jusqu'à ce timestamp */
  counterUntil: number
  /** prochain instant où le perso peut agir */
  nextActionAt: number
  /** dernier instant où le coach a donné un ordre (détection de spam) */
  lastOrderAt: number
  /** nombre d'ordres de posture reçus ce round (trait Têtu) */
  ordersThisRound: number
  /** jauge pleine depuis cet instant ; passé un délai, le perso tire seul (0 = pas pleine) */
  hypeFullSince: number
  /** position x normalisée 0..1 dans l'arène */
  x: number
  /** 1 = regarde à droite, -1 = à gauche */
  facing: 1 | -1
  /** animation en cours pour le rendu */
  anim: { kind: 'idle' | 'attack' | 'hurt' | 'guard' | 'dodge' | 'special' | 'ko'; until: number }
}

export type MatchPhase = 'intro' | 'fighting' | 'roundEnd' | 'tactics' | 'matchEnd'

export interface MatchState {
  player: FighterState
  enemy: FighterState
  round: number
  playerWins: number
  enemyWins: number
  phase: MatchPhase
  /** horloge de combat en secondes (cumule les rounds) */
  t: number
  /** instant de fin de la phase courante (intro, roundEnd, tactics) */
  phaseUntil: number
  /** plan tactique actif du joueur pour le round courant */
  plan: TacticPlan | null
  /** pioche (deck mélangé, face cachée) */
  deck: CardId[]
  /** main du coach (jusqu'à HAND_SIZE cartes) */
  hand: CardId[]
  /** défausse */
  discard: CardId[]
  /** points de Souffle restants pour cette pause */
  souffle: number
  /** un seul échange (mulligan) par coin du ring */
  mulliganUsed: boolean
  /** une seule consigne parlée comprise par coin du ring */
  consigneUsed: boolean
  /** humeur basse : le premier ordre du match est boudé (Vie d'Écurie) */
  sulky: boolean
  /** effets de cartes actifs côté joueur */
  mods: CardMods
  /** l'Écurie : équipiers en réserve (relève au coin du ring, état conservé) */
  bench: FighterState[]
  enemyBench: FighterState[]
  /** une seule relève par pause */
  switchUsed: boolean
  /** le coin adverse joue un VRAI deck, symétrique du joueur */
  enemyDeck: CardId[]
  enemyHand: CardId[]
  enemyDiscard: CardId[]
  enemySouffle: number
  /** effets de cartes actifs côté adverse */
  enemyMods: CardMods
  events: CombatEvent[]
}

export type CombatEvent =
  | { kind: 'hit'; t: number; target: 'player' | 'enemy'; dmg: number; crit: boolean; onoma: string }
  | { kind: 'blocked'; t: number; target: 'player' | 'enemy'; dmg: number }
  | { kind: 'dodged'; t: number; target: 'player' | 'enemy' }
  | { kind: 'countered'; t: number; by: 'player' | 'enemy'; dmg: number }
  | { kind: 'special'; t: number; by: 'player' | 'enemy'; name: string; onoma: string; dmg: number }
  | { kind: 'ulti'; t: number; by: 'player' | 'enemy'; name: string; onoma: string; dmg: number }
  | { kind: 'ultiReady'; t: number; who: 'player' | 'enemy' }
  | { kind: 'confused'; t: number; who: 'player' | 'enemy' }
  | { kind: 'roundEnd'; t: number; winner: 'player' | 'enemy' }
  | { kind: 'matchEnd'; t: number; winner: 'player' | 'enemy' }
  | { kind: 'roundStart'; t: number; round: number }
  | { kind: 'hypeFull'; t: number; who: 'player' | 'enemy' }
  | { kind: 'card'; t: number; name: string }
  | { kind: 'cardProc'; t: number; text: string }
  | { kind: 'switch'; t: number; side: 'player' | 'enemy'; name: string }
  | { kind: 'trait'; t: number; text: string; color: string }
