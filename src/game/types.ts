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
  lore: string
}

/** Posture de combat, pilotée par le coach */
export type Stance = 'neutral' | 'aggressive' | 'defensive' | 'evasive' | 'counter'

/** Commandes que le coach peut donner (voix ou boutons) */
export type CoachCommand = 'attack' | 'defend' | 'dodge' | 'counter' | 'special' | 'cheer'

/** Plan tactique choisi entre les rounds */
export type TacticPlan = 'pressure' | 'concrete' | 'counterplay' | 'coldblood'

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
