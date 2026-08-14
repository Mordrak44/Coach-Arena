// Capture d'écran du jeu en mode démo (?demo) — outil de vérification
// visuelle et de press kit. Usage : node scripts/shot.mjs [outDir]
// Prérequis : `npm run build` puis un serveur (lancé ici via vite preview).
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'

const outDir = process.argv[2] ?? 'shots'
const PORT = 4173

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
})
await new Promise(r => setTimeout(r, 2500))

try {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  })
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } })

  // Le funnel d'entrée : titre puis sélection
  await page.goto(`http://localhost:${PORT}/`)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${outDir}/title.png` })
  await page.click('button')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${outDir}/select.png` })

  // L'arène en mode démo — deux instants différents du match
  await page.goto(`http://localhost:${PORT}/?demo`)
  await page.waitForTimeout(4500)
  await page.screenshot({ path: `${outDir}/arena-1.png` })
  await page.waitForTimeout(6000)
  await page.screenshot({ path: `${outDir}/arena-2.png` })
  await browser.close()
  console.log(`captures écrites dans ${outDir}/`)
} finally {
  server.kill()
}
