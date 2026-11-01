# Découverte progressive du MCP

Décision et vérifications du **2 novembre 2026**. La relecture sans contexte
avait trouvé le MCP précis mais trop dense : découvrir les usages obligeait à
charger les contrats complets de tous les types et de toutes les opérations.

## Parcours retenu

1. Lire `typstographe://overview` : mode autonome/rattaché, présence et type du
   document, capacités de ce type et prochains appels utiles. Les permissions
   effectives et la référence documentaire restent dans l’enveloppe de réponse.
2. Utiliser les index compacts uniquement si nécessaire :
   `document_types.list` pour les usages et modèles, `commands.list` pour les
   opérations et leur prise en charge par l’adaptateur.
3. Demander `document_types.describe {"type":"article"}` pour les champs,
   valeurs initiales, collections d’en-tête et **résumés** des capacités de ce
   type. Les fiches des types prévus restent consultables, sans devenir créables.
4. Demander `capabilities.describe {"id":"insert.footnote"}` pour **une**
   signature, ses contraintes et ses exemples exécutables. Le même appel accepte
   un identifiant d’opération, notamment `text.insert` ou `proposals.submit`.
5. Lire `typstographe://guide` avant d’éditer, puis `document.inspect` et
   `document.structure` pour obtenir l’état et les cibles nécessaires. Le guide
   complet conserve les règles de styles, de lots, de concurrence et de fichiers.

Les instructions d’initialisation indiquent ce parcours et conservent les règles
essentielles : texte littéral, marques explicites, offsets UTF-16 et référence
courante. En mode rattaché, elles annoncent immédiatement les propositions
limitées au corps, l’approbation humaine et l’absence d’écriture de fichiers.

## Contrat des index et des détails

- `document_types.list` expose les types intégrés avec leur description, leur
  disponibilité, le nombre de capacités et des fiches brèves de modèles. Le
  catalogue `discovery` conserve les groupes et les profils des types à venir.
  Aucun en-tête complet, schéma ou exemple n’est chargé dans cette liste.
- `commands.list` expose identifiant, description, famille, participation aux lots
  et `execution: {direct_tool, proposal_step}`. Le catalogue rattaché décrit aussi
  ses outils `proposals.*`. Ces indicateurs décrivent le **support de l’adaptateur**,
  jamais les permissions courantes ni la validité d’une cible particulière.
- `capabilities.describe` fournit les exemples canoniques du cœur. Pour un outil
  effectivement exposé, `params_schema` correspond exactement à son schéma MCP,
  référence documentaire comprise. Une capacité sémantique n’a pas nécessairement
  un outil homonyme : ses exemples indiquent les opérations structurées à utiliser.
  Les indicateurs `execution` portent sur les opérations, pas sur ces identifiants
  sémantiques ; leur absence n’annonce donc pas une capacité indisponible.
- `typstographe://types` et `commands` reprennent les mêmes index compacts.
  `content-capabilities` liste les capacités du type actif, ou toutes les capacités
  en l’absence de document, sans recopier les schémas des opérations.
- `typstographe://models` reste un catalogue visuel bref ; `document` est une
  lecture explicite détaillée du document confirmé, et non le point d’entrée.

Les vues MCP autonome et rattachée proviennent du même module
[`discovery.rs`](../crates/mcp/src/discovery.rs). Les registres du cœur restent
la source des données : aucune deuxième liste de types ou de capacités. Le
contrat documentaire et les réponses complètes de la CLI autonome ne changent
pas ; l’allègement concerne leur présentation par le MCP.

`tools/list` conserve tous les outils nommés et leurs schémas d’entrée complets.
Seules les définitions `$defs` non référencées sont retirées, en suivant les
références transitives et récursives. Les rappels généraux répétés dans chaque
description sont regroupés dans les instructions et le guide. Aucun outil
générique d’exécution ne remplace les commandes explicites.

## Vérifications et mesures

Les tests vérifient la correspondance avec les registres, la résolution de tous
les schémas, la conservation des exemples et de la validation d’entrées valides
ou invalides, les références récursives, les droits rattachés et l’absence de
modification documentaire lors de la découverte. Une recette autonome découvre
le type et les exemples d’une note, crée un courrier et applique cette note par
un lot typé. La recette rattachée vérifie aussi les fiches prévues et la découverte
de `proposals.submit`, sans créer ni approuver une proposition.

Mesures locales du serveur **réel**, transport MCP stdio autonome, sans document
ni racines de fichiers configurées. Tailles des réponses JSON-RPC UTF-8 compactes,
y compris la duplication texte/structuré du SDK ; **ce ne sont pas des comptes
de tokens**. Le nombre d’outils reste inchangé : **74**.

| Réponse | Avant (octets) | Après (octets) | Réduction |
| --- | ---: | ---: | ---: |
| Initialisation | 1 955 | 764 | 60,9 % |
| `tools/list` | 456 310 | 148 880 | 67,4 % |
| `document_types.list` | 422 562 | 12 422 | 97,1 % |
| `commands.list` | 868 474 | 39 224 | 95,5 % |

L’aperçu initial représente 1 477 octets ; les détails demandés pour Article,
23 348 octets, et pour la note de bas de page, 3 704 octets. Les résultats sont
conservés dans [`results.json`](../experiments/mcp-discovery/results.json).
Ces mesures sont ponctuelles et concernent le mode autonome ; les deux modes
partagent les mêmes générateurs, mais leurs schémas et permissions diffèrent.
Les index augmenteront avec les capacités. `tools/list` reste plus volumineux
qu’un index, puisqu’il doit exposer les paramètres réellement acceptés.

Il ne s’agit pas d’un nouvel essai avec un LLM externe : les vérifications de ce
lot utilisent les tests Rust, le SDK et le serveur MCP réel. Une nouvelle revue
sans contexte pourra évaluer l’intelligibilité du parcours, indépendamment de
la réduction de volume.
