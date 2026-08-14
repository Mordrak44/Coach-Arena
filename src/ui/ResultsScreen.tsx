import type { Character } from '../game/types'
import { MatchRecorder } from '../systems/recorder'
import { bondLevel, bondTitle, getProgress } from '../game/progression'
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
  const level = bondLevel(prog.wins)
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

      {outcome.highlight ? (
        <>
          <video
            src={URL.createObjectURL(outcome.highlight)}
            controls
            autoPlay
            muted
            loop
            playsInline
            style={{ width: '72%', borderRadius: 12, border: '3px solid var(--accent2)' }}
          />
          <button
            className="btn"
            onClick={() =>
              MatchRecorder.download(outcome.highlight!, `coach-arena-KO-${player.name}.webm`)
            }
          >
            🔥 Le moment fort (clip court 9:16)
          </button>
        </>
      ) : null}
      {outcome.clip ? (
        <button
          className="btn secondary"
          onClick={() => MatchRecorder.download(outcome.clip!, `coach-arena-${player.name}.webm`)}
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

      <button className="btn secondary" onClick={onReplay}>
        ⚡ Revanche
      </button>
      <button className="btn secondary" onClick={onNewChar}>
        Changer de champion
      </button>
    </div>
  )
}
