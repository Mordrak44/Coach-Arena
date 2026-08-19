import { useEffect, useRef, useState } from 'react'
import type { Character } from '../game/types'
import { MatchRecorder, fileExt, shareOrDownload } from '../systems/recorder'
import { bondLevelFor, bondTitle, getProgress } from '../game/progression'
import { SceneJobQueue, type SceneJob } from '../game/sceneQueue'
import type { MatchOutcome } from './ArenaScreen'

export default function ResultsScreen({
  player,
  outcome,
  storyOutro,
  onReplay,
  onNewChar,
}: {
  player: Character
  outcome: MatchOutcome
  /** narration de victoire du chapitre d'Histoire (null hors Histoire) */
  storyOutro?: string | null
  onReplay: () => void
  onNewChar: () => void
}) {
  const won = outcome.winner === 'player'
  const prog = getProgress(player.id)
  const level = bondLevelFor(player.id)
  const [shared, setShared] = useState(false)
  const [sharing, setSharing] = useState(false)
  // Créée dans un effet (pas dans un useMemo — un useMemo n'est censé être
  // QUE pur, un `URL.createObjectURL` en effet de bord dedans fuit un blob
  // URL par montage sous React.StrictMode (double-appel de l'usine avant
  // le commit, seule la 2e URL est jamais gardée) : la fuite multi-Mo que
  // le commentaire ici prétendait justement éviter (trouvé en audit,
  // 2026-08-18). Révoquée au démontage ET avant chaque re-création.
  const [highlightUrl, setHighlightUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!outcome.highlight) {
      setHighlightUrl(null)
      return
    }
    const url = URL.createObjectURL(outcome.highlight)
    setHighlightUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [outcome.highlight])
  // File de génération asynchrone des scènes du Réalisateur — aucun
  // pipeline branché aujourd'hui (STUB_SCENE_SUBMITTER par défaut), donc
  // chaque job échoue vite et proprement : le repli copier-coller
  // manuel ci-dessous s'affiche, exactement comme avant cette file.
  const [sceneJobs, setSceneJobs] = useState<SceneJob[]>(() =>
    outcome.scenes.map(plan => ({ plan, status: 'pending' as const, clipUrl: null })),
  )
  useEffect(() => {
    // Pas de setSceneJobs(queue.jobs()) ici : la liste tout-'pending' que
    // ça produirait est identique à celle déjà posée par l'initialiseur de
    // useState ci-dessus (même construction depuis outcome.scenes) — un
    // rendu de plus pour rien avant même que start() ait produit du neuf
    // (trouvé en audit, 2026-08-16).
    const queue = new SceneJobQueue(outcome.scenes, { onUpdate: setSceneJobs })
    queue.start()
    return () => queue.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Chaque job « prêt » pose un clipUrl (URL.createObjectURL, même
  // convention que highlightUrl) — sans révocation au démontage, chacun
  // fuit un blob URL. Aucun submitter réel n'est branché aujourd'hui
  // (STUB_SCENE_SUBMITTER ne produit jamais 'ready'), donc dormant pour
  // l'instant, mais latent : le jour où un vrai pipeline Kling est câblé,
  // chaque passage sur cet écran fuirait un blob par scène (trouvé en
  // audit, 2026-08-18).
  const clipUrlsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    for (const job of sceneJobs) if (job.clipUrl) clipUrlsRef.current.add(job.clipUrl)
  }, [sceneJobs])
  useEffect(() => {
    const urls = clipUrlsRef.current
    return () => urls.forEach(u => URL.revokeObjectURL(u))
  }, [])
  // `open` piloté par l'état (plutôt qu'un <details> non contrôlé) rouvrait
  // le panneau — même si le joueur venait de le refermer à la main — dès
  // qu'un job passait à 'ready' : React ne réapplique l'attribut natif que
  // quand la prop CALCULÉE change de valeur, pas en lisant l'état DOM réel
  // (donc éventuellement modifié par le joueur). Non contrôlé + ouverture
  // impérative UNE SEULE fois au premier job prêt, sans jamais y retoucher
  // ensuite (trouvé en audit, 2026-08-18 — dormant tant qu'aucun job ne
  // devient jamais 'ready', voir clipUrlsRef ci-dessus).
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const autoOpenedRef = useRef(false)
  useEffect(() => {
    if (!autoOpenedRef.current && detailsRef.current && sceneJobs.some(j => j.status === 'ready')) {
      detailsRef.current.open = true
      autoOpenedRef.current = true
    }
  }, [sceneJobs])
  // Le « VICTOIRE ! » d'abord : la vidéo autoplay peut faire défiler l'écran.
  useEffect(() => {
    document.querySelector('.screen')?.scrollTo?.(0, 0)
    window.scrollTo(0, 0)
  }, [])
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
      {storyOutro && (
        <p
          className="tagline"
          style={{
            border: '1px solid var(--accent)',
            borderRadius: 10,
            padding: '8px 12px',
            fontStyle: 'italic',
          }}
        >
          📖 {storyOutro}
        </p>
      )}

      {highlightUrl ? (
        <>
          <video
            src={highlightUrl}
            aria-label="Clip du moment fort du match"
            controls
            autoPlay
            muted
            loop
            playsInline
            style={{ width: '72%', borderRadius: 12, border: '3px solid var(--accent2)' }}
          />
          <button
            className="btn"
            disabled={sharing}
            onClick={async () => {
              // Sans le garde-fou `sharing`, un double-clic pendant que la
              // feuille de partage native est déjà ouverte fait rejeter le
              // 2e navigator.share() (InvalidStateError), et le catch de
              // shareOrDownload() retombe alors sur un TÉLÉCHARGEMENT
              // silencieux en arrière-plan pendant que la feuille native
              // est encore affichée (trouvé en audit, 2026-08-18).
              setSharing(true)
              try {
                const how = await shareOrDownload(
                  outcome.highlight!,
                  `coach-arena-KO-${player.name}`,
                  `Mon KO en direct sur Coach Arena 🥊 #CoachArena`,
                )
                setShared(how === 'shared')
              } finally {
                setSharing(false)
              }
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

      {sceneJobs.length > 0 && (
        <details ref={detailsRef} style={{ width: '86%', textAlign: 'left' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
            🎬 Scènes de ton match ({sceneJobs.length})
            {sceneJobs.some(j => j.status === 'pending') && ' — génération en cours…'}
          </summary>
          <p className="permNote">
            Le Réalisateur a détecté les moments forts et écrit les prompts vidéo. Colle-les dans
            Kling (image-to-video avec la planche du perso) pour l'épisode anime du match.
          </p>
          {sceneJobs.map(job => (
            <div key={job.plan.id} style={{ margin: '6px 0' }}>
              <b style={{ fontSize: '0.8rem' }}>{job.plan.title}</b>{' '}
              {job.status === 'pending' && <span style={{ fontSize: '0.7rem' }}>⏳ génération…</span>}
              {job.status === 'ready' && job.clipUrl && (
                <video
                  src={job.clipUrl}
                  aria-label={`Scène : ${job.plan.title}`}
                  controls
                  muted
                  playsInline
                  style={{ width: '100%', borderRadius: 8, marginTop: 4 }}
                />
              )}
              {job.status === 'failed' && (
                <>
                  <button
                    className="btn secondary"
                    style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                    onClick={() => navigator.clipboard?.writeText(job.plan.prompt).catch(() => {})}
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
                    {job.plan.prompt}
                  </div>
                </>
              )}
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
