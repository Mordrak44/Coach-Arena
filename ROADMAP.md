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

- [x] Audit de code (skill code-review, 2026-08-16) sur combat.ts/
      ArenaScreen.tsx/arenaRenderer.ts — 3 bugs réels trouvés dans le
      moteur, chacun vérifié manuellement avant correction (le skill
      n'avait pas fait de passe de vérification lui-même) :
      1. **Double-KO injuste** : la boucle d'actions par tick ne
         vérifiait pas qu'un combattant était toujours vivant avant de
         le laisser frapper — un perso tombé à 0 PV plus tôt DANS LE
         MÊME tick pouvait quand même riposter et tuer l'autre, et le
         départage ne regardait QUE le PV du joueur (`m.player.hp <= 0
         ? 'enemy' : 'player'`), donnant systématiquement la victoire à
         l'adversaire sur un double-KO — même si le joueur avait frappé
         en premier. Corrigé par un simple `if (f.hp <= 0) continue`.
      2. **`cheer` (encourager) ignorait la confusion** : contrairement
         à `special`/`ulti`/aux ordres de posture, l'ordre
         « encourage-le » ne vérifiait jamais `confusedUntil` — un coach
         pouvait continuer à charger la Hype (et déclencher un Cri de
         Guerre armé) PENDANT toute la fenêtre de pénalité de confusion,
         vidant la mécanique de son coût voulu.
      3. **Temps mort d'urgence adverse incomplet** : la condition de
         déclenchement acceptait une carte `heal` OU `lowHpHypeFull` en
         main, mais la logique de jeu ne cherchait QUE `heal` — un
         adversaire n'ayant que « Dernière Chance » (lowHpHypeFull) en
         main à PV critiques ne recevait jamais son geste d'urgence,
         silencieusement, sans erreur ni log.
      + 1 nettoyage perf (non fonctionnel) : la table de morphologie par
      archétype dans `drawFighter()` était réallouée (6 objets) à
      CHAQUE combattant à CHAQUE frame (120×/s à 60 fps) — hissée en
      constante de module.
      4 tests de régression vitest (87 au total, exécutés 5× de suite) :
      chacun verrouille précisément le bug corrigé, y compris un
      contrôle positif pour le cas `cheer` (prouve que le test détecte
      bien un vrai gain quand il devrait y en avoir un, pas seulement
      l'absence de gain). Un piège trouvé en écrivant le test `cheer` :
      un trickle de Hype AMBIANT (auto-motivation + énergie vocale
      continue) tourne CHAQUE tick indépendamment de toute commande —
      un test qui aurait supposé « la Hype ne bouge pas du tout » aurait
      été faux ; corrigé en comparant deux runs identiques (avec/sans la
      commande) pour isoler la contribution propre à `cheer`. Sim
      inchangée (78/10/76 avant, 74/11/80 après — dans la variance
      normale, pas de dérive d'équilibrage), build inchangé, vérifié en
      capture (funnel standard identique).
- [x] Audit de code round 2 (2026-08-16), ciblé cette fois sur cards.ts/
      cardForge.ts/deckBuilder.ts (le DSL de cartes, jamais audité). 5
      pistes trouvées, chacune revérifiée manuellement — 2 corrigées, 3
      délibérément différées avec leur raison notée (voir ci-dessous) :
      1. **Regex de la Forge trop permissives** : les mots-clés de
         reconnaissance (`RULES` dans cardForge.ts) matchaient en PLEIN
         MILIEU de mots français courants sans rapport — "soin" dans
         « besoin », "garde" dans « regarde », "cri" dans « décrit »,
         "contre" dans « rencontre », "rage" dans « courage »/« orage ».
         En vérifiant, le trou s'est révélé plus large que les 3
         exemples cités par l'audit initial. Corrigé avec un lookbehind
         Unicode `(?<!\p{L})` (pas un simple `\b` : JS ne traite pas les
         lettres accentuées comme des caractères de mot, donc « décrit »
         — é juste avant "cri" — passait quand même à travers un `\b`
         classique, trouvé en écrivant le test). Limite assumée,
         documentée dans le code : un mot qui commence VRAIMENT par la
         racine (« critique » commence par "cri") reste indissociable
         d'une vraie forme conjuguée par une simple regex.
      2. **Coût des cartes ignorant `hits`** : `primitivePower` pour
         `hitsTakenHype` ne regardait que `amount`, jamais `hits` —
         pourtant `clampEffect` traite `hits` comme un paramètre
         réglable (2 à 5). Une carte à 2 coups (facile à déclencher)
         coûtait donc le même prix qu'une carte à 5 coups (difficile),
         un trou latent puisqu'aujourd'hui TOUTES les cartes existantes
         (pool + forge) codent `hits: 3` en dur. Corrigé avec une
         formule référencée sur 3 coups (`(amount/20) * (3/hits)`) :
         zéro cartes existantes repricées (vérifié par le test
         exhaustif déjà en place), mais un futur `hits` différent de 3
         sera enfin tarifé correctement.
      Différés, avec raison : (3) `clampEffect` dupliqué 4× dans le
      code (characters.ts, deckBuilder.ts, CharacterSelect.tsx) —
      cosmétique/DRY, zéro impact fonctionnel ; (4) `getCard()` peut
      renvoyer `undefined` malgré son typage — vérifié non-atteignable
      aujourd'hui (toute source d'id de carte est fraîchement rechargée
      avant usage), un vrai filet à poser plus tard si le DSL change ;
      (5) `deriveTiming()` étiquette « Instant · voix » une carte à 2
      effets dont un seul est réellement voix-déclenché — cosmétique
      pur (`timing` n'affecte QUE l'affichage, jamais la résolution
      réelle des effets, vérifié en lisant combat.ts), cas rare (2
      règles précises sur 14 doivent matcher ensemble).
      3 tests vitest de régression (89 au total, exécutés 5× de suite),
      sim dans la variance normale (65-83% sur plusieurs runs, cible
      historique cohérente), build/capture inchangés.
      **Bonus** : en le faisant tourner davantage, un test flaky (~1
      échec sur 15-30) a été trouvé et corrigé dans le lot de bugs
      PRÉCÉDENT (« le temps mort d'urgence adverse ») — détails dans le
      Journal.
- [x] Audit de code round 3 (2026-08-16), ciblé sur CharacterSelect.tsx
      (le plus gros fichier UI, jamais audité) + story.ts. 4 pistes
      trouvées, toutes réelles et corrigées, chacune revérifiée
      manuellement PUIS en capture Chromium headless (pas juste supposé
      corrigé après relecture du code) :
      1. **Message d'écurie qui fuit d'un perso à l'autre** :
         `stableMsg` (« Entraînement ATK : +1 ATK… ») n'était jamais
         réinitialisé au changement de perso sélectionné — basculer sur
         un AUTRE perso continuait d'afficher le message du précédent à
         la place de son propre décompte d'actions restantes. Corrigé
         en vidant `stableMsg` dans `pickChar` (et `forgeFromPrompt`,
         qui change aussi `selected` sans passer par `pickChar`).
      2. **Un équipier qui devient le combattant principal restait
         listé comme équipier** : `teammates` n'était jamais reconcilié
         au changement de `selected` — le texte « Relève : … » pouvait
         afficher le perso PRINCIPAL comme son propre équipier de
         relève (le filtre existait déjà à la confirmation du match,
         mais pas dans ce qui s'affichait avant). Corrigé en retirant
         `selected` de `teammates` dans `pickChar`.
      3. **Équipier custom « fantôme »** : forger un 5e perso custom
         dans la même session évince le plus ancien du plafond
         `MAX_CUSTOMS=4` (voir progression.ts) — s'il était en équipe,
         il disparaissait de la liste de boutons (donc plus possible à
         retirer) tout en restant un vrai équipier de match. Corrigé en
         reconciliant `teammates` avec la liste fraîche à chaque forge.
      4. `isUnlocked()` plantait (`STORY_CHAPTERS[-2].id`) si jamais
         appelée avec un chapitre absent de `STORY_CHAPTERS` —
         non-atteignable aujourd'hui par un vrai chemin de jeu (comme
         `getCard()` à l'audit précédent), mais corrigé quand même :
         contrairement à `getCard()`, le fix ici est une simple borne
         `if (idx < 0) return false` dans LA MÊME fonction, sans
         ajouter de nouvelle surface de validation — pas le même calcul
         coût/bénéfice.
      1 test vitest (89 au total, inchangé en nombre — ajouté à un test
      existant plutôt qu'un nouveau, les 3 bugs UI n'étant pas
      directement testables en vitest), 2 corrections vérifiées en
      capture Chromium headless réelle (bascule de perso : le message
      d'écurie de Rei remplace bien celui de Kenta ; un équipier qui
      devient principal fait bien passer le texte de « Relève : Rei »
      à « Sans équipiers »), sim/build inchangés.
- [x] Audit de code round 4 (2026-08-16), ciblé sur systems/ (voice.ts,
      sound.ts, facecam.ts, recorder.ts — vraies API navigateur, jamais
      auditées). 4 pistes trouvées, toutes réelles, toutes corrigées :
      1. **Reconnaissance vocale : un ordre sur deux perdu** :
         `onresult` ne lisait que `ev.results[ev.resultIndex]`, alors
         que l'API Web Speech peut regrouper PLUSIEURS résultats
         fraîchement finalisés dans un même événement (deux ordres
         courts dits coup sur coup). Corrigé en parcourant tous les
         résultats de `resultIndex` à la fin — `pendingCommand` reste un
         pointeur simple vers « le plus récent », pas une file (la
         dédup anti-spam vit déjà côté jeu, inchangée).
      2. **Piste vidéo de captureStream() jamais stoppée** :
         `releaseTracks()` (MatchRecorder ET HighlightRecorder)
         n'arrêtait que les pistes micro clonées, jamais la piste vidéo
         du canvas — qui continuait de solliciter le canvas à 30 fps
         sans aucun consommateur après l'arrêt de l'enregistrement.
         Pertinent pour le budget batterie mobile (ROADMAP, Tier 1).
         Corrigé avec `getTracks()` au lieu de `getAudioTracks()`.
      3. **Rampe de la foule qui ne finit jamais son arc** :
         `setCrowdHype()`, appelée à CHAQUE frame, reprogrammait sa
         propre rampe de 0,4 s sans annuler la rampe de décroissance
         d'une clameur ponctuelle (`crowdRoar`, jusqu'à ~2,8 s pour un
         Ultime) encore en cours — la clameur se faisait donc
         interrompre en permanence par le suivi continu de la Hype au
         lieu de retomber en douceur. Corrigé avec une fenêtre
         `roarUntil` : `setCrowdHype` garde `crowdTarget` à jour (pour
         que la décroissance de la clameur vise une cible fraîche) mais
         ne programme plus sa propre rampe tant qu'une clameur est en
         cours.
      4. `FaceCoach.stop()` ne réinitialisait pas `this.prev` (ni
         `energy`) — un futur `start()` sur la même instance
         comparerait sa première frame au souvenir de l'ANCIENNE
         session. Non-atteignable aujourd'hui (ArenaScreen recrée
         toujours une instance fraîche), corrigé quand même : fix
         trivial, même contrat start/stop, aucune nouvelle surface.
      **Aucun test vitest** pour ces 4 fixes — les 4 fichiers dépendent
      d'API navigateur réelles (SpeechRecognition, WebAudio,
      MediaRecorder, getUserMedia) indisponibles à la fois dans
      l'environnement vitest (Node, sans jsdom) et dans ce bac à sable
      en mode démo (`noMedia`, aucun flux réel) — écrire un test
      demanderait un mock lourd du Web Audio/MediaRecorder plutôt
      qu'apporter une vraie garantie. Vérifié par lecture attentive du
      code + `tsc`/build/capture du funnel standard (le pipeline
      d'enregistrement/export continue de produire un clip valide,
      visible sur l'écran de résultats) — pas de faux sentiment de
      sécurité affiché comme un test qui n'en est pas un.
- [x] Audit de code round 5 (2026-08-16), ciblé sur le pipeline cinéma
      (sceneDirector.ts, cutPlanner.ts, liveCutPlayer.ts, sceneQueue.ts —
      jamais audités). 4 bugs trouvés, tous réels, tous corrigés ET
      verrouillés par des tests (ce sont des modules de logique pure) :
      1. **`buildScenePlans` référençait le mauvais perso pour un crit
         encaissé** : le calcul de l'attaquant supposait un champ `by`
         présent sur tout événement noté — faux pour `'hit'` (qui n'a
         que `target`, celui qui encaisse). Un crit subi par le joueur
         (donc frappé par l'ennemi) partait en génération Kling PAYANTE
         avec la planche du JOUEUR. Corrigé avec un switch qui dérive
         l'attaquant depuis `target` pour `'hit'`, depuis `by` sinon.
      2. **`eventScore` notait `hypeFull` alors que `momentPrompt` n'a
         aucun cas pour lui** : un round dont le seul événement notable
         était un hypeFull perdait silencieusement son créneau de moment
         fort (le prompt généré était `null`, jamais remplacé par le
         2e-meilleur événement du round). Corrigé en alignant le score
         de `hypeFull` sur celui de `cutPlanner.ts` (0, non électible).
      3. **Le garde-fou anti-retard de `LiveCutPlayer` trimmait par
         NOMBRE de cuts, pas par retard réel** (`MAX_QUEUE=1`) : un seul
         événement `'hit'` pousse 3 cuts d'un coup (attaque → impact →
         réaction) et se faisait sabrer à 1 seul cut dès sa création,
         même sans aucun retard — la grammaire attaque/impact/réaction
         de `cutPlanner.ts` aurait disparu dès qu'une vraie bibliothèque
         de clips serait branchée (le pilote Kling en cours y va tout
         droit). Corrigé avec un budget de DURÉE cumulée
         (`MAX_QUEUE_LAG_S = 2,5 s`) plutôt qu'un compte d'entrées.
      4. **`SceneJobQueue` ne pouvait jamais être annulée** : le
         `setTimeout` de timeout par job n'était jamais nettoyé, et
         `ResultsScreen.tsx` ne coupait rien à son démontage — chaque job
         continuait de tourner (et pouvait notifier un composant
         disparu) jusqu'à expiration. Ajout de `cancel()`, câblé dans le
         cleanup du `useEffect`.
      4 nouveaux tests dans engine.test.ts (89 → 93), `tsc --noEmit` +
      `npm run build` + suite complète verts.
- [x] Audit de code round 6 (2026-08-16), ciblé sur stable.ts,
      speechTactics.ts, progression.ts, deckBuilder.ts, cutLibrary.ts,
      characters.ts — dernière tranche de modules de logique pure jamais
      audités. 3 vrais bugs + 1 nettoyage, tous corrigés et verrouillés :
      1. **`stable.ts`, `readAll()` plantait sur un stockage JSON valide
         mais de mauvaise forme** : `JSON.parse` réussit sur `"null"`,
         `"5"`, `"true"` (posé par une extension navigateur ou un bug de
         migration passé) — le `catch` ne l'attrape pas, et
         `charId in all` plante ensuite en aval, SYNCHRONE dans le rendu
         de `CharacterSelect.tsx` (écran cassé). Corrigé en validant la
         forme (`typeof === 'object'`, pas un tableau) après le parse,
         même garde-fou que `deckBuilder.ts` avait déjà pour son propre
         stockage.
      2. **`speechTactics.ts` : « dernier souffle » déclenchait AUSSI la
         récupération** : la règle générique `souffle` (→ heal 5%)
         matchait la sous-chaîne « souffle » à l'intérieur de « dernier
         souffle », en plus de la règle dédiée « baroud d'honneur » — un
         discours de dernier recours se voyait accorder un soin gratuit
         à contresens. Corrigé avec un lookbehind négatif
         `(?<!dernier )souffle`, la règle générique reste valide hors de
         ce contexte.
      3. **`combat.ts`, `applyConsigne` dupliquait la limite d'effets en
         dur** (`effects.slice(0, 2)`) au lieu d'importer
         `MAX_CONSIGNE_EFFECTS` de `speechTactics.ts` — un futur
         changement de cette constante aurait affiché un label promettant
         un effet jamais appliqué. Corrigé par import de la constante
         partagée.
      4. Écarté comme bug mais corrigé quand même (trivial, zéro
         risque) : `progression.ts`, `claimReward` relisait et
         re-parsait `PROG_KEY` en double via `pendingReward(charId)` au
         lieu de réutiliser la map déjà en main — aucun effet observable,
         juste du travail en trop à chaque clic de récompense.
      2 nouveaux tests dans engine.test.ts (93 → 95) : le stockage
      corrompu de stable.ts (4 valeurs JSON malformées testées dans une
      boucle) et le chevauchement « dernier souffle » de speechTactics.ts.
      `tsc --noEmit` + `npm run build` + suite complète verts. Rien à
      signaler côté deckBuilder.ts, cutLibrary.ts, characters.ts (déjà
      solides).
- [x] Audit de code round 7 (2026-08-16), ciblé sur les écrans UI restants
      (ReadyScreen.tsx, ResultsScreen.tsx, StoryScreen.tsx,
      PrivacyScreen.tsx, TitleScreen.tsx — derniers jamais audités). 2 vrais
      bugs corrigés, 1 duplication éliminée, 1 micro-nettoyage :
      1. **ReadyScreen.tsx : icône « Reconnaissance vocale » incohérente
         avec son propre texte d'avertissement.** Le calcul
         (`micOk === false || speechSupported ? statusIcon(...) : '✅'`)
         retombait sur un ✅ CODÉ EN DUR dès que le navigateur n'implémente
         pas SpeechRecognition (Firefox) ET que le micro n'est pas encore
         explicitement refusé — la ligne juste à côté affichait pourtant
         « (indisponible sur ce navigateur — Chrome recommandé) » : coche
         verte et avertissement d'indisponibilité côte à côte, contradiction
         visible. Corrigé avec un calcul direct
         (`speechOk = speechSupported ? micOk : false`) : la reco ne peut
         jamais être « plus prête » que le micro qui l'alimente, et reste
         refusée si le navigateur ne l'implémente pas, point. **Vérifié
         visuellement** : capture Chromium headless réelle avec
         `SpeechRecognition` supprimé de `window` via un script d'init
         Playwright (3 scénarios : normal, navigateur sans reco vocale,
         micro refusé) — icône et texte cohérents dans les 3 cas, plus de
         ✅ + avertissement simultanés.
      2. **La demande micro/caméra avec repli (vidéo→audio seul→null)
         était dupliquée verbatim entre ReadyScreen.tsx et
         ArenaScreen.tsx** — un risque de divergence silencieuse si l'un
         des deux évoluait sans l'autre. Extrait en un seul helper partagé,
         `systems/media.ts::requestCoachStream()`, câblé dans les deux
         écrans.
      3. Nettoyage trivial : `TRAIT_INFO[player.trait]` était indexé 3 fois
         dans ReadyScreen.tsx au lieu d'une seule variable ; `ResultsScreen`
         appelait `setSceneJobs(queue.jobs())` juste après avoir construit
         la file, un rendu superflu produisant exactement la même liste que
         l'initialiseur de `useState` avait déjà posée.
      3 nouveaux tests dans engine.test.ts (95 → 98), pour
      `requestCoachStream` (accordé, repli vidéo→audio, tout refusé →
      null, jamais de rejet non-géré). `tsc --noEmit` + `npm run build` +
      suite complète verts. StoryScreen.tsx, PrivacyScreen.tsx,
      TitleScreen.tsx : rien trouvé. **Tous les écrans UI du dépôt sont
      maintenant passés en revue au moins une fois** (CharacterSelect au
      round 3, systems/ au round 4, le reste ici) — la série d'audit
      systématique commencée quand le puits de tâches sûres/gratuites
      s'épuisait a maintenant couvert l'intégralité du dépôt applicatif.
- [x] Audit de code round 8 (2026-08-16), ciblé sur App.tsx et
      render/arenaRenderer.ts — les deux plus gros fichiers jamais
      passés au crible en entier (App.tsx jamais ciblé ; arenaRenderer.ts
      seulement effleuré au round 1 pour un hoist de perf). 1 vrai bug de
      gameplay corrigé :
      - **`App.tsx`, mode Rapide avec équipiers : le banc adverse pouvait
        aligner le perso du JOUEUR ou l'un de ses ÉQUIPIERS.** Le calcul
        du banc adverse (`pool = ROSTER.filter(r => r.id !== opponent.id)`)
        n'excluait que l'adversaire principal — pas le perso du joueur, ni
        ses équipiers. Un joueur sur Kenta avec Rei en équipière pouvait
        ainsi se retrouver face à un banc adverse qui aligne… Kenta ou
        Rei, contredisant le commentaire du code lui-même (« sans
        doublons »). Fix : la logique de sélection du banc, auparavant en
        ligne dans App.tsx, extraite en fonction pure et exportée
        `pickOpponentTeam(excludeIds, size)` dans characters.ts (aux
        côtés de `pickOpponent`, même famille), appelée avec la liste
        complète à exclure (perso + équipe + adversaire). Verrouillé par
        un test à 200 tirages (jamais un id exclu) + un test de bord
        (moins de candidats que la taille demandée).
      - Écarté (design, pas un bug) : `arenaRenderer.ts` construit ~20
        objets `FloatingText` quasi identiques inline dans `onEvent()` au
        lieu d'un helper commun — coût de maintenance réel mais risque de
        régression visuelle non négligeable pour un refactor sur un
        fichier canvas de 1000+ lignes sans capture de référence dédiée ;
        laissé pour une itération future avec vérification visuelle
        dédiée plutôt que fait à la hâte ici.
      2 nouveaux tests (engine.test.ts 98 → 100). `tsc --noEmit` +
      `npm run build` + suite complète verts.
- [x] Nettoyage `arenaRenderer.ts` : les ~20 constructions inline
      d'objets `FloatingText` dans `onEvent()` (identifiées au round 8,
      délibérément reportées faute de capture de référence pour vérifier
      l'absence de régression) extraites en une méthode privée commune
      `pushFloat(text, x, y, now, opts)` avec des valeurs par défaut
      neutres (vie 1 s, taille 32, blanc, aucun angle/délai) — chaque
      site d'appel ne passe plus que ce qui diffère du défaut. Toutes les
      valeurs (position, couleur, taille, angle, délai `t0`) reproduites
      à l'identique, site par site, pas de comportement changé. Vérifié
      en capture Chromium réelle (`?demo=fast`, deux moments de combat
      capturés) : SWOOSH (esquive) et DOGO!/-5 (coup) rendus identiques
      à avant le refactor — même position, taille, couleur, angle.
      `tsc --noEmit` + `npm run build` + 100 tests vitest verts (aucun
      nouveau test : pur refactor interne, la géométrie/couleur de
      chaque cas était déjà implicitement verrouillée par la capture
      visuelle, pas par des tests unitaires sur ce fichier canvas).
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
- [x] Coverage-driven bug hunt sur `combat.ts` (moteur de combat) — après
      3 dimensions d'accessibilité passées en revue coup sur coup
      (ARIA/clavier, contraste, mouvement réduit), retour à la couverture
      de tests comme angle, cette fois ciblé sur le fichier le plus gros
      et le moins couvert (74 % stmts). `npm run coverage` a montré que
      toute la modulation des ORDRES DE POSTURE (`attack`/`defend`/
      `dodge`/`counter`) par trait et par état de jeu — le cœur même du
      gameplay « coacher à la voix » — n'était testée QUE pour Sanguin/
      Cérébral en `stable.ts` (Vie d'Écurie) et jamais dans `combat.ts` :
      6 branches réelles jamais exercées : le bonus Hype d'un ordre CALME
      pour un perso Cérébral (5×hrtScale, supérieur au défaut 2×hrtScale
      — testé seulement à l'envers, l'ordre hurlé, jusqu'ici) ; Têtu
      ignorant superbement son premier ordre de posture du round ;
      Boudeur (Vie d'Écurie) avalant le tout premier ordre du match ;
      Provoqué (carte adverse) verrouillé agressif et sourd à tout nouvel
      ordre ; Frénésie armée (Fang) déclenchée par le premier ordre
      d'attaque après armement ; Cri de Guerre armé consommé par le
      prochain `cheer`. Aucun bug trouvé — la logique était déjà correcte
      — mais un vrai piège de MÉTHODE DE TEST découvert et corrigé au
      passage : le premier essai du bonus Hype « calme » donnait 28 au
      lieu des 25 attendus, à cause d'un combat auto-résolu qui a démarré
      DANS le même tick que la mesure (« encaisser fait monter la rage »,
      +3 Hype sur le défenseur, combat.ts:596) — contamination silencieuse
      d'une mesure sensée être isolée. Diagnostiqué avec un script de
      debug (jamais un correctif à l'aveugle), puis corrigé en gelant
      `nextActionAt` des deux côtés AVANT chaque tick de mesure, comme le
      font déjà les tests voisins de cette section — repris pour les 6
      nouveaux tests via un helper `freeze()` local. 6 nouveaux tests,
      engine.test.ts 137 → 143. Couverture `combat.ts` 74,41 % → 75,58 %
      (stmts), 66,66 % → 66,42 % (branch — en légère baisse car de
      nouvelles branches AUTOUR des 6 couvertes sont apparues visibles au
      rapport sans être elles-mêmes exercées, pas une régression réelle).
      `tsc --noEmit` + `npm run build` verts.
- [x] Suite du coverage-driven bug hunt sur `combat.ts` : cette fois le
      switch `applyCardEffects` (le cœur du DSL cartes/consignes,
      combat.ts:262-320) lui-même. Constat en relisant le rapport de
      couverture : PRESQUE tous les kinds de `EffectPrimitive` (hype,
      enemyHype, dodgeBonus, immuneConfusion, armCheerHype,
      armAttackFrenzy, counterHype, hitsTakenHype, halveEnemySpecial,
      blockEnemyCard, drainSouffle — 11 sur 15) n'étaient testés QUE côté
      CONSOMMATION, avec les mods posés directement à la main dans le
      test (`m.mods.blockNextEnemyCard = true`, etc.) — jamais côté
      APPLICATION, c'est-à-dire en vérifiant qu'une VRAIE consigne jouée
      via `applyConsigne` mute effectivement le bon champ. Un typo de nom
      de champ dans ce switch (l'unique endroit où le DSL déclaratif des
      cartes devient de l'état runtime) serait passé inaperçu par tous
      les tests existants. 6 nouveaux tests couvrant les 11 kinds (groupés
      par 2, la limite `MAX_CONSIGNE_EFFECTS` d'une vraie consigne), plus
      un test dédié pour `drainSouffle` qui CUMULE (+=) au lieu de
      remplacer — un comportement délibérément différent des autres kinds
      qui écrasent (=), à distinguer explicitement. Aucun bug trouvé — le
      switch était déjà correct — mais la garantie qu'il RESTE correct
      face à un futur refactor est maintenant réelle. engine.test.ts
      143 → 149. Couverture `combat.ts` 75,58 % → 80,6 % (stmts), 66,42 %
      → 71,22 % (branch). `tsc --noEmit` + `npm run build` verts.
- [x] 3e passe du coverage-driven bug hunt sur `combat.ts` : cette fois
      `resolveAttack`/`fireSpecial`, les branches à ISSUE RARE (fenêtre de
      contre étroite, ou dépendantes d'un jet de dé) que ni les tests
      précédents ni une simulation de match ordinaire ne déclenchent
      naturellement. 4 branches jamais exercées, isolées via `vi.spyOn
      (Math, 'random')` (motif déjà en place ailleurs dans ce fichier) :
      Contre Parfait + Orgueil du Rival (les deux bonus armés du contre se
      déclenchent ensemble et se consomment) ; la posture Garde
      (réduction de dégâts + Hype au défenseur — nécessite un jet PILE
      entre le seuil d'esquive et celui de garde, `mockReturnValue(0.25)`
      avec Gorō en défense pour une esquive quasi nulle) ; Cœur Vaillant
      (le Nème coup encaissé déclenche le bonus et se désarme,
      `mockReturnValue(0.99)` pour garantir aucune esquive/crit/garde
      parasite) ; Leçon d'Expérience (le premier spécial adverse encaissé
      après armement est divisé par deux — vérifié par COMPARAISON entre
      deux matchs identiques avec/sans le mod armé, pas seulement la
      formule en isolation, pour prouver que le facteur ×0,5 s'applique
      bien réellement dans `fireSpecial`). Aucun bug trouvé, tout se
      comportait déjà comme documenté dans les commentaires du code — mais
      ces 4 mécaniques de comeback (des cartes réelles du jeu) n'avaient
      littéralement jamais tourné une seule fois sous test avant
      aujourd'hui. 4 nouveaux tests, engine.test.ts 149 → 153. Couverture
      `combat.ts` 80,6 % → 84,94 % (stmts), 71,22 % → 72,42 % (branch).
      `tsc --noEmit` + `npm run build` verts.
- [x] Error Boundary React — après 3 passes de coverage sur `combat.ts`
      (rendements décroissants sur ce fichier, temps de pivoter), un vrai
      trou de résilience jamais adressé : `grep -rln "ErrorBoundary"` sur
      `src/` confirmait qu'AUCUN filet n'existait nulle part. Sans lui,
      une exception non attrapée pendant un match coaché (canvas, reco
      vocale, un deck forgé corrompu…) fait tomber tout React à un écran
      BLANC, en plein direct — le pire scénario possible pour un jeu conçu
      pour être filmé/streamé en 9:16. Nouveau `src/ui/ErrorBoundary.tsx`
      (class component — seule forme capable d'intercepter côté React,
      pas d'équivalent en hooks), enveloppe `<App/>` dans `main.tsx` :
      écran de repli réutilisant les classes existantes (`.screen`/
      `.tagline`/`.btn`, zéro CSS ajouté), rassure explicitement que deck
      forgé/Vie d'Écurie/progression survivent (ils vivent dans
      localStorage, pas l'état React), bouton de rechargement. Vérifié en
      conditions réelles, pas supposé : déclencheur de crash TEMPORAIRE
      ajouté à `App.tsx` (même motif que le `?demo` déjà existant),
      Chromium headless confirmant (1) le chargement normal est inchangé
      et (2) `?crashtest=1` affiche bien le fallback « K.O. TECHNIQUE » +
      bouton de relance au lieu d'un écran blanc — puis le déclencheur
      retiré avant tout commit (`git status` vérifié : seuls `main.tsx` et
      le nouveau fichier restent modifiés, `App.tsx` revenu à l'identique).
      153 tests inchangés (pas de test unitaire ajouté — pas de
      testing-library dans ce projet, cohérent avec le choix déjà fait
      partout ailleurs de vérifier le comportement UI via Chromium réel
      plutôt que d'ajouter cette dépendance). `tsc --noEmit` + `npm run
      build` verts.
- [x] Suite de la passe résilience : un trou PLUS grave que ce que
      l'Error Boundary peut couvrir, trouvé en creusant le motif
      `hasStorage` réutilisé dans 6 modules (cardForge, deckBuilder,
      onboarding, progression, stable, story). `const hasStorage = typeof
      localStorage !== 'undefined'` protège contre `localStorage`
      ABSENT — mais PAS contre `localStorage` PRÉSENT mais dont la seule
      LECTURE de la propriété jette une SecurityError (certains modes de
      confidentialité stricts, vieux Safari, extensions qui bloquent tout
      stockage) : `typeof` doit quand même évaluer la propriété pour en
      connaître le type, donc un getter qui jette jette aussi À TRAVERS
      `typeof` — piège JS contre-intuitif, bien connu des mainteneurs de
      libs de stockage mais jamais vérifié dans ce dépôt. Un crash ici
      arrive AU CHARGEMENT DU MODULE, avant même que React ne monte : même
      l'Error Boundary de l'itération précédente ne peut RIEN y faire.
      Confirmé RÉEL avant tout correctif (discipline habituelle de cette
      session) : un test avec `Object.defineProperty(globalThis,
      'localStorage', { get() { throw … } })` + `vi.resetModules()` (pour
      forcer une VRAIE ré-évaluation, pas un module déjà mis en cache par
      un test précédent) a fait planter les 6 imports avant correctif.
      Fix identique dans les 6 fichiers : la ligne `const hasStorage =
      typeof localStorage !== 'undefined'` passe dans un `try { … } catch
      { return false }` — dupliqué à l'identique dans chaque fichier
      plutôt que centralisé dans un utilitaire partagé, cohérent avec le
      choix déjà fait par ce dépôt de garder ce motif en ligne (le grep
      montrait déjà 6 copies quasi identiques avant ce fix). 6 nouveaux
      tests (un par module touché), engine.test.ts 153 → 159. `tsc
      --noEmit` + `npm run build` verts.
- [x] 3e maillon de la passe résilience : `VoiceCoach.startRecognition()`
      (`systems/voice.ts`) posait `state.supported = true` AVANT même
      d'appeler `new Ctor()` (le constructeur `SpeechRecognition`/
      `webkitSpeechRecognition`), et ce constructeur n'était PAS protégé
      par try/catch — seul `rec.start()` plus bas l'était. Sur certains
      WebView/navigateurs verrouillés où le constructeur EXISTE sur
      `window` mais échoue quand même faute de pont natif de reco vocale
      disponible, `state.supported` restait figé à `true` alors que la
      reco n'avait jamais démarré : un FAUX POSITIF pire qu'une absence
      honnête, puisque l'UI (ReadyScreen) affiche cet état au joueur. Pire
      encore : `start()` est appelé sans `await` ni `.catch()` depuis
      `ArenaScreen.tsx` (`sys.voice.start(stream)`) — l'exception
      synchrone du constructeur, dans une méthode `async`, devenait donc
      une PROMESSE REJETÉE NON GÉRÉE, invisible en dehors de la console.
      Confirmé réel avant fix (discipline habituelle) : un test avec un
      constructeur `SpeechRecognition` factice qui jette a fait échouer
      l'assertion AVANT le correctif (`git stash` du fichier source,
      relancé le test, remis en place), confirmant que ce n'est pas un
      test vacueusement vert. Fix : `new Ctor()` déplacé dans son propre
      try/catch, `state.supported = true` déplacé APRÈS la construction
      réussie. 2 nouveaux tests (constructeur qui jette → `supported`
      correctement `false`, constructeur qui réussit → `true`),
      engine.test.ts 159 → 161. `tsc --noEmit` + `npm run build` verts.
- [x] Après 4 itérations de résilience d'affilée, pivot vers une dimension
      jamais vérifiée : le DÉBORDEMENT HORIZONTAL sur petit écran. Le CSS
      de `.screen` porte déjà la cicatrice d'un vrai bug trouvé comme ça
      une fois (l'écran Histoire à 8 chapitres débloqués, `justify-content:
      safe center`) — mais jamais un balayage SYSTÉMATIQUE sur plusieurs
      tailles de téléphone n'avait été fait. Chromium headless, viewport
      forcé à 3 tailles réalistes (320×568 iPhone SE 1re gén. — la plus
      étroite en circulation —, 360×640 petit Android, 390×844 iPhone 14),
      `document.documentElement.scrollWidth` comparé à `window.innerWidth`
      (signal objectif de débordement, pas juste une capture regardée à
      l'œil) sur 5 points du parcours réel : Titre, Sélection de perso
      (avant/après sélection d'un perso — le deck-builder se déploie),
      confirmation du deck-builder (via le lien d'évitement), et l'Arène
      (mode `?demo`, canvas 9:16 + HUD). 15 vérifications au total (3
      tailles × 5 écrans) : ZÉRO débordement détecté partout. Aucun code
      changé — le layout responsive est déjà solide, dérisque une partie
      du TODO « Polish mobile/iOS » encore ouvert (le reste — Safari réel,
      budget batterie — reste non vérifiable dans ce sandbox).
- [x] `HighlightRecorder.rotate()` (`systems/recorder.ts`) : trouvé en
      relisant les fichiers `systems/` après la passe résilience, dans la
      continuité du même réflexe (chercher les appels risqués non
      protégés). `start()` protège son appel à
      `startSegment()` (qui construit un `new MediaRecorder`) par un
      try/catch — mais `rotate()`, appelé toutes les 14 s par un
      `setInterval` pour faire tourner les segments du moment fort,
      appelait ce MÊME `startSegment()` SANS filet. Une panne transitoire
      du MediaRecorder à la rotation (rare, mais réelle — pas juste au
      tout premier démarrage) plantait donc hors de toute pile
      surveillée, silencieusement. Confirmé réel avant fix (`git stash` du
      fichier source, le test échoue bien AVANT le correctif). Fix :
      l'appel de `rotate()` à `startSegment()` passe dans son propre
      try/catch — dégradation déjà gracieuse en aval (le prochain
      `rotate()` retentera, `stop()` retombe déjà sur `prevBlob`), il ne
      manquait que le filet à cet unique appel. 1 nouveau test (simule un
      2e `MediaRecorder` qui jette à la rotation, confirme `rotate()` et
      `stop()` ne plantent plus). engine.test.ts 161 → 162. `tsc --noEmit`
      + `npm run build` verts.
- [x] BUG RÉEL trouvé, pas juste un trou de couverture : `matchCommand`
      (`systems/voice.ts`), la fonction qui traduit le texte reconnu par
      la voix en commande de jeu, n'avait jamais eu un seul test — alors
      que c'est littéralement le cœur du pitch « coacher à la voix ».
      `COMMAND_PATTERNS` teste ses regex DANS L'ORDRE et retourne au
      premier match ; le pattern `attack` (`attaqu|fonce|...`) était
      testé AVANT `counter` (`contre|contr[- ]?attaque|punis`). Or
      « contre-attaque » contient le substring « attaqu » — donc `attack`
      gagnait TOUJOURS en premier, rendant le `contr[- ]?attaque` explicite
      du pattern `counter` inatteignable en pratique : une preuve dans le
      code même que cette phrase était censée être gérée, mais qui ne
      l'était jamais. « Contre-attaque ! » est une consigne de boxe on ne
      peut plus naturelle et fréquente — un coach qui la crie au moment
      précis où il veut punir une ouverture se voyait répondre par une
      attaque à l'aveugle au lieu d'un contre, l'exact opposé de son
      intention, potentiellement décisif sur l'issue d'un round. Confirmé
      réel avant fix (`git stash`, le test échoue bien avant le correctif).
      Fix : réordonné `COMMAND_PATTERNS` pour tester `counter` AVANT
      `attack` (vérifié qu'aucune autre phrase de `attack` ne chevauche
      `counter`, donc aucune régression introduite). 4 nouveaux tests : la
      régression « contre-attaque », la non-régression de « attaque »
      seule, un balayage d'une phrase par commande (7 commandes), et
      l'absence de faux positif sur du bruit ambiant. engine.test.ts
      162 → 166. `tsc --noEmit` + `npm run build` verts.
- [x] Suite logique du bug « contre-attaque » : `TRAIT_RULES`
      (`characters.ts`, utilisée par `deriveTrait`/`createFromPrompt`)
      utilise EXACTEMENT le même motif « premier match qui gagne, par
      ordre du tableau » que `COMMAND_PATTERNS` — et n'avait jamais été
      balayée mot-clé par mot-clé (un seul test existant, celui du repli
      sur l'archétype quand AUCUN mot-clé ne matche). Vu le bug trouvé la
      fois précédente dans une table structurée EXACTEMENT pareil, même
      traitement : 30 tests, un par mot-clé des 4 règles (cerebral,
      sanguin, fusionnel, tetu), chacun dans une phrase réaliste. Cette
      fois, RIEN trouvé — les 30 passent du premier coup, aucune collision
      de substring entre les mots-clés (contrairement à « attaqu » ⊂
      « contre-attaque »). Résultat honnête à documenter quand même :
      c'est le test qui aurait attrapé une régression future à ce même
      endroit précis, et sa valeur ne dépend pas d'avoir trouvé un bug
      cette fois-ci. engine.test.ts 166 → 196. `tsc --noEmit` + `npm run
      build` verts.
- [x] 4e passe d'accessibilité — les précédentes n'avaient touché que
      `ArenaScreen.tsx` et `CharacterSelect.tsx` ; `grep -c "aria-"` sur
      tous les écrans a confirmé que `TitleScreen`, `StoryScreen`,
      `ReadyScreen`, `ResultsScreen` et `PrivacyScreen` en avaient ZÉRO.
      Lecture complète des 5, PAS de correctifs automatiques par grep —
      chaque bouton avec du texte visible est déjà accessible nativement
      (pas besoin d'aria-label), donc 3 vrais trous seulement, PrivacyScreen
      et ReadyScreen laissés intacts (texte descriptif déjà suffisant) :
      1. `StoryScreen.tsx` — le chapitre OUVERT (celui dont la narration
         est dépliée) n'était signalé que par une bordure de couleur, même
         bug que `CharCard` corrigé lors de la 1re passe a11y. `aria-pressed`
         ajouté sur le bouton de chapitre.
      2. `TitleScreen.tsx` — le canvas de l'attract mode (combat IA vs IA
         décoratif derrière le titre, zéro info de jeu réelle contrairement
         au canvas de combat d'`ArenaScreen`) n'avait ni label ni
         `aria-hidden` : un lecteur d'écran l'annonçait comme un élément
         canvas vide et sans nom. `aria-hidden="true"` ajouté — traitement
         inverse et correct pour du PUREMENT décoratif (contraste
         volontaire avec le `role="img"` + `aria-label` du vrai combat).
      3. `ResultsScreen.tsx` — plusieurs `<video>` (le clip du moment fort
         + une par scène du Réalisateur) sans label distinctif : un
         lecteur d'écran qui tabule dans les contrôles natifs entend
         juste « vidéo » répété, sans savoir laquelle est laquelle.
         `aria-label` descriptif ajouté sur chacune.
      Vérifié en conditions réelles, pas supposé : Chromium headless,
      `aria-hidden` du canvas confirmé présent, ET `aria-pressed` du
      chapitre vérifié DYNAMIQUE (tous à `false` avant clic, le bon passe
      à `true` après clic sur un chapitre précis, les 7 autres restent
      `false`) — pas juste la présence statique de l'attribut. 196 tests
      inchangés (pur ajout de markup). `tsc --noEmit` + `npm run build`
      verts.
- [x] Coverage sur `systems/recorder.ts` (35,8 % stmts, un des fichiers
      les moins couverts, jamais adressé même pendant la série résilience
      qui a pourtant corrigé un bug dans `HighlightRecorder.rotate()`
      juste à côté) : `fileExt`, `pickMimeType` et `shareOrDownload`
      (partage natif mobile → TikTok/Shorts direct, ou repli
      téléchargement) n'avaient jamais eu un seul test. Relecture attentive
      cherchant un bug avant d'écrire les tests (même réflexe qu'à chaque
      fois cette session) : rien trouvé, la chaîne de repli est déjà
      correcte par construction — `canShare` absent, `share()` absent, OU
      `share()` qui rejette (partage annulé) retombent tous proprement sur
      le téléchargement, jamais de crash. 6 nouveaux tests : `fileExt`
      (mp4/webm/type vide) ; `pickMimeType` (MediaRecorder absent →
      `undefined`, priorité mp4 avant webm) ; les 3 chemins de
      `shareOrDownload` (partage réussi, navigateur sans partage de
      fichiers, partage refusé/annulé) — chacun vérifiant le VRAI
      comportement observable (résultat retourné + le clic de
      téléchargement a bien eu lieu), pas juste l'absence de crash.
      engine.test.ts 196 → 202. Couverture `recorder.ts` 35,8 % → 50 %
      (stmts). `tsc --noEmit` + `npm run build` verts.
- [x] BUG RÉEL trouvé en creusant `MatchRecorder`/`HighlightRecorder`
      juste après les avoir couverts : `start()` construit le flux
      composite (`canvas.captureStream(30)` + piste micro CLONÉE ajoutée
      dessus) AVANT de construire le `MediaRecorder` — et si CETTE
      construction échoue (mimeType non supporté, erreur transitoire),
      le `catch` se contentait de `return false`, SANS jamais relâcher ce
      flux déjà créé. Résultat : l'indicateur micro du navigateur pouvait
      rester allumé indéfiniment, et le canvas continuait d'être sollicité
      à 30 fps pour un flux sans aucun consommateur — exactement la fuite
      déjà documentée et corrigée pour le chemin d'arrêt NORMAL
      (`releaseTracks`, audit du 2026-08-16), mais jamais couverte sur le
      chemin d'ÉCHEC du démarrage. Le même bug, dupliqué à l'identique,
      existait dans LES DEUX classes (`MatchRecorder.start()` ET
      `HighlightRecorder.start()`), qui partagent la même structure de
      code copiée-collée. Confirmé réel avant fix (script `tsx` autonome
      d'abord — un `MediaRecorder` qui jette à la construction laissait
      `mixStream` non-null et 0 piste stoppée —, puis `git stash` du
      fichier source pour confirmer que les 2 nouveaux tests échouent bien
      sans le correctif). Fix identique × 2 : `this.releaseTracks()`
      ajouté dans le `catch` de `start()` des deux classes. 2 nouveaux
      tests (un par classe, avec un faux flux/piste micro qui trace
      précisément quelles pistes sont arrêtées). engine.test.ts 202 → 204.
      `tsc --noEmit` + `npm run build` verts.
- [x] Second bug RÉEL, trouvé en vérifiant mon PROPRE commentaire du fix
      précédent : `HighlightRecorder.rotate()` affirmait (dans le
      commentaire ajouté avec le fix « fuite de flux » d'il y a deux
      itérations) que « le prochain rotate() (14 s plus tard) retentera »
      après une panne transitoire du MediaRecorder — vérifié avec un
      script `tsx` autonome AVANT de faire confiance à ma propre
      affirmation, et c'était FAUX. Le garde-fou en tête de `rotate()`
      (`if (!rec || rec.state === 'inactive') return`) protégeait
      légitimement l'appel `.stop()` sur un recorder déjà mort, mais son
      `return` précoce empêchait AUSSI toute tentative de
      `startSegment()` — donc une fois `this.current` coincé sur un
      recorder inactif après un échec, TOUTES les rotations suivantes du
      reste du match devenaient des no-op silencieux, sans jamais
      retenter. Pas catastrophique (`stop()` retombe sur `prevBlob`, le
      dernier segment complet), mais une vraie régression de l'auto-
      guérison promise. Fix : séparé la garde qui protège `.stop()` de la
      tentative de `startSegment()`, qui s'exécute maintenant
      INCONDITIONNELLEMENT à chaque rotation. Confirmé réel avant fix
      (script `tsx`, puis `git stash` du fichier source — le nouveau test
      échoue bien sans le correctif, `constructCount` bloqué à 2 au lieu
      de 3). 1 nouveau test simulant 2 rotations consécutives (échec puis
      succès), vérifiant que la 3e construction est bien tentée ET
      réussit. engine.test.ts 204 → 205. `tsc --noEmit` + `npm run build`
      verts.
- [x] Retour sur `systems/voice.ts` (49,4 % stmts) pour couvrir le cœur
      RÉEL du flux de reco vocale : `onresult`/`onend`, jamais exercés
      malgré 2 bugs déjà trouvés/corrigés dans ce fichier cette session.
      Vérifié en particulier le fix documenté du 2026-08-16 (plusieurs
      résultats finalisés dans le même event Web Speech, pas seulement
      `resultIndex`) avec un VRAI test (event à 2 résultats finaux
      construits), pas seulement en faisant confiance au commentaire —
      confirme que `finalSeq` compte bien les deux et que le DERNIER
      commande gagne. Testé aussi le cycle relance/arrêt : `onend` relance
      la reco quand le coach n'a pas appelé `stop()` (Chrome la coupe
      régulièrement), et NE relance PAS après un `stop()` explicite.
      Chemin faisant, un `cancelAnimationFrame` non mocké dans
      l'environnement Node de vitest a fait planter le tout premier essai
      — pas un bug du jeu (cette API est universelle dans un vrai
      navigateur), juste un global manquant du bac à sable de test,
      corrigé en l'ajoutant au mock. 5 nouveaux tests. engine.test.ts
      205 → 210. Couverture `voice.ts` 49,4 % → 74,7 % (stmts). `tsc
      --noEmit` + `npm run build` verts.
- [x] Incident CI transitoire, diagnostiqué avant de toucher au code —
      le run de déploiement déclenché par le commit précédent a échoué,
      première fois depuis que Pages est en ligne. Logs du job vérifiés
      (`get_job_logs`) : l'échec vient de `codeload.github.com` qui a
      renvoyé 429 (Too Many Requests) puis 503 en boucle en essayant de
      télécharger le BUNDLE de l'action `configure-pages@v5` elle-même —
      AVANT même que `npm test`/`npm run build` ne tournent. Rien à voir
      avec ce dépôt. Confirmé, pas supposé : relancé le run échoué via
      `rerun_workflow_run` plutôt que d'attendre le prochain push — succès
      immédiat au 2e essai, sans aucun changement de code.
- [x] `systems/facecam.ts` (`FaceCoach`, énergie de mouvement par diff
      d'images pour la facecam) — 0 % de couverture, jamais touché même
      pendant toute la série de tests sur `voice.ts`/`recorder.ts` cette
      session. Contrairement à `sound.ts` (synthèse WebAudio, chaque
      méthode déjà protégée par un garde-fou `if (!this.ctx...) return`,
      effort de mock élevé pour un risque de bug faible — délibérément
      laissé de côté), `facecam.ts` est bon marché à tester (juste un
      élément vidéo, un canvas 2D, un `setInterval`) pour un vrai
      algorithme de diff de pixels à vérifier. 4 tests : la 1re frame
      n'initialise que la référence (énergie reste à 0) ; un changement de
      pixels total entre deux frames fait monter l'énergie à EXACTEMENT
      0,5 (pas juste « plus que 0 » — vérifié le lissage asymétrique
      documenté dans le code, moitié du saut brut à la 1re détection) ;
      une vidéo pas encore prête (`readyState < 2`) ne plante pas et ne
      touche à rien ; et le contrat déjà documenté dans `stop()` (« sans
      ça, un futur start() comparerait sa 1re frame au dernier souvenir de
      l'ANCIENNE session ») vérifié pour de vrai avec une VRAIE 2e
      session simulée après `stop()`, pas juste en lisant le commentaire.
      Aucun bug trouvé — le fichier était déjà correct — mais couvert
      pour de bon maintenant. engine.test.ts 210 → 214. Couverture
      `facecam.ts` 0 % → 96,9 %. `tsc --noEmit` + `npm run build` verts.
- [x] `systems/sound.ts` (`SoundSystem`, bande-son 100 % synthétisée
      WebAudio) — 0 % de couverture, écarté la fois précédente comme
      « effort de mock élevé pour un risque de bug faible ». Reconsidéré :
      TOUTES ses méthodes sont déjà protégées par `if (!this.ctx...)
      return`, ce qui rend le chemin « AudioContext absent » testable
      SANS AUCUN mock — l'environnement Node de vitest n'a justement pas
      `AudioContext` du tout, exactement comme un navigateur qui la
      refuserait. 1er test : tous les événements de jeu (hit/block/dodge/
      counter/special/ulti/gong/ko/hypeFull/cardPlay/confused) + setCrowd
      Hype/resume/setMuted/stop appelés à la chaîne sans jamais planter,
      alors que `ctx` est resté `null`. 2e test : `muted` reste cohérent
      indépendamment de l'audio. 3e test, plus généreux : un faux
      `AudioContext` minimal (nœuds chaînables `.connect()`, `AudioParam`
      avec les 4 méthodes de rampe utilisées) pour vérifier que le VRAI
      graphe audio (oscillateurs, filtres, bruit blanc, foule) se
      construit sans planter quand le contexte existe réellement — pas
      seulement le chemin de repli. Aucun bug trouvé. 3 nouveaux tests.
      engine.test.ts 214 → 217. Couverture `sound.ts` 0 % → 94,5 %.
      Couverture globale de `systems/` 0 % il y a quelques itérations →
      84,8 % maintenant. `tsc --noEmit` + `npm run build` verts.
- [x] Dernier trou de `recorder.ts` fermé : le chemin de SUCCÈS de
      `stop()` (résoudre avec un vrai `Blob`, pas juste échouer proprement)
      n'avait jamais été exercé pour NI `MatchRecorder` ni
      `HighlightRecorder` — tous les tests précédents sur ce fichier
      couvraient les chemins d'échec (le vrai gisement de bugs trouvés
      cette session), jamais le chemin heureux. 4 nouveaux tests : le Blob
      résolu contient bien le bon type MIME et les pistes sont relâchées ;
      `stop()` sans recorder actif résout `null` proprement ; et surtout
      la décision de `HighlightRecorder.stop()` entre segment courant et
      `prevBlob` — un segment en cours trop jeune (< 6 s, simulé en
      reculant `currentStartedAt` plutôt qu'en attendant pour de vrai)
      doit céder la place au dernier segment COMPLET, pas être renvoyé
      tel quel juste parce qu'il existe. Aucun bug trouvé. `recorder.ts`
      atteint 100 % de couverture de lignes. engine.test.ts 217 → 221.
      Couverture `recorder.ts` 74,8 % → 97,2 % (stmts). `tsc --noEmit` +
      `npm run build` verts.
- [x] Dernier vrai trou de `systems/voice.ts` fermé : la boucle de
      volume/pitch de `startVolumeMeter` — le signal RÉEL qui alimente le
      gain de Hype et la prosodie côté joueur — n'avait jamais tourné une
      seule fois sous test, malgré 3 bugs déjà trouvés dans ce fichier
      cette session. Faux `AudioContext`/`AnalyserNode` minimal (assez
      pour `createMediaStreamSource`/`createAnalyser`/`getByteFrequency
      Data`/`getFloatTimeDomainData`) + `requestAnimationFrame` capturé
      manuellement (pas laissé tourner en vrai) pour avancer la boucle
      frame par frame de façon contrôlée. 3 tests : un volume fréquentiel
      fort fait bien monter `state.energy` à la frame suivante ; une onde
      à 220 Hz dans le buffer temporel (même construction que le test déjà
      existant de `detectPitch`) met bien à jour `pitchRatio` — la
      prosodie fonctionne réellement de bout en bout, pas seulement la
      fonction pure `detectPitch` en isolation ; et `resume()` débloque
      bien un contexte `suspended` (Safari/iOS) sans jamais toucher à un
      contexte déjà actif. Aucun bug trouvé — ce coin du fichier était
      déjà correct. `systems/` (les 5 fichiers du dossier réunis) atteint
      95,5 % de couverture — parti de 0 % il y a une dizaine
      d'itérations. 3 nouveaux tests. engine.test.ts 221 → 224. Couverture
      `voice.ts` 74,7 % → 93,4 % (stmts). `tsc --noEmit` + `npm run build`
      verts.
- [x] README.md mis à jour — pivot depuis les tests/résilience (le seam
      de couverture est maintenant très mûr : `combat.ts` ~85 %,
      `systems/` 95,5 %) vers un vrai trou de FINITION jamais remarqué :
      le jeu est en ligne depuis plusieurs heures maintenant
      (`https://mordrak44.github.io/Coach-Arena/`), mais le README ne le
      mentionnait NULLE PART — la seule section « Jouer » disait
      `npm install && npm run dev`, comme si le jeu n'existait qu'en
      local. Pour un dépôt dont le README est souvent le tout premier
      contact (collaborateurs, curieux), c'est un vrai manque de
      finition maintenant que l'hébergement est réellement fonctionnel.
      Ajouté une section « 🕹️ Jouer en ligne » en tête, avec le lien
      direct, juste après le pitch — avant même la section Dev. Fusionné
      l'ancienne section « Jouer » (install + `npm run dev`) dans la
      section « Dev » existante plus bas, pour éviter la redondance de
      deux blocs `npm install && npm run dev` séparés. Rien à tester
      (changement de documentation pur) — `npm test` + `npm run build`
      relancés quand même pour confirmer qu'aucun fichier source n'a été
      touché par erreur.
- [x] Dernier résidu de `onboarding.ts` (85,7 %) : les tests existants
      couvraient déjà le JSON valide mais de mauvaise forme (`[]`, `42`,
      `"oops"` → repli sur `{}`), mais pas le JSON RÉELLEMENT invalide
      (syntaxe cassée, ne parse même pas) — deux catch différents dans le
      même `load()`, un seul testé. 1 test avec une chaîne non-parsable
      (`{ceci ne parse pas`), confirmant `hasSeenCombatHint`/
      `hasSeenCornerHint` retombent proprement sur « pas encore vu » au
      lieu de planter. `onboarding.ts` atteint 100 % de couverture de
      lignes. Reste (`sceneDirector.ts` lignes 110/174, un `hit` non-crit
      qui retourne `null`, et une branche `default` du sélecteur de
      personnage dans un switch déjà exhaustif) délibérément laissé de
      côté : code de génération de prompts vidéo pour le pipeline Kling
      serveur, jamais branché (`STUB_SCENE_SUBMITTER`) — valeur de test
      trop marginale pour l'effort face aux vrais trous encore possibles
      ailleurs. 1 nouveau test. engine.test.ts 224 → 225. `tsc --noEmit`
      + `npm run build` verts.
- [x] Même angle mort (JSON réellement invalide vs juste de mauvaise
      forme) systématiquement recherché dans les AUTRES modules
      `readJson`-like qui le partagent tous : `progression.ts`,
      `deckBuilder.ts` et `story.ts` avaient chacun le même trou que
      `onboarding.ts` — testés pour le JSON valide-mais-mauvaise-forme,
      jamais pour une vraie syntaxe cassée (2 catch différents dans
      chaque `load`/`readJson`, un seul exercé). 3 tests ajoutés (dont
      un qui étend un test existant plutôt que d'en dupliquer un
      nouveau pour `deckBuilder.ts`). Au passage, `getExtraCopies()`
      (`progression.ts`) — fonction exportée, utilisée par
      `CharacterSelect.tsx` pour afficher les copies de carte gagnées
      aux paliers de Lien, jamais appelée par un seul test — couverte
      en étendant le test `pendingReward`/`claimReward` déjà existant :
      vide avant toute réclamation, contient bien la carte réclamée
      après. Aucun bug trouvé nulle part. `deckBuilder.ts`/`story.ts`/
      `progression.ts` atteignent tous les trois 100 % de couverture de
      lignes. engine.test.ts 225 → 227. `tsc --noEmit` + `npm run build`
      verts.
- [x] 4e passe de coverage-driven bug hunt sur `combat.ts` (83,3 %), même
      motif gagnant que les 3 précédentes : `enemyCoachAI` — la logique de
      posture du coin adverse (le vrai « niveau de difficulté » du jeu) —
      n'avait JAMAIS tourné sous test, exactement comme `resolveAttack`
      avant les 4 bugs trouvés là-bas. Relu attentivement toute la chaîne
      de décision (verrouillage Provoqué → ulti/spécial probabilistes →
      arbre de posture selon PV propres/PV du joueur/posture du joueur)
      avant d'écrire quoi que ce soit, en cherchant un bug — rien trouvé
      cette fois, la logique est déjà cohérente et se lit bien (survie si
      bas, achève si l'adversaire est bas, contre-jeu contre l'agressivité,
      pression contre la défense, mix aléatoire sinon), avec un
      early-return propre empêchant tout déclenchement en double. 8
      nouveaux tests via `vi.spyOn(Math.random)`, un par branche :
      Provoqué verrouillé (sourd à sa propre IA) ; Ulti/Spécial adverses
      qui se déclenchent seuls, probabilistes ; les 4 branches de l'arbre
      de posture (PV bas propres, PV bas adverses, joueur agressif, joueur
      défensif) ; et le cas par défaut (pioche dans les 5 postures).
      engine.test.ts 227 → 235. Couverture `combat.ts` 83,3 % → 86,5 %
      (stmts). `tsc --noEmit` + `npm run build` verts.
- [x] Deux dernières branches d'`enemyCoachAI` restées non couvertes après
      la passe précédente : l'équivalent adverse de la Frénésie/Cri de
      Guerre armés (le coin adverse consomme aussi ses propres cartes
      armées, symétrique du joueur, déjà testé côté joueur mais jamais
      côté IA). 1 test, calibré précisément pour forcer `pick(['neutral',
      'aggressive'])` à choisir 'aggressive' (posture qui déclenche la
      Frénésie) tout en restant sous le seuil probabiliste d'entrée dans
      le bloc de décision — un seul `Math.random()` mocké satisfait les
      deux contraintes à la fois. Aucun bug trouvé. engine.test.ts
      235 → 236. Couverture `combat.ts` 86,5 % → 88,5 %. `tsc --noEmit` +
      `npm run build` verts.
- [x] `forceRoundTimeout`/`chooseTacticPlan`/`addSpeechHype` : 3 fonctions
      EXPORTÉES de `combat.ts`, utilisées en production (`forceRoundTimeout`
      par le timer de round côté UI ET par l'attract mode de
      `TitleScreen.tsx`, `chooseTacticPlan`/`addSpeechHype` par l'écran de
      coin du ring), jamais exercées par un seul test. 6 nouveaux tests :
      no-op hors phase de combat ; le round va au camp au plus haut % de
      PV ; une VRAIE égalité de ratio (maxHp égalisés explicitement entre
      les deux persos plutôt que déduits d'un pourcentage — Kenta et Rei
      ont des maxHp différents, un arrondi séparé de chaque côté aurait
      cassé une égalité voulue « exacte », piège attrapé en le vivant
      pendant l'écriture du test) tranche pour le joueur (`>=`, pas `>`,
      lu directement dans le code) ; `chooseTacticPlan` pose bien le plan ;
      `addSpeechHype` monte la Hype à l'échelle du Cœur (HRT) et reste
      plafonnée à `HYPE_MAX`. Aucun bug trouvé. engine.test.ts 236 → 242.
      Couverture `combat.ts` 88,5 % → 90 % (stmts), fonctions 90 % → 97,5 %.
      `tsc --noEmit` + `npm run build` verts.
- [x] Dernier mécanisme de jeu réel encore non testé trouvé dans
      `startNextRound` : une carte « provocation » jouée au coin du ring
      ne prend PAS effet immédiatement — elle se met en attente
      (`provokedUntil === -1`) et n'active le verrouillage agressif de
      l'adversaire qu'au DÉMARRAGE DU ROUND SUIVANT, jamais exercé par un
      test. 2 tests (un par camp, symétriques) : une provocation posée
      par le joueur verrouille bien l'ADVERSAIRE en agressif au round
      suivant (pas le joueur lui-même), et vice-versa côté coin adverse —
      confond facilement le sens si on ne relit pas soigneusement (`m.mods`
      = mods DU camp qui a joué la carte, mais l'effet retombe sur
      l'AUTRE camp, motif déjà rencontré et documenté ailleurs dans ce
      fichier). Aucun bug trouvé. engine.test.ts 242 → 244. Couverture
      `combat.ts` 90 % → 90,1 %. `tsc --noEmit` + `npm run build` verts.
- [x] La transition `roundEnd → tactics`/`matchEnd` de `tick()` — le
      cœur même du passage d'un round à l'autre — n'avait jamais été
      exercée DIRECTEMENT (seulement traversée incidemment par d'autres
      tests qui jouaient un match complet). 4 tests : 2 rounds gagnés par
      un camp déclenche bien `matchEnd` avec le bon vainqueur, pour les
      deux camps séparément ; et le « Vol de Souffle adverse »
      (`drainSouffle`, déjà testé pour l'application DSL mais jamais pour
      son VRAI effet de jeu) réduit bien le Souffle de la pause suivante,
      exactement une fois (pas reconduit aux pauses d'après), avec
      l'événement dédié — et ne descend jamais sous zéro même si le vol
      dépasse le Souffle disponible. Aucun bug trouvé. **Flake attrapé
      avant de pousser** (discipline habituelle : lancer la suite
      plusieurs fois, pas juste une) — le test « une seule fois » échouait
      environ 4 fois sur 5 en suite COMPLÈTE, jamais en isolation :
      `enemyCornerPlay(m)`, appelé PAR ce même `tick()` juste après la
      consommation du vol, peut piocher et jouer une VRAIE carte
      `drainSouffle` du starter deck adverse et réarmer le mod dans le
      même tick, après que mon assertion pensait le trouver déjà remis à
      zéro. Pas un bug du jeu — un flou dans le test, qui ne fixait pas
      assez l'état pour être déterministe. Corrigé en vidant explicitement
      `enemyHand`/`enemyDeck` avant le tick des deux tests concernés,
      confirmé stable sur 6 exécutions consécutives de la suite complète
      avant de commiter. engine.test.ts 244 → 248. Couverture `combat.ts`
      90,1 % → 90,8 % (stmts), lignes 92,8 %. `tsc --noEmit` + `npm run
      build` verts.
- [x] Suite du flake trouvé la fois précédente : la même discipline
      (relancer la suite plusieurs fois, pas juste une) appliquée
      SYSTÉMATIQUEMENT sur toute la suite existante — 25 exécutions
      complètes d'affilée des 248 tests, zéro échec. Confirme que le
      mécanisme de fuite découvert (`enemyCornerPlay` piochant une VRAIE
      carte pendant un test mal isolé) était bien isolé à ce seul test
      corrigé, pas un symptôme d'un problème plus large ailleurs dans la
      suite. Vérification pure, aucun changement de code pour ce
      constat-là.
      Ensuite, 3 dernières zones RÉELLES de `combat.ts` jamais exercées,
      trouvées en cherchant d'autres branches encore non couvertes : (1)
      le KO NATUREL (PV à 0 pendant le combat, pas via `forceRoundTimeout`
      qui compare des ratios) déclenchant `endRound` pour le bon camp, des
      deux côtés ; (2) perdre un round avec l'Ulti déjà proche du plein
      (90/100) le fait déborder à 100 pile et déclenche `ultiReady` — un
      vrai moment de comeback jamais vérifié ; (3) l'Initiative — jauge de
      Hype pleine ET coach silencieux plus de 6 secondes → le perso tire
      son spécial tout seul (et NE le fait PAS avant 6 s) — et la Dernière
      Chance côté JOUEUR (déjà testée côté adverse et via temps mort
      d'urgence, jamais pour ce déclenchement automatique précis en combat
      normal). 5 nouveaux tests, chacun vérifié sur 15 exécutions
      consécutives de la suite complète avant de commiter (leçon
      directement tirée du flake de la fois précédente). Aucun bug trouvé.
      engine.test.ts 248 → 253. Couverture `combat.ts` 90,8 % → 92,1 %
      (stmts), lignes 94,2 %. `tsc --noEmit` + `npm run build` verts.
- [x] Nouvelle passe de coverage-driven bug hunt sur `combat.ts` : deux
      dernières zones jamais exercées trouvées via `npm run coverage`. (1)
      `chargeUlti` déclenche `ultiReady` par deux chemins distincts — la
      perte d'un round (déjà testé) ET les DÉGÂTS DE COMBAT normaux qui
      remplissent la jauge (jamais testé) ; (2) `drawCards` : quand la
      pioche est vide mais la défausse ne l'est pas, la défausse est
      remélangée et redevient la pioche (jamais exercé), et quand pioche ET
      défausse sont vides, la pioche s'arrête proprement sans planter
      (jamais exercé non plus). La fonction jumelle privée `drawEnemyCards`
      (logique identique, non exportée) n'a délibérément pas été testée
      séparément — valeur marginale jugée trop faible. 3 nouveaux tests,
      vérifiés sur 15 exécutions consécutives de la suite complète avant de
      commiter. Aucun bug trouvé. engine.test.ts 253 → 256. Couverture
      `combat.ts` 92,1 % → 93,14 % (stmts), fonctions 97,5 %. `tsc --noEmit`
      + `npm run build` verts.
- [x] Coverage-driven bug hunt sur `story.ts` (Mode Histoire) : 4 dernières
      branches défensives jamais exercées, trouvées en isolant les
      instructions non couvertes via le rapport JSON brut (`coverage-final.
      json`) plutôt que le résumé texte, qui indiquait à tort « Lignes
      100 % » alors que 4 branches précises restaient mortes. (1)
      `baseChar` : le fallback `?? ROSTER[0]` quand un `opponentId` n'est
      ni le boss final ni dans le roster ; (2) `chapterEnemyDeck` : le
      fallback `?? []` quand un id de chapitre est absent de
      `CHAPTER_DECKS` — même famille défensive que `isUnlocked` avec un
      chapitre inconnu, déjà testée ; (3)-(4) `loadCleared`/`markCleared` :
      le chemin `hasStorage === false` lui-même — le bloc de résilience
      « localStorage totalement bloqué » existant importait déjà `story.ts`
      dans cet état mais n'appelait jamais ces deux fonctions ensuite, donc
      le early-return n'était jamais exercé. Aucun bug trouvé. 4 nouveaux
      tests, suite complète (260 tests) vérifiée sur 8 exécutions
      consécutives avant de commiter. `story.ts` disparaît du rapport de
      coverage (100 % sur toutes les métriques). `tsc --noEmit` +
      `npm run build` verts.
- [x] Coverage-driven bug hunt sur `enemyCardValue` (`combat.ts`, la grille
      de valeur du coach fantôme adverse) : 9 des 15 cases de son switch
      n'avaient JAMAIS été exercées (enemyHype, immuneConfusion,
      armCounterMul, armAttackFrenzy, lowHpHypeFull, provoke, counterHype,
      hitsTakenHype, halveEnemySpecial). La fonction n'est pas exportée
      mais `enemyCornerPlay` l'appelle sur CHAQUE carte de la main adverse
      pendant l'évaluation — achetée ou non —, donc il suffit de garnir la
      main adverse d'une carte par effet pour exercer chaque `case`, sans
      dépendre du choix final de l'IA. 2 tests avec des états opposés
      (Hype haute + perso adverse blessé, puis l'inverse) pour fermer aussi
      les branches des trois ternaires internes (enemyHype/lowHpHypeFull/
      halveEnemySpecial selon Hype et PV) — chaque test vérifie EN PLUS
      quelle carte a réellement été achetée (valeur la plus haute sous 3
      Souffle) et que son effet a été appliqué (Hype adverse réduite de 30,
      ou `provokedUntil` armé), pas seulement que rien ne plante. Calculs
      de valeur pré-dérivés à la main avant d'écrire le test (méthodologie
      habituelle) — les deux tests sont passés du premier coup, confirmant
      le calcul ET l'absence de bug dans cette grille de valeur. 2 nouveaux
      tests, suite complète (262 tests) vérifiée sur 8 exécutions
      consécutives avant de commiter. Couverture `combat.ts` 95,31 % (stmts,
      92,97 % → 95,31 %), branches 82,49 % → 86,81 %. `tsc --noEmit` +
      `npm run build` verts.
- [x] **Vrai bug trouvé** en poursuivant l'audit coverage sur le trickle de
      Hype passif du joueur (`combat.ts`, fonction d'auto-motivation) :
      `wasFull` (le flag « la Hype était-elle déjà pleine avant ce tick ? »)
      était calculé APRÈS que le trickle passif (auto-motivation, même
      coach silencieux) ait déjà rempli la jauge — donc si la Hype
      atteignait 100 % par ce seul trickle (aucune énergie de coaching ce
      tick précis), l'événement `hypeFull` ne partait JAMAIS : ni le son
      (`sys.sound.hypeFull()`), ni le flash visuel du renderer, alors que
      le minuteur de l'Initiative démarrait bel et bien en silence — un
      joueur pouvait donc atteindre la Hype pleine sans jamais en être
      prévenu. Confirmé par un test qui échouait avant correctif (Hype à
      99,995 avant un tick silencieux, seul le trickle passif la fait
      déborder à 100). Corrigé en capturant `wasFull` AVANT le trickle
      passif et en déplaçant la vérification de franchissement après les
      DEUX incréments (passif + actif), qu'ils aient eu lieu ensemble ou
      séparément. Repéré en creusant plus loin les mêmes lignes déjà visées
      par l'audit `enemyCardValue` ci-dessus (891-892 → 940 après
      l'édition). Second test ajouté pour les 4 dernières cases jamais
      évaluées d'`enemyCardValue` (hype branche <75, armCheerHype,
      blockEnemyCard, drainSouffle). 2 nouveaux tests, engine.test.ts
      262 → 264, suite complète vérifiée sur 15 exécutions consécutives
      (discipline `tick()` habituelle). Couverture `combat.ts` 95,31 % →
      95,65 % (stmts). `tsc --noEmit` + `npm run build` verts.
- [x] Dernière ligne droite du coverage-driven bug hunt sur `combat.ts` —
      les 5 derniers écarts réels : (1) `armCounterMul` dans
      `applyCardEffects` n'avait JAMAIS été exercé par un vrai `playCard`
      (seulement évalué côté IA, ou posé à la main dans les tests de
      consommation) — `Contre Parfait` joué par le joueur arme maintenant
      vérifié bout en bout ; (2) le trait Sanguin (`voiceW = 0.9` sur voix
      forte >0,55) dans le trickle de Hype n'était exercé par AUCUN test
      `tick()` — vérifié en comparant le gain de Hype de Fang (sanguin)
      entre une voix forte et une voix faible, à trait égal ; (3)
      `enemyCardValue` : la dernière case jamais évaluée, `dodgeBonus` (via
      Forteresse) ; (4) `tick()` rappelé alors que `phase === 'matchEnd'`
      — jamais exercé, vérifié comme un no-op silencieux (seul `m.t`
      avance, tout le reste de l'état reste figé, snapshot JSON complet
      hors `t`) ; (5) `planLabel()`, fonction exportée jamais appelée par
      un test, qui traduit chaque plan tactique en libellé HUD. Aucun bug
      trouvé sur ces 5 derniers points. 5 nouveaux tests, engine.test.ts
      264 → 269, suite complète vérifiée sur 15 exécutions consécutives.
      Couverture `combat.ts` 95,65 % → **97,49 %** (stmts), **100 %**
      fonctions — ne reste que `drawEnemyCards` (jumelle privée de
      `drawCards`, écartée délibérément, valeur marginale trop faible).
      `tsc --noEmit` + `npm run build` verts.
- [x] `combat.ts` désormais essentiellement plafonné, passage au fichier
      suivant le plus significatif : coverage-driven bug hunt sur
      `deckBuilder.ts`. `buildDeckFromTemplate` n'avait jamais été appelée
      sans signature (`signatureId=null`) ni avec de VRAIES cartes forgées
      non vides (le test existant passait toujours `[]`) — corrigé. Piège
      **de méthodologie** trouvé en écrivant ce test-ci : un premier essai
      ajoutait un test `hasStorage=false` pour `loadTemplate`/`saveTemplate`
      DIRECTEMENT dans le describe `deck-builder` (tôt dans le fichier),
      avec son propre `vi.resetModules()` — casse la suite complète de
      façon déterministe (pas un flake) : `hasStorage` de `story.ts` est
      calculé UNE FOIS à l'évaluation du module et reste figé tant
      qu'aucun autre `resetModules()` ne survient ; la toute PROCHAINE
      ré-évaluation dynamique de `./story` (dans le describe « mode
      Histoire », plus bas, qui n'a pas son propre `beforeEach` de
      `localStorage`) capturait alors un `hasStorage=false` erroné et le
      gardait pour tout le reste de la suite. Découvert en isolant le test
      qui échouait (`round-trip markCleared/loadCleared`), confirmé en le
      faisant passer seul puis échouer dans la suite complète. Corrigé en
      déplaçant le test dans le bloc « localStorage totalement bloqué »
      déjà existant en fin de fichier (reset + nettoyage à CHAQUE test,
      position choisie précisément pour éviter cette classe de piège).
      2 nouveaux tests, engine.test.ts 269 → 271, suite complète vérifiée
      sur 15 exécutions consécutives. Couverture `deckBuilder.ts` 94 % →
      **100 %** (stmts, lignes, fonctions). `tsc --noEmit` +
      `npm run build` verts.
- [x] Coverage-driven bug hunt sur `sceneDirector.ts` (le Réalisateur, 87,5 %
      stmts, fonctions 80 %) : la fonction manquante était en fait DEUX
      callbacks de comparateur `Array.sort()` (garder les 2 meilleurs
      moments par score, puis les re-trier chronologiquement) — tous les
      tests précédents n'avaient jamais qu'UN SEUL candidat de moment fort
      en jeu, or `Array.sort()` n'appelle son comparateur QUE s'il y a ≥2
      éléments à comparer : ce tri à deux étages (le cœur de la sélection
      des moments forts d'un match) n'avait donc jamais réellement tourné.
      Test à 3 rounds construit pour forcer un vrai réordonnancement (le
      round le plus faible éliminé, les 2 meilleurs remis dans le bon
      ordre chronologique après avoir été triés par score dans le
      désordre) — confirme l'algorithme correct. Complété par : le
      candidat en cours jamais flush si le dernier round se termine
      directement sur `matchEnd` sans `roundEnd` explicite ; les branches
      `colorWord` encore jamais exercées (hex invalide → `vivid`, `black`,
      `grey`, `orange`, `yellow`, `green` — qui couvre aussi la branche
      `max===g` du calcul de teinte —, `teal`). Aucun bug trouvé. 3
      nouveaux tests, engine.test.ts 271 → 274. Couverture
      `sceneDirector.ts` 87,5 % → **97,72 %** (stmts), fonctions
      **100 %** — ne restent que 2 lignes de code défensif prouvablement
      inatteignable (gardées par `eventScore`, jamais un vrai scénario de
      jeu). `tsc --noEmit` + `npm run build` verts.
- [x] Coverage-driven bug hunt sur `systems/voice.ts` (93,4 % stmts,
      fonctions 75 %) : `consumeCommand()` — la VRAIE API utilisée par
      `ArenaScreen.tsx` chaque frame pour lire ET vider la commande vocale
      en attente — n'avait jamais été appelée par un seul test : tous
      lisaient `state.pendingCommand` directement, contournant entièrement
      la sémantique « lecture puis remise à zéro » (même famille de piège
      que les bugs de consommation déjà trouvés ailleurs dans ce dépôt,
      ex. `armedCheerHype`). Vérifié bout en bout : rien en attente au
      départ, consommée une fois après un résultat vocal, l'état est bien
      vidé, une 2e consommation ne retourne plus rien. Complété par :
      `rec.onerror` (un vrai no-op assumé, commenté « géré par onend ») ;
      et un cas jamais distingué du bug déjà corrigé sur `supported` — un
      constructeur qui RÉUSSIT mais dont `rec.start()` jette au tout
      premier appel (`InvalidStateError`) repasse aussi `supported` à
      `false`, chemin de code différent du constructeur qui jette
      lui-même. Aucun (nouveau) bug trouvé. 3 nouveaux tests,
      engine.test.ts 274 → 277. Couverture `voice.ts` 93,4 % → **97,8 %**
      (stmts), **100 %** lignes, fonctions 75 % → 91,66 % (ne reste que le
      handler de rejet de `audioCtx.close()`, nécessiterait un mock
      d'AudioContext complet pour une valeur marginale trop faible).
      `tsc --noEmit` + `npm run build` verts.
- [x] Coverage-driven bug hunt sur `systems/facecam.ts` (fonctions 66,66 %,
      2 sur 3 seulement) : `start()` câble `window.setInterval(() =>
      this.sample(), 180)` pour l'échantillonnage périodique de l'énergie
      de mouvement — mais le mock de `setInterval` utilisé par TOUS les
      tests existants (`() => 999`, un simple id factice) n'appelait
      jamais réellement le callback. Résultat : `sample()` elle-même était
      déjà bien testée (appelée directement dans les tests), mais le
      CÂBLAGE de `start()` vers `sample()` — la vraie garantie que la
      capture webcam alimente bien l'énergie du coach en jeu — n'avait
      jamais tourné une seule fois. Corrigé en capturant le callback passé
      à `setInterval` et en l'invoquant manuellement (2 ticks : le premier
      pose la frame de référence, le second calcule un vrai delta
      d'énergie, valeur exacte vérifiée). Complété par `video.play()` qui
      rejette (catch muet assumé, `start()` continue quand même). Aucun
      bug trouvé. 2 nouveaux tests, engine.test.ts 277 → 279. Couverture
      `facecam.ts` fonctions 66,66 % → **100 %**, stmts/lignes déjà à
      100 % désormais confirmées bout en bout (pas juste par appel
      direct). `tsc --noEmit` + `npm run build` verts.
- [x] Coverage-driven bug hunt sur `liveCutPlayer.ts` (fonctions 80 %, 4
      sur 5) : `setLibrary()` — la VRAIE API appelée par `ArenaScreen.tsx`
      une fois le préchargement async des clips terminé (le lecteur, lui,
      doit exister dès la création du match, avant que la bibliothèque ne
      soit prête) — n'avait jamais été appelée par un seul test : tous
      construisaient le lecteur avec sa bibliothèque déjà en main via le
      constructeur, contournant entièrement le scénario réel « vide au
      départ, remplie plus tard ». Vérifié bout en bout : `current()`
      reste `null` avec `EMPTY_CUT_LIBRARY` au premier `update()`, puis
      `setLibrary()` avec une vraie bibliothèque, puis un nouvel événement
      produit bien un clip au `update()` suivant — la substitution prend
      réellement effet en cours de partie. Aucun bug trouvé. 1 nouveau
      test, engine.test.ts 279 → 280. Couverture `liveCutPlayer.ts`
      fonctions 80 % → **100 %**, stmts/lignes déjà à 100 % désormais
      confirmées par le vrai chemin de préchargement. `tsc --noEmit` +
      `npm run build` verts.
- [x] Même famille de bug de méthodologie trouvée 2 fois de suite
      (facecam.ts, liveCutPlayer.ts), traquée maintenant dans
      `systems/recorder.ts` (fonctions 91,66 %) : (1)
      `HighlightRecorder.start()` câble `setInterval(() => this.rotate(),
      segmentMs)` pour la rotation automatique des segments, mais TOUS les
      tests existants appelaient `rotate()` directement et mockaient
      `setInterval` en `() => 0` — le vrai câblage timer → rotation
      n'avait jamais tourné une seule fois ; (2) `MatchRecorder.download()`
      programme `setTimeout(() => URL.revokeObjectURL(url), 5000)`, mais
      `revokeObjectURL` n'était qu'un stub jamais réellement invoqué (le
      délai n'avait jamais le temps de s'écouler dans les tests) —
      vérifié avec `vi.useFakeTimers()` : rien avant 4999 ms, révocation
      exacte à 5000 ms pile ; (3) `startSegment()` appelée sans flux actif
      (jamais démarré, ou déjà relâché) est un garde-fou jamais exercé,
      confirmé no-op sûr. Aucun bug trouvé. 3 nouveaux tests,
      engine.test.ts 280 → 283. Couverture `recorder.ts` fonctions
      91,66 % → **100 %**, stmts/lignes déjà à 100 % désormais confirmées
      par le vrai câblage. `tsc --noEmit` + `npm run build` verts.
- [x] Dernier passage de la série sur `systems/` : `sound.ts` (fonctions
      95,45 %). Le handler muet de `stop()` (`ctx.close().catch(() => {})`)
      n'avait jamais été exercé — même famille que le point laissé de côté
      sur `voice.ts` il y a 2 itérations, cette fois fermé avec un
      `AudioContext` factice dont `close()` rejette. Découverte plus
      intéressante en cours de route : `setCrowdHype()` (la foule qui
      gronde plus fort avec la Hype) n'avait JAMAIS réellement programmé
      sa rampe dans aucun test — le test global existant appelle toujours
      `ss.hit(true)` AVANT `setCrowdHype()`, ce qui arme `roarUntil` dans
      le FUTUR du `currentTime` figé du faux `AudioContext` (qui n'avance
      jamais) : le garde-fou anti-écrasement de rampe (ajouté le
      2026-08-16 pour un tout autre bug) bloquait alors silencieusement
      CE test-ci en plus de protéger la vraie clameur qu'il visait à
      l'origine — jamais remarqué faute d'assertion sur l'appel réel de
      `linearRampToValueAtTime`. Nouveau test isolé (aucune clameur
      préalable) confirmant la rampe programmée à la valeur exacte. Aucun
      bug trouvé. 2 nouveaux tests, engine.test.ts 283 → 285. Couverture
      `sound.ts` fonctions 95,45 % → **100 %**, lignes → **100 %**, stmts
      94,48 % → 96,85 %. `tsc --noEmit` + `npm run build` verts.
- [x] `systems/pitch.ts` (97,5 % stmts) : le garde-fou `maxLag >= n`
      (buffer trop court pour couvrir la période la plus grave mesurable,
      MIN_HZ = 70 Hz) n'avait jamais été exercé — distinct du rejet par
      énergie faible (silence/bruit), déjà testé. Un signal fort mais trop
      COURT (500 échantillons à 48 kHz, sous les 685 requis) est
      maintenant vérifié rejeté. Écarté (valeur nulle, pas un vrai
      scénario audio) : la branche `den === 0` de la corrélation — ne peut
      arriver que si un unique échantillon non-nul tombe pile dans l'angle
      mort structurel d'un lag précis (`[n-lag, lag)` quand `lag > n/2`),
      un signal qui n'existe jamais en pratique (un vrai micro ne produit
      jamais un buffer presque entièrement à zéro avec un seul pic isolé
      à une position aussi spécifique). Aucun bug trouvé. 1 nouveau test,
      engine.test.ts 285 → 286. Couverture `pitch.ts` → **100 %**
      (stmts/lignes/fonctions). `tsc --noEmit` + `npm run build` verts.
- [x] **Vrai bug trouvé** — `game/` et `systems/` étant désormais
      essentiellement à 100 % de couverture, changement d'angle : audit
      de code (skill `code-review`, effort élevé) sur `render/
      arenaRenderer.ts`, le plus gros fichier du dépôt (1100 lignes),
      jamais audité pour des bugs de cette façon (seulement effleuré par
      les captures d'écran visuelles de `scripts/shot.mjs`). Ciblé sur le
      champ `reducedMotion` (WCAG 2.3.3, ajouté le 2026-08-17) : l'appel
      `window.matchMedia('(prefers-reduced-motion: reduce)').matches`
      n'avait AUCUN try/catch — seulement des gardes `typeof`, qui NE
      protègent PAS contre l'appel lui-même (ou la lecture de `.matches`)
      qui jette, exactement la même famille de piège que `hasStorage`
      documentée et corrigée dans cardForge.ts/deckBuilder.ts/
      onboarding.ts/progression.ts/stable.ts/story.ts — mais jamais
      appliquée ici. Sur un navigateur durci ou une extension
      anti-fingerprinting qui fait planter `matchMedia`, `new
      ArenaRenderer()` plantait DANS son initialiseur de champ, remontant
      jusqu'à l'ErrorBoundary : l'écran « K.O. TECHNIQUE » remplaçait le
      match ENTIER pour un simple réglage d'accessibilité qui aurait dû,
      au pire, se désactiver silencieusement. Confirmé par un test qui
      échouait avant correctif (`git stash` sur le seul fichier source).
      Corrigé en enveloppant la détection dans le même patron IIFE
      try/catch que `hasStorage`. Second point relevé par l'audit mais
      délibérément écarté (limite assumée, documentée en commentaire) :
      la préférence n'est lue qu'à la construction, pas en direct — pas
      de cycle de vie `dispose()` sur `ArenaRenderer` pour retirer
      proprement un `addEventListener` de changement, le risque de fuite
      dépasserait la valeur d'un réglage OS changé en plein match. 1
      nouveau test, engine.test.ts 286 → 287. `tsc --noEmit` +
      `npm run build` verts.
- [x] **3 vrais bugs trouvés** — audit de code (skill code-review, effort
      élevé) sur `ArenaScreen.tsx` (918 lignes), jamais ciblée par un round
      d'audit dédié jusqu'ici (les rounds précédents couvraient les AUTRES
      écrans UI et `App.tsx`/`arenaRenderer.ts`, jamais celui-ci — le plus
      gros et le plus dense en logique de tous). (1) **Consigne mal
      appliquée à la transition round→coin du ring** : le reset de
      `lastFinalSeq` (« ignore les phrases dites pendant le round écoulé »)
      tournait APRÈS le bloc qui lit `finalSeq` pour en faire une consigne,
      sur le MÊME tick que la transition — un mot crié en plein combat
      (« CONTRE ! », etc.) pouvait donc être lu comme la consigne de la
      pause qui vient de commencer, avant même que le joueur n'ait parlé
      au coin du ring, consommant pour rien son unique consigne par pause.
      Corrigé en avançant ce reset avant le bloc de lecture. (2) **Le soin
      d'urgence du coin adverse (temps mort sous 25 % PV) était attribué
      au JOUEUR** : le switch de la « visio des coachs » ne reconnaissait
      que le suffixe `(coin adverse)` sur les events `card`, pas `(temps
      mort adverse)` (2e forme possible, voir combat.ts) — la bulle
      d'humeur adverse ne s'affichait pas, et `procPulse()` déclenchait à
      la place le badge « carte déclenchée » du JOUEUR, pile au moment où
      le coin adverse se sauve in extremis. Corrigé en testant la présence
      du mot « adverse » (commun aux deux suffixes, jamais présent côté
      joueur — vérifié dans combat.ts). (3) **`useRef(createMatch(...))`
      recréait un match complet (2 decks mélangés + mains piochées) à
      CHAQUE rendu** — l'argument d'un appel `useRef()` est réévalué par
      JS à chaque rendu même si `useRef` ne garde que le tout premier
      résultat ; ce composant re-rend plusieurs fois par seconde (boucle
      de jeu à base de `setState`), donc un match entier était construit
      puis jeté en pure perte à chaque frame. Corrigé par le patron
      d'initialisation paresseuse standard (`useRef(null)` + garde `if
      (current === null)`). Écarté (refactor plus large, même prudence que
      le précédent différé sur `arenaRenderer.ts`) : fusionner les 2
      boucles `for`/`switch` séparées (humeur puis son) sur `m.events` —
      la duplication a directement facilité le bug (2), mais un tel
      refactor mérite sa propre vérification visuelle dédiée plutôt que
      d'être fait à la hâte ici. Vérifié : suite complète (287 tests)
      verte, `tsc --noEmit` + `npm run build` verts, ET funnel complet
      capturé en Chromium headless (`scripts/shot.mjs`) — titre, vie
      privée, sélection, arène ×2, résultats — aucune régression visuelle.
      Aucun test unitaire dédié (pas de harnais de test composant React
      dans ce projet ; ces 3 bugs touchent la boucle de jeu de
      `ArenaScreen.tsx`, pas la logique pure de `combat.ts`).
- [x] Audit de code (skill code-review) sur `CharacterSelect.tsx` (622
      lignes), le plus gros écran UI, revu pour la dernière fois au round 3
      (2026-08-16) — depuis, Vie d'Écurie, Deck du Coach et Mode Histoire
      s'y sont tous branchés sans nouveau passage. Tous les bugs
      précédemment corrigés (état périmé, équipiers fantômes, collisions
      d'id signature/pool, double-comptage du deck) re-vérifiés sains,
      aucune régression. Un vrai trou d'accessibilité trouvé, de la MÊME
      famille que celle déjà corrigée sur `CharCard` par le premier audit
      a11y (`89001fc`) mais jamais étendue aux bascules ajoutées depuis :
      le toggle guidé/expert, les 3 groupes de puces du mode guidé (style/
      tempérament/univers), et les puces d'équipiers de relève ne
      signalaient leur sélection que par une bordure colorée (CSS pur,
      invisible en lecteur d'écran) — sans `aria-pressed`, chaque bouton
      d'un groupe annonce le même texte qu'il soit sélectionné ou non.
      Ajouté `aria-pressed` sur ces 6 groupes de boutons (les boutons
      `chip(false)` restants — reset du deck, -/+ de copies — sont de
      vrais boutons d'action sans état persistant, à raison non touchés).
      Vérifié : `tsc --noEmit` + `npm run build` + suite complète (287
      tests) verts, ET capture Chromium headless avec lecture directe des
      attributs `aria-pressed` réellement posés sur les puces déjà
      rendues (style/tempérament/univers + CharCard), zéro régression
      visuelle.
- [x] Audit de code (skill code-review, effort élevé) sur `ReadyScreen.tsx`
      (écran Vestiaire, permissions média) et `PrivacyScreen.tsx` — les 2
      seuls écrans UI jamais touchés par la 4e passe d'accessibilité du
      2026-08-17. Aucun bug trouvé sur les deux (ReadyScreen : logique
      `speechOk`, imbrication try/catch de `requestCoachStream()`, cession
      du `MediaStream` à `ArenaScreen` — tout vérifié sain ; PrivacyScreen :
      composant purement statique, rien à trouver). Vérification manuelle
      complémentaire (le composant chip/toggle n'existe dans aucun des
      deux) : pas de bascule sans `aria-pressed` non plus. Retour au
      coverage-driven bug hunt : `onboarding.ts` (89,28 %, dernier module
      `localStorage` du dossier `game/` encore incomplet) — l'idempotence
      de `markCornerHintSeen()` (rappelée une 2e fois) et le chemin
      `hasStorage === false` (même angle mort déjà trouvé sur story.ts et
      deckBuilder.ts : le bloc de résilience important déjà le module dans
      cet état mais n'appelait jamais ses fonctions ensuite) n'avaient
      jamais été exercés. Aucun bug trouvé. 2 nouveaux tests,
      engine.test.ts 287 → 288. Couverture `onboarding.ts` → **100 %**
      (toutes métriques). `tsc --noEmit` + `npm run build` verts.
- [x] Suite du coverage-driven bug hunt : `progression.ts` (96,03 % → 99 %,
      branches 88,67 % → 98,11 %). Fermé : `hasStorage === false` (même
      angle mort) ; la branche `level <= claimed` de `claimReward` (le
      test existant la refusait toujours via `!options.includes(cardId)`,
      jamais via ce garde-fou précis) ; le repli `map[charId] ?? {...}`
      DANS `claimReward` lui-même (celui de `getProgress` était déjà testé,
      pas celui-ci, un charId jamais vu de `claimReward` directement) ; et
      la migration `loadCustoms` d'un perso SANS AUCUN spécial (`c.special
      ?.name ?? 'Frappe Légendaire'`, jusqu'ici toujours exercée avec un
      `special.name` valide). **Trouvaille mathématique en cours de
      route**, sur le dernier écart restant (`rewardOptionsFor`, la
      résolution de collision `if (b === a) b = (b+1) % pool.length`) :
      brute-forcé 10 millions de combinaisons (perso × palier) sans
      trouver UNE SEULE collision — pas une coïncidence. Preuve : `hash()`
      est du FNV-1a, dont le dernier caractère hashé ('a' vs 'b', code 97
      et 98) diffère par XOR 3, qui bascule toujours le bit de poids
      faible ; une multiplication par un nombre IMPAIR (16777619, la
      constante FNV) préserve la parité mod 2^32 ; et `CARD_POOL.length`
      vaut 22 aujourd'hui (PAIR). Donc `hash(...':a') % 22` et
      `hash(...':b') % 22` ont TOUJOURS des parités opposées — ils ne
      peuvent JAMAIS être égaux tant que la taille du pool reste paire.
      Ce garde-fou est du code mort aujourd'hui, mais deviendrait
      silencieusement critique (et toujours non testé) le jour où une
      carte impaire s'ajoute au pool — noté ici plutôt que forcé par un
      test artificiel qui masquerait cette dépendance cachée. 3 nouveaux
      tests, engine.test.ts 288 → 292, suite complète vérifiée sur 6
      exécutions consécutives. `tsc --noEmit` + `npm run build` verts.
- [x] Suite du coverage-driven bug hunt : `stable.ts` (Vie d'Écurie) →
      **100 %**. Fermés : `hasStorage === false` ; `desireText` avec une
      envie qui n'existe pas dans le pool du trait donné (`pool.length ===
      0` → `null`, jamais exercé — seul le cas normal et le cas
      `desire: null` l'étaient) ; la dérive douce vers 50 depuis EN
      DESSOUS (le seul test existant part toujours d'une humeur AU-DESSUS
      de 50, jamais en dessous — direction opposée du même calcul, jamais
      vérifiée) ; le changement de jour avec une envie DÉJÀ comblée la
      veille (doit en faire naître une nouvelle, jamais exercé — le test
      « nouveau jour » existant ne touche qu'aux actions rechargées, pas
      aux envies) ; et le repli `all[charId] ?? freshState(now)` PROPRE à
      `recordMatchMood` (le test existant appelait toujours `getStable`
      en premier pour « semer » l'état, jamais `recordMatchMood` sur un
      charId totalement neuf). Aucun bug trouvé. 5 nouveaux tests,
      engine.test.ts 292 → 296, suite complète vérifiée sur 6 exécutions
      consécutives. Couverture `game/` globale 97,79 % → **98,14 %**
      (stmts), branches 88,56 % → **90,47 %**. `tsc --noEmit` +
      `npm run build` verts.
- [x] Suite du coverage-driven bug hunt : `cardForge.ts` (94,59 % →
      97,29 %, fonctions → **100 %**). Fermés : `loadForgedCards()` sur un
      stockage jamais écrit (tous les autres tests appelaient toujours
      `saveForgedCard` avant au moins une fois — son propre repli `?? '[]'`
      n'était jamais exercé côté « rien n'a jamais été sauvegardé ») ; et
      `hasStorage === false` pour `saveForgedCard`/`loadForgedCards`.
      Écarté (code structurellement inatteignable, pas juste rare) : les
      cases `blockEnemyCard`/`drainSouffle` du switch privé `describe()`
      (lignes 165-167) — ce switch est exhaustif sur TOUT `EffectPrimitive`
      par exigence TypeScript, mais aucune des 14 règles de la Forge
      (`RULES`) ne produit jamais ces deux primitives ; `describe()` n'est
      ni exportée ni appelée ailleurs que par `forgeCard()`, donc ces 2
      cases ne peuvent être atteints par AUCUN chemin de code réel
      actuellement — les forcer nécessiterait d'appeler une fonction
      privée non exportée avec un effet qu'aucune règle ne produit
      jamais, un test qui masquerait plutôt qu'il ne vérifierait quoi que
      ce soit. Aucun bug trouvé. 2 nouveaux tests, engine.test.ts
      296 → 298, suite complète vérifiée sur 6 exécutions consécutives.
      `tsc --noEmit` + `npm run build` verts.
- [x] Suite du coverage-driven bug hunt : `commentator.ts` (96,07 % →
      **100 %**, branches 72 % → 98 %). Trouvaille structurelle : le test
      « poids cohérents par famille d'événement » (déjà existant) passait
      SYSTÉMATIQUEMENT `'player'` comme camp (`by`/`target`/`who`/`winner`)
      pour les 12 familles d'événements testées — jamais une seule fois
      `'enemy'`. Or presque chaque case du switch calcule sa variable
      (`{D}`/{W}`/`{A}`/`{C}`) via un ternaire `=== 'player' ? P : E`, et
      choisit son pool de gabarits via un ternaire similaire pour
      `roundEnd`/`matchEnd` (victoire vs défaite) : la moitié `: E` de
      CHAQUE ternaire du fichier n'avait donc jamais tourné — un vrai
      angle mort systémique, pas fichier par fichier. Nouveau test
      miroir, symétrique du premier, avec `'enemy'` partout. Complété par
      2 cas encore manquants : `'hit'` critique + silencieux (distinct du
      crit=false déjà testé ET du silence déjà testé sans crit), et
      `'blocked'` + silencieux (le test du silence de 3 s existant ne
      testait `blocked` qu'EN DEHORS de la fenêtre). Aucun bug trouvé. 3
      nouveaux tests, engine.test.ts 298 → 300, suite complète vérifiée
      sur 8 exécutions consécutives. Couverture `game/` globale 98,07 %
      (stmts), branches **92,15 %**. `tsc --noEmit` + `npm run build`
      verts.
- [x] Dernier passage sur les 3 derniers fichiers `game/` incomplets —
      `speechTactics.ts`, `sceneQueue.ts`, `cutPlanner.ts` : tous **100 %**
      désormais. `speechTactics.ts` : le garde-fou « texte trop court
      (< 6 caractères) » de `parseConsigne`, distinct du « ne matche
      aucune règle » déjà testé, jamais exercé. `sceneQueue.ts` :
      `cancel()` appelée AVANT qu'un submitter en vol ne REJETTE (pas
      juste `resolve(null)`) — le garde-fou `if (this.cancelled) return`
      du `.catch()` n'était jamais exercé, seul celui du `.then()`
      l'était (même patron que le bug déjà corrigé pour ce fichier, cette
      fois côté rejet). `cutPlanner.ts` : même trouvaille systémique que
      `commentator.ts` la fois précédente — le match synthétique partagé
      par toute la describe « séquenceur de cuts » n'avait qu'un seul
      `ulti` (côté enemy) et un seul `countered` (côté player), et AUCUN
      `special` du tout : la moitié manquante de chaque ternaire
      `by === 'player' ? ... : ...` (dans `cutsForEvent`, exportée) et le
      case `'special'` d'`eventScore` (jamais atteint faute d'event)
      n'avaient jamais tourné. Testé directement via `cutsForEvent`
      (exportée) plutôt qu'en modifiant le montage synthétique partagé —
      risque de régression sur les assertions existantes (compte de
      cuts, budget par round) jugé disproportionné pour ce gain. Aucun
      bug trouvé. 5 nouveaux tests, engine.test.ts 300 → 303, suite
      complète vérifiée sur 8 exécutions consécutives. Couverture `game/`
      globale 98,07 % → **98,62 %** (stmts), branches 92,15 % →
      **93,04 %**. `tsc --noEmit` + `npm run build` verts.
- [x] **Vrai bug trouvé** — audit de code (skill code-review, effort
      élevé, fichier ENTIER pas juste le dernier diff) sur `StoryScreen.tsx`
      et `ResultsScreen.tsx` (aucun bug — ce dernier n'avait jamais eu
      qu'un passage a11y, revérifié sain), puis `TitleScreen.tsx` (écran
      titre à l'attract mode) : son conteneur `.screen` posait
      `overflow: 'hidden'` en ligne, qui ÉCRASE le `overflow-y: auto` de
      la feuille de style — le seul filet de scroll de toute l'appli,
      documenté dans `styles.css` après le bug déjà corrigé sur
      StoryScreen/CharacterSelect (contenu qui déborde, haut ou bas
      inatteignable). Sur un petit écran (téléphone en paysage, fenêtre
      étroite) ou avec le texte agrandi par accessibilité, le titre + la
      tagline + les 2 boutons + la note de permissions + le lien Vie
      privée (tous en flux normal, dans un `<div>` empilé PAR-DESSUS le
      canvas d'attract mode) pouvaient déborder de la boîte SANS AUCUN
      MOYEN d'atteindre le bas — ni le CTA principal, ni le lien Vie
      privée. Corrigé en retirant `overflow: 'hidden'` (superflu : le
      canvas et le voile en `position: absolute; inset: 0` restent calés
      sur la boîte de `.screen` sans lui). Vérifié en conditions réelles,
      pas supposé : Chromium headless à un viewport normal (funnel
      identique, zéro régression) PUIS à un viewport très court
      (700×320) — `scrollHeight` (593) > `clientHeight` (320) confirmant
      le débordement réel, `scrollTop` atteignant le bas après un scroll
      programmatique, et le lien Vie privée devenu visible après scroll
      (jamais atteignable avant le correctif). 303 tests inchangés (pur
      correctif CSS, aucune logique touchée). `tsc --noEmit` +
      `npm run build` verts.

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
- [x] Couverture de tests de stable.ts — seul fichier de logique de jeu
      substantiel (233 lignes) à zéro référence dans engine.test.ts ET
      dans scripts/sim.ts, repéré en comparant systématiquement chaque
      fichier de src/game/ à ses usages dans les deux. Piège découvert en
      le testant : l'environnement de test (Node, sans jsdom) n'a pas de
      `localStorage` global, et `hasStorage` dans stable.ts est calculé
      UNE FOIS au chargement du module — sans un faux localStorage posé
      AVANT le premier `import('./stable')`, chaque test tournerait en
      mode « stockage indisponible », où toute écriture est un no-op et
      où la persistance inter-appels (dérive d'humeur, cumul des actions
      du jour, non-régénération d'une envie comblée) est invisible aux
      tests. Corrigé avec un faux localStorage en mémoire, posé/vidé
      avant chaque test. 9 tests vitest (63 au total, exécutés 5× de
      suite pour écarter toute fragilité liée au tirage aléatoire des
      envies — DESIRES.sanguin/cerebral/tetu/fusionnel) : limite de 3
      actions/jour, bonus de comblement d'envie + non-régénération le
      même jour, plafond d'humeur à 100, plancher à 10 sur les défaites,
      consommation à usage unique de l'entraînement, dérive vers 50,
      rechargement des actions au changement de jour, seuils de
      moodInfo/moodStartHype/moodIgnoresFirstOrder.
- [x] Couverture de tests de progression.ts (Lien, paliers, persos
      créés) — même démarche, prochain fichier de logique substantiel
      (192 lignes) hors sim.ts. `fakeLocalStorage()` factorisé au niveau
      du fichier de test (même piège `hasStorage` que stable.ts, dont
      progression.ts dépend via `getDesiresFulfilled`). 8 tests vitest
      (71 au total) : seuils exacts de bondLevel/bondHrtBonus/bondTitle
      (bornes 1/3/6/10/15, clamp à 5 même à 999 victoires),
      rewardOptionsFor déterministe (même perso+palier → mêmes 2 cartes,
      jamais deux fois la même), et surtout l'ordre STRICT des paliers de
      récompense verrouillé par un test explicite : avec 6 victoires
      (bondLevel 3), pendingReward propose bien le palier 1 EN PREMIER,
      jamais un saut direct au palier 3 — comportement correct en
      pratique mais qui n'était garanti par aucun test jusqu'ici, donc
      cassable sans que rien ne le détecte. Aussi : claimReward refuse
      une carte hors options et un second claim au même palier,
      applyBond ne copie jamais un perso à bonus nul (même référence) et
      plafonne HRT à 12, saveCustom/loadCustoms testés sur la limite de 4
      + dédoublonnage par id + migration des persos sauvegardés avant
      l'Ulti.

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
      Couverture de tests directe ajoutée le 2026-08-15 (jusque-là 0
      référence — seulement exercé indirectement via scripts/sim.ts).
      Piège réel trouvé en écrivant les tests : `createMatch` précharge
      TOUJOURS `m.events` avec un premier `roundStart` (voir combat.ts) —
      sans le consommer explicitement en premier, il pollue silencieusement
      chaque test (une ligne « gratuite » en plus, ET une fenêtre de
      silence de 3 s qui démarre dès t=0, faisant échouer les événements
      mineurs poussés juste après). 9 tests vitest (80 au total, dont un
      qui verrouille précisément le contrat de l'anti-répétition : jamais
      deux gabarits identiques D'AFFILÉE, mais un gabarit PEUT revenir
      après être passé par un autre — pas une règle plus large qu'elle ne
      l'est réellement), exécutés 5× de suite pour la stabilité malgré le
      `Math.random` mocké dans certains cas.
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
- [~] Portrait de référence par perso (Kling image) — DÉBLOQUÉ le
      2026-08-15, pilote sur 2 catégories (Kenta/brawler, Rei/rival).
      Planche multi-vues (face/profil/trois-quarts) par perso, puis un
      portrait d'action unique dérivé par image-to-image — nécessaire
      car un modèle i2v attend UNE image nette, pas une planche à 3
      panneaux. Reste : décider où les héberger DURABLEMENT (les URLs
      Kling expirent en 24h — voir note ci-dessous) avant de les
      intégrer au jeu.
- [~] Scènes image-to-video : entrée dans l'arène, moment fort du round,
      KO — pilote : 8 clips vidéo générés pour Kenta+Rei (test bloquant
      n°1 counter-exchange validé en premier, puis attack-solo/
      hit-reaction/ko-down ×2 + victory-pose Kenta ; reste : victory-pose
      Rei, intro-faceoff, idle-loop, impact-flash et crowd neutres —
      lot interrompu par l'utilisateur avant la fin, pas relancé sans
      confirmation). ~210 crédits consommés sur 2978. **Non vérifié
      visuellement par Claude** : ce bac à sable bloque l'accès réseau à
      klingai.com (CDN images ET vidéos) au niveau de la politique
      egress — confirmé à la fois en `curl`/WebFetch direct et en
      Chromium headless (Playwright) chargeant un vrai `<video src=...>`
      pointant vers un clip généré (`net::ERR_TUNNEL_CONNECTION_FAILED`).
      Le câblage `<video>`/`CutClipLibrary` déjà en place (voir Mode
      Cinématique) a été testé avec un patch TEMPORAIRE (retiré avant ce
      commit) pointant vers ces vraies URLs Kling : la logique demande
      bien la bonne URL pour le bon perso/kind (`readyState` cohérent,
      pas d'erreur de câblage) — seule la LECTURE réelle du fichier
      n'est pas vérifiable d'ici. Les liens ont été partagés en
      conversation ; ils expirent 24h après génération.
      2026-08-16 : l'utilisateur a confirmé ("je confirme") vouloir
      reprendre le lot manquant. Les 2 portraits de référence Kenta/Rei
      de la veille ayant expiré (24h), ils ont été régénérés (2 crédits,
      mêmes prompts que les portraits dérivés qui avaient servi aux 8
      clips déjà faits) — URLs fraîches obtenues et confirmées prêtes.
      Le lot a été interrompu par l'utilisateur une TROISIÈME fois juste
      avant le premier envoi vidéo du lot restant (victory-pose Rei) :
      aucun crédit vidéo dépensé cette fois, seulement les 2 portraits
      (~212 crédits consommés au total sur 2978). Conformément à la
      règle « jamais de crédits sans confirmation », pas de nouvelle
      tentative sans un nouveau feu vert explicite — les URLs des 2
      portraits fraîchement générés n'ont pas été conservées ici
      (expirent aussi en 24h) ; une reprise future devra les régénérer à
      nouveau si plus de 24h se sont écoulées.
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
      2026-08-16 : le repli hors-ligne **vérifié en conditions réelles**
      pour la première fois (Chromium headless, `context.setOffline`),
      jamais testé bout-en-bout jusqu'ici — seulement relu au code. 1re
      visite : `sw.js` ne peut RIEN mettre en cache (il s'enregistre
      après l'événement `load`, donc ne contrôle pas encore la toute
      première navigation ni ses assets — caractéristique du cycle de
      vie standard des service workers, pas un bug de ce dépôt). 2e
      visite EN LIGNE (le SW contrôle déjà la page) : navigation + CSS +
      JS + une icône correctement mis en cache, confirmé en inspectant
      `caches.open('coach-arena-v1').keys()` directement. 3e visite HORS
      LIGNE : succès, l'écran titre s'affiche intégralement (capture à
      l'appui), pas une page d'erreur navigateur. Concrètement peu
      limitant pour un vrai joueur : le prompt d'installation PWA
      n'apparaît lui-même qu'après un premier chargement réussi (le SW
      est donc déjà actif au moment où l'appli installée est rouverte).
      Aucun code changé — vérification pure, comportement confirmé
      conforme à l'intention documentée dans `sw.js` (« network-first
      avec repli cache »).
- [x] Parcours 100 % clavier vérifié bout-en-bout pour la première fois
      (Chromium headless, micro/caméra refusés d'emblée pour forcer le
      vrai repli documenté au README) — jusqu'ici seulement déduit du
      code (chaque élément cliquable est un vrai `<button>`, confirmé
      lors de l'audit d'accessibilité), jamais réellement joué au
      clavier. Titre → Sélection de perso (Tab jusqu'à une `CharCard`,
      Entrée, `aria-pressed` confirmé) → confirmation du deck → Vestiaire
      (bouton « gong » atteint et activé au clavier) → Arène (ordres
      A/D/E/C envoyés en vrai combat, un round entier joué en temps réel
      jusqu'au Coin du ring) → sélection d'un plan tactique dans l'overlay
      (Tab jusqu'à une carte, Entrée, `aria-pressed` confirmé). Zéro clic
      souris du début à la fin, zéro erreur JS. Un vrai piège trouvé en
      route, mais dans le SCRIPT DE VÉRIFICATION lui-même, pas le jeu :
      `element.innerText` reflète les transformations CSS
      (`text-transform: uppercase` sur `.btn`/`h2`), donc chercher
      `'Coin du ring'` en respectant la casse échouait alors que l'overlay
      était bel et bien affiché — corrigé en comparant en minuscules.
      Seule observation notée (pas un bug, pas corrigé sur le moment) :
      atteindre le bouton de confirmation du deck prend 62 appuis Tab
      (le deck-builder a ~20 cartes × 2 boutons −/+ chacune) — un peu
      long pour un joueur 100 % clavier, mais pas cassé. Aucun code
      changé — vérification pure.
- [x] Friction clavier de l'observation précédente corrigée : un lien
      d'évitement (« ⏭️ Passer la composition du deck, aller à la
      confirmation ») posé juste avant les ~40 boutons −/+ du
      deck-builder, invisible tant qu'il n'a pas le focus (patron
      standard des « skip links »), sautant directement au bouton de
      confirmation quand activé. Un joueur souris/tactile ne le voit
      jamais ; un joueur 100 % clavier qui accepte le deck par défaut
      peut sauter les ~40 boutons d'un coup au lieu de les Tab-er un par
      un. Vérifié en conditions réelles via Chromium headless + vraies
      touches clavier (pas juste la présence de l'attribut/classe) :
      hors-écran avant focus, visible et lisible une fois focus (capture
      à l'appui), et son activation déplace bien le focus sur le bouton
      de confirmation. Capture avant/après confirmant zéro régression
      visuelle pour le flux souris. `tsc --noEmit` + `npm run build` +
      130 tests vitest inchangés (pur ajout de markup, aucune logique
      touchée).
- [x] Contraste WCAG des couples texte/fond du thème, jamais vérifié
      jusqu'ici — dimension d'accessibilité distincte des audits
      ARIA/clavier précédents. Calculé la luminosité relative + le ratio
      de contraste pour tous les couples couleur-de-texte/fond du thème
      (`--text`/`--muted`/`--accent`/`--accent2`/`--violet` sur
      `--bg`/`--panel`/`--panel2`) **et** les 6 couleurs de marque du
      roster utilisées comme texte (nom du perso dans `CharCard`).
      2 défauts réels trouvés, tous deux corrigés :
      1. `--violet` (coûts de carte « ●●● ») à 4,42:1 sur `--panel2` —
         sous le seuil AA de 4,5:1 pour du texte normal (16,8 px/900,
         sous le seuil de « grand texte » qui se contenterait de 3:1).
         Éclairci légèrement dans `styles.css` (même teinte, 4,77:1).
      2. Rei (`#6c5ce7`, 3,34:1) et Gorō (`#636e72`, 3,09:1) — les noms
         de perso dans `CharCard` (`.cname`, 16,8 px/900, même seuil de
         4,5:1) tombaient nettement sous la barre, un vrai problème de
         LISIBILITÉ pour TOUS les joueurs (pas seulement lecteur
         d'écran), contrairement aux corrections ARIA précédentes.
         Corrigé avec `readableTextColor(hex, bgHex, minRatio=4.5)`,
         nouvelle fonction pure exportée de `characters.ts` : éclaircit
         une couleur juste assez pour atteindre le ratio requis (mélange
         progressif vers le blanc, garde la teinte), appliquée
         UNIQUEMENT au rendu du texte (`char.color` reste inchangé pour
         le silhouette du perso dans l'arène — `arenaRenderer.ts` n'est
         pas concerné par des règles de contraste texte). Couvre aussi
         gratuitement les couleurs arbitraires des persos créés par
         prompt (`createFromPrompt`), pas seulement les 6 du roster.
         `ReadyScreen.tsx` (noms au format VS) volontairement NON touché :
         20,8 px/900 y dépasse le seuil de « grand texte » WCAG (18,66 px
         gras), donc 3:1 suffit et Rei/Gorō le passent déjà (4,04 et
         3,74) sans correction.
      Vérifié en conditions réelles, pas supposé : capture Chromium +
      lecture directe de `getComputedStyle(...).color` sur les vrais
      noms rendus, contraste recalculé sur les valeurs RGB effectives
      (4,60:1 et 4,66:1) — pas seulement sur la sortie de la fonction en
      isolation. 4 nouveaux tests (dont un qui balaie toute la palette du
      roster). engine.test.ts 130 → 134. `tsc --noEmit` + `npm run
      build` verts.
- [x] `prefers-reduced-motion` (WCAG 2.3.3, « Animation from
      Interactions ») — 3e dimension d'accessibilité distincte des deux
      précédentes (ARIA/clavier, puis contraste couleur), jamais adressée :
      le jeu a un vrai screen shake (7 à 34px selon l'impact) et un zoom
      dramatique brutal (jusqu'à ×1,32, poussé en 20 % du temps puis
      relâché) déclenchés sur chaque coup et surtout sur spécial/ulti —
      exactement le type de mouvement soudain, non essentiel au jeu, que
      WCAG 2.3.3 demande de pouvoir désactiver (mal des transports,
      troubles vestibulaires). `grep -rn "prefers-reduced-motion"` sur
      `src/` confirmait qu'aucune gestion n'existait nulle part. Ajout
      d'un champ `reducedMotion` sur `ArenaRenderer` (`render/
      arenaRenderer.ts`), lu une fois à la construction via
      `window.matchMedia('(prefers-reduced-motion: reduce)').matches`
      (avec garde `typeof window !== 'undefined'`, cohérent avec le motif
      `hasStorage` déjà utilisé ailleurs dans le projet) : quand actif, le
      `ctx.translate` du shake et le `ctx.translate`/`ctx.scale` du zoom
      dramatique sont simplement sautés dans `draw()`. Le flash d'impact
      (aplat de couleur, pas un mouvement) et les speed lines de fond
      (animation continue décorative, pas déclenchée par une interaction —
      hors du périmètre de 2.3.3) sont volontairement laissés intacts :
      portée délibérément restreinte aux deux effets qui posent
      réellement un problème vestibulaire. 3 nouveaux tests unitaires
      (détection à la construction, `true`/`false`/absence de `window`
      en SSR ou en environnement de test) — la logique de saut elle-même
      est une simple garde booléenne d'une ligne, à faible risque, déjà
      couverte par `tsc`. Vérifié aussi en conditions réelles : Chromium
      headless avec `page.emulateMedia({ reducedMotion: 'reduce' })` puis
      `'no-preference'`, confirmant que `window.matchMedia(...).matches`
      reflète bien l'état émulé dans les deux sens avant de faire
      confiance à la détection côté renderer. engine.test.ts 134 → 137.
      `tsc --noEmit` + `npm run build` verts.

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
      Couverture de tests ajoutée le 2026-08-15 : dernier module
      localStorage de src/game/ sans test direct (les trois autres —
      stable.ts, progression.ts, commentator.ts — l'étaient déjà). Petit
      (52 lignes) mais même famille de piège potentiel désormais bien
      connue dans ce projet. 3 tests vitest (83 au total) : chaque bulle
      vue une seule fois (persistant, idempotent au second appel), et
      les deux bulles (combat / coin du ring) prouvées indépendantes
      l'une de l'autre — pas juste supposées.
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
      fonction en ligne). Watermark « ✨ Généré par IA » FAIT (2026-08-15,
      construit AVANT que Kling n'ait jamais atteint un vrai joueur, pas
      après) : badge affiché en haut à droite dès qu'un cut vidéo joue
      (`activeCut` non nul dans ArenaScreen), + gravé dans le canvas
      composite exporté (le badge DOM n'existe pas dans le fichier —
      même contrainte que le bandeau Temps Mort). Bibliothèque vide
      aujourd'hui → jamais affiché → zéro changement visible, vérifié en
      capture (funnel standard identique) ET avec un clip de test
      synthétique (canvas+MediaRecorder, zéro crédit Kling) confirmant le
      badge dans les DEUX rendus (DOM live + composite exporté). Restent :
      CGU/CGV formelles au moment du paiement, relecture par un juriste
      avant lancement.
- [x] Hébergement — GitHub Pages, demandé explicitement par l'utilisateur
      (« github page ? »). `vite.config.ts` : `base: '/Coach-Arena/'` (site
      de PROJET, pas un domaine dédié — servi sous un sous-chemin). Trois
      fichiers en dehors du graphe de modules Vite (donc jamais réécrits
      automatiquement par `base`) corrigés pour rester valides sous un
      sous-chemin : `public/manifest.webmanifest` (`start_url`/`scope`/
      icônes passés en chemins RELATIFS `./…`, pas absolus `/…` — sinon un
      PWA installé chercherait ses icônes à la racine du domaine, pas sous
      `/Coach-Arena/`) ; `public/sw.js` (les filtres `pathname.startsWith
      ('/assets/')`/`'/icons/'` ne matchaient plus rien sous un sous-chemin
      → repli en `.includes(...)` ; le fallback hors-ligne visait `'/'` en
      dur → `self.registration.scope`) ; `src/main.tsx` (l'enregistrement
      `register('/sw.js')` codait la racine du domaine en dur →
      `` `${import.meta.env.BASE_URL}sw.js` ``). `index.html` : `og:image`/
      `og:url` (Open Graph exige des URLs ABSOLUES, jamais résolues par un
      crawler) enfin passés du chemin relatif provisoire à la vraie URL
      GitHub Pages, maintenant connue. Vérifié en conditions RÉELLES, pas
      supposé : `dist/` copié sous un vrai sous-répertoire `Coach-Arena/`
      d'un serveur statique local, chargé via Chromium headless — zéro
      requête en échec, le service worker s'enregistre avec le SCOPE
      correct (`http://localhost:5199/Coach-Arena/`, pas la racine),
      capture d'écran confirmant le rendu complet du Titre. `npm run dev`
      local inchangé dans les faits (redirection 302 automatique de `/`
      vers `/Coach-Arena/` par le serveur de dev de Vite quand `base` est
      posé). Workflow GitHub Actions ajouté
      (`.github/workflows/deploy-pages.yml`, actions officielles
      `configure-pages`/`upload-pages-artifact`/`deploy-pages`, déclenché
      sur push vers `claude/coaching-game-voice-arena-yrja2t` — seule
      branche du dépôt — et `workflow_dispatch` manuel ; `npm test` +
      `npm run build` tournent DANS le workflow avant tout déploiement).
      **2026-08-17 : PASSÉ EN [x]** — le réglage manuel hors de portée des
      outils de cette session (Settings → Pages → Source → « GitHub
      Actions ») a enfin été fait côté utilisateur, après ~26 runs
      échoués sur ~10 heures de vérifications de routine (chaque échec
      confirmait précisément la même cause : `configure-pages@v5` ❌, site
      Pages introuvable, jamais un problème de code). Le run #27
      (2026-08-17T10:27:33Z, déclenché par le push du commit `8af7ccc`)
      est le premier `success` — `npm test` ✅, `npm run build` ✅,
      `configure-pages`/`upload-pages-artifact`/`deploy-pages` tous ✅.
      Le jeu est maintenant en ligne à
      `https://mordrak44.github.io/Coach-Arena/`. Non vérifié visuellement
      dans ce sandbox : le proxy de sortie réseau bloque
      `mordrak44.github.io` (politique d'environnement, pas un problème du
      site) — la confirmation vient du statut `success` de l'action
      GitHub officielle elle-même, qui ne le rapporte qu'après acceptation
      réelle de l'artefact par Pages, pas d'une supposition.
- [ ] Analytics funnel (arrivée → match 1 → match 3 → achat)
- [x] Couverture de tests par rapport de coverage (`@vitest/coverage-v8`,
      `npm run coverage`) — angle différent des rounds d'audit
      code-review précédents (ceux-là cherchent des bugs ; celui-ci
      cherche du code jamais exercé du tout, correct ou non). Plus gros
      écart trouvé : `cardForge.ts` (persistance de la Forge,
      `saveForgedCard`/`loadForgedCards`, jamais testée) à 43 % de
      couverture — une vraie fonctionnalité joueur (les cartes forgées
      par prompt survivent aux sessions) sans AUCUN test. Root cause du
      piège découvert en écrivant les tests : `cardForge.ts` était
      importé STATIQUEMENT en tête d'engine.test.ts (`import {
      forgeCard } from './cardForge'`), donc son `hasStorage` interne se
      figeait à `false` AVANT même le premier `beforeEach` du fichier —
      même piège que stable.ts/progression.ts (module chargé une seule
      fois, `hasStorage` calculé à ce moment précis), mais cette fois
      caché par un import statique préexistant plutôt qu'un import
      dynamique mal placé. Résolu en retirant l'import statique et en
      ajoutant un `beforeEach` (faux localStorage) à la describe
      « création par prompt » — la première à toucher cardForge dans
      l'ordre du fichier — pour que son tout premier `import()`
      dynamique voie déjà un stockage disponible. 6 nouveaux tests
      verrouillent maintenant : le round-trip save→load, l'ordre
      (plus récent en tête), le plafond MAX_FORGED=8 (les plus
      anciennes tombent), le re-clamp à la relecture (protège contre un
      drift de version passée sur une carte déjà sauvegardée), un
      stockage corrompu (JSON valide, pas un tableau — ne plante pas),
      et un échec d'écriture (quota dépassé). engine.test.ts 100 → 106.
      `@vitest/coverage-v8` gardé en devDependency (`coverage/` ajouté
      au `.gitignore`) pour la prochaine passe de ce genre. `tsc
      --noEmit` + `npm run build` + suite complète verts.
      2026-08-16 (suite) : deuxième cible du même rapport, characters.ts
      (54 % → 86 %, branches 57 % → 100 %). 4 chemins jamais exercés :
      `pickOpponent` (jamais testé directement, contrairement à
      `pickOpponentTeam` du round 8) ; le RÉÉQUILIBRAGE des stats vers
      26 quand plusieurs règles de `createFromPrompt` cumulent trop de
      bonus (garde-fou d'équilibrage central, jamais déclenché par
      aucun prompt de test jusqu'ici) ; le repli `ARCHETYPE_TRAIT` de
      `deriveTrait` quand aucun mot-clé de trait n'apparaît dans le
      prompt (seul l'archétype le détermine alors) ; et la génération de
      nom par syllabes d'`extractName` quand le prompt ne contient pas
      « appelé/nommé X ». 4 nouveaux tests (106 → 110, stables sur 5
      exécutions malgré le hasard des tirages), `tsc --noEmit` + `npm
      run build` verts. combat.ts (72 %) reste le plus gros écart
      restant mais son test réel est le sim `scripts/sim.ts` (des
      milliers de matchs joués), pas des unit tests ligne par ligne —
      laissé tel quel plutôt que d'écrire des tests qui dupliqueraient
      artificiellement ce que la simulation couvre déjà en pratique.
- [x] Troisième cible du rapport de coverage : deckBuilder.ts, 69 % →
      91 %. **Bug réel trouvé** en écrivant le test de round-trip de
      `loadTemplate`/`saveTemplate` : un stockage contenant du JSON
      valide mais de mauvaise FORME (un simple nombre ou une chaîne, ex.
      `"42"`) ne faisait planter ni `JSON.parse` ni `sanitizeTemplate`
      (l'accès par index sur un nombre/une chaîne renvoie `undefined` en
      JS, jamais d'exception) — chaque carte retombait silencieusement à
      0 copie au lieu du modèle par défaut, un deck vide et invalide
      sans raison visible. Même classe de bug que stable.ts (round 6
      d'audit), trouvée cette fois par un test de couverture plutôt que
      par le skill code-review. Corrigé avec la même validation de forme
      avant `sanitizeTemplate`. 5 nouveaux tests (110 → 112).
- [x] Quatrième cible du rapport de coverage : story.ts, 64 % → 93 %.
      **Encore un bug réel trouvé** dans `loadCleared` (progression du
      mode Histoire, quels chapitres sont vaincus) : `new Set(JSON.parse
      (raw))` sans validation de forme — une chaîne stockée (ex.
      `'"oops"'`) EST itérable en JS (une chaîne s'itère caractère par
      caractère), donc `new Set("oops")` ne plante PAS comme le ferait
      `new Set(42)` ou `new Set({})` : ça produisait silencieusement un
      Set de caractères isolés (`{'o','p','s'}`) au lieu de repartir
      d'une progression vide. Troisième occurrence de cette même classe
      de bug (stable.ts au round 6 d'audit, deckBuilder.ts la veille) —
      chaque fois une valeur JSON PRIMITIVE (nombre, chaîne) qui traverse
      une opération censée planter sur un mauvais type mais qui, en JS,
      ne plante que pour CERTAINS types primitifs, pas tous. Corrigé en
      validant `Array.isArray(parsed)` avant de construire le Set (même
      patron que le fix deckBuilder.ts). 4 nouveaux tests (112 → 116).
- [x] Balayage PROACTIF de tous les `JSON.parse` du dépôt (au lieu
      d'attendre que la coverage ou l'audit en révèle un de plus un par
      un) — après 3 occurrences de la même famille de bug en 3 jours,
      vérifié chaque site restant plutôt que de continuer à les découvrir
      au hasard. 2 vrais bugs supplémentaires trouvés, TOUS DEUX CONFIRMÉS
      PAR UN TEST QUI ÉCHOUE avant le fix (discipline systématique) :
      1. **`onboarding.ts`, `load()`** : `JSON.parse('null')` = `null`
         sans exception — l'accès `.combat`/`.corner` a lieu chez
         l'APPELANT (`hasSeenCombatHint`), hors du try/catch de `load()`.
         Un stockage corrompu par la chaîne littérale `"null"` aurait
         planté le tout premier rendu d'`ArenaScreen` (appelé en
         SYNCHRONE dans ses `useState`/`useRef` initiaux — pas de
         deuxième chance, l'écran ne s'affiche jamais). Confirmé par
         test avant fix : `TypeError: Cannot read properties of null
         (reading 'combat')`.
      2. **`progression.ts`, `readJson<T>`** : même défaut générique,
         touchant DEUX call sites à la fois — `getProgress`/`recordResult`
         (`map[charId]` plante sur `null`) et `loadCustoms` (`for...of
         customs` plante sur `null`/nombre — pas itérables — ET sur une
         chaîne comme `"oops"` : itérable, mais la migration Ulti qui
         suit tente d'ASSIGNER une propriété à un caractère de string,
         ce qui lève `TypeError: Cannot create property 'ulti' on
         string 'o'` en mode strict). Confirmé par 2 tests avant fix.
      Fix commun aux deux : valider la FORME du JSON parsé (objet pour
      onboarding.ts/PROG_KEY, tableau pour CUSTOM_KEY — `readJson`
      déduit laquelle attendre du type runtime de son propre paramètre
      `fallback`) avant de le renvoyer, plutôt que de compter sur le
      try/catch existant qui ne couvre que l'ÉTAPE DE PARSING, pas les
      opérations faites par l'appelant sur le résultat. 4 nouveaux tests
      (116 → 120, stables sur 5 exécutions), `tsc --noEmit`/`npm run
      build` verts. Tous les `JSON.parse` du dépôt sont maintenant soit
      déjà sûrs par construction (cardForge.ts — vérifié : ses opérations
      internes plantent bien sur TOUTE forme corrompue, y compris les cas
      qui avaient piégé les autres fichiers), soit corrigés.
- [x] Cinquième cible du rapport de coverage : cardForge.ts, 65 % → 94 %.
      Seules 5 des 14 règles de la Forge (soigne/contre/cri/rage +
      contrôles négatifs) étaient exercées par les tests existants — les
      9 autres, et les cas de `describe()` (le texte affiché au joueur)
      qu'elles déclenchent, restaient un angle mort complet : aucune
      garantie que « une carapace protectrice » produise bien une carte
      de réduction de dégâts avec le bon texte, par exemple. 2 nouveaux
      tests couvrent maintenant les 9 règles manquantes (kind ET texte de
      description vérifiés pour chacune) et la branche `condition` de
      `deriveTiming` (jamais atteinte non plus, faute d'avoir déclenché
      un des 5 effets conditionnels). Rien de cassé trouvé cette fois — un
      résultat normal et sain d'un balayage de couverture, pas tous ne
      révèlent un bug. engine.test.ts 120 → 122, `tsc --noEmit`/`npm run
      build` verts, stable sur 3 exécutions.
- [x] Sixième cible du rapport de coverage : sceneDirector.ts, 76 % →
      88 %. `momentPrompt`/le calcul de `by` gèrent 4 `CombatEvent.kind`
      (ulti/special/countered/hit) mais seuls ulti et hit (crit) étaient
      exercés — special et countered, jamais. Ce sont exactement les deux
      kinds qui utilisent la branche `by` générique (`c.e.by === 'enemy'
      ? enemy : player`) plutôt que la branche spéciale de `hit` corrigée
      au round 8 d'audit — un bon candidat pour vérifier qu'elles n'ont
      pas le même genre de défaut. 2 nouveaux tests confirment le bon
      référencement de perso pour un `special` adverse et un `countered`
      du joueur (rien de cassé trouvé), plus 1 test pour les branches
      `purple`/`pink` de `colorWord`, jamais atteintes non plus. Les 2
      dernières lignes non couvertes (110, 174) sont du code défensif
      structurellement inatteignable (les branches `default` de
      `momentPrompt`/du switch `by`, jamais visitées vu que l'appelant ne
      passe que des events déjà filtrés par `eventScore > 0`) — laissées
      telles quelles plutôt que forcées artificiellement. engine.test.ts
      122 → 125, `tsc --noEmit`/`npm run build` verts, stable sur 3
      exécutions.
- [x] Septième et dernière passe : nettoyage des petits écarts épars
      restants sur tout le dépôt plutôt qu'un gros fichier isolé —
      `characters.ts` (100 %, 6 dernières règles de `RULES` jamais
      exercées : fragile/feu/ombre/lumière/cyborg/bête), `cards.ts`
      (100 %, `getCustomCards()` jamais testé directement + branche
      `drainSouffle` de `clampEffect`), `sceneQueue.ts` (97 %, le chemin
      `.catch()` d'un submitter qui REJETTE une vraie exception — jamais
      exercé, tous les tests précédents ne couvraient que l'échec
      « propre » `resolve(null)` ou le timeout), `stable.ts` (98 %,
      `desireText()` jamais appelée alors qu'elle est utilisée en
      production dans `CharacterSelect.tsx`, + une vraie erreur de
      SYNTAXE JSON distincte du cas « mauvaise forme » déjà couvert).
      Rien de cassé trouvé cette fois. Couverture globale du dépôt :
      84 % → 86 % (lignes : 87,6 %). engine.test.ts 125 → 130, `tsc
      --noEmit`/`npm run build` verts, stable sur 4 exécutions. Piège
      débusqué en écrivant le test `desireText` : appeler `getStable`
      avec un trait DIFFÉRENT de celui du perso testé désynchronise le
      pool d'envies tiré de celui que `desireText` relit ensuite via
      `char.trait` — corrigé en passant `ROSTER[0].trait` explicitement
      plutôt qu'un trait choisi au hasard.
      **Avec cette passe, la série de coverage systématique touche à sa
      fin** : le seul écart notable qui reste est `combat.ts` (72 %),
      délibérément laissé de côté car son test réel est `scripts/sim.ts`
      (des milliers de matchs simulés), pas des tests unitaires ligne
      par ligne.
- [x] Premier audit d'accessibilité du dépôt (jamais fait jusqu'ici,
      angle différent des rounds de code-review et des passes de
      coverage — pas des bugs de logique ni des lignes non testées, mais
      « qui peut jouer à ce jeu »). Délégué à un agent Explore en lecture
      seule sur les 7 fichiers `src/ui/` : chaque élément cliquable
      s'est révélé être un vrai `<button>` avec gestion clavier native
      (zéro `div onClick` factice) — le vrai manque était les NOMS
      accessibles et les ÉTATS. 8 points trouvés, 7 corrigés (le 8e,
      un flux `aria-live` complet PV-par-PV pour le canvas de combat,
      volontairement laissé pour un chantier séparé plutôt que fait à la
      hâte — voir juste en dessous) :
      - `CharCard` (sélection de perso) et les cartes de plan tactique
        (coin du ring) : état sélectionné signalé seulement par une
        bordure colorée, invisible en lecteur d'écran → `aria-pressed`
        ajouté aux deux.
      - `StatBar` (ATK/DEF/SPD/❤ dans les fiches perso) : la valeur
        numérique n'existait qu'en largeur de barre visuelle → `aria-
        label` avec la vraie valeur sur 12.
      - Les boutons −/+ de copies dans le deck-builder (un par carte du
        pool) : glyphes seuls, aucune indication de QUELLE carte chacun
        affecte → `aria-label` dynamique par carte.
      - Le bouton de soumission de la Forge (icône ⚒ seule) et les 3
        champs texte (nom guidé, description libre, prompt de forge de
        carte) qui ne s'appuyaient que sur `placeholder` (jamais fiable
        comme nom accessible, disparaît à la saisie) → `aria-label` sur
        les quatre.
      - La tuile du coach adverse (`ArenaScreen`) : l'humeur passe
        souvent par un emoji seul sans bulle de texte (spécial déclenché,
        round gagné/perdu…) — un signal de jeu réel totalement invisible
        en lecteur d'écran. Table de traduction courte emoji→phrase FR
        ajoutée, appliquée en `aria-label` sans toucher à la logique de
        jeu existante.
      - Le canvas de combat lui-même (PV, Hype, Ulti, chrono) n'avait
        NI rôle NI nom — un lecteur d'écran l'ignore complètement,
        comme s'il n'existait pas. `role="img"` + `aria-label` descriptif
        ajoutés : un filet minimal (le lecteur sait au moins que
        quelque chose s'y affiche et quoi), pas la solution complète —
        un vrai flux `aria-live` valeur par valeur reste un chantier à
        part (throttling nécessaire pour ne pas spammer les annonces à
        chaque frame), noté mais pas fait ici plutôt que bâclé.
      Vérifié en conditions réelles, pas supposé : capture Chromium
      headless (aucune régression visuelle, les deux écrans rendus à
      l'identique) + lecture directe des attributs ARIA via Playwright
      (`aria-pressed`, `aria-label` sur chaque élément listé ci-dessus,
      valeurs exactes confirmées, pas seulement leur présence). `tsc
      --noEmit` + `npm run build` + 130 tests vitest inchangés (pur
      ajout d'attributs, aucune logique touchée).
- [x] Audit de `scripts/` (jamais couvert par les 8 rounds précédents,
      qui ne ciblaient que `src/`) : `sim.ts`, l'outil d'équilibrage, et
      `shot.mjs`, le funnel de captures. **Un vrai bug de données trouvé**
      dans `sim.ts` : la simulation « Coach absent » appelait quand même
      `chooseTacticPlan(m, 'pressure')` à chaque pause tactique — alors
      que dans le vrai jeu, un coach absent ne clique jamais de plan
      (`ArenaScreen` n'appelle cette fonction que sur un clic explicite),
      laisse `m.plan` à `null`, et `combat.ts` retombe sur `'coldblood'`
      au timeout (`startNextRound(m, m.plan ?? 'coldblood')`), pas
      `'pressure'`. Le chiffre « Coach absent » affiché par le script
      mesurait donc en réalité un coach qui garde la voix silencieuse
      mais choisit quand même la posture la plus agressive à chaque
      pause — invalidant en silence toute la comparaison coaché/absent
      qui est la RAISON D'ÊTRE de cet outil d'équilibrage. Corrigé en
      gatant l'appel sur `opts.coached`. Effet mesuré, pas supposé :
      le winrate « Coach absent » chute de ~40-50 % (estimation d'avant
      fix, jamais un vrai signal) à 20 % après fix — un contraste
      beaucoup plus net et cohérent avec l'intention du test. Deux
      nettoyages supplémentaires : le test de la Forge dans `sim.ts`
      avait la SEULE boucle du fichier sans plafond d'itérations (les
      deux autres plafonnent et lèvent une erreur claire plutôt que de
      tourner indéfiniment) — même garde-fou ajouté ; `shot.mjs`
      fermait le navigateur Chromium seulement sur le chemin de succès
      (fuite de process si une capture échoue en cours de route) et
      n'avait aucun listener d'erreur sur le process `vite preview`
      lancé (un `spawn` qui échoue plantait avec une trace opaque) —
      les deux corrigés. Vérifié en conditions réelles : `npx tsx
      scripts/sim.ts` tourne jusqu'au bout sans erreur (« OK — tous les
      matchs se terminent »), et `node scripts/shot.mjs` régénère les 7
      captures du funnel standard avec succès — confirme au passage que
      le récent changement de `base` (hébergement GitHub Pages) n'a
      RIEN cassé ici : Vite préserve la query string (`?demo=fast`) sur
      sa redirection 302 de `/` vers `/Coach-Arena/`, donc les URLs
      codées en dur dans `shot.mjs` fonctionnent toujours sans
      modification. `tsc --noEmit`/`npm run build`/130 tests vitest
      inchangés (fichiers `scripts/` hors du périmètre `tsconfig.json`,
      vérifiés par exécution réelle plutôt que par le compilateur).

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
- [x] Audit de code (fichier entier) sur `App.tsx` (2026-08-18) : 2 vrais
      bugs corrigés — `pickOpponent` n'excluait que l'id du joueur, pas
      son équipe (miroir possible contre son propre équipier de banc,
      même défaut déjà corrigé sur `pickOpponentTeam` le 2026-08-16 mais
      jamais répercuté ici) ; et le bouton « Revanche » (mode Rapide)
      re-tirait un adversaire complètement aléatoire au lieu de refaire
      le même combat, contredisant son propre nom (le mode Histoire avait
      déjà le bon comportement, déterministe via `chapterOpponent`).
      3e trouvaille notée mais NON corrigée (décision produit, pas un
      bug) : `ReadyScreen` (le Vestiaire) n'a aucun bouton retour vers la
      sélection de perso.
- [x] `ReadyScreen` (Vestiaire) : ajout du bouton « ← Retour » manquant,
      seul écran du funnel qui n'en avait pas — incohérence relevée lors
      de l'audit `App.tsx` du 2026-08-18, reconsidérée comme un vrai trou
      de navigation (le joueur pouvait se retrouver bloqué au Vestiaire
      sans pouvoir changer de perso) plutôt qu'une pure décision produit.
      Revient vers `select` en mode Rapide, vers `story` en mode Histoire
      (même patron que `onNewChar` sur `ResultsScreen`).
- [x] `systems/recorder.ts` fermé à 100 % (branches 79,24 % → 100 %) :
      chunks `ondataavailable` de taille 0 jamais accumulés (garde-fou
      `size > 0` jamais exercé côté faux, ni pour `MatchRecorder` ni pour
      `HighlightRecorder`), résolution `null`/`prevBlob` quand un
      segment s'arrête sans avoir produit de données, et repli
      `rec.mimeType || 'video/webm'` jamais exercé côté vide (3 sites :
      `MatchRecorder.stop()`, `HighlightRecorder.rotate()`,
      `HighlightRecorder.stop()`) + même repli sur `blob.type` dans
      `shareOrDownload`. Aucun bug trouvé, code déjà correct sur les 8
      cas testés.
- [x] `systems/sound.ts` fermé à 100 % (branches 87,03 % → 100 %) :
      `start()` idempotent (2e appel sans effet — jamais exercé),
      `resume()` débloquant vraiment un contexte `suspended` (tous les
      tests précédents avaient un ctx déjà `running`), `setMuted()` avec
      un vrai contexte (le seul test tournait sans `AudioContext`,
      `master` toujours `null`), `startCrowd()` (privée) appelée
      directement sans ctx/master pour exercer son garde-fou défensif
      normalement inatteignable via l'usage réel, et le seuil anti-
      ré-écrasement de `setCrowdHype()` (variation < 0,005 → aucune
      rampe reprogrammée). Aucun bug trouvé.
- [x] `systems/voice.ts` fermé à 100 % sur les 4 métriques (branches
      85,18 % → 100 %, fonctions 91,66 % → 100 %) : résultat de reco
      vocale à texte vide (espaces seuls) bien ignoré, y compris pour le
      compteur de finalisations ; un texte reconnu mais sans commande
      détectée (aucun pattern) laisse `pendingCommand` INCHANGÉ — une
      commande déjà en attente n'est pas effacée par une phrase
      hors-sujet, comportement confirmé voulu ; la boucle de volume
      s'arrête bien net dès `stopped=true` même si une frame restait
      programmée ; sans `timeBuf`, la boucle continue de mesurer le
      volume mais saute la prosodie ; et `audioCtx.close()` qui rejette
      au `stop()` est absorbé silencieusement (même patron que
      `SoundSystem`). Aucun bug trouvé.
- [x] `systems/` (facecam.ts, pitch.ts) fermés à 100 % — TOUT le dossier
      `systems/` (facecam, pitch, recorder, sound, voice) est désormais à
      100 % sur les 4 métriques. Fermé sur `facecam.ts` (branches 80 % →
      100 %) : la décroissance douce de l'énergie de mouvement quand le
      changement de pixels retombe sous l'énergie courante (seule la
      montée était testée) ; et la construction via `OffscreenCanvas`
      quand disponible (Chrome/Edge récents), jamais exercée dans un
      sandbox qui ne l'a pas, seul le repli `<canvas>` l'était. Fermé sur
      `pitch.ts` (branches 95,45 % → 100 %) : un lag dont la fenêtre de
      corrélation tombe entièrement à zéro (den=0, cas réel en bord de
      buffer) est bien ignoré sans produire de NaN. Aucun bug trouvé.
- [x] `game/deckBuilder.ts` : branches 86,95 % → 95,65 %, dernière
      branche (`t[c.id] ?? 0` dans `buildDeckFromTemplate`) documentée
      comme structurellement inatteignable plutôt que forcée par un test
      artificiel — `sanitizeTemplate()` pose toujours une entrée
      numérique pour chaque carte du même `CARD_POOL` juste avant.
      Fermé : copies non numériques (`Number(...)` → NaN, ex. une
      valeur texte trafiquée) assainies en 0 (seuls des nombres hors
      bornes étaient testés) ; et `templateSize()` face à une valeur
      explicitement `undefined`. Aucun bug trouvé.
- [x] `game/combat.ts` : branches 88,72 % → 92,32 % (le cœur du moteur,
      gros fichier — sweep partiel, pas encore fermé à 100 %). Fermé :
      `drawEnemyCards()` remélange bien SA défausse quand sa pioche est
      vide (tous les tests précédents vidaient les DEUX zones à la fois,
      ne déclenchant que le retour anticipé, jamais le remélange) ;
      `playCard()`'s 3 garde-fous testés individuellement (mauvaise
      phase, Souffle insuffisant, carte absente de la main — seul le
      chemin de succès l'était) ; un `'cheer'` hurlé module bien la
      Hype selon le trait — ×1,5 pour un Sanguin, ×0,4 pour un Cérébral
      — jamais exercé via la commande `'cheer'` elle-même (seul le
      trickle passif testait ces traits ailleurs) ; un ordre `'counter'`
      pose la posture ET arme `counterUntil` via `tick()` (seule
      l'écriture directe de l'état l'était) ; et un ordre de POSTURE
      (`'attack'`) pendant la confusion est ignoré par son propre
      garde-fou, pas seulement celui de `'cheer'`. `mulligan()` avec un
      id absent de la main : ignoré sans planter, sans consommer l'essai
      unique. 7 nouveaux tests. Aucun bug trouvé.
- [x] `game/combat.ts` : suite du sweep, branches 92,32 % → 93,76 %.
      Fermé : `chargeUlti` déclenchant `ultiReady` côté JOUEUR par les
      DÉGÂTS DE COMBAT (le seul test 'player' passait par la perte de
      round, un point de code totalement différent) ; `applyConsigne`
      refusé hors pause/Temps Mort et avec une liste d'effets vide (seul
      le refus par `consigneUsed` déjà posé l'était) ; et surtout le
      PLAN TACTIQUE (`chooseTacticPlan`) qui n'avait jamais influencé un
      seul coup en combat dans aucun test — seule la pose de `m.plan`
      était vérifiée. Comparaison PAIRÉE sur nombres aléatoires communs
      (LCG remis à la même graine avec/sans plan, patron déjà utilisé
      pour le bruit ailleurs dans ce fichier) : élimine le bruit
      esquive/critique qui faisait flipper le signe du résultat d'une
      exécution à l'autre en tirage libre, sans neutraliser
      artificiellement le hasard du combat. Aucun bug trouvé.
- [x] `game/combat.ts` : suite du sweep, branches 93,76 % → 96,16 %.
      Fermé : l'Ulti exige AUSSI sa jauge pleine (seul le cas « prêt »
      l'était, contrairement au spécial dont les 2 cas le sont) ; Cœur
      Vaillant incrémente son compteur SANS déclencher le bonus tant que
      le seuil n'est pas atteint (seul le cas « atteint pile » l'était) ;
      un attaquant confus inflige ×0,7 de dégâts (distinct du garde-fou
      anti-spam des ORDRES confus, déjà testé) ; un défenseur confus
      esquive moins bien (`-0,08` sur sa chance) ; la Frénésie (Fang)
      amplifie VRAIMENT les dégâts une fois active (les tests existants
      ne vérifiaient que son armement, jamais sa consommation) ; un
      contre SANS bonus armé frappe quand même, juste sans les procs de
      carte ; et un Cérébral en ordre de POSTURE (pas seulement `'cheer'`,
      qui a sa PROPRE branche cérébrale distincte) est stressé s'il est
      hurlé et transcendé s'il est calme. 8 nouveaux tests. Documenté en
      commentaire plutôt que forcé : le garde-fou `if (stance)` est
      structurellement toujours vrai (cheer/special/ulti déjà retournés
      plus haut, les 4 commandes restantes couvrent exactement les clés
      de `COMMAND_STANCE`). Aucun bug trouvé.
- [x] `game/combat.ts` : suite du sweep, branches 96,16 % → 97,36 %.
      Fermé : le texte « Leçon d'Expérience » côté JOUEUR (sans suffixe
      ADVERSE, seul le cas symétrique ennemi l'était) ; les paliers
      manquants de `enemyCardValue` (`'heal'` intermédiaire 15-35 % PV,
      `'hype'` déjà ≥ 75) ; une posture agressive booste VRAIMENT le
      taux de critique (+0,08 — comparaison statistique sur 400 tirages,
      aucun test existant ne mesurait l'EFFET malgré plusieurs qui
      POSAIENT `stance='aggressive'`) ; et la relève adverse (banc) sur
      ses 2 cas jamais couverts : l'actif encore assez frais (≥ 35 % PV)
      ne switch pas même avec un remplaçant en pleine forme, et un banc
      réduit à un seul remplaçant déjà KO ne switch pas non plus. 5
      nouveaux tests. Aucun bug trouvé.
- [x] `game/combat.ts` CLÔTURÉ : branches 97,36 % → 99,52 % (100 %
      statements/fonctions/lignes). Fermé : posture DÉFENSIVE, l'attaque
      automatique est parfois carrément SAUTÉE (45 %), pas juste amortie
      (seule l'atténuation était testée) ; perte de round côté ENNEMI
      déclenche aussi `ultiReady` (seul le côté joueur l'était) ; une
      Ulti DÉJÀ UTILISÉE ne se recharge pas à la perte d'un round ;
      `forceRoundTimeout` tranche aussi en faveur du camp adverse quand
      son ratio de PV est meilleur ; le coin adverse en PV critiques
      SANS carte de soin/Dernière Chance ne prend pas de temps mort ; un
      tick trop court en `roundEnd`/`tactics` ne fait pas avancer la
      phase ; et Contre Parfait armé côté adverse s'arme vraiment quand
      son coach fantôme choisit lui-même la posture `'counter'`. 2
      dernières branches documentées comme structurellement
      inatteignables plutôt que forcées (`if (clutchId)` : le garde-fou
      englobant a déjà confirmé qu'une carte qualifiante existe, en plus
      du `if (stance)` déjà documenté). 9 nouveaux tests. Aucun bug
      trouvé sur l'ensemble du sweep `combat.ts` (5 itérations,
      ~40 tests ajoutés en tout, 88,72 % → 99,52 %). `game/` global :
      98,55 % → 99,65 % stmts, branches 92,82 % → 98,2 %.
- [x] `game/sceneDirector.ts` : branches 89,61 % → 93,5 %. Fermé : un
      spécial du JOUEUR (pas seulement adverse) référence bien l'ennemi
      comme cible (`foeOf('player')` jamais exercé) ; et un round où un
      contre (score 4) est suivi d'un crit encaissé (score 3, inférieur)
      garde bien le contre comme moment fort — tous les tests précédents
      n'avaient qu'un seul candidat scorant par round, le comparateur
      `s > cur.score` ne pouvait jamais échouer. 2 branches défensives
      documentées comme structurellement inatteignables (`momentPrompt`
      n'est appelée QUE sur des events déjà scorés > 0 par `eventScore` —
      les 2 fonctions doivent rester synchronisées à la main, sans quoi
      ajouter un nouveau kind scorant sans son cas dans `momentPrompt`
      reproduirait silencieusement le bug déjà corrigé sur `hypeFull`).
      2 nouveaux tests. Aucun bug trouvé.
- [x] Audit de code (fichier entier) sur `ArenaScreen.tsx` (2026-08-18),
      `game/` étant proche de la saturation en couverture. **Vrai bug
      trouvé et corrigé, confirmé en Chromium headless (caméra factice,
      A/B avant/après)** : la facecam du joueur (« 🔴 Toi, coach ») ne
      s'affichait JAMAIS — le `<video>` n'existe dans le DOM que quand
      `camOk` est vrai (rendu conditionnel), mais `setCamOk(true)` ne
      committe pas synchronement, donc `camRef.current` était encore
      `null` au moment où `setup()` tentait d'y attacher le flux, dans
      la continuation synchrone de la même fonction async. Corrigé avec
      un `useEffect` dédié à `[camOk]`, qui se redéclenche APRÈS le
      commit qui monte le `<video>`. Vérifié : le bug reproduit à coup
      sûr sur le code d'avant-fix (`hasSrcObject: false`), corrigé après
      (`hasSrcObject: true, readyState: 4, videoWidth: 640`). 2 autres
      bugs mineurs corrigés au passage : `combatHintDismissedRef`
      rappelait `hasSeenCombatHint()` (lecture localStorage) à CHAQUE
      rendu au lieu d'une seule fois (même classe déjà fixée sur
      `matchRef`/`sysRef` dans ce même fichier — dérivé de
      `showCombatHint`, déjà calculé, au lieu de rappeler la fonction) ;
      et `moodTimer`/`procTimer` (jusqu'à 3000 ms/1600 ms) n'étaient
      jamais annulés au démontage, contrairement à `rafId` juste
      au-dessus — une fermeture entière (sys, refs, props) restait
      vivante après la sortie de l'arène jusqu'à leur déclenchement.
      Simplification en bonus : mapping du banc (`benchViewOf`) dédupliqué
      entre le changement de phase et `onSwitch`. 360 tests inchangés
      (aucun test unitaire sur les composants UI). `tsc --noEmit` +
      `npm run build` verts, funnel visuel vérifié sans régression.
- [x] Audit de code (fichier entier) sur `CharacterSelect.tsx`
      (2026-08-18), pas ciblé en profondeur depuis le round 3
      (2026-08-16). **Vrai bug trouvé et corrigé, confirmé en Chromium
      headless (A/B avant/après)** : après un forge réussi (guidé ou
      expert), le formulaire de création restait rempli à l'IDENTIQUE
      — chips toujours cochés, bouton « Donner vie à ce perso » toujours
      actif, aucune confirmation visible du succès. Un 2e clic (double-
      clic, ou le joueur qui pense que rien ne s'est passé) forgeait un
      DOUBLON avec un nouvel id aléatoire, évinçant silencieusement le
      plus ancien perso custom (`MAX_CUSTOMS=4`) — Lien inclus. Corrigé
      en réinitialisant `prompt`/`gStyle`/`gTemper`/`gWorld`/`gName`
      après un forge réussi. Vérifié : le bug reproduit à coup sûr sur
      le code d'avant-fix (bouton toujours actif, champs toujours
      remplis après le clic), corrigé après (bouton désactivé, champs
      vidés). Corrigé au passage : les boutons-chips désactivés (relève
      déjà à 2 équipiers, copie de carte déjà à 0 ou au plafond)
      gardaient un curseur `pointer` — le style inline de `chip()`
      ignorait l'état `disabled` du bouton. 360 tests inchangés. `tsc
      --noEmit` + `npm run build` verts, funnel visuel sans régression.
- [x] Audit de code (fichier entier) sur `ResultsScreen.tsx` (2026-08-18)
      — seulement survolé superficiellement avant, jamais le passage
      approfondi qui a trouvé les bugs d'`ArenaScreen.tsx`/
      `CharacterSelect.tsx` cette même itération de sweep. **4 vrais
      bugs corrigés**, tous de la même famille (cycle de vie des blob
      URL + réactivité React), 3 vérifiés en Chromium headless (clip du
      moment fort lu sans erreur console, démontage propre) : (1)
      `URL.createObjectURL` posé en effet de bord DANS un `useMemo` — un
      `useMemo` n'est censé être QUE pur ; sous `React.StrictMode`
      (actif dans `main.tsx`), l'usine est appelée 2 fois avant le
      commit, la 1re URL créée n'est jamais gardée ni révoquée : fuite
      d'un blob URL par montage en dev, exactement ce que le commentaire
      d'origine prétendait éviter. Corrigé en le déplaçant dans un
      `useEffect` (même patron que sa propre révocation, juste
      en-dessous). (2) Le bouton « Partager le KO » n'avait aucun
      garde-fou anti-double-clic : un 2e clic pendant que la feuille de
      partage native est ouverte fait rejeter `navigator.share()`, et le
      catch de `shareOrDownload()` retombe sur un TÉLÉCHARGEMENT
      silencieux en arrière-plan. Corrigé avec un état `sharing`. (3)
      Les `clipUrl` des scènes du Réalisateur (même convention que le
      highlight) n'étaient jamais révoqués — dormant tant qu'aucun vrai
      pipeline Kling n'est branché (`STUB_SCENE_SUBMITTER` actuel), mais
      latent : le jour où un vrai submitter est câblé, chaque passage
      sur cet écran fuirait un blob par scène. Corrigé proactivement,
      avant que le bug puisse jamais se manifester en prod. (4) Le
      `<details open={sceneJobs.some(...)}>` contrôlé par l'état
      rouvrait le panneau des scènes même si le joueur venait de le
      refermer à la main, dès qu'un job passait à 'ready' — React ne
      réapplique l'attribut natif que si la prop CALCULÉE change, sans
      lire l'état DOM réel. Corrigé en `<details>` non contrôlé +
      ouverture impérative une seule fois (ref + flag), sans plus jamais
      y retoucher ensuite. 360 tests inchangés. `tsc --noEmit` +
      `npm run build` verts, funnel visuel + lecture DOM du clip
      vérifiés sans régression ni erreur console.
- [x] Audit de code (fichier entier) sur `StoryScreen.tsx` (2026-08-18)
      — plus petit fichier, mais vrai bug de cohérence visuelle trouvé
      et corrigé, confirmé en Chromium headless avec un localStorage
      corrompu injecté à la main. L'emoji de statut d'un chapitre
      (`done ? '✅' : unlocked ? '🥊' : '🔒'`) donnait priorité à `done`
      sur `unlocked` : un chapitre « nettoyé » (`cleared`) mais dont le
      PRÉCÉDENT ne l'est plus (localStorage trafiqué/corrompu — jamais
      atteignable en jeu normal, où on ne peut rien « dé-nettoyer »)
      affichait ✅ « réussi » sur une carte pourtant désactivée et grisée
      à 0,45 d'opacité — contradiction visuelle directe. Corrigé en
      testant `unlocked` en premier. Vérifié : chapitre 3 forcé
      « nettoyé » sans le 2 dans `localStorage`, rechargé, affiche
      désormais 🔒 (avant le fix, il aurait affiché ✅). Simplification
      en bonus (pas un bug) : le surlignage « chapitre ouvert »
      réimplémentait `.planCard.selected` (déjà en CSS) via un style
      inline `borderColor` redondant — remplacé par la classe partagée,
      pour rester synchronisé si `.selected` évolue ailleurs dans le
      jeu. 360 tests inchangés. `tsc --noEmit` + `npm run build` verts.
- [x] Audit de code (fichier entier) sur `commentator.ts` (2026-08-18),
      pas ciblé en profondeur depuis le round 5 (2026-08-16) alors que
      `combat.ts` (sa source d'événements) a beaucoup changé depuis
      (plans tactiques, garde défensive, frénésie, mods de contre…).
      **6 vrais bugs corrigés** : le commentateur ne gérait QUE 12 des
      17 `CombatEvent` possibles — `cardProc` (Frénésie, Dernière
      Chance, Contre Parfait, Cœur Vaillant, Leçon d'Expérience, Cri de
      Guerre, Souffle volé…), `trait` (ordre du coach ignoré : Provoqué,
      Boude, T'ignore, Trop de bruit), `switch` (relève) et `timeout`
      n'avaient AUCUN `case` — chacun de ces coups de théâtre ne
      produisait jamais de commentaire, silencieusement (`default:
      return null`). Pour `cardProc`/`trait`, le texte dramatique est
      déjà entièrement écrit par `combat.ts` (ex. « DERNIÈRE CHANCE !! »)
      — juste affiché tel quel, pas de gabarit à tirer. Pour `switch`/
      `timeout`, nouveaux gabarits ajoutés. **Bug distinct, plus subtil** :
      une carte jouée par le coin ADVERSE était narrée « Le coin de
      {JOUEUR} joue… » — créditant systématiquement le joueur d'un coup
      de l'IA, alors que le nom de la carte contenait déjà le suffixe
      « (coin adverse) » qui dit l'exact contraire (l'event `'card'` n'a
      pas de champ `side`, seulement `name` — même convention déjà
      utilisée par `ArenaScreen.tsx` pour la visio des coachs, réutilisée
      ici plutôt qu'une nouvelle mécanique parallèle). Corrigé en
      détectant `.includes('adverse')` et en retirant le suffixe du nom
      affiché, avec un pool de gabarits dédié au camp adverse. Vérifié
      par un test dédié (3 sous-cas : suffixe « coin adverse », suffixe
      « temps mort adverse », et contrôle positif sans suffixe = carte
      du joueur, narration inchangée). `commentator.ts` fermé à 100 %
      sur les 4 métriques. 363 tests (+3 nets : l'ancien test « ignoré
      sans erreur » sur ces mêmes kinds, dont la prémisse était devenue
      fausse, a été réécrit en test positif). `tsc --noEmit` +
      `npm run build` verts, funnel visuel standard sans régression
      (le commentateur écrit sur le canvas, hors inspection DOM directe
      — vérification via la couverture de test exhaustive plutôt que
      pixel par pixel, cohérent avec le traitement établi du rendu
      canvas dans ce projet).
- [x] Audit de code (fichier entier) sur `stable.ts` (Vie d'Écurie,
      2026-08-18), pas ciblé en profondeur depuis le round 6
      (2026-08-16). **3 vrais bugs corrigés**, tous confirmés par
      exécution directe du module (`git stash` A/B, les 4 nouveaux tests
      échouent bien sur le code d'avant-fix) : (1) une entrée
      INDIVIDUELLE corrompue dans le stockage (ex. `{"kenta": 5}` — un
      perso avec une valeur non-objet, contrôle déjà existant sur le
      CONTENEUR entier mais pas sur chaque entrée) faisait planter
      `getStable()` en plein rendu de `CharacterSelect` : `charId in
      all` comptait la clé comme « déjà rencontré » (donc jamais
      d'envie assignée pour ce perso, à vie), PUIS l'écriture `s.dayKey
      = ...` plantait carrément (assignation de propriété sur un nombre
      primitif, mode strict des modules ES). Corrigé en validant chaque
      entrée individuellement dans `readAll()`, pas seulement le
      conteneur — une entrée invalide est écartée séparément et
      retraitée comme « jamais rencontré », le repli le plus sûr,
      cohérent avec la règle d'or du fichier (« JAMAIS punitif »). (2)
      `dayKeyOf()` dérivait le jour via `toISOString()` (UTC), pas le
      calendrier LOCAL du joueur — un joueur en UTC-8 voyait ses 3
      actions quotidiennes et sa nouvelle envie se recharger à 16h
      locales, jamais à minuit réel, contredisant directement
      l'intention documentée en tête de fichier (« 3 par jour RÉEL »).
      Corrigé en dérivant `dayKeyOf` des accesseurs LOCAUX de `Date`.
      (3) `consumeTraining()` renvoyait `trainedStat` sans valider qu'il
      vaut bien `'atk'`/`'def'`/`'spd'`/`null` — une valeur corrompue se
      serait propagée jusqu'à `fighter.stats[trained]` (App.tsx),
      `undefined + 1 = NaN`, corrompant silencieusement toutes les stats
      de combat du perso pour le match entier. Corrigé en validant la
      valeur juste avant de la renvoyer (mais toujours consommée/effacée
      du stockage, corrompue ou pas). `stable.ts` fermé à 100 % sur les
      4 métriques. 4 nouveaux tests. `tsc --noEmit` + `npm run build`
      verts.
- [x] Audit de code (fichier entier) sur `progression.ts` (Lien/paliers,
      2026-08-18) — même famille de bugs que `stable.ts` juste avant,
      trouvée en balayant les fichiers voisins persistés en
      `localStorage`. **3 vrais bugs corrigés**, tous confirmés par
      exécution directe du module contre un stockage fabriqué à la
      main, puis par `git stash` A/B (les 3 nouveaux tests échouent bien
      sur le code d'avant-fix) : (1) `loadCustoms()` ne validait que le
      TABLEAU lui-même, pas ses ÉLÉMENTS — un élément corrompu
      (`[null]`) plantait la boucle de migration Ulti dès le montage de
      `CharacterSelect`. (2) `getProgress`/`recordResult`/`claimReward`
      ne validaient que le CONTENEUR du magasin de progression, pas
      chaque ENTRÉE — une entrée corrompue (`{"kenta": "oops"}`) faisait
      planter `recordResult()` (`p.wins++` sur une primitive, mode
      strict), appelée après CHAQUE match. (3) `getExtraCopies()` et
      `claimReward()` traitaient `extraCopies` comme un tableau via
      `?? []` sans vérifier que c'EST un tableau — une valeur corrompue
      mais non-nulle passait telle quelle jusqu'au deck-builder, prête à
      s'épandre caractère par caractère dans le deck du joueur. Corrigé
      avec le même patron que `stable.ts` : validation par entrée dans
      `readAll`/les accesseurs, jamais punitif (une entrée invalide est
      juste écartée, pas tout le magasin). `progression.ts` fermé à
      99 %/98,4 % (seule branche restante déjà documentée comme
      structurellement inatteignable — preuve FNV-1a d'une session
      antérieure). 3 nouveaux tests + 1 extension d'un test existant
      (2e réclamation réelle sur `claimReward`, jamais exercée). 370
      tests, suite vérifiée sur 3 exécutions consécutives. `tsc
      --noEmit` + `npm run build` verts.
- [x] Audit de code (fichier entier) sur `cardForge.ts` (persistance des
      cartes forgées par prompt, 2026-08-18) — 3e fichier de la même
      famille de bugs (après `stable.ts`, `progression.ts`), trouvé en
      continuant le balayage systématique des modules persistés en
      `localStorage`. **2 vrais bugs corrigés**, confirmés par exécution
      directe du module contre un stockage fabriqué à la main, puis par
      `git stash` A/B (les 2 nouveaux tests échouent bien sur le code
      d'avant-fix) : (1) `loadForgedCards()` ne validait que le TABLEAU
      stocké, pas ses ÉLÉMENTS — un seul élément corrompu (`[null,
      "oops", carteValide]`) faisait planter `c.effects` DANS le même
      try/catch que le `JSON.parse`, donc `catch { return [] }` jetait
      TOUT le lot, y compris les cartes valides. (2) `saveForgedCard()`
      ne validait pas que la valeur parsée était bien un tableau avant
      `.unshift()` — un stockage corrompu de FORME (ex. `{}`) faisait
      planter l'unshift, capturé par le même try/catch, donc la carte
      que le joueur VIENT de forger n'était JAMAIS persistée (jouable la
      session courante via `registerCustomCard`, perdue au rechargement)
      — silencieux, sans erreur visible. Corrigé avec le même patron que
      `stable.ts`/`progression.ts` : un helper `isValidForged()` +
      `.filter()` sur les éléments dans `loadForgedCards()`,
      `Array.isArray()` avant `.unshift()` dans `saveForgedCard()` —
      jamais punitif, un élément invalide écarté plutôt que tout le
      magasin perdu. 2 nouveaux tests. 372 tests, suite vérifiée sur 3
      exécutions consécutives. `tsc --noEmit` + `npm run build` verts.
- [ ] Multijoueur coach vs coach
- [ ] Classements, saisons, événements

## Journal

- 2026-08-18 (routine) : Après `stable.ts` puis `progression.ts`,
  continué le balayage systématique de tous les modules `game/`
  persistés en `localStorage` (`story.ts` et `onboarding.ts` d'abord :
  déjà correctement durcis, aucun changement) jusqu'à `cardForge.ts`
  (persistance des cartes forgées par prompt), qui portait la MÊME
  classe de bug — un 3e fichier sur 5 vérifiés. `loadForgedCards()` et
  `saveForgedCard()` validaient chacune que le JSON stocké avait le bon
  CONTENEUR (un tableau), mais aucune n'allait jusqu'à valider chaque
  ÉLÉMENT/la FORME entière avant de l'utiliser. (1) Dans
  `loadForgedCards()`, un seul élément corrompu au milieu d'un tableau
  par ailleurs valide (`[null, "oops", carteValide]`) faisait planter
  `c.effects` dans la boucle de migration/re-clamp — cette boucle étant
  DANS le même try/catch que le `JSON.parse`, le `catch { return [] }`
  jetait tout le lot, y compris les cartes forgées valides : perte
  totale de la collection pour une seule entrée corrompue. (2) Dans
  `saveForgedCard()`, un stockage corrompu de FORME (pas un tableau, ex.
  `{}`) faisait planter `.unshift()`, capturé par le même try/catch —
  la carte que le joueur venait tout juste de forger (déjà enregistrée
  en mémoire via `registerCustomCard`, donc jouable cette session)
  n'était alors JAMAIS écrite en `localStorage` : perdue silencieusement
  au rechargement, sans aucune erreur visible pour le joueur. Les deux
  bugs d'abord reproduits par exécution directe du module (scripts
  jetables dans `scripts/`, supprimés après usage) contre un stockage
  fabriqué à la main, puis corrigés avec le patron déjà établi sur
  `stable.ts`/`progression.ts` : un helper `isValidForged()` type-guard
  + `.filter()` sur les éléments dans `loadForgedCards()`,
  `Array.isArray()` (au lieu d'une confiance aveugle) avant `.unshift()`
  dans `saveForgedCard()` — toujours « jamais punitif », une entrée
  invalide est écartée individuellement plutôt que de faire perdre tout
  le magasin. 2 nouveaux tests ajoutés dans le bloc dédié existant de
  `engine.test.ts`, chacun reconfirmé par `git stash` A/B (échouent bien
  sur le code d'avant-fix, avec exactement les symptômes observés
  manuellement). Suite complète (372 tests) vérifiée sur 3 exécutions
  consécutives, `tsc --noEmit` et `npm run build` verts. Couverture de
  `cardForge.ts` : 96,1 % lignes / 92,7 % branches — suffisant pour ce
  fix ciblé, pas de chasse à la couverture restante ici.
- 2026-08-18 (routine) : Immédiatement après `stable.ts`, même passage
  sur `progression.ts` (Lien coach-perso, paliers de récompense, persos
  créés par prompt — également persisté en `localStorage`) : la classe
  de bug qui venait d'être trouvée sur un fichier voisin se retrouve
  quasi identique ici, un signal fort qu'il valait la peine de vérifier
  IMMÉDIATEMENT plutôt que de passer à autre chose. **3 vrais bugs
  trouvés et corrigés**, la même famille structurelle que `stable.ts` :
  chaque fonction valide le CONTENEUR du JSON stocké (tableau ou objet
  selon la clé — déjà corrigé le 2026-08-16), mais AUCUNE n'allait
  jusqu'à valider chaque ÉLÉMENT/ENTRÉE individuel. (1) `loadCustoms()` :
  un ÉLÉMENT corrompu dans le tableau des persos créés (`[null]`,
  `["oops"]`) plantait la boucle de migration Ulti (`c.ulti` sur `null`
  → `TypeError`) — et ce tableau est chargé au MONTAGE de
  `CharacterSelect` (`useState(() => loadCustoms())`), donc un crash de
  tout l'écran de sélection pour un seul perso custom corrompu parmi
  jusqu'à 4. (2) `getProgress`/`recordResult`/`claimReward` : une ENTRÉE
  corrompue dans le magasin (`{"kenta": "oops"}`, le conteneur objet
  reste valide) faisait `p.wins++` planter en mode strict (assignation
  de propriété sur une primitive) — `recordResult()` est appelé après
  CHAQUE match (`App.tsx`), donc un crash systématique du flux de
  résultat pour ce perso jusqu'à ce que la clé corrompue soit effacée
  manuellement. (3) `getExtraCopies()`/`claimReward()` : le champ
  `extraCopies` d'une entrée par ailleurs bien formée pouvait être
  corrompu SANS être nul (`extraCopies: "oops"`) — `?? []` ne filtre que
  `null`/`undefined`, pas une chaîne. `getExtraCopies()` renvoyait alors
  la chaîne telle quelle, prête à être épandue caractère par caractère
  dans le deck du joueur par `deckBuilder.ts` (`deck.push(...extraCopies)`)
  — un état incorrect propagé SILENCIEUSEMENT plutôt qu'un crash, plus
  insidieux que les deux premiers. `claimReward()` avait le même défaut
  sur son propre spread (`[...(p.extraCopies ?? [])]`). Corrigé avec
  exactement le même patron que `stable.ts` juste avant : un helper
  `validProgress()` pour les entrées du magasin de progression, un
  `.filter()` sur les éléments du tableau de persos custom, et
  `Array.isArray()` (pas `?? []`) partout où `extraCopies` est lu —
  toujours « jamais punitif » : une donnée invalide est écartée
  individuellement, jamais tout le magasin. Chaque bug reconfirmé par
  `git stash` A/B sur les nouveaux tests (tous échouent sur le code
  d'avant-fix). En écrivant le test pour `claimReward()` avec un
  `extraCopies` corrompu, découverte au passage d'un angle mort de
  couverture PRÉEXISTANT (pas un bug) : aucun test n'avait jamais
  exercé une 2e réclamation RÉELLE sur le même perso (celle où
  `p.extraCopies` contient déjà une carte valide) — étendu le test
  `pendingReward`/`claimReward` existant plutôt que d'en écrire un
  nouveau redondant. `progression.ts` fermé à 99 %/98,4 % (seule
  branche restante déjà documentée comme structurellement inatteignable
  — preuve FNV-1a d'une session antérieure sur ce même
  `rewardOptionsFor`). 3 nouveaux tests + 1 extension. engine.test.ts
  367 → 370, suite vérifiée sur 3 exécutions consécutives (370/370).
  `tsc --noEmit` + `npm run build` verts.
- 2026-08-18 (routine) : Suite des audits full-file côté `game/`, après
  `commentator.ts` — cette fois `stable.ts` (Vie d'Écurie : humeur,
  envies, entraînement, persisté en `localStorage`), pas ciblé en
  profondeur depuis le round 6 (2026-08-16), un fichier qui touche
  exactement la classe de bugs déjà trouvée cette session sur des
  fichiers voisins (`pickOpponent` d'App.tsx, la sanitization de
  `deckBuilder.ts`, la gestion de corruption `localStorage` de
  `StoryScreen.tsx`). **3 vrais bugs trouvés et corrigés**, tous
  confirmés par exécution DIRECTE du module réel contre un
  `localStorage` fabriqué à la main (pas juste des assertions —
  `getStable()` appelée pour de vrai, l'erreur observée telle qu'elle se
  produirait en jeu), puis reconfirmés par `git stash` A/B sur les 4
  nouveaux tests (tous échouent bien sur le code d'avant-fix). (1) Le
  fichier avait déjà un garde-fou (2026-08-16) validant que le
  CONTENEUR entier du stockage est bien un objet — mais pas que CHAQUE
  ENTRÉE l'est. Une entrée individuelle corrompue (`{"kenta": 5}`, un
  perso avec une valeur non-objet — plausible après une extension de
  navigateur, un bug de migration, ou simplement un joueur qui trafique
  son `localStorage`) faisait planter `getStable()` : d'abord
  silencieusement (`charId in all` la comptait comme « déjà rencontré »,
  donc AUCUNE envie n'était plus jamais assignée à ce perso — vérifié en
  exécutant le module : `desire` restait `null` pour toujours), PUIS
  franchement (`s.dayKey = dayKeyOf(now)` plantait avec `TypeError:
  Cannot create property 'dayKey' on number '5'` — l'assignation d'une
  propriété sur un nombre primitif est une erreur en mode strict, et les
  modules ES SONT toujours strict). Ce `getStable()` est appelé
  SYNCHRONE dans le corps de rendu de `CharacterSelect` : un crash de
  tout l'écran de sélection, pour un seul perso avec une entrée
  corrompue. Corrigé en validant CHAQUE entrée individuellement dans
  `readAll()` (pas seulement le conteneur), en écartant juste celle qui
  est invalide plutôt que tout le magasin — retraitée alors comme
  « jamais rencontrée », le repli le plus sûr, cohérent avec la règle
  d'or documentée en tête de fichier (« JAMAIS punitif »). (2)
  `dayKeyOf()` dérivait le jour via `toISOString()` — c'est-à-dire le
  calendrier UTC, un instant FIXE qui ne correspond au minuit réel
  d'AUCUN joueur hors UTC+0. Un joueur en UTC-8 (Pacifique US) verrait
  ses 3 actions quotidiennes et sa nouvelle envie se recharger à 16h
  locales, pas à minuit — contredisant directement l'intention
  documentée en tête de fichier (« actions limitées à 3 par jour RÉEL »).
  Corrigé en dérivant `dayKeyOf` des accesseurs LOCAUX de `Date`
  (`getFullYear`/`getMonth`/`getDate`, pas leurs équivalents `getUTC*`).
  Vérifié par un test qui bascule `process.env.TZ` en cours d'exécution
  (Node relit la variable dynamiquement pour les accesseurs locaux de
  `Date`, pas seulement au démarrage — vérifié directement avant
  d'écrire le test) : à 2h du matin UTC le 1er janvier, un joueur
  Pacifique doit recevoir la clé du 31 décembre, pas du 1er janvier.
  (3) `consumeTraining()` renvoyait `trainedStat` sans valider qu'il
  vaut bien `'atk'`/`'def'`/`'spd'`/`null` — la même classe de
  corruption que (1) mais sur un CHAMP plutôt que l'entrée entière (ex.
  `trainedStat: "banana"`). Une valeur corrompue se serait propagée
  jusqu'à `fighter.stats[trained]` (App.tsx), où l'indexation par une
  clé invalide vaut `undefined`, donnant `undefined + 1 = NaN` :
  toutes les stats de combat du perso deviennent silencieusement `NaN`
  pour le match entier — dégâts, seuils, tout. Corrigé en validant la
  valeur juste avant de la renvoyer (mais toujours consommée/effacée du
  stockage en premier, corrompue ou pas — sinon elle re-planterait au
  prochain appel). `stable.ts` fermé à 100 % sur les 4 métriques (déjà
  proche avant ce passage). 4 nouveaux tests, tous corrects du premier
  coup après vérification manuelle du bug via exécution directe du
  module. engine.test.ts 363 → 367, suite vérifiée sur 3 exécutions
  consécutives (367/367). `tsc --noEmit` + `npm run build` verts —
  `process.env` accédé via `globalThis` dans le nouveau test (pas de
  `@types/node` dans ce projet 100 % navigateur, cohérent avec le reste
  du fichier qui caste déjà d'autres globals via `(globalThis as any)`).
- 2026-08-18 (routine) : Après avoir clos le sweep d'audits sur les 4
  écrans UI centraux, retour côté `game/` avec un audit full-file sur
  `commentator.ts` — la narration shōnen affichée en direct sur le
  canvas de combat, pas ciblée en profondeur depuis le round 5
  (2026-08-16) alors que `combat.ts` (sa source d'`events`) a
  énormément changé depuis (plans tactiques, garde défensive, frénésie,
  mods de contre, temps mort d'urgence adverse…). **6 vrais bugs
  corrigés**, tous de la même famille structurelle : le `switch(ev.kind)`
  du commentateur ne couvrait que 12 des 17 kinds de `CombatEvent`
  aujourd'hui définis dans `types.ts` — `cardProc`, `trait`, `switch` et
  `timeout` n'avaient AUCUN `case`, tombant silencieusement sur
  `default: return null`. Concrètement : Frénésie, Dernière Chance,
  Contre Parfait, Cœur Vaillant, Leçon d'Expérience, Cri de Guerre et le
  vol de Souffle (tous des `cardProc`) ne produisaient jamais de
  commentaire malgré des textes déjà écrits en toutes lettres par
  `combat.ts` (ex. « DERNIÈRE CHANCE !! ») — juste jamais lus par le
  commentateur. Même chose pour les moments où un ordre du coach est
  silencieusement rejeté par la personnalité du perso (`trait` : Provoqué,
  Boude, T'ignore, Trop de bruit), une relève de banc (`switch`), et un
  temps mort (`timeout`, explicitement qualifié de « précieux, 1/match »
  dans le commentaire de `combat.ts` lui-même). Corrigé en ajoutant les
  4 `case` manquants — `cardProc`/`trait` réutilisent directement le
  texte déjà écrit par `combat.ts` (pas de gabarit à tirer), `switch`/
  `timeout` ont chacun un nouveau pool de gabarits. Un 6e bug, distinct
  et plus subtil, trouvé sur le `case 'card'` déjà existant : une carte
  jouée par le coin ADVERSE était narrée « Le coin de {JOUEUR} joue…
  » — créditant systématiquement le JOUEUR d'un coup joué par l'IA. La
  cause : l'event `'card'` (contrairement à `'switch'`/`'timeout'`) n'a
  PAS de champ `side` dans `types.ts`, seulement `name` — et le coin
  adverse encode ça en SUFFIXE du nom (« (coin adverse) » / « (temps
  mort adverse) », voir `combat.ts`) plutôt qu'en champ structuré. Le
  commentateur ignorait totalement ce suffixe et utilisait toujours les
  gabarits « joueur ». Plutôt que d'introduire un champ `side` sur le
  type (refactor plus large, plusieurs sites d'appel dans `combat.ts` à
  toucher), réutilisé la MÊME convention de détection déjà établie et
  déjà corrigée une fois pour ce exact problème dans `ArenaScreen.tsx`
  (`ev.name.includes('adverse')` + retrait du suffixe pour l'affichage)
  — cohérence avec le patron existant plutôt qu'un nouveau mécanisme
  parallèle. Nouveau pool de gabarits `T.cardAdverse` dédié. Vérifié par
  un test à 3 sous-cas (suffixe « coin adverse », suffixe « temps mort
  adverse », et contrôle positif : une carte du joueur sans suffixe
  reste narrée normalement, aucune régression). L'ancien test qui
  documentait « ces kinds sont ignorés sans erreur » avait sa prémisse
  devenue fausse par ce fix — réécrit en test positif (chaque nouveau
  `case` produit bien le texte attendu), en gardant un test résiduel
  minimal pour le garde-fou `default` avec un kind synthétique inconnu
  (`as never`), toujours pertinent pour une future extension du type.
  `commentator.ts` fermé à 100 % sur les 4 métriques (branches 98,38 %
  → 100 % après un dernier test sur la fenêtre de silence de `trait`).
  363 tests (net +3). `tsc --noEmit` + `npm run build` verts, funnel
  visuel standard sans régression — le commentateur écrit directement
  sur le canvas (pas de DOM inspectable), vérification portée
  entièrement par la couverture de test exhaustive plutôt que par une
  lecture de pixels, cohérent avec le traitement établi du rendu canvas
  dans ce projet.
- 2026-08-18 (routine) : Suite (et clôture pour l'instant) du sweep
  d'audits full-file sur les écrans UI, après `ArenaScreen.tsx`,
  `CharacterSelect.tsx` et `ResultsScreen.tsx` — cette fois
  `StoryScreen.tsx` (liste des chapitres du mode Histoire), un fichier
  bien plus petit et déjà passé par un audit accessibilité (`aria-
  pressed`), donc attentes plus modestes que sur les 3 précédents. Un
  seul vrai bug trouvé, de sévérité nettement plus faible que les
  précédents (aucune race condition, aucun état non réinitialisé,
  aucune fuite mémoire) : l'emoji de statut d'un chapitre
  (`done ? '✅' : unlocked ? '🥊' : '🔒'`) donnait la priorité à `done`
  sur `unlocked`. Sous jeu normal, `done && !unlocked` est
  structurellement inatteignable — on ne peut jamais « dé-nettoyer » un
  chapitre déjà nettoyé, et nettoyer un chapitre EXIGE d'abord qu'il
  soit débloqué (donc que le précédent le soit aussi) — mais un
  `localStorage` trafiqué à la main ou corrompu peut violer cet
  invariant, et affichait alors un ✅ « réussi » sur une carte pourtant
  désactivée et grisée à 0,45 d'opacité : une contradiction visuelle
  directe entre l'emoji et l'état interactif réel du bouton. Corrigé en
  testant `unlocked` en premier dans le ternaire, cohérent avec le
  `disabled`/`opacity` calculés juste au-dessus. Vérifié en Chromium
  headless en injectant directement un `localStorage` corrompu (chapitre
  3 « cleared » sans le 2) : chapitre 3 affiche bien 🔒 (aurait affiché
  ✅ avant le fix), chapitre 4 devient bien 🥊 (débloqué puisque le 3 —
  quoique lui-même verrouillé — est dans `cleared`, comportement de
  `isUnlocked()` inchangé et hors du périmètre de ce fix). Simplification
  en bonus (pas un bug) : le surlignage du chapitre ouvert réimplémentait
  `.planCard.selected` (déjà défini en CSS, `styles.css:506`) via un
  style inline `borderColor` redondant — remplacé par la classe CSS
  partagée pour rester synchronisé si `.selected` évolue ailleurs dans
  le jeu (même risque de dérive que documenté pour ArenaScreen plus
  tôt). Vérifié aussi en Chromium headless : la sélection applique bien
  la bordure accent via la classe. 360 tests inchangés (composants UI
  non couverts par les tests unitaires). `tsc --noEmit` +
  `npm run build` verts. Les 4 écrans centraux du funnel de jeu
  (ArenaScreen, CharacterSelect, ResultsScreen, StoryScreen) ont
  maintenant tous reçu un audit full-file approfondi cette itération de
  sweep ; restent `PrivacyScreen.tsx`, `ReadyScreen.tsx` (déjà touché
  récemment pour le bouton Retour), `TitleScreen.tsx` (déjà audité) et
  `ErrorBoundary.tsx` — tous plus petits, gains attendus plus modestes.
- 2026-08-18 (routine) : Suite du sweep d'audits full-file (skill
  code-review) sur les écrans UI, après `ArenaScreen.tsx` et
  `CharacterSelect.tsx` — cette fois `ResultsScreen.tsx` (écran de fin
  de match : clip du KO, prompts du Réalisateur, Revanche), qui n'avait
  reçu qu'un passage superficiel « ça a l'air propre » lors d'une
  session antérieure, jamais l'audit approfondi qui vient de trouver de
  vrais bugs sur les 2 autres écrans. **4 vrais bugs trouvés et
  corrigés**, tous de la même famille (cycle de vie des blob URL +
  réactivité React contrôlée vs non contrôlée) : (1) `URL.
  createObjectURL(outcome.highlight)` posé comme effet de bord DANS un
  `useMemo` — un `useMemo` n'est censé être QUE pur selon React
  lui-même. Sous `React.StrictMode` (actif dans `main.tsx`, confirmé
  avant de considérer ce finding sérieusement), React appelle l'usine
  du `useMemo` 2 fois avant de committer le rendu : la 1re URL créée
  n'est jamais gardée dans l'état ni révoquée nulle part, seule la 2e
  l'est — une fuite d'un blob URL par montage en dev, exactement la
  classe de bug que le commentaire d'origine (juste au-dessus) disait
  vouloir éviter. Corrigé en déplaçant la création dans un `useEffect`,
  au même patron que sa propre révocation juste en-dessous (`useState` +
  `useEffect` qui crée ET révoque). (2) Le bouton « Partager le KO »
  n'avait aucun garde-fou anti-double-clic : un 2e clic pendant que la
  feuille de partage native (Web Share API) est déjà ouverte fait
  rejeter le 2e `navigator.share()` avec `InvalidStateError`, et le
  `catch` de `shareOrDownload()` (déjà écrit pour gérer un refus
  utilisateur légitime) retombe alors sur un TÉLÉCHARGEMENT silencieux
  en arrière-plan pendant que la feuille native est encore affichée à
  l'écran — un effet de bord surprenant d'un simple double-clic. Corrigé
  avec un état `sharing` (bouton désactivé pendant l'appel). (3) Les
  `clipUrl` des scènes du Réalisateur (`sceneQueue.ts`, même convention
  `URL.createObjectURL` que le highlight) n'étaient jamais révoqués nulle
  part — actuellement dormant puisqu'aucun vrai pipeline Kling n'est
  branché (`STUB_SCENE_SUBMITTER` par défaut ne produit jamais 'ready'),
  mais un défaut latent bien réel dans le code : le jour où un vrai
  submitter est câblé (backend prévu au ROADMAP), chaque passage sur cet
  écran fuirait un blob par scène affichée, sans qu'aucun signal
  n'alerte avant que la mémoire du navigateur en pâtisse sur une session
  longue. Corrigé proactivement (même patron `useRef<Set>` + révocation
  au démontage), AVANT que le bug puisse jamais se manifester en
  production — un choix délibéré de corriger le code latent plutôt que
  d'attendre que la fonctionnalité soit branchée pour découvrir le bug
  a posteriori. (4) `<details open={sceneJobs.some(j => j.status ===
  'ready')}>` : React ne réapplique un attribut natif comme `open` que
  quand la prop CALCULÉE change de valeur d'un rendu à l'autre — il ne
  lit jamais l'état DOM réel (potentiellement modifié par l'utilisateur
  entre-temps). Donc si le joueur referme le panneau des scènes à la
  main pendant que tous les jobs sont encore 'pending' (l'état calculé
  reste `false`, React ne touche à rien), puis qu'un job passe à
  'ready' (l'état calculé bascule `false→true`), React réapplique
  `open=true` et rouvre de force le panneau que le joueur venait
  justement de fermer. Également dormant aujourd'hui (même raison que
  (3)), corrigé aussi proactivement : `<details>` non contrôlé (aucune
  prop `open`) + une ouverture IMPÉRATIVE unique au premier job prêt via
  une ref + un flag « déjà auto-ouvert », sans plus jamais y retoucher
  ensuite — le joueur reste maître du panneau une fois l'auto-ouverture
  initiale passée. Les 3 premiers bugs vérifiés en Chromium headless
  (funnel `?demo=fast` jusqu'aux résultats, lecture DOM du `<video>` du
  highlight — `hasSrc: true, readyState: 4` — et zéro erreur console au
  clic sur Revanche, qui déclenche le démontage/la révocation). Le 4e
  (details) n'a pas pu être vérifié visuellement puisque dormant sur ce
  build (aucun job ne passe jamais à 'ready' avec le stub actuel) — la
  correction repose sur la lecture du code React (comportement
  documenté des attributs natifs contrôlés) plutôt que sur une
  observation empirique. 360 tests inchangés (composants UI non
  couverts par les tests unitaires). `tsc --noEmit` + `npm run build`
  verts, funnel visuel standard sans régression.
- 2026-08-18 (routine) : Suite des audits de code full-file (skill
  code-review) sur les écrans UI, après `ArenaScreen.tsx` plus tôt cette
  itération de sweep — cette fois `CharacterSelect.tsx`, l'écran de
  sélection/création de perso + deck-builder, pas ciblé en profondeur
  depuis le round 3 (2026-08-16) alors que l'app a beaucoup changé
  depuis (les fixes récents sur `pickOpponent`/équipe dans `App.tsx`,
  la navigation `ReadyScreen`, les médias `ArenaScreen`). **Vrai bug
  trouvé** : après un forge de perso réussi (mode guidé OU expert), le
  formulaire de création restait rempli EXACTEMENT comme avant le clic
  — les 3 chips guidées toujours cochées, le nom toujours dans le champ,
  le bouton « Donner vie à ce perso » toujours actif — sans aucun signal
  visuel que le perso avait déjà été créé (le formulaire n'est PAS
  masqué après sélection, il reste affiché au-dessus du roster en
  permanence). Un joueur qui double-clique, ou qui pense que son 1er
  clic n'a rien fait, forge alors un DOUBLON avec un nouvel id aléatoire
  — et `saveCustom()` (progression.ts) évince silencieusement le plus
  ancien perso custom au-delà de `MAX_CUSTOMS=4`, avec tout son Lien
  accumulé. Corrigé en réinitialisant `prompt`/`gStyle`/`gTemper`/
  `gWorld`/`gName` dans `forgeFromPrompt()` (le point de sortie commun
  aux 2 modes) juste après le succès. Vérifié avec la même discipline
  que sur `ArenaScreen.tsx` cette itération : Chromium headless, funnel
  jusqu'au forge guidé, lecture DOM de l'état du bouton/champ avant et
  après le clic. `git stash` sur `CharacterSelect.tsx` seul, A/B
  confirmé : sur le code d'avant-fix, le bouton restait actif et le nom
  restait rempli après le clic (bug reproduit à coup sûr) ; sur le code
  corrigé, le bouton se désactive et les champs se vident. Corrigé au
  passage, trouvé par le même audit : les boutons-chips DÉSACTIVÉS
  (relève déjà à 2 équipiers, copie de carte déjà à 0 ou au plafond
  `MAX_COPIES`) affichaient quand même un curseur `pointer` au survol —
  le style inline de `chip()` ne tenait pas compte de l'état `disabled`
  du bouton (le style inline gagne toujours sur le CSS externe, qui n'a
  pas de règle `:disabled` pour ces boutons non-`.btn`) ; `chip()` prend
  maintenant un 2e paramètre `disabled` optionnel (curseur `not-allowed`
  + opacité réduite). 360 tests inchangés (composants UI non couverts
  par les tests unitaires). `tsc --noEmit` + `npm run build` verts,
  funnel visuel standard vérifié sans régression.
- 2026-08-18 (routine) : `game/` étant désormais proche de la saturation
  en couverture (99,65 % stmts, 98,54 % branches), retour à un audit de
  code full-file (skill code-review) — cette fois sur `ArenaScreen.tsx`
  (l'écran de jeu central, ~900 lignes), pas ciblé depuis un moment.
  **Vrai bug trouvé** : la facecam du joueur (tuile « 🔴 Toi, coach »)
  ne s'affichait JAMAIS, sur AUCUN match avec caméra accordée — un bug
  sérieux passé inaperçu jusqu'ici. Cause : `<video ref={camRef}>` n'est
  rendu dans le JSX QUE si `camOk` est vrai (`{camOk && <video .../>}`),
  mais dans `setup()` (une fonction async), l'attache `camRef.current.
  srcObject = stream` tournait dans la MÊME continuation synchrone que
  `setCamOk(true)` juste au-dessus — React n'avait pas encore committé
  le nouveau rendu, donc `camRef.current` était encore `null`, le `if`
  était silencieusement sauté, et RIEN ne retentait l'attache ensuite
  (un seul `useEffect` existait dans tout le fichier, à deps `[]`,
  jamais rejoué). Corrigé avec un second `useEffect` dédié, dépendant de
  `[camOk]` : React le redéclenche APRÈS le commit qui monte le
  `<video>`, où `camRef.current` est enfin défini. Vérifié avec la
  discipline habituelle mais adaptée au visuel plutôt qu'à un test
  unitaire (ArenaScreen n'a aucune couverture unitaire) : Chromium
  headless avec `--use-fake-device-for-media-stream` (caméra factice
  Chromium) + permissions accordées, funnel complet jusqu'à l'arène,
  lecture de l'état DOM du `<video class="facecam">`. `git stash` sur
  `ArenaScreen.tsx` seul, A/B confirmé : `hasSrcObject: false` avant le
  fix, `hasSrcObject: true, readyState: 4 (HAVE_ENOUGH_DATA), paused:
  false, videoWidth: 640` après. 2 bugs mineurs corrigés au passage,
  trouvés par le même audit : `combatHintDismissedRef = useRef(
  hasSeenCombatHint())` rappelait `hasSeenCombatHint()` (localStorage +
  JSON.parse) à CHAQUE rendu — le composant re-rend plusieurs fois par
  seconde (documenté dans son propre commentaire, et déjà le patron
  fixé sur `matchRef`/`sysRef` dans ce même fichier) — corrigé en
  dérivant de `showCombatHint`, déjà calculé une seule fois via
  l'initialiseur paresseux de `useState` ; et `moodTimer`/`procTimer`
  (setTimeout de 1600-3000 ms pour les effets de mood/proc du coach)
  n'étaient jamais annulés à la sortie de l'arène (contrairement à
  `rafId`, juste au-dessus dans le même cleanup) — la fermeture entière
  restait vivante en mémoire jusqu'à leur déclenchement tardif après
  démontage. Simplification en bonus (pas un bug) : le mapping du banc
  vers la vue HUD était dupliqué verbatim entre le changement de phase
  et `onSwitch` — extrait en `benchViewOf()`. 2 findings du même audit
  jugés mineurs et non actionnés : `pendingCmd.current ?? consumeCommand()`
  saute la consommation vocale un frame de plus en cas de collision
  bouton/voix (auto-guéri au frame suivant, sans conséquence observée).
  360 tests inchangés (composants UI non couverts par les tests
  unitaires, seule la logique `game/` l'est). `tsc --noEmit` +
  `npm run build` verts, funnel visuel standard (`scripts/shot.mjs`)
  vérifié sans régression.
- 2026-08-18 (routine) : Coverage-driven bug hunt sur `sceneDirector.ts`
  (branches 89,61 % → 93,5 %), le prochain plus bas dossier `game/`
  après la clôture de `combat.ts`. Fermé : un spécial lancé par le
  JOUEUR (pas seulement adverse) — `foeOf('player')` retourne bien
  l'ennemi comme cible nommée dans le prompt, seul `foeOf('enemy')`
  (spécial adverse) avait un test ; et un round avec DEUX events
  scorants où le second (crit encaissé, score 3) est INFÉRIEUR au
  premier (contre, score 4) garde bien le premier comme moment fort du
  round — tous les tests précédents de ce fichier n'avaient jamais
  qu'un seul candidat scorant par round, donc le comparateur
  `s > cur.score` de l'élection ne pouvait structurellement jamais
  échouer. Documenté plutôt que forcé : 2 branches défensives
  (`if (prompt)` dans `buildScenePlans`, et le `default` du switch de
  sélection `by`) sont inatteignables via l'API publique — `momentPrompt`
  n'est appelée QUE sur des events déjà scorés positivement par
  `eventScore`, et les deux fonctions ne couvrent QUE les 4 mêmes kinds
  ('ulti'/'special'/'countered'/'hit' critique) ; elles sont maintenues
  à la main plutôt que dérivées l'une de l'autre — sans le garde-fou, un
  futur kind scorant sans son cas dans `momentPrompt` reproduirait
  silencieusement le bug déjà corrigé sur `'hypeFull'` (2026-08-16). 2
  nouveaux tests, tous corrects du premier coup. Aucun bug trouvé.
  engine.test.ts 358 → 360, suite vérifiée sur 3 exécutions consécutives
  (360/360). `tsc --noEmit` + `npm run build` verts. Restent, tous déjà
  >94 % (gains marginaux) : `cardForge.ts`, `cards.ts`, `deckBuilder.ts`,
  `liveCutPlayer.ts`, `progression.ts` — `game/` global proche de la
  saturation (99,65 % stmts, 98,54 % branches).
- 2026-08-18 (routine) : CLÔTURE du sweep de couverture sur `combat.ts`
  (branches 97,36 % → 99,52 %, 100 % statements/fonctions/lignes),
  commencé il y a 5 itérations à 88,72 %. Fermé cette fois : posture
  DÉFENSIVE, l'attaque automatique n'est pas juste amortie — elle est
  parfois carrément SAUTÉE (45 % de chance), un mécanisme distinct de
  l'atténuation de dégâts déjà testée ; perte de round côté ENNEMI
  déclenche aussi `ultiReady` (mirroir du test joueur déjà existant) ;
  une Ulti DÉJÀ UTILISÉE (`ultiUsed=true`) ne se recharge pas à la
  perte d'un round supplémentaire ; `forceRoundTimeout` tranche aussi
  en faveur du camp ADVERSE quand son ratio de PV est meilleur (seul le
  cas joueur-gagne, et l'égalité, l'étaient) ; le coin adverse en PV
  critiques SANS carte de soin/Dernière Chance en main ne prend pas de
  temps mort d'urgence ; un tick trop court pendant `'roundEnd'`/
  `'tactics'` ne fait PAS avancer la phase (tous les autres tests
  dépassaient toujours `phaseUntil` d'un coup) ; et Contre Parfait armé
  côté adverse s'arme vraiment quand c'est le coach FANTÔME lui-même
  qui choisit la posture `'counter'` (les tests de posture existants
  retombaient toujours sur une autre posture avec leur mock constant).
  2 dernières branches documentées en commentaire comme structurellement
  inatteignables plutôt que forcées par un test artificiel : `if
  (clutchId)` dans le temps mort d'urgence adverse (le garde-fou
  englobant, un `.some()`, a déjà confirmé qu'une carte qualifiante
  existe avant ce point — si `healId` ne la trouve pas, le repli `??`
  la retrouve à coup sûr), en plus du `if (stance)` déjà documenté
  l'itération précédente. 9 nouveaux tests, tous corrects du premier
  coup. Aucun bug trouvé sur l'ENSEMBLE du sweep `combat.ts` (5
  itérations consécutives, ~40 tests ajoutés au total, 88,72 % →
  99,52 % de branches) — un résultat rassurant en soi : le cœur du
  moteur de combat, déjà la cible de plusieurs audits de code manuels
  passés, ne cachait aucun bug supplémentaire une fois chaque branche
  logique exercée. engine.test.ts 351 → 358, suite vérifiée sur 3
  exécutions consécutives (358/358). `game/` global : 98,55 % → 99,65 %
  stmts, branches 92,82 % → 98,2 % — quasiment saturé. `tsc --noEmit` +
  `npm run build` verts. Restent : `cardForge.ts` (97,29 %/94,11 %,
  déjà partiellement documenté comme inatteignable), `deckBuilder.ts`
  (95,65 %, 1 branche déjà documentée), `sceneDirector.ts` (89,61 %,
  le plus bas dossier restant) et `progression.ts`/`liveCutPlayer.ts`/
  `cards.ts` (déjà >97 %, gains marginaux). `render/arenaRenderer.ts`
  reste hors périmètre des tests unitaires (canvas 2D, déjà couvert par
  plusieurs audits de code manuels).
- 2026-08-18 (routine) : Suite du sweep sur `combat.ts` (branches
  96,16 % → 97,36 %). Fermé le texte « Leçon d'Expérience » côté
  JOUEUR : le mod armé était sur `m.mods` (pas `m.enemyMods`) et le
  spécial qui l'encaisse est celui de l'ENNEMI, déclenché par
  `enemyCoachAI` (probabiliste, pas par une commande du coach) — repris
  le patron déjà établi (`vi.spyOn(Math,'random').mockReturnValue(0)`,
  `freeze` implicite via Hype pleine) plutôt que d'inventer un nouveau
  mécanisme. Fermé les 2 derniers paliers de `enemyCardValue` : `'heal'`
  intermédiaire (15-35 % de PV manquants → multiplicateur ×1, entre les
  deux extrêmes déjà testés) et `'hype'` quand la Hype adverse est déjà
  ≥ 75 (carte sans valeur, jamais achetée). Fermé une posture agressive
  qui booste VRAIMENT le taux de critique (+0,08) — plusieurs tests
  posaient `stance='aggressive'` mais AUCUN ne mesurait son effet réel
  sur les coups portés ; comparaison statistique sur 400 tirages,
  fiable sur 3 exécutions consécutives sans avoir besoin de la
  technique d'appariement par graine commune (l'effet est assez large
  pour ressortir en tirage libre, contrairement au plan tactique
  précédent). Fermé la relève adverse (banc) : l'actif encore assez
  frais (≥ 35 % PV) ne switch pas même avec un remplaçant en pleine
  forme sur le banc, et un banc réduit à un seul remplaçant déjà KO ne
  switch pas non plus (`b.hp > 0` toujours vrai jusqu'ici). 5 nouveaux
  tests, tous corrects du premier coup. Aucun bug trouvé. engine.test.ts
  345 → 351, suite vérifiée sur 3 exécutions consécutives (351/351).
  `tsc --noEmit` + `npm run build` verts. Il reste une poignée de
  branches sur `endRound`/`startNextRound` (fin de round/changement de
  manche, lignes ~1000-1050) — sweep quasiment clos sur ce fichier.
- 2026-08-18 (routine) : Suite du sweep sur `combat.ts` (branches
  93,76 % → 96,16 %), en resserrant sur les gaps encore accessibles
  sans machinerie lourde (après le détour statistique de l'itération
  précédente sur le plan tactique). Fermé côté ORDRES : l'Ulti exige
  AUSSI sa jauge pleine, jamais exercé côté « pas prêt » alors que le
  spécial (le même patron) l'était des deux côtés depuis longtemps ;
  et un Cérébral en ordre de POSTURE (`'attack'` etc.) a sa PROPRE
  branche de stress/transcendance dans `applyCommand`, distincte de
  celle qui gère la commande `'cheer'` — seule cette dernière avait un
  test. Fermé côté RÉSOLUTION DE COUP : Cœur Vaillant incrémente son
  compteur sans déclencher le bonus tant que le seuil n'est pas atteint
  (seul « atteint pile » l'était) ; un attaquant confus inflige ×0,7 de
  dégâts — distinct du garde-fou anti-spam des ORDRES confus (le coach
  qui spamme), lui déjà testé, mais jamais l'effet sur les dégâts d'un
  perso RESTÉ confus qui attaque quand même automatiquement ; un
  défenseur confus esquive moins bien, isolé via un `random()` figé à
  une valeur calculée à la main entre les deux seuils de dodgeChance
  (0,096 confus / 0,176 normal, Rei spd 8) ; la Frénésie (Fang)
  amplifie VRAIMENT les dégâts une fois active — les 2 tests existants
  ne vérifiaient que son armement (`frenzyUntil` posé), jamais sa
  consommation par un coup réel ; et un contre SANS bonus de carte armé
  frappe quand même (mul de base 1.3), le seul test posait toujours les
  deux mods ensemble. Documenté plutôt que forcé : le garde-fou
  `if (stance)` est structurellement toujours vrai à ce point du code
  (cheer/special/ulti déjà retournés plus haut, les 4 commandes
  restantes couvrent exactement les clés de `COMMAND_STANCE`) — commenté
  dans la source plutôt que testé artificiellement, même discipline que
  le `?? 0` de `deckBuilder.ts`. 8 nouveaux tests, tous corrects du
  premier coup. Aucun bug trouvé. engine.test.ts 337 → 345, suite
  vérifiée sur 3 exécutions consécutives (345/345). `tsc --noEmit` +
  `npm run build` verts. Reste ~15 branches ouvertes sur `combat.ts`,
  concentrées sur `fireSpecial`/`endRound`/`startNextRound` (fin de
  round, changement de manche) — prochaine itération naturelle.
- 2026-08-18 (routine) : Suite du sweep sur `combat.ts` (branches
  92,32 % → 93,76 %). Fermé : `chargeUlti` déclenchait déjà `ultiReady`
  côté 'enemy' par les dégâts de combat, mais côté 'player' UNIQUEMENT
  via la perte d'un round (ligne 1024, un point de code séparé) —
  jamais via un coup encaissé/porté (ligne 48) : ajout du test miroir,
  côté joueur cette fois, avec un seuil `ULTI_MAX - 0.01` plutôt qu'une
  valeur fixe (le gain exact dépend des stats du perso qui encaisse,
  pas besoin de le calculer à l'avance). `applyConsigne` : ses 2 autres
  garde-fous (mauvaise phase, liste d'effets vide) jamais exercés
  individuellement, seul le refus par `consigneUsed` déjà posé l'était.
  Et la trouvaille la plus significative de cette itération : le PLAN
  TACTIQUE (`chooseTacticPlan` → PRESSION/BÉTON/etc.) n'avait JAMAIS
  influencé un seul coup en combat dans TOUT le fichier de tests — le
  seul test existant vérifiait juste que `m.plan` était bien posé,
  sans jamais laisser un coup partir derrière. Écrire ce test a
  d'abord échoué à cause d'un piège méthodologique instructif : un coup
  isolé avec Math.random() figé arrondit souvent la MÊME valeur avec ou
  sans plan (l'effet de BÉTON, def ×1,15, ne représente qu'environ 5 %
  de dégâts en moins — trop fin pour franchir un seuil d'arrondi sur un
  seul coup) ; puis une comparaison statistique sur 300 tirages LIBRES
  s'est révélée trop bruitée (le hasard d'esquive/critique domine
  largement l'effet du plan, le signe du résultat pouvait flipper d'une
  exécution à l'autre) ; la solution retenue est une comparaison PAIRÉE
  sur nombres aléatoires COMMUNS — un LCG (déjà utilisé ailleurs dans ce
  fichier pour du bruit déterministe) remis à la même graine pour les
  deux variantes (avec/sans plan), qui rejouent donc l'EXACTE même
  séquence d'esquives/critiques : seul le plan diffère, le résultat
  devient déterministe et fiable sur 5 exécutions consécutives sans
  neutraliser artificiellement le hasard du combat. 4 nouveaux tests.
  Aucun bug trouvé. engine.test.ts 334 → 337, suite vérifiée sur 3
  exécutions consécutives (337/337). `tsc --noEmit` + `npm run build`
  verts. ~20 branches restent ouvertes sur `combat.ts`.
- 2026-08-18 (routine) : Suite du coverage-driven bug hunt côté `game/` :
  `combat.ts`, le cœur du moteur (branches 88,72 % → 92,32 %). Gros
  fichier (417 branches) : sweep PARTIEL cette itération, pas fermé à
  100 % — repris ciblé sur les gaps les plus clairs plutôt qu'exhaustif
  d'un coup. Fermé : `drawEnemyCards()` (privée, appelée par
  `enemyCornerPlay`) ne remélangeait jamais sa défausse dans les tests —
  TOUS vidaient pioche ET défausse en même temps, ne déclenchant que le
  retour anticipé, jamais le remélange réel (même angle mort que
  `recorder.ts`/`sound.ts` plus tôt : un seul scénario partagé par tous
  les tests). `playCard()` : ses 3 garde-fous (mauvaise phase, Souffle
  insuffisant, carte absente de la main) testés individuellement — seul
  le chemin de succès l'était jusqu'ici, chacun vérifié sans effet de
  bord (main/Souffle intacts). Trait × commande `'cheer'` : Sanguin
  ×1,5 et Cérébral ×0,4 quand on hurle, jamais exercés via la commande
  elle-même (un test existant couvrait le trickle passif `voiceW` sur
  ces traits, pas ce chemin précis dans le handler de commande).
  `'counter'` posait déjà la posture/`counterUntil` par écriture directe
  dans un test plus ancien, jamais via `tick()` réellement. Et le
  garde-fou anti-confusion des ordres de POSTURE (ligne distincte de
  celui de `'cheer'`) n'était jamais isolé (`mulligan()` avec un id
  absent de la main, en bonus). 7 nouveaux tests, tous corrects du
  premier coup. Aucun bug trouvé. engine.test.ts 328 → 334, suite
  vérifiée sur 3 exécutions consécutives (334/334). `tsc --noEmit` +
  `npm run build` verts. Reste à fermer sur `combat.ts` : ~30 branches
  encore ouvertes (lignes 575-581, 822, 906-1047 environ) — prochaine
  itération naturelle.
- 2026-08-18 (routine) : Reprise du coverage-driven bug hunt côté
  `game/` (annoncé la fois précédente), en commençant par le plus bas :
  `deckBuilder.ts` (branches 86,95 % → 95,65 %). Fermé : `sanitizeTemplate()`
  face à une copie NON NUMÉRIQUE — `Number(t[c.id] ?? 0)` peut donner
  NaN (ex. une valeur texte trafiquée dans le stockage), branche
  `Number.isFinite(n) ? n : 0` jamais exercée côté faux, seuls des
  nombres hors bornes (99, -3) l'étaient jusqu'ici ; et `templateSize()`
  exportée face à une valeur explicitement `undefined` dans le template
  (`n ?? 0`). Dernière branche restante (`t[c.id] ?? 0` dans
  `buildDeckFromTemplate`) laissée non forcée : `sanitizeTemplate()`,
  appelée juste avant sur le MÊME `CARD_POOL`, garantit toujours une
  entrée numérique pour chaque carte à ce point — structurellement
  inatteignable, documentée en commentaire plutôt que testée
  artificiellement (même discipline que le garde-fou de collision de
  `rewardOptionsFor`, 2026-08-17). 2 nouveaux tests. Aucun bug trouvé.
  engine.test.ts 326 → 328, suite vérifiée sur 3 exécutions consécutives
  (328/328). `tsc --noEmit` + `npm run build` verts.
- 2026-08-18 (routine) : Clôture du coverage-driven bug hunt sur
  `systems/` : `facecam.ts` (branches 80 % → 100 %) et `pitch.ts`
  (branches 95,45 % → 100 %) — TOUT le dossier `systems/` (facecam,
  pitch, recorder, sound, voice) est maintenant à 100 % sur les 4
  métriques, disparu du rapport de couverture par défaut (seuls les
  fichiers avec un écart y figurent). Fermé sur `facecam.ts` : la
  décroissance douce de `energy` quand le changement de pixels retombe
  sous sa valeur courante (`raw <= energy`, seule la montée
  `raw > energy` était exercée — valeur exacte vérifiée : 0,5×0,92=0,46,
  pas de chute brutale) ; et la construction via `OffscreenCanvas`
  quand disponible, jamais exercée dans un sandbox Node qui ne l'a pas
  nativement (seul le repli `<canvas>` l'était). Fermé sur `pitch.ts` :
  un lag dont la fenêtre de corrélation tombe entièrement à zéro
  (`den=0`, cas réel en bord de buffer — construit avec `sampleRate/
  MIN_HZ` tombant PILE sur `maxLag`, réduisant sa fenêtre à un seul
  échantillon mis à 0) est bien ignoré via le garde-fou `den > 0 ? ... :
  0` sans jamais produire de NaN, sans perturber les autres lags qui
  corrèlent normalement. 3 nouveaux tests, tous corrects du premier
  coup. Aucun bug trouvé sur l'ensemble de ce sweep `systems/` (5
  fichiers, ~15 tests ajoutés en tout sur les 4 dernières itérations).
  engine.test.ts 323 → 326, suite vérifiée sur 3 exécutions consécutives
  (326/326). `tsc --noEmit` + `npm run build` verts. Prochaine cible
  naturelle : les derniers écarts de branches dans `game/` (combat.ts,
  deckBuilder.ts, sceneDirector.ts, cardForge.ts) puis `render/
  arenaRenderer.ts`, très peu couvert (canvas 2D, code-review déjà fait
  plutôt que tests unitaires vu la nature du fichier).
- 2026-08-18 (routine) : Suite du coverage-driven bug hunt sur `systems/`,
  après `recorder.ts` et `sound.ts` : `voice.ts` fermé à 100 % sur les 4
  métriques (branches 85,18 % → 100 %, fonctions 91,66 % → 100 %). Fermé
  côté `onresult` : un résultat dont le transcript ne contient que des
  espaces est bien ignoré par `if (!text) continue` — y compris pour le
  compteur `finalSeq`, jamais vérifié explicitement jusqu'ici ; et surtout
  un texte reconnu mais SANS commande détectée (aucun pattern ne matche,
  ex. « bonjour, comment ça va ? ») laisse `pendingCommand` INCHANGÉ —
  comportement voulu confirmé par un test dédié : une commande déjà en
  attente n'est pas effacée par une phrase hors-sujet, seule une NOUVELLE
  commande reconnue écrase l'ancienne. Fermé côté boucle de volume : la
  boucle s'arrête net dès `stopped=true` même si une frame restait déjà
  programmée (aucune mesure n'est traitée après un `stop()`) ; sans
  `timeBuf` (relâché entre-temps), la boucle continue de mesurer le
  volume mais saute la prosodie sans planter. Et même patron que
  `SoundSystem` (2026-08-18, plus tôt) : `audioCtx.close()` qui rejette
  au `stop()` de `VoiceCoach` est absorbé silencieusement — jamais
  exercé, seule la fonction de rejet manquait pour les 100 % de
  fonctions. 5 nouveaux tests, tous corrects du premier coup. Aucun bug
  trouvé. engine.test.ts 318 → 323, suite vérifiée sur 3 exécutions
  consécutives (323/323). `voice.ts` : 100 % sur les 4 métriques.
  `tsc --noEmit` + `npm run build` verts.
- 2026-08-18 (routine) : Suite du coverage-driven bug hunt sur `systems/`,
  après `recorder.ts` : `sound.ts` (branches 87,03 % → 100 %). Fermé :
  `start()` n'était jamais rappelé une 2e fois dans les tests (garde-fou
  `if (this.ctx) return` jamais exercé — vérifié idempotent : même
  instance `ctx`/`master`, rien reconstruit) ; `resume()` n'avait jamais
  de contexte réellement `suspended` à débloquer (Safari/iOS) — tous les
  fakes précédents démarraient `running` ; `setMuted()` avec un contexte
  réel (le seul test existant tournait volontairement SANS
  `AudioContext`, donc `master` toujours `null`, la bascule 0/0.7 jamais
  exercée) ; le garde-fou défensif de `startCrowd()` (privée, appelée
  uniquement en interne par `start()` toujours après ctx/master posés —
  non atteignable via l'usage réel, exercé directement comme
  `HighlightRecorder.startSegment()` l'avait été avant elle) ; et le
  seuil anti-ré-écrasement de `setCrowdHype()` (variation < 0,005 →
  aucune rampe reprogrammée, seul le cas au-dessus du seuil était
  couvert). 6 nouveaux tests, tous corrects du premier coup après un
  faux départ sur le comptage de `resume()` (`start()` en appelle déjà
  un en interne). Aucun bug trouvé. engine.test.ts 312 → 318, suite
  vérifiée sur 3 exécutions consécutives (318/318). `sound.ts` : 100 %
  sur les 4 métriques. `tsc --noEmit` + `npm run build` verts.
- 2026-08-18 (routine) : Coverage-driven bug hunt sur `systems/recorder.ts`
  (branches 79,24 % → 100 %). `game/` étant déjà quasi saturé (98,55 %
  stmts / 92,93 % branches), retour sur `systems/` où plusieurs fichiers
  gardaient des écarts de branches malgré des statements/fonctions à
  100 %. Fermé : le garde-fou `e.data.size > 0` sur `ondataavailable`
  n'avait jamais son côté FAUX exercé (un chunk de taille 0, cas réel
  d'un segment coupé sans avoir produit de données) — ni pour
  `MatchRecorder` ni pour `HighlightRecorder` ; la résolution
  `chunks.length ? new Blob(...) : null` de `stop()`/`rotate()` n'avait
  jamais son côté `null` exercé (arrêt réussi mais sans données, pas un
  chemin d'échec — différent des tests d'échec déjà existants) ; le
  repli `rec.mimeType || 'video/webm'` n'avait jamais son côté vide
  exercé sur ses 3 sites (`MatchRecorder.stop()`,
  `HighlightRecorder.rotate()`, `HighlightRecorder.stop()`) ; et le même
  repli sur `blob.type` dans `shareOrDownload`. 8 nouveaux tests, tous
  passent du premier coup — code déjà correct, aucun bug trouvé cette
  fois (fichier déjà lourdement audité en 2026-08-16/17). engine.test.ts
  304 → 312, suite vérifiée sur 3 exécutions consécutives (312/312).
  `recorder.ts` : 100 % sur les 4 métriques. `tsc --noEmit` +
  `npm run build` verts.
- 2026-08-18 (routine) : Ajout du bouton « ← Retour » manquant sur
  `ReadyScreen` (le Vestiaire), noté mais délibérément non corrigé lors
  de l'itération précédente (jugé produit/UX plutôt que bug). Reconsidéré
  en revoyant les autres écrans du funnel (`StoryScreen`, `PrivacyScreen`,
  `ResultsScreen`) : tous ont un moyen de revenir en arrière SAUF le
  Vestiaire — un vrai trou de navigation, pas une décision cosmétique :
  le joueur pouvait s'y retrouver coincé (mauvais perso choisi par
  erreur, ou changement d'avis) sans autre option que fermer l'onglet.
  Nouveau prop `onBack` sur `ReadyScreen`, câblé côté `App.tsx` sur le
  même patron conditionnel que `onNewChar` de `ResultsScreen` : retour
  vers `select` en mode Rapide, vers `story` en mode Histoire (le
  nettoyage des capteurs micro/caméra à la sortie fonctionne déjà via le
  cleanup du `useEffect` existant, aucun changement nécessaire côté
  gestion des flux media). Vérifié en Chromium headless sur les DEUX
  chemins (mode Rapide ET mode Histoire, jusqu'au choix de chapitre) :
  le bouton est présent et ramène bien sur le bon écran dans les deux
  cas. 304 tests inchangés (aucun test unitaire sur les composants UI).
  `tsc --noEmit` + `npm run build` verts.
- 2026-08-18 (routine) : Suite de l'audit de code (fichier entier) sur
  `App.tsx`, après `StoryScreen.tsx`/`ResultsScreen.tsx`/`TitleScreen.tsx`.
  **2 vrais bugs trouvés et corrigés**, tous deux confirmés réels par
  `git stash` A/B (test échoue sur le code d'avant-fix, passe après) :
  (1) `pickOpponent(char.id)` n'excluait que le joueur, pas son équipe —
  l'adversaire principal du mode Rapide pouvait être une copie exacte
  d'un équipier du banc, un miroir face à soi-même. Le même défaut avait
  déjà été corrigé sur `pickOpponentTeam` (banc adverse) le 2026-08-16
  mais jamais répercuté sur l'adversaire principal. Signature changée en
  `pickOpponent(excludeIds: string[])`, alignée sur le patron de
  `pickOpponentTeam`. (2) Le bouton « ⚡ Revanche » en mode Rapide
  appelait `startMatch` sans jamais réutiliser l'adversaire du match
  précédent : nouveau tirage aléatoire à chaque clic, contredisant le nom
  même du bouton (le mode Histoire, lui, était déjà correct — adversaire
  déterministe via `chapterOpponent`). Ajout d'un 4e paramètre optionnel
  `opponentOverride` à `startMatch`, câblé sur `enemy` à l'appel
  `onReplay`. **3e trouvaille notée mais délibérément non corrigée** :
  `ReadyScreen` (le Vestiaire) n'offre aucun bouton retour vers la
  sélection de perso — jugé être une décision produit/UX plutôt qu'un
  bug de pure restauration de comportement ; à traiter séparément si
  demandé. 2 nouveaux tests (dont un test de non-régression à 200 tirages
  couvrant joueur + équipiers simulés exclus). Suite complète vérifiée
  sur 3 exécutions consécutives (304/304), plus vérification visuelle en
  Chromium headless (`?demo=fast`) : après clic sur Revanche, le
  Vestiaire réaffiche bien le MÊME adversaire (Fang) qu'avant, confirmant
  le fix en conditions réelles. `tsc --noEmit` + `npm run build` verts.
- 2026-08-18 (routine) : Audit de code (fichier entier, pas juste le
  dernier diff) sur `StoryScreen.tsx`/`ResultsScreen.tsx` (rien trouvé) puis
  `TitleScreen.tsx`. **Vrai bug trouvé** : `overflow: 'hidden'` en ligne
  sur `.screen` écrasait le `overflow-y: auto` de la feuille de style — le
  seul filet de scroll de l'appli, déjà documenté après le même bug
  corrigé sur StoryScreen/CharacterSelect. Sur petit écran ou texte
  agrandi, le titre/tagline/boutons/lien Vie privée (empilés sur le canvas
  d'attract mode) pouvaient déborder sans AUCUN moyen d'atteindre le bas.
  Corrigé en retirant l'`overflow: hidden` (superflu, le canvas reste
  calé en `position: absolute` sans lui). Vérifié en Chromium headless à
  viewport normal (identique) ET à viewport très court (700×320) :
  `scrollHeight` > `clientHeight` confirmant le débordement réel, le lien
  Vie privée devenu atteignable après scroll. 303 tests inchangés (pur
  correctif CSS). `tsc --noEmit` + `npm run build` verts.
- 2026-08-18 (routine) : Dernier passage sur `speechTactics.ts`,
  `sceneQueue.ts`, `cutPlanner.ts` : tous les 3 à 100 % désormais. Garde-fou
  « texte trop court » de `parseConsigne` (speechTactics) ; `cancel()`
  avant qu'un submitter REJETTE plutôt que résolve `null` (sceneQueue,
  même patron que le bug déjà corrigé côté résolution) ; et même
  trouvaille systémique que `commentator.ts` sur `cutPlanner.ts` — le
  match synthétique partagé par toute la describe n'avait qu'un ulti
  côté enemy, un countered côté player, et aucun special : la moitié
  manquante de chaque ternaire `by==='player'?...` n'avait jamais tourné.
  Testé directement via `cutsForEvent` (exportée) pour ne pas risquer de
  casser les assertions du montage synthétique partagé. Aucun bug
  trouvé. 5 tests, engine.test.ts 300 → 303, suite vérifiée sur 8
  exécutions consécutives. `game/` global : 98,07 % → 98,62 % (stmts),
  branches 92,15 % → 93,04 %. `tsc --noEmit` + `npm run build` verts.
- 2026-08-18 (routine) : Suite du coverage-driven bug hunt : `commentator.ts`
  (96,07 % → 100 %, branches 72 % → 98 %). Trouvaille structurelle : le
  test « poids cohérents » existant passait SYSTÉMATIQUEMENT `'player'`
  comme camp pour les 12 familles d'événements — jamais `'enemy'`. Or
  presque chaque case calcule sa variable via un ternaire `=== 'player' ?
  P : E` : la moitié `: E` de CHAQUE ternaire du fichier n'avait donc
  jamais tourné, un angle mort systémique. Test miroir symétrique ajouté.
  Complété par `'hit'` critique + silencieux et `'blocked'` + silencieux
  (jamais testés). Aucun bug trouvé. 3 tests, engine.test.ts 298 → 300,
  suite vérifiée sur 8 exécutions consécutives. `game/` global : branches
  88,56 % → 92,15 %. `tsc --noEmit` + `npm run build` verts.
- 2026-08-18 (routine) : Suite du coverage-driven bug hunt : `cardForge.ts`
  (94,59 % → 97,29 %, fonctions → 100 %). Fermés : `loadForgedCards()` sur
  un stockage jamais écrit (son propre repli `?? '[]'` n'était jamais
  exercé) et `hasStorage=false`. Écarté (structurellement inatteignable) :
  les cases `blockEnemyCard`/`drainSouffle` du switch privé `describe()` —
  exhaustif sur `EffectPrimitive` par exigence TypeScript, mais aucune des
  14 règles de la Forge ne produit jamais ces primitives, et `describe()`
  n'est appelée que par `forgeCard()` — aucun chemin réel ne peut les
  atteindre. Aucun bug trouvé. 2 tests, engine.test.ts 296 → 298, suite
  vérifiée sur 6 exécutions consécutives. `tsc --noEmit` +
  `npm run build` verts.
- 2026-08-18 (routine) : Suite du coverage-driven bug hunt : `stable.ts`
  (Vie d'Écurie) → 100 %. Fermés : `hasStorage=false` ; `desireText` avec
  une envie hors du pool du trait (jamais exercé) ; la dérive douce vers
  50 depuis EN DESSOUS (le seul test existant partait toujours
  d'au-dessus) ; le changement de jour avec une envie déjà comblée la
  veille (doit en faire naître une nouvelle) ; et le repli propre à
  `recordMatchMood` sur un charId totalement neuf. Aucun bug trouvé. 5
  tests, engine.test.ts 292 → 296, suite vérifiée sur 6 exécutions
  consécutives. `game/` global 97,79 % → 98,14 % (stmts). `tsc --noEmit`
  + `npm run build` verts.
- 2026-08-18 (routine) : Suite du coverage-driven bug hunt sur
  `progression.ts` (96,03 % → 99 %). Fermé : `hasStorage=false`, la
  branche `level <= claimed` de `claimReward` (jamais exercée
  directement), et la migration `loadCustoms` d'un perso sans spécial du
  tout. **Trouvaille mathématique** sur le dernier écart
  (`rewardOptionsFor`, résolution de collision `if (b===a) b=(b+1)%pool
  .length`) : brute-forcé 10M combinaisons sans trouver une collision —
  preuve que c'est structurellement impossible aujourd'hui. `hash()` est
  du FNV-1a ; les codes de 'a'/'b' (97/98) diffèrent par XOR 3 qui
  bascule toujours le bit de poids faible ; multiplier par un IMPAIR
  (16777619) préserve la parité mod 2^32 ; et `CARD_POOL.length` vaut 22
  (PAIR) aujourd'hui. Donc les deux hash modulo 22 ont TOUJOURS des
  parités opposées — jamais égaux tant que le pool reste pair. Code mort
  aujourd'hui mais deviendrait silencieusement critique (et toujours non
  testé) si le pool passe à une taille impaire — documenté plutôt que
  forcé par un test artificiel. 3 tests, engine.test.ts 288 → 292, suite
  vérifiée sur 6 exécutions consécutives. `tsc --noEmit` +
  `npm run build` verts.
- 2026-08-18 (routine) : Audit de code (skill code-review) sur
  `ReadyScreen.tsx` et `PrivacyScreen.tsx` — les 2 seuls écrans jamais
  touchés par la 4e passe d'accessibilité. Aucun bug trouvé sur les deux ;
  pas de bascule chip/toggle non plus (vérifié manuellement). Retour au
  coverage-driven bug hunt : `onboarding.ts` (89,28 % → 100 %) —
  l'idempotence de `markCornerHintSeen()` et le chemin `hasStorage=false`
  n'avaient jamais été exercés (même angle mort que story.ts/
  deckBuilder.ts). Aucun bug trouvé. 2 tests, engine.test.ts 287 → 288.
  `tsc --noEmit` + `npm run build` verts.
- 2026-08-18 (routine) : Audit de code (skill code-review) sur
  `CharacterSelect.tsx` (622 lignes, revu pour la dernière fois au round 3,
  bien avant Vie d'Écurie/Deck du Coach/Mode Histoire). Tous les anciens
  bugs corrigés re-vérifiés sains. Un vrai trou d'a11y trouvé : le toggle
  guidé/expert, les 3 groupes de puces guidées (style/tempérament/univers)
  et les puces d'équipiers de relève signalaient leur sélection UNIQUEMENT
  par une bordure colorée (CSS pur) — même famille que le bug déjà corrigé
  sur `CharCard` (89001fc) mais jamais étendue à ces bascules ajoutées
  depuis. `aria-pressed` ajouté sur les 6 groupes concernés. Vérifié :
  suite complète (287 tests) + `tsc --noEmit` + `npm run build` verts,
  capture Chromium headless avec lecture directe des attributs
  `aria-pressed` réellement posés, zéro régression visuelle.
- 2026-08-18 (routine) : **3 vrais bugs trouvés** — audit de code (skill
  code-review) sur `ArenaScreen.tsx` (918 lignes), jamais ciblée par un
  round d'audit dédié (les rounds précédents couvraient les autres écrans
  et App.tsx/arenaRenderer.ts, jamais celui-ci). (1) Le reset de
  `lastFinalSeq` à l'entrée en phase tactique tournait APRÈS le bloc qui
  lit `finalSeq` pour en faire une consigne, sur le même tick — un mot
  crié en plein combat pouvait être lu comme la consigne de la pause qui
  vient de commencer, consommant l'unique consigne par pause pour rien.
  (2) Le soin d'urgence du coin adverse (temps mort sous 25 % PV) n'était
  pas reconnu par le switch de la « visio des coachs » (seul le suffixe
  `(coin adverse)` était testé, pas `(temps mort adverse)`) : la bulle
  d'humeur adverse ne s'affichait pas, et le badge « carte déclenchée » du
  JOUEUR s'affichait à la place, pile au moment où l'adversaire se sauve
  in extremis. (3) `useRef(createMatch(...))` recréait un match complet
  (2 decks + mains piochées) à CHAQUE rendu — l'argument est réévalué par
  JS à chaque rendu même si `useRef` ne garde que le premier résultat, et
  ce composant re-rend plusieurs fois par seconde. Les 3 corrigés. Écarté
  (refactor plus large, même prudence que sur arenaRenderer.ts) : fusionner
  les 2 boucles séparées (humeur/son) sur `m.events`, qui a directement
  facilité le bug (2). Vérifié : suite complète (287 tests) verte, `tsc
  --noEmit` + `npm run build` verts, funnel complet capturé en Chromium
  headless sans régression visuelle (pas de harnais de test composant
  React dans ce projet pour ces 3 bugs côté boucle de jeu UI).
- 2026-08-18 (routine) : Changement d'angle une fois `game/`/`systems/`
  quasi entièrement couverts : audit de code (skill code-review) sur
  `render/arenaRenderer.ts`, jamais audité pour des bugs (seulement les
  captures visuelles). **Vrai bug trouvé** : `reducedMotion` (WCAG 2.3.3)
  appelait `window.matchMedia(...).matches` sans try/catch — seulement des
  gardes `typeof`, qui ne protègent PAS contre l'appel lui-même qui jette
  (même piège que `hasStorage`, déjà corrigé ailleurs mais pas ici). Sur
  un navigateur durci/anti-fingerprinting, `new ArenaRenderer()` plantait
  dans son initialiseur de champ → ErrorBoundary → « K.O. TECHNIQUE » sur
  le match ENTIER pour un simple réglage d'accessibilité. Confirmé par un
  test qui échouait avant correctif (`git stash` du seul fichier source).
  Corrigé avec le même patron IIFE try/catch que `hasStorage`. Second
  point de l'audit (préférence lue seulement à la construction, pas en
  direct) délibérément écarté : pas de `dispose()` sur `ArenaRenderer`
  pour retirer un listener proprement, risque de fuite jugé supérieur à
  la valeur. 1 test, engine.test.ts 286 → 287. `tsc --noEmit` +
  `npm run build` verts.
- 2026-08-18 (routine) : `systems/pitch.ts` (97,5 % → 100 %) : le
  garde-fou « buffer trop court pour le lag le plus grave » (MIN_HZ =
  70 Hz) n'avait jamais été exercé, distinct du rejet par énergie faible
  déjà testé. Écarté délibérément (valeur nulle) : la branche `den === 0`
  de la corrélation, qui ne peut arriver que dans un angle mort structurel
  très spécifique jamais produit par un vrai signal micro. Aucun bug
  trouvé. 1 test, engine.test.ts 285 → 286. `tsc --noEmit` +
  `npm run build` verts.
- 2026-08-18 (routine) : Dernier passage de la série sur `systems/` :
  `sound.ts` (fonctions 95,45 % → 100 %). Le catch muet de
  `stop()`/`ctx.close()` fermé (même point laissé de côté sur voice.ts 2
  itérations plus tôt). Découverte plus intéressante : `setCrowdHype()`
  n'avait jamais réellement programmé sa rampe de foule dans aucun test —
  le test global appelle toujours `ss.hit(true)` AVANT, ce qui arme
  `roarUntil` dans le futur du `currentTime` figé du fake `AudioContext`
  (qui n'avance jamais), et le garde-fou anti-écrasement de rampe (ajouté
  le 16 pour un tout autre bug) bloquait silencieusement ce test-ci aussi
  — jamais remarqué faute d'assertion sur l'appel réel de
  `linearRampToValueAtTime`. Nouveau test isolé (sans clameur préalable)
  confirme la rampe à la valeur exacte. Aucun bug trouvé. 2 tests,
  engine.test.ts 283 → 285. `tsc --noEmit` + `npm run build` verts.
- 2026-08-18 (routine) : Même famille de bug de méthodologie trouvée déjà
  2 fois (facecam.ts, liveCutPlayer.ts) traquée dans `systems/recorder.ts`
  (fonctions 91,66 % → 100 %) : `HighlightRecorder.start()` câble
  `setInterval(() => this.rotate(), segmentMs)`, mais tous les tests
  appelaient `rotate()` directement en mockant `setInterval` en `() => 0`
  — le vrai câblage timer → rotation n'avait jamais tourné. Idem pour
  `MatchRecorder.download()` : `setTimeout(() => URL.revokeObjectURL(url),
  5000)` n'avait jamais le temps de s'écouler dans les tests existants —
  vérifié avec `vi.useFakeTimers()` (rien avant 4999 ms, révocation exacte
  à 5000 ms). Complété par le garde-fou `startSegment()` sans flux actif.
  Aucun bug trouvé. 3 tests, engine.test.ts 280 → 283. `tsc --noEmit` +
  `npm run build` verts.
- 2026-08-18 (routine) : Coverage-driven bug hunt sur `liveCutPlayer.ts`
  (fonctions 80 % → 100 %) : `setLibrary()`, la VRAIE API appelée par
  `ArenaScreen.tsx` une fois le préchargement async des clips terminé,
  n'avait jamais été appelée par un seul test — tous construisaient le
  lecteur avec sa bibliothèque déjà en main via le constructeur,
  contournant le scénario réel « vide au départ, remplie plus tard ».
  Vérifié bout en bout : `current()` reste `null` avec la bibliothèque
  vide, puis `setLibrary()` avec une vraie bibliothèque fait bien
  apparaître un clip au prochain `update()` — la substitution prend
  réellement effet en cours de partie. Aucun bug trouvé. 1 test,
  engine.test.ts 279 → 280. `tsc --noEmit` + `npm run build` verts.
- 2026-08-18 (routine) : Coverage-driven bug hunt sur `systems/facecam.ts`
  (fonctions 66,66 % → 100 %) : `start()` câble `setInterval(() =>
  this.sample(), 180)`, mais le mock `setInterval` de TOUS les tests
  existants (`() => 999`) n'appelait jamais réellement le callback —
  `sample()` était bien testée en isolation (appelée directement), mais le
  CÂBLAGE réel de `start()` vers `sample()` n'avait jamais tourné.
  Corrigé en capturant et invoquant le callback manuellement (2 ticks,
  delta d'énergie vérifié à la valeur exacte). Complété par `video.play()`
  qui rejette (catch muet assumé). Aucun bug trouvé. 2 tests,
  engine.test.ts 277 → 279. `tsc --noEmit` + `npm run build` verts.
- 2026-08-18 (routine) : Coverage-driven bug hunt sur `systems/voice.ts`
  (93,4 % → 97,8 %, fonctions 75 % → 91,66 %) : `consumeCommand()`, la
  VRAIE API utilisée chaque frame par `ArenaScreen.tsx` pour lire ET vider
  la commande vocale en attente, n'avait jamais été appelée par un seul
  test — tous lisaient `state.pendingCommand` directement, contournant
  entièrement la sémantique de consommation (même famille de piège que
  d'autres bugs de consommation déjà trouvés dans ce dépôt). Vérifié bout
  en bout : rien au départ, consommée une fois, l'état vidé, une 2e
  consommation ne retourne plus rien. Complété par `rec.onerror` (no-op
  assumé) et un chemin distinct du bug `supported` déjà corrigé — un
  constructeur qui réussit mais dont `rec.start()` jette au premier appel.
  Aucun nouveau bug trouvé. 3 tests, engine.test.ts 274 → 277. `tsc
  --noEmit` + `npm run build` verts.
- 2026-08-18 (routine) : Coverage-driven bug hunt sur `sceneDirector.ts`
  (le Réalisateur, 87,5 % → 97,72 %) : la fonction manquante (fonctions à
  80 %) était en fait deux callbacks de comparateur `Array.sort()` — garder
  les 2 meilleurs moments forts par score puis les re-trier
  chronologiquement — jamais réellement exécutés car tous les tests
  précédents n'avaient qu'un seul candidat en jeu, et `sort()` n'appelle
  son comparateur qu'à partir de 2 éléments. Test à 3 rounds construit pour
  forcer un vrai réordonnancement (le plus faible éliminé, les 2 meilleurs
  remis dans l'ordre chronologique après un tri par score qui les avait
  inversés) — confirme l'algorithme correct. Complété par le flush du
  candidat en cours quand le dernier round finit directement sur
  `matchEnd` sans `roundEnd`, et les branches `colorWord` encore jamais
  exercées (hex invalide, black, grey, orange, yellow, green, teal). Aucun
  bug trouvé. 3 tests, engine.test.ts 271 → 274, fonctions à 100 % — ne
  restent que 2 lignes de code défensif prouvablement inatteignable.
  `tsc --noEmit` + `npm run build` verts.
- 2026-08-18 (routine) : `combat.ts` désormais essentiellement plafonné,
  passage à `deckBuilder.ts` (94 % → 100 %) : `buildDeckFromTemplate`
  jamais appelée sans signature ni avec de vraies cartes forgées non
  vides. **Piège de méthodologie trouvé en cours de route** (pas un bug
  produit, un piège de test) : un premier essai de test `hasStorage=false`
  placé tôt dans le fichier avec son propre `vi.resetModules()` cassait la
  suite complète de façon DÉTERMINISTE — `hasStorage` de `story.ts` est
  figé à l'évaluation du module, et la prochaine ré-évaluation dynamique
  (dans un describe plus bas sans son propre `beforeEach` de
  `localStorage`) capturait un `hasStorage=false` erroné pour tout le
  reste de la suite. Diagnostiqué en isolant le test qui échouait,
  confirmé passant seul puis échouant dans la suite complète. Corrigé en
  déplaçant le test dans le bloc de résilience déjà existant en fin de
  fichier (reset + nettoyage à CHAQUE test). 2 tests, engine.test.ts
  269 → 271, suite vérifiée sur 15 exécutions consécutives. Couverture
  `deckBuilder.ts` → 100 % (stmts/lignes/fonctions). `tsc --noEmit` +
  `npm run build` verts.
- 2026-08-18 (routine) : Dernière ligne droite du coverage-driven bug hunt
  sur `combat.ts` — 5 derniers écarts fermés : `armCounterMul` jamais
  exercé par un vrai `playCard` (Contre Parfait joué par le joueur,
  vérifié bout en bout, pas juste posé à la main) ; le trait Sanguin
  (`voiceW=0.9` sur voix forte) jamais exercé par aucun test `tick()`
  (Fang, comparaison voix forte vs faible à trait égal) ; la dernière case
  jamais évaluée d'`enemyCardValue` (`dodgeBonus`, via Forteresse) ;
  `tick()` rappelé après `matchEnd` — vérifié comme no-op silencieux
  (snapshot JSON complet hors `t`, qui seul avance) ; `planLabel()`,
  fonction exportée jamais appelée par un test. Aucun bug trouvé. 5 tests,
  engine.test.ts 264 → 269, suite complète vérifiée sur 15 exécutions
  consécutives. Couverture `combat.ts` 95,65 % → **97,49 %** (stmts),
  **100 %** fonctions — ne reste que `drawEnemyCards` (jumelle privée,
  écartée délibérément). `tsc --noEmit` + `npm run build` verts.
- 2026-08-18 (routine) : **Vrai bug trouvé** en poursuivant l'audit coverage
  sur le trickle de Hype passif du joueur (`combat.ts`) : `wasFull` était
  calculé APRÈS que l'auto-motivation silencieuse ait déjà rempli la jauge
  — un joueur atteignant 100 % de Hype par ce seul trickle (coach
  totalement silencieux ce tick) ne recevait JAMAIS l'événement `hypeFull`,
  donc ni le son ni le flash visuel, alors que le minuteur de l'Initiative
  démarrait quand même en silence. Confirmé par un test qui échouait avant
  correctif. Corrigé en capturant `wasFull` avant le trickle passif et en
  vérifiant le franchissement après les deux incréments (passif + actif)
  au lieu du seul actif. Un 2e test ferme les 4 dernières cases jamais
  évaluées d'`enemyCardValue` (hype branche <75, armCheerHype,
  blockEnemyCard, drainSouffle). engine.test.ts 262 → 264, suite complète
  vérifiée sur 15 exécutions consécutives. Couverture `combat.ts` 95,31 % →
  95,65 % (stmts). `tsc --noEmit` + `npm run build` verts.
- 2026-08-18 (routine) : Coverage-driven bug hunt sur `enemyCardValue`
  (`combat.ts`, la grille de valeur du coach fantôme adverse) : 9 de ses 15
  cases de switch (enemyHype, immuneConfusion, armCounterMul,
  armAttackFrenzy, lowHpHypeFull, provoke, counterHype, hitsTakenHype,
  halveEnemySpecial) n'avaient jamais tourné. Fonction non exportée, mais
  `enemyCornerPlay` l'appelle sur chaque carte de la main adverse pendant
  l'évaluation (achetée ou non) : garnir la main d'une carte par effet
  suffit à exercer chaque case, sans dépendre du choix final de l'IA. 2
  tests avec états opposés (Hype haute + adversaire blessé, puis l'inverse)
  pour fermer aussi les branches des 3 ternaires internes, chacun
  vérifiant EN PLUS la carte réellement achetée et l'effet réellement
  appliqué (pas juste l'absence de crash) — valeurs pré-calculées à la main
  avant d'écrire le test, les deux passent du premier coup. Aucun bug
  trouvé. 2 tests, engine.test.ts 260 → 262, suite complète vérifiée sur 8
  exécutions consécutives. Couverture `combat.ts` 92,97 % → 95,31 % (stmts),
  branches 82,49 % → 86,81 %. `tsc --noEmit` + `npm run build` verts.
- 2026-08-18 (routine) : Coverage-driven bug hunt sur `story.ts` (Mode
  Histoire) : le résumé texte de `npm run coverage` affichait « Lignes
  100 % » pour ce fichier alors que 4 branches précises restaient mortes —
  trouvées en lisant directement `coverage-final.json` plutôt que le
  résumé, qui masque les branches partielles sur des lignes par ailleurs
  couvertes. `baseChar` avait un fallback `?? ROSTER[0]` jamais exercé
  (opponentId inconnu du roster) ; `chapterEnemyDeck` un fallback `?? []`
  jamais exercé (id de chapitre inconnu, même famille qu'`isUnlocked` déjà
  testée) ; `loadCleared`/`markCleared` avaient leur chemin
  `hasStorage === false` jamais réellement appelé (le test de résilience
  « localStorage bloqué » importait déjà le module dans cet état mais
  n'appelait jamais ces deux fonctions ensuite). Aucun bug trouvé. 4
  tests, engine.test.ts 256 → 260, suite complète vérifiée sur 8
  exécutions consécutives. `story.ts` à 100 % sur toutes les métriques
  désormais. `tsc --noEmit` + `npm run build` verts.
- 2026-08-18 (routine) : Nouvelle passe de coverage-driven bug hunt sur
  `combat.ts` : `chargeUlti` déclenche `ultiReady` par deux chemins (perte
  de round, déjà testé ; dégâts de combat normaux, jamais testé) ; `drawCards`
  n'avait jamais exercé ni le remélange défausse→pioche quand la pioche est
  vide, ni l'arrêt propre quand pioche ET défausse sont vides. La fonction
  jumelle privée `drawEnemyCards` (non exportée, logique identique) n'a pas
  été testée séparément, valeur marginale trop faible. 3 tests, vérifiés sur
  15 exécutions consécutives de la suite complète avant de commiter. Aucun
  bug trouvé. engine.test.ts 253 → 256. Couverture `combat.ts` 92,1 % →
  93,14 % (stmts), fonctions 97,5 %. `tsc --noEmit` + `npm run build` verts.
- 2026-08-18 (routine) : Suite du flake trouvé la fois précédente : 25
  exécutions complètes de la suite (248 tests) d'affilée, zéro échec —
  confirme que la fuite (`enemyCornerPlay` piochant une vraie carte
  pendant un test mal isolé) était bien limitée au seul test déjà
  corrigé, pas symptomatique d'un problème plus large. Ensuite, 3
  dernières zones réelles de `combat.ts` jamais exercées : le KO NATUREL
  (PV à 0 en combat, pas via `forceRoundTimeout`) déclenchant `endRound`
  pour le bon camp ; perdre un round avec l'Ulti déjà proche du plein
  (90/100) déborde à 100 et déclenche `ultiReady` ; l'Initiative (Hype
  pleine + coach silencieux > 6 s → spécial automatique, et PAS avant 6 s)
  et la Dernière Chance côté JOUEUR en combat normal (déjà testée côté
  adverse et via temps mort d'urgence, jamais ce déclenchement précis). 5
  tests, chacun vérifié sur 15 exécutions consécutives de la suite
  complète avant de commiter — leçon directement tirée du flake
  précédent. Aucun bug trouvé. engine.test.ts 248 → 253. Couverture
  combat.ts 90,8 % → 92,1 %. `tsc --noEmit` + `npm run build` verts.
- 2026-08-18 (routine) : Même sujet que juste avant, mais avec un flake
  attrapé au passage — la discipline de relancer la suite plusieurs fois
  avant de pousser (pas juste une) a payé. Le test « Vol de Souffle
  adverse, une seule fois » échouait ~4 fois sur 5 en suite COMPLÈTE,
  jamais en isolation : `enemyCornerPlay(m)`, appelé par ce même `tick()`
  juste après la consommation du vol, peut piocher et jouer une VRAIE
  carte `drainSouffle` du starter deck adverse et réarmer le mod dans le
  même tick — pas un bug du jeu, un flou de test pas assez déterministe.
  Corrigé en vidant `enemyHand`/`enemyDeck` avant le tick des 2 tests
  concernés, confirmé stable sur 6 exécutions consécutives avant de
  commiter. Couverture combat.ts finalement 90,1 % → 90,8 %.
- 2026-08-18 (routine) : La transition `roundEnd → tactics`/`matchEnd`
  dans `tick()` — le cœur même du passage d'un round à l'autre — n'avait
  jamais été exercée directement, seulement traversée incidemment par
  d'autres tests. 4 tests : `matchEnd` avec le bon vainqueur pour les
  deux camps ; et le « Vol de Souffle adverse » (déjà testé côté
  application DSL, jamais pour son vrai effet de jeu) réduit le Souffle
  de la pause suivante exactement une fois, avec l'event dédié, sans
  jamais descendre sous zéro. Aucun bug trouvé. engine.test.ts 244 → 248.
  Couverture combat.ts 90,1 % → 93 %. `tsc --noEmit` + `npm run build`
  verts.
- 2026-08-18 (routine) : Dernier mécanisme de jeu réel non testé trouvé
  dans `startNextRound` : une carte « provocation » jouée au coin du ring
  ne prend pas effet immédiatement — elle se met en attente et n'active
  le verrouillage agressif de l'adversaire qu'au démarrage du round
  SUIVANT. 2 tests symétriques (un par camp) : une provocation posée par
  le joueur verrouille l'ADVERSAIRE, pas lui-même, et vice-versa — motif
  d'inversion déjà rencontré ailleurs dans ce fichier (`m.mods` appartient
  au camp qui a joué la carte, mais l'effet retombe sur l'autre camp).
  Aucun bug trouvé. engine.test.ts 242 → 244. Couverture combat.ts 90 %
  → 90,1 %. `tsc --noEmit` + `npm run build` verts.
- 2026-08-18 (routine) : `forceRoundTimeout`/`chooseTacticPlan`/
  `addSpeechHype` — 3 fonctions exportées de `combat.ts`, utilisées en
  production (timer de round, attract mode du titre, écran du coin du
  ring) mais jamais exercées par un test. 6 tests, dont une VRAIE égalité
  de ratio PV pour tester le `>=` de `forceRoundTimeout` — piège attrapé
  en l'écrivant : Kenta et Rei ont des maxHp différents (110 vs 95), donc
  déduire l'égalité d'un pourcentage arrondi séparément de chaque côté ne
  produit PAS un ratio identique ; corrigé en égalisant les maxHp
  explicitement. Aucun bug trouvé. engine.test.ts 236 → 242. Couverture
  combat.ts 88,5 % → 90 % (fonctions 90 % → 97,5 %). `tsc --noEmit` +
  `npm run build` verts.
- 2026-08-17 (routine) : Fini de couvrir `enemyCoachAI` : les deux
  dernières branches restantes (Frénésie/Cri de Guerre armés côté coin
  adverse, symétrique du joueur déjà testé). 1 test calibré pour forcer
  `pick(['neutral', 'aggressive'])` vers 'aggressive' tout en restant
  sous le seuil probabiliste d'entrée — un seul `Math.random()` mocké
  satisfait les deux contraintes. Aucun bug trouvé. engine.test.ts
  235 → 236. Couverture combat.ts 86,5 % → 88,5 %. `tsc --noEmit` + `npm
  run build` verts.
- 2026-08-17 (routine) : 4e passe de coverage-driven bug hunt sur
  `combat.ts` : `enemyCoachAI`, la logique de posture du coin adverse (le
  vrai « niveau de difficulté »), n'avait jamais tourné sous test — même
  motif que `resolveAttack` avant les 4 bugs déjà trouvés là-bas. Relu
  toute la chaîne de décision en cherchant un bug avant d'écrire quoi que
  ce soit : rien trouvé cette fois, déjà cohérente (survie/achève/contre-
  jeu/pression/mix aléatoire selon la situation), early-return propre. 8
  tests via `vi.spyOn(Math.random)`, un par branche. engine.test.ts
  227 → 235. Couverture combat.ts 83,3 % → 86,5 %. `tsc --noEmit` + `npm
  run build` verts.
- 2026-08-17 (routine) : Le même angle mort qu'`onboarding.ts` (l'itération
  précédente), systématiquement recherché dans les autres modules
  `readJson`-like qui partagent ce motif : `progression.ts`,
  `deckBuilder.ts` et `story.ts` avaient chacun le même trou (JSON de
  mauvaise forme testé, JSON réellement invalide jamais). 3 tests. Au
  passage, `getExtraCopies()` (progression.ts, utilisée par
  CharacterSelect.tsx, jamais appelée par un test) couverte en étendant
  le test `pendingReward`/`claimReward` existant. Aucun bug trouvé.
  `deckBuilder.ts`/`story.ts`/`progression.ts` atteignent tous les trois
  100 % de couverture de lignes. engine.test.ts 225 → 227. `tsc --noEmit`
  + `npm run build` verts.
- 2026-08-17 (routine) : Dernier résidu de `onboarding.ts` : les tests
  couvraient déjà le JSON valide mais de mauvaise forme, pas le JSON
  RÉELLEMENT invalide (syntaxe cassée) — deux catch différents dans
  `load()`, un seul testé. 1 test avec une chaîne non-parsable, confirme
  le repli propre sur « pas encore vu ». `onboarding.ts` atteint 100 % de
  couverture de lignes. Le reste résiduel (2 lignes de `sceneDirector.ts`,
  génération de prompts pour un pipeline Kling jamais branché) laissé de
  côté délibérément — valeur trop marginale. engine.test.ts 224 → 225.
  `tsc --noEmit` + `npm run build` verts.
- 2026-08-17 (routine) : Pivot depuis les tests (le seam de couverture
  est maintenant mûr : combat.ts ~85 %, systems/ 95,5 %) vers un trou de
  finition : le jeu est en ligne depuis plusieurs heures
  (mordrak44.github.io/Coach-Arena/), mais le README n'en parlait nulle
  part — la section « Jouer » disait juste `npm install && npm run dev`,
  comme si le jeu n'existait qu'en local. Ajouté « 🕹️ Jouer en ligne » en
  tête avec le lien direct, juste après le pitch. Fusionné l'ancienne
  section « Jouer » dans la section « Dev » existante pour éviter deux
  blocs `npm run dev` redondants. Documentation pure, rien à tester —
  `npm test`/`npm run build` relancés quand même pour confirmer qu'aucun
  fichier source n'a bougé.
- 2026-08-17 (routine) : Dernier trou de `systems/voice.ts` fermé : la
  boucle de volume/pitch de `startVolumeMeter` — le signal réel qui
  alimente le gain de Hype et la prosodie côté joueur — n'avait jamais
  tourné sous test, malgré 3 bugs déjà trouvés dans ce fichier cette
  session. Faux AudioContext/AnalyserNode + `requestAnimationFrame`
  capturé manuellement pour avancer frame par frame. 3 tests : volume
  fort → energy monte ; onde à 220 Hz → pitchRatio se met à jour (la
  prosodie marche de bout en bout, pas juste `detectPitch` en isolation) ;
  `resume()` débloque un contexte suspendu sans toucher à un contexte
  déjà actif. Aucun bug trouvé. `systems/` (5 fichiers) atteint 95,5 % de
  couverture — parti de 0 % il y a une dizaine d'itérations. 3 tests.
  engine.test.ts 221 → 224. Couverture voice.ts 74,7 % → 93,4 %. `tsc
  --noEmit` + `npm run build` verts.
- 2026-08-17 (routine) : Dernier trou de `recorder.ts` fermé : le chemin
  de SUCCÈS de `stop()` (résoudre avec un vrai `Blob`) n'avait jamais été
  exercé, ni pour `MatchRecorder` ni `HighlightRecorder` — tout ce qui a
  été testé cette session dessus couvrait les chemins d'échec (là où les
  vrais bugs étaient). 4 tests, dont la décision entre segment courant et
  `prevBlob` dans `HighlightRecorder.stop()` : un segment trop jeune
  (< 6 s, simulé en reculant `currentStartedAt`) doit céder au dernier
  segment complet. Aucun bug trouvé. `recorder.ts` atteint 100 % de
  couverture de lignes. engine.test.ts 217 → 221. Couverture recorder.ts
  74,8 % → 97,2 %. `tsc --noEmit` + `npm run build` verts.
- 2026-08-17 (routine) : Reconsidéré `systems/sound.ts` (WebAudio,
  laissé de côté à l'itération précédente comme « effort de mock élevé »)
  — en fait bon marché : toutes ses méthodes sont déjà gardées par
  `if (!this.ctx...) return`, et Node n'a justement pas d'`AudioContext`
  du tout, donc le chemin « absent » se teste sans aucun mock. 1er test :
  tous les événements de jeu enchaînés sans jamais planter avec `ctx`
  resté null. 2e : `muted` cohérent. 3e, plus généreux : un faux
  `AudioContext` minimal pour vérifier que le VRAI graphe audio
  (oscillateurs, filtres, bruit, foule) se construit sans planter aussi.
  Aucun bug trouvé. 3 tests. engine.test.ts 214 → 217. Couverture
  sound.ts 0 % → 94,5 % ; systems/ globalement 84,8 % maintenant (0 % il
  y a quelques itérations). `tsc --noEmit` + `npm run build` verts.
- 2026-08-17 (routine) : Deux choses cette itération. D'abord un incident
  CI transitoire diagnostiqué avant de toucher au code : le déploiement
  Pages a échoué pour la 1re fois depuis sa mise en ligne — logs vérifiés,
  `codeload.github.com` a renvoyé 429/503 en boucle en téléchargeant le
  bundle de `configure-pages@v5` lui-même, avant même que `npm test` ne
  tourne. Rien à voir avec ce dépôt. Relancé via `rerun_workflow_run`
  plutôt que d'attendre le prochain push — succès immédiat, sans aucun
  changement de code. Ensuite, `systems/facecam.ts` (0 % de couverture,
  jamais touché même pendant toute la série `voice.ts`/`recorder.ts`) :
  bon marché à tester (vidéo + canvas 2D + interval) contrairement à
  `sound.ts` (WebAudio pur, déjà bien gardé, laissé de côté). 4 tests :
  diff de pixels entre deux frames, lissage asymétrique vérifié à la
  valeur exacte (0,5, pas juste « > 0 »), vidéo pas prête ne plante pas,
  et le contrat de `stop()` (prev effacé pour une VRAIE nouvelle session,
  pas juste lu dans le commentaire). Aucun bug trouvé, déjà correct.
  engine.test.ts 210 → 214. Couverture facecam.ts 0 % → 96,9 %. `tsc
  --noEmit` + `npm run build` verts.
- 2026-08-17 (routine) : Retour sur `systems/voice.ts` pour couvrir enfin
  `onresult`/`onend`, le cœur réel du flux de reco vocale — malgré 2 bugs
  déjà trouvés dans ce fichier cette session. Vérifié le fix du
  2026-08-16 (plusieurs résultats finalisés dans un même event traités,
  pas seulement `resultIndex`) avec un vrai test, pas juste en faisant
  confiance au commentaire. Testé aussi le cycle relance/arrêt : `onend`
  relance la reco sauf après un `stop()` explicite. Un
  `cancelAnimationFrame` non mocké a fait planter le 1er essai — pas un
  bug du jeu (API universelle en vrai navigateur), juste un global
  manquant du bac à sable de test. 5 tests. engine.test.ts 205 → 210.
  Couverture voice.ts 49,4 % → 74,7 %. `tsc --noEmit` + `npm run build`
  verts.
- 2026-08-17 (routine) : Second bug réel, trouvé en vérifiant mon PROPRE
  commentaire du fix précédent avant de lui faire confiance : j'avais
  écrit que « le prochain rotate() (14 s plus tard) retentera » après une
  panne transitoire — un script `tsx` autonome a montré que c'était faux.
  Le garde-fou en tête de `rotate()` protégeait légitimement l'appel
  `.stop()`, mais son `return` précoce empêchait AUSSI toute tentative de
  redémarrer un segment — une fois coincé sur un recorder inactif, TOUTES
  les rotations suivantes du reste du match devenaient des no-op
  silencieux. Fix : séparé la garde de `.stop()` de la tentative de
  `startSegment()`, qui s'exécute maintenant inconditionnellement à
  chaque rotation. Confirmé avant et après fix (`git stash`). 1 test
  simulant échec puis succès sur 2 rotations. engine.test.ts 204 → 205.
  `tsc --noEmit` + `npm run build` verts.
- 2026-08-17 (routine) : BUG RÉEL trouvé en creusant `MatchRecorder`/
  `HighlightRecorder` juste après les avoir couverts. `start()` construit
  le flux composite (canvas + piste micro clonée) AVANT le
  `MediaRecorder` — si CETTE construction échoue, le `catch` faisait
  juste `return false` sans jamais relâcher le flux déjà créé : micro
  potentiellement allumé indéfiniment, canvas sollicité à 30 fps sans
  consommateur. Même fuite déjà corrigée sur le chemin d'arrêt normal
  (`releaseTracks`, 2026-08-16) mais jamais couverte sur le chemin
  d'échec du démarrage — et dupliquée à l'identique dans les DEUX classes
  qui partagent la même structure copiée-collée. Confirmé réel avant fix
  (script autonome, puis `git stash` du fichier source). Fix identique
  × 2 : `this.releaseTracks()` dans le `catch`. 2 tests. engine.test.ts
  202 → 204. `tsc --noEmit` + `npm run build` verts.
- 2026-08-17 (routine) : Coverage sur `systems/recorder.ts` (35,8 % stmts,
  laissé de côté même pendant toute la série résilience qui a pourtant
  corrigé un bug juste à côté, dans `HighlightRecorder.rotate()`).
  `fileExt`, `pickMimeType`, `shareOrDownload` (partage natif mobile →
  TikTok direct, ou repli téléchargement) n'avaient jamais eu un test.
  Relu en cherchant un bug avant d'écrire les tests : rien trouvé, la
  chaîne de repli est déjà correcte par construction (canShare absent,
  share absent, ou share qui rejette retombent tous proprement sur le
  téléchargement). 6 tests couvrant les 3 chemins de `shareOrDownload` +
  `fileExt`/`pickMimeType`, chacun vérifiant le vrai résultat observable
  (pas juste l'absence de crash). engine.test.ts 196 → 202. Couverture
  recorder.ts 35,8 % → 50 %. `tsc --noEmit` + `npm run build` verts.
- 2026-08-17 (routine) : 🎉 GitHub Pages EN LIGNE. Après ~26 runs échoués
  sur ~10 heures de vérifications de routine (toujours la même cause :
  `configure-pages@v5` ❌, site Pages jamais activé côté réglages du
  dépôt — jamais un problème de code), le réglage manuel (Settings →
  Pages → Source → « GitHub Actions ») a enfin été fait. Le run #27,
  déclenché par le push du commit `8af7ccc`, est le premier `success` de
  bout en bout. Le jeu est accessible à
  `https://mordrak44.github.io/Coach-Arena/`. Non vérifié visuellement
  dans ce sandbox (le proxy de sortie réseau bloque ce domaine — politique
  d'environnement, pas un souci du site) ; la confirmation vient du statut
  `success` de l'action GitHub officielle elle-même. Item ROADMAP
  « Hébergement » passé de `[~]` à `[x]`.
- 2026-08-17 (routine) : 4e passe d'accessibilité — les précédentes
  n'avaient touché qu'ArenaScreen.tsx et CharacterSelect.tsx ; `grep -c
  "aria-"` a confirmé zéro attribut sur les 5 autres écrans. Lecture
  complète, pas de correctifs au grep : la plupart des boutons ont déjà du
  texte visible (accessibles nativement). 3 vrais trous trouvés :
  StoryScreen (chapitre ouvert signalé seulement par une bordure de
  couleur → `aria-pressed`, même bug que CharCard la 1re passe) ;
  TitleScreen (canvas d'attract mode décoratif sans `aria-hidden`,
  annoncé comme un élément vide par un lecteur d'écran — traitement
  inverse du vrai canvas de combat qui a lui un `role="img"` descriptif) ;
  ResultsScreen (plusieurs `<video>` sans label distinctif — « vidéo »
  répété au clavier/lecteur d'écran). Vérifié en conditions réelles
  (Chromium headless) : `aria-hidden` confirmé, ET `aria-pressed` vérifié
  DYNAMIQUE (bascule vraiment au clic, pas juste présent dans le DOM).
  196 tests inchangés. `tsc --noEmit` + `npm run build` verts.
- 2026-08-17 (routine) : Suite logique du bug « contre-attaque » de tout à
  l'heure : `TRAIT_RULES` (characters.ts, `deriveTrait`/
  `createFromPrompt`) utilise le MÊME motif « premier match qui gagne, par
  ordre du tableau » que `COMMAND_PATTERNS` — et n'avait jamais été
  balayée mot-clé par mot-clé. Même traitement : 30 tests, un par mot-clé
  des 4 traits (cerebral/sanguin/fusionnel/tetu). Résultat cette fois :
  RIEN trouvé, les 30 passent du premier coup, aucune collision de
  substring entre les mots-clés. Documenté quand même — la valeur du test
  ne dépend pas d'avoir trouvé un bug, c'est lui qui attraperait une
  régression future à ce même endroit. engine.test.ts 166 → 196. `tsc
  --noEmit` + `npm run build` verts.
- 2026-08-17 (routine) : BUG RÉEL trouvé en donnant enfin un premier test
  à `matchCommand` (systems/voice.ts), le cœur du pitch « coacher à la
  voix », jamais testé jusqu'ici. `COMMAND_PATTERNS` retourne au premier
  match, et le pattern `attack` (`attaqu|fonce|...`) était testé AVANT
  `counter` (`contre|contr[- ]?attaque|...`). Comme « contre-attaque »
  contient le substring « attaqu », `attack` gagnait toujours en premier —
  le `contr[- ]?attaque` explicite de `counter` était du code mort en
  pratique. « Contre-attaque ! » est une consigne de boxe naturelle et
  fréquente : un coach qui la crie pour punir une ouverture précise se
  voyait répondre par une attaque à l'aveugle, l'exact opposé de son
  intention. Confirmé réel avant fix (`git stash`, échec confirmé sans le
  correctif). Fix : `counter` réordonné avant `attack` dans la table
  (vérifié qu'aucune régression n'est introduite sur les autres
  commandes). 4 tests (régression + non-régression + balayage des 7
  commandes + bruit ambiant). engine.test.ts 162 → 166. `tsc --noEmit` +
  `npm run build` verts.
- 2026-08-17 (routine) : Retour bref à la résilience, un dernier maillon
  trouvé en relisant `systems/recorder.ts` : `HighlightRecorder.rotate()`
  (appelé toutes les 14 s par un `setInterval` pour faire tourner les
  segments du moment fort) appelait `startSegment()` — qui construit un
  `new MediaRecorder` — SANS le try/catch que `start()` a pour ce même
  appel. Une panne transitoire à la rotation plantait donc hors de toute
  pile surveillée. Confirmé réel avant fix (`git stash`, le test échoue
  bien avant le correctif). Fix : cet appel passe dans son propre
  try/catch — la dégradation était déjà gracieuse en aval, il ne manquait
  que le filet à ce point précis. 1 test, engine.test.ts 161 → 162. `tsc
  --noEmit` + `npm run build` verts.
- 2026-08-17 (routine) : Après 4 itérations de résilience d'affilée, pivot
  vers une dimension jamais vérifiée systématiquement : le débordement
  horizontal sur petit écran. Chromium headless, viewport forcé à 3
  tailles réalistes (320×568 iPhone SE 1re gén., 360×640 petit Android,
  390×844 iPhone 14), `scrollWidth` vs `innerWidth` comparé sur 5 points
  du parcours réel (Titre, Sélection avant/après choix de perso,
  confirmation du deck-builder, Arène en mode `?demo`). 15 vérifications,
  zéro débordement détecté. Aucun code changé — vérification pure, comme
  la passe offline PWA du 16 : le layout responsive est déjà solide, ça
  dérisque une partie du TODO « Polish mobile/iOS » encore ouvert.
- 2026-08-17 (routine) : 3e maillon de la passe résilience, trouvé en
  suivant les autres accès à des API navigateur potentiellement
  jetables : `VoiceCoach.startRecognition()` posait `state.supported =
  true` AVANT même d'appeler `new Ctor()` (le constructeur
  `SpeechRecognition`), non protégé par try/catch (seul `rec.start()`
  l'était). Sur un WebView/navigateur où le constructeur existe mais
  échoue sans pont natif, `supported` restait figé à `true` — un faux
  positif affiché au joueur (ReadyScreen), pire qu'une absence honnête.
  Pire : `sys.voice.start(stream)` est appelé sans `await`/`.catch()`
  depuis ArenaScreen.tsx, donc l'exception synchrone du constructeur (dans
  une méthode async) devenait une promesse rejetée non gérée, invisible.
  Confirmé réel avant fix : `git stash` du fichier source, le test échoue
  bien AVANT le correctif, pas vacueusement vert. Fix : constructeur dans
  son propre try/catch, `supported = true` déplacé après. 2 tests,
  engine.test.ts 159 → 161. `tsc --noEmit` + `npm run build` verts.
- 2026-08-17 (routine) : Suite de la passe résilience, un cran plus
  profond que l'Error Boundary : le motif `const hasStorage = typeof
  localStorage !== 'undefined'`, dupliqué dans 6 modules (cardForge,
  deckBuilder, onboarding, progression, stable, story), protège contre
  `localStorage` ABSENT mais pas contre `localStorage` PRÉSENT dont la
  LECTURE seule jette une SecurityError (modes de confidentialité stricts,
  vieux Safari) — `typeof` doit évaluer la propriété pour connaître son
  type, donc un getter qui jette jette aussi à travers `typeof`. Un crash
  ici arrive AU CHARGEMENT DU MODULE, avant React : l'Error Boundary
  d'hier ne peut rien y faire. Confirmé réel avant correctif (un test avec
  `Object.defineProperty` + un getter qui jette + `vi.resetModules()` a
  fait planter les 6 imports avant fix). Fix identique × 6 : `try { … }
  catch { return false }` autour de la ligne, dupliqué plutôt que
  centralisé (cohérent avec le motif déjà dupliqué 6× dans ce dépôt). 6
  tests, engine.test.ts 153 → 159. `tsc --noEmit` + `npm run build` verts.
- 2026-08-17 (routine) : Après 3 passes de coverage sur `combat.ts`
  (rendements décroissants), pivot vers un vrai trou de résilience jamais
  adressé : aucun Error Boundary React n'existait nulle part (`grep`
  confirmé). Une exception non attrapée pendant un match coaché faisait
  tomber tout React à un écran BLANC en plein direct — le pire scénario
  pour un jeu pensé pour être filmé/streamé. Nouveau `src/ui/
  ErrorBoundary.tsx` (class component, seule forme capable d'intercepter
  côté React), enveloppe `<App/>` dans `main.tsx`. Écran de repli
  réutilisant les classes CSS existantes, rassure que deck forgé/Vie
  d'Écurie/progression survivent (localStorage, pas l'état React), bouton
  de rechargement. Vérifié en conditions réelles : déclencheur de crash
  TEMPORAIRE (même motif que `?demo`), Chromium headless confirmant le
  chargement normal inchangé ET `?crashtest=1` affichant le fallback au
  lieu d'un écran blanc — déclencheur retiré avant le commit (`git status`
  vérifié, `App.tsx` revenu à l'identique). `tsc --noEmit` + `npm run
  build` verts, 153 tests inchangés.
- 2026-08-17 (routine) : 3e passe du coverage-driven bug hunt sur
  `combat.ts`, ciblée sur `resolveAttack`/`fireSpecial` : les branches à
  ISSUE RARE qu'aucune simulation de match ordinaire ne déclenche
  naturellement (fenêtre de contre étroite, ou dépendantes d'un jet de dé
  précis). Isolées via `vi.spyOn(Math, 'random')` : Contre Parfait +
  Orgueil du Rival (les deux bonus armés du contre) ; la posture Garde
  (mockReturnValue(0.25), Gorō en défense pour esquive quasi nulle) ; Cœur
  Vaillant (mockReturnValue(0.99), aucune esquive/crit/garde parasite) ;
  Leçon d'Expérience (vérifié par COMPARAISON entre deux matchs
  identiques avec/sans le mod armé, pas juste la formule en isolation).
  Aucun bug trouvé — tout se comportait déjà comme documenté — mais ces 4
  mécaniques de comeback (des cartes réelles du jeu) n'avaient
  littéralement jamais tourné sous test avant aujourd'hui. 4 tests,
  engine.test.ts 149 → 153. Couverture combat.ts 80,6 % → 84,94 % (stmts).
  `tsc --noEmit` + `npm run build` verts.
- 2026-08-17 (routine) : Suite du coverage-driven bug hunt sur `combat.ts`,
  ciblé cette fois sur le switch `applyCardEffects` lui-même — le point
  unique où le DSL déclaratif des cartes devient de l'état runtime. 11 des
  15 kinds d'effet (hype, enemyHype, dodgeBonus, immuneConfusion,
  armCheerHype, armAttackFrenzy, counterHype, hitsTakenHype,
  halveEnemySpecial, blockEnemyCard, drainSouffle) n'étaient testés QUE côté
  consommation (mods posés à la main), jamais côté application via une
  vraie consigne — un typo de champ dans ce switch serait passé inaperçu.
  6 tests via `applyConsigne` (groupés par 2, la limite d'une vraie
  consigne), dont un dédié à `drainSouffle` qui cumule (+=) au lieu de
  remplacer. Aucun bug trouvé, mais la garantie que ce switch reste correct
  face à un futur refactor est désormais réelle. engine.test.ts 143 → 149.
  Couverture combat.ts 75,58 % → 80,6 % (stmts). `tsc --noEmit` + `npm run
  build` verts.
- 2026-08-17 (routine) : Retour à la couverture de tests après 3 itérations
  d'accessibilité d'affilée, ciblé sur `combat.ts` (74 % stmts, le plus gros
  fichier le moins couvert). Trouvaille : toute la modulation des ORDRES DE
  POSTURE par trait/état — le cœur du gameplay « coacher à la voix » —
  n'était jamais testée dans le moteur (seulement en Vie d'Écurie) : bonus
  Hype d'un ordre calme (Cérébral), Têtu ignorant son premier ordre, Boudeur
  avalant le premier ordre du match, Provoqué verrouillé agressif, Frénésie
  armée (Fang), Cri de Guerre armé. Aucun bug de jeu trouvé, mais un piège
  de méthode de test attrapé en cours de route : la mesure du bonus « calme »
  donnait 28 au lieu de 25, un combat auto-résolu ayant démarré dans le même
  tick que la mesure (+3 Hype d'« encaisser fait monter la rage »,
  combat.ts:596) — diagnostiqué via un script de debug, corrigé en gelant
  `nextActionAt` avant chaque tick de mesure (motif déjà utilisé par les
  tests voisins). 6 tests, engine.test.ts 137 → 143. Couverture combat.ts
  74,41 % → 75,58 % (stmts). `tsc --noEmit` + `npm run build` verts.
- 2026-08-16 (routine) : 3e dimension d'accessibilité, après ARIA/clavier
  puis contraste couleur : `prefers-reduced-motion` (WCAG 2.3.3). Le combat
  a un screen shake (7-34px) et un zoom dramatique brutal (jusqu'à ×1,32)
  déclenchés sur chaque coup et surtout spécial/ulti — exactement le genre
  de mouvement soudain, non essentiel, que WCAG demande de pouvoir
  désactiver. `grep` sur `src/` confirmait qu'aucune gestion n'existait.
  Ajout d'un champ `reducedMotion` sur `ArenaRenderer`, lu une fois à la
  construction via `window.matchMedia('(prefers-reduced-motion: reduce)')`
  (garde `typeof window !== 'undefined'`, même motif que `hasStorage`
  ailleurs dans le projet) : shake et zoom sautés dans `draw()` quand actif.
  Flash d'impact et speed lines de fond laissés intacts (pas des mouvements
  déclenchés par une interaction, hors périmètre de 2.3.3) — portée
  délibérément restreinte aux deux effets réellement concernés. 3 tests
  unitaires + vérification Chromium headless via `page.emulateMedia()`
  confirmant que la préférence émulée atteint bien `window.matchMedia`
  dans les deux sens. engine.test.ts 134 → 137. `tsc --noEmit` + `npm run
  build` verts.
- 2026-08-16 (routine) : Après l'audit ARIA/clavier des deux itérations
  précédentes, une dimension d'accessibilité distincte jamais vérifiée :
  le CONTRASTE des couleurs (WCAG AA). Calculé la luminosité relative +
  le ratio de contraste pour tous les couples texte/fond du thème CSS
  et pour les 6 couleurs de marque du roster utilisées comme texte (le
  nom du perso dans `CharCard`). 2 défauts réels trouvés :
  - `--violet` (coûts de carte « ●●● ») à 4,42:1 sur `--panel2`, sous le
    seuil AA de 4,5:1 pour du texte normal — éclairci légèrement dans
    `styles.css` (4,77:1, même teinte).
  - Plus significatif : Rei (`#6c5ce7`, 3,34:1) et Gorō (`#636e72`,
    3,09:1) — leurs noms dans `CharCard` tombaient nettement sous la
    barre. Contrairement aux corrections ARIA des deux dernières
    itérations (qui aident surtout les lecteurs d'écran), celle-ci est
    un problème de LISIBILITÉ pour TOUS les joueurs — un vrai défaut de
    design, pas juste un manque de métadonnées. Corrigé avec
    `readableTextColor(hex, bgHex, minRatio)`, une nouvelle fonction
    pure dans `characters.ts` qui éclaircit une couleur juste assez pour
    atteindre le contraste requis (mélange progressif vers le blanc, la
    teinte reste reconnaissable), appliquée UNIQUEMENT au rendu du texte
    — `char.color` reste inchangé pour la silhouette du perso dans
    l'arène, où les règles de contraste texte ne s'appliquent pas.
    Couvre aussi gratuitement les couleurs arbitraires des persos créés
    par prompt, pas seulement les 6 du roster. `ReadyScreen.tsx`
    (mêmes noms, format VS) délibérément NON touché : sa taille de
    police (20,8 px/900) franchit le seuil WCAG de « grand texte », où
    3:1 suffit — Rei/Gorō le passent déjà là-bas sans rien changer.
  Vérifié en conditions réelles, pas en isolation : capture Chromium +
  lecture directe de `getComputedStyle(...).color` sur les vrais noms
  rendus dans le navigateur, contraste recalculé sur les valeurs RGB
  effectives (4,60:1 et 4,66:1), pas seulement sur ce que la fonction
  renvoie en théorie. 4 nouveaux tests (dont un qui balaie toute la
  palette du roster pour verrouiller la propriété generalement, pas
  juste les deux cas trouvés). engine.test.ts 130 → 134, `tsc
  --noEmit`/`npm run build` verts.

- 2026-08-16 (routine) : Correction de la friction clavier notée hier
  (62 appuis Tab pour atteindre la confirmation du deck) plutôt qu'une
  nouvelle passe de vérification pure — après plusieurs itérations
  « rien à changer, juste confirmé », celle-ci avait un vrai correctif
  concret déjà identifié. Ajout d'un lien d'évitement standard (« skip
  link », patron connu du web accessible) juste avant les ~40
  boutons −/+ du deck-builder : invisible hors focus (`position:
  absolute; left: -9999px`), redevient visible et lisible dès qu'il
  reçoit le focus clavier, saute directement au bouton de confirmation
  quand activé. Un joueur souris/tactile ne le voit jamais ; un joueur
  100 % clavier qui accepte le deck par défaut peut désormais sauter
  d'un coup ce qui prenait 62 Tab. Vérifié en conditions réelles
  (Chromium headless, vraies touches clavier, pas juste la présence du
  markup) : hors-écran avant focus, visible une fois focus (capture),
  activation déplace bien le focus sur le bon bouton — et capture
  avant/après confirmant zéro régression visuelle pour le flux souris.
  `tsc --noEmit`/`npm run build`/130 tests vitest inchangés (pur ajout
  de markup, aucune logique de jeu touchée).

- 2026-08-16 (routine) : Suite logique de l'audit d'accessibilité de la
  veille (qui avait confirmé que chaque élément cliquable est un vrai
  `<button>` avec gestion clavier native, mais seulement en LISANT le
  code) : un parcours 100 % clavier vérifié bout-en-bout pour la
  première fois, joué réellement en Chromium headless plutôt que déduit
  du code. Micro/caméra refusés d'emblée dans le test pour forcer le
  vrai chemin de repli documenté au README, pas un chemin qui se
  contente d'avoir un micro accordé. Parcours complet réussi sans aucun
  clic souris : Titre → Sélection de perso (Tab jusqu'à une CharCard,
  Entrée, `aria-pressed` confirmé — l'attribut ajouté hier fonctionne
  vraiment, pas juste présent dans le DOM) → confirmation du deck →
  Vestiaire → Arène (un round entier joué en temps réel aux touches
  A/D/E/C jusqu'au Coin du ring) → sélection d'un plan tactique dans
  l'overlay (Tab, Entrée, `aria-pressed` confirmé encore). Zéro erreur
  JS de bout en bout. Un vrai piège trouvé en route, mais dans le SCRIPT
  DE VÉRIFICATION, pas le jeu : `element.innerText` reflète les
  transformations CSS (`text-transform: uppercase`), donc chercher
  `'Coin du ring'` en respectant la casse échouait pendant que l'overlay
  était pourtant bien affiché à l'écran — corrigé en comparant en
  minuscules, une bonne leçon sur `innerText` vs `textContent` pour de
  futurs scripts de vérification. Seule observation notée sans être
  corrigée : le deck-builder demande 62 appuis Tab pour atteindre la
  confirmation (~20 cartes × 2 boutons −/+ chacune) — un peu long pour
  un joueur 100 % clavier, mais fonctionnel, pas cassé. Aucun code
  changé — pure vérification.

- 2026-08-16 (routine) : Après le balayage `scripts/`, cherché un autre
  angle jamais couvert. Tenté le skill `security-review`, mais il
  dépend d'un diff contre `origin/HEAD` que la structure du dépôt (une
  seule branche, pas de base distincte) ne fournit pas — échec
  d'environnement, pas un refus de faire la passe. Fait une revue
  sécurité manuelle ciblée à la place (grep de `dangerouslySetInnerHTML`
  /`eval`/`innerHTML` — rien ; regex à quantificateurs imbriqués
  (ReDoS) dans les fichiers de règles — rien) : rien d'exploitable, ce
  qui est cohérent avec la nature de l'appli (100 % client, aucun
  serveur, aucune frontière de confiance à franchir — la vraie
  catégorie de risque ici est la DISPONIBILITÉ, un plantage, pas la
  confidentialité, déjà couverte par le grand ménage `JSON.parse` de
  plus tôt cette session). Plutôt que de forcer un résultat qui n'existe
  pas, pivoté vers une VÉRIFICATION concrète jamais faite : le repli
  hors-ligne de la PWA, testé bout-en-bout en Chromium headless
  (`context.setOffline`) pour la première fois — jusqu'ici seulement
  relu au code, jamais réellement exécuté sans réseau. Résultat : ça
  marche, avec une nuance découverte en creusant (pas un bug, le cycle
  de vie standard des service workers) — la toute PREMIÈRE visite ne
  peut rien mettre en cache (le SW s'enregistre après `load`, donc ne
  contrôle pas encore cette première navigation), mais dès la 2e visite
  en ligne tout se met en cache correctement (vérifié en lisant
  `caches.keys()` directement), et la 3e visite hors ligne affiche
  l'écran titre intégralement. Concrètement peu limitant pour un vrai
  joueur, puisque le prompt d'installation PWA lui-même n'apparaît
  qu'après un premier chargement réussi. Aucun code changé — pure
  vérification, comportement confirmé conforme à l'intention déjà
  documentée dans `sw.js`.

- 2026-08-16 (routine) : Nouveau périmètre jamais audité — `scripts/`
  (les 8 rounds de code-review précédents ne ciblaient que `src/`).
  `sim.ts` (l'outil d'équilibrage, la seule source de winrates du
  projet) et `shot.mjs` (le funnel de captures). Un vrai bug de DONNÉES
  trouvé : la simulation « Coach absent » de `sim.ts` appelait quand
  même `chooseTacticPlan(m, 'pressure')` à chaque pause tactique, alors
  que dans le vrai jeu un coach absent ne clique jamais de plan —
  `combat.ts` retombe sur `'coldblood'` au timeout, pas `'pressure'`.
  Le chiffre « Coach absent » du script mesurait donc un coach qui garde
  la voix silencieuse mais choisit quand même la posture la plus
  agressive à chaque pause, invalidant en silence la comparaison
  coaché/absent — la raison d'être même de cet outil. Corrigé en gatant
  l'appel sur `opts.coached`. Effet mesuré, pas supposé : le winrate
  « Coach absent » tombe à 20 % après fix, un contraste bien plus net
  et cohérent avec l'intention du test. Deux nettoyages de robustesse en
  plus : une boucle sans plafond d'itérations dans `sim.ts` (le seul
  endroit du fichier qui pouvait tourner indéfiniment sans erreur si la
  machine à états se bloquait un jour) ; `shot.mjs` qui fermait Chromium
  seulement sur le succès (fuite de process sur échec) et n'écoutait pas
  les erreurs de spawn du serveur `vite preview`. Vérifié en conditions
  réelles (ces fichiers sont hors du périmètre `tsconfig.json`, donc
  hors de portée de `tsc`) : `npx tsx scripts/sim.ts` tourne jusqu'au
  bout sans erreur, `node scripts/shot.mjs` régénère les 7 captures du
  funnel standard avec succès — confirmant au passage que le récent
  changement de `base` (GitHub Pages) n'a rien cassé ici : Vite préserve
  la query string sur sa redirection 302, donc les URLs codées en dur
  du script marchent toujours sans modification.

- 2026-08-16 (routine) : Avec les séries d'audit code-review (8 rounds)
  et de coverage (7 passes) toutes deux épuisées, changé d'angle plutôt
  que de continuer à gratter les mêmes fichiers : premier audit
  d'ACCESSIBILITÉ du dépôt, jamais fait jusqu'ici. Délégué à un agent
  Explore en lecture seule sur les 7 fichiers `src/ui/` — bonne nouvelle
  d'abord : chaque élément cliquable du jeu est un vrai `<button>` avec
  gestion clavier native, zéro `div onClick` factice nulle part. Le
  vrai manque, partout, ce sont les NOMS accessibles (glyphes/emojis
  seuls sans `aria-label`) et les ÉTATS (sélection signalée seulement
  par une bordure colorée). 8 points trouvés, 7 corrigés directement :
  `aria-pressed` sur `CharCard` et les cartes de plan tactique ;
  `aria-label` avec la vraie valeur sur `StatBar` (la barre ne portait
  que la largeur visuelle, pas le chiffre) ; `aria-label` dynamique par
  carte sur les boutons −/+ du deck-builder (un par carte du pool, sinon
  un lecteur d'écran énumère une longue liste de boutons « moins »/
  « plus » indiscernables) ; `aria-label` sur le bouton de forge (icône
  seule) et les 3 champs texte qui ne s'appuyaient que sur `placeholder`
  (jamais fiable comme nom accessible — disparaît dès que l'utilisateur
  tape) ; et une table emoji→phrase FR pour la tuile du coach adverse,
  dont l'humeur passe souvent par un emoji seul sans bulle de texte —
  un signal de jeu réel (spécial déclenché, round gagné/perdu) qui
  était totalement invisible en lecteur d'écran. Le 8e point — le
  canvas de combat (PV/Hype/Ulti/chrono) n'avait ni rôle ni nom, donc un
  lecteur d'écran l'ignorait comme s'il n'existait pas — traité en
  filet minimal (`role="img"` + `aria-label` descriptif) plutôt qu'en
  solution complète : un vrai flux `aria-live` valeur par valeur
  demanderait un throttling dédié pour ne pas spammer les annonces à
  chaque frame, noté comme chantier séparé plutôt que bâclé ici.
  Vérifié en conditions réelles : capture Chromium headless (zéro
  régression visuelle sur les deux écrans) ET lecture directe des
  attributs ARIA via Playwright (valeurs exactes confirmées, pas
  seulement leur présence). `tsc --noEmit`/`npm run build`/130 tests
  vitest inchangés (pur ajout d'attributs, aucune logique de jeu
  touchée).

- 2026-08-16 (routine) : Septième et dernière passe sur le rapport de
  coverage — nettoyage des écarts épars restants plutôt qu'un gros
  fichier isolé (les précédentes cibles avaient toutes >20 points à
  gagner ; il ne restait plus que quelques lignes par-ci par-là).
  characters.ts (100 %, les 6 dernières règles de `RULES` jamais
  exercées) ; cards.ts (100 %, `getCustomCards()` jamais testé
  directement + la branche `drainSouffle` de `clampEffect`) ;
  sceneQueue.ts (97 %, le chemin `.catch()` d'un submitter qui REJETTE
  une vraie exception — tous les tests précédents ne couvraient que
  l'échec « propre » via `resolve(null)` ou le timeout, jamais un vrai
  rejet de Promise) ; stable.ts (98 %, `desireText()` jamais appelée
  alors qu'elle est utilisée en production dans `CharacterSelect.tsx`,
  plus une vraie erreur de SYNTAXE JSON distincte du cas « mauvaise
  forme » déjà couvert par le fix du round 6 d'audit). Rien de cassé
  trouvé cette fois, mais un piège découvert en écrivant le test
  `desireText` lui-même : appeler `getStable` avec un trait différent
  de celui du perso testé désynchronise le pool d'envies tiré de celui
  que `desireText` relit ensuite via `char.trait` — pas un bug du code
  de prod, juste un piège de test à connaître, corrigé en passant
  `ROSTER[0].trait` explicitement. Couverture globale du dépôt :
  84 % → 86 % (lignes : 87,6 %). engine.test.ts 125 → 130, `tsc
  --noEmit`/`npm run build` verts, stable sur 4 exécutions.
  Avec cette passe, la série de coverage systématique touche à sa fin :
  le seul écart notable qui reste est combat.ts (72 %), délibérément
  laissé de côté car son test réel est `scripts/sim.ts` (des milliers
  de matchs simulés), pas des tests unitaires ligne par ligne.

- 2026-08-16 (routine) : Sixième passe sur le rapport de coverage —
  sceneDirector.ts, 76 % → 88 %. `momentPrompt` et le calcul de l'id de
  référence (`by`) gèrent 4 types d'événements (ulti/special/countered/
  hit), mais seuls ulti et hit (crit) avaient un test — special et
  countered jamais. Choix pas anodin : ce sont exactement les deux kinds
  qui passent par la branche `by` GÉNÉRIQUE (`c.e.by === 'enemy' ?
  enemy : player`), par opposition à la branche spéciale de `hit`
  (`target`) qui avait révélé un vrai bug au round 8 d'audit — un bon
  candidat pour vérifier qu'elles n'ont pas un défaut analogue. Rien de
  cassé trouvé cette fois : les deux référencent bien le bon perso. 2
  nouveaux tests le confirment, plus 1 pour les branches purple/pink de
  `colorWord` (jamais atteintes). Les 2 dernières lignes non couvertes
  du fichier sont du code défensif structurellement inatteignable (les
  branches `default` ne sont jamais visitées vu que l'appelant filtre
  déjà sur `eventScore > 0`) — laissées telles quelles. engine.test.ts
  122 → 125, `tsc --noEmit`/`npm run build` verts, stable sur 3
  exécutions.

- 2026-08-16 (routine) : Cinquième passe sur le rapport de coverage —
  cardForge.ts, 65 % → 94 %, redevenu le plus gros écart après le
  balayage JSON.parse. Seules 5 des 14 règles de la Forge de cartes
  étaient exercées par les tests existants ; les 9 autres — et les cas
  correspondants de `describe()`, le texte de la carte affiché au
  joueur — n'avaient jamais été vérifiés. 2 nouveaux tests couvrent les
  9 règles manquantes (kind ET texte de description pour chacune,
  prompts choisis pour isoler une seule règle à la fois) plus la
  branche `condition` de `deriveTiming`. Rien de cassé cette fois —
  contrairement aux 4 dernières cibles de coverage, qui avaient chacune
  révélé un bug réel : un résultat sain, pas un échec de la méthode.
  engine.test.ts 120 → 122, `tsc --noEmit`/`npm run build` verts,
  stable sur 3 exécutions.

- 2026-08-16 (routine) : Après 3 occurrences de la même famille de bug
  en 3 jours (stable.ts, deckBuilder.ts, story.ts — un `JSON.parse` non
  validé en forme), changé de méthode plutôt que d'attendre la
  prochaine découverte au hasard : `grep -rn "JSON.parse" src/` pour
  auditer PROACTIVEMENT tous les sites restants d'un coup. 2 fichiers
  encore vulnérables trouvés, tous deux confirmés par un test qui
  échoue avant le fix (jamais supposé) :
  - `onboarding.ts`, `load()` : `JSON.parse('null')` = `null` sans
    exception ; l'accès `.combat` a lieu chez l'appelant
    (`hasSeenCombatHint`), hors du try/catch de `load()`. Particulièrement
    grave celui-ci : `hasSeenCombatHint()` est appelé en SYNCHRONE dans
    les `useState`/`useRef` initiaux d'`ArenaScreen` — un stockage
    corrompu par la chaîne `"null"` aurait empêché l'écran d'arène de
    s'afficher DU TOUT, pas juste une fonctionnalité annexe cassée.
  - `progression.ts`, `readJson<T>` : le même défaut générique touchait
    DEUX call sites — `getProgress`/`recordResult` (`map[charId]` plante
    sur `null`) et `loadCustoms` (`for...of customs` plante sur
    `null`/nombre, non itérables ; ET sur une chaîne comme `"oops"`,
    itérable mais dont chaque caractère fait ensuite planter la
    migration Ulti qui tente de lui ASSIGNER une propriété — `Cannot
    create property 'ulti' on string 'o'` en mode strict).
  Fix unique pour les deux : `readJson` déduit la forme attendue
  (objet ou tableau) du type runtime de son propre `fallback` et
  valide le JSON parsé contre cette forme avant de le renvoyer, au lieu
  de compter sur un try/catch qui ne couvre que l'étape de PARSING, pas
  ce que l'appelant fait ensuite du résultat. 4 nouveaux tests
  (116 → 120, stables sur 5 exécutions), `tsc --noEmit`/`npm run build`
  verts. Vérifié que le dernier `JSON.parse` restant (cardForge.ts)
  était déjà sûr par construction — ses opérations internes plantent
  bien sur TOUTE forme corrompue, y compris celles qui avaient piégé
  les 5 autres fichiers — donc tous les `JSON.parse` du dépôt sont
  maintenant couverts, par correction ou par preuve.

- 2026-08-16 (routine) : Quatrième passe sur le rapport de coverage —
  story.ts (progression du mode Histoire), 64 % → 93 %. Encore un bug
  réel, troisième occurrence de la même famille en 3 jours : `loadCleared`
  faisait `new Set(JSON.parse(raw))` sans valider que le résultat est
  bien un tableau. Le piège spécifique ici : une CHAÎNE stockée par
  erreur (`'"oops"'`) est itérable en JS — `new Set("oops")` ne plante
  PAS (contrairement à `new Set(42)` ou `new Set({})`, qui lèvent une
  exception) — donc le garde-fou try/catch existant ne se déclenchait
  jamais pour ce cas précis, produisant silencieusement un Set de
  caractères isolés au lieu de repartir d'une progression vide. Écrit
  le test AVANT le fix (discipline habituelle) : a effectivement échoué
  (`Set.size` = 3 au lieu de 0), confirmant le bug avant toute
  correction. Corrigé avec `Array.isArray(parsed)` avant de construire
  le Set — même patron que le fix deckBuilder.ts de la veille, qui
  suivait lui-même le fix stable.ts du round 6 d'audit. Le motif qui se
  dégage sur ces 3 bugs : une opération JS censée « planter sur une
  mauvaise forme » (accès par index, construction de Set/objet à partir
  d'un JSON.parse non validé) ne plante en réalité que pour CERTAINS
  types primitifs, jamais pour tous — null/nombre plantent souvent,
  mais une chaîne ou un objet vide passent parfois au travers
  silencieusement. 4 nouveaux tests (112 → 116, stables sur 5
  exécutions), `tsc --noEmit`/`npm run build` verts.

- 2026-08-16 (routine) : Deuxième passe sur le rapport de coverage
  (après cardForge.ts la veille) — characters.ts, 54 % → 86 %
  (branches 57 % → 100 %). 4 chemins jamais exercés par aucun test
  jusqu'ici : `pickOpponent` (jamais testé directement — seule sa
  cousine `pickOpponentTeam` l'avait été, au round 8 d'audit) ; le
  rééquilibrage des stats de `createFromPrompt` vers la somme cible 26
  quand plusieurs règles cumulent trop de bonus (le garde-fou
  d'équilibrage le plus important du fichier, jamais déclenché par
  aucun prompt de test) ; le repli `ARCHETYPE_TRAIT` de `deriveTrait`
  quand le prompt ne contient aucun mot-clé de trait ; et la génération
  de nom par syllabes d'`extractName` en l'absence de « appelé/nommé
  X ». 4 nouveaux tests, stables sur 5 exécutions consécutives malgré
  le tirage aléatoire impliqué dans plusieurs de ces chemins.
  engine.test.ts 106 → 110, `tsc --noEmit`/`npm run build` verts.
  combat.ts (72 %, le plus gros écart restant) laissé tel quel : son
  test réel est `scripts/sim.ts` (des milliers de matchs simulés), pas
  des tests unitaires ligne par ligne — les dupliquer artificiellement
  n'ajouterait pas de vraie garantie.

- 2026-08-16 (routine) : Troisième cible du rapport de coverage —
  deckBuilder.ts, 69 % → 91 %. Même piège de `hasStorage` figé au
  premier import qu'avec cardForge.ts la veille, mais cette fois
  découvert AVANT d'écrire un seul test (deckBuilder.ts était déjà
  importé statiquement en tête d'engine.test.ts pour
  `sanitizeTemplate`/`defaultTemplate`/etc.) : import statique retiré,
  chaque usage basculé en `import()` dynamique, `beforeEach` (faux
  localStorage) ajouté à la describe `deck-builder` — la première à
  toucher le module dans l'ordre du fichier.
  **Un vrai bug trouvé en écrivant le test de round-trip** :
  `loadTemplate()` ne retombait sur le modèle par défaut QUE si
  `JSON.parse` levait une exception ou si `sanitizeTemplate` plantait —
  mais un stockage contenant du JSON valide de mauvaise FORME (un
  simple nombre ou une chaîne, ex. `"42"` ou `'"oops"'`) ne fait planter
  NI `JSON.parse` NI `sanitizeTemplate` (l'accès par index sur un
  nombre/une chaîne renvoie juste `undefined` en JS, jamais
  d'exception) — chaque carte retombait silencieusement à 0 copie
  au lieu du modèle par défaut, donnant un deck vide et invalide sans
  raison visible pour le joueur. Même classe de bug que le fix de
  stable.ts au round 6 d'audit, mais cette fois-ci trouvée par un TEST
  DE COUVERTURE plutôt que par le skill code-review. Corrigé avec la
  même validation de forme (`typeof === 'object'`, pas un tableau)
  avant `sanitizeTemplate`. 5 nouveaux tests (110 → 112, stables sur 5
  exécutions), `tsc --noEmit`/`npm run build` verts.

- 2026-08-16 (routine) : Vérifié le premier run du workflow de
  déploiement Pages (poussé la veille) — échoue exactement comme prévu
  et documenté : `npm test` ✅, `npm run build` ✅, puis
  `actions/configure-pages@v5` ❌ (site Pages introuvable, faute du
  réglage manuel « Source = GitHub Actions » dans Settings → Pages).
  Rien à corriger côté code, juste confirmé — voir le run
  https://github.com/Mordrak44/Coach-Arena/actions/runs/31937250358.
  Puis, avec ce point bloqué sur une action humaine, repris la série de
  qualité sous un angle neuf : `@vitest/coverage-v8` installé pour
  trouver du code jamais EXERCÉ (différent des rounds d'audit
  code-review précédents, qui cherchent des bugs dans du code déjà
  exercé). Plus gros trou trouvé : la persistance de la Forge
  (cardForge.ts, `saveForgedCard`/`loadForgedCards`) à 43 % — une vraie
  fonctionnalité joueur jamais testée. En écrivant les tests, retrouvé
  exactement le piège de `hasStorage` déjà documenté pour
  stable.ts/progression.ts, mais sous une forme inédite : cardForge.ts
  était importé STATIQUEMENT en tête d'engine.test.ts (par les tests
  forgeCard existants), donc son `hasStorage` se figeait à `false` avant
  même le premier `beforeEach` du fichier — aucun `vi.resetModules()`
  n'aurait suffi, il fallait retirer l'import statique et poser le faux
  localStorage AVANT le tout premier `import()` dynamique du module
  dans l'ordre d'exécution du fichier. 6 nouveaux tests verrouillent le
  round-trip, l'ordre, le plafond MAX_FORGED, le re-clamp au
  rechargement, le stockage corrompu et l'échec d'écriture.
  engine.test.ts 100 → 106, `tsc --noEmit`/`npm run build` verts.

- 2026-08-16 : Hébergement GitHub Pages mis en place, demandé
  explicitement par l'utilisateur (« github page ? », après lui avoir
  proposé le choix entre lancer le jeu en local ou l'héberger). `base:
  '/Coach-Arena/'` posé dans vite.config.ts (site de PROJET, pas de
  domaine dédié). En creusant les conséquences d'un sous-chemin plutôt
  que la racine, trois fichiers HORS du graphe de modules Vite (donc
  jamais réécrits automatiquement) se sont révélés cassés sous
  `/Coach-Arena/` : le manifest PWA (icônes/`start_url` en chemins
  absolus `/…` au lieu de relatifs `./…`), le service worker (filtres
  `pathname.startsWith('/assets/')` qui ne matchent plus rien sous un
  sous-chemin, fallback hors-ligne visant `'/'` en dur), et
  l'enregistrement du service worker dans main.tsx (`/sw.js` en dur).
  Les trois corrigés. `index.html` : og:image/og:url passés en URLs
  absolues (obligatoire pour Open Graph), maintenant qu'un vrai domaine
  d'hébergement existe — clôt une note laissée en suspens depuis
  l'itération sur l'aperçu de partage. Vérifié en conditions réelles :
  `dist/` copié sous un vrai sous-répertoire `Coach-Arena/` d'un serveur
  statique local, chargé en Chromium headless — zéro requête en échec,
  service worker enregistré avec le bon SCOPE (pas la racine du
  domaine), capture confirmant le rendu complet. Workflow GitHub Actions
  ajouté (build + test + déploiement officiel `actions/deploy-pages`,
  déclenché sur push vers l'unique branche du dépôt + déclenchement
  manuel). Un seul réglage reste hors de portée des outils disponibles
  dans cette session : activer « GitHub Actions » comme source Pages
  dans Settings → Pages du dépôt (case à cocher marquée `[~]`, pas
  `[x]`, jusqu'à ce que ce soit fait) — communiqué à l'utilisateur avec
  l'URL finale attendue.

- 2026-08-16 (routine) : Nettoyage `arenaRenderer.ts` — reprise de
  l'item explicitement reporté au round 8 d'audit (la duplication des
  ~20 constructions de `FloatingText` dans `onEvent()`), cette fois avec
  la vérification visuelle dédiée qui manquait alors. Extrait en une
  méthode privée `pushFloat(text, x, y, now, opts)` avec des valeurs par
  défaut neutres ; chaque site d'appel ne passe plus que ce qui diffère
  du défaut, reproduisant exactement les valeurs d'avant (position,
  couleur, taille, angle, délai). Vérifié par deux captures Chromium
  headless en cours de combat réel (`?demo=fast`) : le texte d'esquive
  (SWOOSH) et le texte de coup + dégâts (DOGO!/-5) rendus à l'identique
  de ce qu'ils étaient avant le refactor. Pur nettoyage interne, aucun
  nouveau test (rien de neuf à verrouiller, juste une déduplication),
  100 tests vitest inchangés, `tsc --noEmit`/`npm run build` verts.

- 2026-08-16 : Reprise du pilote Kling après confirmation explicite de
  l'utilisateur (« je confirme »), suite à ma question sur l'état du
  lot en attente. Les 2 portraits de référence Kenta/Rei de la veille
  avaient expiré (24h) — régénérés avec les mêmes prompts que les
  portraits dérivés ayant servi aux 8 clips déjà générés (2 crédits,
  URLs fraîches confirmées prêtes via query_tasks). Le lot a été
  interrompu par l'utilisateur une troisième fois juste avant le premier
  envoi vidéo du reste (victory-pose Rei) — aucun crédit vidéo dépensé
  cette fois. Conformément à la règle « jamais de crédits sans
  confirmation », pas de nouvelle tentative sans feu vert explicite.
  ~212 crédits consommés au total sur 2978. Voir la case à cocher
  correspondante plus haut pour le détail.

- 2026-08-16 (routine) : Audit de code round 8, ciblé sur App.tsx et
  render/arenaRenderer.ts — les deux plus gros fichiers jamais passés en
  revue en entier. Après le round 7 qui couvrait tous les écrans UI,
  restait le composant racine (App.tsx, jamais spécifiquement audité) et
  le renderer canvas (arenaRenderer.ts, seulement effleuré au round 1
  pour un hoist de performance, jamais une passe de correction complète).
  1 vrai bug de gameplay trouvé : en mode Rapide avec équipiers, le banc
  adverse pouvait aligner le perso du JOUEUR lui-même ou l'un de ses
  ÉQUIPIERS — `App.tsx` ne filtrait le pool du banc adverse que sur
  l'adversaire principal (`r.id !== opponent.id`), oubliant le perso du
  joueur et son équipe, contredisant le propre commentaire du code
  (« sans doublons »). Corrigé en extrayant la sélection du banc adverse
  en fonction pure exportée, `pickOpponentTeam(excludeIds, size)` dans
  characters.ts (aux côtés de `pickOpponent`), appelée avec la liste
  complète à exclure — testable indépendamment de React, contrairement à
  la logique qui vivait avant en ligne dans le composant. Verrouillé par
  un test statistique (200 tirages, jamais un id exclu) + un test de
  bord (pool plus petit que la taille demandée). Écarté comme non-bug
  mais documenté : la duplication de ~20 objets `FloatingText` dans
  arenaRenderer.ts (mérite un helper commun) laissée pour une itération
  dédiée avec vérification visuelle, plutôt que refactorée à la hâte sur
  un fichier canvas de 1000+ lignes sans capture de référence. 2
  nouveaux tests (98 → 100), `tsc --noEmit` + `npm run build` + suite
  complète verts.

- 2026-08-16 (routine) : Audit de code round 7, ciblé sur les écrans UI
  restants (ReadyScreen.tsx, ResultsScreen.tsx, StoryScreen.tsx,
  PrivacyScreen.tsx, TitleScreen.tsx). Avec ça, tous les écrans UI du
  dépôt ont maintenant été passés en revue au moins une fois — la série
  d'audit systématique (lancée quand le puits de tâches sûres/gratuites
  s'épuisait, round 1 sur combat.ts/arenaRenderer.ts) a couvert
  l'ensemble du dépôt applicatif en 7 passes.
  - `ReadyScreen.tsx` : l'icône « Reconnaissance vocale » contredisait
    son propre texte d'avertissement. Le calcul d'origine retombait sur
    un ✅ codé en dur dès que `SpeechRecognition` est absent du
    navigateur (Firefox) ET que le micro n'a pas encore été explicitement
    refusé — alors que la ligne affichait dans le même temps
    « indisponible sur ce navigateur ». Fix : `speechOk = speechSupported
    ? micOk : false`, dérivé directement plutôt qu'un ternaire imbriqué
    fragile. Vérifié avec une vraie capture Chromium headless (Playwright,
    `SpeechRecognition` supprimé de `window` via un script d'init) sur 3
    scénarios : normal, navigateur sans reco vocale, micro refusé —
    icône/texte cohérents dans les 3.
  - `ReadyScreen.tsx` et `ArenaScreen.tsx` dupliquaient verbatim le repli
    de permission média (audio+vidéo → audio seul → null). Extrait en
    `systems/media.ts::requestCoachStream()`, testé directement en vitest
    (mock de `navigator.mediaDevices.getUserMedia` via `vi.stubGlobal` —
    Node 22 expose `globalThis.navigator` en lecture seule, une
    affectation directe lève `Cannot set property navigator`).
  - Deux micro-nettoyages triviaux : `TRAIT_INFO[player.trait]` indexé 3
    fois au lieu d'une variable ; `ResultsScreen` appelait
    `setSceneJobs(queue.jobs())` juste après construction de la file, un
    rendu superflu pour une liste identique à celle déjà posée par
    l'initialiseur de `useState`.
  - 3 nouveaux tests (engine.test.ts 95 → 98). `tsc --noEmit`, `npm run
    build` et la suite complète passent. StoryScreen.tsx,
    PrivacyScreen.tsx, TitleScreen.tsx : rien trouvé.

- 2026-08-16 (routine) : Audit de code round 6, ciblé sur stable.ts,
  speechTactics.ts, progression.ts, deckBuilder.ts, cutLibrary.ts,
  characters.ts — sixième et dernière tranche de la série sur les
  modules de logique pure (le reste du dépôt hors UI/systems browser-API
  a maintenant été passé au crible). 3 vrais bugs corrigés + 1
  nettoyage trivial :
  - `stable.ts` : `readAll()` ne validait que l'absence d'erreur de
    syntaxe JSON, pas la FORME du résultat — un stockage contenant du
    JSON valide mais non-objet (`"null"`, `"5"`, `"true"`, posé par une
    extension navigateur ou un bug de migration passé) faisait planter
    `charId in all` en aval, dans le rendu synchrone de
    CharacterSelect.tsx. Fix : validation de forme après le parse
    (`typeof === 'object'`, pas un tableau), même garde-fou que
    deckBuilder.ts avait déjà pour son propre stockage.
  - `speechTactics.ts` : la règle générique `souffle` (→ récupération
    5 %) matchait la sous-chaîne « souffle » À L'INTÉRIEUR de « dernier
    souffle », qui a sa PROPRE règle dédiée (« baroud d'honneur »,
    `lowHpHypeFull`) — un discours de dernier recours se voyait donc
    accorder un soin gratuit à contresens en plus de l'effet voulu.
    Fix : lookbehind négatif `(?<!dernier )souffle` — même classe de
    bug que le fix des regex de cardForge.ts au round 2 (chevauchement
    de sous-chaîne entre deux règles), mais ici entre deux RÈGLES
    distinctes plutôt qu'un faux positif isolé.
  - `combat.ts`, `applyConsigne` : la limite d'effets par consigne était
    dupliquée en dur (`effects.slice(0, 2)`) au lieu d'importer
    `MAX_CONSIGNE_EFFECTS` de speechTactics.ts — un piège à dérive
    future (le label affiché et les effets réellement appliqués
    auraient pu diverger si la constante changeait un jour sans que ce
    slice suive). Fix : import de la constante partagée.
  - Nettoyage trivial (pas un bug, mais gratuit à corriger) :
    `progression.ts`, `claimReward` relisait et re-parsait `PROG_KEY` en
    double via `pendingReward(charId)` au lieu de réutiliser la map déjà
    en main dans la fonction.
  - deckBuilder.ts, cutLibrary.ts, characters.ts : rien trouvé, déjà
    solides (deckBuilder.ts en particulier avait déjà le bon réflexe de
    validation de forme que stable.ts vient d'adopter).
  - 2 nouveaux tests dans engine.test.ts (93 → 95). `tsc --noEmit`,
    `npm run build` et la suite complète passent.

- 2026-08-16 (routine) : Audit de code round 5, ciblé sur le pipeline
  cinéma (sceneDirector.ts, cutPlanner.ts, liveCutPlayer.ts,
  sceneQueue.ts, cutLibrary.ts, deckBuilder.ts, stable.ts,
  speechTactics.ts) — cinquième passe de la série. 4 bugs réels
  corrigés, tous verrouillés par des tests (contrairement au round 4,
  ce sont des modules de logique pure, testables en vitest sans mock
  d'API navigateur) :
  - **sceneDirector.ts, `buildScenePlans`** : le calcul de « qui a
    frappé » pour choisir la planche de référence d'un moment fort
    supposait que tout événement noté a un champ `by` — faux pour
    `'hit'`, qui n'a que `target` (celui qui ENCAISSE). Un crit encaissé
    par le joueur (donc frappé par l'ennemi) référençait quand même le
    joueur : la mauvaise planche de perso serait partie en génération
    Kling PAYANTE. Trouvé avant tout usage réel en prod (le pipeline
    scène-par-scène n'est pas encore branché à un vrai submitter), mais
    aurait cassé le tout premier essai. Fix : bascule sur un switch qui
    dérive l'attaquant depuis `target` pour `'hit'`, depuis `by` sinon.
  - **sceneDirector.ts, `eventScore`** : notait `hypeFull` à 1 (donc
    électible comme meilleur moment d'un round) alors que `momentPrompt`
    n'a aucun cas pour `hypeFull` et renvoie `null` — un round où le
    seul événement notable était un hypeFull perdait silencieusement son
    créneau de moment fort, même si un autre round avait un événement
    filmable. Fix : `hypeFull` retombe sur le score par défaut (0),
    aligné sur le choix déjà fait dans `cutPlanner.ts`.
  - **liveCutPlayer.ts, `LiveCutPlayer.update`** : le garde-fou anti-
    retard (`MAX_QUEUE=1`) trimmait par NOMBRE d'entrées, pas par retard
    réel — un seul événement `'hit'` pousse 3 cuts d'un coup
    (attack-solo + impact-flash + hit-reaction) et se faisait sabrer à 1
    seul cut (le dernier) dès sa création, même sans aucun retard. Une
    fois une vraie bibliothèque de clips branchée (le pilote Kling en
    cours y va), chaque coup aurait sauté direct à la réaction, plus
    aucun montage attaque→impact→réaction. Fix : le garde-fou trimme
    maintenant par BUDGET DE DURÉE cumulée (`MAX_QUEUE_LAG_S = 2.5 s`)
    plutôt que par longueur — une séquence fraîche d'un seul événement
    passe intacte, un vrai retard accumulé est toujours purgé.
  - **sceneQueue.ts, `SceneJobQueue.start`** : le `setTimeout` de
    timeout par job n'était jamais annulé ni annulable — pas de méthode
    `cancel()`, et `ResultsScreen.tsx` ne nettoyait rien à son
    démontage. Chaque job continuait de tourner jusqu'à expiration (20 s
    par défaut) même après que l'écran ait changé, et un submitter réel
    lent pouvait notifier `onUpdate` sur un composant déjà démonté. Fix :
    ajout de `cancel()` (annule tous les minuteurs + coupe les
    notifications futures), câblé dans le cleanup du `useEffect` de
    ResultsScreen.
  - Écarté (design, pas un bug) : `eventScore` est dupliqué avec des
    poids différents dans `sceneDirector.ts` et `cutPlanner.ts` — les
    deux fichiers ont des critères de « filmable » distincts et déjà
    cohérents en interne (ex. dodge/block ne comptent dans aucun des
    deux pour leurs usages respectifs), donc pas une vraie divergence à
    corriger, juste deux besoins voisins qui se ressemblent.
  - 4 nouveaux tests dans engine.test.ts (89 → 93) : les deux bugs de
    sceneDirector, la séquence complète des 3 cuts d'un même événement
    dans LiveCutPlayer (le test existant encodait l'ancien comportement
    buggé — réécrit pour vérifier la séquence correcte), et
    `SceneJobQueue.cancel()` coupant bien les mises à jour tardives.
    `tsc --noEmit`, `npm run build` et la suite complète passent.

- 2026-08-16 (routine) : Audit de code round 4, ciblé sur systems/
  (voice.ts, sound.ts, facecam.ts, recorder.ts) — quatrième passe de la
  série (moteur → DSL de cartes → UI → API navigateur). Zone
  délibérément gardée pour la fin : ces fichiers touchent de vraies API
  du navigateur (reconnaissance vocale, WebAudio, MediaRecorder,
  getUserMedia), donc aucun des 4 fixes ne peut être verrouillé par un
  test vitest sans construire un mock lourd de ces API — un choix
  explicite de ne PAS le faire plutôt que d'écrire un faux sentiment de
  sécurité. Les 4 bugs sont réels et corrigés quand même, vérifiés par
  lecture attentive + compilation + capture du funnel : un ordre vocal
  sur deux pouvait être perdu si le navigateur regroupait plusieurs
  résultats fraîchement finalisés dans un même événement (`onresult` ne
  lisait que le premier) ; la piste vidéo de `captureStream()` n'était
  jamais stoppée à la fin de l'enregistrement (pertinent batterie
  mobile) ; la rampe audio de la foule qui suit la Hype en continu
  interrompait sans cesse la clameur ponctuelle d'un beau coup avant
  qu'elle ait fini de retomber ; et `FaceCoach.stop()` ne réinitialisait
  pas son état interne (non-atteignable aujourd'hui, corrigé quand même
  car le fix est trivial). Quatre rounds d'audit consécutifs, quatre
  fois des bugs réels trouvés — la démarche (lire vraiment le code
  visé, vérifier chaque piste avant de la corriger ou de la différer,
  ne jamais prétendre avoir testé ce qui ne l'a pas été) continue de
  payer plus qu'ajouter des fonctionnalités à ce stade du projet.

- 2026-08-16 (routine) : Audit de code round 3, ciblé sur
  CharacterSelect.tsx (le plus gros fichier UI, 571 lignes, jamais
  audité) + story.ts. Troisième passe de la même série (moteur → DSL de
  cartes → UI) : chaque round cible la zone la plus risquée qui reste,
  pas encore vue par un outil dédié. Les 4 pistes trouvées cette fois
  étaient toutes des bugs d'état React (pas de logique métier cassée) :
  un message d'écurie qui fuit d'un perso à l'autre au changement de
  sélection, un équipier de relève qui reste affiché comme tel après
  être devenu le combattant principal, un équipier custom évincé du
  plafond de la Forge qui devient un « fantôme » impossible à retirer,
  et un `isUnlocked()` qui plante sur un chapitre inconnu (non-atteignable
  aujourd'hui, corrigé quand même car le fix est une simple borne dans
  la même fonction — contrairement à `getCard()` à l'audit précédent, où
  le calcul coût/bénéfice avait justifié de différer). Fait notable :
  ces 3 bugs UI ne sont PAS testables en vitest (logique de composant
  React, pas de logique de jeu pure) — vérifiés à la place en capture
  Chromium headless réelle, en reproduisant le scénario exact (entraîner
  Kenta puis basculer sur Rei ; ajouter Rei comme équipière puis la
  faire devenir principale) et en lisant le texte affiché réellement à
  l'écran, pas en supposant que le code corrigé se comporte comme prévu.
  1 test vitest (89 au total, ajouté à un test existant), sim/build
  inchangés.

- 2026-08-16 (routine) : Audit de code round 2, ciblé sur le DSL de
  cartes (cards.ts/cardForge.ts/deckBuilder.ts) — la même démarche que
  l'audit du moteur juste avant, appliquée à la zone la plus risquée
  suivante (parsing de texte libre + calcul de prix, jamais auditée).
  Le vrai travail n'était pas le skill lui-même mais la VÉRIFICATION :
  sur les 5 pistes trouvées, une (les regex de la Forge) s'est révélée
  PLUS large que les 3 exemples cités en la testant moi-même — "besoin"
  contient "soin", "regarde" contient "garde" — puis la première
  tentative de fix (`\b` classique) a elle-même échoué sur "décrit"
  (accents non traités comme lettres par `\b` en JS), découvert
  seulement en écrivant le test de régression, pas en la relisant. Deux
  autres pistes (`clampEffect` dupliqué, `deriveTiming` cosmétique) ont
  été délibérément écartées après vérification — pas ignorées, jugées :
  la première est un nettoyage sans risque ni bénéfice mesurable, la
  seconde n'affecte qu'un libellé d'UI pour un cas à deux règles
  précises sur 14. Une quatrième (`getCard()` non-null assertion
  dangereuse) vérifiée non-atteignable aujourd'hui par un vrai chemin de
  jeu, donc pas corrigée — corriger du code mort n'est pas un audit
  utile. 3 tests vitest (89 au total, 5× de suite), sim dans la variance
  normale, build/capture inchangés.

  **En bonus**, un test flaky trouvé et corrigé — pas dans ce lot, mais
  dans celui d'AVANT (« le temps mort d'urgence adverse joue aussi une
  carte lowHpHypeFull », ajouté à l'itération précédente). En le
  relançant 30× d'affilée (au lieu des 5× habituelles, réflexe pris pour
  vérifier CE lot-ci) il échouait ~1 fois sur 15-30 : `expected 9 to be
  100`. Diagnostiqué avec un script de reproduction dédié plutôt que
  deviné : la Dernière Chance adverse met bien la Hype à fond DANS le
  tick testé, mais `enemyCoachAI` peut, dans ce même tick, tirer
  instantanément le spécial adverse dès que la Hype est pleine
  (probabilité ~6 %/tick, `Math.random()` non mocké dans ce test) — ce
  qui la reconsomme aussitôt. Le test vérifiait un état FINAL
  légitimement perturbable par une autre mécanique du jeu, parfaitement
  correcte de son côté — ce n'était pas un bug de bug #3, c'était un test
  mal conçu. Corrigé en vérifiant les ÉVÉNEMENTS produits (la preuve que
  le déclenchement a eu lieu) plutôt que la valeur finale de la Hype,
  qu'aucune mécanique ultérieure du même tick ne peut plus faire
  échouer. 40 exécutions isolées + 20 suites complètes après fix,
  stable.

- 2026-08-16 (routine) : Audit de code du moteur (skill code-review) —
  avec le puits des tâches sûres/gratuites qui s'épuisait (dit
  explicitement à l'utilisateur en fin de session précédente), changé
  d'angle : au lieu d'ajouter, chercher des bugs RÉELS dans ce qui existe
  déjà. Ciblé combat.ts/ArenaScreen.tsx/arenaRenderer.ts (le cœur du
  moteur, jamais audité par un outil dédié). 4 pistes trouvées, chacune
  vérifiée manuellement (lecture du code, pas juste confiance dans le
  skill) avant correction : 3 vrais bugs de logique de jeu (double-KO
  injuste, `cheer` qui ignorait la confusion, temps mort d'urgence
  adverse muet sur les cartes lowHpHypeFull) + 1 nettoyage perf
  (allocation d'objets inutile dans le rendu). Fixes minimaux et ciblés,
  chacun verrouillé par un test de régression écrit APRÈS coup pour
  prouver le comportement corrigé. Un des tests a d'abord échoué pour une
  bonne raison — pas un faux positif de ma part, mais une découverte
  réelle d'un mécanisme ambiant (trickle de Hype continu) que je ne
  connaissais pas encore en détail, qui a affiné le test plutôt que de
  l'invalider. 4 tests vitest (87 au total, 5× de suite), sim dans la
  variance normale, build/capture inchangés.

- 2026-08-15 (routine) : Couverture de tests pour onboarding.ts — clôt le
  balayage entamé avec stable.ts : les trois modules localStorage de
  src/game/ (stable, progression, onboarding) ont désormais tous une
  couverture directe (commentator.ts, testé juste avant, n'utilise en
  fait aucun stockage — son piège était différent, voir l'entrée
  précédente). Petit fichier
  (52 lignes, deux bulles d'aide) mais valeur réelle : le seul risque qui
  compte ici — deux bulles indépendantes qui se marchent dessus par
  accident — est maintenant verrouillé par un test, pas seulement par la
  lecture du code. 3 tests vitest (83 au total, stables sur 3 exécutions),
  sim/build inchangés, aucun code de production touché.

- 2026-08-15 (routine) : Watermark « ✨ Généré par IA » — le pilote Kling
  d'hier a rendu concret un engagement jusque-là abstrait dans ROADMAP.md
  (« watermark quand les clips Kling arriveront en jeu »). Plutôt
  qu'attendre que de vrais clips soient wiring en dur (et risquer
  d'oublier), construit le badge MAINTENANT, dormant : il ne peut
  s'afficher que quand `activeCut` (LiveCutPlayer) est non nul, ce qui
  n'arrive jamais avec `EMPTY_CUT_LIBRARY`. Deux rendus nécessaires,
  comme pour le bandeau Temps Mort avant lui : un badge DOM (visible en
  direct) ET une gravure sur le canvas composite (visible dans le clip
  exporté, puisque le DOM n'existe pas dans le fichier). Vérifié à trois
  niveaux avec un clip de test synthétique (canvas+MediaRecorder — zéro
  crédit Kling, patch temporaire retiré avant ce commit) : capture DOM
  live, capture du canvas composite via toDataURL, ET capture du funnel
  standard confirmant zéro changement visible avec la bibliothèque vide
  réelle. Pur CSS + JSX, 80 tests vitest inchangés (aucune logique de jeu
  touchée), sim/build inchangés.

- 2026-08-15 (routine) : Couverture de tests pour commentator.ts — suite
  de la série stable.ts/progression.ts, prochain fichier de logique
  substantiel (180 lignes) à 0 référence directe dans engine.test.ts
  (seulement exercé indirectement via l'assertion globale de
  scripts/sim.ts). Contrairement aux deux précédents, pas de piège
  localStorage ici (module pur, aucun stockage) — mais un piège différent
  et tout aussi silencieux : `createMatch()` précharge `m.events` avec un
  `roundStart` initial dès la création du match. Mes tout premiers jets
  de tests ignoraient ce détail et échouaient en cascade (5 sur 7) pour
  des raisons qui semblaient n'avoir aucun rapport entre elles — une ligne
  "Round 1..." apparaissant sans qu'aucun roundStart n'ait été poussé
  explicitement, un poids attendu de 1 recevant 2, un texte de round 4
  attendu recevant du round 1 — jusqu'à remonter à la source commune :
  chaque `ingest()` traitait aussi cet événement caché. Fixé en le
  consommant explicitement en début de chaque test. Au passage, verrouillé
  précisément (pas supposé) le contrat de l'anti-répétition de `pick()` :
  jamais deux gabarits identiques D'AFFILÉE, mais un gabarit revient
  légitimement après être passé par un autre — un test qui aurait supposé
  l'inverse (jamais de répétition du tout) aurait été un faux verrou,
  cassé par le comportement réel dès le premier vrai match. 9 tests
  vitest (80 au total, exécutés 5× de suite), sim/build inchangés, aucun
  code de production touché.

- 2026-08-15 : Kling débloqué par l'utilisateur — pilote sur 2
  catégories (Kenta/brawler, Rei/rival), le choix suit directement le
  « test bloquant n°1 » déjà défini dans TEMPLATES_SPEC.md
  (counter-exchange + swap Kenta/Rei, la config la plus dure). Corrigé
  une première approximation : un unique portrait de face ne suffit pas
  comme référence i2v (remarque de l'utilisateur) — une planche
  multi-vues (face/profil/trois-quarts) par perso a été produite à la
  place, puis un portrait d'action unique dérivé par image-to-image
  (nécessaire car un modèle vidéo attend une image nette, pas 3 panneaux
  en grille). Test bloquant validé en premier (18 crédits) avant
  d'investir dans le reste — puis 7 des 8 clips solo du socle P1
  (attack-solo/hit-reaction/ko-down ×2, victory-pose Kenta) générés
  avant que l'utilisateur n'interrompe le lot ; non relancé sans
  confirmation explicite, conformément à la règle « jamais de crédits
  sans autorisation ». ~210 crédits consommés sur 2978 (SVIP/Pro).
  Contrainte réelle découverte : ce bac à sable bloque l'accès réseau à
  klingai.com au niveau de la politique egress (confirmé côté
  curl/WebFetch ET Chromium headless réel) — Claude ne peut vérifier
  AUCUN résultat visuellement depuis cette session ; les liens ont été
  partagés en conversation pour relecture humaine (expirent 24h). Une
  vérification de câblage (patch temporaire, retiré avant ce commit) a
  confirmé que `CutClipLibrary`/`<video>` demandent bien la bonne URL
  pour le bon perso/kind — la mécanique déjà construite fonctionne, seule
  la lecture réelle du fichier reste à confirmer par un humain. Aucun
  code de production modifié dans cette session (tout patch de
  vérification a été retiré avant commit) — seul ROADMAP.md documente
  l'état du pilote.

- 2026-08-15 (routine) : Couverture de tests pour progression.ts (Lien,
  paliers, persos créés) — suite logique de l'itération stable.ts : même
  angle (chaque fichier de src/game/ comparé à ses usages dans
  engine.test.ts et scripts/sim.ts), même piège (`hasStorage` figé au
  premier `import()`, donc `fakeLocalStorage()` factorisé au niveau du
  fichier plutôt que dupliqué). La vraie trouvaille en écrivant les tests
  n'est pas un bug mais une lacune de garantie : `pendingReward` avance
  les paliers de récompense un par un dans l'ordre (jamais de saut, même
  si le Lien réel est plus haut) — comportement correct aujourd'hui, mais
  jusqu'ici rien ne l'aurait détecté si un futur changement cassait cet
  ordre (par ex. en réclamant directement le palier du bondLevel courant
  plutôt que `claimed + 1`). Un test dédié verrouille maintenant ce
  contrat. 8 tests vitest (71 au total, exécutés 3× de suite), sim/build
  inchangés, aucun code de production touché.

- 2026-08-15 (routine) : Couverture de tests pour stable.ts (Vie
  d'Écurie). Même logique que les itérations précédentes : le ROADMAP
  restant est bloqué par des crédits/un backend/du matériel réel, donc
  cherché un autre gap zéro-risque — cette fois côté qualité plutôt que
  produit. Comparé chaque fichier de src/game/ à ses références dans
  engine.test.ts ET scripts/sim.ts (certains modules ne sont exercés que
  par le second) : stable.ts (233 lignes, logique d'humeur/envies/
  entraînement qui influence directement les conditions de départ d'un
  match — Hype, premier ordre ignoré) n'apparaissait dans NI L'UN NI
  L'AUTRE. En l'écrivant, piège réel trouvé avant même le premier test :
  l'environnement vitest par défaut (Node, sans jsdom) n'a pas de
  `localStorage`, et stable.ts calcule `hasStorage` une seule fois au
  chargement du module — sans un faux localStorage posé AVANT le tout
  premier `import('./stable')`, les tests auraient tourné en mode
  « stockage indisponible » où toute la logique de persistance testée
  (dérive d'humeur entre appels, cumul des actions du jour, une envie
  comblée qui ne renaît pas) serait restée invisible, silencieusement.
  Résolu avec un faux localStorage en mémoire posé/vidé à chaque test.
  9 tests vitest (63 au total), exécutés 5× de suite pour écarter toute
  fragilité liée au tirage aléatoire des envies par trait. Sim/build
  inchangés (aucun code de production touché, uniquement des tests).

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
