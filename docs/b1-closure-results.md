# B.1 — Bilan de clôture des contrats déclaratifs

**Clôturé après relecture le 3 novembre 2026.** Le périmètre livré porte sur
les déclarations embarquées de Courrier, Article et du contrat interne
Compte-rendu. Les deux premiers sont créables ; le troisième attend un modèle
fourni. Le chargement d’un YAML ne crée ni type installable ni comportement.

**Frontière confirmée :** Serde/Schemars définit le vocabulaire typé, YAML
compose les structures et capacités enregistrées, le moteur valide les éditions
et les composants communs portent les interactions. Les codecs de données
restent en Rust. L’état documentaire structuré fait autorité ; le Typst dérivé
et les modèles assurent sérialisation et présentation, sans code injecté par les
valeurs saisies. Il n’y a pas de langage de validation ou d’interaction en YAML.

**Critères de sortie contrôlés dans le code et les recettes :**

| Critère acquis | Preuves et contrat de référence |
| --- | --- |
| Chargeur strict en mémoire : genres, défauts, limites, doublons et champs inconnus ; diagnostics structurés ; schémas de manifeste et de valeurs dérivés | [Chargeur](../crates/core/src/document_types/definition/loader.rs), [tests](../crates/core/src/document_types/definition/tests.rs), [contrat YAML](type-definitions.md) |
| Brouillons valides séparés des exigences d’export ; identités, unicités et relations contrôlées à la fin du lot | [Validation des valeurs](../crates/core/src/document_types/definition/values.rs), [tests métier](../crates/core/src/document_types/definition/value_tests.rs) |
| `authorship` partagé : auteurs et affiliations, relations `restrict`, vues et liaisons ; ordre complet sans redéfinition ou masquage | [Fragment](../crates/core/structures/authorship.yaml), [composition et tests](../crates/core/src/document_types/definition/structures/tests.rs) |
| Déclarations actives conformes aux codecs ; champs, capacités, défauts, en-têtes et liaisons issus du contrat résolu | [Registre](../crates/core/src/document_types/runtime/mod.rs), [parité et sources](../crates/core/src/document_types/runtime/tests.rs), [fixture](../fixtures/document-types/source-contract.json) |
| Même contrat pour Tauri/CLI/MCP, découverte progressive et permissions inchangées | [Catalogue API](../crates/core/src/content/api/catalogue.rs), [CLI](../crates/cli/tests/calls.rs), [MCP](../crates/mcp/src/discovery_tests.rs) |
| Options libres/restreintes/imposées : choix conservé, valeur effective, langue et nouvelles écritures ; historique, stockage et rendu cohérents | [Contrat des régimes](model-options.md), [tests](../crates/core/src/document_types/model_options/tests.rs) |
| Dates complètes, personnalisées ou absentes, sans inférence ; horloge dans l’adaptateur ; `none`/`datetime`/chaîne transmis à Typst/Datify | [Contrat des dates](structured-dates.md), [valeurs](../crates/core/src/dates.rs), [rendu réel](../crates/core/src/document_types/courrier.rs) |
| Références d’images : signature déclarée, copie du profil, import et affectation atomiques, octets privés récupérables, rétention et exports communs | [Contrat des ressources](resource-references.md), [références](../crates/core/src/resources.rs), [historique et ressources](../crates/core/src/content/shared/settings_tests.rs) |
| Données préparatoires des renvois, formules et bibliothèques définies sans annoncer leur implémentation | [Inventaire B.1, section 4](b1-type-contracts.md#4-contrats-à-préparer-pour-c1c4), lots C.1–C.4 ci-dessous |

Le schéma des valeurs contrôle la structure ; les relations, permissions,
conflits et décisions d’édition restent des règles du moteur. Les déclarations
et fragments sont validés et mis en cache à l’initialisation, avec vérification
de leur correspondance exacte aux codecs. Les adaptateurs ne maintiennent pas
une seconde liste de champs ou de politiques.

Le périmètre des régimes est format, orientation, puces, style de citation et
sommaire. Une absence de choix suit le modèle ; une valeur exclue reste conservée
et utilise le défaut avec avertissement ; une valeur imposée masque son contrôle.
La langue documentaire appartient à l’auteur et un modèle incompatible est refusé.
Pour les ressources, le cœur reçoit références et octets ; le profil privé est
lu et copié par l’adaptateur, sans liaison permanente avec le document.

**Qualification de clôture :** les 55 tests `document_types` ont été rejoués
avec succès lors de cette relecture (chargeur, structures, schémas publiés,
codecs, options, modèles et sources). Les résultats complets des lots livrés
sont consignés dans les contrats ci-dessus ; le [dernier bilan](resource-references.md#verification--3-november-2026)
couvre aussi le contrat croisé Yjs/Yrs et les parcours Chromium/WebKit.
Cette revue ne revendique pas une nouvelle qualification CI multisystème.
Aucune capture n’est produite ; les fichiers de travail locaux sont préservés.
Le conteneur courant est CAS **14**, générateur **4**, sans lecteur de
compatibilité pour les formats expérimentaux antérieurs.

**Extensions différées, hors critères de clôture :**

- Types externes, codecs arbitraires, installation et rechargement de types ;
  paramètres personnalisables des fragments partagés, aujourd’hui réutilisés
  à l’identique. Les identités et comportements restent enregistrés en Rust.
- Paramètres propres aux modèles : étendre les régimes communs avec identités,
  genres et contrôles après validation dans D ; conserver contenu de l’auteur,
  choix enregistré et valeur de rendu distincts.
- Dates ou ressources dans les collections, précision calendaire supplémentaire
  et genres de ressources autres que les images : enregistrer leurs contrôles
  et validateurs avant de les autoriser ; les déclarations non prises en charge
  sont refusées par le chargeur.
- Paquets installables de modèles, versions, provenance, ressources et licences
  de polices : chantier D, avec les contrôles de distribution dans H.
- Renvois, formules et bibliothèques : les contrats préparatoires de B.1 servent
  d’entrée à C.1–C.4 ; les signatures détaillées, interactions et maquettes
  seront validées avant l’implémentation de chaque lot.

**Suite du chantier B :** compléter les types, leurs fiches et la matrice
capacités/modèles à mesure des besoins. La clôture du socle déclaratif ne livre
pas les types encore annoncés ni leur premier modèle.

## Prochain lot

Les contrats préparatoires des renvois, formules et bibliothèques sont consignés
dans l’[inventaire B.1](b1-type-contracts.md#4-contrats-à-préparer-pour-c1c4).
L’ordre validé est C.1 (labels et références croisées), C.2 (mathématiques),
C.3 (bibliographie du projet), C.4 (bibliothèque personnelle). La prochaine
validation commune porte sur les choix détaillés et la maquette de C.1 ;
aucune nouvelle capacité n’est implémentée par cette relecture documentaire.
