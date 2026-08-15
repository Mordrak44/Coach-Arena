import type { ScenePlan } from './sceneDirector'

// La file de génération asynchrone — le pont entre le Réalisateur
// (sceneDirector.ts, QUOI générer) et un vrai pipeline vidéo (pas encore
// branché : ça demande un serveur, voir ROADMAP « Pipeline Kling
// serveur »). Même principe que cutLibrary.ts : tant qu'aucun submitter
// réel n'est fourni, chaque job échoue proprement et vite — jamais de
// blocage, jamais de crédit dépensé par accident. Le mode copier-coller
// manuel (ResultsScreen aujourd'hui) est le filet de sécurité, pas un
// pis-aller : c'est ce qui s'affiche tant que 'failed' est l'issue de
// chaque job.

export type SceneJobStatus = 'pending' | 'ready' | 'failed'

export interface SceneJob {
  plan: ScenePlan
  status: SceneJobStatus
  clipUrl: string | null
}

export interface SceneSubmitter {
  /** Résout l'URL du clip généré, ou null si la génération échoue. */
  submit(plan: ScenePlan): Promise<string | null>
}

/** Filet par défaut : aucun pipeline branché, chaque job échoue proprement. */
export const STUB_SCENE_SUBMITTER: SceneSubmitter = {
  submit: async () => null,
}

const DEFAULT_TIMEOUT_MS = 20000

export interface SceneJobQueueOpts {
  submitter?: SceneSubmitter
  /** Au-delà, le job est abandonné (traité comme un échec) — protège contre un pipeline lent ou muet. */
  timeoutMs?: number
  /** Appelé à chaque changement d'état d'un job, avec l'état complet de la file. */
  onUpdate?: (jobs: SceneJob[]) => void
}

/**
 * File de jobs de génération — un job par scène du Réalisateur. Chaque
 * job est indépendant : l'échec ou le retard de l'un n'affecte jamais
 * les autres, ni le reste de l'expérience (mode arcade déjà terminé,
 * clip déjà exporté).
 */
export class SceneJobQueue {
  private jobsList: SceneJob[]
  private submitter: SceneSubmitter
  private timeoutMs: number
  private onUpdate?: (jobs: SceneJob[]) => void

  constructor(plans: ScenePlan[], opts: SceneJobQueueOpts = {}) {
    this.jobsList = plans.map(plan => ({ plan, status: 'pending' as const, clipUrl: null }))
    this.submitter = opts.submitter ?? STUB_SCENE_SUBMITTER
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.onUpdate = opts.onUpdate
  }

  /** Lance tous les jobs en parallèle — à appeler une fois. */
  start(): void {
    for (const job of this.jobsList) {
      const timeout = new Promise<null>(resolve => {
        setTimeout(() => resolve(null), this.timeoutMs)
      })
      Promise.race([this.submitter.submit(job.plan), timeout])
        .then(url => {
          job.status = url ? 'ready' : 'failed'
          job.clipUrl = url
          this.onUpdate?.(this.jobs())
        })
        .catch(() => {
          job.status = 'failed'
          this.onUpdate?.(this.jobs())
        })
    }
  }

  /** Instantané en lecture seule de l'état courant. */
  jobs(): SceneJob[] {
    return this.jobsList.map(j => ({ ...j }))
  }
}
