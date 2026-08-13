import { useState } from 'react'
import type { Character } from '../game/types'
import { ROSTER, createFromPrompt } from '../game/characters'

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
    </button>
  )
}

export default function CharacterSelect({
  onConfirm,
}: {
  onConfirm: (char: Character) => void
}) {
  const [selected, setSelected] = useState<Character | null>(null)
  const [prompt, setPrompt] = useState('')
  const [custom, setCustom] = useState<Character | null>(null)

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

      <button className="btn" disabled={!selected} onClick={() => selected && onConfirm(selected)}>
        {selected ? `Coacher ${selected.name} !` : 'Sélectionne un perso'}
      </button>
    </div>
  )
}
