# Test Kling minimal — 2026-08-14

Test autorisé par l'utilisateur (« fait le minimum pour tester », « tu peux
reprendre »). Objectif : valider le pipeline du mode cinématique — portrait
de référence → scène animée cohérente (GAME_DESIGN.md §7).

⚠️ Les URLs Kling expirent 24 h après génération. Le proxy réseau de la
session de dev bloque le téléchargement direct (CONNECT 403 vers
s15-kling.klingai.com) : télécharger les assets depuis un navigateur et les
committer ici pour les conserver.

## 1. Portrait de référence — Kenta

- generationId : `ASXV2ijV-TeOpqaBHqW2Q2hDzQjJd_hGW3S-UO7ROcw-6ZhrJ04QcTtkhXonTJByh2tLrMC7`
- Modèle : kling-image-v3_0, 1k, 9:16 — **1 crédit**, généré en 24 s
- Prompt : style manga shōnen, Kenta en pied, bandeau rouge-orangé, tenue
  orange/or, arène nocturne néon violet, foule floue, speed lines.

## 2. Entrée dans l'arène — image_to_video depuis le portrait

- generationId : `ARkMMA4eOJI-Qa1c0uX9s_gCkcRPiDnuyh_ePagWDJCHDQ_x7ZHeDhkzfFwy2rABIu00TwQB`
- Modèle : kling-video-v2_5, 5 s, 720p, sans audio — **15 crédits**
- Prompt : le combattant s'avance vers la caméra, foule en délire, flashs,
  pose de combat héroïque, étincelles d'énergie orange, contre-plongée.

**Total consommé par le test : 16 crédits / 3000 (solde vérifié avant).**

## Verdict

(à compléter à la réception de la vidéo : cohérence du perso, qualité du
mouvement, utilisabilité pour les scènes d'entrée/replays/montage)
