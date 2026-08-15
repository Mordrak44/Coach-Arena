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
- [x] Tests unitaires du moteur de combat (vitest) — 19 tests
      (src/game/engine.test.ts, `npm test`) : coûts DSL, clamps,
      signatures, deck-builder, confusion, Ulti/spécial, mulligan,
      Souffle, coin adverse symétrique, consignes, forge, réalisateur.
      scripts/sim.ts reste l'outil d'équilibrage (winrates, durées).

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
- [x] Vague 3 « la guerre des coins » : 2 nouvelles primitives DSL
      (blockEnemyCard : la meilleure carte adverse part dans le vide à
      la prochaine pause ; drainSouffle : le coin adverse arrive
      essoufflé) + 5 cartes (Silence du Coin, Vol de Souffle, Rideau de
      Fumée, Taxe du Champion, Embargo Total). 100 % symétrique :
      l'adversaire peut te bloquer/drainer aussi. Ces paris survivent à
      la fin de round (résolution à la pause suivante). Le deck adverse
      devient une cible — la promesse « lisible et à terme bloquable »
      est tenue. Équilibre : coach 82 %, +deck 89 %, sans coach 16 %.
- [x] Le Temps Mort (vision utilisateur : geler le combat pour parler et
      jouer une carte) — nouvelle mécanique, symétrique, indépendante de
      toute vidéo. 1 par round (rechargé à chaque manche, sur retour
      utilisateur — pas 1 par match : chaque round mérite son moment de
      respiration), bouton dédié en combat, gèle TOUT (tick() ne résout
      plus rien pendant le gel — état des combattants figé à l'identique),
      main jouable + consignes parlées pendant les 5 s chronométrées,
      reprise EXACTE (le chrono du round n'est pas remis à zéro). Coin
      adverse : temps mort d'urgence automatique si PV critiques + carte
      de soin en main (garde-fou : jamais de « résurrection » après un KO
      déjà arrivé). Bug réel trouvé et corrigé en le testant en capture :
      muter m.phase depuis un clic (hors du tick()) n'était jamais vu
      par la détection de changement de phase de la boucle de jeu (elle
      compare avant/après SON PROPRE tick, pas les mutations externes)
      — l'état React ne se synchronisait donc jamais ; corrigé en
      synchronisant explicitement dans le handler, comme pickPlan/
      onSwitch le font déjà. Bandeau « 🛑 TEMPS MORT » dessiné directement
      sur le canvas (pas seulement en overlay DOM) : le recorder n'exporte
      que le canvas, donc sans ce bandeau un clip TikTok montrerait un
      combat qui se fige 5 s sans explication, comme un bug de lag.
      5 tests vitest (47 au total), vérifié en capture — y compris une
      capture du canvas SEUL (toDataURL, sans le DOM par-dessus) pour
      confirmer que le bandeau est bien gravé dans ce qui sera exporté.

## v1 — Mode Cinématique (voir GAME_DESIGN.md §7)

Le match devient un épisode d'anime : scènes Kling générées en asynchrone
entre les phases de coaching. Le mode arcade actuel reste le fallback.

- [ ] Refonte du flow de match en « scènes » : entrée → coaching → assaut
      (résolution + commentaire) → coaching → … → montage final
- [x] Le Réalisateur (sceneDirector.ts) : détection des moments forts
      depuis les événements (Ulti > spécial > contre > crit, le meilleur
      par round), prompts vidéo EN prêts pour Kling (entrée + top 2
      moments + finale « clip héroïque », apparence par archétype +
      couleurs converties en mots), affichés sur l'écran de résultats
      avec bouton copier — utilisable à la main dès aujourd'hui, la file
      async les consommera côté serveur demain.
- [x] Commentateur shōnen v0 : narration temps réel par templates locaux
      (13 familles d'événements, anti-répétition, rythme contrôlé —
      silence de 3 s entre lignes mineures, les majeures parlent
      toujours), dessinée dans le canvas donc présente dans les clips.
      Toutes les lignes sont datées et conservées → nourriront les
      prompts des scènes Kling et le montage. API Claude ensuite.
- [x] Le Séquenceur de cuts (cutPlanner.ts) — le contrat du « combat en
      cuts » en code : événements du match → EDL (liste de cuts avec
      template, persos à swapper, habillage, durées), grammaire anime
      (solos / échanges à deux / neutres), budget de cuts par round
      (sélection par score), relèves rejouées pour attribuer chaque cut
      au bon perso, templateShoppingList (cahier des charges dérivé).
      docs/TEMPLATES_SPEC.md : les ~16 templates à produire, priorisés,
      avec les 3 tests de validation (n°1 bloquant : counter-exchange
      + swap de paire). 3 tests vitest.
- [x] CutSequencer + cutLibrary (suite à la discussion « round vidéo
      pré-construite vs direct ») : lecture INCRÉMENTALE des cuts,
      même contrat que ArenaRenderer.ingestEvents — préserve le principe
      fondateur (le coach coache le direct, jamais un résultat déjà
      joué). cutLibrary.ts pose le contrat de préchargement pendant le
      coin du ring (stub aujourd'hui, signature stable pour demain) ;
      bibliothèque vide = silence, jamais un crash. 3 tests vitest
      (39 au total). Reste à ajouter au modèle : techniques débloquées
      par perso (accroche Lien/entraînement déjà en place).
- [x] LiveCutPlayer — le lecteur de cuts EN DIRECT, suite à la règle
      affinée avec l'utilisateur (« ce qui compte est l'événement
      résolu, pas l'écran » : la vidéo est autorisée PENDANT le round
      sur tout événement déjà tranché par la simulation, jamais sur une
      décision encore ouverte). File bornée à MAX_QUEUE : un cut en
      retard est sauté au profit du plus récent, jamais plus d'un
      battement de décalage avec la réalité. Bibliothèque vide
      aujourd'hui → current() toujours null → zéro changement visible
      (le vectoriel reste seul à l'écran). 3 tests vitest (42 au
      total). Le `<video>` par-dessus le canvas est câblé plus bas
      (entrée suivante).
- [x] CutKind.idle-loop — suite à la question utilisateur « théoriquement
      on pourra faire un combat juste vidéo + facecam, sans jamais voir
      le vectoriel ? ». Répondu : oui en théorie, mais un vrai trou
      manquait à l'architecture — cutsForEvent() ne produit QUE des cuts
      déclenchés par un événement résolu ; rien ne couvrait le SILENCE
      continu entre deux événements (l'attente, la garde), que le
      vectoriel comble aujourd'hui gratuitement en rendant en continu.
      Ajouté : `idleLoopCut()` + `CutSequencer.activeNames()` (suit les
      relèves) + LiveCutPlayer demande un idle-loop dès que sa file est
      vide ET que le round tourne (`m.phase === 'fighting'`) — jamais
      hors round. Bibliothèque vide aujourd'hui → toujours null → zéro
      changement visible (bundle identique en taille, vérifié). Doc :
      nouvelle entrée Priorité 1 dans TEMPLATES_SPEC.md (17 templates
      désormais) + réponse écrite à la question. 4 tests vitest (50 au
      total).
- [x] Le `<video>` câblé dans ArenaScreen — la dernière pièce mécanique
      du combat en cuts, repoussée depuis LiveCutPlayer faute d'un moyen
      de la vérifier en capture. `prefetchForMatchup(player, enemy, [])`
      lancé à l'entrée en arène (le stub reste instantané, donc pas de
      latence ajoutée) ; `sys.cutPlayer.update(m)` à chaque frame ;
      `<video className="cutVideo">` remonté par `key={url}` dès que
      `current()` renvoie un clip, superposé au canvas (z-index sous le
      HUD/coin du ring — jamais au-dessus). Le canvas caché du recorder
      dessine le clip vidéo AU LIEU du canvas visible pendant qu'un cut
      joue, pour que l'export garde le même habillage que ce que le
      joueur voit. LiveCutPlayer.setLibrary() ajouté (le prefetch est
      async, le lecteur doit exister dès la création du match).
      Vérifié par un patch TEMPORAIRE de prefetchForMatchup (généré un
      clip de test via canvas+MediaRecorder — même technique que
      systems/recorder.ts — donc zéro crédit Kling dépensé), capturé en
      3 niveaux (page complète, `<video>` isolé, canvas composite caché
      via toDataURL), PUIS entièrement retiré avant de committer — le
      code livré n'utilise QUE le vrai `prefetchForMatchup` (toujours
      `EMPTY_CUT_LIBRARY`). Regression : capture du funnel standard
      identique à avant, bundle production +3 Ko gzip (le code du
      combat en cuts est désormais réellement importé par l'appli, plus
      seulement par les tests).
- [x] File de génération asynchrone (sceneQueue.ts) — même principe que
      cutLibrary.ts : `SceneJobQueue` prend les plans du Réalisateur, un
      job par scène, indépendants (l'échec ou le retard de l'un
      n'affecte jamais les autres). `SceneSubmitter` est le point
      d'extension pour un vrai pipeline serveur demain ;
      `STUB_SCENE_SUBMITTER` (défaut) échoue proprement et vite —
      aucun pipeline branché aujourd'hui. Garde-fou « retard » :
      `Promise.race` contre un timeout (20 s par défaut) pour ne jamais
      rester bloqué sur un job muet. Câblé dans ResultsScreen : pendant
      qu'un job est 'pending' → « ⏳ génération… », 'ready' → lecteur
      `<video>` inline, 'failed' → l'UI copier-coller manuelle
      d'aujourd'hui (le vrai filet « fallback arcade », pas une
      régression dégradée). Avec le stub, tous les jobs finissent
      'failed' en un micro-tick → écran de résultats identique à avant
      (vérifié en capture, `<details>` fermé par défaut ET ouvert :
      mêmes prompts, mêmes boutons Copier). 4 tests vitest (54 au
      total).
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
- [x] Export mp4 + partage natif — SANS transcodage : le conteneur est
      choisi à la source (pickMimeType : mp4 si le navigateur sait
      l'enregistrer — Safari/iOS, Chromium récents — sinon webm),
      extensions de fichiers dynamiques, bouton « 📤 Partager le KO »
      via Web Share API (feuille de partage mobile → TikTok direct),
      repli téléchargement sur desktop. ffmpeg.wasm (~30 Mo) évité.
- [ ] i18n (fr/en)
- [x] PWA installable mobile — manifest (portrait, standalone), icônes
      générées (192/512/maskable/apple-touch, monogramme CA arcade),
      service worker (cache-first sur les assets hashés, network-first
      ailleurs avec repli hors-ligne — le jeu 100 % client tourne sans
      réseau), meta iOS. Enregistré en prod uniquement.

## Vers la version vendable (gap analysis 2026-08-14)

Ordre de priorité réel vers le premier euro (canal web d'abord).

### Tier 0 — prouver le fun
- [x] Bulles d'aide « premiers pas » — deux courtes bulles fermables,
      montrées une seule fois dans la vie du joueur (localStorage) :
      pendant le combat (« crie ATTAQUE ! ou clique un bouton »),
      pendant le tout premier coin du ring (« choisis un plan, joue tes
      cartes »). Réduit le décrochage des arrivées TikTok qui ne savent
      pas encore qu'on parle à son perso — sans ralentir un joueur qui
      sait déjà (fermable en un tap, jamais bloquant). Bug découvert et
      corrigé en cours de route : `.overlay` (coin du ring) utilisait
      `justify-content: center` + overflow — le haut du contenu
      (titre, countdown, tagline) devenait injoignable au scroll dès
      que le contenu dépassait un écran (systématique avec deck+banc) ;
      passé à `flex-start`, entièrement atteignable désormais.
- [x] Passe de rendu 2.5D (fausse perspective, zéro 3D) : horizon lumineux
      lié à la Hype, projecteurs qui balaient, foule étagée en perspective
      avec fans à bâtons lumineux, ring à lattes convergentes (point de
      fuite) + cercle central + poteaux/tendeurs + cordes tendues avec
      reflet, ombres portées sous les persos, vignette. Vérifiée par
      captures Chromium headless.
- [x] Mode démo (?demo : arène directe sans capteurs) + outil de capture
      scripts/shot.mjs (vite preview + Chromium préinstallé) — press kit
      et tests visuels automatisés.
- [x] FIX mobile découvert par la capture : sur les écrans plus étroits
      que 9:16, l'aspect du .stage cassait et le canvas rognait le HUD
      (height: min(100vh, 100vw·16/9)).
- [x] Écran titre « attract mode » : un combat IA vs IA (Hype de départ
      60, phases tactiques sautées, nouveau matchup en boucle) tourne
      derrière le titre comme une borne d'arcade, voile dégradé (texte
      lisible en haut, ring visible en bas). Le funnel TikTok voit du
      gameplay AVANT le premier clic. shot.mjs capture désormais tout le
      funnel (titre, sélection, arène ×2).
- [x] Silhouettes v2 « encrées » : contours manga sur toutes les formes,
      membres courbés en 2 segments (coude/genou implicites), torse
      habillé (épaules→taille, col en V, ceinture nouée), gants et pieds,
      visage expressif par état (cri en attaque, œil fermé + grimace
      quand touché, pupille vers l'adversaire, goutte de sueur PV bas).
      Vérifié par captures avant/après.
- [x] Audit visuel de l'écran Histoire (StoryScreen) — jamais capturé
      depuis sa création, pas dans le funnel de scripts/shot.mjs. Même
      classe de bug que `.overlay` la veille, reproduite cette fois sur
      `.screen` (partagé par 5 écrans) : `justify-content: center` +
      `overflow-y: auto` laisse le HAUT du contenu au-delà de
      `scrollTop = 0` dès que le contenu dépasse la hauteur de l'écran —
      constaté avec 7/8 chapitres débloqués (8 boutons + titre + tagline
      + 2 boutons dépasse un petit mobile) : le logo « LE GRAND HURLEMENT »
      restait invisible même en forçant `scrollTop = 0` par script, et le
      bouton « Retour » en bas était coupé. La veille, `.screen` avait été
      audité sur CharacterSelect et jugé sain — correctement : il l'était
      À CE MOMENT-LÀ, le contenu ne débordait pas encore assez pour
      révéler le même bug latent. Corrigé avec `justify-content: safe
      center` (Chromium 141 le supporte) plutôt qu'un `flex-start` sec
      comme pour `.overlay` : centre quand le contenu tient (Titre, Vie
      privée, Résultats), bascule en alignement de départ dès qu'il
      déborde — un seul écran, deux comportements selon le contenu,
      sans régression sur les écrans courts (vérifié en capture sur les
      5 écrans du funnel standard + Histoire à pleine hauteur, haut ET
      bas atteignables).
- [x] Aperçu de partage (Open Graph / Twitter Card) — jusqu'ici absent :
      partager le LIEN du jeu (pas un clip) sur Discord/Slack/iMessage/X
      n'affichait aucune carte, juste une URL nue. `og-image.png` généré
      en capturant un vrai moment de jeu (`?demo=fast`, viewport 1200×630
      qui déclenche la disposition « plateau TV » déjà construite —
      bulles d'aide masquées via localStorage pour une image propre,
      sans tutoriel dessus) plutôt qu'une icône statique. `og:url` et les
      chemins d'image restent relatifs faute de domaine de prod choisi
      (voir « Hébergement » plus bas) — à absolutiser une fois hébergé.
      Description reprise telle quelle du manifest PWA pour rester
      cohérent. Zéro risque : balises `<head>` pures, aucun code JS
      touché, 54 tests vitest inchangés.
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
- [x] Fix silencieux potentiel sur Safari/iOS : `sound.start()` tourne
      dans un `useEffect` (hors de la pile SYNCHRONE du clic « Faire
      sonner le gong »), donc le contexte audio peut démarrer
      « suspended » et rester muet indéfiniment (contrainte Safari
      documentée, aucun `.resume()` n'existait nulle part dans le code
      avant ce correctif). Ajout : `SoundSystem.resume()` +
      `VoiceCoach.resume()`, débloqués sur la toute première
      interaction réelle du coach dans l'arène (`pointerdown`/`keydown`
      une fois, retirés ensuite) — silencieux et sans coût sur
      Chrome/Firefox desktop où l'audio tourne déjà. Non vérifiable sur
      vrai matériel iOS dans ce sandbox ; correction basée sur une
      contrainte plateforme bien documentée, pas une supposition.
- [ ] Polish mobile/iOS : Safari (tests réels), budget batterie —
      mp4 + Web Share faits (voir Mode Cinématique)
- [~] Légal : écran « 🔒 Vie privée » v0 FAIT (micro/caméra/clips/
      progression/mineurs — le « tout en local » assumé comme argument,
      lien discret sur l'écran titre, engagement de prévenir AVANT toute
      fonction en ligne). Restent : CGU/CGV formelles au moment du
      paiement, watermark « généré par IA » quand les clips Kling
      arriveront en jeu, relecture par un juriste avant lancement.
- [ ] Hébergement + analytics funnel (arrivée → match 1 → match 3 → achat)

### Tier 2 — Édition Histoire 14,90 € (stores)
- [x] Mode histoire v0 « Le Grand Hurlement » : 8 chapitres écrits
      (narration + réplique d'avant-match + outro de victoire),
      adversaires dédiés à difficulté croissante (scale 0.85 → 1.30,
      stats bornées), équipes adverses aux chapitres 5-8, boss final
      inédit (Shion, le Champion Muet — variante prodigy), progression
      persistée avec déverrouillage en chaîne, écran Histoire + entrée
      depuis le titre, outro narrative aux résultats. v1 : cinématiques
      pré-générées par chapitre, création de perso en récompense finale.
- [x] Decks adverses thématiques par chapitre : le coin adverse raconte
      le même personnage que le ring (ch3 Yuna = contrôle, ch4 Gorō =
      le mur, ch5 la meute = aggro + sa signature, ch7 = guerre des
      coins, ch8 = le champion complet). MatchOpts.enemyDeck générique.
- [x] HUD d'équipe : le banc affiché sous les étoiles (pastille couleur
      + mini-barre de PV, croix rouge si KO) des deux côtés — les clips
      montrent que c'est un combat d'équipe. Démo avec équipes.
- [ ] Wrapper Capacitor/Electron + pages stores
- [x] Plateau TV en paysage (CSS pur, zéro dépendance) : sur écran large
      (≥900px, format paysage), les tuiles des coachs quittent les coins
      de l'arène pour les marges latérales (position: fixed, calées sur
      la demi-largeur réelle de la scène 9:16 — 28.125vh), agrandies
      (260px), avec un fond radial qui rappelle l'arène au lieu de
      bandes noires mortes. Canvas/moteur strictement inchangés — un
      media query. Mobile vérifié non régressé. Reste pour l'Édition PC
      complète (Steam) : wrapper Capacitor/Electron, pages stores.
      Angle stratégique : le joueur PC type est un streamer, le jeu est
      un format Twitch par nature.

### Tier 3 — PvP (rétention long terme, après premiers revenus)
- [ ] Serveur d'autorité, matchmaking, Éclats

## v2

- [x] L'Écurie v0 : équipe de 1+2, relève au coin du ring (1 Souffle,
      1×/pause, PV/Hype/Ulti conservés par combattant — le sortant ne
      récupère PAS sur le banc), sélection d'équipiers à l'écran de
      sélection (roster + customs, chacun monte avec SON Lien), équipe
      adverse de même taille avec relève IA (actif < 35 % PV et banc
      plus frais), annonce 🔁 à l'écran. v1 : soins de banc, cartes
      d'équipe, collection.
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
- [x] Prosodie vocale v0 — détection de pitch 100 % locale
      (autocorrélation normalisée sur le time-domain WebAudio, 0 €,
      zéro réseau) : PitchTracker apprend la voix posée du coach
      (baseline adaptative) et mesure le ratio courant. En jeu :
      « crier » = fort OU monté dans les aigus ; « calme » = volume posé
      ET ton posé — un Cérébral se braque sur un ordre aigu même
      chuchoté, un Sanguin s'enflamme. CoachInput.voiceTone optionnel
      (boutons/clavier = ton neutre). Tests : sinus 220 Hz ±5 %, rejet
      bruit/silence, tracker, effet Cérébral.
- [x] La « visio des coachs » v0 (demande utilisateur) — préfiguration
      du PvP : ta cam en tuile bas-gauche, le COACH ADVERSE en tuile
      bas-droite (avatar animé qui réagit : 😤 + bulle quand il joue une
      carte — tu VOIS son coup —, 🔥 sur son spécial, 😏/😱 en fin de
      round), tuiles visibles PENDANT le coin du ring (au-dessus de
      l'overlay), et ta tuile PULSE quand ta voix déclenche une carte
      armée — le signal que l'adversaire humain verra en PvP. Les deux
      tuiles sont aussi incrustées dans les clips. En PvP, la tuile
      adverse devient la cam du joueur d'en face.
- [ ] Multijoueur coach vs coach
- [ ] Classements, saisons, événements

## Journal

- 2026-08-15 (routine) : Aperçu de partage du LIEN (Open Graph / Twitter
  Card). Après avoir épuisé l'audit CSS (grep de tous les
  `overflow-y: auto` + `justify-content: center` du fichier — plus aucun
  autre cas que `.screen`/`.overlay`, déjà corrigés), et avec le reste du
  ROADMAP bloqué par des crédits/un backend/du matériel réel, j'ai cherché
  un autre gap zéro-risque servant directement l'identité "conçu pour la
  viralité TikTok" du projet : `index.html` n'avait NI meta description NI
  balises Open Graph — partager le lien du jeu lui-même (pas un clip)
  affichait une carte vide sur Discord/Slack/iMessage/X. Corrigé avec une
  vraie capture de jeu comme image de preview plutôt qu'une icône statique
  — `?demo=fast` à 1200×630 (déclenche la dispo "plateau TV" déjà
  construite), bulles d'aide masquées via localStorage pour une image
  propre. Description reprise du manifest PWA pour rester cohérent entre
  les deux. `og:url`/chemins d'image en relatif, faute de domaine de prod
  encore choisi — noté dans le HTML pour ne pas l'oublier au moment de
  l'hébergement. Pur `<head>`, zéro JS touché, 54 tests vitest inchangés.

- 2026-08-15 (routine) : Bug réel trouvé et corrigé sur l'écran Histoire
  (StoryScreen), jamais audité jusqu'ici (absent du funnel de
  scripts/shot.mjs). Après quatre itérations d'affilée sur le combat en
  cuts, tout ce qui restait d'ouvert dans ROADMAP.md nécessitait des
  crédits, un backend, ou du matériel réel — donc plutôt que forcer une
  tâche gate-keepée, j'ai repris la discipline qui avait déjà trouvé le
  bug `.overlay` : auditer un écran jamais vérifié. `.screen` (partagé par
  Titre/Vie privée/Histoire/Vestiaire/Résultats) avait été jugé sain sur
  CharacterSelect la veille — correctement, à ce moment précis : le
  contenu ne débordait pas encore. Avec 7/8 chapitres débloqués (le cas
  d'un joueur avancé, testé en pré-remplissant le localStorage), le même
  `justify-content: center` + overflow a laissé le TITRE au-delà de
  `scrollTop = 0` — vérifié par script (pas juste visuel) : forcer
  `el.scrollTop = 0` et capturer confirmait le logo absent, le bouton
  Retour coupé en bas. Corrigé avec `justify-content: safe center`
  (Chromium 141 le supporte) au lieu d'un `flex-start` sec comme pour
  `.overlay` — préserve le centrage sur les écrans courts (vérifié sur
  les 5 captures du funnel standard, aucune régression) tout en résolvant
  le débordement sur les écrans longs. Pur CSS, 54 tests vitest
  inchangés, sim/build inchangés (hors taille CSS négligeable).

- 2026-08-15 (routine) : File de génération asynchrone des scènes
  (sceneQueue.ts) — prochaine case non cochée de « Mode Cinématique »
  après trois itérations consécutives sur le combat en cuts. Même
  discipline : une architecture réelle, testée, câblée dans l'UI, mais
  qui ne change RIEN à ce que le joueur voit tant qu'aucun vrai pipeline
  n'est branché (STUB_SCENE_SUBMITTER échoue toujours, comme
  EMPTY_CUT_LIBRARY renvoie toujours null). Le vrai gain : le
  copier-coller manuel des prompts (ResultsScreen) devient un ÉTAT parmi
  d'autres ('failed') plutôt que le seul chemin possible — le jour où un
  submitter réel existe (serveur Kling), 'pending' affiche un spinner et
  'ready' un lecteur vidéo inline, sans toucher à ResultsScreen. Garde-fou
  ajouté d'emblée (pas en réaction à un bug) : timeout par job via
  Promise.race, pour qu'un pipeline lent ou muet ne bloque jamais
  indéfiniment un job — chaque job est de toute façon indépendant des
  autres. Vérifié en capture : écran de résultats fermé (identique à
  avant) ET ouvert (mêmes prompts, mêmes boutons Copier, aucune régression
  visible). 54 tests vitest, sim/build inchangés.

- 2026-08-15 (routine) : Le `<video>` du combat en cuts, câblé — suite à
  la question « donc si tous les templates sont bons je vois pas le
  vecteur mais vidéo ? et si je veux tester déjà en vecteur ? ». Réponse
  donnée en conversation : aujourd'hui le joueur ne voit QUE du vecteur,
  car le `<video>` lui-même n'était pas branché dans ArenaScreen (noté
  « pas fait tant que ce n'est pas vérifiable en capture » dans l'entrée
  LiveCutPlayer). Cette itération le branche pour de vrai : boucle de jeu
  → `cutPlayer.update(m)` → `current()` comparé par URL (évite un rendu
  React à chaque frame) → `<video>` remonté par clé quand ça change,
  superposé au canvas, ET le canvas composite caché (celui que le
  recorder exporte) dessine la vidéo au lieu du vectoriel pendant qu'un
  cut joue — sinon le clip exporté aurait montré autre chose que ce que
  le joueur voit à l'écran. Vérification à trois niveaux SANS dépenser un
  crédit Kling : patch temporaire de `prefetchForMatchup` générant un
  clip de test avec canvas+MediaRecorder (la même technique que
  systems/recorder.ts, donc déjà prouvée dans ce bac à sable), capturé en
  page complète / `<video>` isolé / canvas composite via `toDataURL()`,
  puis intégralement retiré avant de committer — `git status` vérifié
  propre sur les 3 fichiers voulus avant le commit. Régression : capture
  du funnel standard identique pixel pour pixel à avant ; le bundle
  production grossit de ~3 Ko gzip (le module cutPlanner/cutLibrary
  n'était importé que par les tests jusqu'ici, il l'est maintenant par
  l'appli — attendu, pas un bug). 50 tests vitest inchangés, sim OK.

- 2026-08-15 (routine) : CutKind.idle-loop — l'utilisateur a demandé si un
  combat pourrait un jour être 100 % vidéo + facecam, jamais de
  vectoriel. Réponse déjà donnée en conversation (oui en théorie, deux
  conditions manquantes) ; cette itération comble la première :
  cutsForEvent() ne couvrait que les instants RÉSOLUS par un événement,
  rien pour le silence continu entre deux événements que le vectoriel
  seul comblait jusqu'ici. Nouveau CutKind 'idle-loop' (2 persos, ~2 s,
  bouclable), `idleLoopCut()`, `CutSequencer.activeNames()` (pour savoir
  qui swapper hors contexte d'événement), et LiveCutPlayer qui le
  demande dès que sa file est vide en plein round. Toujours zéro
  changement observable (EMPTY_CUT_LIBRARY reste kind-agnostique, bundle
  de taille identique) — même discipline que le reste de l'architecture
  cuts : câblé et testé avant d'avoir un seul vrai clip. Doc mise à jour
  (TEMPLATES_SPEC.md : nouvelle ligne Priorité 1, réponse écrite à la
  question, volumétrie 16 → 17). 4 tests vitest (50 au total), build/sim
  inchangés.

- 2026-08-15 (routine) : Le Temps Mort, suite — deux retours utilisateur
  traités dans la foulée. (1) « 1 par round plutôt » que 1 par match :
  `TIMEOUTS_PER_MATCH` renommé `TIMEOUTS_PER_ROUND`, rechargé dans
  `startNextRound` (m.timeoutsLeft/enemyTimeoutsLeft remis au max à
  chaque nouvelle manche). L'UI se resynchronise gratuitement — elle
  écoutait déjà tout changement de phase, et le passage roundEnd→tactics→
  intro en fait partie. Nouveau test vitest qui traverse un round entier
  (fighting→roundEnd→tactics→intro round 2) et vérifie la recharge des
  deux réserves. (2) Le bandeau canvas « 🛑 TEMPS MORT » qui restait en
  chantier (ajouté dans arenaRenderer.ts avant la coupure de contexte,
  jamais buildé ni vérifié) : build + 47 tests vitest + sim OK, puis
  vérifié par deux captures — l'overlay DOM complet, ET le canvas SEUL
  (via `canvas.toDataURL()`, pour voir exactement ce que le recorder
  exporte sans le DOM par-dessus) comparé côte à côte avec une capture
  « avant gel » : le fond s'assombrit bien, le bandeau jaune/noir est
  net et lisible par-dessus les combattants figés. Sans cette vérif au
  niveau pixel du canvas, un bug où le bandeau ne s'affiche qu'en DOM
  (donc invisible dans les clips exportés) serait passé inaperçu — c'est
  exactement le problème que ce bandeau existe pour résoudre.

- 2026-08-15 : Le Temps Mort — la mécanique proposée par l'utilisateur
  pour résoudre « geler le combat, parler, jouer une carte » sans
  attendre la moindre vidéo : nouvelle phase 'timeout', gel total
  symétrique, 1 par match, résolution exacte (chrono préservé). Le vrai
  bug de la session : muter m.phase depuis un gestionnaire de clic ne
  se voyait jamais dans la boucle de jeu, dont la détection de
  changement de phase compare son état avant/après SON PROPRE tick() —
  une mutation externe entre deux frames n'est simplement jamais
  détectée par ce pattern. Trouvé uniquement parce que la capture
  d'écran montrait un jeu figé sans overlay visible ; corrigé en
  synchronisant l'état React directement dans le handler. 4 tests
  vitest (46 au total) + 3 captures de vérification (gel, carte jouée,
  reprise au bon chrono, 54 s et non 59 s).

- 2026-08-15 (routine) : Audit ciblé + fix silence potentiel Safari/iOS.
  D'abord un audit visuel de CharacterSelect (jamais vérifié en entier
  depuis l'ajout équipe/écurie/forge) : fausse alerte sur `.screen`
  (j'ai vérifié par un test de scroll réel — contrairement à `.overlay`
  hier, il est entièrement atteignable, je n'ai pas « corrigé » ce qui
  n'était pas cassé) ; panneaux équipe/écurie/forge/deck tous propres en
  capture. Ensuite, audit de compatibilité iOS (par lecture de code,
  faute de vrai appareil) : `sound.start()` s'exécute dans un
  `useEffect`, hors de la pile synchrone du clic « Faire sonner le
  gong » — sur Safari, le contexte audio peut démarrer « suspended » et
  ne JAMAIS jouer un son, sans qu'aucun `.resume()` n'existe dans tout
  le code. Ajouté : resume() sur sound.ts et voice.ts, déclenché à la
  première interaction réelle dans l'arène. 42 tests + sim verts, aucune
  régression visuelle.

- 2026-08-15 (routine) : Bulles d'aide premiers pas + fix d'un bug
  d'accessibilité réel du coin du ring. Exploration écartée cette
  itération : Émotions MediaPipe FaceLandmarker — accessible en réseau
  (vérifié), mais 12-36 Mo de binaires WASM à committer et aucun moyen
  de valider la détection sur un vrai visage dans cet environnement
  sandboxé (pas de webcam réelle) ; reporté plutôt que livré à l'aveugle
  avec des seuils non vérifiés. À la place : deux bulles d'aide
  fermables (combat + premier coin du ring, localStorage, jamais
  répétées), qui adressent directement le risque n°1 identifié dans le
  gap analysis (décrochage des arrivées TikTok). En vérifiant en
  capture, découverte d'un vrai bug : le coin du ring devenait
  partiellement injoignable au scroll dès que son contenu dépassait un
  écran (deck + banc + relève, un cas courant) à cause de
  `justify-content: center` sur un conteneur en overflow — corrigé en
  `flex-start`. 42 tests + sim verts, funnel complet revérifié.

- 2026-08-15 (routine) : LiveCutPlayer — la conclusion de la discussion
  sur « vidéo pendant le round » devient du code : file de cuts bornée
  (MAX_QUEUE, saute les retards), expiration par horloge de match,
  silence garanti tant que la bibliothèque est vide (aucun changement
  visible aujourd'hui, comportement identique au jeu actuel). 3 tests
  dédiés couvrant le garde-fou anti-accumulation. Câblage UI volontairement
  reporté : rien à vérifier visuellement tant qu'aucun clip n'existe —
  la discipline « toute évolution visuelle est capturée » l'interdit
  pour l'instant.

- 2026-08-15 (routine) : Le plateau TV en paysage — réponse à « il y a
  un PC joueur possible ? » : sur écran large, les tuiles des coachs
  (facecam + coach adverse) migrent en CSS pur des coins de l'arène vers
  les marges latérales, agrandies, avec un fond d'ambiance au lieu de
  bandes noires — le combat garde son canvas 9:16 intact au centre.
  Zéro dépendance, zéro appel réseau, testable dans cette session.
  Vérifié à 1280×800 et 1920×1080 (tuiles bien calées, pas de
  chevauchement) et en mobile (non régressé). Recherche complémentaire :
  tarifs réels swap vidéo — Viggle API ~0,01 $/s (le bon choix pour
  démarrer), ComfyUI/Wan auto-hébergé ~0,08-0,10 $/s sur H100 (rentable
  seulement à gros volume) — chiffrage qui referme la discussion sur le
  coût du pipeline templates+swap.

- 2026-08-15 (routine) : Le Séquenceur de cuts — les décisions de design
  de la veille (templates + swap, combat en cuts, échanges par matchup)
  deviennent du code testé : planCuts(match) → EDL complète (intro,
  budget de moments forts par round, KO, victoire), avec la grammaire
  anime encodée (attack-solo → impact-flash → hit-reaction ; le contre
  en échange à deux ; foule et flashs neutres sans swap) et les relèves
  correctement rejouées. templateShoppingList dérive la liste de courses
  du pipeline d'assets depuis n'importe quel match. TEMPLATES_SPEC.md :
  cahier des charges de production (~16 clips, 3 tests de validation
  dont le swap de paire, bloquant). 36 tests verts.

- 2026-08-14 : La visio des coachs (vision utilisateur : « comme une
  petite conversation, en bas à droite et gauche les cams des joueurs,
  notamment pendant le corner ») — disposition visio : toi bas-gauche,
  coach adverse bas-droite (avatar qui réagit aux événements avec
  bulles annonçant SES cartes), visibles par-dessus l'overlay du coin,
  pulsation de ta tuile quand ta voix déclenche une carte armée
  (l'information que l'adversaire doit voir, à la TFT : information
  ouverte + présence sociale par l'avatar). Incrusté dans les clips.
  Vérifié en capture : bulle « Forteresse » sur la tuile adverse
  pendant le coin du ring.

- 2026-08-14 (routine) : Vie privée + hygiène de dossier — écran
  « 🔒 Vie privée » complet (le tout-local expliqué simplement, mineurs
  inclus, promesse de prévenir avant toute fonction en ligne), lien
  depuis le titre. README remis au niveau du jeu réel (deck 28 cartes,
  Ulti, Histoire, Écurie, prosodie, PWA, commandes dev). shot.mjs
  couvre maintenant TOUT le funnel : titre, vie privée, sélection,
  Vestiaire (fallback capteurs vérifié en capture), arène ×2,
  résultats. 33 tests + sim verts.

- 2026-08-14 (routine) : Le pipeline viral PROUVÉ de bout en bout —
  mode ?demo=fast (temps de jeu ×6) : un match complet se joue seul en
  ~40 s réelles jusqu'à l'écran de résultats, désormais capturé par
  shot.mjs. Verdict de la capture : le clip du moment fort s'est
  réellement enregistré et se lit dans la page (MediaRecorder +
  composite + segments rotatifs OK même en headless), partage/scènes en
  place. Fix : scroll remis en haut des résultats (le VICTOIRE d'abord).
  Chasse à un crash sim intermittent : depuis la guerre des coins,
  l'adversaire peut BLOQUER la carte forgée du test end-to-end (Silence
  du Coin dans son deck) — le test neutralise désormais l'interférence
  et garantit une marge mesurable. 6 runs sim consécutifs stables.

- 2026-08-14 (routine) : Prosodie v0 — l'intonation devient un signal de
  jeu, pas seulement le volume : pitch par autocorrélation locale
  (systems/pitch.ts, pur et testé aux ondes synthétiques), baseline
  adaptative de la « voix posée », ratio branché dans CoachInput. Le
  point de design promis à l'utilisateur (« l'IA doit pressentir
  l'intonation ») existe en local gratuit ; l'API Claude n'aura à faire
  que la couche sémantique. Équilibre inchangé (72/87/19, bruit
  statistique), 33 tests verts.

- 2026-08-14 (routine) : Histoire × Écurie — decks adverses thématiques
  par chapitre (le coin raconte le perso : contrôle pour Yuna, mur pour
  Gorō, guerre des coins au ch7…) via MatchOpts.enemyDeck, et HUD de
  banc en arène (pastilles + mini-PV des deux côtés, KO barré) pour que
  les combats d'équipe se lisent à l'écran et dans les clips. Démo mise
  à jour avec équipes → vérifié en capture. 29 tests verts.

- 2026-08-14 (routine) : Mode Histoire v0 — « Le Grand Hurlement »,
  l'arc shōnen en 8 chapitres qui donne un but au solo et le socle de
  l'Édition Histoire : narration écrite (intro/taunt/outro par
  chapitre), adversaires en variante scalée du roster, équipes aux
  chapitres 5+ (la relève Écurie sert enfin contre l'IA), boss final
  inédit (Shion, guidé par un coach muet — miroir thématique du
  joueur), progression localStorage, déverrouillage en chaîne. La
  Revanche rejoue le chapitre perdu ; la victoire affiche l'outro.
  2 tests vitest (28 au total), capture de l'écran au vert.

- 2026-08-14 (routine) : L'Écurie v0 — le format switch demandé (« comme
  un combat pokemon, le coach devient maître de gladiateurs ») : jusqu'à
  2 équipiers de relève choisis à la sélection, échange au coin du ring
  pour 1 Souffle (état de chaque combattant conservé — monter frais ou
  garder son Ulti chargé, c'est le dilemme), équipe adverse symétrique
  avec relève IA. Le moteur traite m.player/m.enemy comme « l'actif » :
  aucun changement dans le combat lui-même. 3 tests vitest dédiés
  (26 au total), équilibre duel inchangé (78/90/16).

- 2026-08-14 (routine) : Vague 3 — la guerre des coins. Le coin adverse
  ayant un vrai deck depuis hier, il devient une CIBLE : blocage de sa
  meilleure carte (payée, jouée dans le vide) et vol de son Souffle,
  via 2 nouvelles primitives DSL disponibles aussi pour la Forge et les
  futures cartes par prompt. Entièrement symétrique (il peut te le faire
  aussi si ces cartes montent dans son deck) ; les paris survivent à
  endRound et se résolvent à la pause suivante. 5 cartes, coûts
  auto-validés (28/28), 23 tests vitest, équilibre stable.

- 2026-08-14 (routine) : Attract mode sur l'écran titre — capture du
  funnel d'entrée (titre/sélection) : la sélection tient la route, le
  titre était un mur sombre. Il est maintenant une borne d'arcade :
  combat IA vs IA en boucle derrière le titre (le moteur complet tourne,
  matchup aléatoire à chaque fin de match), voile dégradé pour la
  lisibilité, UI remontée pour laisser le ring visible. Vérifié en
  capture : Gorō vs Fang se battent sous le bouton « Entrer dans
  l'arène ».

- 2026-08-14 (routine) : Silhouettes v2 encrées — les bonshommes-bâtons
  deviennent des personnages : contour manga systématique (formes
  dessinées en double passe), membres courbés, torse rempli col+ceinture,
  gants/pieds, visages qui jouent le combat (bouche de cri sur
  attaque/spécial, œil fermé quand touché, sueur sous 30 % PV). Les
  morphologies et attributs d'archétypes existants (oreilles de Fang,
  barbe de Gorō…) s'appliquent par-dessus. Capture avant/après au vert,
  19 tests + sim OK.

- 2026-08-14 (routine) : Passe 2.5D + boucle visuelle fermée — l'arène a
  de la profondeur (projecteurs, foule en perspective + glowsticks liés à
  la Hype, lattes vers le point de fuite, poteaux/cordes, ombres,
  vignette) SANS 3D, dans le canvas existant. Mode ?demo (arène directe
  sans capteurs) + scripts/shot.mjs : je peux enfin VOIR le jeu depuis la
  session (captures Chromium headless) — et la première capture a
  immédiatement révélé un bug mobile réel (HUD rogné sur écrans < 9:16,
  corrigé). Le rendu est vérifié visuellement à chaque itération
  désormais.

- 2026-08-14 (autonome) : PWA + vitest — le jeu s'installe sur l'écran
  d'accueil (manifest, icônes CA générées, service worker offline
  raisonné, meta iOS) et le moteur a sa suite `npm test` (19 tests
  vitest sur les invariants : coûts DSL, clamps anti-triche, confusion,
  Ulti unique sur ordre, symétrie du coin adverse, consignes, forge,
  réalisateur). sim.ts garde le rôle équilibrage. Fix : vite-env.d.ts
  manquant (import.meta.env). Dernier item v0.5 clos — la section v0.5
  est COMPLÈTE.

- 2026-08-14 (routine) : mp4 + partage natif sans transcodage — les deux
  enregistreurs choisissent le meilleur conteneur supporté À la source
  (mp4 prioritaire : TikTok/iOS le veulent ; webm en repli), extensions
  dynamiques, et l'écran de résultats gagne « 📤 Partager le KO » via la
  Web Share API (feuille de partage mobile, repli téléchargement).
  Le chemin viral mobile est complet : jouer → KO → feuille de partage →
  TikTok, sans quitter le navigateur ni convertir quoi que ce soit.

- 2026-08-14 (reprise technique) : Le Réalisateur — le jeu écrit lui-même
  les prompts des scènes cinématiques de chaque match (entrée, meilleurs
  moments élus par score d'événements, finale héroïque), exposés sur
  l'écran de résultats avec copie en un clic. Premier maillon concret du
  pipeline cinématique : aujourd'hui manuel (coller dans Kling), demain
  la file async serveur consomme les mêmes ScenePlan. Tests sim :
  colorWord, 4 scènes sur match synthétique, Ulti élu moment fort,
  prompts sans placeholder ni hex.

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
