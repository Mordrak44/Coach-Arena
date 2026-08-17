import type { CardId, Character } from './types'
import { ROSTER } from './characters'

// Le Mode Histoire — « Le Grand Hurlement », tournoi où les coachs crient
// plus fort que les poings. 8 chapitres, adversaires dédiés à difficulté
// croissante, équipes en fin d'arc, progression persistée. v0 : narration
// texte + matchs arcade ; les cinématiques pré-générées (une fois pour tous
// les joueurs) se brancheront chapitre par chapitre en v1.

export interface StoryChapter {
  id: string
  num: number
  title: string
  /** narration d'avant-match (voix du narrateur shōnen) */
  intro: string
  /** réplique de l'adversaire au Vestiaire */
  taunt: string
  /** id roster de l'adversaire (ses stats sont multipliées par scale) */
  opponentId: string
  /** équipiers adverses (ids roster) — la relève IA s'en sert */
  opponentTeamIds: string[]
  /** multiplicateur de puissance (atk/def/spd bornés à 12, PV libres) */
  scale: number
  /** texte de victoire */
  outro: string
}

export const STORY_CHAPTERS: StoryChapter[] = [
  {
    id: 'ch1',
    num: 1,
    title: 'Le gong d’ouverture',
    intro:
      'Le Grand Hurlement, le tournoi où les coachs comptent autant que les poings, ouvre ses portes. Ta voix n’a encore jamais fait trembler une salle. Ce soir, ça commence.',
    taunt: '« Un coach débutant ? La foule va s’ennuyer… »',
    opponentId: 'kenta',
    opponentTeamIds: [],
    scale: 0.85,
    outro: 'Premier gong, première victoire. La salle a entendu ta voix. Elle s’en souviendra.',
  },
  {
    id: 'ch2',
    num: 2,
    title: 'L’ombre du rival',
    intro:
      'Il t’observait depuis les gradins. Rei ne sourit jamais — son coach non plus. Leur silence est une stratégie : ils comptent sur tes erreurs.',
    taunt: '« Crie tant que tu veux. Ton perso n’écoute que sa peur. »',
    opponentId: 'rei',
    opponentTeamIds: [],
    scale: 0.95,
    outro: 'Rei s’incline, imperceptiblement. De sa part, c’est un hurlement de respect.',
  },
  {
    id: 'ch3',
    num: 3,
    title: 'Mille lames, un murmure',
    intro:
      'Yuna ne se bat pas : elle résout. Son coach chuchote — et chaque murmure est un ordre parfait. Contre eux, hurler ne suffira pas. Il faudra hurler JUSTE.',
    taunt: '« Ton volume est impressionnant. Ta précision, moins. »',
    opponentId: 'yuna',
    opponentTeamIds: [],
    scale: 1.0,
    outro: 'Yuna range ses lames. « Précis, » murmure-t-elle. Venant d’elle, c’est un trophée.',
  },
  {
    id: 'ch4',
    num: 4,
    title: 'Le Dernier Rempart',
    intro:
      'Gorō a survécu à cent tournois. Son coach est mort l’an dernier — il coache seul, de mémoire. Le battre, c’est affronter deux générations de ring.',
    taunt: '« Petit, j’encaissais déjà des ultis avant ta naissance. »',
    opponentId: 'goro',
    opponentTeamIds: [],
    scale: 1.08,
    outro: 'Gorō pose sa garde et te salue. « Il aurait aimé ta voix, » dit-il en regardant le ciel.',
  },
  {
    id: 'ch5',
    num: 5,
    title: 'La meute',
    intro:
      'Fang ne monte jamais seule : sa meute rôde dans son coin. Premier match d’équipe du tournoi — leur relève est sauvage, la tienne a intérêt à être prête.',
    taunt: '« GRAOU. (Traduction du coin adverse : tu vas y passer.) »',
    opponentId: 'fang',
    opponentTeamIds: ['kenta'],
    scale: 1.12,
    outro: 'La meute s’incline devant l’alpha du soir : toi. Enfin, ton perso. Enfin… vous deux.',
  },
  {
    id: 'ch6',
    num: 6,
    title: 'La valse des reflets',
    intro:
      'Nyx et son double — personne ne sait lequel des deux combat. Leur coach non plus, dit-on. Demi-finale : les illusions montent sur le ring par paire.',
    taunt: '« Lequel de nous frappes-tu ? Mauvaise réponse. »',
    opponentId: 'nyx',
    opponentTeamIds: ['rei'],
    scale: 1.18,
    outro: 'Le reflet se dissipe. Nyx applaudit lentement, quelque part dans l’ombre.',
  },
  {
    id: 'ch7',
    num: 7,
    title: 'Le mur de trois',
    intro:
      'La finale des coins : trois combattants, un seul ring. Le coach adverse joue sa réserve comme un jeu de cartes. Ta gestion du Souffle décidera de tout.',
    taunt: '« Mon banc est plus fort que ton ring. »',
    opponentId: 'goro',
    opponentTeamIds: ['yuna', 'fang'],
    scale: 1.22,
    outro: 'Le mur tombe, pierre par pierre. La foule scande un nom : celui de TON perso.',
  },
  {
    id: 'ch8',
    num: 8,
    title: 'Seiran, le Coach Muet',
    intro:
      'On raconte que Seiran a perdu sa voix à force de hurler. Son champion combat guidé par des gestes seuls — et il n’a jamais perdu. Le Grand Hurlement s’achève ce soir : sa légende contre ta voix.',
    taunt: '« … » (Son silence pèse plus lourd qu’un cri.)',
    opponentId: 'prodigy-final',
    opponentTeamIds: ['nyx', 'goro'],
    scale: 1.3,
    outro:
      'Le champion muet s’effondre. Seiran articule un mot, le premier depuis des années : « …bravo. » Le Grand Hurlement a un nouveau nom au palmarès — le tien, coach.',
  },
]

/** Champion final : une variante dédiée, pas un simple perso du roster. */
const FINAL_BOSS: Character = {
  id: 'prodigy-final',
  name: 'Shion',
  title: 'Le Champion Muet',
  archetype: 'prodigy',
  color: '#dfe6e9',
  color2: '#6c5ce7',
  stats: { atk: 8, def: 8, spd: 9, hrt: 10, hp: 92 },
  special: { name: 'Kata du Silence', power: 2.3, onomatopoeia: 'SHHH…BAM!!' },
  ulti: { name: 'Dernier Mot', power: 2.6, onomatopoeia: 'KOTODAMA!!!' },
  trait: 'cerebral',
  lore: 'Il n’a jamais entendu la voix de son coach. Il n’en a jamais eu besoin.',
}

function baseChar(id: string): Character {
  if (id === FINAL_BOSS.id) return FINAL_BOSS
  return ROSTER.find(c => c.id === id) ?? ROSTER[0]
}

/** Adversaire d'un chapitre : perso de base × scale (stats bornées à 12). */
export function chapterOpponent(ch: StoryChapter): Character {
  const b = baseChar(ch.opponentId)
  const s = ch.scale
  const cap = (v: number) => Math.max(1, Math.min(12, Math.round(v * s)))
  return {
    ...b,
    id: `story-${ch.id}-${b.id}`,
    stats: {
      atk: cap(b.stats.atk),
      def: cap(b.stats.def),
      spd: cap(b.stats.spd),
      hrt: cap(b.stats.hrt),
      hp: Math.max(40, Math.round(b.stats.hp * s)),
    },
    lore: ch.taunt,
  }
}

export function chapterOpponentTeam(ch: StoryChapter): Character[] {
  return ch.opponentTeamIds.map(id => {
    const c = chapterOpponent({ ...ch, opponentId: id })
    return { ...c, id: `${c.id}-bench` }
  })
}

// --- Decks adverses thématiques ---------------------------------------------
// Chaque chapitre a une personnalité de coin : le deck adverse raconte le
// même personnage que le ring. 2 copies de chaque carte listée.

const CHAPTER_DECKS: Record<string, CardId[]> = {
  ch1: ['massage', 'focus', 'secondWind'], // débutant : soins simples
  ch2: ['coldShower', 'provocation', 'focus', 'perfectCounter'], // le rival humilie
  ch3: ['coldBlood', 'cornerSilence', 'coldShower', 'fortress', 'focus'], // Yuna : contrôle
  ch4: ['ironGuard', 'steelSkin', 'secondWind', 'massage', 'fortress'], // Gorō : le mur
  ch5: ['adrenaline', 'sigFang', 'warCry', 'verbalUppercut', 'provocation'], // la meute : aggro
  ch6: ['smokeScreen', 'ambush', 'perfectCounter', 'coldShower', 'lastChance'], // Nyx : illusions
  ch7: ['breathTheft', 'cornerSilence', 'championTax', 'embargo', 'secondWind'], // guerre des coins
  ch8: ['embargo', 'coldBlood', 'fortress', 'lastStand', 'totalCounter', 'secondWind'], // le champion complet
}

/** Deck du coin adverse pour un chapitre (2 copies par carte listée). */
export function chapterEnemyDeck(ch: StoryChapter): CardId[] {
  const list = CHAPTER_DECKS[ch.id] ?? []
  return list.flatMap(id => [id, id])
}

// --- Progression persistée ---------------------------------------------------

const KEY = 'coach-arena-story-v1'
// try/catch, pas juste typeof : certains modes de confidentialité stricts
// font planter la LECTURE de la propriété localStorage elle-même (pas
// seulement ses méthodes) avec une SecurityError, et typeof ne protège pas
// contre un getter qui jette.
const hasStorage = (() => {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
})()

export function loadCleared(): Set<string> {
  if (!hasStorage) return new Set()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    // JSON.parse('"oops"') donne la CHAÎNE "oops" — itérable en JS (une
    // chaîne s'itère caractère par caractère), donc `new Set(parsed)` ne
    // plante PAS pour ce cas (contrairement à un nombre ou un objet) : ça
    // aurait silencieusement pollué le Set de caractères isolés au lieu de
    // repartir d'une progression vide (trouvé en écrivant les tests de
    // couverture, 2026-08-16 — même classe de bug que deckBuilder.ts).
    return new Set(Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

export function markCleared(id: string): void {
  if (!hasStorage) return
  try {
    const s = loadCleared()
    s.add(id)
    localStorage.setItem(KEY, JSON.stringify([...s]))
  } catch {
    /* stockage indisponible */
  }
}

/** Un chapitre est jouable si le précédent est vaincu (le 1er, toujours). */
export function isUnlocked(ch: StoryChapter, cleared: Set<string>): boolean {
  const idx = STORY_CHAPTERS.findIndex(c => c.id === ch.id)
  if (idx < 0) return false // chapitre inconnu : par défaut verrouillé, jamais un crash
  return idx === 0 || cleared.has(STORY_CHAPTERS[idx - 1].id)
}

export function storyProgress(cleared: Set<string>): { done: number; total: number } {
  return {
    done: STORY_CHAPTERS.filter(c => cleared.has(c.id)).length,
    total: STORY_CHAPTERS.length,
  }
}
