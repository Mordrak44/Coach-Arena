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

// ORDRE DÉLIBÉRÉ : 'counter' AVANT 'attack'. « Contre-attaque ! » contient
// le substring « attaqu » (celui du pattern 'attack'), donc si 'attack'
// était testé en premier il gagnerait TOUJOURS sur « contre-attaque » —
// rendant le `contr[- ]?attaque` de 'counter' inatteignable en pratique,
// alors que c'est une consigne naturelle et fréquente en combat (bug
// d'audit, 2026-08-17 : confirmé jusque-là mal classé en 'attack').
const COMMAND_PATTERNS: Array<[RegExp, CoachCommand]> = [
  [/contre|contr[- ]?attaque|punis/i, 'counter'],
  [/attaqu|fonce|frappe|défonce|cogne|vas[- ]?y|charge/i, 'attack'],
  [/défend|garde|protège|recule|bloque/i, 'defend'],
  [/esquive|bouge|évite|danse/i, 'dodge'],
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
    let rec: any
    try {
      rec = new Ctor()
    } catch {
      // Le constructeur existe (Ctor truthy) mais échoue quand même — vu
      // sur certains WebView/navigateurs verrouillés sans pont natif de
      // reco vocale disponible. Sans ce catch, `supported` restait figé à
      // `true` (posé juste avant, plus bas) alors que la reco n'a jamais
      // démarré : un faux positif pire qu'une absence honnête.
      this.state.supported = false
      return
    }
    this.state.supported = true
    this.recognition = rec
    rec.lang = 'fr-FR'
    rec.continuous = true
    rec.interimResults = true
    // Erreur FATALE (permission micro révoquée en cours de match, service de
    // reco bloqué par le navigateur/l'OS) vs transitoire (coupure Chrome
    // périodique, silence prolongé) : consultée par onend juste en dessous,
    // qui ne peut pas distinguer les deux lui-même (il ne reçoit aucun code
    // d'erreur). Sans cette distinction, onend relançait `rec.start()` en
    // boucle indéfiniment même après une panne permanente — `start()` puis
    // `error`/`end` immédiats, sans jamais s'arrêter ni le signaler (trouvé
    // en audit, 2026-08-20).
    let fatalError = false
    rec.onresult = (ev: any) => {
      // Un START() plus récent sur CE MÊME VoiceCoach a pu remplacer
      // `this.recognition` par une nouvelle instance (voir onend
      // ci-dessous) pendant que CETTE instance-ci (`rec`, périmée) était en
      // train de s'arrêter — le Web Speech API peut encore livrer un
      // résultat final « en retard » entre `.stop()` et l'event 'end'.
      // Sans ce garde-fou, ce résultat périmé écrivait quand même dans
      // l'état PARTAGÉ (pendingCommand/lastFinal/finalSeq), consommé par la
      // boucle de jeu comme si le joueur venait de parler alors que c'est
      // un vestige de l'ancienne session (trouvé en audit, 2026-08-20,
      // reproductible en StrictMode : start() → cleanup → start() en
      // succession immédiate sur la même instance de VoiceCoach).
      if (rec !== this.recognition || this.stopped) return
      // ev.resultIndex n'est que le PREMIER index changé — un même event
      // peut porter plusieurs résultats fraîchement finalisés (deux
      // ordres courts dits coup sur coup). Ne lire que resultIndex
      // perdait silencieusement les suivants ; on les parcourt tous, le
      // dernier traité l'emporte (pendingCommand reste un simple
      // pointeur vers « le plus récent », pas une file — trouvé en audit,
      // 2026-08-16).
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i]
        const text: string = res[0].transcript.trim()
        if (!text) continue
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
    }
    rec.onend = () => {
      // Même garde-fou d'instance périmée que onresult ci-dessus : un
      // start() plus récent a déjà remplacé `this.recognition` — sans ce
      // contrôle, ce onend (celui de l'ANCIENNE instance, `stopped` étant
      // déjà retombé à `false` par le start() suivant) relançait quand même
      // `rec.start()` : l'ancienne instance ressuscitait en zombie, tournant
      // en parallèle de la nouvelle, toutes deux écrivant dans le même état
      // partagé (trouvé en audit, 2026-08-20).
      if (rec !== this.recognition) return
      this.state.listening = false
      if (fatalError) {
        this.state.supported = false
        return
      }
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
    rec.onerror = (ev: any) => {
      if (ev?.error === 'not-allowed' || ev?.error === 'audio-capture' || ev?.error === 'service-not-allowed') {
        fatalError = true
      }
      /* le reste est géré par onend */
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
