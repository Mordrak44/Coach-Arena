import { useEffect, useRef, useState } from 'react'
import type { Character } from '../game/types'
import { TRAIT_INFO } from '../game/characters'

// Le Vestiaire : annonce du match façon VS shōnen + onboarding des
// permissions micro/caméra AVANT l'arène, avec explication et fallback.

export default function ReadyScreen({
  player,
  enemy,
  onGo,
}: {
  player: Character
  enemy: Character
  onGo: (stream: MediaStream | null) => void
}) {
  const [micOk, setMicOk] = useState<boolean | null>(null)
  const [camOk, setCamOk] = useState<boolean | null>(null)
  const [asking, setAsking] = useState(true)
  const streamRef = useRef<MediaStream | null>(null)
  const goneRef = useRef(false)

  useEffect(() => {
    let disposed = false
    const ask = async () => {
      let stream: MediaStream | null = null
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        } catch {
          stream = null
        }
      }
      if (disposed) {
        stream?.getTracks().forEach(t => t.stop())
        return
      }
      streamRef.current = stream
      setMicOk(!!stream?.getAudioTracks().length)
      setCamOk(!!stream?.getVideoTracks().length)
      setAsking(false)
    }
    ask()
    return () => {
      disposed = true
      // Si on quitte l'écran sans lancer le match, on libère les capteurs.
      if (!goneRef.current) streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  const speechSupported =
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

  const statusIcon = (v: boolean | null) => (v === null ? '⏳' : v ? '✅' : '🚫')

  return (
    <div className="screen" style={{ justifyContent: 'flex-start', gap: 14 }}>
      {/* Annonce du match, staredown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', marginTop: 8 }}>
        <div style={{ flex: 1, textAlign: 'right' }}>
          <div style={{ fontWeight: 900, fontSize: '1.3rem', color: player.color }}>
            {player.name}
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase' }}>
            {player.title}
          </div>
        </div>
        <div
          style={{
            fontWeight: 900,
            fontStyle: 'italic',
            fontSize: '2rem',
            color: 'var(--accent2)',
            textShadow: '2px 2px 0 #000',
          }}
        >
          VS
        </div>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ fontWeight: 900, fontSize: '1.3rem', color: enemy.color }}>{enemy.name}</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase' }}>
            {enemy.title}
          </div>
        </div>
      </div>

      <p className="tagline" style={{ fontStyle: 'italic' }}>
        « {enemy.lore} »
      </p>

      {/* Conseil de coaching pour CE perso */}
      <div
        style={{
          background: 'var(--panel2)',
          borderRadius: 12,
          padding: '10px 14px',
          fontSize: '0.8rem',
          width: '100%',
        }}
      >
        {TRAIT_INFO[player.trait].icon} <b>{player.name} est {TRAIT_INFO[player.trait].label}</b> —{' '}
        {TRAIT_INFO[player.trait].hint}
      </div>

      {/* État des capteurs du coach */}
      <div
        style={{
          background: 'var(--panel2)',
          borderRadius: 12,
          padding: '10px 14px',
          fontSize: '0.8rem',
          width: '100%',
          textAlign: 'left',
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 6, textTransform: 'uppercase', fontSize: '0.7rem' }}>
          Ton équipement de coach
        </div>
        <div>
          {statusIcon(micOk)} Micro — tes consignes vocales et ton volume{' '}
          {micOk === false && <em>(refusé : boutons + clavier A D E C S, espace)</em>}
        </div>
        <div>
          {statusIcon(camOk)} Caméra — ton énergie de coach, incrustée dans le clip{' '}
          {camOk === false && <em>(refusé : le match n'aura pas ta facecam)</em>}
        </div>
        <div>
          {micOk === false || speechSupported ? statusIcon(speechSupported && micOk !== false) : '✅'}{' '}
          Reconnaissance vocale{' '}
          {!speechSupported && <em>(indisponible sur ce navigateur — Chrome recommandé)</em>}
        </div>
      </div>

      <p className="permNote">
        Coache à la voix : « Attaque ! », « Défends ! », « Esquive ! », « Contre ! », « SPÉCIAL ! » —
        et encourage-le, il t'entend.
      </p>

      <button
        className="btn"
        disabled={asking}
        onClick={() => {
          goneRef.current = true
          onGo(streamRef.current)
        }}
      >
        {asking ? 'Vérification…' : '🔔 Faire sonner le gong'}
      </button>
    </div>
  )
}
