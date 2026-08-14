// Enregistrement du match : canvas 9:16 + micro → webm partageable.
// v0.5 : composite avec la facecam incrustée directement dans le clip.

export class MatchRecorder {
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  recording = false

  start(canvas: HTMLCanvasElement, micStream: MediaStream | null): boolean {
    try {
      const stream = canvas.captureStream(30)
      if (micStream) {
        for (const track of micStream.getAudioTracks()) stream.addTrack(track.clone())
      }
      const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(
        m => MediaRecorder.isTypeSupported(m),
      )
      this.chunks = []
      this.recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      this.recorder.ondataavailable = e => {
        if (e.data.size > 0) this.chunks.push(e.data)
      }
      this.recorder.start(1000)
      this.recording = true
      return true
    } catch {
      return false
    }
  }

  /** Arrête l'enregistrement et retourne le blob vidéo du match. */
  async stop(): Promise<Blob | null> {
    const rec = this.recorder
    if (!rec || rec.state === 'inactive') return null
    return new Promise(resolve => {
      rec.onstop = () => {
        this.recording = false
        resolve(this.chunks.length ? new Blob(this.chunks, { type: rec.mimeType || 'video/webm' }) : null)
      }
      rec.stop()
    })
  }

  static download(blob: Blob, filename = 'coach-arena-match.webm') {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
}

/**
 * Enregistreur du « moment fort » : segments rotatifs indépendants de ~14 s
 * sur le même canvas. Au moment du KO, le segment courant (ou le précédent
 * s'il est trop court) contient la fin du match → clip court partageable.
 * On ne peut pas découper un webm a posteriori sans transcodage ; des
 * segments complets, chacun avec son en-tête, contournent le problème.
 */
export class HighlightRecorder {
  private stream: MediaStream | null = null
  private current: MediaRecorder | null = null
  private currentChunks: Blob[] = []
  private currentStartedAt = 0
  private prevBlob: Blob | null = null
  private rotateTimer = 0
  private mime: string | undefined

  readonly segmentMs = 14000

  start(canvas: HTMLCanvasElement, micStream: MediaStream | null): boolean {
    try {
      this.stream = canvas.captureStream(30)
      if (micStream) {
        for (const track of micStream.getAudioTracks()) this.stream.addTrack(track.clone())
      }
      this.mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(
        m => MediaRecorder.isTypeSupported(m),
      )
      this.startSegment()
      this.rotateTimer = window.setInterval(() => this.rotate(), this.segmentMs)
      return true
    } catch {
      return false
    }
  }

  private startSegment() {
    if (!this.stream) return
    this.currentChunks = []
    this.currentStartedAt = performance.now()
    this.current = new MediaRecorder(this.stream, this.mime ? { mimeType: this.mime } : undefined)
    this.current.ondataavailable = e => {
      if (e.data.size > 0) this.currentChunks.push(e.data)
    }
    this.current.start(1000)
  }

  private rotate() {
    const rec = this.current
    if (!rec || rec.state === 'inactive') return
    const chunks = this.currentChunks
    rec.onstop = () => {
      this.prevBlob = chunks.length ? new Blob(chunks, { type: rec.mimeType || 'video/webm' }) : null
    }
    rec.stop()
    this.startSegment()
  }

  /** Arrête tout et retourne le meilleur segment de fin de match. */
  async stop(): Promise<Blob | null> {
    clearInterval(this.rotateTimer)
    const rec = this.current
    if (!rec || rec.state === 'inactive') return this.prevBlob
    const currentDur = performance.now() - this.currentStartedAt
    return new Promise(resolve => {
      const chunks = this.currentChunks
      rec.onstop = () => {
        const blob = chunks.length ? new Blob(chunks, { type: rec.mimeType || 'video/webm' }) : null
        // Segment courant trop court pour contenir l'action ? Le précédent est plus parlant.
        if (currentDur < 6000 && this.prevBlob) resolve(this.prevBlob)
        else resolve(blob ?? this.prevBlob)
      }
      rec.stop()
    })
  }
}
