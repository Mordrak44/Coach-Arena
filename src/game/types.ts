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
  trait: ListenTrait
  lore: string
}

/** Posture de combat, pilotée par le coach */
export type Stance = 'neutral' | 'aggressive' | 'defensive' | 'evasive' | 'counter'

/** Commandes que le coach peut donner (voix ou boutons) */
export type CoachCommand = 'attack' | 'defend' | 'dodge' | 'counter' | 'special' | 'cheer'

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
  // Cartes signatures (une par perso du roster, débloquées par le Lien)
  | 'sigKenta' // Cœur Vaillant : encaisser 3 coups → +40 Hype
  | 'sigRei' // Orgueil du Rival : le prochain contre remplit 50 % de la Hype
  | 'sigYuna' // Concentration Absolue : immunisée à la confusion ce round
  | 'sigGoro' // Leçon d'Expérience : le premier spécial adverse du round est réduit de moitié
  | 'sigFang' // Frénésie : le prochain « attaque ! » → +50 % dégâts pendant 5 s
  | 'sigNyx' // Pas de l'Ombre : +15 % d'esquive ce round

export interface CoachCard {
  id: CardId
  name: string
  timing: CardTiming
  /** coût en Souffle (le budget de la pause) */
  cost: number
  icon: string
  desc: string
  /** id du perso dont c'est la carte signature (débloquée par le Lien) */
  signatureOf?: string
}

/** Effets de cartes en attente / actifs sur le perso du joueur */
export interface CardMods {
  perfectCounter: boolean
  warCry: boolean
  ironGuard: boolean
  lastChance: boolean
  /** l'ennemi est provoqué : posture agressive verrouillée jusqu'à ce t */
  provokedUntil: number
  // — signatures —
  /** Cœur Vaillant : compteur de coups encaissés ce round */
  kentaHeart: boolean
  hitsTakenThisRound: number
  /** Orgueil du Rival : le prochain contre remplit 50 % de la Hype */
  reiCounterHype: boolean
  /** Concentration Absolue : immunisée à la confusion ce round */
  yunaFocus: boolean
  /** Leçon d'Expérience : premier spécial adverse du round divisé par 2 */
  goroLesson: boolean
  /** Frénésie : armée par la carte, déclenchée par « attaque ! » */
  fangFrenzy: boolean
  frenzyUntil: number
  /** Pas de l'Ombre : +15 % d'esquive ce round */
  nyxShadow: boolean
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
  /** effets de cartes actifs côté joueur */
  mods: CardMods
  events: CombatEvent[]
}

export type CombatEvent =
  | { kind: 'hit'; t: number; target: 'player' | 'enemy'; dmg: number; crit: boolean; onoma: string }
  | { kind: 'blocked'; t: number; target: 'player' | 'enemy'; dmg: number }
  | { kind: 'dodged'; t: number; target: 'player' | 'enemy' }
  | { kind: 'countered'; t: number; by: 'player' | 'enemy'; dmg: number }
  | { kind: 'special'; t: number; by: 'player' | 'enemy'; name: string; onoma: string; dmg: number }
  | { kind: 'confused'; t: number; who: 'player' | 'enemy' }
  | { kind: 'roundEnd'; t: number; winner: 'player' | 'enemy' }
  | { kind: 'matchEnd'; t: number; winner: 'player' | 'enemy' }
  | { kind: 'roundStart'; t: number; round: number }
  | { kind: 'hypeFull'; t: number; who: 'player' | 'enemy' }
  | { kind: 'card'; t: number; name: string }
  | { kind: 'cardProc'; t: number; text: string }
  | { kind: 'trait'; t: number; text: string; color: string }
