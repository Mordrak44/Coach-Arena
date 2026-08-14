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

## 4 bis. Profondeur : instinct vs stratégie (décidé le 2026-08-13)

Principe : **pendant le round = l'instinct** (voix, timing, réactif,
effets courts) ; **entre les rounds = la stratégie** (choix posés, effets
durables). Pas de cartes à jouer pendant l'action — la voix et le visage
sont la manette, on ne la dilue pas.

### Le Deck du Coach (système TCG, décidé le 2026-08-14)

- **Deck** de 18 cartes en v0 (cible 30-60 avec la collection), mélangé ;
  **main de 5** piochée au début du match, recomplétée à chaque pause.
- **Souffle** : 3 points par coin du ring ; chaque carte coûte 1-2. Jouer
  plusieurs petites cartes ou une grosse, c'est l'arbitrage du coach.
- **Mulligan** : une fois par pause, échanger 1 à 5 cartes de sa main
  contre autant de pioches — s'adapter à ce qu'on vient de voir.
- Défausse remélangée dans la pioche quand elle est vide.
- Trois familles par **timing** (les mains ne touchent jamais les cartes
  pendant le round — la voix reste la manette) :
  - **Coach** (pause) : effet immédiat au coin du ring (*Second Souffle*
    +20 % PV, *Massage Éclair*, *Mise au Point* +Hype, *Douche Froide*
    −30 Hype adverse, *Garde de Fer*).
  - **Instant armé** : préchargé à la pause, **libéré à la voix** pendant
    le round (*Contre Parfait* : le prochain « CONTRE ! » crié double les
    dégâts ; *Cri de Guerre*).
  - **Instant pari** : déclenché par le scénario du round (*Dernière
    Chance*, *Provocation*, la plupart des signatures).
- v1 : deck-builder (collection, 2-3 copies max par carte, deck 30-60),
  cartes d'interaction (bloquer/saboter la carte adverse quand l'IA
  jouera son propre deck), effets paramétrés en données pour passer à
  des dizaines puis centaines de cartes sans risque.

### Traits d'écoute (personnalité des persos)

Chaque perso réagit différemment au style de coaching — le volume et le
rythme de la voix deviennent du gameplay :

- **Sanguin** : s'enflamme quand le coach crie (Hype ×1,5 si volume fort).
- **Cérébral** : veut du calme et de la précision — crier le stresse
  (ordres plus efficaces à volume modéré, malus si hurlement).
- **Têtu** : ignore le premier ordre d'un round, écoute ensuite.
- **Fusionnel** : bonus fort si le coach est expressif à la facecam.

### Le Lien coach-perso (progression)

- Gagner des matchs avec un perso monte son **Lien** → son Cœur (HRT)
  augmente par paliers.
- Les paliers de Lien débloquent les **cartes signatures** du perso
  (chaque perso a les siennes) → collection et rétention, sans rien
  vendre qui touche l'équilibre du direct.

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

## 7. Mode Cinématique (vision cible, décidée le 2026-08-13)

Deux couches distinctes — c'est le principe fondateur :

- **Couche gameplay (le direct)** : le round se joue et se regarde TOUJOURS
  sur le rendu arcade temps réel (moteur canvas v0). Le coach voit l'action
  seconde par seconde et crie ses consignes en réaction à ce qui se passe.
  Instantané, gratuit, jamais dépendant d'une génération.
- **Couche spectacle (la diffusion TV)** : les scènes Kling ne servent
  jamais à informer le coach, seulement à magnifier ce qui a déjà été vécu.
  Si un clip est en retard ou échoue, il ne manque qu'au montage final,
  jamais au gameplay.

### Boucle cinématique

1. **Création** : prompt joueur → Claude génère stats/lore/technique ;
   Kling génère le **portrait de référence** (une image canonique du perso,
   réutilisée en image-to-video pour garantir la cohérence visuelle d'une
   scène à l'autre).
2. **Entrée dans l'arène** (scène Kling, couche spectacle) : arrivée du
   perso, foule, acclamations, staredown / coup de pression visuel.
   Générée pendant la sélection / le matchmaking.
3. **Round en direct** (couche gameplay) : combat temps réel sur le rendu
   arcade, coaching vocal + facecam pendant l'action — le cœur du jeu.
   À la fin du round, le moment fort détecté part en génération Kling.
4. **Coin du ring** (gameplay temps réel) : choix tactique + discours de
   coach. En fond d'écran, si prêt : le **replay anime** du moment fort du
   round précédent, façon ralenti TV entre deux rounds — on le revoit
   sublimé, on ne le découvre pas.
5. Boucle 3-4 jusqu'à la victoire.
6. **Fin de match** : montage entrée + replays + KO = mini-épisode anime du
   match, exportable 9:16 pour TikTok — idéalement mixé avec la facecam du
   coach hurlant la consigne au moment du KO (le combo viral).

### Économie

~5-6 clips par match → coût réel en crédits par partie. Mode arcade
gratuit / mode cinématique premium. Optimisations possibles : ne générer en
vidéo que LE moment fort du match (1 clip), images statiques + FX caméra
pour le reste.

## 8. Jalons

- **v0 (prototype jouable)** : roster + création par mots-clés, combat BO3
  vs IA, coaching vocal par commandes, Hype, facecam overlay + énergie,
  écran tactique, export clip.
- **v0.5** : équilibrage, sons, meilleurs FX, replay du moment fort.
- **v1** : génération Claude, émotions MediaPipe, mp4, i18n.
- **v2** : multijoueur coach vs coach, classements, événements.
