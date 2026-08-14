import { useEffect, useMemo, useState } from 'react'
import type { Character } from '../game/types'
import { MatchRecorder, fileExt, shareOrDownload } from '../systems/recorder'
import { bondLevelFor, bondTitle, getProgress } from '../game/progression'
import type { MatchOutcome } from './ArenaScreen'

export default function ResultsScreen({
  player,
  outcome,
  onReplay,
  onNewChar,
}: {
  player: Character
  outcome: MatchOutcome
  onReplay: () => void
  onNewChar: () => void
}) {
  const won = outcome.winner === 'player'
  const prog = getProgress(player.id)
  const level = bondLevelFor(player.id)
  const [shared, setShared] = useState(false)
  // URL créée UNE fois (pas à chaque rendu — sinon fuite mémoire de blobs
  // multi-Mo et vidéo qui redémarre), révoquée au démontage.
  const highlightUrl = useMemo(
    () => (outcome.highlight ? URL.createObjectURL(outcome.highlight) : null),
    [outcome.highlight],
  )
  useEffect(() => {
    return () => {
      if (highlightUrl) URL.revokeObjectURL(highlightUrl)
    }
  }, [highlightUrl])
  return (
    <div className="screen">
      <div className={`bigResult ${won ? 'win' : 'lose'}`}>
        {won ? 'VICTOIRE !' : 'DÉFAITE…'}
      </div>
      <div style={{ fontSize: '0.8rem', color: '#fd79a8', fontWeight: 700 }}>
        💞 Lien avec {player.name} : niv. {level} « {bondTitle(level)} » · {prog.wins}V/
        {prog.losses}D
      </div>
      <p className="tagline">
        {won
          ? `${player.name} a tout donné — mais c'est TON coaching qui a fait la différence, coach.`
          : `${player.name} s'est bien battu. Un vrai coach revient toujours. Retournes-y.`}
      </p>

      {highlightUrl ? (
        <>
          <video
            src={highlightUrl}
            controls
            autoPlay
            muted
            loop
            playsInline
            style={{ width: '72%', borderRadius: 12, border: '3px solid var(--accent2)' }}
          />
          <button
            className="btn"
            onClick={async () => {
              const how = await shareOrDownload(
                outcome.highlight!,
                `coach-arena-KO-${player.name}`,
                `Mon KO en direct sur Coach Arena 🥊 #CoachArena`,
              )
              setShared(how === 'shared')
            }}
          >
            📤 Partager le KO (clip 9:16)
          </button>
          {shared && <p className="permNote">Clip envoyé — beau match, coach ! 🥊</p>}
        </>
      ) : null}
      {outcome.clip ? (
        <button
          className="btn secondary"
          onClick={() =>
            MatchRecorder.download(
              outcome.clip!,
              `coach-arena-${player.name}.${fileExt(outcome.clip!)}`,
            )
          }
        >
          ⬇ Match complet
        </button>
      ) : null}
      {outcome.clip || outcome.highlight ? (
        <p className="permNote">
          Format vertical prêt pour TikTok / Shorts — poste ton KO, tague #CoachArena 🥊
        </p>
      ) : (
        <p className="permNote">Pas de clip pour ce match (enregistrement indisponible).</p>
      )}

      {outcome.scenes.length > 0 && (
        <details style={{ width: '86%', textAlign: 'left' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
            🎬 Scènes de ton match ({outcome.scenes.length}) — prompts prêts pour Kling
          </summary>
          <p className="permNote">
            Le Réalisateur a détecté les moments forts et écrit les prompts vidéo. Colle-les dans
            Kling (image-to-video avec la planche du perso) pour l'épisode anime du match.
          </p>
          {outcome.scenes.map(s => (
            <div key={s.id} style={{ margin: '6px 0' }}>
              <b style={{ fontSize: '0.8rem' }}>{s.title}</b>{' '}
              <button
                className="btn secondary"
                style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                onClick={() => navigator.clipboard?.writeText(s.prompt).catch(() => {})}
              >
                📋 Copier
              </button>
              <div
                style={{
                  fontSize: '0.68rem',
                  opacity: 0.75,
                  maxHeight: 52,
                  overflow: 'hidden',
                  fontFamily: 'monospace',
                }}
              >
                {s.prompt}
              </div>
            </div>
          ))}
        </details>
      )}

      <button className="btn secondary" onClick={onReplay}>
        ⚡ Revanche
      </button>
      <button className="btn secondary" onClick={onNewChar}>
        Changer de champion
      </button>
    </div>
  )
}
