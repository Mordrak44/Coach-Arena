import { useEffect, useRef, useState } from 'react'
import type { Character, CoachCommand, MatchState, TacticPlan } from '../game/types'
import {
  ROUND_TIME_LIMIT,
  addSpeechHype,
  chooseTacticPlan,
  createMatch,
  forceRoundTimeout,
  tick,
  HYPE_MAX,
} from '../game/combat'
import { ArenaRenderer, CANVAS_H, CANVAS_W } from '../render/arenaRenderer'
import { VoiceCoach } from '../systems/voice'
import { FaceCoach } from '../systems/facecam'
import { MatchRecorder } from '../systems/recorder'

export interface MatchOutcome {
  winner: 'player' | 'enemy'
  clip: Blob | null
}

const PLANS: Array<{ id: TacticPlan; name: string; desc: string }> = [
  { id: 'pressure', name: 'Pression', desc: 'Agressif dès le gong. On le finit.' },
  { id: 'concrete', name: 'Béton', desc: 'Garde haute, on encaisse, on use.' },
  { id: 'counterplay', name: 'Contre-jeu', desc: "On attend l'erreur et on punit." },
  { id: 'coldblood', name: 'Sang-froid', desc: 'On récupère. La Hype est conservée.' },
]

const KEYMAP: Record<string, CoachCommand> = {
  a: 'attack',
  d: 'defend',
  e: 'dodge',
  c: 'counter',
  s: 'special',
  ' ': 'cheer',
}

export default function ArenaScreen({
  player,
  enemy,
  onFinish,
}: {
  player: Character
  enemy: Character
  onFinish: (outcome: MatchOutcome) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const camRef = useRef<HTMLVideoElement>(null)
  const matchRef = useRef<MatchState>(createMatch(player, enemy))
  const pendingCmd = useRef<CoachCommand | null>(null)

  // Instances systèmes, stables pour toute la durée du composant.
  const sysRef = useRef<{
    voice: VoiceCoach
    face: FaceCoach
    recorder: MatchRecorder
    renderer: ArenaRenderer
    stream: MediaStream | null
  }>()
  if (!sysRef.current) {
    sysRef.current = {
      voice: new VoiceCoach(),
      face: new FaceCoach(),
      recorder: new MatchRecorder(),
      renderer: new ArenaRenderer(),
      stream: null,
    }
  }

  const [phase, setPhase] = useState(matchRef.current.phase)
  const [heard, setHeard] = useState('')
  const [micOk, setMicOk] = useState<boolean | null>(null)
  const [camOk, setCamOk] = useState(false)
  const [plan, setPlan] = useState<TacticPlan | null>(null)
  const [tacticsLeft, setTacticsLeft] = useState(0)
  const [speechEnergy, setSpeechEnergy] = useState(0)
  const [specialReady, setSpecialReady] = useState(false)

  // -- setup : médias + boucle de jeu ---------------------------------------
  useEffect(() => {
    const sys = sysRef.current!
    let disposed = false
    let rafId = 0
    let last = performance.now()
    let roundStart = 0
    let finished = false

    const setup = async () => {
      // Micro + caméra ; on tolère chaque refus séparément.
      let stream: MediaStream | null = null
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        } catch {
          stream = null
        }
      }
      if (disposed) {
        stream?.getTracks().forEach(t => t.stop())
        return
      }
      sys.stream = stream
      const hasAudio = !!stream?.getAudioTracks().length
      const hasVideo = !!stream?.getVideoTracks().length
      setMicOk(hasAudio)
      setCamOk(hasVideo)
      if (stream && hasAudio) sys.voice.start(stream)
      if (stream && hasVideo) {
        sys.face.start(stream)
        if (camRef.current) {
          camRef.current.srcObject = stream
          camRef.current.play().catch(() => {})
        }
      }
      if (canvasRef.current) sys.recorder.start(canvasRef.current, hasAudio ? stream : null)
    }
    setup()

    const loop = (now: number) => {
      if (disposed) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const m = matchRef.current

      const prevPhase = m.phase
      const cmd = pendingCmd.current ?? sys.voice.consumeCommand()
      pendingCmd.current = null

      tick(m, dt, {
        command: m.phase === 'fighting' ? cmd : null,
        voiceEnergy: sys.voice.state.energy,
        faceEnergy: sys.face.state.energy,
      })

      // Timer de round côté UI
      if (prevPhase !== 'fighting' && m.phase === 'fighting') roundStart = m.t
      if (m.phase === 'fighting' && m.t - roundStart > ROUND_TIME_LIMIT) forceRoundTimeout(m)

      // Pendant la phase tactique, le discours du coach charge la Hype.
      if (m.phase === 'tactics') {
        const e = sys.voice.state.energy * 0.7 + sys.face.state.energy * 0.3
        if (e > 0.2) addSpeechHype(m, e * dt * 18)
        setTacticsLeft(Math.max(0, Math.ceil(m.phaseUntil - m.t)))
        setSpeechEnergy(sys.voice.state.energy)
      }

      if (m.phase !== prevPhase) {
        setPhase(m.phase)
        if (m.phase === 'tactics') setPlan(null)
      }
      setSpecialReady(m.player.hype >= HYPE_MAX)
      setHeard(sys.voice.state.lastHeard)

      // Rendu
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) {
        const timeLeft = ROUND_TIME_LIMIT - (m.t - roundStart)
        sys.renderer.draw(ctx, m, m.t, timeLeft)
      }

      // Fin de match : on coupe l'enregistreur et on sort.
      if (m.phase === 'matchEnd' && !finished) {
        finished = true
        const winner = m.playerWins >= 2 ? 'player' : 'enemy'
        setTimeout(async () => {
          const clip = await sys.recorder.stop()
          if (!disposed) onFinish({ winner, clip })
        }, 1800) // laisse la pose de victoire à l'écran (et dans le clip)
      }

      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)

    const onKey = (e: KeyboardEvent) => {
      const cmd = KEYMAP[e.key.toLowerCase()]
      if (cmd) pendingCmd.current = cmd
    }
    window.addEventListener('keydown', onKey)

    return () => {
      disposed = true
      cancelAnimationFrame(rafId)
      window.removeEventListener('keydown', onKey)
      sys.voice.stop()
      sys.face.stop()
      sys.recorder.stop()
      sys.stream?.getTracks().forEach(t => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sendCmd = (cmd: CoachCommand) => {
    pendingCmd.current = cmd
  }

  const pickPlan = (p: TacticPlan) => {
    setPlan(p)
    chooseTacticPlan(matchRef.current, p)
  }

  return (
    <div className="arenaWrap">
      <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} />

      {camOk && (
        <>
          <video ref={camRef} className="facecam" muted playsInline />
          <span className="facecamBadge">🔴 Coach cam</span>
        </>
      )}

      <div className="heardLine">
        {micOk === false
          ? '🎙️ micro refusé — utilise les boutons / clavier (A D E C S, espace)'
          : heard && `🎙️ « ${heard} »`}
      </div>

      <div className="cmdBar">
        <button onClick={() => sendCmd('attack')}>⚔ Attaque</button>
        <button onClick={() => sendCmd('defend')}>🛡 Défends</button>
        <button onClick={() => sendCmd('dodge')}>💨 Esquive</button>
        <button onClick={() => sendCmd('counter')}>↩ Contre</button>
        <button className="special" disabled={!specialReady} onClick={() => sendCmd('special')}>
          ★ SPÉCIAL
        </button>
      </div>

      {phase === 'tactics' && (
        <div className="overlay">
          <h2>Coin du ring</h2>
          <div className="countdown">{tacticsLeft}</div>
          <p className="tagline">
            Choisis le plan du prochain round — et <b>parle à ton perso</b> : ton discours de coach
            charge sa Hype !
          </p>
          <div className="planGrid">
            {PLANS.map(p => (
              <button
                key={p.id}
                className={`planCard${plan === p.id ? ' selected' : ''}`}
                onClick={() => pickPlan(p.id)}
              >
                <b>{p.name}</b>
                <span>{p.desc}</span>
              </button>
            ))}
          </div>
          <div className="speechMeter">
            <i style={{ width: `${Math.round(speechEnergy * 100)}%` }} />
          </div>
          <span className="permNote">niveau du discours de coach 🎙️</span>
        </div>
      )}
    </div>
  )
}
