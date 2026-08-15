import { useState, type CSSProperties } from 'react'
import type { CardId, Character } from '../game/types'
import { ROSTER, TRAIT_INFO, createFromPrompt } from '../game/characters'
import {
  CARD_POOL,
  TIMING_LABEL,
  SIGNATURE_BOND_LEVEL,
  SIGNATURE_CARDS,
  getCard,
} from '../game/cards'
import {
  bondLevelFor,
  bondTitle,
  claimReward,
  getExtraCopies,
  getProgress,
  loadCustoms,
  pendingReward,
  saveCustom,
} from '../game/progression'
import {
  ACTIONS_PER_DAY,
  desireText,
  doStableAction,
  getStable,
  moodInfo,
  type StableAction,
} from '../game/stable'
import { forgeCard, loadForgedCards, saveForgedCard } from '../game/cardForge'
import type { CoachCard } from '../game/types'
import {
  DECK_MAX,
  DECK_MIN,
  MAX_COPIES,
  buildDeckFromTemplate,
  defaultTemplate,
  loadTemplate,
  saveTemplate,
  templateSize,
  templateValid,
  type DeckTemplate,
} from '../game/deckBuilder'

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
  const level = bondLevelFor(charId)
  if (p.wins === 0 && p.losses === 0 && level === 0) return null
  return (
    <div style={{ fontSize: '0.66rem', marginTop: 3, color: '#fd79a8' }}>
      💞 Lien niv. {level} · {bondTitle(level)} · {p.wins}V/{p.losses}D
    </div>
  )
}

export default function CharacterSelect({
  onConfirm,
}: {
  onConfirm: (char: Character, deck: CardId[], team: Character[]) => void
}) {
  const [selected, setSelected] = useState<Character | null>(null)
  /** l'Écurie en match : jusqu'à 2 équipiers de relève */
  const [teammates, setTeammates] = useState<Character[]>([])
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
    !!selected && !!signature && bondLevelFor(selected.id) >= SIGNATURE_BOND_LEVEL

  const pickChar = (c: Character) => setSelected(c)

  // Récompense de palier de Lien : « choisis 1 carte parmi 2 »
  const reward = selected ? pendingReward(selected.id) : null
  const onClaimReward = (cardId: CardId) => {
    if (!selected) return
    if (claimReward(selected.id, cardId)) setStableVersion(v => v + 1)
  }

  // Vie d'Écurie du perso sélectionné
  const [stableMsg, setStableMsg] = useState('')
  const [stableVersion, setStableVersion] = useState(0)
  const stable = selected ? getStable(selected.id, selected.trait) : null
  void stableVersion

  const onStableAction = (action: StableAction, stat?: 'atk' | 'def' | 'spd') => {
    if (!selected) return
    const r = doStableAction(selected.id, selected.trait, action, stat)
    setStableMsg(r.message)
    setStableVersion(v => v + 1)
  }

  // Forge de cartes par prompt
  const [forged, setForged] = useState<CoachCard[]>(() => loadForgedCards())
  const [forgePrompt, setForgePrompt] = useState('')
  const [forgeMsg, setForgeMsg] = useState('')

  const onForgeCard = () => {
    const r = forgeCard(forgePrompt.trim())
    if (!r) {
      setForgeMsg(
        "Aucun effet reconnu — essaie des mots comme : soigne, motive, sabote, bouclier, esquive, contre, rage, provoque, encaisse…",
      )
      return
    }
    saveForgedCard(r.card)
    setForged(loadForgedCards())
    setForgeMsg(
      `⚒ « ${r.card.name} » forgée (${r.matched} effet${r.matched > 1 ? 's' : ''}, coût ${r.card.cost}) — ajoutée à ton deck !`,
    )
    setForgePrompt('')
  }

  // Deck-builder : modèle configurable + ajouts mérités (signature, paliers, forge).
  const [template, setTemplate] = useState<DeckTemplate>(() => loadTemplate())
  const setCopies = (id: CardId, delta: number) => {
    setTemplate(t => {
      const next = { ...t, [id]: Math.max(0, Math.min(MAX_COPIES, (t[id] ?? 0) + delta)) }
      saveTemplate(next)
      return next
    })
  }
  const tplSize = templateSize(template)
  const tplValid = templateValid(template)

  const deck: CardId[] = buildDeckFromTemplate(
    template,
    signatureUnlocked && signature ? signature.id : null,
    selected ? getExtraCopies(selected.id) : [],
    forged,
  )

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

      {selected && (
        <div
          style={{
            width: '100%',
            background: 'var(--panel2)',
            borderRadius: 12,
            padding: '10px 14px',
            textAlign: 'left',
            fontSize: '0.78rem',
          }}
        >
          <div style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: '0.72rem', color: 'var(--accent)' }}>
            ⚔️ Ton équipe — jusqu'à 2 équipiers de relève (échange au coin du ring, 1 Souffle)
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {[...customs, ...ROSTER]
              .filter(c => c.id !== selected.id)
              .map(c => {
                const inTeam = teammates.some(t => t.id === c.id)
                return (
                  <button
                    key={c.id}
                    style={chip(inTeam)}
                    disabled={!inTeam && teammates.length >= 2}
                    onClick={() =>
                      setTeammates(prev =>
                        inTeam ? prev.filter(t => t.id !== c.id) : [...prev, c],
                      )
                    }
                  >
                    {inTeam ? '✓ ' : '＋'}
                    {c.name}
                  </button>
                )
              })}
          </div>
          <div style={{ marginTop: 6, color: 'var(--muted)' }}>
            {teammates.length === 0
              ? 'Sans équipiers : duel classique. Avec : leur PV/Hype/Ulti sont conservés entre les relèves.'
              : `Relève : ${teammates.map(t => t.name).join(' + ')}`}
          </div>
        </div>
      )}

      {selected && stable && (
        <div
          style={{
            width: '100%',
            background: 'var(--panel2)',
            borderRadius: 12,
            padding: '10px 14px',
            textAlign: 'left',
            fontSize: '0.78rem',
          }}
        >
          <div style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: '0.72rem', color: 'var(--accent)' }}>
            🏠 L'Écurie — {selected.name} {moodInfo(stable.mood).icon}{' '}
            <span style={{ color: 'var(--muted)' }}>({moodInfo(stable.mood).label})</span>
          </div>
          {desireText(selected, stable) && (
            <div style={{ marginTop: 4, color: '#fd79a8' }}>💭 {desireText(selected, stable)}</div>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <button style={chip(false)} onClick={() => onStableAction('train', 'atk')}>
              🥊 Entraîner ATK
            </button>
            <button style={chip(false)} onClick={() => onStableAction('train', 'def')}>
              🛡 DEF
            </button>
            <button style={chip(false)} onClick={() => onStableAction('train', 'spd')}>
              💨 SPD
            </button>
            <button style={chip(false)} onClick={() => onStableAction('leisure')}>
              🎈 Loisir
            </button>
            <button style={chip(false)} onClick={() => onStableAction('rest')}>
              😴 Repos
            </button>
          </div>
          <div style={{ marginTop: 6, color: 'var(--muted)' }}>
            {stableMsg ||
              `${ACTIONS_PER_DAY - stable.actionsToday} action(s) restante(s) aujourd'hui. Son humeur influence le début du match.`}
          </div>
        </div>
      )}

      {selected && reward && (
        <div
          style={{
            width: '100%',
            background: 'var(--panel2)',
            border: '2px solid var(--accent)',
            borderRadius: 12,
            padding: '10px 14px',
            textAlign: 'left',
            fontSize: '0.78rem',
          }}
        >
          <div style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: '0.72rem', color: 'var(--accent)' }}>
            🎁 Palier de Lien {reward.level} — {selected.name} te propose une carte. Gardes-en UNE :
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {reward.options.map(id => {
              const c = getCard(id)
              return (
                <button
                  key={id}
                  className="planCard"
                  style={{ flex: 1 }}
                  onClick={() => onClaimReward(id)}
                >
                  <b>
                    {c.icon} {c.name} <span style={{ color: 'var(--violet)' }}>{'●'.repeat(c.cost)}</span>
                  </b>
                  <span>+1 copie dans ton deck · {c.desc}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div
        style={{
          width: '100%',
          background: 'var(--panel2)',
          border: '2px solid var(--violet)',
          borderRadius: 12,
          padding: '10px 14px',
          textAlign: 'left',
          fontSize: '0.78rem',
        }}
      >
        <div style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: '0.72rem', color: 'var(--violet)' }}>
          ⚒ Forge de cartes — décris-la, elle rejoint ton deck
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input
            className="promptBox"
            style={{ minHeight: 0, padding: '9px 12px', flex: 1 }}
            placeholder="« une carte qui soigne et motive, appelée Regain »"
            value={forgePrompt}
            maxLength={120}
            onChange={e => setForgePrompt(e.target.value)}
          />
          <button className="btn secondary" onClick={onForgeCard} disabled={forgePrompt.trim().length < 4}>
            ⚒
          </button>
        </div>
        {forgeMsg && <div style={{ marginTop: 6, color: 'var(--muted)' }}>{forgeMsg}</div>}
        {forged.length > 0 && (
          <div style={{ marginTop: 6, color: 'var(--muted)' }}>
            Forgées ({forged.length}/8) :{' '}
            {forged.map(c => `${c.icon} ${c.name} (${'●'.repeat(c.cost)})`).join(' · ')}
          </div>
        )}
      </div>

      <h2 style={{ fontSize: '1rem', fontWeight: 900, textTransform: 'uppercase', color: 'var(--accent)' }}>
        🃏 Ton Deck de Coach ({deck.length} cartes)
      </h2>
      <p className="permNote">
        Compose ton deck avec les − / + ({DECK_MIN}-{DECK_MAX} cartes de base, {MAX_COPIES} copies
        max). Signature, cartes de palier et forgées s'ajoutent automatiquement. Pioche de 5,
        3 Souffle par pause, un échange possible.
      </p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: '0.78rem' }}>
        <span style={{ color: tplValid ? 'var(--muted)' : 'var(--accent2)', fontWeight: 700 }}>
          Base : {tplSize} carte{tplSize > 1 ? 's' : ''}
          {!tplValid && ` — il en faut entre ${DECK_MIN} et ${DECK_MAX} !`}
        </span>
        <button
          style={chip(false)}
          onClick={() => {
            const d = defaultTemplate()
            saveTemplate(d)
            setTemplate(d)
          }}
        >
          ↺ Réinitialiser
        </button>
      </div>
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
        {CARD_POOL.map(c => {
          const n = template[c.id] ?? 0
          return (
            <div key={c.id} className="charCard" style={n === 0 ? { opacity: 0.5 } : undefined}>
              <div className="cname">
                {c.icon} {c.name}{' '}
                <span style={{ color: 'var(--violet)' }}>{'●'.repeat(c.cost)}</span>
              </div>
              <div className="ctitle">{TIMING_LABEL[c.timing]}</div>
              <div style={{ fontSize: '0.7rem', marginTop: 4, color: 'var(--muted)' }}>{c.desc}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <button style={chip(false)} onClick={() => setCopies(c.id, -1)} disabled={n === 0}>
                  −
                </button>
                <b style={{ fontSize: '0.8rem' }}>×{n}</b>
                <button
                  style={chip(false)}
                  onClick={() => setCopies(c.id, +1)}
                  disabled={n >= MAX_COPIES}
                >
                  +
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <button
        className="btn"
        disabled={!selected || !tplValid}
        onClick={() =>
          selected &&
          tplValid &&
          onConfirm(
            selected,
            deck,
            teammates.filter(t => t.id !== selected.id),
          )
        }
      >
        {!selected
          ? 'Sélectionne un perso'
          : !tplValid
            ? `Deck invalide (${tplSize} cartes de base)`
            : `Coacher ${selected.name} !`}
      </button>
    </div>
  )
}
