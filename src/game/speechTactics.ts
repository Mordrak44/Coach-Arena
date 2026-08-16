import type { EffectPrimitive } from './types'

// Consignes parlées au coin du ring — v0 : parseur local par mots-clés.
// Pendant la pause, le coach parle librement ; si une consigne est comprise,
// elle devient de vrais effets (primitives DSL), comme une carte invisible
// forgée par la parole. v1 : l'API Claude remplacera ce parseur (compréhension
// réelle du sens) et ce fichier restera le fallback hors-ligne.
//
// Règle d'équilibre : les consignes sont GRATUITES (pas de Souffle) mais
// volontairement plus faibles que les cartes, bornées (clampEffect à
// l'application) et limitées à une par pause. La parole est la ressource.

export interface Consigne {
  label: string
  effects: EffectPrimitive[]
}

interface Rule {
  re: RegExp
  label: string
  effect: EffectPrimitive
}

/** Nombre maximal de primitives comprises dans une même consigne. */
export const MAX_CONSIGNE_EFFECTS = 2

// Ordre = priorité : les consignes conditionnelles (« s'il sort son
// spécial… ») passent avant les mots isolés.
const RULES: Rule[] = [
  {
    re: /(sp[ée]cial|technique).{0,40}(esquive|[ée]vite|bloque|garde|gaffe|attention|pr[êe]t)|(attention|gaffe|m[ée]fie).{0,25}(sp[ée]cial|technique)/i,
    label: 'il a vu venir le spécial adverse',
    effect: { kind: 'halveEnemySpecial' },
  },
  {
    re: /pi[èe]ge|laisse[- ]?le venir|attends[- ]?le|cueille[- ]?le/i,
    label: 'piège tendu : contre renforcé (crie « contre ! »)',
    effect: { kind: 'armCounterMul', mul: 1.4 },
  },
  {
    re: /provoque|chauffe[- ]?le|[ée]nerve[- ]?le|nargue/i,
    label: "l'adversaire démarrera provoqué",
    effect: { kind: 'provoke', duration: 6 },
  },
  {
    // (?<!dernier ) : « dernier souffle » est du baroud d'honneur (règle
    // ci-dessous), pas une consigne de récupération — sans ce garde-fou,
    // les deux réglaient sur la même phrase et « dernier souffle » se
    // voyait accorder un soin gratuit à contresens (trouvé en audit,
    // 2026-08-16).
    re: /(?<!dernier )souffle|respire|r[ée]cup[èe]re|repose/i,
    label: 'récupération',
    effect: { kind: 'heal', pct: 0.05 },
  },
  {
    re: /garde haute|prot[èe]ge[- ]?toi|prudence|prudent|couvre[- ]?toi/i,
    label: 'garde haute',
    effect: { kind: 'damageReduction', mul: 0.88 },
  },
  {
    re: /jeu de jambes|mobile|l[ée]g[èe]re?t[ée]|insaisissable|danse autour/i,
    label: 'jeu de jambes',
    effect: { kind: 'dodgeBonus', add: 0.06 },
  },
  {
    re: /l[âa]che[- ]?toi|tout donner|donne tout|[àa] fond|explose[- ]?le/i,
    label: 'fureur en réserve (crie « attaque ! »)',
    effect: { kind: 'armAttackFrenzy', mul: 1.25, duration: 4 },
  },
  {
    re: /tout ou rien|jusqu'?au bout|dernier souffle|baroud/i,
    label: "baroud d'honneur",
    effect: { kind: 'lowHpHypeFull', threshold: 0.15 },
  },
  {
    re: /confiance|crois en toi|je crois en toi|t'?es capable|peur de rien/i,
    label: 'confiance',
    effect: { kind: 'hype', amount: 10 },
  },
]

/**
 * Analyse une phrase finale du coach pendant la pause. Retourne la consigne
 * comprise (max MAX_CONSIGNE_EFFECTS primitives, une par kind) ou null.
 */
export function parseConsigne(text: string): Consigne | null {
  if (text.trim().length < 6) return null
  const labels: string[] = []
  const effects: EffectPrimitive[] = []
  const kinds = new Set<string>()
  for (const r of RULES) {
    if (effects.length >= MAX_CONSIGNE_EFFECTS) break
    if (kinds.has(r.effect.kind) || !r.re.test(text)) continue
    labels.push(r.label)
    effects.push({ ...r.effect })
    kinds.add(r.effect.kind)
  }
  if (effects.length === 0) return null
  return { label: labels.join(' + '), effects }
}
