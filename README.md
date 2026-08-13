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

- **Crier fort** fait monter la Hype plus vite. **Bouger devant la caméra** aussi.
- Spammer des ordres contradictoires rend ton perso **Confus**. Un bon coach parle juste.
- Entre les rounds : choisis un **plan tactique** et fais ton **discours de coach**.
- Fin de match : télécharge le **clip 9:16** et poste-le. #CoachArena

## Docs

- [Game design](docs/GAME_DESIGN.md)
- [Roadmap](ROADMAP.md)
