// Facecam : capture webcam + analyse d'énergie v0 par différence d'images.
// Un coach qui bouge, s'agite, vit le match → énergie haute.
// v1 : MediaPipe FaceLandmarker pour des émotions distinctes (voir ROADMAP).

export interface FaceState {
  /** énergie de mouvement lissée 0..1 */
  energy: number
  active: boolean
}

const W = 48
const H = 64

export class FaceCoach {
  state: FaceState = { energy: 0, active: false }
  video: HTMLVideoElement

  private canvas: OffscreenCanvas | HTMLCanvasElement
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  private prev: Uint8ClampedArray | null = null
  private timer = 0

  constructor() {
    this.video = document.createElement('video')
    this.video.muted = true
    this.video.playsInline = true
    this.canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(W, H)
        : Object.assign(document.createElement('canvas'), { width: W, height: H })
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true }) as any
  }

  async start(stream: MediaStream): Promise<void> {
    this.video.srcObject = stream
    await this.video.play().catch(() => {})
    this.state.active = true
    this.timer = window.setInterval(() => this.sample(), 180)
  }

  private sample() {
    if (!this.ctx || this.video.readyState < 2) return
    this.ctx.drawImage(this.video, 0, 0, W, H)
    const frame = this.ctx.getImageData(0, 0, W, H).data
    if (this.prev) {
      let diff = 0
      // Échantillonne un pixel sur 4 pour rester léger.
      for (let i = 0; i < frame.length; i += 16) {
        diff += Math.abs(frame[i] - this.prev[i])
      }
      const raw = Math.min(1, diff / (frame.length / 16) / 28)
      this.state.energy =
        raw > this.state.energy
          ? this.state.energy * 0.5 + raw * 0.5
          : this.state.energy * 0.92 + raw * 0.08
    }
    this.prev = new Uint8ClampedArray(frame)
  }

  stop() {
    clearInterval(this.timer)
    this.state.active = false
    this.state.energy = 0
    this.video.srcObject = null
    // Sans ça, un futur start() sur cette même instance comparerait sa
    // première frame au dernier souvenir de l'ANCIENNE session, donnant
    // une énergie de mouvement faussée (trouvé en audit, 2026-08-16 —
    // non atteignable aujourd'hui, ArenaScreen recrée toujours une
    // instance fraîche, mais le contrat start/stop doit rester correct).
    this.prev = null
  }
}
