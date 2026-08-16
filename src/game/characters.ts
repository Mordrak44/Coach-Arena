import type { Character, Stats, Archetype, ListenTrait } from './types'

// Somme de stats plafonnée pour l'équilibrage : atk+def+spd+hrt ≈ 26, hp à part.

export const ROSTER: Character[] = [
  {
    id: 'kenta',
    name: 'Kenta',
    title: 'La Brute au Grand Cœur',
    archetype: 'brawler',
    color: '#ff5a36',
    color2: '#ffd166',
    stats: { atk: 9, def: 6, spd: 4, hrt: 7, hp: 110 },
    special: { name: 'Poing du Volcan', power: 3.2, onomatopoeia: 'DOKAAN!!' },
    ulti: { name: 'Éruption du Cœur Brisé', power: 6.0, onomatopoeia: 'GOOOAAARRR!!!' },
    trait: 'fusionnel',
    lore: "Frappe fort, pleure facilement. Un bon coach le rend inarrêtable.",
  },
  {
    id: 'rei',
    name: 'Rei',
    title: 'Le Rival Ténébreux',
    archetype: 'rival',
    color: '#6c5ce7',
    color2: '#a29bfe',
    stats: { atk: 8, def: 5, spd: 8, hrt: 5, hp: 95 },
    special: { name: 'Éclipse Fatale', power: 3.5, onomatopoeia: 'ZUKYUN!' },
    ulti: { name: 'Nuit Sans Aube', power: 6.5, onomatopoeia: 'ZAN…SHUUN!!!' },
    trait: 'tetu',
    lore: "Talent pur, ego encore plus pur. N'écoute que les coachs qui crient juste.",
  },
  {
    id: 'yuna',
    name: 'Yuna',
    title: 'La Prodige',
    archetype: 'prodigy',
    color: '#00cec9',
    color2: '#81ecec',
    stats: { atk: 7, def: 6, spd: 7, hrt: 6, hp: 100 },
    special: { name: 'Mille Pétales', power: 2.8, onomatopoeia: 'SHUUIN!' },
    ulti: { name: 'Jardin des Mille Lames', power: 5.5, onomatopoeia: 'SHIRIRIRIN!!!' },
    trait: 'cerebral',
    lore: 'Technique parfaite, sang-froid glacial. Réagit à la précision, pas au volume.',
  },
  {
    id: 'goro',
    name: 'Gorō',
    title: 'Le Vétéran',
    archetype: 'veteran',
    color: '#636e72',
    color2: '#b2bec3',
    stats: { atk: 6, def: 10, spd: 3, hrt: 7, hp: 125 },
    special: { name: 'Muraille Brisante', power: 2.6, onomatopoeia: 'GOGOGO…BAAM!' },
    ulti: { name: 'Dernier Rempart', power: 5.2, onomatopoeia: 'DOGOOON!!!' },
    trait: 'cerebral',
    lore: "Vingt ans de ring. Encaisse tout, attend l'erreur, punit.",
  },
  {
    id: 'fang',
    name: 'Fang',
    title: 'La Bête',
    archetype: 'beast',
    color: '#e17055',
    color2: '#fab1a0',
    stats: { atk: 10, def: 3, spd: 8, hrt: 5, hp: 90 },
    special: { name: 'Crocs du Chaos', power: 3.8, onomatopoeia: 'GARURU!!' },
    ulti: { name: 'Apocalypse Sauvage', power: 7.0, onomatopoeia: 'GAAARRRUUU!!!' },
    trait: 'sanguin',
    lore: 'Sauvage, imprévisible, fragile. Coacher Fang, c\'est tenir une tempête en laisse.',
  },
  {
    id: 'nyx',
    name: 'Nyx',
    title: "L'Insaisissable",
    archetype: 'trickster',
    color: '#fd79a8',
    color2: '#ffeaa7',
    stats: { atk: 6, def: 4, spd: 10, hrt: 6, hp: 92 },
    special: { name: 'Danse Miroir', power: 3.0, onomatopoeia: 'SUUU…PAF!' },
    ulti: { name: 'Valse des Reflets', power: 5.8, onomatopoeia: 'SU…SU…BAKIN!!!' },
    trait: 'tetu',
    lore: "Personne ne l'a jamais touchée deux fois de suite. Personne ne sait pourquoi elle sourit.",
  },
]

// ---------------------------------------------------------------------------
// Création par prompt — v0 : parseur local par mots-clés.
// v1 : remplacé par un appel API Claude (voir ROADMAP).
// ---------------------------------------------------------------------------

interface KeywordRule {
  re: RegExp
  apply: (s: Stats) => void
  archetype?: Archetype
  color?: [string, string]
  specialName?: string
}

const RULES: KeywordRule[] = [
  { re: /rapide|vitesse|éclair|foudre|vif|ninja/i, apply: s => { s.spd += 4; s.def -= 2 }, archetype: 'trickster', color: ['#ffd166', '#fff3bf'], specialName: 'Frappe Éclair' },
  { re: /fort|puissan|brute|colosse|muscl|titan/i, apply: s => { s.atk += 4; s.spd -= 2 }, archetype: 'brawler', color: ['#ff5a36', '#ffb199'], specialName: 'Impact Titanesque' },
  { re: /tank|blind|armure|défens|mur|roc/i, apply: s => { s.def += 4; s.spd -= 1; s.hp += 20 }, archetype: 'veteran', color: ['#636e72', '#b2bec3'], specialName: 'Rempart Ultime' },
  { re: /fragile|verre|faible/i, apply: s => { s.hp -= 25; s.atk += 2 } },
  { re: /feu|flamme|volcan|brûl/i, apply: s => { s.atk += 2 }, color: ['#ff5a36', '#ffd166'], specialName: 'Tempête de Flammes' },
  { re: /glace|givre|froid|neige/i, apply: s => { s.def += 2 }, color: ['#74b9ff', '#dfe6e9'], specialName: 'Zéro Absolu' },
  { re: /ombre|ténèbr|noir|démon|sombre/i, apply: s => { s.atk += 1; s.spd += 1 }, archetype: 'rival', color: ['#2d3436', '#6c5ce7'], specialName: 'Voile des Ombres' },
  { re: /lumière|ange|sacré|divin/i, apply: s => { s.hrt += 3 }, color: ['#ffeaa7', '#ffffff'], specialName: 'Jugement Céleste' },
  { re: /cyborg|robot|machine|mecha|acier/i, apply: s => { s.def += 2; s.hrt -= 2 }, color: ['#00cec9', '#b2bec3'], specialName: 'Overdrive' },
  { re: /bête|loup|tigre|dragon|animal|fauve/i, apply: s => { s.atk += 3; s.hrt -= 1 }, archetype: 'beast', color: ['#e17055', '#fab1a0'], specialName: 'Rugissement Primal' },
  { re: /vieux|maître|sage|ancien|sensei/i, apply: s => { s.hrt += 2; s.def += 1; s.hp -= 10 }, archetype: 'veteran', specialName: 'Technique Interdite' },
  { re: /gentil|cœur|coeur|loyal|fidèle/i, apply: s => { s.hrt += 3 } },
]

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

const TRAIT_RULES: Array<[RegExp, ListenTrait]> = [
  [/calme|sage|maître|cérébral|précis|stratège|froid/i, 'cerebral'],
  [/sauvage|bête|fauve|rage|colér|sanguin|furieux|démon/i, 'sanguin'],
  [/loyal|fidèle|gentil|cœur|coeur|ami|chien/i, 'fusionnel'],
  [/têtu|tetu|rebelle|fier|ego|rival|solitaire|ombre/i, 'tetu'],
]

const ARCHETYPE_TRAIT: Record<Archetype, ListenTrait> = {
  brawler: 'sanguin',
  rival: 'tetu',
  prodigy: 'cerebral',
  veteran: 'cerebral',
  beast: 'sanguin',
  trickster: 'tetu',
}

function deriveTrait(prompt: string, archetype: Archetype): ListenTrait {
  for (const [re, trait] of TRAIT_RULES) {
    if (re.test(prompt)) return trait
  }
  return ARCHETYPE_TRAIT[archetype]
}

/** Crée un personnage à partir d'une description libre (parseur mots-clés v0). */
export function createFromPrompt(prompt: string): Character {
  const stats: Stats = { atk: 6, def: 6, spd: 6, hrt: 6, hp: 100 }
  let archetype: Archetype = 'prodigy'
  let color: [string, string] = ['#00b894', '#55efc4']
  let specialName = 'Frappe Légendaire'

  for (const rule of RULES) {
    if (rule.re.test(prompt)) {
      rule.apply(stats)
      if (rule.archetype) archetype = rule.archetype
      if (rule.color) color = rule.color
      if (rule.specialName) specialName = rule.specialName
    }
  }

  stats.atk = clamp(stats.atk, 2, 12)
  stats.def = clamp(stats.def, 2, 12)
  stats.spd = clamp(stats.spd, 2, 12)
  stats.hrt = clamp(stats.hrt, 2, 12)
  stats.hp = clamp(stats.hp, 70, 140)

  // Rééquilibrage : ramène la somme vers 26 pour rester fair-play.
  const sum = stats.atk + stats.def + stats.spd + stats.hrt
  const target = 26
  if (sum > target) {
    const scale = target / sum
    stats.atk = Math.max(2, Math.round(stats.atk * scale))
    stats.def = Math.max(2, Math.round(stats.def * scale))
    stats.spd = Math.max(2, Math.round(stats.spd * scale))
    stats.hrt = Math.max(2, Math.round(stats.hrt * scale))
  }

  const name = extractName(prompt)
  return {
    id: 'custom-' + Math.random().toString(36).slice(2, 8),
    name,
    title: 'Créé par le Coach',
    archetype,
    color: color[0],
    color2: color[1],
    stats,
    special: { name: specialName, power: 3.0, onomatopoeia: 'BAKOOM!!' },
    ulti: { name: specialName + ' : Zénith', power: 6.0, onomatopoeia: 'KABOOOOM!!!' },
    trait: deriveTrait(prompt, archetype),
    lore: prompt.slice(0, 140),
  }
}

function extractName(prompt: string): string {
  // « appelé X », « nommé X », « X, un… » — sinon nom généré.
  const m = prompt.match(/(?:appelé|nommé|s'appelle)\s+([A-ZÀ-Ý][\wà-ÿ-]{1,14})/i)
  if (m) return m[1]
  const syll = ['Ka', 'Ryu', 'Zen', 'Aki', 'Tetsu', 'Hana', 'Kai', 'Shiro', 'Rin', 'Dai']
  const end = ['ro', 'ka', 'to', 'mi', 'n', 'shi', 'ji']
  return (
    syll[Math.floor(Math.random() * syll.length)] + end[Math.floor(Math.random() * end.length)]
  )
}

export const TRAIT_INFO: Record<ListenTrait, { label: string; icon: string; hint: string }> = {
  sanguin: { label: 'Sanguin', icon: '🔥', hint: 'Crie fort : ça l’enflamme.' },
  cerebral: { label: 'Cérébral', icon: '🧊', hint: 'Parle calmement — hurler le stresse.' },
  tetu: { label: 'Têtu', icon: '🪨', hint: 'Ignore ton premier ordre. Insiste.' },
  fusionnel: { label: 'Fusionnel', icon: '💞', hint: 'Vis le match à la caméra : il le sent.' },
}

/** Adversaire IA choisi aléatoirement (différent du perso joueur si possible). */
export function pickOpponent(playerId: string): Character {
  const pool = ROSTER.filter(c => c.id !== playerId)
  return pool[Math.floor(Math.random() * pool.length)]
}

/**
 * Banc adverse (mode Rapide) : tiré du reste du roster, EXCLUANT tous les
 * ids passés — pas seulement l'adversaire principal. Sans exclure aussi le
 * perso du joueur et ses propres équipiers, le banc adverse pouvait aligner
 * une copie du perso même du joueur ou d'un de ses équipiers, face à
 * lui-même (trouvé en audit, 2026-08-16).
 */
export function pickOpponentTeam(excludeIds: string[], size: number): Character[] {
  const excluded = new Set(excludeIds)
  const pool = ROSTER.filter(c => !excluded.has(c.id))
  return [...pool].sort(() => Math.random() - 0.5).slice(0, size)
}
