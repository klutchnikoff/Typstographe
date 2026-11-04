# Profilage de l’aperçu des articles longs

Étude isolée après la comparaison MiTeX native/WASM. Aucun changement du
compilateur, du transport ou de l’affichage de l’application distribuée.

Voir les [résultats et priorités proposées](RESULTS.md).

## Questions

- Quantifier les étapes de l’édition jusqu’à la publication des canvas.
- Comparer MiTeX WASM à des formules équivalentes en Typst standard, sans
  conversion ni import des modules MiTeX dans le chemin mathématique mesuré.
- Vérifier la réutilisation des sources et le bénéfice des caches Typst.
- Mesurer le nombre de pages modifiées face au volume total envoyé.

## Méthode

`prepare.py` extrait `git archive HEAD` dans `output/preview-profiling/source`.
Les transformations de code vérifient leurs points d’insertion et s’appliquent
uniquement dans cette copie. Un exécutable `typstographe-preview-profile`
distinct est construit en release avec les assets frontend embarqués. Le verrou
Cargo original est conservé, avec uniquement le changement du nom de ce binaire.
Il n’y a pas de dépendance MiTeX native dans ce candidat.

Les trois corpus précédents sont repris : 10, 50 et 200 formules, sur 2, 7 et
24 pages pour la variante LaTeX. La préparation calcule une fois leur équivalent
Typst puis remplace les trois alias non standard (`pmatrix`, `aligned`,
`mitexmathbf`) par des constructions natives. Aucune conversion n’est exécutée
pendant la mesure Typst. Les pixels et les dimensions des pages des deux langues
sont comparés pour chaque état. Les bibliothèques restent disponibles dans le
bundle commun ; la branche Typst du wrapper ne les importe pas.

Deux processus neufs par configuration, avec ordre des langues inversé au second
passage. En mode normal : premier rendu mathématique, 16 éditions de prose,
puis 16 éditions d’une formule ; le premier tour de chaque série est écarté du
résumé, soit 30 mesures par cellule. Le contrôle sur 200 formules utilise
6 éditions par série (10 mesures après échauffement). Il vide les sources et
les caches `comemo` avant chaque compilation ; il ne s’agit pas d’un mode proposé
pour l’application. Les polices et la bibliothèque de base restent initialisées.

Instrumentation frontend : attente des confirmations documentaires, construction
du snapshot, invocation Tauri, décodage du paquet, allocation des canvas,
`putImageData`, remplacement du DOM et restauration du défilement. Les appels
IPC sont aussi enregistrés individuellement ; certains se chevauchent, leurs
durées ne doivent donc pas être additionnées.

Instrumentation Rust : attente du worker et du verrou de session, validation et
projection du snapshot, carte du source, préparation des dépendances, compilation,
appel interne au moteur Typst, rasterisation, conversion RGBA non prémultiplié,
carte de synchronisation et assemblage du paquet. Les mises à jour des fichiers
Typst indiquent si le `Source` a été réutilisé et si son texte était inchangé.

Le résiduel `requestMs - nativeMs - dispatchWaitMs` comprend notamment les
sérialisations, copies de transport et ordonnanceurs Tauri/WebKit. Ce n’est pas
un chronométrage exclusif de la copie IPC. `publishedMs` va de la transaction
Tiptap à la publication ; `frameMs` attend ensuite deux `requestAnimationFrame`,
sans prétendre dater la présentation GPU. Les hachages de pixels sont calculés
hors du chemin chronométré. Une fenêtre masquée invalide l’essai.
La fenêtre de recette reste au premier plan pour éviter l’occlusion par les
autres applications. Cela ne désactive pas la limitation des fenêtres masquées
de WebKit. Une interruption de visibilité provoque le rejet du parcours entier,
avec au plus deux relances dans une session neuve ; les interruptions sont
consignées séparément. Aucun échantillon lent n’est écarté pour sa durée.

## Reproduire sur macOS

Rust, Node, les dépendances habituelles Tauri et la CLI Typst 0.15.1 sont requis.
La CLI sert uniquement à préparer les sources équivalentes. Les mesures utilisent
le moteur embarqué de l’application, sans Vite, relais HTTP de navigateur ou
accès réseau.

```sh
python3 experiments/preview-profiling/prepare.py
cd output/preview-profiling/source
npm --workspace app run build -- --mode recipe
TAURI_CONFIG='{"build":{"frontendDist":"../dist-recipe"}}' \
  CARGO_TARGET_DIR="$PWD/../../../target" \
  cargo build --locked --offline --release -p typstographe-preview-profile \
  --features recipe-driver -j 2
cd ../../..
caffeinate -di node experiments/preview-profiling/run.mjs
```

`--smoke` limite le lancement à la première paire de petits articles pour
vérifier l’instrumentation et l’équivalence. Chaque lancement possède de nouvelles
sessions. La préparation refuse d’écraser une copie déjà présente.

Les rapports locaux sont dans `output/preview-profiling`. Les fichiers `.typsto`
de l’utilisateur ne sont jamais ouverts. Les mesures ne couvrent ni le clavier
système/IME, ni une frappe en rafale, ni toutes les formes possibles d’articles.
