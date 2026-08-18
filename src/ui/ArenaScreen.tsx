import { useEffect, useRef, useState } from 'react'
import type { CardId, Character, CoachCommand, MatchState, TacticPlan } from '../game/types'
import {
  type MatchOpts,
  ROUND_TIME_LIMIT,
  SOUFFLE_PER_CORNER,
  TIMEOUT_DURATION,
  addSpeechHype,
  applyConsigne,
  callTimeout,
  chooseTacticPlan,
  createMatch,
  forceRoundTimeout,
  mulligan,
  playCard,
  switchFighter,
  tick,
  HYPE_MAX,
  SWITCH_COST,
} from '../game/combat'
import { parseConsigne } from '../game/speechTactics'
import {
  hasSeenCombatHint,
  hasSeenCornerHint,
  markCombatHintSeen,
  markCornerHintSeen,
} from '../game/onboarding'
import { buildScenePlans, type ScenePlan } from '../game/sceneDirector'
import { TIMING_LABEL, getCard } from '../game/cards'
import { Commentator } from '../game/commentator'
import { prefetchForMatchup } from '../game/cutLibrary'
import { LiveCutPlayer, type ActiveCut } from '../game/liveCutPlayer'
import { ArenaRenderer, CANVAS_H, CANVAS_W } from '../render/arenaRenderer'
import { VoiceCoach } from '../systems/voice'
import { FaceCoach } from '../systems/facecam'
import { HighlightRecorder, MatchRecorder } from '../systems/recorder'
import { SoundSystem } from '../systems/sound'
import { requestCoachStream } from '../systems/media'

export interface MatchOutcome {
  winner: 'player' | 'enemy'
  /** match complet */
  clip: Blob | null
  /** moment fort : les dernières secondes (le KO) */
  highlight: Blob | null
  /** plans de scènes cinématiques écrits par le Réalisateur (prompts Kling) */
  scenes: ScenePlan[]
}

// L'humeur du coach adverse passe SOUVENT par un emoji seul (bubble null,
// voir setMood) — un utilisateur de lecteur d'écran ne voit aucun signal.
// Traduction courte pour aria-label, sans toucher à la logique de jeu.
const MOOD_LABEL: Record<string, string> = {
  '🧐': 'neutre',
  '😤': 'énervé',
  '⚡': 'électrisé',
  '🔁': 'fait une relève',
  '🔥': 'déclenche son spécial',
  '😰': 'inquiet',
  '😏': 'content, il vient de gagner le round',
  '😱': 'choqué, il vient de perdre le round',
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
  u: 'ulti',
  ' ': 'cheer',
}

export default function ArenaScreen({
  player,
  enemy,
  deck,
  matchOpts,
  preStream,
  noMedia,
  speed = 1,
  onFinish,
}: {
  player: Character
  enemy: Character
  deck: CardId[]
  /** effets de la Vie d'Écurie (Hype de départ, bouderie) */
  matchOpts?: MatchOpts
  /** flux micro/caméra déjà obtenu par l'écran Vestiaire (null si refusé) */
  preStream?: MediaStream | null
  /** mode démo : ne demande aucun capteur (captures d'écran, tests visuels) */
  noMedia?: boolean
  /** accélération du temps de jeu (démo rapide) — 1 en jeu normal */
  speed?: number
  onFinish: (outcome: MatchOutcome) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const camRef = useRef<HTMLVideoElement>(null)
  const cutVideoRef = useRef<HTMLVideoElement>(null)
  // Initialisation paresseuse : passer createMatch(...) directement en
  // argument de useRef() le ferait ré-exécuter (mélange de 2 decks +
  // Math.random()) à CHAQUE rendu — useRef ne garde que le résultat du
  // premier appel, mais l'argument lui-même est réévalué à chaque rendu
  // comme n'importe quel appel de fonction JS. Ce composant re-rend
  // plusieurs fois par seconde (plusieurs setState par frame dans la
  // boucle de jeu), donc un match complet était construit puis jeté à
  // chaque rendu, pour rien (trouvé en audit).
  const matchRef = useRef<MatchState | null>(null)
  if (matchRef.current === null) matchRef.current = createMatch(player, enemy, deck, matchOpts)
  const match = matchRef.current
  const pendingCmd = useRef<CoachCommand | null>(null)

  // Instances systèmes, stables pour toute la durée du composant.
  const sysRef = useRef<{
    voice: VoiceCoach
    face: FaceCoach
    recorder: MatchRecorder
    highlight: HighlightRecorder
    renderer: ArenaRenderer
    sound: SoundSystem
    commentator: Commentator
    /** lecteur de cuts EN DIRECT — bibliothèque vide par défaut (voir
     * cutLibrary.ts) : reste silencieux tant qu'aucun vrai clip n'existe,
     * le rendu vectoriel du canvas continue d'être ce qui s'affiche. */
    cutPlayer: LiveCutPlayer
    stream: MediaStream | null
    /** canvas caché : jeu + facecam + watermark — c'est LUI qui est enregistré */
    composite: HTMLCanvasElement
  }>()
  if (!sysRef.current) {
    const composite = document.createElement('canvas')
    composite.width = CANVAS_W
    composite.height = CANVAS_H
    sysRef.current = {
      voice: new VoiceCoach(),
      face: new FaceCoach(),
      recorder: new MatchRecorder(),
      highlight: new HighlightRecorder(),
      renderer: new ArenaRenderer(),
      sound: new SoundSystem(),
      commentator: new Commentator(),
      cutPlayer: new LiveCutPlayer(player, enemy),
      stream: null,
      composite,
    }
  }

  const [phase, setPhase] = useState(match.phase)
  const [heard, setHeard] = useState('')
  const [micOk, setMicOk] = useState<boolean | null>(null)
  const [camOk, setCamOk] = useState(false)
  const [plan, setPlan] = useState<TacticPlan | null>(null)
  const [hand, setHand] = useState<CardId[]>([])
  const [souffle, setSouffle] = useState(SOUFFLE_PER_CORNER)
  const [mullMode, setMullMode] = useState(false)
  const [mullSel, setMullSel] = useState<number[]>([])
  const [mullUsed, setMullUsed] = useState(false)
  const [tacticsLeft, setTacticsLeft] = useState(0)
  const [timeoutsLeft, setTimeoutsLeft] = useState(match.timeoutsLeft)
  const [timeoutLeftSec, setTimeoutLeftSec] = useState(0)
  const [speechEnergy, setSpeechEnergy] = useState(0)
  const [consigne, setConsigne] = useState<string | null>(null)
  const lastFinalSeq = useRef(0)
  const [benchView, setBenchView] = useState<{ name: string; hpPct: number; alive: boolean }[]>([])
  const [switchDone, setSwitchDone] = useState(false)
  // La « visio des coachs » : humeur du coach adverse + pulsation de TA tuile
  // quand ta voix déclenche une carte (le signal que l'adversaire verra en PvP).
  const [enemyMood, setEnemyMood] = useState<{ emoji: string; bubble: string | null }>({
    emoji: '🧐',
    bubble: null,
  })
  const [playerProc, setPlayerProc] = useState(false)
  // Premiers pas : deux bulles d'aide montrées une seule fois dans la vie
  // du joueur — réduisent le décrochage des arrivées TikTok qui ne savent
  // pas encore qu'on parle à son perso. Fermables, jamais bloquantes.
  const [showCombatHint, setShowCombatHint] = useState(() => !hasSeenCombatHint())
  const [showCornerHint, setShowCornerHint] = useState(false)
  // La boucle de jeu (useEffect à deps []) capture un closure figé : on lit
  // l'état « déjà vu » via une ref pour rester à jour à l'intérieur.
  const combatHintDismissedRef = useRef(hasSeenCombatHint())
  const enemyMoodRef = useRef(enemyMood)
  const moodTimer = useRef(0)
  const procTimer = useRef(0)
  const [specialReady, setSpecialReady] = useState(false)
  const [ultiReady, setUltiReady] = useState(false)
  const [muted, setMuted] = useState(false)
  // Le combat en cuts : quel clip vidéo jouer PAR-DESSUS le canvas en ce
  // moment (null tant qu'aucune bibliothèque de clips n'existe — voir
  // cutLibrary.ts). Suivi par URL (pas par référence) pour ne déclencher
  // un rendu que quand le clip affiché change vraiment.
  const [activeCut, setActiveCut] = useState<ActiveCut | null>(null)
  const activeCutUrlRef = useRef<string | null>(null)

  // -- setup : médias + boucle de jeu ---------------------------------------
  useEffect(() => {
    const sys = sysRef.current!
    let disposed = false
    let rafId = 0
    let last = performance.now()
    let roundStart = 0
    let finished = false
    let soundEventIdx = 0

    sys.sound.start()

    // Filet de sécurité Safari/iOS : le contexte audio peut démarrer
    // « suspended » car sound.start() tourne dans ce useEffect, hors de la
    // pile synchrone du clic « Faire sonner le gong ». La toute première
    // interaction réelle du coach dans l'arène débloque tout — silencieux
    // et sans coût si l'audio tournait déjà (Chrome/Firefox desktop).
    const unlockAudio = () => {
      sys.sound.resume()
      sys.voice.resume()
    }
    window.addEventListener('pointerdown', unlockAudio, { once: true })
    window.addEventListener('keydown', unlockAudio, { once: true })

    const setup = async () => {
      // Flux déjà obtenu au Vestiaire ; sinon on demande ici (accès direct).
      let stream: MediaStream | null = preStream ?? null
      if (!stream && !noMedia) {
        stream = await requestCoachStream()
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
      sys.recorder.start(sys.composite, hasAudio ? stream : null)
      sys.highlight.start(sys.composite, hasAudio ? stream : null)
    }
    setup()

    // Préchargement des cuts vidéo PENDANT que le match démarre — le timer
    // du premier coin du ring est la vraie fenêtre voulue (voir
    // cutLibrary.ts), mais lancer dès l'entrée en arène ne coûte rien de
    // plus tant que prefetchForMatchup() est un stub instantané.
    prefetchForMatchup(player, enemy, []).then(lib => {
      if (!disposed) sys.cutPlayer.setLibrary(lib)
    })

    const loop = (now: number) => {
      if (disposed) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const m = matchRef.current!

      const prevPhase = m.phase
      const cmd = pendingCmd.current ?? sys.voice.consumeCommand()
      pendingCmd.current = null
      if (cmd && !combatHintDismissedRef.current) {
        combatHintDismissedRef.current = true
        markCombatHintSeen()
        setShowCombatHint(false)
      }

      tick(m, dt * speed, {
        command: m.phase === 'fighting' ? cmd : null,
        voiceEnergy: sys.voice.state.energy,
        faceEnergy: sys.face.state.energy,
        voiceTone: sys.voice.state.pitchRatio,
      })

      // Timer de round côté UI — SEUL 'intro' démarre un nouveau round : un
      // retour de 'timeout' vers 'fighting' ne doit pas remettre le chrono
      // à zéro, sinon un temps mort prolongerait gratuitement le round.
      if (prevPhase === 'intro' && m.phase === 'fighting') roundStart = m.t
      if (m.phase === 'fighting' && m.t - roundStart > ROUND_TIME_LIMIT) forceRoundTimeout(m)

      // Temps mort : décompte affiché, hand/souffle resynchronisés à l'entrée.
      if (m.phase === 'timeout') {
        setTimeoutLeftSec(Math.max(0, Math.ceil(m.phaseUntil - m.t)))
        if (prevPhase !== 'timeout') {
          setHand([...m.hand])
          setSouffle(m.souffle)
          // Ignore les phrases prononcées AVANT l'appel du temps mort —
          // seul ce qui est dit PENDANT le gel doit pouvoir devenir une consigne.
          lastFinalSeq.current = sys.voice.state.finalSeq
        }
      }

      // Vient de rentrer en phase tactique : les phrases dites PENDANT le
      // round qui vient de se terminer ne doivent jamais compter comme la
      // consigne de la pause qui commence. Ce reset doit tourner AVANT le
      // bloc juste en dessous (qui lit finalSeq dès que phase==='tactics',
      // sur ce même tick) — sinon un mot prononcé en plein combat (crié
      // pour attaquer/contrer) pouvait être lu comme la consigne du coin,
      // avant même que le joueur n'ait parlé à la pause, consommant son
      // unique consigne par pause pour rien (trouvé en audit).
      if (m.phase === 'tactics' && prevPhase !== 'tactics') {
        lastFinalSeq.current = sys.voice.state.finalSeq
      }

      // Pendant la phase tactique OU un temps mort, le discours du coach
      // charge la Hype — un temps mort n'est pas qu'une pause carte, c'est
      // aussi le moment de motiver son perso en pleine tempête.
      if (m.phase === 'tactics' || m.phase === 'timeout') {
        const e = sys.voice.state.energy * 0.7 + sys.face.state.energy * 0.3
        if (e > 0.2) addSpeechHype(m, e * dt * 18)
        setTacticsLeft(Math.max(0, Math.ceil(m.phaseUntil - m.t)))
        setSpeechEnergy(sys.voice.state.energy)
        // …et chaque phrase finale peut devenir une CONSIGNE comprise
        // (une par pause — voir speechTactics.ts).
        if (sys.voice.state.finalSeq !== lastFinalSeq.current) {
          lastFinalSeq.current = sys.voice.state.finalSeq
          if (!m.consigneUsed) {
            const c = parseConsigne(sys.voice.state.lastFinal)
            if (c && applyConsigne(m, c.effects, c.label)) setConsigne(c.label)
          }
        }
      }

      if (m.phase !== prevPhase) {
        setPhase(m.phase)
        setTimeoutsLeft(m.timeoutsLeft)
        if (m.phase === 'tactics') {
          if (!hasSeenCornerHint()) setShowCornerHint(true)
          setPlan(null)
          setHand([...m.hand])
          setSouffle(m.souffle)
          setMullMode(false)
          setMullSel([])
          setMullUsed(false)
          setConsigne(null)
          setSwitchDone(false)
          setBenchView(
            m.bench.map(b => ({
              name: b.char.name,
              hpPct: Math.round((b.hp / b.maxHp) * 100),
              alive: b.hp > 0,
            })),
          )
        }
      }
      setSpecialReady(m.player.hype >= HYPE_MAX)
      setUltiReady(m.player.ulti >= 100 && !m.player.ultiUsed)
      setHeard(sys.voice.state.lastHeard)

      // Visio des coachs : humeur adverse temporaire + pulsation de ta tuile.
      const setMood = (emoji: string, bubble: string | null, ms: number) => {
        const mood = { emoji, bubble }
        enemyMoodRef.current = mood
        setEnemyMood(mood)
        window.clearTimeout(moodTimer.current)
        moodTimer.current = window.setTimeout(() => {
          enemyMoodRef.current = { emoji: '🧐', bubble: null }
          setEnemyMood(enemyMoodRef.current)
        }, ms)
      }
      const procPulse = () => {
        setPlayerProc(false)
        window.clearTimeout(procTimer.current)
        // double rAF : relance l'animation CSS même si elle est déjà active
        requestAnimationFrame(() => setPlayerProc(true))
        procTimer.current = window.setTimeout(() => setPlayerProc(false), 1600)
      }

      // --- Bande-son : consomme les nouveaux événements du match ---
      for (; soundEventIdx < m.events.length; soundEventIdx++) {
        const ev = m.events[soundEventIdx]
        // …et alimente la visio des coachs.
        switch (ev.kind) {
          case 'card':
            // Le coin adverse annonce ses cartes avec 2 suffixes possibles
            // (« (coin adverse) » en pause normale, « (temps mort adverse) »
            // pour son soin d'urgence sous 25 % PV — voir combat.ts) : ne
            // filtrer que sur le premier attribuait à tort la seconde au
            // JOUEUR lui-même (procPulse), pile au moment dramatique où le
            // coin adverse se sauve in extremis (trouvé en audit).
            if (ev.name.includes('adverse')) {
              const label = ev.name.replace(' (coin adverse)', '').replace(' (temps mort adverse)', '')
              setMood('😤', label, 2600)
            } else procPulse()
            break
          case 'cardProc':
            if (ev.text.includes('ADVERSE') || ev.text.includes('TON SOUFFLE')) setMood('⚡', ev.text, 2000)
            else procPulse()
            break
          case 'switch':
            if (ev.side === 'enemy') setMood('🔁', `${ev.name} monte !`, 2600)
            else procPulse()
            break
          case 'special':
          case 'ulti':
            if (ev.by === 'enemy') setMood('🔥', null, 1800)
            else setMood('😰', null, 1500)
            break
          case 'roundEnd':
            setMood(ev.winner === 'enemy' ? '😏' : '😱', null, 3000)
            break
        }
        switch (ev.kind) {
          case 'hit':
            sys.sound.hit(ev.crit)
            break
          case 'blocked':
            sys.sound.block()
            break
          case 'dodged':
            sys.sound.dodge()
            break
          case 'countered':
            sys.sound.counter()
            break
          case 'special':
            sys.sound.special()
            break
          case 'ulti':
            sys.sound.ulti()
            break
          case 'ultiReady':
            sys.sound.hypeFull()
            break
          case 'confused':
            sys.sound.confused()
            break
          case 'hypeFull':
            sys.sound.hypeFull()
            break
          case 'card':
            sys.sound.cardPlay()
            break
          case 'roundStart':
            sys.sound.gong()
            break
          case 'roundEnd':
            sys.sound.gong()
            break
          case 'matchEnd':
            sys.sound.ko()
            break
        }
      }
      sys.sound.setCrowdHype(Math.max(m.player.hype, m.enemy.hype) / HYPE_MAX)

      // Commentateur shōnen : nouvelle ligne → affichée dans le canvas (et le clip)
      const commentLine = sys.commentator.ingest(m)
      if (commentLine) sys.renderer.setCommentary(commentLine.text, commentLine.weight, m.t)

      // Rendu
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) {
        const timeLeft = ROUND_TIME_LIMIT - (m.t - roundStart)
        sys.renderer.draw(ctx, m, m.t, timeLeft)
      }

      // Combat en cuts : demande au lecteur le clip du moment (null tant
      // qu'aucune bibliothèque de clips n'existe — le vectoriel reste seul
      // à l'écran). Comparé par URL pour ne resynchroniser React QUE quand
      // le clip affiché change réellement, pas à chaque frame.
      sys.cutPlayer.update(m)
      const cutNow = sys.cutPlayer.current()
      if ((cutNow?.url ?? null) !== activeCutUrlRef.current) {
        activeCutUrlRef.current = cutNow?.url ?? null
        setActiveCut(cutNow)
      }

      // Composite pour le clip : jeu (ou le cut vidéo actif) + facecam + watermark
      const cctx = sys.composite.getContext('2d')
      if (cctx && canvasRef.current) {
        const cutVideo = cutVideoRef.current
        if (cutNow && cutVideo && cutVideo.readyState >= 2) {
          cctx.drawImage(cutVideo, 0, 0, CANVAS_W, CANVAS_H)
          // Filet légal : gravé dans le composite car le badge DOM
          // (.aiWatermark) n'existe pas dans le fichier exporté.
          cctx.save()
          cctx.font = '700 13px sans-serif'
          cctx.textAlign = 'right'
          cctx.strokeStyle = 'rgba(0, 0, 0, 0.6)'
          cctx.lineWidth = 3
          cctx.strokeText('✨ Généré par IA', CANVAS_W - 14, 28)
          cctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
          cctx.fillText('✨ Généré par IA', CANVAS_W - 14, 28)
          cctx.restore()
        } else {
          cctx.drawImage(canvasRef.current, 0, 0)
        }
        const video = sys.face.video
        const tw = CANVAS_W * 0.27
        const th = (tw * 4) / 3
        const ty = CANVAS_H - th - 120
        if (sys.face.state.active && video.readyState >= 2) {
          // Toi : en bas à GAUCHE (disposition visio des coachs)
          const x = 14
          cctx.save()
          // miroir façon selfie
          cctx.translate(x + tw, ty)
          cctx.scale(-1, 1)
          cctx.drawImage(video, 0, 0, tw, th)
          cctx.restore()
          cctx.strokeStyle = '#ffdd00'
          cctx.lineWidth = 4
          cctx.strokeRect(x, ty, tw, th)
          cctx.fillStyle = '#ff3366'
          cctx.font = 'bold 15px sans-serif'
          cctx.textAlign = 'left'
          cctx.fillText('● COACH', x + 6, ty + th + 20)
        }
        // Le coach adverse : en bas à DROITE, dans le clip aussi
        {
          const x = CANVAS_W - tw - 14
          const grad = cctx.createLinearGradient(0, ty, 0, ty + th)
          grad.addColorStop(0, '#1c1830')
          grad.addColorStop(1, '#0e0c1a')
          cctx.fillStyle = grad
          cctx.fillRect(x, ty, tw, th)
          cctx.strokeStyle = '#ff3366'
          cctx.lineWidth = 4
          cctx.strokeRect(x, ty, tw, th)
          cctx.font = '52px sans-serif'
          cctx.textAlign = 'center'
          cctx.fillText(enemyMoodRef.current.emoji, x + tw / 2, ty + th / 2 + 18)
          cctx.fillStyle = '#a29bfe'
          cctx.font = 'bold 13px sans-serif'
          cctx.fillText('COACH ADVERSE', x + tw / 2, ty + th + 18)
          cctx.textAlign = 'left'
        }
        cctx.font = '900 italic 20px sans-serif'
        cctx.textAlign = 'left'
        cctx.strokeStyle = '#111'
        cctx.lineWidth = 4
        cctx.strokeText('COACH ARENA', 14, CANVAS_H - 18)
        cctx.fillStyle = '#ffdd00'
        cctx.fillText('COACH ARENA', 14, CANVAS_H - 18)
      }

      // Fin de match : on coupe l'enregistreur et on sort.
      if (m.phase === 'matchEnd' && !finished) {
        finished = true
        const winner = m.playerWins >= 2 ? 'player' : 'enemy'
        const scenes = buildScenePlans(m, player, enemy)
        setTimeout(async () => {
          const [clip, highlight] = await Promise.all([sys.recorder.stop(), sys.highlight.stop()])
          if (!disposed) onFinish({ winner, clip, highlight, scenes })
        }, 1800) // laisse la pose de victoire à l'écran (et dans le clip)
      }

      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)

    const onKey = (e: KeyboardEvent) => {
      const cmd = KEYMAP[e.key.toLowerCase()]
      if (cmd) {
        // Sans preventDefault, Espace réactive aussi le dernier bouton
        // cliqué (focus) → deux ordres dans la fenêtre anti-spam → fausse
        // Confusion. (Et Espace ne doit pas faire défiler la page.)
        e.preventDefault()
        pendingCmd.current = cmd
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      disposed = true
      cancelAnimationFrame(rafId)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
      sys.voice.stop()
      sys.face.stop()
      sys.recorder.stop()
      sys.highlight.stop()
      sys.sound.stop()
      sys.stream?.getTracks().forEach(t => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sendCmd = (cmd: CoachCommand) => {
    pendingCmd.current = cmd
  }

  const onCallTimeout = () => {
    const m = matchRef.current!
    if (!callTimeout(m)) return
    // callTimeout mute m.phase HORS de la boucle de jeu : la détection
    // « changement de phase » de la boucle compare avant/après son PROPRE
    // tick() et ne verrait jamais une mutation externe — il faut donc
    // synchroniser l'état React nous-mêmes ici, comme pickPlan/onSwitch le
    // font déjà pour leurs propres mutations hors-tick().
    setPhase(m.phase)
    setTimeoutsLeft(m.timeoutsLeft)
    setHand([...m.hand])
    setSouffle(m.souffle)
    // Idem : ignore les phrases dites AVANT l'appel (seul ce qui est dit
    // PENDANT le gel doit pouvoir devenir une consigne).
    lastFinalSeq.current = sysRef.current!.voice.state.finalSeq
  }

  const dismissCombatHint = () => {
    combatHintDismissedRef.current = true
    setShowCombatHint(false)
    markCombatHintSeen()
  }

  const dismissCornerHint = () => {
    setShowCornerHint(false)
    markCornerHintSeen()
  }

  const pickPlan = (p: TacticPlan) => {
    setPlan(p)
    chooseTacticPlan(matchRef.current!, p)
  }

  const onPlayCard = (id: CardId) => {
    const m = matchRef.current!
    if (playCard(m, id)) {
      setHand([...m.hand])
      setSouffle(m.souffle)
    }
  }

  const toggleMullSel = (idx: number) => {
    setMullSel(sel => (sel.includes(idx) ? sel.filter(i => i !== idx) : [...sel, idx]))
  }

  const onSwitch = (i: number) => {
    const m = matchRef.current!
    if (switchFighter(m, i)) {
      setSouffle(m.souffle)
      setSwitchDone(true)
      setBenchView(
        m.bench.map(b => ({
          name: b.char.name,
          hpPct: Math.round((b.hp / b.maxHp) * 100),
          alive: b.hp > 0,
        })),
      )
    }
  }

  const doMulligan = () => {
    const m = matchRef.current!
    const ids = mullSel.map(i => hand[i]).filter(Boolean)
    if (mulligan(m, ids)) {
      setHand([...m.hand])
      setMullUsed(true)
    }
    setMullMode(false)
    setMullSel([])
  }

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    sysRef.current!.sound.setMuted(next)
  }

  return (
    <div className="arenaWrap">
      {/* PV/Hype/Ulti/timer ne sont dessinés que dans le canvas — pas de
          miroir texte complet ici (un vrai flux aria-live PV-par-PV est un
          chantier à part, voir ROADMAP). role="img" + aria-label évitent au
          moins qu'un lecteur d'écran l'ignore comme un graphique sans nom. */}
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        role="img"
        aria-label="Rendu visuel du combat : PV, Hype et jauge d'Ulti des deux combattants, chronomètre du round"
      />

      {/* Combat en cuts : un clip vidéo par-dessus le vectoriel, uniquement
          quand le lecteur en a un (jamais aujourd'hui — bibliothèque vide).
          remonté (key=url) pour forcer le chargement + la lecture du
          nouveau clip à chaque changement, sans gestion impérative. */}
      {activeCut && (
        <>
          <video
            key={activeCut.url}
            ref={cutVideoRef}
            className="cutVideo"
            src={activeCut.url}
            autoPlay
            muted
            playsInline
          />
          {/* Filet légal (voir ROADMAP « Légal ») : tout clip vidéo généré
              par IA doit être identifiable comme tel. Gravé aussi sur le
              canvas composite (voir la boucle de jeu) car ce badge DOM
              n'existe pas dans le fichier exporté. */}
          <div className="aiWatermark">✨ Généré par IA</div>
        </>
      )}

      <button
        onClick={toggleMute}
        aria-label={muted ? 'Activer le son' : 'Couper le son'}
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 6,
          background: 'rgba(0,0,0,0.45)',
          border: 'none',
          borderRadius: 8,
          fontSize: '1.05rem',
          padding: '4px 8px',
          cursor: 'pointer',
        }}
      >
        {muted ? '🔇' : '🔊'}
      </button>

      {camOk && (
        <>
          <video ref={camRef} className={`facecam${playerProc ? ' proc' : ''}`} muted playsInline />
          <span className="facecamBadge">
            {playerProc ? '🎤 carte déclenchée !' : '🔴 Toi, coach'}
          </span>
        </>
      )}
      {/* Le coach adverse — en PvP, la cam du joueur d'en face prendra cette place. */}
      <div className="coachTile">
        {enemyMood.bubble && <div className="coachBubble">{enemyMood.bubble}</div>}
        <div className="coachFace" aria-label={`Coach adverse : ${MOOD_LABEL[enemyMood.emoji] ?? enemyMood.emoji}`}>
          {enemyMood.emoji}
        </div>
      </div>
      <span className="coachName">Coach adverse</span>

      <div className="heardLine">
        {micOk === false
          ? '🎙️ micro refusé — utilise les boutons / clavier (A D E C S, espace)'
          : heard && `🎙️ « ${heard} »`}
      </div>

      {showCombatHint && (phase === 'intro' || phase === 'fighting') && (
        <div className="hintBubble">
          🎙️ Crie « ATTAQUE ! », « DÉFENDS ! », « ESQUIVE ! »… ou clique un bouton en bas. Ton
          perso t'écoute.
          <button className="hintClose" onClick={dismissCombatHint} aria-label="Fermer l'aide">
            ✕
          </button>
        </div>
      )}

      <div className="cmdBar">
        <button onClick={() => sendCmd('attack')}>⚔ Attaque</button>
        <button onClick={() => sendCmd('defend')}>🛡 Défends</button>
        <button onClick={() => sendCmd('dodge')}>💨 Esquive</button>
        <button onClick={() => sendCmd('counter')}>↩ Contre</button>
        {phase === 'fighting' && timeoutsLeft > 0 && (
          <button
            style={{ background: '#4a4370', color: '#fff' }}
            onClick={onCallTimeout}
            title="Gèle le combat pour parler et jouer une carte — 1 par match"
          >
            🛑 Temps Mort
          </button>
        )}
        {ultiReady ? (
          <button
            className="special"
            style={{ background: 'var(--accent2)', color: '#fff' }}
            onClick={() => sendCmd('ulti')}
          >
            ⚡ ULTIME
          </button>
        ) : (
          <button className="special" disabled={!specialReady} onClick={() => sendCmd('special')}>
            ★ SPÉCIAL
          </button>
        )}
      </div>

      {phase === 'tactics' && (
        <div className="overlay">
          <h2>Coin du ring</h2>
          <div className="countdown">{tacticsLeft}</div>
          <p className="tagline">
            Choisis le plan du prochain round — et <b>parle à ton perso</b> : ton discours de coach
            charge sa Hype !
          </p>
          {showCornerHint && (
            <div className="hintBubble" style={{ position: 'static', margin: '0 0 6px' }}>
              🃏 Choisis un plan et joue tes cartes ici — parle aussi, ça marche même en pause.
              <button className="hintClose" onClick={dismissCornerHint} aria-label="Fermer l'aide">
                ✕
              </button>
            </div>
          )}
          {consigne ? (
            <p className="permNote" style={{ color: '#ffd166' }}>
              🎤 Consigne comprise : <b>{consigne}</b>
            </p>
          ) : (
            <p className="permNote">
              🎤 Donne une consigne à voix haute — « s'il sort son spécial, esquive ! », « garde
              haute », « chauffe-le »…
            </p>
          )}
          <div className="planGrid">
            {PLANS.map(p => (
              <button
                key={p.id}
                className={`planCard${plan === p.id ? ' selected' : ''}`}
                onClick={() => pickPlan(p.id)}
                aria-pressed={plan === p.id}
              >
                <b>{p.name}</b>
                <span>{p.desc}</span>
              </button>
            ))}
          </div>
          {benchView.length > 0 && (
            <>
              <h2 style={{ fontSize: '0.95rem' }}>🔁 La relève ({SWITCH_COST} Souffle)</h2>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {benchView.map((b, i) => (
                  <button
                    key={`${b.name}-${i}`}
                    className="btn secondary"
                    disabled={!b.alive || switchDone || souffle < SWITCH_COST}
                    style={!b.alive ? { opacity: 0.4 } : undefined}
                    onClick={() => onSwitch(i)}
                  >
                    {b.alive ? `${b.name} — ${b.hpPct}% PV` : `${b.name} — KO`}
                  </button>
                ))}
              </div>
              {switchDone && <span className="permNote">Relève effectuée pour cette pause.</span>}
            </>
          )}
          {hand.length > 0 && (
            <>
              <h2 style={{ fontSize: '0.95rem' }}>
                🃏 Ta main{' '}
                <span style={{ color: 'var(--violet)' }}>
                  {'●'.repeat(souffle)}
                  {'○'.repeat(Math.max(0, SOUFFLE_PER_CORNER - souffle))} Souffle
                </span>
              </h2>
              <div className="planGrid">
                {hand.map((id, idx) => {
                  const c = getCard(id)
                  const affordable = souffle >= c.cost
                  const selected = mullMode && mullSel.includes(idx)
                  return (
                    <button
                      key={`${id}-${idx}`}
                      className={`planCard${selected ? ' selected' : ''}`}
                      disabled={!mullMode && !affordable}
                      style={!mullMode && !affordable ? { opacity: 0.45 } : undefined}
                      onClick={() => (mullMode ? toggleMullSel(idx) : onPlayCard(id))}
                    >
                      <b>
                        {c.icon} {c.name}{' '}
                        <span style={{ color: 'var(--violet)' }}>{'●'.repeat(c.cost)}</span>
                      </b>
                      <span>
                        [{TIMING_LABEL[c.timing]}] {c.desc}
                      </span>
                    </button>
                  )
                })}
              </div>
              {!mullUsed ? (
                mullMode ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn secondary" onClick={doMulligan} disabled={mullSel.length === 0}>
                      Échanger {mullSel.length || ''} carte{mullSel.length > 1 ? 's' : ''}
                    </button>
                    <button className="btn secondary" onClick={() => { setMullMode(false); setMullSel([]) }}>
                      Annuler
                    </button>
                  </div>
                ) : (
                  <button className="btn secondary" onClick={() => setMullMode(true)}>
                    🔄 Échanger des cartes (1 fois)
                  </button>
                )
              ) : (
                <span className="permNote">Échange utilisé pour cette pause.</span>
              )}
            </>
          )}
          <div className="speechMeter">
            <i style={{ width: `${Math.round(speechEnergy * 100)}%` }} />
          </div>
          <span className="permNote">niveau du discours de coach 🎙️</span>
        </div>
      )}

      {phase === 'timeout' && (
        <div className="overlay">
          <h2>🛑 Temps Mort</h2>
          <div className="countdown">{timeoutLeftSec}</div>
          <p className="tagline">
            Le combat est gelé — <b>parle à ton perso</b> et joue une carte si tu en as besoin. Ça
            reprend exactement où c'était.
          </p>
          {hand.length > 0 ? (
            <div className="planGrid">
              {hand.map((id, idx) => {
                const c = getCard(id)
                const affordable = souffle >= c.cost
                return (
                  <button
                    key={`${id}-${idx}`}
                    className="planCard"
                    disabled={!affordable}
                    style={!affordable ? { opacity: 0.45 } : undefined}
                    onClick={() => onPlayCard(id)}
                  >
                    <b>
                      {c.icon} {c.name}{' '}
                      <span style={{ color: 'var(--violet)' }}>{'●'.repeat(c.cost)}</span>
                    </b>
                    <span>
                      [{TIMING_LABEL[c.timing]}] {c.desc}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <span className="permNote">Main vide — parle, ça suffit déjà à motiver ton perso.</span>
          )}
        </div>
      )}
    </div>
  )
}
