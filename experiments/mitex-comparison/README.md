# MiTeX : comparaison native / WASM

Banc isolé demandé le 4 novembre 2026. L’application conserve son intégration
WASM. Aucun mode de conversion ni dépendance MiTeX native n’est ajouté à ses
manifestes, à ses commandes ou au format `.typsto`.

**Essai réalisé :** voir les [résultats et la recommandation](RESULTS.md).

## Deux mesures complémentaires

1. **Conversion seule.** Le convertisseur Rust du tag officiel `0.2.7` est
   comparé au `PluginFunc` de Typst 0.15.1 exécutant le WASM effectivement embarqué.
   Ce n’est ni un autre hôte WASM, ni une mesure dans JavaScript. On vérifie
   l’égalité octet par octet du code Typst converti. Les entrées reçoivent des
   suffixes d’espaces distincts par corpus/tour pour mesurer de nouvelles
   conversions ; les appels immédiatement répétés mesurent ensuite les caches.
   Le chargement initial du plugin est chronométré séparément.
2. **Aperçu complet.** Une copie jetable de l’application est compilée en
   `release`, avec les assets de recette embarqués, puis exécutée dans la vraie
   WebView Tauri. Le candidat natif convertit lors de la projection du source,
   garde un cache par expression et évalue le résultat avec le même
   `mitex-scope`. Le chemin WASM reste celui de l’application. Validation,
   historique individuel, compilation, rasterisation, carte de synchronisation,
   IPC RGBA et publication du canvas sont conservés.

Les trois articles contiennent **10, 50 et 200 formules LaTeX**, à 60 % en ligne
et 40 % en bloc. Ils mêlent prose française, titres, fractions, intégrales,
sommes, matrices, cas et systèmes alignés. Ce sont des corpus synthétiques de
charge, tous en LaTeX pour exposer le coût du convertisseur ; un article mêlant
Typst et LaTeX n’aurait à convertir que sa partie LaTeX. Aucun fichier personnel
ni exemple `.typsto` local n’est utilisé ou modifié.

Chaque paire article/moteur dispose de **deux processus et sessions neufs**.
L’ordre s’inverse entre les répétitions. Après le premier rendu mathématique,
16 éditions de prose, puis 16 éditions d’une équation sont effectuées. Le premier
tour de chaque série d’éditions est écarté du résumé : 30 observations restent
par article/moteur/type d’édition. Le premier rendu ne compte que deux observations.

Les durées sont prises de la transaction de l’éditeur à la publication du canvas
(`publishedMs`), puis à deux `requestAnimationFrame` (`frameMs`). Cette seconde
valeur laisse une occasion de peindre, sans prétendre mesurer la présentation
physique par le GPU. La fenêtre doit rester visible ; une suspension des frames
invalide l’essai. Le hachage des pixels s’effectue **hors chronométrage**.
Les pages de chaque état sont comparées pixel par pixel via leurs SHA-256.

Le premier rendu mesure une **première utilisation des mathématiques après
l’initialisation de l’application et des polices**, pas la durée de lancement du
processus. Les éditions sont des transactions synthétiques, sans clavier système
ni IME. La cadence de l’écran quantifie les mesures jusqu’aux frames. Les médianes
et p95 de ces courts essais restent propres au corpus et à cette machine.

## Reproduire sur macOS

Prévoir Rust, Node, les dépendances habituelles Tauri et une session graphique
visible. Le compilateur partage les caches `target/release` mais produit un
**binaire distinct** `typstographe-mitex-benchmark`. Les binaires de l’application
et ceux des recettes habituelles ne sont pas remplacés. Les téléchargements
initiaux concernent uniquement les sources du candidat et leurs dépendances.

```sh
git clone --depth 1 --branch 0.2.7 https://github.com/mitex-rs/mitex.git output/mitex-benchmark/upstream
git -C output/mitex-benchmark/upstream submodule update --init --depth 1
python3 experiments/mitex-comparison/prepare.py

cd output/mitex-benchmark/source
npm --workspace app run build -- --mode recipe
TAURI_CONFIG='{"build":{"frontendDist":"../dist-recipe"}}' \
  CARGO_TARGET_DIR="$PWD/../../../target" \
  cargo build --locked --release -p typstographe-mitex-benchmark \
  --features recipe-driver -j 2
cd ../../..
caffeinate -di node experiments/mitex-comparison/run.mjs
```

Le script de préparation refuse d’écraser une copie déjà présente. Il extrait
`git archive HEAD` et applique des transformations avec vérification du nombre
d’occurrences ; il échoue si les points d’instrumentation ont changé. Le
`Cargo.lock` de ce dossier est réservé au candidat. La révision MiTeX et celle
de son sous-module de spécifications sont enregistrées dans le manifeste.

Les journaux, sessions et sorties de compilation restent dans
`output/mitex-benchmark/`. Seuls les scripts, le verrou expérimental et les
rapports de résultats sont versionnés. Aucun service, réseau ou serveur Vite
n’intervient pendant les mesures.
