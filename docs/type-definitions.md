# Déclarations de types : contrat initial et chargeur YAML

Contrat initial du 3 novembre 2026, dans
`typstographe_core::document_types::definition`. Cette API lit et valide une
déclaration ; elle **n’installe pas un type** et ne remplace pas encore les
structures Courrier/Article ni leur registre dans les adaptateurs.

Le [fragment auteurs/affiliations](proposals/b1/article-authorship.yaml) est une
fixture chargée et testée. Il isole ces deux collections ; ce n’est pas la
définition complète de l’Article actuel. Le raccordement à la création, aux
commandes et à la composition des documents sera une tranche ultérieure.

## Autorité et API

- `Definition` est le contrat Serde/Schemars typé. Les genres de valeurs, variantes
  et paramètres reconnus sont définis en Rust, sans expression exécutable en YAML.
- `load_yaml(&str)` renvoie un `LoadedDefinition` uniquement après décodage et
  validation sémantique. `Definition::validate(self)` sert au même contrôle pour
  une déclaration construite autrement ; le résultat est immuable.
- `manifest_schema()` produit le JSON Schema du manifeste depuis les types Rust.
  Le [schéma versionné](schemas/type-definition.schema.json) est généré, avec un
  test de concordance ; il n’est pas maintenu à la main.
- `LoadedDefinition::values_schema()` décrit la structure des valeurs à partir
  de la définition chargée. Il distingue les obligations d’export des contraintes
  de structure. Ce schéma n’applique pas les relations métier ni les éditions.
- `defaults()` crée les valeurs de champs racine et les collections vides ;
  `record_defaults(collection)` fournit les valeurs d’un nouvel enregistrement,
  sans inventer son identifiant. L’opération d’édition fournit l’identité stable.

La liste des capacités référence le catalogue exécutable commun. Une capacité
inconnue ou simplement prévue est refusée. Les permissions d’un adaptateur et
la disponibilité au curseur restent des contrôles distincts.

## Vocabulaire du premier chargeur

| Déclaration | Sémantique et défaut |
| --- | --- |
| `text` | Chaîne littérale, vide par défaut ; `multiline: false` par défaut. Aucune source Typst injectée par la valeur. |
| `boolean` | Booléen, `false` par défaut. |
| `choice` | Liste fermée de chaînes distinctes et défaut explicite appartenant à cette liste. |
| `language` | Langue documentaire du vocabulaire commun, français par défaut. Distincte de la langue d’interface. |
| `tokens` | Liste de chaînes, vide par défaut ; mots-clés notamment. |
| `rich-text` | Contenu éditorial structuré, vide par défaut ; profil `inline-text` ou `rich-text` commun. |
| `record-references` | Liste d’identifiants vers une collection existante ; `unique: true`, `on-target-remove: restrict`, défaut vide. |
| `ordered-records` | Collection à identités stables et ordre distinct des libellés ; champs décrits par les genres ci-dessus. |

Les identifiants de déclarations sont des noms ASCII commençant par une lettre
minuscule, suivie de lettres minuscules, chiffres, tirets, soulignés ou points,
avec un maximum de 128 octets. Les paramètres et la fonction Typst doivent en
plus être de simples identifiants Typst, sans point ni mot-clé.
L’identifiant `id` d’un enregistrement est réservé à son identité ; il n’est
pas redéclaré comme champ éditable.

Les dates structurées, références de ressources/signatures, options de modèles
et structures métier nouvelles ne sont pas encore des genres du chargeur.
Leurs contrats restent à préciser ; aucun genre générique « source arbitraire »
n’est utilisé pour les simuler. Les structures actuelles continuent de les gérer.

### Collections, liaisons et vues

Chaque champ racine ou collection possède une liaison unique vers un paramètre
Typst, distinct des autres paramètres. Cette déclaration ne vérifie pas encore
la présence de la fonction ni sa signature dans un fichier de modèle.

L’en-tête permet deux vues :

- `form` : sections ordonnées référençant les champs racine ;
- `record-cards` : cartes d’une collection avec champ de résumé et édition
  `dialog`. Une liste `fields` facultative limite les champs édités par cette vue ;
  absente ou vide, elle sélectionne tous les champs.

Plusieurs vues peuvent éditer des sous-ensembles de la même collection, comme
Titres et Résumés. Les références des vues sont vérifiées et chaque champ doit
être exposé par au moins une vue. Il n’y a ni duplication de données, ni CSS,
ni raccourci propre au type dans cette définition.

`unique-by` décrit les champs scalaires d’une clé composée unique par collection.
Le chargeur vérifie que ces champs existent et sont scalaires ; vérifier
l’unicité des enregistrements appartient ensuite à la validation documentaire.
Une relation `restrict` signifie de même que l’état final d’un lot ne peut pas
laisser de référence pendante ; elle ne commande pas une suppression en cascade.

## YAML et diagnostics

Le chargeur utilise [yaml_serde 0.10.7](https://docs.rs/yaml_serde/0.10.7/yaml_serde/),
publié par l’organisation YAML, avec son parseur Rust `libyaml-rs` 0.3.0.
Versions et sommes de contrôle figurent dans `Cargo.lock` ; yaml_serde est sous
MIT ou Apache-2.0, libyaml-rs sous MIT. Aucune dépendance nouvelle à Fluent ou à
une interface graphique.

Conventions :

- un seul document YAML, au maximum 256 Kio de source UTF-8 ;
- commentaires et ancres/alias acceptés ; limites de récursion et de répétition
  du parseur conservées ;
- doublons de clés refusés à toute profondeur, avant le décodage typé ;
- clés de mapping textuelles, pas de clés de fusion `<<`, de tags personnalisés
  ni de nombres non finis ;
- champs inconnus, variantes non prises en charge et défauts du mauvais genre
  refusés, sans coercition applicative ni exécution de contenu ;
- aucun accès disque, import, réseau ou enregistrement dans un catalogue lors
  de `load_yaml` : l’appelant fournit le texte à lire.

Le passage par la valeur YAML du parseur vérifie les doublons et le sous-ensemble
commun avec JSON ; le décodage typé repart du source pour conserver les positions
fournies par la bibliothèque. Ce contrôle n’utilise pas de parseur maison.

Les erreurs sont sérialisables et typées : `source_too_large`, `decode`,
`unsupported_yaml`, `invalid_definition`. Les erreurs de décodage conservent
ligne/colonne lorsqu’elles sont fournies ; les diagnostics sémantiques exposent
un code et un chemin JSON Pointer. Le cœur ne traduit pas ces messages : les
adaptateurs pourront les présenter avec Fluent, comme les autres erreurs typées.

Les limites du contrat initial sont 64 collections, 128 champs par liste,
100 enregistrements par collection, 64 onglets et 64 sections par formulaire.
Les défauts textuels sont limités à 16 000 octets, les listes de mots-clés à
100 éléments de 1 000 octets chacun. Les contrôles byte/relations exposés dans
les schémas de valeurs avec `x-*` sont des annotations : JSON Schema ne les
transforme pas en règles métier exécutables.

## Vérification et génération

```sh
cargo test --locked --offline -p typstographe-core document_types::definition
cargo run --locked --offline -p typstographe-core --example type_manifest_schema > docs/schemas/type-definition.schema.json
```

Les tests contrôlent le fragment auteurs/affiliations, les défauts de brouillons,
les références de vues et de liaisons, les politiques de relations, les défauts
riches et leurs profils, les cas YAML ambigus, le schéma généré et la fermeture
de ses références récursives. Le schéma des valeurs peut être utilisé comme
contrôle de structure ; il ne suffit pas à autoriser la publication d’une édition.

Le raccordement des déclarations chargées au moteur, aux adaptateurs et à Typst
reste à faire, avec validation documentaire, diagnostics d’export, régimes de
modèles et recette complète Courrier/Article. Ce lot fournit le contrat et le
chargeur partagés nécessaires à cette migration.

Vérifications locales du lot : 16 tests dédiés et 258 tests de bibliothèques du
workspace réussis ; Clippy sur tous les targets du workspace, formatage Rust et
gardes de dépendances/taille du cœur réussis. Les tests des profils riches
vérifient notamment les références récursives des sous-schémas : elles ne doivent
pas pointer par erreur vers la racine des métadonnées. Ce bilan est local ; il ne
remplace pas la qualification CI des trois systèmes ou du target WebAssembly.
