# ROADMAP — Coach Arena

Suivi d'avancement pour la routine horaire. Chaque itération : choisir la
prochaine tâche non cochée la plus utile, l'implémenter, tester (`npm run
build`), commiter et pousser sur `claude/coaching-game-voice-arena-yrja2t`,
puis mettre à jour ce fichier.

## v0 — Prototype jouable

- [x] Scaffold Vite + React + TS, design doc
- [x] Types & modèle de jeu (stats, persos, postures)
- [x] Roster de persos pré-créés (6 archétypes shōnen)
- [x] Création par prompt (parseur mots-clés local)
- [x] Moteur de combat tick-based (BO3, Hype, postures, spécial, confusion)
- [x] Rendu canvas 9:16 manga (persos vectoriels, speed lines, onomatopées, HUD)
- [x] Coaching vocal (SpeechRecognition fr : commandes + volume → Hype)
- [x] Facecam overlay + analyse d'énergie (diff d'images)
- [x] Écran tactique entre rounds (plans + discours de coach)
- [x] Écrans : titre, sélection/création, arène, tactique, résultats
- [x] Export clip (MediaRecorder canvas 9:16 + micro) + bouton partage

## Direction artistique (décidée le 2026-08-13)

**2D illustrée animée**, façon Dokkan Battle / AFK Arena : illustrations de
persos (générées via Kling pour le roster, via génération d'image pour les
persos par prompt en v1+) mises en scène par la caméra — zooms brutaux,
flashs, speed lines, cutscenes de spéciaux. Pas de 3D : trop coûteuse et
incompatible avec la création de perso par prompt. La 3D (VRM + Mixamo,
façon TFT) reste une piste v2 si le jeu décolle.

⚠️ Les générations Kling consomment les crédits du compte : ne lancer les
portraits du roster qu'après accord explicite de l'utilisateur.

## v0.5 — Polish & profondeur

- [x] Carnet du Coach : cartes jouables au coin du ring (3 familles :
      directes, armées, conditionnelles) — voir GAME_DESIGN.md §4 bis
      (v0 : pool de 6 cartes, sélection de 3 avant match, 1 par coin du
      ring ; l'IA adverse ne joue pas encore de cartes)
- [x] Traits d'écoute des persos (Sanguin, Cérébral, Têtu, Fusionnel) :
      le volume vocal module l'effet du coaching selon le trait
      (roster + déduction par prompt + effets moteur + affichage sélection)
- [x] Lien coach-perso (persistance localStorage) : paliers → +HRT
      (5 paliers/titres, persos par prompt sauvegardés avec leur Lien ;
      cartes signatures par perso encore à faire → v1)
- [x] Équilibrage passe 1 : coach parfait 80 % (cible 80-85), coach absent
      42 %, coach + carnet 93 %. Coach fantôme adverse renforcé (trickle de
      Hype + lecture des postures). Durée de round pas encore mesurée.
- [x] Cartes signatures par perso — 6 cartes uniques (Cœur Vaillant,
      Orgueil du Rival, Concentration Absolue, Leçon d'Expérience,
      Frénésie, Pas de l'Ombre), débloquées au Lien niv. 2 « Protégé »,
      jouables uniquement avec leur perso, affichées verrouillées avant
      (la carotte est visible). Persos custom : pas de signature en v0.
- [x] Mesurer/ajuster la durée moyenne des rounds : 7 s → 36,5 s de
      moyenne (médiane 40 s, 22 % de décisions aux points à 60 s).
      Accepté comme « proche de la cible » ; à revoir après playtests réels.
- [x] Sons : impacts, foule, gong de round (WebAudio, généré) — synthèse
      complète (impacts/crit, garde, esquive, contre, riser+explosion de
      spécial, gong battant, KO, jingle Hype, cartes, foule liée à la
      Hype), bouton muet dans l'arène
- [x] FX supplémentaires : zoom dramatique sur special, écran fissuré au KO
      (fissures uniquement sur vrai KO, pas sur décision aux points)
- [x] Replay du moment fort en fin de match — segments webm rotatifs de
      14 s (chacun autonome avec son en-tête, pas de découpe a
      posteriori) ; à la fin, le segment contenant le KO devient le clip
      court, affiché en boucle sur l'écran de résultats avec son propre
      bouton de téléchargement, le match complet en secondaire
- [x] Incruster la facecam DANS le clip exporté (composite canvas caché :
      jeu + facecam miroir bordée « ● COACH » + watermark COACH ARENA —
      c'est le composite qui est enregistré, l'écran de jeu reste inchangé)
- [x] Meilleure silhouette des persos — morphologie par archétype (le
      vétéran massif, l'insaisissable fluette…), attributs distinctifs
      animés (oreilles+queue de la Bête, barbe du Vétéran, mèche du
      Rival, queue de cheval de la Prodige, foulard de l'Insaisissable,
      bandes de poing du Cogneur), poses avec fente (lunge) sur
      attaque/esquive/spécial, danse de garde en idle
- [x] Onboarding permissions micro/caméra — écran « Vestiaire » avant
      l'arène : annonce VS shōnen, demande des capteurs avec explication,
      état micro/caméra/reco vocale, conseil de coaching selon le trait
      du perso, fallback boutons/clavier assumé si refus
- [ ] Tests unitaires du moteur de combat (vitest)

## v1 — Vie d'Écurie & progression (voir GAME_DESIGN.md §4 quater)

- [x] Onboarding de création par 3 questions (style / tempérament /
      univers + nom optionnel), mode expert conservé en second onglet
- [x] Humeur du perso (Radieux/Bien/Neutre/Boudeur) persistée, effets
      légers en combat (Hype de départ +5/+15, perso boudeur = premier
      ordre du match ignoré), dérive douce vers Neutre (4 pts/jour,
      jamais punitive), humeur liée aux résultats de match
- [x] Envies périodiques selon le trait + actions hors combat :
      entraîner (+1 stat au prochain match) / loisir / repos — 3 actions
      par jour réel, envie comblée = gros bonus d'humeur ; panneau
      « L'Écurie » sur l'écran de sélection
- [x] Paliers de Lien : « choisis 1 carte parmi 2 » — à chaque palier le
      perso propose 2 cartes (tirage déterministe par perso+palier), on en
      garde une = +1 copie dans son deck ; récompenses réclamées dans
      l'ordre des paliers, panneau 🎁 sur l'écran de sélection
- [x] L'entretien nourrit le Lien : 3 envies comblées = 1 victoire
      d'équivalence dans le calcul du niveau (bondLevelFor)

## v1 — Deck & collection (voir GAME_DESIGN.md §4 bis)

- [x] Deck-builder v0 : copies par carte (0-3) réglables sur les tuiles
      de l'écran de sélection, modèle persisté et assaini au chargement
      (anti-triche), total borné 12-60 avec blocage du lancement si
      invalide, réinitialisation. Signature/paliers/forgées s'ajoutent
      par-dessus : ça se mérite, ça ne se configure pas.
- [x] L'IA adverse joue au coin du ring — v1 : VRAI deck adverse complet
      (starter + sa carte signature, pioche/Souffle/défausse identiques au
      joueur), heuristique situationnelle par primitive DSL, mods
      100 % symétriques (enemyMods) : Garde de Fer, frénésie, contres
      armés, Dernière Chance et même la Provocation fonctionnent dans les
      deux sens — provoqué, TON perso se verrouille agressif et n'écoute
      plus. Chaque carte adverse reste annoncée (lisible, à terme
      bloquable).
- [x] Effets de cartes paramétrés en données (DSL) — 14 primitives
      (soins, Hype, sabotage, réductions, armements vocaux, paris),
      coût en Souffle calculé par budget de puissance (reproduit
      exactement les 15 coûts existants — test de régression), bornes
      clampEffect prêtes pour les cartes générées par prompt. Le moteur
      lit un état générique, plus aucun effet codé en dur par carte.
- [x] Vague 2 : 8 nouvelles cartes combos (Adrénaline, Forteresse,
      Uppercut Verbal, Contre-Attaque Totale, Baroud d'Honneur,
      Guet-Apens, Sang-Froid Glacial, Peau d'Acier) — 100 % données DSL,
      coûts auto-validés. Deck de départ : 18 → 34 cartes (cible 30-60
      atteinte). Prochaines vagues de 5-10 au fil de l'eau.

## v1 — Mode Cinématique (voir GAME_DESIGN.md §7)

Le match devient un épisode d'anime : scènes Kling générées en asynchrone
entre les phases de coaching. Le mode arcade actuel reste le fallback.

- [ ] Refonte du flow de match en « scènes » : entrée → coaching → assaut
      (résolution + commentaire) → coaching → … → montage final
- [x] Commentateur shōnen v0 : narration temps réel par templates locaux
      (13 familles d'événements, anti-répétition, rythme contrôlé —
      silence de 3 s entre lignes mineures, les majeures parlent
      toujours), dessinée dans le canvas donc présente dans les clips.
      Toutes les lignes sont datées et conservées → nourriront les
      prompts des scènes Kling et le montage. API Claude ensuite.
- [ ] File de génération asynchrone (jobs Kling en arrière-plan, affichage
      quand prêt, fallback arcade si échec/retard)
- [ ] Portrait de référence par perso (Kling image) — ⚠️ crédits, accord requis
- [ ] Scènes image-to-video : entrée dans l'arène, moment fort du round, KO
- [ ] Montage final du match (concat des clips + habillage) exportable 9:16
- [ ] Génération de perso via API Claude (stats + lore + nom du spécial)
- [x] Le discours du coin du ring COMPRIS — v0 locale : parseur de
      consignes (speechTactics.ts, 9 règles dont conditionnelles « s'il
      sort son spécial… esquive »), phrases finales de la reco captées
      pendant la pause, 1 consigne gratuite par pause (max 2 primitives
      clampées, plus faibles que les cartes — la parole est la
      ressource), événement 🎤 + affichage dans l'overlay tactique.
      v1 : API Claude à la place du parseur (vraie compréhension), ce
      parseur devient le fallback hors-ligne. Pendant le round :
      mots-clés assumés (latence + réalisme boxe).
- [ ] Émotions MediaPipe FaceLandmarker (sourire/cri/colère → bonus distincts)
- [ ] Export mp4 (transcodage) + partage natif (Web Share API)
- [ ] i18n (fr/en)
- [ ] PWA installable mobile

## Vers la version vendable (gap analysis 2026-08-14)

Ordre de priorité réel vers le premier euro (canal web d'abord).

### Tier 0 — prouver le fun
- [ ] Playtests humains (10-20 personnes) : fun au 15e match ? points de
      décrochage ? → ajuster avant tout investissement
- [ ] Intégrer les illustrations Kling au jeu : portraits roster à la
      sélection / Vestiaire / HUD / bannières de spécial — le saut de
      qualité visible le plus rentable (planches déjà générées)

### Tier 1 — MVP vendable (recharges de crédits, web)
- [ ] Backend minimal : auth légère, sauvegarde cloud, portefeuille de
      crédits (le chantier structurant — tout le reste s'y branche)
- [ ] Paiement Stripe + boutique de recharges
- [ ] Pipeline Kling serveur : clip héroïque du KO généré en jeu (file
      async §7), mp4 9:16 partageable — LE produit vendu
- [ ] Génération perso + cartes via Claude API (serveur) + modération
      des prompts (les parseurs locaux deviennent les fallbacks)
- [ ] Polish mobile/iOS : mp4, Web Share, Safari, budget batterie
- [ ] Légal : CGU/CGV, privacy policy (« tout en local » valorisé),
      watermark « généré par IA » (AI Act), paiement mineurs
- [ ] Hébergement + analytics funnel (arrivée → match 1 → match 3 → achat)

### Tier 2 — Édition Histoire 14,90 € (stores)
- [ ] Mode histoire : arc shōnen, adversaires/decks dédiés, cinématiques
      pré-générées UNE fois, création de perso en récompense finale
- [ ] Wrapper Capacitor/Electron + pages stores

### Tier 3 — PvP (rétention long terme, après premiers revenus)
- [ ] Serveur d'autorité, matchmaking, Éclats

## v2

- [ ] L'Écurie : 3 combattants, remplacement au coin du ring (format
      switch — voir GAME_DESIGN.md §4 ter), collection de persos
- [x] Cartes créées par prompt v0 — la Forge de cartes : parseur local à
      14 familles de mots-clés → max 2 primitives clampées, coût
      budgétisé, timing déduit, nom extrait ou généré, desc auto depuis
      les effets, refus si aucun effet reconnu. Persistance (max 8),
      re-clamp au rechargement (anti-triche localStorage), 1 copie de
      chaque forgée dans le deck. v1 : parseur → API Claude, mêmes
      garde-fous.
- [ ] Figurine 3D du perso (prompt-to-3D Meshy/Tripo : modèle riggé en
      ~1 min, ~centimes) — trophée rotatif dans l'Écurie, façon Little
      Legends : de l'attachement cosmétique, le combat reste 2D manga.
      État de l'art 2026 vérifié : auto-rig + banques d'animations
      existent ; on n'y va PAS pour le combat (animations génériques vs
      notre mise en scène shōnen, cohérence de style, réécriture rendu).
- [ ] Prosodie vocale (intonation, pas seulement volume)
- [ ] Multijoueur coach vs coach
- [ ] Classements, saisons, événements

## Journal

- 2026-08-14 (routine) : Les consignes parlées v0 — réponse au constat
  utilisateur « ce qu'on dit n'a pas d'impact » : au coin du ring, chaque
  phrase finale de la reco vocale passe au parseur de consignes
  (9 familles, conditionnelles comprises) ; si comprise → primitives DSL
  gratuites mais bornées et plus faibles que les cartes, 1/pause,
  événement 🎤 annoncé + confirmation dans l'overlay. VoiceCoach expose
  désormais lastFinal/finalSeq (les phrases stabilisées). Tests sim :
  parsing conditionnel, combo 2 primitives, rejet du bruit, application
  unique par pause. La v1 Claude remplacera le parseur, même contrat.

- 2026-08-14 (routine) : Le coin adverse joue un VRAI deck — enemyDeck/
  enemyHand/enemySouffle symétriques, applyCardEffects paramétré par camp,
  mods des deux côtés dans resolveAttack/fireSpecial/tick (procs suffixés
  « ADVERSE » à l'écran), heuristique de valeur par primitive au coin du
  ring, signature de l'adversaire dans son deck. Provocation adverse :
  ton perso se verrouille agressif et refuse tes ordres. Piège mesuré en
  sim : donner une fenêtre de contre à chaque posture de l'IA → winrate
  coach 0 % ; restreinte aux contres armés par carte → coach+deck 86 %,
  coach sans cartes 76 % (le deck redevient un vrai avantage), sans
  coach 13 %. Modèle de monétisation gravé au design doc (Pass Coach
  9,99 € = histoire + 300 crédits, grille par action, Éclats PvP bornés). (6 morphologies, 6
  attributs animés, fentes d'action, danse de garde) — dernier gros
  item v0.5 hors vitest. Le placeholder vectoriel a maintenant de la
  personnalité en attendant les illustrations Kling.
- 2026-08-14 (routine) : Deck-builder v0 (src/game/deckBuilder.ts +
  contrôles −/+ sur les tuiles, modèle localStorage assaini, validité
  12-60, deck jouable = modèle + mérités). Test sim : sanitation d'un
  modèle trafiqué, composition exacte. Le système TCG demandé est
  complet de bout en bout : deck composable → pioche → Souffle →
  mulligan → instants à la voix → récompenses de paliers → forge.
- 2026-08-14 (routine) : Vague 2 de cartes (8 combos bi-primitives,
  zéro ligne de code moteur — pure donnée DSL, coûts vérifiés 23/23) +
  le coin adverse joue à chaque pause (soin/sabotage/moral, événement
  annoncé). Équilibre : coach 82 %, sans coach 26 %, deck naïf 82 % (le
  coin adverse compense le deck joué bêtement — l'avantage viendra du
  bon choix de cartes).
- 2026-08-14 (routine) : Forge de cartes par prompt (v0 mots-clés) —
  section ⚒ sur l'écran de sélection, cartes forgées persistées et
  re-clampées au chargement, ajoutées au deck. Test sim de bout en
  bout : prompt → primitives attendues → carte JOUÉE dans un vrai match
  avec effet mesuré. Le pipeline « habillage libre, mécanique bornée »
  fonctionne ; il ne reste qu'à brancher Claude à la place du parseur.
- 2026-08-14 (routine) : DSL d'effets — les 15 cartes deviennent des
  données (EffectPrimitive[14 types] + computeCost par budget de
  puissance + clampEffect). CardMods refondu en état générique ;
  applyCardEffects remplace le switch par carte ; expiration de fin de
  round = freshMods() (provoke conservé, temporel). Sim : coûts
  recalculés = coûts déclarés sur 15/15 cartes, tous tests verts,
  équilibre inchangé. Prochaine brique v2 débloquée : cartes par prompt
  = habillage libre + primitives choisies par l'IA + clamp + coût auto.
- 2026-08-14 (routine) : Boucle Vie d'Écurie bouclée — bondLevelFor
  (victoires + soin : 3 envies comblées = 1 victoire), paliers « choisis
  1 parmi 2 » (tirage déterministe FNV par perso+palier, +1 copie au
  deck, réclamation dans l'ordre), panneau 🎁 à la sélection, deck =
  starter + copies gagnées. Tous les usages de bondLevel(wins) migrés.
  Kling : test terminé la veille, en attente du verdict visuel
  utilisateur (« GO roster ») avant toute nouvelle dépense.
- 2026-08-14 : AUDIT COMPLET (demande utilisateur) — 10 bugs confirmés et
  corrigés, dont 3 critiques : (1) clips de moment fort corrompus au-delà
  de 14 s (chunk de l'ancien MediaRecorder poussé dans le tableau du
  nouveau segment — fix par closure) ; (2) « Revanche » qui ré-appliquait
  Lien + entraînement sur le perso déjà boosté (stats qui s'empilaient —
  fix : la revanche repart du perso de base) ; (3) pistes micro clonées
  jamais stoppées → capture micro active après le match (fix :
  releaseTracks dans les deux recorders). Aussi : IA adverse dépendante
  du framerate (probas → taux × dt), plan tactique reconduit en silence
  (reset au coin du ring), Espace qui réactivait le bouton focus (fausse
  Confusion), envie d'écurie qui renaissait dans la seconde (max 1/jour)
  + write localStorage pendant le rendu React (write-si-changement),
  énergie vocale non bornée (> 1), URLs de blob jamais révoquées
  (useMemo + revoke), code mort roundStartT inter-matchs supprimé.

- 2026-08-13 : v0 complète — scaffold, moteur, rendu, voix, facecam,
  tactique, export clip. Routine horaire créée (trig_012H6NK4CC6ekSeL29xiBnph,
  toutes les heures à h:19).
  Simulation headless (60 matchs) : coach actif 100 % de victoires,
  coach absent 57 % → le coaching pèse, mais sans doute trop
  (cible v0.5 : ~80-85 % pour un coach parfait). Les bonus atk/def des
  plans tactiques (PLAN_EFFECTS) ne sont pas encore appliqués dans
  resolveAttack — à câbler pendant l'équilibrage.
- 2026-08-13 (routine h+1) : Carnet du Coach implémenté (6 cartes, deck de
  3, jeu au coin du ring, hooks moteur pour les 6 effets, UI sélection +
  main en phase tactique, FX). Sim déplacée dans scripts/sim.ts : cartes
  déclenchées 60/60 matchs, tout se termine. L'IA adverse sans cartes ni
  la limite « coach parfait 100 % » ne sont pas traités (→ équilibrage).
- 2026-08-13 (routine h+2) : Traits d'écoute implémentés — Sanguin (les
  cris enflamment), Cérébral (hurler stresse, le calme transcende), Têtu
  (premier ordre du round ignoré), Fusionnel (facecam comptée double).
  Attribués au roster, déduits du prompt, affichés à la sélection, events
  de feedback à l'écran. Bonus atk/def des plans tactiques enfin câblés
  dans resolveAttack. Micro-tests Têtu/Cérébral dans scripts/sim.ts.
  NOTE : test Kling suspendu — deux tentatives interrompues par
  l'utilisateur ; ne pas relancer sans confirmation explicite de sa part.
- 2026-08-13 (routine h+3) : Lien coach-perso (localStorage, 5 paliers de
  titres, +1..3 HRT, affiché à la sélection et aux résultats ; les persos
  créés par prompt sont sauvegardés — max 4 — et gardent leur Lien).
  Équilibrage passe 1 : Hype continue du joueur ~20 s pour remplir la
  jauge (avant ~6 s), coach fantôme adverse avec trickle de Hype et
  contre-postures → coach parfait 100 % → 80 %.
- 2026-08-13 (routine h+4) : Bande-son WebAudio 100 % synthétisée (zéro
  asset) branchée sur les events du match, foule qui gronde avec la Hype,
  bouton muet. Équilibrage passe 2 — découverte : rounds de 7 s ! Refonte
  des dégâts (baseDamage, HP_SCALE 2.6, spéciaux ~40-50 % de la vie,
  contres 11) → rounds ~37 s. Découverte n°2 : le perso non coaché ne
  tirait JAMAIS son spécial (il attendait l'ordre) → mécanique
  d'initiative : jauge pleine + coach muet 6 s → il tire seul ; le skill
  du coach devient le timing. Résultats : coach parfait 88 %, sans coach
  40 %, avec carnet 97 % (cartes à surveiller). Auto-motivation de Hype
  symétrique pour les deux camps.
- 2026-08-13 (routine h+5) : le combo viral — clip exporté = composite
  jeu + facecam incrustée en miroir (badge ● COACH, watermark COACH
  ARENA) via un canvas caché branché sur le MediaRecorder. FX : zoom
  dramatique centré sur le lanceur de spécial (poussée rapide, relâche
  lente), écran fissuré au KO (fissures déterministes, pas de
  scintillement). Sim stable : 91 % / 32 % / 94 %, rounds ~35 s.
- 2026-08-13 (routine h+6) : Replay du moment fort — HighlightRecorder à
  segments rotatifs de 14 s sur le composite (facecam incluse) ; le
  segment du KO (ou le précédent s'il est < 6 s) devient le clip court,
  mis en avant en boucle sur l'écran de résultats. Le clip complet passe
  en bouton secondaire.
- 2026-08-13 (routine h+7) : Cartes signatures — une par perso du roster,
  liées à leur identité (Kenta se nourrit des coups, Rei humilie au
  contre, Yuna ne panique jamais, Gorō voit venir le spécial, Fang entre
  en frénésie sur ordre, Nyx devient fumée). Verrouillées sous Lien
  niv. 2, filtrées du carnet si on change de perso. Micro-tests Yuna
  (anti-confusion) et Fang (armée→voix) au vert.
- 2026-08-13 (routine h+8) : Écran Vestiaire (ReadyScreen) — annonce du
  match VS avec lore de l'adversaire, permissions demandées AVANT
  l'arène avec explication de chaque capteur et fallback affiché,
  rappel du trait d'écoute du perso, bouton « Faire sonner le gong ».
  Le flux médias est acquis au Vestiaire et transmis à l'arène.
- 2026-08-14 : Le Carnet devient le Deck du Coach (demande utilisateur,
  format TCG) : deck mélangé (18 cartes v0), main de 5, pioche à chaque
  pause, coût en Souffle (3/pause), mulligan 1-5 cartes une fois par
  pause, défausse remélangée. 3 nouvelles cartes Coach (Massage Éclair,
  Mise au Point, Douche Froide — première interaction anti-adversaire).
  Familles reformulées par timing : Coach / Instant·voix / Instant·pari.
  Équilibrage sain : le deck naïf n'est plus un auto-win (93 % vs 94 %
  sans cartes) — la valeur est dans le choix, plus dans la possession.
- 2026-08-14 (routine) : Vie d'Écurie v1 — src/game/stable.ts (humeur
  persistée avec dérive douce, envies par trait, 3 actions/jour :
  entraîner +1 stat consommé au prochain match / loisir / repos, envie
  comblée +10 humeur et compteur pour le Lien futur), panneau Écurie à
  la sélection, effets en combat via MatchOpts (startHype, sulky).
  Test sim dédié au vert. Reste : « choisis 1 carte parmi 2 » aux
  paliers, et l'entretien qui nourrit le Lien (desiresFulfilled stocké,
  pas encore branché sur bondLevel).
- 2026-08-14 : Onboarding de création en 3 questions (style, tempérament,
  univers, nom optionnel) composant le prompt automatiquement — fin de la
  page blanche ; mode expert conservé. Design Vie d'Écurie gravé
  (§4 quater) : humeur/envies/entraînement jamais punitifs, paliers de
  Lien « choisis 1 parmi 2 ». Test sim du prompt guidé (Frimas) au vert.
- 2026-08-14 : Jauge d'Ulti (demande utilisateur) — jauge de match
  conservée entre rounds, chargée par le combat (encaisser ×2, rounds
  perdus +15 : comeback), Ultime unique par perso (6 noms roster +
  génération prompt « X : Zénith »), déclenchée UNIQUEMENT par le coach
  (« ULTIME ! », touche U, bouton dédié rouge) — pas d'initiative auto,
  contrairement au spécial. HUD 3e jauge, mise en scène dédiée (zoom
  long, bannière ★, son double-riser, foule en folie), commentateur.
  Sim : coach 83 %, sans coach 27 % (l'Ulti ne sort jamais sans coach —
  assumé), rounds ~35 s. Migration des persos custom sauvegardés.
- 2026-08-14 (routine) : Commentateur shōnen v0 (templates FR, poids
  1-3 pilotant taille/durée d'affichage, bandeau dessiné dans le canvas
  → visible dans les clips exportés). Test sim : 21 lignes sur un
  match, placeholders substitués, finale correcte. Vision « tout par
  prompt » gravée au design doc (§4 ter) : cartes par prompt via DSL
  bornée + budget de puissance, écurie v2 format switch, perso ou
  créature au choix du prompt.
