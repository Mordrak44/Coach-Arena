export default function TitleScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="screen">
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
      <p className="permNote">
        🎙️ + 📷 Le jeu demande le micro et la caméra : c'est toi, le coach à l'écran. Refuse si tu
        préfères — des boutons de secours existent.
      </p>
    </div>
  )
}
