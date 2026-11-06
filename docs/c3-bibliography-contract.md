# C.3 — Contrat de la bibliothèque bibliographique

Décisions validées le **6 novembre 2026**, avant maquette et implémentation.
Ce document définit le contrat cible ; le [contrat actuel](article-bibliography.md)
reste exécutable jusqu'à son remplacement. Le [premier lot de crate](c3-bibliography-foundation.md)
est implémenté ; nouvelles commandes, migration documentaire et gestionnaire
restent à raccorder. Les identifiants techniques sont anglais.

## Frontière de la crate

Créer `crates/bibliography`, package **`typstographe-bibliography`**, commun à la
bibliothèque du projet (C.3) et à la future bibliothèque personnelle (C.4).
Il dépend du modèle natif Hayagriva, actuellement épinglé en **0.10.1**, plutôt
que de reconstruire un format bibliographique réduit.

| Responsabilité | Propriétaire |
| --- | --- |
| Notices, genres, identités, clés et provenance | Crate bibliographique |
| Lecture BibLaTeX/Hayagriva, projection Hayagriva, diagnostics de conversion | Crate bibliographique |
| Descripteurs des champs, complétude, recherche fuzzy titre/auteurs | Crate bibliographique |
| Indices d'identité, rapprochement, plans d'import/enrichissement et décisions | Crate bibliographique |
| Citations du document, suppression d'une notice citée, commandes et lots atomiques | `typstographe-core`, utilisant la crate |
| État partagé, révisions documentaires, annulation, propositions MCP et snapshots | Cœur et contrats structurés existants |
| CAS, récupération, sauvegarde et export autonome du `.typsto` | Stockage documentaire existant |
| Formulaires, focus, clavier et traduction des diagnostics | Adaptateurs et Fluent |
| Stockage global personnel, ouverture de fichiers, réseau | Adaptateurs de stockage ; C.4 pour le stockage personnel |

La crate fonctionne sur des valeurs et renvoie des résultats déterministes. Elle
ne connaît ni Tauri, ni le DOM, ni MCP, ni Fluent, ni les chemins du profil
utilisateur. Elle n'écrit pas de fichier et ne publie pas elle-même une édition.
Elle ne dépend pas de `typstographe-core` : le sens de dépendance reste
`core → bibliography → hayagriva`. Les adaptateurs passent par le moteur commun
pour toute mutation du document, sans appliquer un plan directement dans l'UI.

C.3 fournit le moteur commun une seule fois. C.4 ajoute un stockage personnel et
ses échanges explicites ; il ne réimplémente ni les notices ni le rapprochement.
Le moteur Python et le format de stockage BibTeX de Citekeep ne sont pas retenus.

## Modèle logique et source de vérité

- **`RecordId`** : identité opaque stable de la notice dans une bibliothèque,
  indépendante du titre, des auteurs, de sa clé et de sa position dans la liste.
- **Notice** : `RecordId`, entrée native Hayagriva complète, genre de formulaire
  et liens de provenance. La clé lisible est celle de l'entrée native ; ne pas
  maintenir deux champs de clé modifiables indépendamment.
- **`CitationKey`** : clé lisible unique dans la bibliothèque du projet. Proposée
  à la création, modifiable explicitement ; changer titre/date/auteurs ne la
  renomme pas automatiquement. Sa génération n'est jamais une preuve d'identité.
- **Provenance** : identité/digest de la source importée, clé originale, format et
  diagnostics ; ultérieurement identité de bibliothèque personnelle, identité
  de notice et révision copiée. Une clé seule n'est pas un lien de provenance.
- **Bibliothèque** : ensemble ordonné de notices avec index dérivés et empreinte
  de contenu. Les index de recherche et de rapprochement sont reconstructibles.

Les citations structurées ciblent `RecordId`, et non l'ancien couple
`file_id`/`key`. Le générateur résout la clé effective pour Typst. Modifier une
clé conserve donc les citations. Une copie personnelle → projet reçoit une
identité locale et garde son lien d'origine ; elle reste autonome hors ligne.

L'état confirmé structuré est l'autorité documentaire. Il contient toutes les
données nécessaires aux notices et aux liens. À la sauvegarde et à l'export,
un **unique fichier Hayagriva actif** est matérialisé pour Typst, à partir de cet
état, avec vérification de cohérence au chargement. Les métadonnées applicatives
(identités, genre, provenance) ne deviennent pas de faux champs Hayagriva.
Le chemin physique et la révision du format CAS seront fixés à l'implémentation ;
ce lot ne change pas le format courant.

Les fichiers importés sont conservés **intacts, en lecture seule, comme
provenance**, jamais comme deuxième bibliothèque active. L'export conserve cette
provenance à part ; seul le Hayagriva consolidé est utilisé par le modèle.
Leur rétention suit les références du document, des versions et de l'historique
d'annulation. Aucun stockage personnel externe n'est requis pour compiler.

Conserver tous les champs, rôles, parents et chaînes formatées pris en charge par
Hayagriva, même s'ils n'ont pas de contrôle dans le premier formulaire. Modifier
un champ exposé ne reconstruit pas la notice à partir des seuls champs visibles.
Les champs non convertibles restent dans la source d'import avec un diagnostic
de perte ; leur conservation brute ne signifie pas qu'ils seront composés.

## Validité, complétude et descripteurs

Hayagriva ne définit pas de liste de champs bibliographiques obligatoires par
genre. Dans le parseur **0.10.1**, une notice racine exige une clé unique et un
`type` reconnu explicite ; `title`, `author`, `date`, etc. sont facultatifs.
Une valeur renseignée doit respecter le type du champ : par exemple, un objet
Personne exige `name`. Un parent peut recevoir le type implicite prévu pour son
enfant. La documentation du format et le parseur ne concordent pas sur le défaut
de type racine : tester le parseur épinglé, sans présumer un repli en `misc`.

Séparer trois niveaux de diagnostics :

1. **Erreur de structure** : YAML/BibLaTeX illisible, identités ou clés dupliquées,
   valeur de champ invalide ; interdit la publication de la partie concernée.
2. **Avertissement de complétude** : titre, date, créateurs, revue, éditeur ou
   localisation manquants suivant le genre ; la notice peut être conservée et
   citée. Une collectivité ou une œuvre anonyme ne doit pas recevoir un faux auteur.
3. **Information de conversion** : transformation, champ non représenté ou
   ambiguïté de genre ; présenté avant confirmation de l'import.

Le résultat contient un code anglais stable, la notice/source et le chemin de
champ concernés, des arguments structurés, la gravité et les indices utiles.
Fluent produit les textes d'interface. Ne pas exposer seulement une erreur de
parseur non contextualisée ; la conserver comme détail technique si nécessaire.

Un descripteur de genre expose les chemins natifs des champs, leur genre de
valeur, leur cardinalité, les groupes d'édition et les recommandations. Une
présentation localisée ne modifie ni la donnée ni les règles. Les relations
bibliographiques à un parent ne réutilisent pas les affiliations des auteurs
de l'article : ce sont des structures différentes.

## Genres de formulaire et correspondances Hayagriva

Le **genre de formulaire** facilite la saisie ; il n'est pas une nouvelle
taxonomie à imposer à Typst. Un genre peut correspondre à plusieurs structures
natives. Les entrées importées gardent leur structure compatible ; aucun passage
par un formulaire ne doit réécrire arbitrairement leurs parents.

| Genre public | Création Hayagriva | Champs mis en avant, en plus du titre/créateurs/date |
| --- | --- | --- |
| `journal_article` — Article de revue | `article`, parent `periodical` | Titre de revue, volume, numéro, pages, DOI |
| `book` — Livre | `book` | Éditeur, lieu, édition, ISBN |
| `book_chapter` — Chapitre/contribution | `chapter` + parent `book` ; conserver aussi `anthos` + `anthology` importé | Titre du livre, responsables éditoriaux, éditeur, pages |
| `conference_paper` — Communication publiée | `article`, parent `proceedings` | Titre des actes, conférence si disponible, pages, DOI |
| `report` — Rapport | `report` | Organisme, numéro, URL/DOI |
| `thesis` — Mémoire/thèse | `thesis` | Établissement, genre de diplôme, URL/DOI |
| `web_resource` — Ressource web | `web` ; conserver les composites importés, par exemple `article` + `blog` | URL, date de consultation, site/organisme |
| `preprint` — Prépublication | `article` + parent `repository` pour un dépôt ; `manuscript` sans dépôt | Dépôt, identifiant arXiv/autre, URL, version si disponible |
| `software` — Logiciel | `repository` | Créateurs/organisme, édition/version, URL, DOI de version si disponible |
| `other` — Autre genre natif | Type et parents natifs conservés | Champs communs et données non exposées préservées |

Cette table fixe les correspondances visées. Les champs « diplôme », « version »,
« conférence » sont des intentions de formulaire : vérifier leur représentation
native exacte avant de fixer les contrôles et leurs chemins. Un changement de
genre qui déplacerait/perdrait des champs exige une préparation et un accord,
sans effacement implicite.

Deux points exigent une recette native avant livraison :

- Une prépublication déposée et un article publié ne sont pas nécessairement
  deux doublons interchangeables. Conserver l'état de publication et les indices
  de version ; soumettre leur rapprochement à décision explicite.
- Hayagriva 0.10.1 rend `repository` comme CSL `software`, mais son importeur
  BibLaTeX transforme `@software` en `misc` (`@dataset` devient `repository`).
  Ne pas inférer le genre uniquement depuis le type natif : conserver le genre
  d'origine et préparer une correspondance explicite avec diagnostic. Vérifier
  la composition Typst réelle, pas seulement la valeur de l'énumération.

Un genre sans formulaire spécialisé reste importable si le parseur le permet.
Le premier gestionnaire ne promet pas l'édition exhaustive des types Hayagriva.

## Opérations de la crate et publication documentaire

Les noms ci-dessous décrivent les responsabilités de l'API à implémenter ; ils
ne constituent pas encore de nouvelles commandes publiques GUI/CLI/MCP.

| Famille | Entrées et résultat attendus |
| --- | --- |
| Lire/décrire | Bibliothèque, identités, descripteurs des genres et diagnostics |
| Chercher | Bibliothèque + requête → notices classées, titres/auteurs, indices ; Unicode, sans modifier les notices |
| Préparer un import | Octets + format + provenance → notices candidates, rapport de conversion ; aucune écriture |
| Préparer un rapprochement | Bibliothèque + candidats → indices, contradictions, actions proposées et décisions manquantes |
| Résoudre | Plan + décisions ciblées → plan entièrement résolu ou diagnostics précis |
| Appliquer en mémoire | Bibliothèque + plan résolu + empreinte attendue → nouvelle bibliothèque et changements ; tout ou rien |
| Modifier une notice | Identité + base attendue + modifications de champs → résultat préservant les données non touchées |
| Projeter | Bibliothèque → Hayagriva consolidé déterministe, rapport des incohérences éventuelles |

L'empreinte garde le contenu bibliographique et les décisions ; le cœur ajoute
la garde de révision documentaire. Un plan périmé est refusé, jamais recalculé
silencieusement sous les décisions de l'utilisateur. Les identités attribuées aux
candidats sont stables pendant sa préparation ; l'ordre d'entrée ne doit pas
changer les preuves ou les cibles des décisions.

Le cœur conserve les garanties existantes :

- Formulaires privés récupérables. **Valider** publie une édition annulable,
  sans sauvegarde immédiate du fichier. Changer de notice ou fermer un brouillon
  modifié propose valider, abandonner ou continuer ; une modification concurrente
  de la même notice est signalée sans perdre la saisie.
- Refuser la suppression d'une notice encore citée ; proposer de retrouver ses
  citations. Les citations dans les zones riches supportées comptent également.
- **Créer et citer** ajoute la notice et le badge dans un seul lot atomique et
  annulable. Annuler/refuser un formulaire ne laisse pas de notice orpheline.
- GUI, CLI et MCP utilisent les mêmes valeurs, descripteurs et validations.
  Les propositions d'agent gardent la validation humaine et les gardes existantes.
- Les options de style restent dans l'onglet Bibliographie et les modèles,
  séparées du contenu des notices. La bibliographie est composée par Typst.

## Rapprochement inspiré de Citekeep

Référence lue : Citekeep, commit
`935efc9b207e318805e1eaa270b01a5db3324fd2`, notamment
`duplicates.py`, `library.py`, `sync.py`, `catalog.py` et leurs tests.
Le [corpus de contrat](../fixtures/bibliography/README.md) précise les reprises,
adaptations et extensions. Aucun appel Python ne sera nécessaire à l'application.

1. Normaliser des **indices dérivés**, sans modifier les valeurs : DOI, arXiv,
   premier auteur/année/début du titre, premier auteur/titre complet. Ne jamais
   utiliser la clé comme preuve d'identité. La recherche fuzzy aide à chercher ;
   son score ne suffit pas à autoriser une fusion.
2. Construire des candidats, puis rechercher les contradictions et vérifier le
   groupe entier. Une chaîne A≈B≈C ne prouve pas A=C. Plusieurs indices forts
   contradictoires ou plusieurs destinataires possibles nécessitent une décision.
3. Classer : `unchanged`, `enrich`, `new`, `conflict`. Enrichir comble seulement
   les lacunes ; remplacer une valeur connue est une correction distincte à
   autoriser explicitement. Ne pas copier les liens propres à une autre bibliothèque.
4. Préparer des décisions `same`, `distinct`, `skip`, avec notice cible explicite
   si nécessaire. Une collision de clé demande un choix de nom pour l'entrant,
   sans renommer l'existant cité ; elle ne prouve pas un doublon.
5. Ne publier le lot choisi que lorsque ses conflits sont résolus ou ses candidats
   explicitement écartés. Aucun sous-ensemble implicite n'est écrit en cours
   d'import. Répéter le même import résolu n'ajoute ni doublons ni enrichissements.

Les prépublications/publiés, éditions de livres et versions de logiciels doivent
rester distinguables. Un arXiv commun rapproche des notices, mais ne fusionne
pas automatiquement deux états de publication ; un suffixe `vN` peut être ignoré
pour chercher des candidats, jamais effacé de la provenance. Des versions
logicielles distinctes restent des notices distinctes, sauf décision explicite.

Cette prudence est intentionnelle : dans Citekeep, les règles de candidature,
réfutation et cohérence ne sont pas identiques, notamment pour arXiv et plusieurs
DOI. Porter les garanties testées, pas transformer un raccourci documentaire en
règle de fusion automatique.

## Séquence et critères avant livraison

1. **Présent lot documentaire** : contrat, correspondances, corpus et limites
   explicites. Pas de changement du format ou de la bibliothèque active.
2. **Maquette à valider ensemble** : grande modale, liste/recherche/+ à gauche,
   édition par genre à droite, complétude, import et arbitrages, brouillons et
   parcours clavier ; accès commun depuis l'en-tête et l'insertion de citation.
3. **Implémentation de la crate** : convertir le corpus en tests exécutables,
   qualifier les mappings sur le parseur et le rendu Typst, puis raccorder le cœur.
4. **Migration sans compatibilité artificielle** : nouvelles cibles par identité,
   bibliothèque unique, originaux conservés, exemples versionnés régénérés ;
   fichiers locaux préservés. Recette commune GUI/CLI/MCP avant clôture C.3.

Les tests distingueront le moteur pur (import, identité, plans, aller-retour) des
garanties du cœur (citations, annulation, CAS, récupération et concurrence) et
des parcours d'interface. Un corpus écrit n'est pas encore un test réussi.
C.4 reprend le même moteur ; stockage personnel, échanges à deux révisions,
recherche en ligne et gestion de PDF restent hors de C.3.

## Sources de la qualification

- Hayagriva 0.10.1 : [format](https://github.com/typst/hayagriva/blob/v0.10.1/docs/file-format.md),
  [parseur et valeurs facultatives](https://github.com/typst/hayagriva/blob/v0.10.1/src/lib.rs),
  [conversion BibLaTeX](https://github.com/typst/hayagriva/blob/v0.10.1/src/interop.rs),
  [taxonomie CSL](https://github.com/typst/hayagriva/blob/v0.10.1/src/csl/taxonomy.rs).
- Citekeep : règles et scénarios relus dans le dépôt local, référence et licence
  précisées dans le corpus ; le code courant et ses tests priment sur les
  formulations générales de sa documentation.
