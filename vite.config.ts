import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Servi depuis un site de projet GitHub Pages (mordrak44.github.io/Coach-Arena/),
// pas la racine du domaine — tous les chemins générés doivent être préfixés.
export default defineConfig({
  base: '/Coach-Arena/',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
})
