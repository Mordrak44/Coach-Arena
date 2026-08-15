// Vie privée — la transparence est un argument produit : un jeu qui te
// filme et t'écoute DOIT expliquer où vont les données. Réponse : nulle part.

const S = { title: { color: 'var(--accent)', fontWeight: 900, marginTop: 10 } as const }

export default function PrivacyScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen" style={{ justifyContent: 'flex-start', overflowY: 'auto' }}>
      <h1 className="logo" style={{ fontSize: '1.5rem' }}>
        Ta voix, ta caméra,
        <br />
        ton appareil.
      </h1>
      <div style={{ textAlign: 'left', fontSize: '0.8rem', lineHeight: 1.5, padding: '0 6px' }}>
        <p style={S.title}>🎙️ Le micro</p>
        <p>
          Ton volume et ton intonation sont analysés <b>dans ton navigateur</b>, par du calcul
          local. Rien n'est envoyé à nos serveurs — nous n'en avons pas. La reconnaissance des
          commandes utilise celle de ton navigateur (selon le navigateur, elle peut traiter la
          voix via son propre service — c'est le même mécanisme que la dictée vocale de ton
          téléphone, et ça reste entre toi et ton navigateur).
        </p>
        <p style={S.title}>📷 La caméra</p>
        <p>
          L'image de ta facecam est analysée <b>localement</b> (mesure de mouvement) et affichée à
          l'écran. Elle n'est <b>jamais transmise</b> nulle part. Elle n'apparaît dans un clip que
          si TU exportes ce clip — et le fichier reste sur ton appareil tant que tu ne le partages
          pas toi-même.
        </p>
        <p style={S.title}>🎬 Les clips</p>
        <p>
          Les clips sont fabriqués et enregistrés <b>sur ton appareil</b>. Les partager (TikTok ou
          ailleurs) est toujours une action de ta main. Réfléchis avant de poster : un clip avec ta
          facecam te montre, toi.
        </p>
        <p style={S.title}>💾 Ta progression</p>
        <p>
          Persos, Lien, humeur, deck, chapitres d'Histoire : tout vit dans le stockage local de ton
          navigateur. Pas de compte, pas de base de données, pas de tracking, pas de cookies
          publicitaires. Effacer les données du site efface ta progression — c'est le revers de la
          médaille.
        </p>
        <p style={S.title}>👶 Mineurs</p>
        <p>
          Le jeu ne collecte aucune donnée personnelle, mais si tu es mineur·e, demande l'accord
          d'un parent avant d'utiliser micro et caméra, et ne partage pas de clips montrant ton
          visage sans son accord.
        </p>
        <p style={{ color: 'var(--muted)', marginTop: 10 }}>
          Refuser micro et caméra ne bloque rien : boutons et clavier prennent le relais. Cette
          page décrit l'état actuel du jeu (100 % local) ; si un jour des fonctions en ligne
          arrivent (comptes, PvP), cette page changera AVANT, clairement.
        </p>
      </div>
      <button className="btn secondary" onClick={onBack}>
        ← Retour
      </button>
    </div>
  )
}
