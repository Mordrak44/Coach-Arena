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
| `idle-loop` | 2 | ~2 s, bouclable | Les deux persos en garde, plan large, léger balancement — PAS un événement (rien n'y est résolu par la simulation). Comble le silence entre deux cuts, ce que le vectoriel fait aujourd'hui « gratuitement » en rendant en continu. Sans lui, une couverture 100 % vidéo d'un archétype laisserait un trou (ou un gel) à chaque pause dans l'échange — c'est le socle qui manquait pour que « plus jamais de vecteur visible » soit vraiment atteignable, pas seulement les cuts d'événements. Demandé par le lecteur (`liveCutPlayer.ts`), jamais produit par `cutsForEvent`. |

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

## La règle définitive (2026-08-15, après deux allers-retours avec
l'utilisateur) : ce qui compte, c'est la simulation, pas l'écran

`tick()` tourne en continu, INDÉPENDAMMENT de ce qui est affiché. Un
ordre du coach est traité par la simulation à l'instant où il arrive,
que l'écran montre du vectoriel ou un cut vidéo. Rien ne bloque jamais
la voix. La bonne question n'est donc pas « vidéo ou temps réel » mais :
**ce cut illustre-t-il un instant DÉJÀ résolu par la simulation, ou
bloque-t-il une décision qui n'a pas encore eu lieu ?**

- Un coup qui vient de toucher, une esquive réussie, un contre qui
  vient de tomber, un spécial déclenché : DÉJÀ entièrement résolus dans
  la simulation au moment où le cut démarre. **La vidéo est autorisée
  ici, PENDANT le round, sur tout événement déjà résolu** — c'est le
  wow recherché, sans rien sacrifier de l'influence en direct. Même
  principe que la fenêtre d'animation verrouillée après un coup dans
  Street Fighter/Tekken : personne n'a l'impression que le jeu ignore
  ses inputs pendant ce court instant, parce que le jeu ne les ignore
  jamais réellement — il les met en file, la simulation tourne dessous.
- **La seule chose qui doit rester du temps réel sans exception : l'état
  d'ATTENTE continu** entre deux événements (le perso qui se tient prêt,
  se replace, respire) — là, rien n'est encore décidé, il n'y a aucun
  instant résolu à filmer, ce serait littéralement inventer un futur.
- **Garde-fou obligatoire pour le futur lecteur de cuts en direct** : ne
  jamais laisser la file d'attente des cuts grossir sans limite — si
  plusieurs événements tombent pendant qu'un cut joue encore, le
  lecteur doit pouvoir SAUTER un cut en retard pour rattraper l'état le
  plus récent, afin de ne jamais paraître décroché de plus d'un
  battement derrière la réalité. `CutSequencer` fournit déjà les cuts
  au fil de l'eau ; c'est au futur lecteur (pas encore construit) de
  respecter cette borne.

Entrée en scène, KO, victoire, replay à la pause : ce sont des cas
particuliers de la même règle (des instants déjà résolus), pas une
catégorie à part. `planCuts` (a posteriori, pour l'export/replay) et
`CutSequencer` (au fil de l'eau, pour un futur lecteur en direct) sont
TOUS LES DEUX des usages valides — la règle qui les gouverne est
au-dessus des deux : jamais un cut sur une décision encore ouverte.

3D temps réel avec assets générés par IA (Meshy/Tripo) reste une
ambition v2+ notée pour améliorer encore l'état d'attente continu
au-delà du vectoriel — pas un chantier immédiat, le risque principal
étant la migration de moteur (Unity WebGL vs « clique et joue en 15 s
dans le navigateur »), pas le coût des assets.

**« Techniques débloquées »** (l'idée tamagotchi de l'Écurie appliquée
aux gestes) implique un état par perso qui n'existe pas encore dans le
modèle (`Character` n'a pas de liste de mouvements débloqués) — à
ajouter quand la bibliothèque de gestuelles sera réellement produite ;
s'accroche naturellement au Lien / à l'entraînement déjà en place
(`progression.ts`, `stable.ts`).

## Catégories : la bibliothèque partagée qui résout « zéro template pour
mon perso » (vision utilisateur 2026-08-15)

**Décision clé : la catégorie = l'archétype**, champ qui existe déjà
(`Character.archetype`, 6 valeurs : brawler/rival/prodigy/veteran/beast/
trickster) — zéro modèle de données à ajouter. `createFromPrompt`
l'assigne déjà automatiquement à tout perso créé par prompt.

- **Bibliothèque de BASE par catégorie** : produite UNE fois par
  archétype — c'est exactement l'investissement roster déjà prévu (le
  roster EST les 6 catégories), réutilisé pour bénéficier à tout perso
  custom dès sa création. Aucune dépense supplémentaire pour que « pas
  de template pour mon perso » cesse d'être vrai.
- **Variantes secondaires** (2-3 par cut, choisies par trait secondaire
  — arme, tempérament, couleur) : atténue le risque « tous les Bêtes se
  ressemblent ». Sélection par règles (comme `createFromPrompt`/Forge),
  pas de génération libre. Le SWAP change l'identité complète
  (visage/couleurs/tenue) même sur un mouvement partagé — deux persos
  de la même catégorie restent visuellement distincts malgré le partage
  d'animation (standard des jeux de combat pro).
- **Paliers débloqués dans le temps** : base (offert, avec le perso) →
  avancé/expert (mérités : combat, quêtes, chapitres d'Histoire, Lien —
  s'accroche aux 5 paliers de Lien et aux 8 chapitres déjà en place,
  chacun pourrait débloquer un palier au lieu d'une simple carte) →
  **légendaire** (rare, construit de A à Z ou pré-existant, gagné ou
  payant — la collection d'Ultis par chapitre vaincu, déjà décidée,
  EST ce palier).
- **IA qui caractérise vs IA qui génère** — distinction de coût/risque
  à respecter : l'IA qui répartit des points et NOMME/CHOISIT parmi les
  variantes existantes de la catégorie (comme les stats aujourd'hui) est
  quasi gratuite et sans risque qualité ; l'IA qui invente un tout
  nouveau clip vidéo à la demande est chère et risquée en cohérence
  visuelle à l'échelle — réservée au palier légendaire, curatée au
  moins au début, jamais le flux par défaut.
- **Perso fraîchement créé, en pratique** : joue immédiatement avec la
  bibliothèque de base de SA catégorie (identité swappée dessus) ; son
  swap personnel avancé arrive ensuite sans rien bloquer entre-temps.
- **Célébrations par IA** : bon candidat cosmétique premium (aucune
  contrainte de timing de combat, risque faible).
- **Cartes d'action coach par IA** : déjà sur la roadmap (discours du
  coin du ring compris par Claude) — cohérent, inchangé.

## Le rendu vectoriel reste nécessaire — pour toujours, pas en transition

Question posée et tranchée (2026-08-15) : les catégories ne rendent PAS
le rendu vectoriel superflu. Il garde trois emplois qu'aucune vidéo ne
remplira jamais : (1) combler tout instant SANS cut (les cuts sont
courts et discontinus ; entre deux, il faut un état continu à 60 fps —
idle, replacement, posture d'attente), (2) le HUD (PV, Hype, timer,
banc, main de cartes — donnée live, jamais filmable), (3) la garantie
zéro-coût/zéro-latence/zéro-panne, valable AUSSI après que les
catégories soient produites (nouveau joueur day one, nouvelle mécanique
sans template encore, service indisponible). Le cadre reste : vidéo
posée SUR le vectoriel, cut par cut (CutSequencer/cutLibrary), jamais un
remplacement total. Idée à instruire : un bouton « Mode Léger » (zéro
vidéo, zéro data, zéro batterie) comme option assumée, pas un repli
honteux — cohérent avec l'identité « tout en local ».

**Question posée (2026-08-15, suite) : peut-on un jour faire un combat
SANS jamais voir le vectoriel, juste vidéo + facecam ?** Oui, en théorie,
pour un archétype à couverture complète — mais deux conditions
manquaient à l'architecture avant aujourd'hui : (a) le point (1)
ci-dessus n'avait pas de mécanisme concret — cutsForEvent() ne produisait
QUE des cuts déclenchés par un événement, rien pour l'attente continue ;
comblé par le `CutKind.idle-loop` (voir Priorité 1). (b) le point (3)
reste vrai même à couverture 100 % : un échec de chargement, une
bibliothèque incomplète pour un matchup rare, ou un navigateur sans
codec restent des cas réels où il faut un filet — le vectoriel ne
disparaît jamais du code, seulement de l'écran, quand tout charge bien.

## Modèle mental : Final Fantasy VII (confirmé avec l'utilisateur)

L'écran de combat FF7 = notre vectoriel qui tourne en continu ; une
animation d'attaque FF7 = un cut. On ne peut pas fondre un cut dans le
suivant, chacun est un clip séparé déclenché par une action réelle
(exactement le contrat de `CutSequencer`). Le HUD reste un menu,
jamais de la vidéo.

**« Habiller les vecteurs par IA » — EN DIRECT (chaque frame) : non**,
pas réalisable (latence de plusieurs secondes par image avec les
technos actuelles, et ça reviendrait à payer de l'IA en continu sur
TOUTE la durée du match au lieu des seuls moments forts — détruit
l'économie du système). **En PRODUCTION (une fois, hors match) : oui,
et c'est une piste à instruire** — utiliser le mouvement précis déjà
calculé par le rendu vectoriel (fentes d'attaque, recul du coup
encaissé, posture de garde — déjà dans `arenaRenderer.ts`) comme
référence de mouvement (motion transfer / pose-driven generation) pour
produire les templates, plutôt que du texte seul. Résultat attendu :
des templates mieux synchronisés au vrai timing du jeu. Le vectoriel
sert alors aussi de PLAN DE TOURNAGE pour sa propre relève vidéo.

## Validation avant production de masse

1. **Test n°1 (bloquant)** : `counter-exchange` + swap Kenta/Rei — le
   swap simultané de deux identités est la config la plus sujette au
   mélange de traits. S'il passe, tout l'édifice tient.
2. Test de raccord : `attack-solo` → `impact-flash` → `hit-reaction`
   enchaînés — les cadrages standardisés suffisent-ils ?
3. Test de re-teinte des FX sur `special-cast` avec 2 persos de
   couleurs opposées.

Volumétrie indicative : P1+P2 ≈ 17 clips template (~27 s de vidéo à
produire, une fois — `idle-loop` inclus). Le séquenceur
(`templateShoppingList`) recalcule la liste réelle et les fréquences
d'usage depuis n'importe quel match ; `idle-loop`, jamais produit par un
event, n'y apparaît pas — comptabilisé ici à part.
