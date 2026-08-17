import { Component, type ErrorInfo, type ReactNode } from 'react'

// Filet de sécurité : sans ceci, une exception non attrapée PENDANT un
// match coaché (canvas, reco vocale, état du deck…) fait tomber tout
// React à un écran blanc, en plein direct — la pire expérience possible
// pour un jeu pensé pour être streamé/filmé. Le deck forgé, la Vie
// d'Écurie et la progression vivent dans localStorage, pas dans l'état
// React : un rechargement les retrouve intacts.
export default class ErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false }

  static getDerivedStateFromError(): { crashed: boolean } {
    return { crashed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Coach Arena — crash attrapé par ErrorBoundary :', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.crashed) return this.props.children
    return (
      <div className="screen">
        <h1>🥊💥 K.O. TECHNIQUE</h1>
        <p className="tagline">
          Un pépin inattendu a interrompu le combat. Pas de panique : ton deck forgé, ta Vie
          d'Écurie et ta progression sont sauvegardés sur cet appareil, pas dans le match en
          cours — rien n'est perdu.
        </p>
        <button className="btn" onClick={() => window.location.reload()}>
          🔄 Relancer Coach Arena
        </button>
      </div>
    )
  }
}
