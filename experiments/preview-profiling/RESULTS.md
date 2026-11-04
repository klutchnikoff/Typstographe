# Profilage — 4 novembre 2026

**Le moteur utilise déjà les mécanismes incrémentaux de Typst. Le principal
coût des articles longs est la préparation et la publication de toutes les
pages de l’aperçu, même lorsque seule une page change.** Écrire directement
les formules en Typst réduit un peu la compilation, sans supprimer ce coût.

Machine : Apple M1 Max, 32 Gio, Darwin 25.6.0, WebKit natif. Application en
release, assets embarqués, fenêtre visible de 1 280 × 868 pixels CSS, DPR 2.
Le [protocole](README.md) détaille les chronomètres et leurs limites.

## 1. Incrémentalité vérifiée

L’application garde un `TypstWorld` dans le `Renderer` pendant la session. Les
fichiers virtuels ne sont pas reconstruits à chaque frappe : `set_source`
réutilise les `Source` et appelle `Source::replace` si le texte change. Dans
Typst 0.15.1, cette méthode calcule la zone de remplacement, puis effectue une
réanalyse syntaxique incrémentale. L’évaluation et la mise en page utilisent
la mémoïsation `comemo`.

Les observations le confirment : dans les **384 états édités à chaud**, les
trois sources sont conservées à chaque fois (1 152 réutilisations). `main.typ`
et `modele.typ` restent inchangés ; seul `contenu.typ` est modifié. Sur 24 pages,
la mise à jour des sources prend environ **0,22 ms**.

Le contrôle vide les sources et les caches avant chaque compilation. Les
polices et la bibliothèque de base restent initialisées. Temps p50 de
`compile_with_model` après modification d’une formule, sur 24 pages :

| Langage des formules | Caches conservés | Sources et caches vidés |
| --- | ---: | ---: |
| LaTeX / MiTeX WASM | 13,19 ms | 137,44 ms |
| Typst standard | 10,84 ms | 92,72 ms |

Le contrôle comporte 10 mesures par cellule, le mode normal 30. Il mesure
l’effet combiné des caches et de la conservation des sources, pas la seule
réanalyse syntaxique. Vider `comemo` pénalise aussi les caches du rendu : la
rasterisation passe d’environ 30 ms à 150 ms. Ce contrôle n’est pas un mode
proposé pour l’application.

L’appel à `typst::compile` produit bien un document complet à chaque demande ;
cela ne signifie pas qu’il recalcule tous les sous-résultats à zéro. En revanche,
la chaîne d’aperçu ne fait actuellement **aucune publication différentielle
par page** : elle prépare les pixels et les canvas de toutes les pages.

## 2. Comparaison avec des formules natives Typst

Les sources Typst sont préparées une fois avant les essais. Les seuls alias
non standard du corpus sont remplacés par `mat`, `pad`/`block`/`math.op` et
`bold`/`upright`. Pendant ce parcours, aucune formule ne passe par un
convertisseur ou par `mitex-scope`. Le bundle commun garde la capacité LaTeX
disponible ; la branche Typst du wrapper n’exécute pas son import MiTeX.

**16 sessions valides, 448 aperçus mesurés, 224 états appariés : dimensions
et SHA-256 des pixels identiques entre les deux langages.**

Après modification d’une formule, p50 / p95 en millisecondes, 30 mesures à chaud
par cellule. « Publication » va de la transaction Tiptap à l’observation de la
publication des canvas ; ce n’est pas un horodatage de présentation GPU.

| Article | Compilation MiTeX | Compilation Typst | Publication MiTeX | Publication Typst |
| --- | ---: | ---: | ---: | ---: |
| 10 formules · 2 pages | 3,53 / 3,80 | 1,64 / 1,78 | 36 / 39 | 35 / 37 |
| 50 formules · 7 pages | 5,52 / 5,89 | 3,58 / 3,83 | 84 / 90 | 80 / 88 |
| 200 formules · 24 pages | 13,19 / 14,04 | 10,84 / 11,53 | 288 / 326 | 260 / 277 |

Sur le grand article, l’écart de compilation est **2,35 ms**, bien inférieur
aux 28 ms d’écart de publication observés. Le reste de l’écart se situe surtout
dans le transport et `putImageData`, malgré des pixels identiques. Ces données
ne permettent donc pas d’attribuer l’écart total à la conversion MiTeX. Les
coûts de copies, de publication et leur variabilité restent présents avec les
deux langages. Le maintien de WASM n’est pas remis en cause.

## 3. Où passent les millisecondes ?

Grand article, édition d’une formule, MiTeX WASM à chaud. Valeurs p50 ; les
quantiles par étape ne s’additionnent pas exactement au quantile du total.
Les étapes incluses dans d’autres mesures sont signalées.

| Étape | Durée |
| --- | ---: |
| Attente des confirmations documentaires / contexte (`flush`) | 13 ms |
| Validation et projection du snapshot côté Rust | 1,80 ms |
| Construction de la carte source | 11,69 ms |
| Préparation des dépendances et ressources | 0,20 ms |
| Compilation complète, avec caches | 13,19 ms |
| Dont appel interne au moteur Typst | 12,87 ms |
| Rasterisation des 24 pages | 30,34 ms |
| Conversion des pixels en RGBA non prémultiplié | 30,94 ms |
| Construction de la carte de synchronisation | 12,56 ms |
| Assemblage du paquet binaire | 4,23 ms |
| Résiduel de l’invocation : sérialisation, IPC, ordonnanceurs | 56,53 ms |
| `putImageData` dans les nouveaux canvas | 71 ms |
| Remplacement du DOM et restauration du défilement | 1 ms |
| Total transaction → publication observée | 288 ms |
| Total après deux `requestAnimationFrame` | 311 ms |

Le worker Rust prend 106,41 ms, contre 166 ms pour l’invocation vue du frontend.
Le résiduel ne peut pas être interprété comme une copie IPC pure : il inclut
aussi sérialisation et ordonnancement. Le traitement de l’éditeur, la file des
microtâches et les actualisations UI voisines expliquent une partie du temps
restant ; ils ne sont pas chacun instrumentés individuellement.

Le décodage du petit en-tête et la construction du snapshot JavaScript sont
inférieurs à la résolution milliseconde de l’horloge dans la plupart des
échantillons. L’attente du worker et du verrou de session est négligeable ici.
La mise à jour des sources et l’attente du verrou ne sont donc pas les coûts
dominants des centaines de millisecondes observées.

Les anciens compteurs ne ventilaient pas la conversion RGBA et l’assemblage
du paquet ; ce dernier est même hors de `Renderer.elapsed_ms`. Côté frontend,
seule une mesure allant jusqu’aux canvas rend visible le coût total.

## 4. Le travail redondant

Dans **toutes les éditions valides**, une seule page change de pixels. Pourtant,
le grand article génère un paquet d’environ **192,66 Mo, soit 183,73 Mio** à
chaque mise à jour : les 24 images RGBA, la source et les métadonnées. Chaque
image A4 contient 1 191 × 1 684 pixels, soit 7,65 Mio de RGBA.

La boucle de rendu parcourt les 24 pages, la conversion RGBA les parcourt
encore, le transport envoie tout le paquet et l’interface crée 24 nouveaux
canvas, les remplit, puis remplace tous les anciens éléments. Le cache interne
de Typst ne supprime pas ces opérations de notre couche d’aperçu.

Autre travail redondant observé à chaud sur le grand article : environ
**quatre appels `count_text` par édition**. Certains appels IPC se chevauchent ; additionner leurs durées
surestimerait leur contribution au délai. C’est un sujet de consolidation
secondaire après le volume de pixels.

## 5. Priorités proposées, sans implémentation dans ce lot

1. **Mises à jour différentielles par page.** Détecter les pages dont le rendu
   peut être réutilisé, conserver leurs pixels et leurs canvas, et transférer
   uniquement les pages modifiées. Publier ensemble les métadonnées de la
   nouvelle révision ; préserver les contrôles contre les aperçus périmés,
   les dimensions, les renvois et les deux sens de synchronisation.
2. **Premier aperçu des documents longs.** Évaluer la priorité aux pages
   visibles pour la rasterisation et la publication. La mise en page et les
   références doivent rester calculées sur le document complet avec les
   caches Typst ; il s’agit de différer des pixels, pas des règles documentaires.
3. **Travaux secondaires.** Consolider les requêtes de compteurs et les
   actualisations UI répétées ; profiler ensuite les cartes source/synchronisation
   si elles deviennent dominantes après réduction des transferts.

Il n’y a pas lieu, sur ces mesures, de commencer par changer de moteur de
compilation, supprimer des validations documentaires ou réduire la qualité
des pixels. Aucun gain futur précis n’est promis avant une recette du nouveau
chemin. Les choix de protocole et de publication restent à valider ensemble.

## Qualification et limites

La série finale garde la fenêtre de recette au premier plan et conserve les
contrôles de visibilité WebKit : **aucune interruption dans ses 16 sessions**.
Sept tentatives antérieures, interrompues par un signal de fenêtre masquée,
sont entièrement exclues et consignées dans le résumé. Les parcours lents
valides ne sont pas écartés.

Les transactions sont synthétiques et espacées jusqu’au rendu suivant ; elles
ne représentent pas une frappe en rafale ni le clavier/IME système. Le corpus
est synthétique, sans grande bibliographie ni images lourdes. Les résultats
restent propres à cette machine et ne remplacent pas une qualification Windows
ou Linux. La mesure jusque deux frames est sensible à la cadence de l’écran.

Rapports : [données brutes](results/preview-macos.json),
[résumé, provenance, sources réutilisées et interruptions exclues](results/summary-macos.json).
