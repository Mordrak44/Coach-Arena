# Cahier des charges — Templates vidéo (combat en cuts)

Dérivé du séquenceur (`src/game/cutPlanner.ts`) : la liste des templates
à produire pour que les matchs se montent en vidéo sans génération en
match. Chaque template est produit UNE fois (généré en N essais → le
meilleur, poli), puis les persos y sont injectés par swap (planches de
référence multi-vues — déjà générées pour le roster).

Règles communes : 9:16 vertical, style anime shōnen 2D traits épais,
arène sombre à projecteurs (raccord avec le rendu arcade), 24-30 fps,
cadrages STANDARDISÉS par type (les cuts doivent s'enchaîner), boucle
possible quand indiqué. Les FX (aura, énergie) doivent être re-teintables
aux couleurs du perso (paramètre du node de swap).

## Priorité 1 — le socle (un match minimal se monte avec ça)

| Template | Persos à swapper | Durée | Description |
| --- | --- | --- | --- |
| `attack-solo` ×3 var. | 1 | ~1,2 s | Gros plan : le perso frappe (jab, crochet, coup de pied). Caméra ¾ face, fente vers la droite de l'écran. |
| `hit-reaction` ×2 var. | 1 | ~0,9 s | Contrechamp : le perso encaisse, tête qui part, sueur. Recule vers la gauche. |
| `impact-flash` ×2 var. | 0 | ~0,3 s | Flash plein écran + onomatopée (l'habillage texte vient du jeu). Neutre, aucun swap. |
| `intro-faceoff` | 2 | ~3 s | Staredown : les deux persos face à face, zoom lent, éclairs de rivalité. |
| `ko-down` | 1 | ~2 s | Slow-motion : le perso s'effondre, poussière, silence puis clameur. |
| `victory-pose` | 1 | ~2,5 s | Le perso lève le poing, confettis, flashs des photographes. |
| `crowd` ×2 var. | 0 | ~1 s | Foule en délire, bâtons lumineux. Neutre, boucle. |

## Priorité 2 — la variété

| Template | Persos | Durée | Description |
| --- | --- | --- | --- |
| `dodge-solo` | 1 | ~0,9 s | Esquive fluide, traînée d'après-image. |
| `block-solo` | 1 | ~0,9 s | Garde levée, impact étouffé, glissade arrière. |
| `counter-exchange` | 2 | ~2,2 s | L'échange complet : A frappe, B lit, B renverse. LE template à deux — c'est lui qui valide le swap de paire (test Kenta/Rei en premier). |
| `special-cast` ×2 var. | 1 | ~2,4 s | Montée en charge + déchaînement. FX re-teintables obligatoires. |

## Priorité 3 — la collection (économie)

| Template | Persos | Durée | Notes |
| --- | --- | --- | --- |
| `ulti-cast` — 1 par archétype du roster (6) | 1 | ~3,2 s | Débloqués par les chapitres d'Histoire (ch. vaincu → le style d'Ulti de son adversaire). FX re-teintables, le NOM de l'Ulti vient du jeu. |
| Entrées en scène, célébrations premium | 1 | 3-5 s | Cosmétiques vendables (boutique / Écurie / Lien). |

## Validation avant production de masse

1. **Test n°1 (bloquant)** : `counter-exchange` + swap Kenta/Rei — le
   swap simultané de deux identités est la config la plus sujette au
   mélange de traits. S'il passe, tout l'édifice tient.
2. Test de raccord : `attack-solo` → `impact-flash` → `hit-reaction`
   enchaînés — les cadrages standardisés suffisent-ils ?
3. Test de re-teinte des FX sur `special-cast` avec 2 persos de
   couleurs opposées.

Volumétrie indicative : P1+P2 ≈ 16 clips template (~25 s de vidéo à
produire, une fois). Le séquenceur (`templateShoppingList`) recalcule la
liste réelle et les fréquences d'usage depuis n'importe quel match.
