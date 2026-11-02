# Installateurs et releases

Le lot H.1 prépare des **installateurs de développement non signés** dans une
release GitHub en brouillon. La publication est une décision manuelle. Les
recettes d'installation sur les trois systèmes (H.2), la signature/notarisation,
Homebrew et les mises à jour (H.3) restent des étapes distinctes.

## Paquets prévus

| Plateforme | Architecture | Fichiers |
| --- | --- | --- |
| macOS | Intel et Apple Silicon, binaire universel | `.dmg` |
| Linux | x86_64, construit sur Ubuntu 22.04 | `.deb`, AppImage |
| Windows | x64 | installateur NSIS `.exe` |

L'architecture figure dans chaque nom de fichier. Les paquets utilisent les
icônes et les langues Fluent du parcours Tauri normal, le frontend distribué
et le moteur Typst intégré en Rust. Ils ne demandent pas Rust ou Node.js aux
utilisateurs. Aucun sidecar Typst/Tinymist n'est ajouté.

## Préparer une version

1. Mettre en accord les versions du workspace Cargo, de ses membres, de npm
   (racine, application et lockfile) et de `tauri.conf.json`. Actualiser aussi
   les lockfiles concernés, puis fusionner et valider le commit.
2. Créer et pousser un tag annoté `vX.Y.Z` sur ce commit. **Ne pas déplacer un
   tag déjà diffusé** : un correctif reçoit une nouvelle version.
3. Le workflow **Validation complète** vérifie le tag et les versions, refuse
   une release déjà publiée, puis exécute la validation commune sur les trois
   systèmes. Les formats ne relancent pas chacun cette suite.
4. Après succès, la matrice construit les installateurs depuis le **SHA figé**.
   Les anciens bundles sont effacés avant compilation ; les dépendances Cargo
   compilées restent en cache. Le packaging vérifie les binaires, le `.dmg`,
   les deux architectures macOS, le contenu `.deb`/AppImage et le frontend
   sans module de recette. Les installateurs et leur provenance sont conservés
   comme artefacts de CI pendant 14 jours.
5. Quand toutes les plateformes réussissent, un seul job vérifie le commit,
   la version, la liste des fichiers et leurs empreintes SHA-256. Il crée ou
   complète le brouillon du tag, sans modifier les notes d'un brouillon existant.
   Il ajoute les quatre installateurs, un manifeste et `SHA256SUMS`.
6. Relire la note anglaise initiale, préciser les nouveautés et limites, puis
   vérifier les installateurs avant de publier manuellement le brouillon.

Un succès de compilation/inspection ne vaut pas une recette de l'application
installée. Les validations interactives macOS/Windows/Linux restent nécessaires
avant une diffusion à des utilisateurs extérieurs. Les premiers paquets ne sont
ni signés ni notarisés ; aucun manifeste de mise à jour automatique n'est publié.

## Relancer sans changer le tag

Pour reprendre un échec, utiliser **Re-run failed jobs** ou relancer le workflow
sur le tag exact, une fois ce workflow présent dans la branche par défaut :

```sh
gh workflow run exhaustive.yml --ref vX.Y.Z
```

Les artefacts intermédiaires d'une plateforme peuvent être reconstruits ; le
dépôt des fichiers est idempotent tant que la release reste en brouillon. Une
release déjà publiée est refusée, aussi bien avant compilation qu'avant dépôt.
Le SHA distant du tag est revérifié avant dépôt : un tag déplacé ne peut pas
faire publier des installateurs sous une provenance différente.

Pour construire sur une branche sans créer de brouillon :

```sh
gh workflow run exhaustive.yml --ref main -f packages=true
```

Cette voie conserve les paquets comme artefacts de test. `acceptance_only=true`
reste réservé aux recettes natives : il ne construit ni n'ajoute d'installateurs,
y compris lorsqu'il est lancé sur un tag.

Le lot H.1 ne remplace pas les fichiers de la release `v0.1.0` déjà publiée.
La première utilisation de cette chaîne sur un tag devra porter une nouvelle
version et les versions de configuration correspondantes.

## Vérifications locales

```sh
node --test .github/scripts/release.test.mjs
npx prettier --config app/.prettierrc.json --check '.github/scripts/*.mjs'
actionlint .github/workflows/exhaustive.yml .github/workflows/desktop.yml
```

Les tests utilisent des fichiers temporaires et un client GitHub simulé. Ils
vérifient notamment les paquets manquants, altérés ou issus d'un autre commit,
les tags déplacés, les releases déjà publiées et la reprise d'un brouillon.
Ils ne publient aucune release ni invitation et n'ouvrent aucun document personnel.

## Vérification locale du lot H.1

Vérifications du 2 novembre 2026 :

- 11 tests Node de planification, provenance, intégrité et dépôt en brouillon : réussis.
- 17 tests Python du planificateur CI et des contrôles d'architecture : réussis.
- `actionlint`, Prettier et `check:distribution` : réussis.
- Contrôle GitHub réel en lecture seule : la release publiée `v0.1.0` est refusée,
  sans tentative d'écriture.
- Construction release macOS ARM64 : réussie. Le `.dmg` fait 114 582 481 octets
  (109,27 Mio), avec `hdiutil verify` réussi et SHA-256
  `baf4c1e48f1d91f28ac92579e3d792c595552639b0d2e23940de53fdf2487746`.
  Le `.app` conservé possède un `Info.plist` valide et un exécutable ARM64.
  Son exécutable démarre et refuse `--stdio` avec le diagnostic attendu avant
  toute ouverture de fenêtre ou de document : le mode recette est bien absent.

L'essai a précisé deux points du packaging macOS : déclarer `CI=true` pour
éviter l'AppleScript Finder (le seul argument `--ci` ne suffit pas au bundler),
et demander `app,dmg` pour conserver le `.app` à inspecter. Avec seulement
`dmg`, Tauri efface ce `.app` intermédiaire après construction. Le runner
contrôle ensuite les deux architectures du binaire universel avec `lipo`.

L'image locale de test se trouve dans
`target/aarch64-apple-darwin/release/bundle/dmg/` ; elle ne remplace aucun fichier
de la release publiée. Les images temporaires de l'essai sont démontées.
L'architecture Intel/universelle, Linux et Windows n'ont pas été construites
localement. Leur qualification sur les runners, le premier dépôt réel dans un
brouillon et les recettes de l'application installée restent à effectuer.

## Références

L'organisation reprend des idées des workflows de
[DBV Typst Editor](https://github.com/davidbuenov/dbv-typst-editor/tree/master/.github/workflows) :
brouillon commun, architectures explicites et vérification du paquet final.
Notre chaîne réutilise le CLI Tauri et `gh release`, déjà employés dans le projet,
avec un dépôt central après validation des trois plateformes. Les étapes propres
aux sidecars de DBV ne sont pas reprises.

- [Packaging Tauri](https://v2.tauri.app/distribute/)
- [CLI GitHub Releases](https://cli.github.com/manual/gh_release)
