# B.1 — Structures réutilisables et types déclaratifs

Inventaire du 3 novembre 2026, avec orientations validées. Le premier
[contrat typé, chargeur YAML et raccordement des types actifs](type-definitions.md)
sont implémentés. L’inventaire ci-dessous conserve les constats préparatoires ;
les descripteurs manuels sont désormais remplacés par les déclarations intégrées.
La structure embarquée [`authorship`](../crates/core/structures/authorship.yaml)
regroupe désormais auteurs, affiliations, relations, vues et liaisons Typst.
L’Article la sélectionne avec `structures: [authorship]` ; le
[contrat courant](type-definitions.md#structures-den-tête-réutilisables) décrit
son développement et les règles d’ordre, sans personnalisation de son contenu.

## Décisions déjà retenues

- YAML pour rédiger les types, Serde pour charger un contrat Rust typé,
  JSON/JSON Schema pour les outils et la description structurelle.
- Un répertoire par type, avec un fichier principal `type.yaml` ; modèles en
  Typst séparés, traductions Fluent et documentation dans des fichiers distincts
  lorsque cela est utile. Le détail de l’arborescence reste à éprouver.
- Un type compose des structures d’en-tête et des capacités implémentées. Il ne
  crée pas de nouveau comportement d’édition par du code embarqué.
- Les modèles d’un type présentent les mêmes contenus et capacités. Ils
  déclarent les régimes libre, restreint ou imposé des options de présentation,
  sans réécrire les choix conservés par l’auteur.
- Préparer les contrats de C.1 (renvois), C.2 (formules), C.3 (bibliographie du
  projet), puis C.4 (bibliothèque personnelle) avant leurs implémentations,
  dans cet ordre. Aucune de ces capacités futures n’est rendue exécutable par
  sa seule mention dans un type.

## 1. Inventaire du code actuel

| Brique | État vérifié | Travail de B.1 |
| --- | --- | --- |
| Identité et disponibilité du type | `DocumentType` est une énumération Rust ; création conditionnée à un modèle enregistré. | Définir identité, description, groupes et lien vers les modèles sans promettre de type installable. |
| Texte et date | Courrier et Compte-rendu : structures Rust, `TextField`, `FieldKind`, sections et obligations à l’export. Les dates possèdent désormais un genre structuré commun (voir le contrat courant). | Formaliser genres, absence, défauts, contraintes et liaison au paramètre Typst ; traiter le contrat de date séparément de son formatage. |
| Collections ordonnées | Article : auteurs, affiliations et ensembles multilingues ; schéma descriptif construit en JSON dans Rust. | Remplacer les descriptions dispersées par un contrat typé qui alimente schémas et interfaces. |
| Identités et relations | Identifiants uniques par collection ; auteurs liés aux affiliations par identifiants ; ordre conservé séparément dans Yrs. | Décrire ces relations et leurs contraintes sans exposer les détails du stockage partagé. |
| Texte riche | Profils frontend `document`, `rich-text`, `inline-text` ; données riches validées côté Rust. | Référencer les profils communs ; ne pas déclarer une liste d’extensions par champ. Vérifier l’accord des profils et validations entre adaptateurs. |
| Présentation de l’en-tête | Sections compactes et cartes avec modales communes ; Titres et Résumés éditent deux vues des mêmes enregistrements linguistiques. | Séparer le stockage des valeurs, les vues de champs et les composants d’interaction. |
| Ressources et profil | Signature du Courrier, assets du projet et valeurs par défaut issues des préférences. | Exposer des références de ressources et l’initialisation depuis le profil sans transformer les préférences privées en données partagées. |
| Options | `DocumentOptions`, options Article et politiques `ModelPresentation` partielles. | Décrire source, genre et choix conservé ; le manifeste du modèle détermine la valeur effective. |
| Capacités | Catalogue commun dans `content/catalogue.rs` ; filtrage actuel par type avec cas particuliers Courrier/Article. | Déclarer les capacités autorisées par type en référençant le registre ; maintenir distinctes disponibilité du type, contexte et permissions de l’adaptateur. |
| Bibliographie | Plusieurs fichiers originaux, analysés par Hayagriva ; citations par `file_id` et clé. | Préparer une structure métier pour C.3 ; ne pas figer ce stockage en collection générique de fichiers. |
| Modèle et sérialisation | Composition en Typst dérivé ; champs et structures transmis au modèle ; deux modèles fournis. | Formaliser les liaisons et vérifier les signatures sans transférer la mise en page dans YAML. |

Sources principales :
[types](../crates/core/src/document_types/mod.rs),
[Courrier](../crates/core/src/document_types/courrier.rs),
[Article](../crates/core/src/document_types/article.rs),
[collections du moteur](../crates/core/src/content/shared/records.rs),
[collections de l’interface](../app/src/metadata-collections.ts),
[commandes de retrait](../app/src/metadata-record-commands.ts),
[profils riches](../app/src/rich-zone.ts),
[bibliographie](../crates/core/src/bibliography.rs).

### Garanties déjà présentes à préserver

- `record.add`, `record.move`, `record.remove` et `metadata.set` travaillent sur
  les cibles structurées communes. Les identifiants sont distincts des libellés.
- Supprimer une affiliation référencée est refusé par la validation finale du
  moteur. Le retrait explicite de ses associations et de l’affiliation peut
  être réalisé dans un seul lot atomique et annulable ; il n’y a pas de cascade
  silencieuse. L’interface sait préparer ce lot à partir des relations décrites.
- Un auteur peut n’avoir aucune affiliation ou en avoir plusieurs. Son nom
  complet reste du texte libre ; une affiliation est son texte officiel libre.
- Un courriel ne déduit pas le statut de correspondant. Plusieurs auteurs
  correspondants ne sont pas interdits par la validation actuelle.
- Auteurs et affiliations sont limités à 100 enregistrements chacun ; les
  identifiants doivent être non vides, uniques et sans caractères de contrôle.
  Les limites actuelles de longueur des chaînes Rust utilisent des octets UTF-8 :
  ne pas les traduire par erreur en `maxLength` JSON Schema, qui compte les
  caractères Unicode.
- Chaque langue ne possède qu’un ensemble localisé. Titres et titres courts
  restent en ligne ; les résumés acceptent des paragraphes.
- La préparation d’un formulaire est locale et récupérable. La publication dans
  le document se fait à validation, dans l’historique commun.

## 2. Frontière proposée

Le vocabulaire déclaratif compose trois familles de briques :

1. **Valeurs et collections génériques** : texte, booléen, choix, date, liste de
   mots-clés, collection ordonnée d’enregistrements et références typées vers une
   collection. Les validations courantes appartiennent à ces briques.
2. **Structures éditoriales réutilisables** : ensembles multilingues, zones
   riches à profils et références de ressources. Elles réutilisent les mêmes
   commandes et composants ; un type en décrit les champs et les vues.
3. **Structures métier enregistrées** : bibliothèque bibliographique, formule,
   cible de renvoi et autres capacités nécessitant leur logique propre. Le type
   active une structure implémentée et configure ses paramètres ; il ne décrit
   pas un parseur BibLaTeX, une grammaire mathématique ou un algorithme de fusion.

Les auteurs et affiliations doivent servir de preuve pour les briques génériques,
sans imposer un composant Rust « Article » par nouveau type. Une contrainte qui
dépasse le vocabulaire commun exige une extension explicite et testée du moteur,
réutilisable ensuite. Pas de scripts, d’expressions exécutables ni de fonctions
de validation écrites dans YAML.

La présentation déclare des références à des composants communs : formulaire
compact, collection de cartes, édition en modale, gestionnaire de notices. Elle
ne contient ni CSS, ni dimensions en pixels, ni gestionnaires de touches. Le
modèle Typst ne fournit pas l’interface de l’éditeur.

## 3. Premier exemple auteurs/affiliations

Le [fragment YAML](proposals/b1/article-authorship.yaml) est désormais une fixture
du contrat typé et de son chargeur. Il ne constitue pas un type Article complet
ni une définition enregistrée par l’application. Il omet les autres
onglets, les options et le catalogue de capacités pour isoler la relation étudiée.

L’exemple distingue :

- la définition des collections et de leurs champs ;
- les liaisons vers les paramètres du modèle Typst ;
- les vues et leur ordre, sans duplication des valeurs ;
- les défauts appliqués à la création d’un enregistrement ;
- les obligations à l’export, distinctes de la validité d’un brouillon.

La politique `on-target-remove: restrict` proposée signifie : refuser une
référence pendante à la fin du lot. Elle permet un lot explicite qui retire les
liens puis la cible ; elle n’introduit pas une commande différente de celles qui
existent déjà. Réordonner les affiliations ne change aucun lien des auteurs.

### Deux schémas à ne pas confondre

- Le **schéma du manifeste** décrit les déclarations permises dans `type.yaml`.
  Proposition : le produire avec Schemars à partir du contrat Rust lu par Serde,
  plutôt que maintenir manuellement deux descriptions.
- Le **schéma des valeurs documentaires** décrit les enregistrements permis par
  un type chargé. Il est dérivé de sa définition, pour documentation et contrôles
  structurels des adaptateurs. Les liens entre identifiants, la validité finale
  d’un lot et les obligations d’export restent vérifiés dans le moteur.

Un `$ref` de JSON Schema ne vérifie pas que l’identifiant d’une affiliation
existe dans le document. De même, ni Serde ni JSON Schema n’implémentent les
opérations de suppression ou la conservation des brouillons.

## 4. Contrats à préparer pour C.1–C.4

| Objet | Données et responsabilité communes | Détails à décider dans son lot |
| --- | --- | --- |
| Cible et renvoi | Identité de cible stable, référence structurée et liaison vers un label Typst dérivé ; numéro et libellé composés par Typst/modèle. | Portée des labels lisibles, copie d’objets, suppression, formes des renvois, présentation du sélecteur et des badges. |
| Formule | Source, langage Typst/LaTeX, présentation en ligne/en bloc et description accessible ; blocs référençables. | Code accepté, diagnostics, aperçu dans l’éditeur et paramètres des modèles ; éditeur visuel ultérieur. |
| Bibliothèque du projet | Notices Hayagriva, identités et clés stables, citations liées aux notices, provenance d’import et fichier autonome unique. | Genre/champs des formulaires, rapports de conversion et collisions, schéma d’édition partagée, conservation éventuelle des sources importées. |
| Bibliothèque personnelle | Notices réutilisables ; copie dans le projet avant citation ; échange explicite de corrections. | Format et stockage, identité entre bibliothèques et stratégie de conflits ; pas de réécriture silencieuse des projets. |

Pour C.3, la grande modale réutilise la liste filtrable, le formulaire et la
conservation des brouillons communs : notices et recherche fuzzy titre/auteurs à
gauche, édition à droite. « Créer et citer » utilise le même formulaire et un lot
annulable. C.4 réutilise ce gestionnaire avec une sélection explicite de la
bibliothèque ; il ne devient pas nécessaire à l’ouverture ou à l’export.

### Référence citekeep

La lecture du dépôt local citekeep inspire la séparation bibliothèque/projet,
la recherche projet avant bibliothèque, la copie d’une notice avant son usage,
les clés locales stables et la résolution explicite des conflits. Son principe
de bibliothèque centrale faisant autorité ne doit pas provoquer la mise à jour
automatique d’un projet Typstographe : chaque projet reste un état autonome.

Son code conserve et modifie le BibTeX original en Python ; il n’est pas
directement substituable à une bibliothèque Hayagriva Rust. Réutiliser ses
principes et examiner ses cas de test ne décide pas de son intégration comme
dépendance. Aucun code n’en est copié dans ce lot.

Références de conception : [invariants](https://github.com/klutchnikoff/citekeep/blob/main/docs/explanation/invariants.md),
[identités](https://github.com/klutchnikoff/citekeep/blob/main/docs/explanation/identity.md),
[recherche et matérialisation](https://github.com/klutchnikoff/citekeep/blob/main/src/citekeep/catalog.py).

## 5. Orientations validées et suite

1. **Granularité du contrat** : commencer par les briques ci-dessus et la
   composition auteurs/affiliations ; n’ajouter une structure métier dédiée que
   lorsqu’un comportement ne peut pas être exprimé par ces briques.
2. **Validation** : distinguer manifeste invalide, opération/document invalide
   et document incomplet à l’export. Un champ requis à l’export ne bloque pas
   l’enregistrement d’un brouillon. Par défaut, une relation utilisée interdit
   sa suppression isolée, avec réparation explicite dans un lot atomique.
3. **Autorité et migration** : un contrat Rust typé produit le schéma du manifeste ;
   une définition de type chargée produit les descripteurs de valeurs et de vues
   pour tous les adaptateurs. Commencer par les types intégrés, puis migrer
   Courrier et Article sans registre YAML concurrent de la logique courante.

Le [premier vocabulaire, ses schémas et le chargeur](type-definitions.md) sont
implémentés avec yaml_serde. La tranche verticale du chargement aux commandes,
à l’interface et à la compilation Typst est raccordée pour les types intégrés.
Les [régimes de modèles](model-options.md) et les [dates structurées](structured-dates.md)
sont raccordés ; les [références communes de ressources](resource-references.md)
migrent maintenant la signature. Les fichiers bibliographiques conservent leur
contrat métier jusqu’à C.3.
