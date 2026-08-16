import type { Character, CombatEvent, MatchState } from './types'

// Le Réalisateur — transforme un match joué en plans de scènes cinématiques :
// il détecte les moments forts depuis les événements du combat et écrit les
// prompts vidéo (anglais, i2v avec la planche de référence du perso) prêts
// pour Kling. Utilisé aujourd'hui pour exporter les prompts sur l'écran de
// résultats ; demain, la file de génération asynchrone les consommera
// directement (backend). Économie : entrée + 1-2 moments forts + finale =
// le budget de 45-75 crédits documenté au design doc ; la finale seule =
// le palier « clip héroïque ».

export interface ScenePlan {
  id: string
  /** libellé FR affiché dans l'UI */
  title: string
  /** prompt vidéo EN prêt pour Kling (image-to-video avec la planche du perso) */
  prompt: string
  /** persos dont la planche de référence sert d'image d'entrée */
  refChars: string[]
}

const ARCHETYPE_LOOK: Record<Character['archetype'], string> = {
  brawler: 'a broad-shouldered young brawler with bandaged fists and a huge grin',
  rival: 'a brooding rival fighter with dark hair falling over sharp eyes',
  prodigy: 'a focused prodigy fighter with a high ponytail and precise stance',
  veteran: 'a massive scarred veteran fighter with a beard and an iron guard',
  beast: 'a feral beast-like fighter with wild hair, animal ears and a tail',
  trickster: 'a slender elusive trickster with a long trailing scarf',
}

/** Convertit une couleur hex en mot de couleur (les prompts vidéo lisent mal les hex). */
export function colorWord(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return 'vivid'
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max < 60) return 'black'
  if (min > 200) return 'white'
  if (max - min < 30) return 'grey'
  const h =
    max === r
      ? ((g - b) / (max - min) + 6) % 6
      : max === g
        ? (b - r) / (max - min) + 2
        : (r - g) / (max - min) + 4
  const hue = h * 60
  if (hue < 20 || hue >= 330) return 'red'
  if (hue < 45) return 'orange'
  if (hue < 70) return 'yellow'
  if (hue < 160) return 'green'
  if (hue < 200) return 'teal'
  if (hue < 260) return 'blue'
  if (hue < 300) return 'purple'
  return 'pink'
}

function look(c: Character): string {
  return `${c.name}, ${ARCHETYPE_LOOK[c.archetype]}, wearing ${colorWord(c.color)} and ${colorWord(c.color2)}`
}

const STYLE =
  '2D anime style, bold shōnen manga action, thick lines, speed lines, dramatic rim lighting, packed roaring arena crowd, vertical 9:16 composition'

/** Note d'un événement pour l'élection du moment fort d'un round. */
function eventScore(e: CombatEvent): number {
  switch (e.kind) {
    case 'ulti':
      return 10
    case 'special':
      return 6
    case 'countered':
      return 4
    case 'hit':
      return e.crit ? 3 : 0
    // hypeFull n'a pas de cas dans momentPrompt (rien de filmable : « la
    // jauge se remplit » n'est pas un plan) — lui donner un score > 0
    // le ferait gagner l'élection d'un round sans jamais produire de
    // prompt, perdant silencieusement ce créneau de moment fort
    // (trouvé en audit, 2026-08-16). Voir cutPlanner.ts : même choix.
    default:
      return 0
  }
}

function momentPrompt(e: CombatEvent, player: Character, enemy: Character): string | null {
  const byChar = (side: 'player' | 'enemy') => (side === 'player' ? player : enemy)
  const foeOf = (side: 'player' | 'enemy') => (side === 'player' ? enemy : player)
  switch (e.kind) {
    case 'ulti': {
      const a = byChar(e.by)
      return `${look(a)} unleashes the ultimate technique "${a.ulti.name}": a screen-filling explosion of ${colorWord(a.color)} energy engulfs the ring, the opponent is blasted backwards in slow motion, onomatopoeia "${a.ulti.onomatopoeia}" bursts across the screen. ${STYLE}`
    }
    case 'special': {
      const a = byChar(e.by)
      return `${look(a)} charges up and lands the signature move "${a.special.name}" on ${foeOf(e.by).name}, a devastating strike with a shockwave and flying sweat drops, giant onomatopoeia "${a.special.onomatopoeia}". ${STYLE}`
    }
    case 'countered': {
      const d = byChar(e.by)
      return `${look(d)} reads the incoming attack perfectly and reverses it with a lightning counter, time freezes for an instant then the counter lands, the crowd erupts. ${STYLE}`
    }
    case 'hit':
      return e.crit
        ? `A devastating critical blow connects in extreme close-up, the frame shakes, giant onomatopoeia "${'onoma' in e ? e.onoma : 'DOKAN!!'}" slams across the screen. ${STYLE}`
        : null
    default:
      return null
  }
}

/**
 * Construit les plans de scènes d'un match TERMINÉ : entrée, top moments
 * (au plus `maxMoments`, le meilleur par round), finale.
 */
export function buildScenePlans(
  m: MatchState,
  player: Character,
  enemy: Character,
  maxMoments = 2,
): ScenePlan[] {
  const plans: ScenePlan[] = [
    {
      id: 'entrance',
      title: 'Entrée dans l’arène',
      prompt: `${look(player)} and ${look(enemy)} walk toward each other in a packed fighting arena at night, spotlights sweeping, they stop for an intense staredown, sparks of rivalry between their eyes. ${STYLE}`,
      refChars: [player.id, enemy.id],
    },
  ]

  // Meilleur moment de chaque round, puis on garde les `maxMoments` mieux notés.
  interface Cand {
    round: number
    score: number
    e: CombatEvent
  }
  const best: Cand[] = []
  let round = 1
  let cur: Cand | null = null
  for (const e of m.events) {
    if (e.kind === 'roundStart') {
      round = e.round
      continue
    }
    if (e.kind === 'roundEnd') {
      if (cur) best.push(cur)
      cur = null
      continue
    }
    const s = eventScore(e)
    if (s > 0 && (!cur || s > cur.score)) cur = { round, score: s, e }
  }
  if (cur) best.push(cur)
  best.sort((a, b) => b.score - a.score)
  for (const c of best.slice(0, maxMoments).sort((a, b) => a.round - b.round)) {
    const prompt = momentPrompt(c.e, player, enemy)
    if (prompt) {
      // 'hit' n'a pas de champ `by`, seulement `target` (qui ENCAISSE) —
      // l'attaquant est donc l'AUTRE côté. `'by' in c.e` valait toujours
      // faux pour un crit et retombait sur `player` même quand c'est
      // l'ennemi qui avait frappé : la mauvaise planche de référence
      // partait en génération payante (trouvé en audit, 2026-08-16).
      const by = ((): Character => {
        switch (c.e.kind) {
          case 'hit':
            return c.e.target === 'player' ? enemy : player
          case 'ulti':
          case 'special':
          case 'countered':
            return c.e.by === 'enemy' ? enemy : player
          default:
            return player
        }
      })()
      plans.push({
        id: `round${c.round}-highlight`,
        title: `Moment fort du round ${c.round}`,
        prompt,
        refChars: [by.id],
      })
    }
  }

  const winner = m.playerWins >= 2 ? player : enemy
  const loser = winner === player ? enemy : player
  plans.push({
    id: 'finale',
    title: 'La finale (clip héroïque)',
    prompt: `${look(winner)} lands the final decisive blow on ${loser.name} in dramatic slow motion, the loser collapses as the screen cracks with impact lines, then ${winner.name} raises a fist to the sky while the crowd explodes, confetti and camera flashes. ${STYLE}`,
    refChars: [winner.id],
  })
  return plans
}
