# Vérifications et consommation de ressources

La CI courante vise un retour en quelques minutes avec les caches disponibles.
Une compilation à froid peut prendre davantage de temps. Les garanties de
conservation des documents restent vérifiées sur chaque PR.

| Déclencheur | Vérifications |
| --- | --- |
| PR | Ubuntu : formats, architecture, Clippy, tous les tests Rust et web, contrats Rust ↔ Yjs, 7 parcours graphiques critiques dans Chromium et WebKit. Audits si les dépendances ou leur configuration changent. |
| Poussée sur `main` | Tests Rust, Clippy, compilation native et contrats sur Ubuntu, macOS et Windows. Tests web sur Ubuntu seulement. Couverture dans un workflow séparé. |
| Validation complète manuelle | Même chaîne sur les trois systèmes, tous les parcours graphiques, audits et compatibilité WebAssembly. Paquets natifs en option. |
| Lundi à 03:41 UTC | Validation complète uniquement si du code a changé depuis la dernière exécution réussie sur `main`. |
| Tag `v*` | Vérification version/commit, validation complète, construction et inspection des installateurs, puis ajout à une release en brouillon. |

## Une seule chaîne de contrôle

`ci.yml` se déclenche sur les PR et sur les poussées vers `main`, jamais sur une
poussée vers une branche de travail : une PR ouverte ne double donc plus les
exécutions. `desktop.yml` contient les étapes communes réutilisées par la CI
courante et `exhaustive.yml`, sans déclencheur indépendant. Les nouveaux commits
de code annulent les vérifications courantes devenues obsolètes ; une modification
documentaire ne coupe pas une validation de code ou une couverture encore en cours.
Les validations de tags ne sont pas annulées automatiquement.

Une modification purement documentaire ne démarre pas les compilations, les
audits ou la couverture. Le catalogue généré `docs/commands.json` reste vérifié.
Un historique indisponible déclenche les contrôles par précaution. Les suppressions
et renommages de fichiers de code restent pris en compte. Le même planificateur
sert pour les PR, la couverture et la comparaison hebdomadaire.

Le job **Résultat** termine aussi les PR documentaires et échoue si un contrôle
requis échoue. Si une protection de branche exige un contrôle unique, choisir
ce job ; les anciens noms `check (macos-latest)`, etc. ne figurent plus sur chaque
PR. La configuration des protections du dépôt n'est pas modifiée automatiquement.

## Parcours critiques

Le tag Playwright `@smoke` identifie les tests, sans les dupliquer ni modifier
leur comportement. La sélection actuelle couvre le rendu et la saisie dans les
widgets, la palette dans un champ riche, la sauvegarde/réouverture/export, la
sauvegarde concurrente, l'annulation/rétablissement par participant, les lots de
mise en forme et la conservation d'un brouillon refusé. Les tests Rust de
récupération après incident et de conservation des fichiers sont exécutés en
entier sur chaque PR.

```sh
npm run build:web
npm run build:recipe
npm run test:browser:smoke
```

Les deux moteurs restent séquentiels et partagent le port/session de recette,
jamais ceux de la rédaction. Aucun screenshot, vidéo ou trace n'est activé.
Les résultats graphiques ne sont téléversés qu'en cas d'échec, pendant 7 jours.
La suite exhaustive reste disponible avec `npm run test:browser`.

## Contrôles occasionnels

Depuis l'onglet Actions, lancer **Validation complète** sur la branche voulue,
ou, après installation de ce workflow sur la branche par défaut :

```sh
gh workflow run exhaustive.yml --ref main
gh workflow run exhaustive.yml --ref main -f packages=true
```

Le contrôle hebdomadaire compare les révisions, sans relancer une suite déjà
validée lorsque seuls des documents ont changé. En cas d'échec, sa référence
reste la dernière exécution réussie : la prochaine échéance vérifiera à nouveau
le code en défaut. Les audits sont donc aussi renouvelés lors de ces validations
avec activité, même sans changement de lockfile. Pour contrôler des avis de
sécurité apparus pendant une période sans activité, lancer la validation manuelle.

Sur un tag, les trois validations doivent réussir avant le packaging : `.deb`
et AppImage Linux x86_64, `.dmg` macOS universel (Intel et Apple Silicon), et
installateur NSIS Windows x64. Une validation complète sert tous les formats.
Le packaging utilise le lanceur Tauri habituel avec les langues générées depuis
Fluent, un binaire release sans `recipe-driver` et les dépendances verrouillées.
Les paquets sont inspectés puis conservés comme artefacts pendant 14 jours.
Un job central vérifie leurs empreintes et leur provenance avant de les joindre
à une seule release en brouillon, avec manifeste et `SHA256SUMS`. Seul ce job a
le droit d'écrire dans les releases ; une release publiée est refusée.

Sur une branche, `packages=true` produit seulement les artefacts de test. Pour
préparer ou compléter un brouillon, relancer explicitement sur le tag exact :

```sh
gh workflow run exhaustive.yml --ref vX.Y.Z
```

Le tag doit correspondre aux versions Cargo/npm/Tauri et au commit validé. Les
paquets sont construits depuis ce commit, même si la branche a avancé. Le mode
`acceptance_only=true` n'emballe ni ne dépose de release, y compris sur un tag.
Les garde-fous et les contrôles d'intégrité sont testés sur chaque PR avec
`node --test .github/scripts/release.test.mjs`.

La [procédure de publication](releases.md) précise les formats, la relance et
la validation manuelle avant publication. L'installation interactive, la
signature/notarisation et les mises à jour restent les lots H.2/H.3. Les tests
d'archives et d'exports autonomes hors ligne font partie de la validation Rust commune.
Les mesures de latence et de mémoire sur un vrai bureau restent des recettes
manuelles décrites dans [la méthode de mesure](tauri-preview-performance.md).

## Séparation distribution / recette

Chaque construction normale vérifie les assets émis avec `npm run check:distribution` :
aucun pont JavaScript de recette ni module de diagnostic/mesure ne doit y figurer.
Les handlers natifs correspondants sont exclus sans `recipe-driver`. Le mode
`browser-test` reste propre aux recettes navigateur ; les recettes natives utilisent
`npm run build:recipe` (`dist-recipe/` + overlay Tauri + feature Rust).

La validation complète et son mode `acceptance_only` vérifient aussi la recette
Courrier/Article `test:closure-native`, avec MCP, Versions, reprise annulable et
exports entre adaptateurs. Ses rapports et journaux sont conservés, sans fichiers
d’invitation ni préférences de connexion. Les paquets distribués restent construits
par le parcours normal ; la recette n’altère pas `app/dist/`.
