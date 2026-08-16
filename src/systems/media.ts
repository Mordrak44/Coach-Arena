// Accès micro/caméra du coach — demande audio+vidéo, puis retombe sur
// audio seul si la caméra est refusée/absente, puis null si même le
// micro échoue. Partagé entre ReadyScreen (premier appel, au Vestiaire)
// et ArenaScreen (accès direct si le Vestiaire a été sauté) — ce
// fallback était dupliqué verbatim dans les deux fichiers, un risque de
// divergence silencieuse (trouvé en audit, 2026-08-16).
export async function requestCoachStream(): Promise<MediaStream | null> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
  } catch {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      return null
    }
  }
}
