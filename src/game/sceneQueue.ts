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
  private timers: ReturnType<typeof setTimeout>[] = []
  private cancelled = false

  constructor(plans: ScenePlan[], opts: SceneJobQueueOpts = {}) {
    this.jobsList = plans.map(plan => ({ plan, status: 'pending' as const, clipUrl: null }))
    this.submitter = opts.submitter ?? STUB_SCENE_SUBMITTER
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.onUpdate = opts.onUpdate
  }

  /** Lance tous les jobs en parallèle — à appeler une fois. */
  start(): void {
    for (const job of this.jobsList) {
      // Minuteur individuel retenu pour pouvoir l'annuler dans cancel()
      // (sinon il continue de tourner, et de retenir la closure, même une
      // fois l'appelant démonté — trouvé en audit, 2026-08-16) ET dès que
      // CE job précis se résout, gagnant ou perdant la course (sinon il
      // continue de tourner inutilement jusqu'à `timeoutMs`, ~20 s, même
      // pour un job déjà réglé par le submitter — trouvé en audit,
      // 2026-08-20 : avec STUB_SCENE_SUBMITTER, systématique à CHAQUE
      // montage de ResultsScreen).
      let timerId!: ReturnType<typeof setTimeout>
      const timeout = new Promise<null>(resolve => {
        timerId = setTimeout(() => resolve(null), this.timeoutMs)
        this.timers.push(timerId)
      })
      // `Promise.resolve().then(...)` plutôt qu'un appel direct à
      // `this.submitter.submit(job.plan)` : un futur submitter RÉEL (le
      // pipeline Kling, voir ROADMAP — STUB_SCENE_SUBMITTER est le seul
      // qui existe aujourd'hui, une fonction async qui ne peut PAS jeter
      // de façon synchrone) pourrait valider son `plan` avant même de
      // renvoyer une Promise ; un jet SYNCHRONE à cet endroit s'échapperait
      // de la construction du tableau passé à Promise.race et
      // interromprait TOUTE la boucle for — chaque job SUIVANT resterait
      // bloqué en 'pending' pour toujours, jamais soumis ni notifié
      // (trouvé en audit, 2026-08-20). Ici, tout jet synchrone devient un
      // rejet de Promise normal, traité comme n'importe quel autre échec.
      const submitted = Promise.resolve().then(() => this.submitter.submit(job.plan))
      Promise.race([submitted, timeout]).then(
        url => {
          clearTimeout(timerId)
          if (this.cancelled) return
          // `url !== null`, pas une simple troncature de vérité (`url ?
          // ... : ...`) : le contrat documenté de `SceneSubmitter.submit()`
          // dit bien que SEUL `null` signale un échec — une chaîne vide
          // (`''`, un URL de clip vide mais valide en théorie) était à
          // tort classée en échec par la troncature (trouvé en audit,
          // 2026-08-20).
          job.status = url !== null ? 'ready' : 'failed'
          job.clipUrl = url
          this.onUpdate?.(this.jobs())
        },
        // 2e callback de `.then()`, PAS un `.catch()` chaîné séparément :
        // un `.catch()` après `.then()` intercepterait AUSSI une erreur
        // jetée par le premier callback lui-même (ex. `onUpdate` qui
        // jette) — écrasant alors un job déjà correctement passé à
        // 'ready' en 'failed', tout en laissant son `clipUrl` valide en
        // place, un état interne incohérent republié via un second appel
        // à `onUpdate` (trouvé en audit, 2026-08-20). La forme à deux
        // arguments ne réagit qu'à un ÉCHEC de la course elle-même.
        () => {
          clearTimeout(timerId)
          if (this.cancelled) return
          job.status = 'failed'
          this.onUpdate?.(this.jobs())
        },
      ).catch(() => {
        // Filet final : `onUpdate` est fourni par l'APPELANT (pas garanti
        // pur/sans exception) — s'il jette dans l'un des deux callbacks
        // ci-dessus, ce `.catch()` absorbe l'exception plutôt que de la
        // laisser filer en rejet de Promise non intercepté. Il ne rejoue
        // AUCUNE logique de la file : l'état du job a déjà été posé
        // correctement avant que `onUpdate` ne jette (trouvé en audit,
        // 2026-08-20).
      })
    }
  }

  /**
   * Annule la file : une Promise déjà en vol ne s'interrompt pas, mais
   * ses minuteurs de timeout sont libérés tout de suite et plus aucune
   * mise à jour n'est notifiée — à appeler impérativement au démontage
   * de l'appelant (ex. nettoyage de useEffect dans ResultsScreen), sinon
   * chaque job continue de tourner jusqu'à expiration même sans plus
   * personne pour lire son résultat (trouvé en audit, 2026-08-16).
   */
  cancel(): void {
    this.cancelled = true
    for (const t of this.timers) clearTimeout(t)
    this.timers = []
  }

  /** Instantané en lecture seule de l'état courant. */
  jobs(): SceneJob[] {
    return this.jobsList.map(j => ({ ...j }))
  }
}
