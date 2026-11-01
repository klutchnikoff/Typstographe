# Catalogue des types de documents

Décision du **1er novembre 2026**. Ce catalogue sert de guide produit et de
base à la découverte dans l’application, la CLI et le MCP.

Les fiches sont des cadrages, pas des contrats exécutables : leurs besoins
en capacités et leurs informations devront être précisés ensemble avant
l’implémentation de chaque type. **Courrier** et **Article scientifique** sont
créables ; tous les autres portent la mention **À venir**, y compris Compte
rendu, dont le contrat partiel n’a pas encore de modèle fourni.

## Groupes et fiches

| Groupe | Types |
| --- | --- |
| Correspondance et administration | [Courrier](type-profiles/courrier.md) ; [Compte rendu](type-profiles/compte-rendu.md) ; [Note](type-profiles/note.md) ; [Rapport](type-profiles/report.md) ; [Présentation](type-profiles/presentation.md) |
| Recherche et publications | [Rapport](type-profiles/report.md) ; [Article scientifique](type-profiles/article.md) ; [Mémoire et thèse](type-profiles/thesis.md) ; [Projet de recherche](type-profiles/research-project.md) ; [Poster scientifique](type-profiles/poster.md) ; [Présentation](type-profiles/presentation.md) ; [Livre](type-profiles/book.md) |
| Parcours et candidatures | [Courrier](type-profiles/courrier.md) ; [Projet de recherche](type-profiles/research-project.md) ; [CV](type-profiles/cv.md) |
| Enseignement | [Support de cours](type-profiles/course.md) ; [Exercices et évaluations](type-profiles/exercises.md) ; [Présentation](type-profiles/presentation.md) |
| Livres et communication | [Rapport](type-profiles/report.md) ; [Poster scientifique](type-profiles/poster.md) ; [Présentation](type-profiles/presentation.md) ; [Livre](type-profiles/book.md) |
| Transversal | [Document libre](type-profiles/free-document.md) |

## Conventions communes

- Les groupes sont des portes d’entrée : un même type peut apparaître dans
  plusieurs groupes, avec la même identité, les mêmes capacités et les mêmes
  modèles. « Tous les types » ne présente chaque type qu’une fois.
- Le type définit l’information et les capacités ; ses modèles sont
  interchangeables et règlent la présentation, avec des options libres,
  restreintes ou imposées.
- Une lettre de motivation est un usage du Courrier. Un rapport d’activité,
  d’étude ou de stage relève initialement du type Rapport.
- Mémoire et thèse forment un seul type pour l’instant.
- Projet de recherche couvre initialement projet doctoral et demande de
  financement, sous réserve de validation de leur contrat commun. Ce type ne
  désigne pas le conteneur de travail `.typsto`.
- Document libre reste à définir : rédaction structurée sans en-tête spécialisé,
  sans devenir un mode de mise en page arbitraire.
- Les fiches précisent usage, informations, capacités nécessaires, premier modèle
  utile et arbitrages restants. Les fichiers portent des identifiants anglais
  stables ; les identifiants historiques des types déjà intégrés restent ceux
  du contrat courant (`courrier`, `compte-rendu`, `article`).

## Découverte et disponibilité

Le registre partagé est
[`catalogue.json`](../crates/core/src/document_types/catalogue.json). Il n’ajoute
aucun faux type exécutable au schéma des commandes. La disponibilité est calculée
à partir du registre réel des modèles, sans drapeau manuel parallèle.

`document_types.list` conserve `types` pour les contrats intégrés et ajoute
`discovery`, avec les groupes et un résumé compact de chaque fiche. Les fiches
complètes sont disponibles à la demande : `document_types.describe`
accepte aussi l’identifiant d’un type prévu ; dans ce cas, il renvoie sa fiche,
`can_create: false` et aucune capacité exécutable. Les listes de besoins sont
explicitement séparées des capacités réellement disponibles.

## Parcours de création

La fenêtre Nouveau document permet de parcourir les tuiles par groupe, puis de
choisir un modèle du type actif. Les types à venir sont grisés mais consultables ;
leur sélection désactive Créer. Le même type n’est jamais dupliqué dans les données.
La description explique les possibilités actuelles pour les types disponibles
et l’usage prévu pour les autres.

Les **vignettes des modèles**, produites par Typst depuis un contenu représentatif
commun à un même type, restent à réaliser. La sélection actuelle conserve les noms
des modèles disponibles : aucun faux aperçu ni modèle factice n’est ajouté.

## Suite du chantier

Le catalogue annonce la direction, pas un ordre intégral de livraison. Avant
chaque nouveau type : valider ses métadonnées, ses capacités, ses signatures Typst,
son en-tête et un premier modèle utilisable. Le compte rendu offre un prochain
cas administratif ; CV et Projet de recherche demanderont notamment des
collections et sections spécifiques. Les nouveaux besoins sont arbitrés avec
le chantier C, puis présentés par un modèle du chantier D.
