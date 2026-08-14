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

## Résultat vidéo

- Générée en **80 s** — compatible avec le pipeline asynchrone du design
  (les scènes se génèrent pendant les phases de coaching, qui durent
  20 s + un round ≈ 35-60 s : une scène par round est tenable).
- Vidéo (sans watermark) :
  `https://v15-kling.klingai.com/bs2/upload-ylab-stunt-sgp/0081b1dc-e99e-4ae1-90c0-c9e8932ed8b8-tjgVx_COjxGhvcd4qrViJg-output.mp4?x-kcdn-pid=112372`
- Couverture :
  `https://s15-kling.klingai.com/kimg/EMXN1y8qYwoGdXBsb2FkEg55bGFiLXN0dW50LXNncBpJMDA4MWIxZGMtZTk5ZS00YWUxLTkwYzAtYzllODkzMmVkOGI4LXRqZ1Z4X0NPanhHaHZjZDRxclZpSmctb3V0cHV0X2ZmLmpwZw.origin?x-kcdn-pid=112372`

## Verdict

- **Pipeline validé techniquement** : portrait 24 s / 1 crédit, vidéo 5 s
  en 80 s / 15 crédits → ~16 crédits par « scène + référence », et les
  scènes suivantes réutilisent le portrait (15 crédits/scène). Budget
  match complet (entrée + 2-3 replays + KO) ≈ 60-75 crédits.
- **Cohérence visuelle perso** : à juger À L'ŒIL par l'utilisateur (la
  session de dev ne peut pas visionner la vidéo — proxy). Si le perso
  reste fidèle au portrait : GO pour générer les 5 autres portraits du
  roster et industrialiser (file asynchrone, ROADMAP v1 cinématique).
