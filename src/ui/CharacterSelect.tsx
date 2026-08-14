import { useState, type CSSProperties } from 'react'
import type { CardId, Character } from '../game/types'
import { ROSTER, TRAIT_INFO, createFromPrompt } from '../game/characters'
import {
  CARD_POOL,
  DECK_COPIES,
  TIMING_LABEL,
  SIGNATURE_BOND_LEVEL,
  SIGNATURE_CARDS,
  buildStarterDeck,
} from '../game/cards'
import { bondLevel, bondTitle, getProgress, loadCustoms, saveCustom } from '../game/progression'

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="statRow">
      <span style={{ width: 28 }}>{label}</span>
      <div className="bar">
        <i style={{ width: `${(value / 12) * 100}%`, background: color }} />
      </div>
    </div>
  )
}

export function CharCard({
  char,
  selected,
  onClick,
}: {
  char: Character
  selected: boolean
  onClick: () => void
}) {
  return (
    <button className={`charCard${selected ? ' selected' : ''}`} onClick={onClick}>
      <div className="cname" style={{ color: char.color }}>
        {char.name}
      </div>
      <div className="ctitle">{char.title}</div>
      <StatBar label="ATK" value={char.stats.atk} color="#ff5a36" />
      <StatBar label="DEF" value={char.stats.def} color="#74b9ff" />
      <StatBar label="SPD" value={char.stats.spd} color="#ffd166" />
      <StatBar label="❤" value={char.stats.hrt} color="#fd79a8" />
      <div style={{ fontSize: '0.68rem', marginTop: 5, color: 'var(--accent)' }}>
        {TRAIT_INFO[char.trait].icon} <b>{TRAIT_INFO[char.trait].label}</b>
        <span style={{ color: 'var(--muted)' }}> — {TRAIT_INFO[char.trait].hint}</span>
      </div>
      <BondLine charId={char.id} />
    </button>
  )
}

function BondLine({ charId }: { charId: string }) {
  const p = getProgress(charId)
  const level = bondLevel(p.wins)
  if (p.wins === 0 && p.losses === 0) return null
  return (
    <div style={{ fontSize: '0.66rem', marginTop: 3, color: '#fd79a8' }}>
      💞 Lien niv. {level} · {bondTitle(level)} · {p.wins}V/{p.losses}D
    </div>
  )
}

export default function CharacterSelect({
  onConfirm,
}: {
  onConfirm: (char: Character, deck: CardId[]) => void
}) {
  const [selected, setSelected] = useState<Character | null>(null)
  const [prompt, setPrompt] = useState('')
  const [customs, setCustoms] = useState<Character[]>(() => loadCustoms())
  const [creationMode, setCreationMode] = useState<'guided' | 'expert'>('guided')
  const [gStyle, setGStyle] = useState<string | null>(null)
  const [gTemper, setGTemper] = useState<string | null>(null)
  const [gWorld, setGWorld] = useState<string | null>(null)
  const [gName, setGName] = useState('')

  // Carte signature du perso sélectionné (visible verrouillée tant que le
  // Lien est insuffisant — on montre la carotte).
  const signature = selected ? SIGNATURE_CARDS.find(c => c.signatureOf === selected.id) : undefined
  const signatureUnlocked =
    !!selected && !!signature && bondLevel(getProgress(selected.id).wins) >= SIGNATURE_BOND_LEVEL

  const pickChar = (c: Character) => setSelected(c)

  // Deck de départ auto-construit (le deck-builder complet viendra en v1).
  const deck: CardId[] = buildStarterDeck(signatureUnlocked && signature ? signature.id : null)

  const forge = () => {
    if (prompt.trim().length < 3) return
    forgeFromPrompt(prompt.trim())
  }

  const forgeFromPrompt = (p: string) => {
    const c = createFromPrompt(p)
    saveCustom(c) // le perso survivra aux sessions (et gardera son Lien)
    setCustoms(loadCustoms())
    setSelected(c)
  }

  // Onboarding guidé : 3 questions composent le prompt à la place du joueur.
  const GUIDED = {
    style: [
      { label: '👊 Fonceur', words: 'un combattant fort et puissant comme une brute' },
      { label: '⚡ Rapide', words: 'un combattant ultra rapide comme l’éclair, un ninja' },
      { label: '🧱 Mur', words: 'un combattant tank blindé, un mur défensif' },
      { label: '🎭 Malin', words: 'un combattant vif et insaisissable' },
    ],
    temper: [
      { label: '🔥 Fougueux', words: 'sauvage et furieux, une vraie bête de rage' },
      { label: '🧊 Calme', words: 'calme, sage et précis comme un maître stratège' },
      { label: '🪨 Rebelle', words: 'têtu, fier et solitaire, un rival rebelle' },
      { label: '💞 Loyal', words: 'loyal, fidèle et gentil, un grand cœur' },
    ],
    world: [
      { label: '🌋 Feu', words: 'né du feu et des flammes' },
      { label: '❄️ Glace', words: 'né de la glace et du froid' },
      { label: '🌑 Ombre', words: 'né des ténèbres et de l’ombre' },
      { label: '✨ Lumière', words: 'né de la lumière sacrée' },
      { label: '🐺 Bête', words: 'mi-humain mi-animal, un fauve, un loup' },
      { label: '🤖 Cyborg', words: "mi-machine, un cyborg d'acier" },
    ],
  }

  const forgeGuided = () => {
    if (!gStyle || !gTemper || !gWorld) return
    const name = gName.trim()
    const p =
      `${gStyle}, ${gTemper}, ${gWorld}` + (name ? `, appelé ${name.charAt(0).toUpperCase() + name.slice(1)}` : '')
    forgeFromPrompt(p)
  }

  const chip = (active: boolean): CSSProperties => ({
    font: 'inherit',
    fontSize: '0.72rem',
    fontWeight: 700,
    padding: '7px 10px',
    borderRadius: 10,
    border: active ? '2px solid var(--accent)' : '2px solid transparent',
    background: 'var(--panel2)',
    color: 'var(--text)',
    cursor: 'pointer',
  })

  return (
    <div className="screen" style={{ justifyContent: 'flex-start' }}>
      <h1 className="logo" style={{ fontSize: '1.6rem' }}>
        Choisis ton champion
      </h1>

      <div style={{ display: 'flex', gap: 8, alignSelf: 'stretch' }}>
        <button
          style={{ ...chip(creationMode === 'guided'), flex: 1 }}
          onClick={() => setCreationMode('guided')}
        >
          ✨ Créer en 3 questions
        </button>
        <button
          style={{ ...chip(creationMode === 'expert'), flex: 1 }}
          onClick={() => setCreationMode('expert')}
        >
          ✍️ Mode expert
        </button>
      </div>

      {creationMode === 'guided' ? (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--muted)' }}>1. SON STYLE ?</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {GUIDED.style.map(o => (
              <button key={o.label} style={chip(gStyle === o.words)} onClick={() => setGStyle(o.words)}>
                {o.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--muted)' }}>2. SON TEMPÉRAMENT ?</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {GUIDED.temper.map(o => (
              <button key={o.label} style={chip(gTemper === o.words)} onClick={() => setGTemper(o.words)}>
                {o.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--muted)' }}>3. SON UNIVERS ?</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {GUIDED.world.map(o => (
              <button key={o.label} style={chip(gWorld === o.words)} onClick={() => setGWorld(o.words)}>
                {o.label}
              </button>
            ))}
          </div>
          <input
            className="promptBox"
            style={{ minHeight: 0, padding: '9px 12px' }}
            placeholder="Son nom (optionnel — sinon on l'invente)"
            value={gName}
            maxLength={14}
            onChange={e => setGName(e.target.value)}
          />
          <button
            className="btn secondary"
            onClick={forgeGuided}
            disabled={!gStyle || !gTemper || !gWorld}
          >
            ⚒ Donner vie à ce perso
          </button>
        </div>
      ) : (
        <>
          <textarea
            className="promptBox"
            placeholder="Décris-le librement : « un vieux maître cyborg ultra rapide mais fragile, appelé Zenko »"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
          />
          <button className="btn secondary" onClick={forge} disabled={prompt.trim().length < 3}>
            ⚒ Forger ce perso
          </button>
        </>
      )}

      <div className="roster">
        {customs.map(c => (
          <CharCard key={c.id} char={c} selected={selected?.id === c.id} onClick={() => pickChar(c)} />
        ))}
        {ROSTER.map(c => (
          <CharCard key={c.id} char={c} selected={selected?.id === c.id} onClick={() => pickChar(c)} />
        ))}
      </div>

      <h2 style={{ fontSize: '1rem', fontWeight: 900, textTransform: 'uppercase', color: 'var(--accent)' }}>
        🃏 Ton Deck de Coach ({deck.length} cartes)
      </h2>
      <p className="permNote">
        Tu pioches 5 cartes ; à chaque pause : 3 points de Souffle à dépenser et un échange
        possible. Deck de départ auto ({DECK_COPIES} copies par carte) — le deck-builder arrive.
      </p>
      <div className="roster">
        {signature && (
          <div
            key={signature.id}
            className="charCard"
            style={
              signatureUnlocked ? { borderColor: '#fd79a8' } : { opacity: 0.55 }
            }
          >
            <div className="cname" style={{ color: '#fd79a8' }}>
              {signatureUnlocked ? signature.icon : '🔒'} {signature.name}
            </div>
            <div className="ctitle">Signature · {TIMING_LABEL[signature.timing]}</div>
            <div style={{ fontSize: '0.7rem', marginTop: 4, color: 'var(--muted)' }}>
              {signatureUnlocked
                ? signature.desc
                : `Se débloque au Lien niv. ${SIGNATURE_BOND_LEVEL} (« Protégé ») avec ${selected?.name}.`}
            </div>
          </div>
        )}
        {CARD_POOL.map(c => (
          <div key={c.id} className="charCard">
            <div className="cname">
              {c.icon} {c.name} <span style={{ color: 'var(--violet)' }}>{'●'.repeat(c.cost)}</span>
            </div>
            <div className="ctitle">{TIMING_LABEL[c.timing]}</div>
            <div style={{ fontSize: '0.7rem', marginTop: 4, color: 'var(--muted)' }}>{c.desc}</div>
          </div>
        ))}
      </div>

      <button
        className="btn"
        disabled={!selected}
        onClick={() => selected && onConfirm(selected, deck)}
      >
        {!selected ? 'Sélectionne un perso' : `Coacher ${selected.name} !`}
      </button>
    </div>
  )
}
