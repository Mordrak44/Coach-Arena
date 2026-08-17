// Enregistrement du match : canvas 9:16 + micro → clip partageable.
// v0.5 : composite avec la facecam incrustée directement dans le clip.
// v1 : mp4 natif quand le navigateur sait l'enregistrer (Safari/iOS,
// Chromium récents) — TikTok et le partage mobile veulent du mp4 ; webm en
// repli. Pas de transcodage : on choisit le bon conteneur À la source.

/** Meilleur conteneur supporté — mp4 d'abord, webm sinon. */
export function pickMimeType(): string | undefined {
  return [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ].find(m => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m))
}

export function fileExt(blob: Blob): 'mp4' | 'webm' {
  return blob.type.includes('mp4') ? 'mp4' : 'webm'
}

/**
 * Partage natif (feuille de partage mobile → TikTok/Shorts direct) si le
 * navigateur sait partager des fichiers, sinon téléchargement classique.
 */
export async function shareOrDownload(
  blob: Blob,
  baseName: string,
  text: string,
): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], `${baseName}.${fileExt(blob)}`, {
    type: blob.type || 'video/webm',
  })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Coach Arena', text })
      return 'shared'
    } catch {
      // partage annulé ou refusé → repli téléchargement
    }
  }
  MatchRecorder.download(blob, file.name)
  return 'downloaded'
}

export class MatchRecorder {
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private mixStream: MediaStream | null = null
  recording = false

  start(canvas: HTMLCanvasElement, micStream: MediaStream | null): boolean {
    try {
      const stream = canvas.captureStream(30)
      if (micStream) {
        for (const track of micStream.getAudioTracks()) stream.addTrack(track.clone())
      }
      this.mixStream = stream
      const mime = pickMimeType()
      this.chunks = []
      this.recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      this.recorder.ondataavailable = e => {
        if (e.data.size > 0) this.chunks.push(e.data)
      }
      this.recorder.start(1000)
      this.recording = true
      return true
    } catch {
      // Le flux composite (piste micro CLONÉE + piste vidéo de
      // captureStream()) peut avoir été créé avec succès AVANT que la
      // construction du MediaRecorder échoue plus bas — sans ce nettoyage,
      // l'indicateur micro du navigateur reste allumé et le canvas
      // continue d'être sollicité à 30 fps pour un flux sans consommateur,
      // exactement la fuite déjà documentée pour le chemin d'arrêt normal
      // (releaseTracks), mais sur le chemin d'ÉCHEC du démarrage — jamais
      // couvert jusqu'ici (trouvé en audit, 2026-08-17).
      this.releaseTracks()
      return false
    }
  }

  /** Arrête l'enregistrement et retourne le blob vidéo du match. */
  async stop(): Promise<Blob | null> {
    const rec = this.recorder
    if (!rec || rec.state === 'inactive') {
      this.releaseTracks()
      return null
    }
    return new Promise(resolve => {
      rec.onstop = () => {
        this.recording = false
        this.releaseTracks()
        resolve(this.chunks.length ? new Blob(this.chunks, { type: rec.mimeType || 'video/webm' }) : null)
      }
      rec.stop()
    })
  }

  /** Stoppe les pistes micro CLONÉES (arrêter l'original ne les arrête pas,
   *  sinon l'indicateur micro du navigateur reste allumé après le match)
   *  ET la piste vidéo de captureStream() — sans ça, le canvas continue
   *  d'être sollicité à 30 fps sans aucun consommateur après l'arrêt
   *  (trouvé en audit, 2026-08-16). */
  private releaseTracks() {
    this.mixStream?.getTracks().forEach(t => t.stop())
    this.mixStream = null
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
      this.mime = pickMimeType()
      this.startSegment()
      this.rotateTimer = window.setInterval(() => this.rotate(), this.segmentMs)
      return true
    } catch {
      // Même fuite que MatchRecorder.start() : this.stream (piste micro
      // clonée + piste vidéo de captureStream()) peut exister même si
      // startSegment() (qui construit le 1er MediaRecorder) échoue —
      // trouvé en auditant le même motif ici après l'avoir trouvé là-bas.
      this.releaseTracks()
      return false
    }
  }

  private startSegment() {
    if (!this.stream) return
    // Tableau capturé en closure : le stop() asynchrone de l'ANCIEN recorder
    // pousse son dernier chunk dans SON tableau, jamais dans celui du nouveau
    // segment (sinon chaque segment commence par un cluster étranger sans
    // en-tête EBML → webm invalide).
    const chunks: Blob[] = []
    this.currentChunks = chunks
    this.currentStartedAt = performance.now()
    this.current = new MediaRecorder(this.stream, this.mime ? { mimeType: this.mime } : undefined)
    this.current.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data)
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
    try {
      this.startSegment()
    } catch {
      // Contrairement à start() (protégé par son propre try/catch), cet
      // appel tournait NU dans le callback du setInterval — une panne
      // transitoire du prochain MediaRecorder (rare mais réelle) plantait
      // silencieusement hors de toute pile surveillée. Sans dégâts pour
      // autant : le prochain rotate() (14 s plus tard) retentera, et
      // stop() retombe déjà sur prevBlob si `current` reste invalide.
    }
  }

  /** Arrête tout et retourne le meilleur segment de fin de match. */
  async stop(): Promise<Blob | null> {
    clearInterval(this.rotateTimer)
    const rec = this.current
    if (!rec || rec.state === 'inactive') {
      this.releaseTracks()
      return this.prevBlob
    }
    const currentDur = performance.now() - this.currentStartedAt
    return new Promise(resolve => {
      const chunks = this.currentChunks
      rec.onstop = () => {
        this.releaseTracks()
        const blob = chunks.length ? new Blob(chunks, { type: rec.mimeType || 'video/webm' }) : null
        // Segment courant trop court pour contenir l'action ? Le précédent est plus parlant.
        if (currentDur < 6000 && this.prevBlob) resolve(this.prevBlob)
        else resolve(blob ?? this.prevBlob)
      }
      rec.stop()
    })
  }

  /** Même exigence que MatchRecorder : clones micro ET piste vidéo de
   *  captureStream() doivent être stoppés, pas seulement l'audio. */
  private releaseTracks() {
    this.stream?.getTracks().forEach(t => t.stop())
    this.stream = null
  }
}
