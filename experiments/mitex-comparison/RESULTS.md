# Résultats — 4 novembre 2026

**Recommandation : conserver le chemin WASM dans l’application.** La conversion
native est beaucoup plus rapide pour des formules nouvelles, mais aucun gain
régulier et utile n’apparaît pendant l’édition complète de ces articles. Elle
réduit surtout le premier rendu mathématique. Aucune migration n’est effectuée.

Machine : Apple M1 Max, arm64, 32 Gio, Darwin 25.6.0, WebKit natif. Binaire Rust
`release`, fenêtre 1 280 × 868 pixels CSS, DPR 2. Le [protocole](README.md)
précise les caches, l’isolation, les répétitions et les limites des mesures.
La base applicative est `baaf19f01106081df3f5b1cadf5c81c70bb616fc`.

## Équivalence

- MiTeX natif : tag officiel `0.2.7`, révision
  `51f7210e026ab05d037125247e92d4d023d8a80d` ; spécifications précompilées au
  sous-module `9eb762afa001b36205408c7615a73e5dfaa6f80a`.
- WASM : fichier `mitex.wasm` 0.2.7 réellement embarqué dans typstOgraphe,
  exécuté par le `PluginFunc` et le runtime de Typst 0.15.1.
- **5 460 entrées** converties par les deux moteurs : code Typst identique
  octet par octet, y compris fractions, matrices, cas et systèmes alignés.
- **198 états appariés** dans l’application : pages RGBA identiques par SHA-256,
  aux premiers rendus et après chaque édition, pour les deux répétitions.
- Les douze recettes sont terminées avec succès, fenêtres visibles, sans
  refus de publication documentaire. Aucun fichier `.typsto` personnel n’est
  ouvert, transformé ou enregistré.

## Conversion seule

Temps pour convertir **tout le corpus**, en millisecondes, p50 de 20 tours
après le premier. Chaque tour de conversion nouvelle utilise des entrées
distinctes ; les appels répétés vérifient ensuite le comportement en cache.

| Formules | Native, nouvelles | WASM, nouvelles | Native, cache | WASM, cache |
| ---: | ---: | ---: | ---: | ---: |
| 10 | 0,057 | 1,337 | 0,0011 | 0,0027 |
| 50 | 0,282 | 6,843 | 0,0047 | 0,0128 |
| 200 | 1,177 | 27,951 | 0,0200 | 0,0621 |

Le natif gagne environ un facteur 24 sur cette conversion nouvelle. Ce ratio
ne représente pas un facteur 24 sur l’aperçu : les conversions inchangées sont
mémoïsées par Typst. Le chargement du module plugin dans ce processus de mesure
prend 1,95 ms ; la première invocation appartient au tour d’échauffement et ne
fait pas partie de cette table.

## Édition complète jusqu’à publication

Temps de la transaction Tiptap à la publication des pixels dans les canvas,
en millisecondes **p50 / p95**, 30 mesures par cellule. Les deux moteurs
réutilisent le même chemin de validation, de compilation, de synchronisation
et de transport RGBA. Le candidat natif inclut sa conversion dans la projection
du source ; elle n’est pas précalculée hors du parcours chronométré.

| Article | Modification | WASM | Native |
| --- | --- | ---: | ---: |
| 10 formules · 2 pages | Prose | 36 / 39 | 36 / 42 |
| 10 formules · 2 pages | Une équation | 37 / 40 | 37 / 41 |
| 50 formules · 7 pages | Prose | 83 / 94 | 85 / 96 |
| 50 formules · 7 pages | Une équation | 85 / 96 | 84 / 89 |
| 200 formules · 24 pages | Prose | 273 / 307 | 267 / 300 |
| 200 formules · 24 pages | Une équation | 291 / 355 | 289 / 435 |

Le coût d’une nouvelle conversion isolée est trop petit pour transformer le
confort de rédaction ici. Sur le grand corpus, le p95 natif est même plus élevé
dans une série : ces courts essais ne permettent pas d’attribuer cette variation
à la conversion. Ils ne démontrent aucun gain robuste d’une bascule native à chaud.

La compilation Typst proprement dite d’une édition d’équation passe de
3,54 à 3,14 ms sur deux pages, de 5,52 à 5,11 ms sur sept pages et de 13,20 à
12,46 ms sur 24 pages (p50). Cette petite économie ne se traduit pas par un gain
comparable sur l’ensemble du parcours.

## Occasion de peinture après publication

Même chronomètre, arrêté après **deux `requestAnimationFrame`**, en millisecondes
p50 / p95. Ce n’est pas un horodatage de présentation physique à l’écran.

| Article | Modification | WASM | Native |
| --- | --- | ---: | ---: |
| 10 formules · 2 pages | Prose | 58 / 60 | 57 / 59 |
| 10 formules · 2 pages | Une équation | 58 / 60 | 47 / 60 |
| 50 formules · 7 pages | Prose | 92 / 109 | 106 / 109 |
| 50 formules · 7 pages | Une équation | 105 / 109 | 92 / 109 |
| 200 formules · 24 pages | Prose | 291 / 327 | 290 / 326 |
| 200 formules · 24 pages | Une équation | 309 / 377 | 308 / 466 |

La phase des callbacks par rapport au rafraîchissement de l’écran peut décaler
ces valeurs d’une frame alors que les temps de publication sont voisins. Les
différences de 11–14 ms de certaines cellules ne sont donc pas interprétées
comme un gain de conversion : le sens de l’écart s’inverse selon le parcours.

## Premier rendu mathématique

Deux processus neufs par cellule ; ci-dessous les **deux valeurs observées**
jusqu’à publication, en millisecondes, plutôt qu’un percentile sur deux points.
Les polices et l’application sont déjà initialisées sur un document vide.

| Article | WASM | Native |
| --- | ---: | ---: |
| 10 formules · 2 pages | 92 ; 94 | 89 ; 85 |
| 50 formules · 7 pages | 239 ; 235 | 221 ; 220 |
| 200 formules · 24 pages | 737 ; 742 | 678 ; 700 |

Le gain au premier rendu existe sur ces données, surtout sur 200 formules.
Il ne suffit pas à justifier maintenant deux chemins applicatifs, avec leur
qualification et la cohérence à maintenir avec les exports Typst autonomes.

## Suite proposée

Conserver WASM et ses exports autonomes actuels. Réévaluer le natif si un usage
réel produit beaucoup de conversions nouvelles ou un coût significatif absent
de ce corpus ; les macros personnalisées et d’autres spécifications ne sont
pas couvertes par cette étude.

**L’aperçu des articles longs reste à optimiser.** Environ 290 ms jusqu’à
publication sur 24 pages est perceptible, avec les deux moteurs. À chaud,
le bloc Rust chronométré prend environ 85–90 ms, dont 9–13 ms de compilation ;
le reste du temps total inclut notamment projection, validation, transport et
publication. Leur ventilation doit être profilée avant de choisir une
optimisation. Cette étude ne mesure pas séparément chacun de ces postes et
ne permet pas d’en désigner un comme cause unique.

Rapports bruts et résumé :

- [Conversion](results/conversion-macos.json).
- [396 aperçus, contrôles de pixels et environnement WebView](results/preview-macos.json).
- [Résumé, révisions, versions et empreintes du banc et du binaire](results/summary-macos.json).
