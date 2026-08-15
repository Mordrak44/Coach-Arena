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

  // Le funnel d'entrée : titre, vie privée, sélection, vestiaire
  await page.goto(`http://localhost:${PORT}/`)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${outDir}/title.png` })
  await page.click('text=Vie privée')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${outDir}/privacy.png` })
  await page.click('text=Retour')
  await page.waitForTimeout(400)
  await page.click("text=Entrer dans l'arène")
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${outDir}/select.png` })
  await page.click('.charCard')
  await page.waitForTimeout(400)
  await page.click('text=/Coacher .+ !/')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${outDir}/ready.png` })

  // L'arène en mode démo — deux instants différents du match
  await page.goto(`http://localhost:${PORT}/?demo`)
  await page.waitForTimeout(4500)
  await page.screenshot({ path: `${outDir}/arena-1.png` })
  await page.waitForTimeout(6000)
  await page.screenshot({ path: `${outDir}/arena-2.png` })

  // Match complet accéléré (×6) jusqu'à l'écran de résultats
  await page.goto(`http://localhost:${PORT}/?demo=fast`)
  await page.waitForSelector('text=Revanche', { timeout: 180000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${outDir}/results.png` })
  await browser.close()
  console.log(`captures écrites dans ${outDir}/`)
} finally {
  server.kill()
}
