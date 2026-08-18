import type { CombatEvent, FighterState, MatchState } from '../game/types'
import { HYPE_MAX, ULTI_MAX } from '../game/combat'

// Rendu canvas 9:16 style manga : silhouettes vectorielles dynamiques,
// speed lines, onomatopées flottantes, flash d'impact, HUD de combat.

export const CANVAS_W = 540
export const CANVAS_H = 960

// Morphologie par archétype : le vétéran est massif, l'insaisissable
// fluette. Table statique — hors de drawFighter() pour ne pas réallouer
// 6 objets à chaque combattant à chaque frame (2× par frame, 60 fps).
const BODY: Record<string, { scale: number; torso: number; limb: number; head: number }> = {
  brawler: { scale: 1.08, torso: 27, limb: 13, head: 21 },
  rival: { scale: 1.0, torso: 18, limb: 10, head: 19 },
  prodigy: { scale: 0.97, torso: 17, limb: 9, head: 19 },
  veteran: { scale: 1.16, torso: 31, limb: 14, head: 20 },
  beast: { scale: 1.05, torso: 22, limb: 12, head: 20 },
  trickster: { scale: 0.92, torso: 14, limb: 8, head: 18 },
}

interface FloatingText {
  text: string
  x: number
  y: number
  t0: number
  life: number
  size: number
  color: string
  angle: number
}

export class ArenaRenderer {
  private floats: FloatingText[] = []
  private flashUntil = 0
  private flashColor = '#fff'
  private shakeUntil = 0
  private shakeMag = 0
  private specialBannerUntil = 0
  private specialBannerText = ''
  private lastEventIndex = 0
  private speedLineSeed = Math.random() * 1000
  /** zoom dramatique (spécial) : actif jusqu'à cet instant, centré sur focusX */
  private zoomUntil = 0
  private zoomStart = 0
  private zoomFocusX = CANVAS_W / 2
  /** écran fissuré (KO) */
  private crackUntil = 0
  private crackX = CANVAS_W / 2
  private crackY = 600
  private crackSeed = 1
  /** ligne du commentateur shōnen */
  private commentText = ''
  private commentWeight: 1 | 2 | 3 = 1
  private commentUntil = 0
  /** WCAG 2.3.3 — désactive le shake et le zoom brusque pour les
   * utilisateurs sujets au mal des transports / troubles vestibulaires.
   * Le flash d'impact reste (couleur, pas de mouvement).
   * try/catch, pas juste les gardes typeof : certains navigateurs
   * durcis / extensions anti-fingerprinting font planter `matchMedia`
   * lui-même (ou la lecture de `.matches`), pas seulement le rendre
   * absent — même famille de piège que `hasStorage` dans cardForge.ts/
   * deckBuilder.ts/onboarding.ts/progression.ts/stable.ts/story.ts. Sans
   * ce filet, `new ArenaRenderer()` plantait DANS son initialiseur de
   * champ, remontant jusqu'à l'ErrorBoundary — l'écran « K.O. TECHNIQUE »
   * à la place du match entier, pour un simple réglage d'accessibilité
   * (trouvé en audit, 2026-08-18).
   * Limite assumée : lu une seule fois à la construction, un changement
   * du réglage OS en cours de match ne prend effet qu'au match suivant
   * (pas d'écouteur live — l'ArenaRenderer n'a pas de cycle de vie
   * dispose(), un `addEventListener` non retiré fuirait). */
  private reducedMotion = (() => {
    try {
      return (
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      )
    } catch {
      return false
    }
  })()

  /** Consomme les nouveaux events du match pour déclencher les FX. */
  ingestEvents(m: MatchState, now: number) {
    for (; this.lastEventIndex < m.events.length; this.lastEventIndex++) {
      const ev = m.events[this.lastEventIndex]
      this.onEvent(m, ev, now)
    }
  }

  /** Pousse un texte flottant — les champs non fournis retombent sur des
   *  valeurs neutres (vie 1s, taille 32, blanc, aucun angle/délai). */
  private pushFloat(
    text: string,
    x: number,
    y: number,
    now: number,
    opts: { life?: number; size?: number; color?: string; angle?: number; delay?: number } = {},
  ) {
    this.floats.push({
      text,
      x,
      y,
      t0: now + (opts.delay ?? 0),
      life: opts.life ?? 1,
      size: opts.size ?? 32,
      color: opts.color ?? '#ffffff',
      angle: opts.angle ?? 0,
    })
  }

  private onEvent(m: MatchState, ev: CombatEvent, now: number) {
    const fx = (side: 'player' | 'enemy') =>
      (side === 'player' ? m.player.x : m.enemy.x) * CANVAS_W
    switch (ev.kind) {
      case 'hit':
        this.pushFloat(ev.onoma, fx(ev.target), 520 - Math.random() * 80, now, {
          life: 0.8,
          size: ev.crit ? 64 : 42,
          color: ev.crit ? '#ffdd00' : '#ffffff',
          angle: (Math.random() - 0.5) * 0.4,
        })
        this.pushFloat(`-${ev.dmg}`, fx(ev.target) + 30, 430, now, {
          life: 0.9,
          size: 30,
          color: ev.crit ? '#ff3355' : '#ff7788',
        })
        this.shake(now, ev.crit ? 14 : 7)
        if (ev.crit) this.flash(now, '#fff', 0.08)
        break
      case 'blocked':
        this.pushFloat('GUARD!', fx(ev.target), 500, now, { life: 0.6, size: 32, color: '#7ec8ff' })
        break
      case 'dodged':
        this.pushFloat('SWOOSH', fx(ev.target), 500, now, { life: 0.6, size: 30, color: '#aaffcc', angle: -0.2 })
        break
      case 'countered':
        this.pushFloat('CONTRE !!', CANVAS_W / 2, 470, now, { life: 1, size: 52, color: '#ffaa00', angle: 0.1 })
        this.shake(now, 12)
        break
      case 'special':
        this.specialBannerText = ev.name.toUpperCase()
        this.specialBannerUntil = now + 1.6
        this.pushFloat(ev.onoma, CANVAS_W / 2, 500, now, {
          life: 1.1,
          size: 76,
          color: '#ffdd00',
          angle: -0.08,
          delay: 0.4,
        })
        this.flash(now, '#fff', 0.16)
        this.shake(now, 22)
        // Zoom dramatique sur celui qui déclenche
        this.zoomStart = now
        this.zoomUntil = now + 1.5
        this.zoomFocusX = (ev.by === 'player' ? m.player.x : m.enemy.x) * CANVAS_W
        break
      case 'ulti':
        this.specialBannerText = '★ ' + ev.name.toUpperCase() + ' ★'
        this.specialBannerUntil = now + 2.4
        this.pushFloat(ev.onoma, CANVAS_W / 2, 500, now, {
          life: 1.5,
          size: 84,
          color: '#ff3366',
          angle: -0.06,
          delay: 0.5,
        })
        this.pushFloat(`-${ev.dmg}`, CANVAS_W / 2, 560, now, {
          life: 1.2,
          size: 44,
          color: '#ff3366',
          angle: 0.05,
          delay: 0.9,
        })
        this.flash(now, '#ff3366', 0.22)
        this.shake(now, 34)
        this.zoomStart = now
        this.zoomUntil = now + 2.2
        this.zoomFocusX = (ev.by === 'player' ? m.player.x : m.enemy.x) * CANVAS_W
        break
      case 'ultiReady':
        this.pushFloat('⚡ ULTI PRÊT ⚡', fx(ev.who), 360, now, { life: 1.4, size: 36, color: '#ff3366' })
        break
      case 'card':
        this.pushFloat(`🃏 ${ev.name.toUpperCase()}`, CANVAS_W / 2, 520, now, {
          life: 1.4,
          size: 34,
          color: '#7ec8ff',
          angle: -0.05,
        })
        break
      case 'cardProc':
        this.pushFloat(ev.text, CANVAS_W / 2, 480, now, { life: 1.3, size: 48, color: '#7ec8ff', angle: 0.06 })
        this.flash(now, '#7ec8ff', 0.1)
        this.shake(now, 10)
        break
      case 'switch':
        this.pushFloat(`🔁 ${ev.name.toUpperCase()} MONTE SUR LE RING !`, CANVAS_W / 2, 500, now, {
          life: 1.6,
          size: 36,
          color: ev.side === 'player' ? '#ffdd00' : '#ff7788',
          angle: -0.04,
        })
        this.flash(now, '#ffffff', 0.08)
        break
      case 'trait':
        this.pushFloat(ev.text, m.player.x * CANVAS_W, 390, now, { life: 1.2, size: 26, color: ev.color, angle: -0.04 })
        break
      case 'confused':
        this.pushFloat('?? CONFUS ??', fx(ev.who), 400, now, { life: 1.2, size: 30, color: '#cc88ff' })
        break
      case 'hypeFull':
        this.pushFloat('★ HYPE MAX ★', fx(ev.who), 380, now, { life: 1.2, size: 34, color: '#ffdd00' })
        break
      case 'roundStart':
        this.pushFloat(`ROUND ${ev.round}`, CANVAS_W / 2, 440, now, { life: 1.6, size: 64 })
        break
      case 'roundEnd': {
        this.pushFloat(ev.winner === 'player' ? 'ROUND GAGNÉ !' : 'ROUND PERDU…', CANVAS_W / 2, 460, now, {
          life: 2,
          size: 46,
          color: ev.winner === 'player' ? '#ffdd00' : '#8899aa',
        })
        // KO (et pas décision aux points) → l'écran se fissure sur le perdant
        const loser = ev.winner === 'player' ? m.enemy : m.player
        if (loser.hp <= 0) {
          this.crackUntil = now + 1.4
          this.crackX = loser.x * CANVAS_W
          this.crackY = 600
          this.crackSeed = Math.floor(now * 997) % 1000 || 1
        }
        break
      }
      case 'matchEnd':
        this.flash(now, ev.winner === 'player' ? '#ffdd00' : '#223', 0.3)
        break
      case 'timeout':
        if (ev.side === 'player') {
          this.flash(now, '#4a4370', 0.18)
          this.shake(now, 8)
        }
        break
    }
  }

  private flash(now: number, color: string, dur: number) {
    this.flashUntil = now + dur
    this.flashColor = color
  }

  private shake(now: number, mag: number) {
    this.shakeUntil = now + 0.25
    this.shakeMag = mag
  }

  draw(ctx: CanvasRenderingContext2D, m: MatchState, now: number, roundTimeLeft: number) {
    this.ingestEvents(m, now)

    ctx.save()
    // Screen shake
    if (!this.reducedMotion && now < this.shakeUntil) {
      const k = (this.shakeUntil - now) / 0.25
      ctx.translate((Math.random() - 0.5) * this.shakeMag * k, (Math.random() - 0.5) * this.shakeMag * k)
    }

    // Zoom dramatique (spécial) : pousse vite, relâche doucement
    if (!this.reducedMotion && now < this.zoomUntil) {
      const total = this.zoomUntil - this.zoomStart
      const p = (now - this.zoomStart) / total
      const intensity = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8
      const scale = 1 + 0.32 * intensity
      const fy = 560
      ctx.translate(this.zoomFocusX, fy)
      ctx.scale(scale, scale)
      ctx.translate(-this.zoomFocusX, -fy)
    }

    this.drawBackground(ctx, m, now)
    this.drawRing(ctx)

    // Combattants (le plus touché récemment dessiné au-dessus)
    this.drawFighter(ctx, m.player, now, false)
    this.drawFighter(ctx, m.enemy, now, true)

    this.drawFloats(ctx, now)
    this.drawCracks(ctx, now)

    // Vignette : concentre l'œil sur le ring (avant le HUD, qui reste net).
    const vg = ctx.createRadialGradient(CANVAS_W / 2, 540, 260, CANVAS_W / 2, 540, 620)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(1, 'rgba(5,4,12,0.5)')
    ctx.fillStyle = vg
    ctx.fillRect(-30, -30, CANVAS_W + 60, CANVAS_H + 60)

    this.drawHUD(ctx, m, roundTimeLeft)
    this.drawCommentary(ctx, now)
    this.drawSpecialBanner(ctx, now)
    // Le Temps Mort DOIT être visible sur le canvas enregistré — l'overlay
    // de sélection de carte est du DOM, invisible dans les clips exportés ;
    // sans ce bandeau, un temps mort ressemblerait à un bug de lag figé.
    if (m.phase === 'timeout') this.drawTimeoutBanner(ctx, now)

    // Flash d'impact
    if (now < this.flashUntil) {
      ctx.globalAlpha = Math.min(0.85, (this.flashUntil - now) * 8)
      ctx.fillStyle = this.flashColor
      ctx.fillRect(-30, -30, CANVAS_W + 60, CANVAS_H + 60)
      ctx.globalAlpha = 1
    }
    ctx.restore()
  }

  // -- fond 2.5D : horizon, projecteurs, foule en perspective ---------------

  private drawBackground(ctx: CanvasRenderingContext2D, m: MatchState, now: number) {
    const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H)
    g.addColorStop(0, '#151327')
    g.addColorStop(0.6, '#0b0b12')
    g.addColorStop(1, '#1a0f1e')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

    const hype = Math.max(m.player.hype, m.enemy.hype) / HYPE_MAX

    // Lueur d'horizon derrière la foule : la salle respire avec la Hype.
    const hg = ctx.createRadialGradient(CANVAS_W / 2, 445, 30, CANVAS_W / 2, 445, 360)
    hg.addColorStop(0, `rgba(120,100,220,${0.16 + hype * 0.12})`)
    hg.addColorStop(1, 'transparent')
    ctx.fillStyle = hg
    ctx.fillRect(0, 100, CANVAS_W, 420)

    // Projecteurs : cônes de lumière qui balaient doucement la scène.
    for (let i = 0; i < 3; i++) {
      const baseX = 90 + i * 180
      const sway = Math.sin(now * 0.5 + i * 2.1) * 60
      const lg = ctx.createLinearGradient(0, 60, 0, 620)
      lg.addColorStop(0, 'rgba(200,190,255,0.10)')
      lg.addColorStop(1, 'rgba(200,190,255,0)')
      ctx.fillStyle = lg
      ctx.beginPath()
      ctx.moveTo(baseX - 12, 60)
      ctx.lineTo(baseX + 12, 60)
      ctx.lineTo(baseX + sway + 90, 620)
      ctx.lineTo(baseX + sway - 90, 620)
      ctx.closePath()
      ctx.fill()
    }

    // Speed lines radiales — plus denses quand la hype monte / pendant un special
    const special = now < this.specialBannerUntil
    const count = special ? 60 : 18 + Math.floor(hype * 24)
    const cx = CANVAS_W / 2
    const cy = 470
    ctx.strokeStyle = special ? 'rgba(255,221,0,0.25)' : 'rgba(255,255,255,0.07)'
    ctx.lineWidth = 2
    for (let i = 0; i < count; i++) {
      const a = ((i * 137.5 + this.speedLineSeed + now * 40) % 360) * (Math.PI / 180)
      const r1 = 220 + ((i * 53) % 120)
      const r2 = 720
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2)
      ctx.stroke()
    }

    // Foule en perspective : les rangées lointaines sont hautes, petites et
    // serrées ; les proches, basses, larges et sombres. Quelques fans
    // brandissent des bâtons lumineux quand la salle chauffe.
    for (let row = 0; row < 5; row++) {
      const depth = row / 4 // 0 = loin, 1 = proche
      const y = 285 + depth * 150
      const r = 3.5 + depth * 4
      const step = 13 + depth * 12
      const alpha = 0.3 + depth * 0.25
      ctx.fillStyle = `rgba(58,50,96,${alpha})`
      for (let x = 6 + ((row * 9) % step); x < CANVAS_W; x += step) {
        const bob = Math.sin(now * (2.4 + depth) + x * 0.31 + row * 1.7) * (1.5 + hype * (2 + depth * 3))
        ctx.beginPath()
        ctx.arc(x, y + bob, r, 0, Math.PI * 2)
        ctx.fill()
        // fan lumineux occasionnel (déterministe, densité liée à la Hype)
        if (hype > 0.35 && (x * 7 + row * 5) % 37 < 2 + hype * 4) {
          ctx.fillStyle = (x + row) % 2 ? 'rgba(255,221,0,0.6)' : 'rgba(255,51,102,0.55)'
          ctx.fillRect(x - 1, y + bob - r - 8, 2.5, 7)
          ctx.fillStyle = `rgba(58,50,96,${alpha})`
        }
      }
    }
  }

  // -- ring 2.5D : lattes convergentes, cercle central, poteaux, cordes -----

  private drawRing(ctx: CanvasRenderingContext2D) {
    const topY = 560
    const botY = 790
    const topL = 40
    const topR = CANVAS_W - 40
    const botL = -70
    const botR = CANVAS_W + 70
    const vpX = CANVAS_W / 2 // point de fuite
    const vpY = 250

    // Tablier (mat)
    const mg = ctx.createLinearGradient(0, topY, 0, botY)
    mg.addColorStop(0, '#2c2646')
    mg.addColorStop(1, '#1d1930')
    ctx.fillStyle = mg
    ctx.beginPath()
    ctx.moveTo(topL, topY)
    ctx.lineTo(topR, topY)
    ctx.lineTo(botR, botY)
    ctx.lineTo(botL, botY)
    ctx.closePath()
    ctx.fill()

    // Lattes du sol : rayons issus du point de fuite, clippés au tablier.
    ctx.save()
    ctx.clip() // le path du tablier est encore actif
    ctx.strokeStyle = 'rgba(120,110,180,0.22)'
    ctx.lineWidth = 2
    for (let i = 0; i <= 8; i++) {
      const xTop = topL + ((topR - topL) * i) / 8
      // prolonge la droite (vp → bord haut) jusqu'au bas de l'écran
      const dx = xTop - vpX
      const dy = topY - vpY
      const k = (botY - vpY) / dy
      ctx.beginPath()
      ctx.moveTo(xTop, topY)
      ctx.lineTo(vpX + dx * k, botY)
      ctx.stroke()
    }
    // Traverses horizontales, resserrées vers le haut (profondeur)
    for (const p of [0.18, 0.42, 0.72]) {
      const y = topY + (botY - topY) * p
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(CANVAS_W, y)
      ctx.stroke()
    }
    // Cercle central du ring
    ctx.strokeStyle = 'rgba(255,51,102,0.35)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.ellipse(CANVAS_W / 2, 668, 118, 30, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,221,0,0.25)'
    ctx.beginPath()
    ctx.ellipse(CANVAS_W / 2, 668, 62, 15, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()

    // Liseré avant du tablier
    ctx.strokeStyle = '#4a4370'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(topL, topY)
    ctx.lineTo(topR, topY)
    ctx.stroke()

    // Poteaux de coin + tendeurs
    for (const side of [-1, 1] as const) {
      const px = side === -1 ? 22 : CANVAS_W - 22
      const pg = ctx.createLinearGradient(px - 7, 0, px + 7, 0)
      pg.addColorStop(0, '#3a3560')
      pg.addColorStop(0.5, '#6c64a8')
      pg.addColorStop(1, '#2c2846')
      ctx.fillStyle = pg
      ctx.fillRect(px - 7, 415, 14, topY - 415)
      ctx.fillStyle = '#ff3366'
      ctx.beginPath()
      ctx.arc(px, 415, 9, 0, Math.PI * 2)
      ctx.fill()
    }

    // Cordes : légère tension + reflet — attachées aux poteaux.
    for (let i = 0; i < 3; i++) {
      const y = topY - 40 - i * 34
      const sag = 6 - i * 1.5
      ctx.strokeStyle = i === 1 ? '#ffffff' : '#ff3366'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(22, y)
      ctx.quadraticCurveTo(CANVAS_W / 2, y + sag, CANVAS_W - 22, y)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(22, y - 1.5)
      ctx.quadraticCurveTo(CANVAS_W / 2, y + sag - 1.5, CANVAS_W - 22, y - 1.5)
      ctx.stroke()
    }
  }

  // -- combattant : silhouette vectorielle dynamique ------------------------

  private drawFighter(ctx: CanvasRenderingContext2D, f: FighterState, now: number, isEnemy: boolean) {
    const x = f.x * CANVAS_W
    const groundY = 660
    const anim = now < f.anim.until ? f.anim.kind : 'idle'
    const facing = f.facing
    const c = f.char.color
    const c2 = f.char.color2
    const body = BODY[f.char.archetype] ?? BODY.prodigy

    ctx.save()
    ctx.translate(x, groundY)
    ctx.scale(facing * body.scale, body.scale)

    // Ombre portée au sol : ancre le perso dans la perspective du ring.
    ctx.fillStyle = 'rgba(0,0,0,0.38)'
    ctx.beginPath()
    ctx.ellipse(0, 8, 48, 11, 0, 0, Math.PI * 2)
    ctx.fill()

    // Aura de hype
    const hypeRatio = f.hype / HYPE_MAX
    if (hypeRatio > 0.5) {
      const pulse = 1 + Math.sin(now * 10) * 0.06
      ctx.globalAlpha = (hypeRatio - 0.5) * 1.2
      const ag = ctx.createRadialGradient(0, -80, 20, 0, -80, 120 * pulse)
      ag.addColorStop(0, c2)
      ag.addColorStop(1, 'transparent')
      ctx.fillStyle = ag
      ctx.beginPath()
      ctx.arc(0, -80, 120 * pulse, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }

    // Pose selon l'animation — la fente (lunge) vend le mouvement.
    let lean = 0
    let lunge = 0
    let armF = { x: 30, y: -95 } // bras avant (poing)
    let armB = { x: -18, y: -90 }
    let crouch = 0
    switch (anim) {
      case 'attack':
        lean = 0.4
        lunge = 20
        armF = { x: 66, y: -102 }
        armB = { x: -26, y: -78 }
        break
      case 'special':
        lean = 0.15
        lunge = 10
        armF = { x: 72, y: -134 }
        armB = { x: -30, y: -70 }
        crouch = -12 // il décolle
        break
      case 'hurt':
        lean = -0.35
        lunge = -10
        armF = { x: 8, y: -68 }
        break
      case 'guard':
        lean = -0.05
        armF = { x: 24, y: -120 }
        armB = { x: 18, y: -114 }
        crouch = 10
        break
      case 'dodge':
        lean = -0.55
        lunge = -18
        crouch = 16
        armF = { x: 14, y: -110 }
        break
      case 'ko':
        // au sol
        ctx.rotate(-Math.PI / 2.2)
        crouch = 30
        break
      case 'idle': {
        const bob = Math.sin(now * 4) * 3
        crouch = bob
        // légère danse de garde
        lunge = Math.sin(now * 2.3) * 4
        break
      }
    }
    ctx.translate(lunge, 0)
    ctx.rotate(lean * 0.3)

    const bodyY = -60 + crouch
    const headY = -128 + crouch

    // -- silhouette encrée : chaque forme est cerclée d'un contour manga --
    const OUT = '#161325'
    const hipY = bodyY + 22
    const shoulderY = headY + 30

    /** Membre courbé en deux temps (coude/genou implicite), avec contour. */
    const seg = (x1: number, y1: number, x2: number, y2: number, bend: number, color: string, w: number) => {
      const mx = (x1 + x2) / 2
      const my = (y1 + y2) / 2
      const dx = x2 - x1
      const dy = y2 - y1
      const len = Math.hypot(dx, dy) || 1
      const cxp = mx + (-dy / len) * bend
      const cyp = my + (dx / len) * bend
      for (const [col, ww] of [
        [OUT, w + 5],
        [color, w],
      ] as const) {
        ctx.strokeStyle = col
        ctx.lineWidth = ww
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.quadraticCurveTo(cxp, cyp, x2, y2)
        ctx.stroke()
      }
    }

    // Jambes (genou implicite) + pieds
    seg(0, hipY, -14, -6, 7, c, body.limb)
    seg(0, hipY, 20, -2, -7, c, body.limb)
    ctx.fillStyle = OUT
    ctx.beginPath()
    ctx.ellipse(-17, -3, 11, 5.5, -0.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(24, 1, 11, 5.5, 0.15, 0, Math.PI * 2)
    ctx.fill()

    // Torse habillé : épaules larges → taille, col en V et ceinture
    const shW = body.torso * 0.92
    const waW = body.torso * 0.55
    ctx.fillStyle = c
    ctx.strokeStyle = OUT
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(-shW + 2, shoulderY)
    ctx.lineTo(shW + 6, shoulderY)
    ctx.quadraticCurveTo(shW + 2, (shoulderY + hipY) / 2, waW + 2, hipY)
    ctx.lineTo(-waW, hipY)
    ctx.quadraticCurveTo(-shW - 2, (shoulderY + hipY) / 2, -shW + 2, shoulderY)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    // col en V
    ctx.strokeStyle = c2
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(-6, shoulderY + 2)
    ctx.lineTo(4, shoulderY + 14)
    ctx.lineTo(14, shoulderY + 2)
    ctx.stroke()
    // ceinture nouée
    ctx.fillStyle = c2
    ctx.strokeStyle = OUT
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.rect(-waW - 2, hipY - 8, waW * 2 + 6, 9)
    ctx.fill()
    ctx.stroke()

    // Bras (coude implicite) + gants
    const armW = Math.max(8, body.limb - 2)
    seg(-4, shoulderY + 4, armB.x, armB.y + crouch, 9, c2, armW)
    seg(6, shoulderY + 4, armF.x, armF.y + crouch, -9, c2, armW)
    for (const [ax, ay, r] of [
      [armF.x, armF.y + crouch, 10.5],
      [armB.x, armB.y + crouch, 9],
    ] as const) {
      ctx.fillStyle = c2
      ctx.strokeStyle = OUT
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(ax, ay, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }

    // Tête cerclée + bandeau
    ctx.fillStyle = '#ffe0c2'
    ctx.strokeStyle = OUT
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(6, headY, body.head, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = c
    ctx.strokeStyle = OUT
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.rect(-14, headY - 12, 40, 9) // bandeau
    ctx.fill()
    ctx.stroke()
    // Mèche manga
    ctx.strokeStyle = isEnemy ? '#2d3436' : c
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(-8, headY - 14)
    ctx.quadraticCurveTo(-22, headY - 30, -10, headY - 34)
    ctx.stroke()

    // Visage expressif selon l'état
    const koOrHurt = anim === 'hurt' || anim === 'ko'
    if (koOrHurt) {
      // œil fermé de douleur (>)
      ctx.strokeStyle = '#1a1a1a'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(12, headY - 8)
      ctx.lineTo(20, headY - 4)
      ctx.lineTo(12, headY)
      ctx.stroke()
    } else {
      // sourcil froncé + œil avec pupille dirigée vers l'adversaire
      ctx.strokeStyle = '#1a1a1a'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(10, headY - 12)
      ctx.lineTo(24, headY - 8)
      ctx.stroke()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.ellipse(17, headY - 3, 5, 4, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#1a1a1a'
      ctx.beginPath()
      ctx.arc(19, headY - 3, 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
    // bouche : cri en attaque/spécial, grimace quand touché, neutre sinon
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 2.5
    if (anim === 'attack' || anim === 'special') {
      ctx.fillStyle = '#7a2030'
      ctx.beginPath()
      ctx.ellipse(14, headY + 11, 5, 6, 0, 0, Math.PI * 2)
      ctx.fill()
    } else if (koOrHurt) {
      ctx.beginPath()
      ctx.moveTo(9, headY + 12)
      ctx.lineTo(19, headY + 10)
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.moveTo(10, headY + 10)
      ctx.lineTo(18, headY + 11)
      ctx.stroke()
    }
    // goutte de sueur quand les PV sont bas
    if (f.hp / f.maxHp < 0.3 && anim !== 'ko') {
      ctx.fillStyle = '#8ed6ff'
      ctx.beginPath()
      ctx.ellipse(-8, headY - 2 + Math.sin(now * 6) * 2, 3, 5, 0.2, 0, Math.PI * 2)
      ctx.fill()
    }

    // Attribut distinctif de l'archétype
    switch (f.char.archetype) {
      case 'beast': {
        // oreilles pointues + queue
        ctx.fillStyle = c
        ctx.beginPath()
        ctx.moveTo(-6, headY - 16)
        ctx.lineTo(-14, headY - 34)
        ctx.lineTo(2, headY - 20)
        ctx.closePath()
        ctx.moveTo(14, headY - 17)
        ctx.lineTo(20, headY - 34)
        ctx.lineTo(24, headY - 16)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = c
        ctx.lineWidth = 7
        ctx.beginPath()
        ctx.moveTo(-8, bodyY + 18)
        ctx.quadraticCurveTo(-40, bodyY + 6, -44, bodyY - 22 + Math.sin(now * 3) * 6)
        ctx.stroke()
        break
      }
      case 'veteran': {
        // barbe grise
        ctx.fillStyle = '#c8cdd2'
        ctx.beginPath()
        ctx.arc(8, headY + 12, 12, 0, Math.PI)
        ctx.fill()
        break
      }
      case 'rival': {
        // longue mèche sombre qui flotte
        ctx.strokeStyle = '#2d3436'
        ctx.lineWidth = 6
        ctx.beginPath()
        ctx.moveTo(-6, headY - 12)
        ctx.quadraticCurveTo(-30, headY + 6, -34 + Math.sin(now * 2) * 4, headY + 34)
        ctx.stroke()
        break
      }
      case 'prodigy': {
        // queue de cheval haute
        ctx.strokeStyle = c
        ctx.lineWidth = 6
        ctx.beginPath()
        ctx.moveTo(-4, headY - 16)
        ctx.quadraticCurveTo(-24, headY - 6, -22 + Math.sin(now * 2.6) * 3, headY + 22)
        ctx.stroke()
        break
      }
      case 'trickster': {
        // foulard flottant
        ctx.strokeStyle = c2
        ctx.lineWidth = 5
        ctx.beginPath()
        ctx.moveTo(0, headY + 20)
        ctx.quadraticCurveTo(-28, headY + 24 + Math.sin(now * 4) * 5, -42, headY + 14 + Math.sin(now * 4 + 1) * 7)
        ctx.stroke()
        break
      }
      case 'brawler':
        // bandes de poings
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(armF.x, armF.y + crouch, 9, 0, Math.PI * 2)
        ctx.stroke()
        break
    }

    // Traînée de vitesse en attaque
    if (anim === 'attack' || anim === 'special') {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx.lineWidth = 3
      for (let i = 0; i < 3; i++) {
        ctx.beginPath()
        ctx.moveTo(armF.x - 30 - i * 12, armF.y + crouch - 6 + i * 6)
        ctx.lineTo(armF.x - 6, armF.y + crouch)
        ctx.stroke()
      }
    }

    ctx.restore()

    // État confus au-dessus de la tête
    if (now < f.confusedUntil) {
      ctx.fillStyle = '#cc88ff'
      ctx.font = 'bold 26px sans-serif'
      ctx.textAlign = 'center'
      const spin = now * 6
      ctx.fillText('?', x - 16 + Math.cos(spin) * 10, groundY - 170)
      ctx.fillText('?', x + 16 + Math.cos(spin + 2) * 10, groundY - 178)
    }
  }

  // -- textes flottants (onomatopées, dégâts) -------------------------------

  private drawFloats(ctx: CanvasRenderingContext2D, now: number) {
    this.floats = this.floats.filter(f => now - f.t0 < f.life)
    for (const f of this.floats) {
      const age = now - f.t0
      if (age < 0) continue
      const k = age / f.life
      ctx.save()
      ctx.translate(f.x, f.y - k * 50)
      ctx.rotate(f.angle)
      const scale = k < 0.15 ? 0.5 + (k / 0.15) * 0.7 : 1.2 - k * 0.2
      ctx.scale(scale, scale)
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1
      ctx.font = `900 ${f.size}px 'Arial Black', sans-serif`
      ctx.textAlign = 'center'
      ctx.lineWidth = f.size / 7
      ctx.strokeStyle = '#111'
      ctx.strokeText(f.text, 0, 0)
      ctx.fillStyle = f.color
      ctx.fillText(f.text, 0, 0)
      ctx.restore()
    }
  }

  // -- commentateur shōnen --------------------------------------------------

  setCommentary(text: string, weight: 1 | 2 | 3, now: number) {
    this.commentText = text
    this.commentWeight = weight
    this.commentUntil = now + (weight === 3 ? 4.5 : weight === 2 ? 3.2 : 2.4)
  }

  private drawCommentary(ctx: CanvasRenderingContext2D, now: number) {
    if (now >= this.commentUntil || !this.commentText) return
    const k = this.commentUntil - now
    const size = this.commentWeight === 3 ? 26 : this.commentWeight === 2 ? 22 : 18
    ctx.save()
    ctx.globalAlpha = Math.min(1, k * 3)
    // Coupe en deux lignes au besoin (au dernier espace avant le milieu)
    const text = this.commentText
    let lines: string[] = [text]
    if (text.length > 34) {
      const cut = text.lastIndexOf(' ', Math.ceil(text.length / 2) + 6)
      if (cut > 0) lines = [text.slice(0, cut), text.slice(cut + 1)]
    }
    const y0 = 150
    const h = lines.length * (size + 8) + 14
    ctx.fillStyle = 'rgba(8,6,16,0.72)'
    ctx.fillRect(0, y0 - size - 8, CANVAS_W, h)
    ctx.fillStyle = this.commentWeight === 3 ? '#ffdd00' : '#ffffff'
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 4
    ctx.textAlign = 'center'
    ctx.font = `900 italic ${size}px sans-serif`
    lines.forEach((l, i) => {
      const y = y0 + i * (size + 8)
      ctx.strokeText(l, CANVAS_W / 2, y)
      ctx.fillText(l, CANVAS_W / 2, y)
    })
    ctx.restore()
  }

  // -- écran fissuré (KO) ---------------------------------------------------

  private drawCracks(ctx: CanvasRenderingContext2D, now: number) {
    if (now >= this.crackUntil) return
    const k = this.crackUntil - now
    const appear = Math.min(1, (1.4 - k) * 8) // les fissures jaillissent
    // pseudo-aléatoire déterministe : les fissures ne scintillent pas
    const rnd = (i: number) => {
      const x = Math.sin(i * 127.1 + this.crackSeed * 311.7) * 43758.5453
      return x - Math.floor(x)
    }
    ctx.save()
    ctx.globalAlpha = Math.min(1, k * 2)
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2 + rnd(i) * 0.6
      const len = (140 + rnd(i + 50) * 260) * appear
      let x = this.crackX
      let y = this.crackY
      ctx.beginPath()
      ctx.moveTo(x, y)
      const segs = 4
      for (let s = 1; s <= segs; s++) {
        const r = (len / segs) * s
        const jitter = (rnd(i * 10 + s) - 0.5) * 40
        x = this.crackX + Math.cos(angle) * r + Math.cos(angle + Math.PI / 2) * jitter
        y = this.crackY + Math.sin(angle) * r + Math.sin(angle + Math.PI / 2) * jitter
        ctx.lineTo(x, y)
      }
      ctx.strokeStyle = '#0a0a12'
      ctx.lineWidth = 5
      ctx.stroke()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.stroke()
    }
    ctx.restore()
  }

  // -- HUD ------------------------------------------------------------------

  private drawHUD(ctx: CanvasRenderingContext2D, m: MatchState, roundTimeLeft: number) {
    this.drawHealthBar(ctx, m.player, 16, 40, false)
    this.drawHealthBar(ctx, m.enemy, CANVAS_W - 16, 40, true)

    // Timer + round au centre
    ctx.textAlign = 'center'
    ctx.font = '900 34px sans-serif'
    ctx.fillStyle = roundTimeLeft < 10 ? '#ff3355' : '#ffffff'
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 5
    const timerText = m.phase === 'fighting' ? `${Math.max(0, Math.ceil(roundTimeLeft))}` : '—'
    ctx.strokeText(timerText, CANVAS_W / 2, 58)
    ctx.fillText(timerText, CANVAS_W / 2, 58)
    ctx.font = 'bold 15px sans-serif'
    ctx.fillStyle = '#ffdd00'
    ctx.fillText(`ROUND ${m.round} — BO3`, CANVAS_W / 2, 82)

    // Étoiles de victoire
    ctx.font = 'bold 20px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = '#ffdd00'
    ctx.fillText('★'.repeat(m.playerWins) + '☆'.repeat(2 - m.playerWins), 18, 118)
    ctx.textAlign = 'right'
    ctx.fillText('☆'.repeat(2 - m.enemyWins) + '★'.repeat(m.enemyWins), CANVAS_W - 18, 118)

    // L'Écurie : le banc sous les étoiles — pastille + mini-barre de PV par
    // équipier (les clips doivent montrer que c'est un combat d'équipe).
    this.drawBench(ctx, m.bench, 18, 132, false)
    this.drawBench(ctx, m.enemyBench, CANVAS_W - 18, 132, true)
  }

  private drawBench(
    ctx: CanvasRenderingContext2D,
    bench: FighterState[],
    x: number,
    y: number,
    rightAlign: boolean,
  ) {
    const w = 54
    for (let i = 0; i < bench.length; i++) {
      const b = bench[i]
      const x0 = rightAlign ? x - w - i * (w + 8) : x + i * (w + 8)
      const alive = b.hp > 0
      // pastille couleur du perso
      ctx.fillStyle = alive ? b.char.color : '#444'
      ctx.strokeStyle = '#111'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x0 + 6, y + 4, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      if (!alive) {
        ctx.strokeStyle = '#ff5566'
        ctx.beginPath()
        ctx.moveTo(x0 + 1, y - 1)
        ctx.lineTo(x0 + 11, y + 9)
        ctx.moveTo(x0 + 11, y - 1)
        ctx.lineTo(x0 + 1, y + 9)
        ctx.stroke()
      }
      // mini-barre de PV
      ctx.fillStyle = '#222'
      ctx.fillRect(x0 + 15, y, w - 15, 7)
      if (alive) {
        ctx.fillStyle = b.hp / b.maxHp > 0.35 ? '#b6ff6b' : '#ff7788'
        ctx.fillRect(x0 + 15, y, (w - 15) * (b.hp / b.maxHp), 7)
      }
      ctx.strokeStyle = '#111'
      ctx.strokeRect(x0 + 15, y, w - 15, 7)
    }
  }

  private drawHealthBar(ctx: CanvasRenderingContext2D, f: FighterState, x: number, y: number, rightAlign: boolean) {
    const w = 230
    const h = 18
    const x0 = rightAlign ? x - w : x
    // Nom
    ctx.font = '900 17px sans-serif'
    ctx.textAlign = rightAlign ? 'right' : 'left'
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 3
    ctx.strokeText(f.char.name.toUpperCase(), x, y - 6)
    ctx.fillText(f.char.name.toUpperCase(), x, y - 6)
    // PV
    ctx.fillStyle = '#222'
    ctx.fillRect(x0, y, w, h)
    const ratio = f.hp / f.maxHp
    const grad = ctx.createLinearGradient(x0, 0, x0 + w, 0)
    grad.addColorStop(0, ratio > 0.35 ? '#3ddc84' : '#ff3355')
    grad.addColorStop(1, ratio > 0.35 ? '#b6ff6b' : '#ff7788')
    ctx.fillStyle = grad
    if (rightAlign) ctx.fillRect(x0 + w * (1 - ratio), y, w * ratio, h)
    else ctx.fillRect(x0, y, w * ratio, h)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.strokeRect(x0, y, w, h)
    // Hype
    ctx.fillStyle = '#222'
    ctx.fillRect(x0, y + h + 5, w, 8)
    const hr = f.hype / HYPE_MAX
    ctx.fillStyle = hr >= 1 ? '#ffdd00' : '#8f6bff'
    if (rightAlign) ctx.fillRect(x0 + w * (1 - hr), y + h + 5, w * hr, 8)
    else ctx.fillRect(x0, y + h + 5, w * hr, 8)
    // Ulti : jauge de match, sous la Hype
    ctx.fillStyle = '#222'
    ctx.fillRect(x0, y + h + 16, w, 5)
    if (!f.ultiUsed) {
      const ur = f.ulti / ULTI_MAX
      ctx.fillStyle = ur >= 1 ? '#ff3366' : '#b3541e'
      if (rightAlign) ctx.fillRect(x0 + w * (1 - ur), y + h + 16, w * ur, 5)
      else ctx.fillRect(x0, y + h + 16, w * ur, 5)
    }
    if (hr >= 1 || (!f.ultiUsed && f.ulti >= ULTI_MAX)) {
      ctx.font = 'bold 11px sans-serif'
      const ready =
        !f.ultiUsed && f.ulti >= ULTI_MAX
          ? 'ULTI PRÊT — CRIE-LE !'
          : 'SPÉCIAL PRÊT'
      ctx.fillStyle = !f.ultiUsed && f.ulti >= ULTI_MAX ? '#ff3366' : '#ffdd00'
      ctx.fillText(rightAlign ? `${ready} ◀` : `▶ ${ready}`, x, y + h + 33)
    }
  }

  private drawSpecialBanner(ctx: CanvasRenderingContext2D, now: number) {
    if (now >= this.specialBannerUntil) return
    const k = this.specialBannerUntil - now
    ctx.save()
    ctx.globalAlpha = Math.min(1, k * 3)
    ctx.fillStyle = 'rgba(10,8,20,0.82)'
    ctx.fillRect(0, 300, CANVAS_W, 130)
    ctx.strokeStyle = '#ffdd00'
    ctx.lineWidth = 4
    ctx.strokeRect(-10, 300, CANVAS_W + 20, 130)
    ctx.font = `900 ${this.specialBannerText.length > 14 ? 36 : 46}px 'Arial Black', sans-serif`
    ctx.textAlign = 'center'
    ctx.fillStyle = '#ffdd00'
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 6
    ctx.strokeText(this.specialBannerText, CANVAS_W / 2, 380)
    ctx.fillText(this.specialBannerText, CANVAS_W / 2, 380)
    ctx.restore()
  }

  /**
   * Bandeau du Temps Mort — dessiné SUR LE CANVAS (donc dans les clips
   * exportés). L'overlay de sélection de carte est du DOM par-dessus,
   * invisible à l'enregistrement ; sans ce bandeau, un temps mort
   * ressemblerait à un bug de lag figé dans un clip TikTok.
   */
  private drawTimeoutBanner(ctx: CanvasRenderingContext2D, now: number) {
    ctx.save()
    ctx.fillStyle = 'rgba(8, 6, 16, 0.72)'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    const pulse = 1 + Math.sin(now * 5) * 0.04
    ctx.textAlign = 'center'
    ctx.translate(CANVAS_W / 2, 470)
    ctx.scale(pulse, pulse)
    ctx.font = `900 italic 44px 'Arial Black', sans-serif`
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 7
    ctx.strokeText('🛑 TEMPS MORT', 0, 0)
    ctx.fillStyle = '#ffdd00'
    ctx.fillText('🛑 TEMPS MORT', 0, 0)
    ctx.scale(1 / pulse, 1 / pulse)
    ctx.font = '700 20px sans-serif'
    ctx.fillStyle = '#fff'
    ctx.fillText('le coach parle à son perso…', 0, 42)
    ctx.restore()
  }
}
