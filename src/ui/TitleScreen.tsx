import { useEffect, useRef } from 'react'
import { ROSTER } from '../game/characters'
import { ROUND_TIME_LIMIT, createMatch, forceRoundTimeout, tick } from '../game/combat'
import { ArenaRenderer, CANVAS_H, CANVAS_W } from '../render/arenaRenderer'

// Écran titre avec ATTRACT MODE : un combat IA vs IA tourne en boucle
// derrière le titre, comme une borne d'arcade. Premier contact du visiteur
// TikTok — le jeu doit bouger avant même le premier clic.

export default function TitleScreen({
  onStart,
  onStory,
  onPrivacy,
}: {
  onStart: () => void
  onStory: () => void
  onPrivacy: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const newMatch = () => {
      const pi = Math.floor(Math.random() * ROSTER.length)
      let ei = Math.floor(Math.random() * ROSTER.length)
      if (ei === pi) ei = (ei + 1) % ROSTER.length
      // Un peu de Hype de départ : l'attract mode doit montrer du spectacle vite.
      return createMatch(ROSTER[pi], ROSTER[ei], [], { startHype: 60 })
    }

    let m = newMatch()
    let renderer = new ArenaRenderer()
    let roundStart = 0
    let rafId = 0
    let last = performance.now()

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const prevPhase = m.phase
      tick(m, dt, { command: null, voiceEnergy: 0, faceEnergy: 0 })
      if (prevPhase !== 'fighting' && m.phase === 'fighting') roundStart = m.t
      if (m.phase === 'fighting' && m.t - roundStart > ROUND_TIME_LIMIT) forceRoundTimeout(m)
      // La phase tactique n'a pas d'intérêt sans coach : on la saute.
      if (m.phase === 'tactics') m.phaseUntil = m.t
      if (m.phase === 'matchEnd') {
        m = newMatch()
        renderer = new ArenaRenderer()
        roundStart = 0
      }
      renderer.draw(ctx, m, m.t, Math.max(0, ROUND_TIME_LIMIT - (m.t - roundStart)))
      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafId)
  }, [])

  return (
    <div className="screen" style={{ position: 'relative', justifyContent: 'flex-start' }}>
      {/* Pas d'`overflow: hidden` ici : ça écrase le `overflow-y: auto` de
          .screen (styles.css), le seul filet de scroll de l'appli — sur
          un petit écran ou avec le texte agrandi (accessibilité), le
          titre/tagline/boutons/lien vie privée en flux normal (le 3e
          <div> ci-dessous) déborderait de la boîte SANS aucun moyen d'y
          accéder, exactement le bug déjà corrigé sur StoryScreen/
          CharacterSelect (trouvé en audit, 2026-08-18). Le canvas et le
          voile en `position: absolute; inset: 0` restent calés sur la
          boîte de .screen sans lui, aucun besoin de le clipper. */}
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          filter: 'brightness(0.72) saturate(1.1)',
        }}
      />
      {/* voile dégradé : lisible en haut, le combat reste visible en bas */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(to bottom, rgba(8,7,14,0.88) 0%, rgba(8,7,14,0.55) 34%, rgba(8,7,14,0.05) 60%)',
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          padding: '7% 18px 0',
          textShadow: '0 2px 12px rgba(0,0,0,0.9)',
        }}
      >
        <h1 className="logo">
          Coach
          <br />
          Arena
        </h1>
        <p className="tagline">
          Ton perso se bat. <b>Toi, tu coaches.</b>
          <br />
          Crie tes consignes au micro, vis le match à la facecam — ton énergie devient la sienne.
        </p>
        <button className="btn" onClick={onStart}>
          Entrer dans l'arène
        </button>
        <button className="btn secondary" onClick={onStory}>
          📖 Le Grand Hurlement (Histoire)
        </button>
        <p className="permNote">
          🎙️ + 📷 Le jeu demande le micro et la caméra : c'est toi, le coach à l'écran. Refuse si tu
          préfères — des boutons de secours existent.
        </p>
        <button
          onClick={onPrivacy}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--muted)',
            fontSize: '0.72rem',
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          🔒 Vie privée : tout reste sur ton appareil
        </button>
      </div>
    </div>
  )
}
