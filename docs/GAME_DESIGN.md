# COACH ARENA — Document de Game Design

> Jeu de coaching de combat. Tu n'es pas le combattant — tu es le **coach**.
> Ton personnage se bat seul dans l'arène ; toi, tu le coaches **à la voix** et
> **à la facecam**, comme un vrai coach au bord du ring. L'IA analyse ta voix et
> ton visage : ton énergie devient la sienne.

## 0. Vision produit finale — le parcours joueur, bout en bout

Synthèse (2026-08-15) de toutes les décisions prises depuis le début du
projet, pour garder le cap pendant qu'on creuse les détails.

**Découverte.** Un clip TikTok : quelqu'un hurle des ordres à son perso
en plein combat, un KO en ralenti, un Ultime qui explose l'écran. Clic →
le jeu charge dans le navigateur en moins de 15 s, zéro installation.

**Création.** Trois questions guidées (style/tempérament/univers) ou un
prompt libre composent le perso ; ou choix dans le roster de 6
archétypes. Permissions micro/caméra expliquées clairement au Vestiaire
— tout reste local, jamais envoyé nulle part.

**Le combat.** Rendu vectoriel manga en continu (2.5D, encré,
expressif) — c'est le socle qui tourne TOUJOURS, zéro coût, zéro
latence. Par-dessus, dès que la bibliothèque de templates existe : à
chaque instant RÉSOLU par la simulation (un coup qui touche, une
esquive, un spécial), un cut vidéo swappé avec l'identité du perso
s'affiche — y compris pour un perso tout juste créé par prompt, grâce à
la bibliothèque partagée de sa catégorie (archétype). Rien ne bloque
jamais la voix du coach : la simulation tourne en continu, les cuts ne
font qu'habiller ce qui vient de se décider.

**Coacher.** Ordres vocaux (attaque/garde/esquive/contre/spécial/
ultime/encourage), intonation et énergie facecam modulées par le trait
d'écoute du perso (sanguin/cérébral/têtu/fusionnel). Entre les rounds :
plan tactique, deck de cartes (guerre des coins incluse — bloquer ou
drainer le coin adverse), relève d'équipier (PV/Hype/Ulti conservés),
et conseils parlés librement transformés en effets réels. Le coach
adverse est un vrai miroir (son propre deck, sa propre équipe), visible
en tuile façon appel vidéo — demain, la vraie facecam d'un adversaire
humain en PvP.

**Fin de match.** Clip du KO enregistré automatiquement, partagé en un
tap vers la feuille de partage native. #CoachArena.

**Progression.** La Vie d'Écurie (humeur, envies, entraînement — jamais
punitive) nourrit le Lien avec chaque perso, débloque cartes signatures
et paliers de récompense. Le Mode Histoire (« Le Grand Hurlement »,
8 chapitres) donne un arc complet, des adversaires thématiques, un boss
final inédit — et débloque à terme la création de son propre champion
en récompense finale.

**Plateformes.** Mobile-first (web + PWA installable) ; plateau TV en
paysage sur PC (les cams des coachs sur les côtés — cœur de cible :
les streamers) ; wrapper natif pour les stores plus tard, même code.

**Économie.** L'arcade reste gratuit et illimité, pour toujours — le
moteur de viralité ne doit jamais coûter un centime à personne.
L'Édition Histoire (~14,90 €, vendue sur stores) et les recharges de
crédits (web, Stripe) financent le contenu cinématique — jamais de
pay-to-win, les Éclats du PvP restent bornés au cosmétique.

**Ce qui est réel aujourd'hui vs l'ambition** : tout le gameplay ci-dessus
tourne déjà (moteur, deck, Écurie, Histoire, voix, prosodie). Le rendu
est 100 % vectoriel — aucun cut vidéo n'existe encore (bibliothèque
vide par construction). L'architecture pour les recevoir est prête et
testée (Réalisateur, Séquenceur de cuts, bibliothèque de clips, lecteur
en direct) ; il manque le contenu (templates produits, swap branché) et
le backend (comptes, paiement, hébergement) pour que cette vision soit
la réalité jouée. Voir ROADMAP.md pour l'état détaillé, tier par tier.

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
- Si le coach reste muet 6 s jauge pleine, le perso prend l'**initiative** et
  tire seul — le skill du coach est le timing, pas l'accès.

### Jauge d'Ulti (décidée le 2026-08-14)

Deux jauges, deux temporalités : *la Hype, c'est le coach ; l'Ulti, c'est
le combattant.*

- Jauge de **match entier**, conservée entre les rounds. Chargée par le
  combat : coups donnés, coups **encaissés ×2** (comeback), spéciaux subis,
  rounds perdus (+15) — celui qui souffre charge plus vite, remontada shōnen.
- Pleine → **l'Ultime** : finisher unique du match, propre à chaque perso
  (Éruption du Cœur Brisé, Nuit Sans Aube, Apocalypse Sauvage…), perce
  garde et esquive, ~50-55 % de la vie max.
- **Pas d'initiative automatique** : seul le cri du coach (« ULTIME ! »,
  bouton/clavier en secours) le libère. Sans coach, l'Ulti ne sort jamais —
  c'est la déclaration de design du jeu. L'IA adverse, elle, n'attend
  personne.
- Moment cinématique par excellence : zoom long, bannière écarlate, son
  dédié — et plus tard LA scène générée du montage.

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

## 4 ter. Vision : tout personnalisable par prompt (notes du 2026-08-14)

- **Cartes par prompt** : le joueur décrit une carte, l'IA la traduit en
  une combinaison de **primitives d'effets bornées** (soin X %, ±Hype,
  ×dégâts N s, sabotage adverse…) avec un **budget de puissance** qui
  fixe automatiquement le coût en Souffle. L'habillage (nom, description
  WTF, illustration) est libre ; la mécanique reste dans les bornes.
  Prérequis : la DSL d'effets (roadmap v1 deck).
- **Lecture fine du coach** : étage actuel = volume + mouvement ; étage
  suivant = MediaPipe (expressions, gestes) + prosodie (intonation, pas
  seulement volume). Chaque perso interprète le style du coach selon son
  trait et son Lien — la matrice s'enrichit.
- **Perso ou créature : le prompt décide.** Le moteur est agnostique
  (stats/trait/spécial) ; c'est un choix d'habillage, compatible avec la
  direction 2D illustrée.
- **v2 — L'Écurie (maître de gladiateurs)** : 3 combattants, un seul en
  arène, remplacement au coin du ring = LA décision tactique (format
  « switch » type Pokémon, pas de mêlée simultanée — illisible à la
  voix). La collection prend son sens : chaque membre a son trait, son
  Lien, sa signature. On collectionne des relations, pas des skins.

## 4 quater. Parcours joueur & Vie d'Écurie (notes du 2026-08-14)

### Onboarding de création (implémenté)

Trois questions à choix composent le prompt (style de combat, tempérament,
univers) + nom optionnel ; le mode **expert** garde le texte libre. La page
blanche est éliminée : un perso naît en 10 secondes.

### Vie d'Écurie (tamagotchi bienveillant — v1)

- Chaque perso a une **humeur** (Radieux / Bien / Neutre / Boudeur) et des
  **envies** périodiques cohérentes avec son trait (« Fang veut chasser »,
  « Yuna veut du calme », « Kenta veut du temps avec toi »).
- Hors combat : **entraîner** (petit boost temporaire d'une stat), **loisir**
  (répond à l'envie → humeur +), **repos**. Sessions courtes, 2-3 actions
  par jour réel maximum — un rituel, pas une corvée.
- **Règle d'or : jamais punitif.** Ignorer son perso le laisse neutre ;
  s'en occuper le rend meilleur. Pas de perso qui dépérit, pas de
  culpabilisation.
- Effets en combat : humeur haute = Hype de départ + petit bonus du trait ;
  humeur basse = premier ordre moins écouté. Léger, jamais décisif seul.
- L'entretien nourrit le **Lien** (en plus des victoires) : la relation
  devient quelque chose qu'on construit, pas seulement qu'on gagne.

### Paliers de Lien : « choisis 1 parmi 2 »

À chaque palier, le perso **propose deux cartes, on en garde une** — deux
joueurs qui montent le même perso construisent des decks différents. Au
palier maximum : la carte à créer soi-même **par prompt** (voir §4 ter).
La distribution initiale : le deck de départ est offert à la création,
présenté comme un cadeau du perso à son coach.

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

### La fabrique à scènes v2 : templates + swap (décision 2026-08-15)

Insight utilisateur validé par l'état de l'art : ne PAS générer chaque
vidéo — fabriquer des « moules » et y couler les persos.

- **Templates** : scènes génériques générées/produites UNE fois (entrée
  en scène façon boxe, célébration, KO slow-motion…) : décor, foule,
  caméra, gestuelle — sans identité de personnage.
- **Swap** : le perso du joueur (sa planche de référence — on l'a déjà)
  est injecté dans le template par transfert de pose/identité :
  Viggle API (templates + Multi-Track, jusqu'à 7 éléments swappés par
  vidéo) côté service, ou workflow ComfyUI (Wan Animate : image de réf
  + clip de mouvement → le perso joue la scène) auto-hébergé.
- **Économie** : coût du template amorti à l'infini ; swap = centimes
  (API) à ~0 (GPU loué). Les **gestuelles/décors/entrées deviennent des
  cosmétiques vendables à coût marginal quasi nul** — le modèle
  cosmétique de TFT (arènes/booms) appliqué à la vidéo, et chaque
  gestuelle achetée marche avec TON perso créé par prompt.
- **La génération Kling pure** reste pour l'unique : l'Ulti nommé du
  perso, le KO spécifique du match, le tier premium.
- Pipeline : les ScenePlan du Réalisateur référencent déjà les persos —
  un plan devient « template X + swap(planche du perso) » au lieu d'un
  prompt de génération complète.

### Le combat en cuts (vision utilisateur 2026-08-15) — templates+swap
appliqués AU COMBAT lui-même

**Clé de voûte : la grammaire du découpage anime évite la combinatoire.**
Un cut ne montre qu'UN personnage (attaque en gros plan → flash d'impact
→ contrechamp de réaction). Chaque perso n'a donc besoin que de SA banque
de cuts (attaques, réactions, esquive, garde, KO, célébration…) — jamais
de paires attaquant×défenseur à générer.

- **Banque de gestuelles par perso, générée HORS match** : à la création
  (planche de réf + templates de mouvement + swap), en asynchrone,
  stockée une fois. Centimes par cut (API) à ~0 (auto-hébergé).
- **L'entraînement débloque les gestes** (Vie d'Écurie) : entraîner
  l'ATK débloque un nouveau cut d'attaque, le Lien débloque l'entrée
  personnalisée — l'écurie enrichit littéralement le film des matchs.
  Gestuelles premium achetables (cosmétiques vidéo).
- **Le match = séquençage, zéro génération** : le moteur arcade reste
  l'autorité (simulation, coaching voix, cartes) ; ses événements —
  qui pilotent déjà renderer/commentateur/Réalisateur — pilotent un
  lecteur de cuts. Instantané, hors-ligne, coût marginal nul.
- **Contrainte** : templates standardisés (cadrage fixe par type de cut)
  + transitions manga (flash, speed lines — déjà dans le renderer) pour
  masquer les raccords, comme l'animation limitée japonaise.

**Correction utilisateur (2026-08-15) : les échanges À DEUX sont aussi
swappables.** Un template = une chorégraphie complète à deux interprètes
génériques (coup1, esquive, contre…) ; le swap multi-personnages (Viggle
Multi-Track ≤ 7 éléments, workflows ComfyUI multi-persos) y injecte
n'importe quelle PAIRE. Nœud paramétré : (planche A, planche B, template
d'échange) → leur combat ; T templates × séquençage = Z versions par
matchup. Économie : le coût est PAR MATCHUP, donc 1) cache par paire
(roster/Histoire amortis à ~0), 2) paires nouvelles générées EN DEHORS
du combat — pendant le Vestiaire et les coins du ring (matchup connu dès
la sélection), en lazy (1-2 échanges pour le round 1, la suite pendant
les pauses), 3) les cuts solo comblent tout retard (principe deux-couches
intact). ⚠️ À valider par un test réel : le swap simultané de deux
identités dans un même plan est la config la plus sujette au mélange de
traits — premier test à faire au branchement de la chaîne.

- Trois niveaux de spectacle sur le même moteur : arcade vectoriel
  (gratuit) → cinéma de cuts solo + échanges swappés par matchup
  (banques et caches amortis) → générations Kling uniques (premium).

**Ultis & KO en templates aussi (décision 2026-08-15).** La génération à
la demande est une loterie ; un template d'Ulti est SÉLECTIONNÉ (10
générations → la meilleure, polie) puis swappé : qualité moyenne en
hausse, variance nulle. La personnalisation reste : FX/couleurs
paramétrés aux couleurs du perso, nom et onomatopée de SON Ulti en
habillage, commentateur. Les KO pareil (templates de mise à terre,
swap du perdant réel).
- **La collection d'Ultis se débloque par l'HISTOIRE** : chaque chapitre
  vaincu débloque le template d'Ulti de son adversaire (ch4 → le
  rempart de Gorō, ch6 → l'illusion de Nyx, boss → un légendaire).
  L'Édition Histoire devient « le mode qui remplit ton arsenal » —
  argument d'achat concret et rejouable. Boutique en complément,
  entraînement Écurie pour les gestes de base.
- **La seule génération pure restante = créer SON Ulti unique**
  (premium, une fois par perso, valeur perçue maximale — le luxe
  assumé, plus une dépense courante).

### Modèle de monétisation (proposition chiffrée)

Coûts réels mesurés par action (base : clip Kling 5 s ≈ 0,30 €, appel
texte Claude < 0,02 €, match arcade = 0 €) :

| Action | Coût réel | Prix en crédits (1 crédit vendu ≈ 0,05 €) |
| --- | --- | --- |
| Match arcade + coaching vocal | 0 € | **Gratuit illimité** (le moteur viral) |
| Création de perso par prompt (Claude + planche Kling) | ~0,05 € | 20 crédits |
| Forge de carte par prompt | < 0,01 € | 5 crédits |
| Clip héroïque du KO (1 clip Kling) | ~0,30 € | 25 crédits |
| Match cinématique complet (5-6 clips) | ~1,50 € | 120 crédits |

**Structure de vente (v2 — décision utilisateur 2026-08-14) :**

- **Arcade gratuit pour tous, sans achat** — non négociable : la boucle
  virale TikTok (clic sur un clip → je joue immédiatement) meurt si
  l'entrée est payante.
- **Le jeu à ~14,90 €** = mode histoire complet avec les persos de base
  + de quoi faire **~5 parties PvP cinématiques** (≈ 400 crédits) +
  **création de SON perso débloquée en finissant l'histoire** (première
  création offerte — la récompense de fin d'histoire, moment fort :
  « maintenant, crée TON combattant et amène-le dans l'arène »).
  Les cinématiques du mode histoire sont générées **une seule fois à
  l'écriture** et servies à tous les joueurs : coût fixe amorti, pas un
  coût par joueur. Seul le contenu personnalisé coûte à l'unité.
  Marge plancher : ~10,40 € nets (après commission store) − ~5 € de coût
  si TOUS les crédits partent en cinématique complète → toujours
  positif ; confortable si les joueurs préfèrent le clip héroïque.
- **Recharges** : 100 cr = 4,99 € · 250 cr = 9,99 € · 600 cr = 19,99 €.

**Canaux de vente — chaque canal vend ce qu'il sait vendre.** Un jeu
web *payant à l'entrée* ne se vend pas (psychologie « onglet = gratuit ») ;
un jeu web *free-to-play avec achats* se vend très bien (RuneScape,
jeux de navigateur allemands). Donc : le **web** porte l'arcade gratuit
(viralité TikTok) et les **recharges de crédits** (Stripe/Apple Pay,
~97 % de marge) ; les **stores** (Steam, mobile) portent l'Édition
Histoire à 14,90 € — le buy-to-play est chez lui sur un store, et la
commission de 30 % ne s'applique qu'au canal où le store apporte
l'acheteur. Précédent : Cookie Clicker, gratuit en web ET vendu 4,99 €
sur Steam avec succès. Techniquement : même code, wrapper
Capacitor/Electron pour les stores. Ordre : web d'abord (prouver le
jeu), stores ensuite (encaisser la notoriété), quand le mode histoire
existe.

**Coût de l'analyse vocale (clarification)** : reconnaissance de
commandes = Web Speech API du navigateur (0 €), volume/énergie = calcul
local (0 €), prosodie/intonation = pitch local (0 €). Seule la
*compréhension* fine du style de coaching (API Claude) coûte : ~1-3
centimes/match, absorbée dans le prix du jeu. Le seul coût variable
significatif reste la vidéo Kling.

**Crédits gagnés en PvP — garde-fous obligatoires** (chaque crédit
gagné est un coût réel quand il est dépensé) :

- Double monnaie légère : le PvP rapporte des **Éclats** dépensables
  uniquement sur les actions à coût Claude (forge, création de perso) —
  coût réel en centimes, valeur perçue forte.
- Le contenu adossé à Kling ne se gagne que borné : **1 clip héroïque
  gratuit / jour** pour une victoire PvP. Ce n'est pas une perte : le
  clip watermarké partagé sur TikTok EST la publicité — c'est un budget
  d'acquisition, pas un cadeau.
- Jamais de conversion Éclats → crédits durs.

## 8. Jalons

- **v0 (prototype jouable)** : roster + création par mots-clés, combat BO3
  vs IA, coaching vocal par commandes, Hype, facecam overlay + énergie,
  écran tactique, export clip.
- **v0.5** : équilibrage, sons, meilleurs FX, replay du moment fort.
- **v1** : génération Claude, émotions MediaPipe, mp4, i18n.
- **v2** : multijoueur coach vs coach, classements, événements.
