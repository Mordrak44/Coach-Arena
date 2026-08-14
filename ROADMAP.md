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
- [ ] Meilleure silhouette des persos (poses d'attaque/garde/esquive distinctes)
- [ ] Onboarding permissions micro/caméra (fallback clavier si refus)
- [ ] Tests unitaires du moteur de combat (vitest)

## v1 — Mode Cinématique (voir GAME_DESIGN.md §7)

Le match devient un épisode d'anime : scènes Kling générées en asynchrone
entre les phases de coaching. Le mode arcade actuel reste le fallback.

- [ ] Refonte du flow de match en « scènes » : entrée → coaching → assaut
      (résolution + commentaire) → coaching → … → montage final
- [ ] Commentateur shōnen : résolution de round → texte narratif immédiat
      (templates locaux d'abord, API Claude ensuite)
- [ ] File de génération asynchrone (jobs Kling en arrière-plan, affichage
      quand prêt, fallback arcade si échec/retard)
- [ ] Portrait de référence par perso (Kling image) — ⚠️ crédits, accord requis
- [ ] Scènes image-to-video : entrée dans l'arène, moment fort du round, KO
- [ ] Montage final du match (concat des clips + habillage) exportable 9:16
- [ ] Génération de perso via API Claude (stats + lore + nom du spécial)
- [ ] Émotions MediaPipe FaceLandmarker (sourire/cri/colère → bonus distincts)
- [ ] Export mp4 (transcodage) + partage natif (Web Share API)
- [ ] i18n (fr/en)
- [ ] PWA installable mobile

## v2

- [ ] Multijoueur coach vs coach
- [ ] Classements, saisons, événements

## Journal

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
