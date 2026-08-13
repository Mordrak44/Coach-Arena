import { useState } from 'react'
import type { CardId, Character } from '../game/types'
import { ROSTER, TRAIT_INFO, createFromPrompt } from '../game/characters'
import { CARD_POOL, DEFAULT_DECK, FAMILY_LABEL } from '../game/cards'

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
    </button>
  )
}

export default function CharacterSelect({
  onConfirm,
}: {
  onConfirm: (char: Character, deck: CardId[]) => void
}) {
  const [selected, setSelected] = useState<Character | null>(null)
  const [prompt, setPrompt] = useState('')
  const [custom, setCustom] = useState<Character | null>(null)
  const [deck, setDeck] = useState<CardId[]>(DEFAULT_DECK)

  const toggleCard = (id: CardId) => {
    setDeck(d =>
      d.includes(id) ? d.filter(x => x !== id) : d.length < 3 ? [...d, id] : d,
    )
  }

  const forge = () => {
    if (prompt.trim().length < 3) return
    const c = createFromPrompt(prompt.trim())
    setCustom(c)
    setSelected(c)
  }

  return (
    <div className="screen" style={{ justifyContent: 'flex-start' }}>
      <h1 className="logo" style={{ fontSize: '1.6rem' }}>
        Choisis ton champion
      </h1>

      <textarea
        className="promptBox"
        placeholder="…ou décris-le : « un vieux maître cyborg ultra rapide mais fragile, appelé Zenko »"
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
      />
      <button className="btn secondary" onClick={forge} disabled={prompt.trim().length < 3}>
        ⚒ Forger ce perso
      </button>

      <div className="roster">
        {custom && (
          <CharCard char={custom} selected={selected?.id === custom.id} onClick={() => setSelected(custom)} />
        )}
        {ROSTER.map(c => (
          <CharCard key={c.id} char={c} selected={selected?.id === c.id} onClick={() => setSelected(c)} />
        ))}
      </div>

      <h2 style={{ fontSize: '1rem', fontWeight: 900, textTransform: 'uppercase', color: 'var(--accent)' }}>
        🃏 Ton Carnet du Coach ({deck.length}/3)
      </h2>
      <p className="permNote">
        3 cartes, jouables une par une au coin du ring entre les rounds.
      </p>
      <div className="roster">
        {CARD_POOL.map(c => (
          <button
            key={c.id}
            className={`charCard${deck.includes(c.id) ? ' selected' : ''}`}
            onClick={() => toggleCard(c.id)}
          >
            <div className="cname">
              {c.icon} {c.name}
            </div>
            <div className="ctitle">{FAMILY_LABEL[c.family]}</div>
            <div style={{ fontSize: '0.7rem', marginTop: 4, color: 'var(--muted)' }}>{c.desc}</div>
          </button>
        ))}
      </div>

      <button
        className="btn"
        disabled={!selected || deck.length !== 3}
        onClick={() => selected && onConfirm(selected, deck)}
      >
        {!selected
          ? 'Sélectionne un perso'
          : deck.length !== 3
            ? `Choisis ${3 - deck.length} carte(s)`
            : `Coacher ${selected.name} !`}
      </button>
    </div>
  )
}
