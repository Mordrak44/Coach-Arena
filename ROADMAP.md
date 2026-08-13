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
- [ ] Lien coach-perso (persistance localStorage) : paliers → +HRT,
      déblocage des cartes signatures
- [ ] Équilibrage combat (durée de round cible 45–60 s, win-rate des postures)
- [ ] Sons : impacts, foule, gong de round (WebAudio, généré)
- [ ] FX supplémentaires : zoom dramatique sur special, écran fissuré au KO
- [ ] Replay du moment fort en fin de match (buffer des 8 dernières secondes)
- [ ] Incruster la facecam DANS le clip exporté (composite canvas)
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
