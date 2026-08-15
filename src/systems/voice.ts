import type { CoachCommand } from '../game/types'
import { PitchTracker, detectPitch } from './pitch'

// Reconnaissance vocale (Web Speech API) + mesure du volume micro.
// Fallback : si SpeechRecognition n'existe pas, seuls le volume et les
// boutons/clavier fonctionnent (géré côté UI).

export interface VoiceState {
  /** dernière commande reconnue, consommée par la boucle de jeu */
  pendingCommand: CoachCommand | null
  /** volume micro lissé 0..1 */
  energy: number
  /** dernier texte entendu (affiché dans le HUD pour le feedback) */
  lastHeard: string
  /** dernière phrase FINALE (résultat stabilisé) — pour les consignes de pause */
  lastFinal: string
  /** incrémenté à chaque phrase finale : permet de détecter les nouvelles */
  finalSeq: number
  /** prosodie : ratio pitch courant / voix posée (1 = normal, >1.15 = aigu) */
  pitchRatio: number
  supported: boolean
  listening: boolean
}

const COMMAND_PATTERNS: Array<[RegExp, CoachCommand]> = [
  [/attaqu|fonce|frappe|défonce|cogne|vas[- ]?y|charge/i, 'attack'],
  [/défend|garde|protège|recule|bloque/i, 'defend'],
  [/esquive|bouge|évite|danse/i, 'dodge'],
  [/contre|contr[- ]?attaque|punis/i, 'counter'],
  [/ultime|ulti|ach[èe]ve[- ]?le|termine[- ]?le/i, 'ulti'],
  [/spécial|special|maintenant|finis[- ]?le/i, 'special'],
  [/allez|allé|bravo|meilleur|champion|t'es le|tu peux|courage|plus fort|ouais|oui !/i, 'cheer'],
]

export function matchCommand(text: string): CoachCommand | null {
  for (const [re, cmd] of COMMAND_PATTERNS) {
    if (re.test(text)) return cmd
  }
  return null
}

type SpeechRecognitionCtor = new () => any

export class VoiceCoach {
  state: VoiceState = {
    pendingCommand: null,
    energy: 0,
    lastHeard: '',
    lastFinal: '',
    finalSeq: 0,
    pitchRatio: 1,
    supported: false,
    listening: false,
  }

  private pitch = new PitchTracker()
  private timeBuf: Float32Array | null = null

  private recognition: any = null
  private audioCtx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private volBuf: Uint8Array | null = null
  private rafId = 0
  private stopped = false

  async start(stream: MediaStream): Promise<void> {
    this.stopped = false
    this.startVolumeMeter(stream)
    this.startRecognition()
  }

  /** Débloque le contexte s'il est resté « suspended » (Safari/iOS). */
  resume(): void {
    if (this.audioCtx?.state === 'suspended') void this.audioCtx.resume()
  }

  private startVolumeMeter(stream: MediaStream) {
    try {
      this.audioCtx = new AudioContext()
      void this.audioCtx.resume()
      const src = this.audioCtx.createMediaStreamSource(stream)
      this.analyser = this.audioCtx.createAnalyser()
      this.analyser.fftSize = 2048 // assez long pour l'autocorrélation du pitch
      src.connect(this.analyser)
      this.volBuf = new Uint8Array(this.analyser.frequencyBinCount)
      this.timeBuf = new Float32Array(this.analyser.fftSize)
      const loop = () => {
        if (this.stopped || !this.analyser || !this.volBuf) return
        this.analyser.getByteFrequencyData(this.volBuf as any)
        let sum = 0
        for (let i = 0; i < this.volBuf.length; i++) sum += this.volBuf[i]
        // Borné à 1 : la moyenne peut atteindre ~255, et tout le jeu
        // (gains de Hype, jauge de discours) suppose energy ∈ [0..1].
        const raw = Math.min(1, sum / this.volBuf.length / 140)
        // Lissage asymétrique : monte vite, redescend doucement.
        this.state.energy =
          raw > this.state.energy
            ? this.state.energy * 0.6 + raw * 0.4
            : this.state.energy * 0.95 + raw * 0.05
        // Prosodie : hauteur de voix par autocorrélation (locale, gratuite).
        if (this.timeBuf && this.audioCtx) {
          this.analyser.getFloatTimeDomainData(this.timeBuf as any)
          this.pitch.update(detectPitch(this.timeBuf, this.audioCtx.sampleRate))
          this.state.pitchRatio = this.pitch.ratio()
        }
        this.rafId = requestAnimationFrame(loop)
      }
      loop()
    } catch {
      // pas de micro : energy reste à 0
    }
  }

  private startRecognition() {
    const Ctor: SpeechRecognitionCtor | undefined =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!Ctor) {
      this.state.supported = false
      return
    }
    this.state.supported = true
    const rec = new Ctor()
    this.recognition = rec
    rec.lang = 'fr-FR'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (ev: any) => {
      const res = ev.results[ev.resultIndex]
      const text: string = res[0].transcript.trim()
      if (!text) return
      this.state.lastHeard = text
      if (res.isFinal) {
        this.state.lastFinal = text
        this.state.finalSeq++
      }
      const cmd = matchCommand(text)
      // Les résultats finaux ET intermédiaires déclenchent (réactivité) ;
      // la dédup se fait côté jeu via la fenêtre anti-spam.
      if (cmd) this.state.pendingCommand = cmd
    }
    rec.onend = () => {
      this.state.listening = false
      if (!this.stopped) {
        // Chrome coupe la reco régulièrement : on relance en continu.
        try {
          rec.start()
          this.state.listening = true
        } catch {
          /* déjà relancée */
        }
      }
    }
    rec.onerror = () => {
      /* géré par onend */
    }
    try {
      rec.start()
      this.state.listening = true
    } catch {
      this.state.supported = false
    }
  }

  /** Consomme la commande en attente (une seule fois). */
  consumeCommand(): CoachCommand | null {
    const cmd = this.state.pendingCommand
    this.state.pendingCommand = null
    return cmd
  }

  stop() {
    this.stopped = true
    cancelAnimationFrame(this.rafId)
    try {
      this.recognition?.stop()
    } catch {
      /* noop */
    }
    this.audioCtx?.close().catch(() => {})
    this.audioCtx = null
  }
}
