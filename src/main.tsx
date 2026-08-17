import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './ui/ErrorBoundary'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)

// PWA : service worker en production uniquement (le dev server n'aime pas
// être mis en cache). Échec silencieux = simple site web, aucun impact jeu.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    // BASE_URL (pas '/sw.js' en dur) : le site tourne sous un sous-chemin
    // GitHub Pages (/Coach-Arena/), pas à la racine du domaine.
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}
