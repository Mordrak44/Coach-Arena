# 🥊 COACH ARENA

> Ton perso se bat. **Toi, tu coaches.**

Jeu de coaching de combat, esthétique manga, format vertical 9:16 pensé pour le
partage TikTok. Tu crées ton champion (par prompt ou depuis le roster), il
s'affronte seul dans l'arène — et toi tu le coaches **à la voix** et **à la
facecam**, comme un vrai coach au bord du ring. L'IA analyse tes cris et ton
énergie : ton perso les ressent.

## Jouer

```bash
npm install
npm run dev
```

Ouvre l'URL affichée (Chrome recommandé pour la reconnaissance vocale).
Autorise le micro et la caméra — c'est toi le coach à l'écran. Sans micro,
des boutons et le clavier (A/D/E/C/S, espace) prennent le relais.

## Comment coacher

| Tu cries…                          | Effet                                    |
| ---------------------------------- | ---------------------------------------- |
| « Attaque ! Fonce ! Défonce-le ! » | Posture agressive (+ATK, −DEF)           |
| « Défends ! Garde ! »              | Posture défensive (+DEF, −ATK)           |
| « Esquive ! Bouge ! »              | Posture évasive (+esquive)               |
| « Contre ! »                       | Fenêtre de contre-attaque                |
| « Allez ! T'es le meilleur ! »     | +Hype                                    |
| « SPÉCIAL ! MAINTENANT ! »         | Technique spéciale (si la Hype est max)  |

- **Crier fort** fait monter la Hype — et ton **intonation** compte : un
  Cérébral se braque si tu montes dans les aigus, un Sanguin s'enflamme.
  **Bouger devant la caméra** nourrit aussi ton perso (double pour un Fusionnel).
- La jauge d'**Ulti** se charge en encaissant ; seule TA voix peut la déclencher.
- Spammer des ordres contradictoires rend ton perso **Confus**. Un bon coach parle juste.
- Au **coin du ring** : plan tactique, **cartes du deck** (Souffle, mulligan),
  **relève d'équipier** (PV/Hype/Ulti conservés), et **consignes parlées** —
  « s'il sort son spécial, esquive ! » devient un vrai effet.
- Fin de match : **partage le clip 9:16 du KO** (feuille de partage mobile). #CoachArena

## Le jeu en bref

- **Deck du Coach** : 28 cartes (3 vagues dont la « guerre des coins » —
  bloque la carte adverse, vole son Souffle), coûts auto-équilibrés par budget
  de puissance, deck-builder, cartes signatures liées au Lien, Forge de cartes
  par prompt. L'IA adverse joue son propre deck, symétrique.
- **Mode Histoire** : « Le Grand Hurlement », 8 chapitres, équipes et decks
  adverses thématiques, boss final inédit.
- **Vie d'Écurie** : humeur, envies, entraînement — le tamagotchi nourrit le Lien.
- **PWA installable**, clips mp4 natifs quand le navigateur sait, mode démo
  (`?demo`, `?demo=fast`) pour captures et tests.

## Dev

```bash
npm run dev        # serveur de développement
npm test           # tests unitaires du moteur (vitest)
npx tsx scripts/sim.ts    # simulation d'équilibrage (winrates, durées)
npm run build && node scripts/shot.mjs   # captures du funnel complet
```

## Vie privée

Micro et caméra sont analysés **100 % en local** — aucun serveur, aucun
compte, aucun tracking. Les clips restent sur l'appareil tant que le joueur
ne les partage pas lui-même. Détails dans l'écran « 🔒 Vie privée » du jeu.

## Docs

- [Game design](docs/GAME_DESIGN.md)
- [Roadmap](ROADMAP.md)
- [Financement](docs/FINANCEMENT.md)
