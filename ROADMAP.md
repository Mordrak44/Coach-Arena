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

## v0.5 — Polish

- [ ] Équilibrage combat (durée de round cible 45–60 s, win-rate des postures)
- [ ] Sons : impacts, foule, gong de round (WebAudio, généré)
- [ ] FX supplémentaires : zoom dramatique sur special, écran fissuré au KO
- [ ] Replay du moment fort en fin de match (buffer des 8 dernières secondes)
- [ ] Incruster la facecam DANS le clip exporté (composite canvas)
- [ ] Meilleure silhouette des persos (poses d'attaque/garde/esquive distinctes)
- [ ] Onboarding permissions micro/caméra (fallback clavier si refus)
- [ ] Tests unitaires du moteur de combat (vitest)

## v1

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
