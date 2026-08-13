# COACH ARENA — Document de Game Design

> Jeu de coaching de combat. Tu n'es pas le combattant — tu es le **coach**.
> Ton personnage se bat seul dans l'arène ; toi, tu le coaches **à la voix** et
> **à la facecam**, comme un vrai coach au bord du ring. L'IA analyse ta voix et
> ton visage : ton énergie devient la sienne.

## 1. Concept

- **Genre** : auto-battler coaché en temps réel, esthétique manga/shōnen.
- **Boucle** : créer/choisir un perso → 3 rounds d'arène → coacher pendant le
  combat (voix + visage) → phase tactique entre les rounds → victoire →
  partager le clip du match (format vertical 9:16, prêt pour TikTok).
- **Pitch viral** : la facecam du joueur est incrustée dans le match façon
  stream. Le clip exporté montre à la fois le combat manga ET le coach qui
  hurle ses consignes — c'est le combo qui fait le meme.

## 2. Création de personnage

Deux voies :

1. **Prompt** : le joueur décrit son perso en une phrase
   (« un vieux maître cyborg ultra rapide mais fragile »). Le moteur en déduit
   archétype, stats, couleurs, technique spéciale et nom de technique.
   - v0 : parseur local par mots-clés (rapide, tank, feu, glace, ombre…).
   - v1+ : génération via l'API Claude (stats + lore + nom de coup spécial).
2. **Roster** : sélection de persos pré-créés, archétypes shōnen assumés
   (le rival ténébreux, la brute au grand cœur, la prodige, le vétéran…).

**Stats** : Puissance (ATK), Garde (DEF), Vitesse (SPD), Cœur (HRT — réceptivité
au coaching), PV. Somme plafonnée : un perso fort quelque part est faible
ailleurs.

## 3. Le combat

- Auto-battler : les deux persos s'affrontent seuls, tick par tick.
- **BO3** : premier à 2 rounds gagnés. Un round ≈ 45–60 s ou KO.
- Actions : attaque, garde, esquive, contre, **technique spéciale** (débloquée
  par la jauge de Hype).
- Rendu canvas 9:16 : lignes de vitesse, onomatopées (DOKAN!, BAAM!, ZUKYUN!),
  flash d'impact, zoom dramatique sur les specials.

## 4. Le coaching (cœur du jeu)

### Pendant le round — coaching « à chaud »
- **Voix** (Web Speech API, fr) : commandes reconnues →
  - « attaque / fonce / défonce-le » → posture agressive (+ATK, −DEF)
  - « défends / garde / recule » → posture défensive (+DEF, −ATK)
  - « esquive / bouge » → +SPD, fenêtres d'esquive
  - « contre » → tentative de contre sur la prochaine attaque adverse
  - « spécial / maintenant ! » → déclenche la technique si la Hype est pleine
  - Encouragements (« allez ! », « t'es le meilleur ! », cris) → +Hype
- **Volume & intensité de la voix** : crier fait monter la Hype plus vite.
- **Facecam** : webcam incrustée en overlay. v0 : analyse d'énergie
  (mouvement du visage/du corps via diff d'images) → un coach statique et mou
  n'apporte rien, un coach qui vit le match booste son perso. v1+ :
  MediaPipe FaceLandmarker (sourire, cri, sourcils froncés → émotions mappées
  sur des bonus distincts).
- **Cœur (HRT)** : plus le perso a de Cœur, plus il répond fort au coaching.
- **Sur-coaching** : spammer les ordres contradictoires (< 2 s d'écart) rend le
  perso « Confus » quelques secondes (malus). Un bon coach parle juste.

### Entre les rounds — coin tactique (20 s)
- Écran « coin du ring » : le perso souffle, le coach choisit un **plan** :
  - Pression (agressif), Béton (défensif), Contre-jeu (punir), Sang-froid
    (récupère des PV, Hype conservée).
- Le plan fixe la posture de départ et un bonus passif du round suivant.
- Bonus « discours de coach » : 5 s pour parler à la facecam — l'intensité
  vocale mesurée donne un bonus de Hype de départ.

### Jauge de Hype
- Se remplit via : coups réussis, encouragements vocaux, énergie facecam.
- Pleine → le coach peut appeler la **technique spéciale** (cinématique manga,
  gros dégâts). La crier au bon moment, c'est le skill du jeu.

## 5. Viralité & partage

- Tout le match est rendu en 9:16 avec la facecam incrustée → capture
  MediaRecorder (canvas + piste webcam + micro).
- Fin de match : replay du **moment fort** (le special, le KO) + bouton
  « Télécharger le clip » (webm/mp4) → partage TikTok/Shorts.
- Habillage : bandeau score, nom du perso façon affiche de combat, watermark
  COACH ARENA.

## 6. Architecture technique

- **Stack** : Vite + React + TypeScript. Zéro backend en v0 (tout local).
- `src/game/` : logique pure (types, persos, moteur de combat, état coaching) —
  testable sans navigateur.
- `src/systems/` : ponts navigateur (voice = SpeechRecognition, facecam =
  getUserMedia + analyse, recorder = MediaRecorder).
- `src/render/` : rendu canvas manga (perso stylisés vectoriels, FX,
  onomatopées).
- `src/ui/` : écrans React (titre, création, sélection, arène, tactique,
  résultats).
- v1+ : API Claude pour la génération de persos par prompt ; multijoueur
  (WebRTC ou serveur) ensuite.

## 7. Jalons

- **v0 (prototype jouable)** : roster + création par mots-clés, combat BO3
  vs IA, coaching vocal par commandes, Hype, facecam overlay + énergie,
  écran tactique, export clip.
- **v0.5** : équilibrage, sons, meilleurs FX, replay du moment fort.
- **v1** : génération Claude, émotions MediaPipe, mp4, i18n.
- **v2** : multijoueur coach vs coach, classements, événements.
