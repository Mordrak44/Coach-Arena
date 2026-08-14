import { useState } from 'react'
import type { CardId, Character } from '../game/types'
import { ROSTER, TRAIT_INFO, createFromPrompt } from '../game/characters'
import {
  CARD_POOL,
  DEFAULT_DECK,
  FAMILY_LABEL,
  SIGNATURE_BOND_LEVEL,
  SIGNATURE_CARDS,
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
  const [deck, setDeck] = useState<CardId[]>(DEFAULT_DECK)

  const toggleCard = (id: CardId) => {
    setDeck(d =>
      d.includes(id) ? d.filter(x => x !== id) : d.length < 3 ? [...d, id] : d,
    )
  }

  // Carte signature du perso sélectionné (visible verrouillée tant que le
  // Lien est insuffisant — on montre la carotte).
  const signature = selected ? SIGNATURE_CARDS.find(c => c.signatureOf === selected.id) : undefined
  const signatureUnlocked =
    !!selected && !!signature && bondLevel(getProgress(selected.id).wins) >= SIGNATURE_BOND_LEVEL

  const pickChar = (c: Character) => {
    setSelected(c)
    // Une signature d'un autre perso ne peut pas rester dans le carnet.
    setDeck(d =>
      d.filter(id => {
        const card = SIGNATURE_CARDS.find(s => s.id === id)
        return !card || card.signatureOf === c.id
      }),
    )
  }

  const forge = () => {
    if (prompt.trim().length < 3) return
    const c = createFromPrompt(prompt.trim())
    saveCustom(c) // le perso survivra aux sessions (et gardera son Lien)
    setCustoms(loadCustoms())
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
        {customs.map(c => (
          <CharCard key={c.id} char={c} selected={selected?.id === c.id} onClick={() => pickChar(c)} />
        ))}
        {ROSTER.map(c => (
          <CharCard key={c.id} char={c} selected={selected?.id === c.id} onClick={() => pickChar(c)} />
        ))}
      </div>

      <h2 style={{ fontSize: '1rem', fontWeight: 900, textTransform: 'uppercase', color: 'var(--accent)' }}>
        🃏 Ton Carnet du Coach ({deck.length}/3)
      </h2>
      <p className="permNote">
        3 cartes, jouables une par une au coin du ring entre les rounds.
      </p>
      <div className="roster">
        {signature && (
          <button
            key={signature.id}
            className={`charCard${deck.includes(signature.id) ? ' selected' : ''}`}
            disabled={!signatureUnlocked}
            style={
              signatureUnlocked
                ? { borderColor: '#fd79a8' }
                : { opacity: 0.55, cursor: 'default' }
            }
            onClick={() => signatureUnlocked && toggleCard(signature.id)}
          >
            <div className="cname" style={{ color: '#fd79a8' }}>
              {signatureUnlocked ? signature.icon : '🔒'} {signature.name}
            </div>
            <div className="ctitle">Signature · {FAMILY_LABEL[signature.family]}</div>
            <div style={{ fontSize: '0.7rem', marginTop: 4, color: 'var(--muted)' }}>
              {signatureUnlocked
                ? signature.desc
                : `Se débloque au Lien niv. ${SIGNATURE_BOND_LEVEL} (« Protégé ») avec ${selected?.name}.`}
            </div>
          </button>
        )}
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
