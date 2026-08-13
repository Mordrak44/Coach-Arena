import type { CombatEvent, FighterState, MatchState } from '../game/types'
import { HYPE_MAX } from '../game/combat'

// Rendu canvas 9:16 style manga : silhouettes vectorielles dynamiques,
// speed lines, onomatopées flottantes, flash d'impact, HUD de combat.

export const CANVAS_W = 540
export const CANVAS_H = 960

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

  /** Consomme les nouveaux events du match pour déclencher les FX. */
  ingestEvents(m: MatchState, now: number) {
    for (; this.lastEventIndex < m.events.length; this.lastEventIndex++) {
      const ev = m.events[this.lastEventIndex]
      this.onEvent(m, ev, now)
    }
  }

  private onEvent(m: MatchState, ev: CombatEvent, now: number) {
    const fx = (side: 'player' | 'enemy') =>
      (side === 'player' ? m.player.x : m.enemy.x) * CANVAS_W
    switch (ev.kind) {
      case 'hit':
        this.floats.push({
          text: ev.onoma,
          x: fx(ev.target),
          y: 520 - Math.random() * 80,
          t0: now,
          life: 0.8,
          size: ev.crit ? 64 : 42,
          color: ev.crit ? '#ffdd00' : '#ffffff',
          angle: (Math.random() - 0.5) * 0.4,
        })
        this.floats.push({
          text: `-${ev.dmg}`,
          x: fx(ev.target) + 30,
          y: 430,
          t0: now,
          life: 0.9,
          size: 30,
          color: ev.crit ? '#ff3355' : '#ff7788',
          angle: 0,
        })
        this.shake(now, ev.crit ? 14 : 7)
        if (ev.crit) this.flash(now, '#fff', 0.08)
        break
      case 'blocked':
        this.floats.push({ text: 'GUARD!', x: fx(ev.target), y: 500, t0: now, life: 0.6, size: 32, color: '#7ec8ff', angle: 0 })
        break
      case 'dodged':
        this.floats.push({ text: 'SWOOSH', x: fx(ev.target), y: 500, t0: now, life: 0.6, size: 30, color: '#aaffcc', angle: -0.2 })
        break
      case 'countered':
        this.floats.push({ text: 'CONTRE !!', x: CANVAS_W / 2, y: 470, t0: now, life: 1, size: 52, color: '#ffaa00', angle: 0.1 })
        this.shake(now, 12)
        break
      case 'special':
        this.specialBannerText = ev.name.toUpperCase()
        this.specialBannerUntil = now + 1.6
        this.floats.push({ text: ev.onoma, x: CANVAS_W / 2, y: 500, t0: now + 0.4, life: 1.1, size: 76, color: '#ffdd00', angle: -0.08 })
        this.flash(now, '#fff', 0.16)
        this.shake(now, 22)
        break
      case 'confused':
        this.floats.push({ text: '?? CONFUS ??', x: fx(ev.who), y: 400, t0: now, life: 1.2, size: 30, color: '#cc88ff', angle: 0 })
        break
      case 'hypeFull':
        this.floats.push({ text: '★ HYPE MAX ★', x: fx(ev.who), y: 380, t0: now, life: 1.2, size: 34, color: '#ffdd00', angle: 0 })
        break
      case 'roundStart':
        this.floats.push({ text: `ROUND ${ev.round}`, x: CANVAS_W / 2, y: 440, t0: now, life: 1.6, size: 64, color: '#ffffff', angle: 0 })
        break
      case 'roundEnd':
        this.floats.push({
          text: ev.winner === 'player' ? 'ROUND GAGNÉ !' : 'ROUND PERDU…',
          x: CANVAS_W / 2, y: 460, t0: now, life: 2, size: 46,
          color: ev.winner === 'player' ? '#ffdd00' : '#8899aa', angle: 0,
        })
        break
      case 'matchEnd':
        this.flash(now, ev.winner === 'player' ? '#ffdd00' : '#223', 0.3)
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
    if (now < this.shakeUntil) {
      const k = (this.shakeUntil - now) / 0.25
      ctx.translate((Math.random() - 0.5) * this.shakeMag * k, (Math.random() - 0.5) * this.shakeMag * k)
    }

    this.drawBackground(ctx, m, now)
    this.drawRing(ctx)

    // Combattants (le plus touché récemment dessiné au-dessus)
    this.drawFighter(ctx, m.player, now, false)
    this.drawFighter(ctx, m.enemy, now, true)

    this.drawFloats(ctx, now)
    this.drawHUD(ctx, m, roundTimeLeft)
    this.drawSpecialBanner(ctx, now)

    // Flash d'impact
    if (now < this.flashUntil) {
      ctx.globalAlpha = Math.min(0.85, (this.flashUntil - now) * 8)
      ctx.fillStyle = this.flashColor
      ctx.fillRect(-30, -30, CANVAS_W + 60, CANVAS_H + 60)
      ctx.globalAlpha = 1
    }
    ctx.restore()
  }

  // -- fond : dégradé sombre + speed lines manga convergentes ---------------

  private drawBackground(ctx: CanvasRenderingContext2D, m: MatchState, now: number) {
    const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H)
    g.addColorStop(0, '#151327')
    g.addColorStop(0.6, '#0b0b12')
    g.addColorStop(1, '#1a0f1e')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

    // Speed lines radiales — plus denses quand la hype monte / pendant un special
    const hype = Math.max(m.player.hype, m.enemy.hype) / HYPE_MAX
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

    // Foule stylisée : rangées de points sombres qui vibrent
    ctx.fillStyle = 'rgba(70,60,110,0.5)'
    for (let row = 0; row < 3; row++) {
      const y = 180 + row * 26
      for (let x = 10; x < CANVAS_W; x += 22) {
        const bob = Math.sin(now * 3 + x * 0.3 + row) * (2 + hype * 4)
        ctx.beginPath()
        ctx.arc(x, y + bob, 7, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  private drawRing(ctx: CanvasRenderingContext2D) {
    // Sol du ring en perspective simple
    ctx.fillStyle = '#241f38'
    ctx.beginPath()
    ctx.moveTo(20, 560)
    ctx.lineTo(CANVAS_W - 20, 560)
    ctx.lineTo(CANVAS_W + 60, 780)
    ctx.lineTo(-60, 780)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#4a4370'
    ctx.lineWidth = 3
    ctx.stroke()
    // Cordes
    ctx.strokeStyle = '#ff3366'
    ctx.lineWidth = 4
    for (let i = 0; i < 3; i++) {
      const y = 560 - 40 - i * 34
      ctx.beginPath()
      ctx.moveTo(14, y)
      ctx.lineTo(CANVAS_W - 14, y)
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

    ctx.save()
    ctx.translate(x, groundY)
    ctx.scale(facing, 1)

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

    // Pose selon l'animation
    let lean = 0
    let armF = { x: 30, y: -95 } // bras avant (poing)
    let armB = { x: -18, y: -90 }
    let crouch = 0
    switch (anim) {
      case 'attack':
        lean = 0.35
        armF = { x: 62, y: -105 }
        break
      case 'special':
        lean = 0.15
        armF = { x: 70, y: -130 }
        crouch = -6
        break
      case 'hurt':
        lean = -0.3
        armF = { x: 10, y: -70 }
        break
      case 'guard':
        lean = -0.05
        armF = { x: 22, y: -118 }
        armB = { x: 16, y: -112 }
        crouch = 8
        break
      case 'dodge':
        lean = -0.5
        crouch = 14
        break
      case 'ko':
        // au sol
        ctx.rotate(-Math.PI / 2.2)
        crouch = 30
        break
      case 'idle': {
        const bob = Math.sin(now * 4) * 3
        crouch = bob
        break
      }
    }
    ctx.rotate(lean * 0.3)

    const bodyY = -60 + crouch
    const headY = -128 + crouch

    // Jambes
    ctx.strokeStyle = c
    ctx.lineWidth = 13
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(0, bodyY + 20)
    ctx.lineTo(-14, -6)
    ctx.moveTo(0, bodyY + 20)
    ctx.lineTo(20, -2)
    ctx.stroke()

    // Torse
    ctx.lineWidth = 22
    ctx.beginPath()
    ctx.moveTo(0, bodyY + 22)
    ctx.lineTo(4, headY + 26)
    ctx.stroke()

    // Bras
    ctx.strokeStyle = c2
    ctx.lineWidth = 11
    ctx.beginPath()
    ctx.moveTo(2, headY + 34)
    ctx.lineTo(armB.x, armB.y + crouch)
    ctx.moveTo(2, headY + 34)
    ctx.lineTo(armF.x, armF.y + crouch)
    ctx.stroke()
    // Poings
    ctx.fillStyle = c2
    ctx.beginPath()
    ctx.arc(armF.x, armF.y + crouch, 9, 0, Math.PI * 2)
    ctx.arc(armB.x, armB.y + crouch, 8, 0, Math.PI * 2)
    ctx.fill()

    // Tête + bandeau
    ctx.fillStyle = '#ffe0c2'
    ctx.beginPath()
    ctx.arc(6, headY, 20, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = c
    ctx.fillRect(-14, headY - 12, 40, 9) // bandeau
    // Mèche manga
    ctx.strokeStyle = isEnemy ? '#2d3436' : c
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(-8, headY - 14)
    ctx.quadraticCurveTo(-22, headY - 30, -10, headY - 34)
    ctx.stroke()

    // Œil déterminé (trait)
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(12, headY - 4)
    ctx.lineTo(22, headY - 6)
    ctx.stroke()

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
    if (hr >= 1) {
      ctx.font = 'bold 11px sans-serif'
      ctx.fillStyle = '#ffdd00'
      ctx.fillText(rightAlign ? 'SPÉCIAL PRÊT ◀' : '▶ SPÉCIAL PRÊT', x, y + h + 25)
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
}
