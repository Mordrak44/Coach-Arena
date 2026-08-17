import { useMemo, useState } from 'react'
import {
  STORY_CHAPTERS,
  type StoryChapter,
  isUnlocked,
  loadCleared,
  storyProgress,
} from '../game/story'

// Le Mode Histoire — « Le Grand Hurlement » : liste des chapitres,
// narration d'avant-match, lancement du combat du chapitre choisi.

export default function StoryScreen({
  onPick,
  onBack,
}: {
  onPick: (ch: StoryChapter) => void
  onBack: () => void
}) {
  const cleared = useMemo(() => loadCleared(), [])
  const [open, setOpen] = useState<StoryChapter | null>(null)
  const prog = storyProgress(cleared)

  return (
    <div className="screen">
      <h1 className="logo" style={{ fontSize: '1.6rem' }}>
        Le Grand
        <br />
        Hurlement
      </h1>
      <p className="tagline">
        Le tournoi où les coachs crient plus fort que les poings — {prog.done}/{prog.total}{' '}
        chapitres conquis.
      </p>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {STORY_CHAPTERS.map(ch => {
          const done = cleared.has(ch.id)
          const unlocked = isUnlocked(ch, cleared)
          return (
            <button
              key={ch.id}
              className="planCard"
              disabled={!unlocked}
              aria-pressed={open?.id === ch.id}
              style={{
                width: '100%',
                textAlign: 'left',
                opacity: unlocked ? 1 : 0.45,
                borderColor: open?.id === ch.id ? 'var(--accent)' : undefined,
              }}
              onClick={() => setOpen(ch)}
            >
              <b>
                {done ? '✅' : unlocked ? '🥊' : '🔒'} Chapitre {ch.num} — {ch.title}
              </b>
              {open?.id === ch.id && unlocked && (
                <span style={{ display: 'block', marginTop: 6, fontSize: '0.78rem' }}>
                  {ch.intro}
                  <br />
                  <i style={{ color: 'var(--accent2)' }}>{ch.taunt}</i>
                </span>
              )}
            </button>
          )
        })}
      </div>

      <button className="btn" disabled={!open || !isUnlocked(open, cleared)} onClick={() => open && onPick(open)}>
        {open ? `Chapitre ${open.num} : choisir mon champion !` : 'Choisis un chapitre'}
      </button>
      <button className="btn secondary" onClick={onBack}>
        ← Retour
      </button>
    </div>
  )
}
