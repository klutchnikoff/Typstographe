# LaPreprint comme deuxième modèle Article

LaPreprint valide le test d’un deuxième modèle pour le contrat Article actuel.
L’adaptation a été réalisée en Typst et qualifiée par la CLI avec les structures
d’en-tête et les capacités existantes. Le [modèle LaPreprint](../crates/core/templates/article-lapreprint.typ)
et son [manifeste](../crates/core/templates/article-lapreprint.model.yaml)
sont raccordés au catalogue Article.

L’[audit de fidélité](article-model-fidelity.md) détaille les règles Typst
amont, la comparaison pixel à pixel et les extensions documentaires encore à décider.

## Sources et adaptation

- Le [dépôt Typst historique à `c908cd0`](https://github.com/LaPreprint/typst/blob/c908cd05da8e13eb8add652a613d00add73d1f58/lapreprint.typ)
  échoue avec Typst 0.15.1 sur l’ancien appel `locate(fn)`.
- La [variante MyST à `b7496d3`](https://github.com/myst-templates/lapreprint-typst/blob/b7496d369fa6b143621afbebed0e87406f276bd2/lapreprint.typ)
  se compile directement en Typst avec son fichier auxiliaire `frontmatter.typ`
  et une date fournie. La branche `date: none` accède au premier élément d’une
  liste absente. Par défaut, le modèle choisit la date du jour et affiche
  « Open Access ». L’essai accepte une date absente et désactive ce badge.
  La [licence MIT](https://github.com/myst-templates/lapreprint-typst/blob/b7496d369fa6b143621afbebed0e87406f276bd2/LICENSE)
  permet de reprendre la mise en page en conservant la notice de Rowan Cockett.

Le modèle fournit la signature `article(...)` et reçoit le dictionnaire `publication` du type Article. Il réutilise
`authorship`, `abstracts` et `references` pour les auteurs, les affiliations
officielles en texte libre, la correspondance, l’ORCID, les résumés et
mots-clés multilingues et la bibliographie Hayagriva. Le titre de la langue
active et son titre court alimentent le PDF et l’en-tête courant. Le manifeste
d’essai reprend les options existantes, dont le format, l’orientation, la
langue, les puces, le style CSL et le sommaire optionnel. La mise en page
adaptée tient dans un fichier Typst et utilise Libertinus Serif, déjà embarquée.
Elle fonctionne sans la chaîne MyST. Les dates localisées passent par le wrapper Datify déjà embarqué.

## Correspondance avec le contrat Article

L’essai part du `template(...)` Typst de LaPreprint. Il en conserve la mise en
page, les en-têtes et pieds de page, la hiérarchie des titres et le style des
équations et des listes. Une fonction `article(...)` lui transmet les données
du projet et le `body` généré par Typstographe. Pour les auteurs, les résumés
et la bibliographie, elle appelle les fonctions communes du projet et place
le résultat dans la composition LaPreprint.

| Capacités du corps | Traitement dans l’essai |
| --- | --- |
| Paragraphe et titres de niveaux 1 à 3 | `par` et `heading` natifs. Espacement, style et numérotation repris de LaPreprint. |
| Gras, italique et liens | `strong`, `emph` et `link` natifs. LaPreprint applique sa couleur aux liens. |
| Listes à puces, numérotées et de descriptions | `list`, `enum` et `terms` natifs. Retraits LaPreprint pour les deux premières, puces selon la langue et rendu natif pour les descriptions. |
| Citation en bloc et note de bas de page | `quote` avec attribution et `footnote` natifs. LaPreprint les laisse au rendu Typst. |
| Images et tableaux | `figure`, `image` et `table` natifs. Légendes, texte alternatif des images et en-têtes sémantiques des tableaux issus du document. L’essai reprend la règle d’« Article de travail » qui autorise la coupure des tableaux sur plusieurs pages. |
| Citations bibliographiques et renvois internes | Fonctions communes de Typstographe. La bibliographie utilise le style CSL résolu par le contrat. La numérotation explicite des pages a été ajoutée à LaPreprint pour les renvois de page. |
| Maths en ligne et en bloc | La fonction commune produit une `math.equation` native depuis Typst ou LaTeX via MiTeX. LaPreprint conserve sa numérotation `(1)` et son espacement pour les équations en bloc. |

Les **18 capacités** déclarées par le [type Article](../crates/core/types/article/type.yaml)
sont présentes au moins une fois dans le corpus de la recette commune et
compilent avec les deux modèles. La recette couvre ces familles de contenu
avec les variantes décrites ci-dessous.

| Données et options de l’en-tête | Correspondance et adaptations |
| --- | --- |
| Titre, sous-titre, titre court | LaPreprint reçoit un jeu de titres. Typstographe sélectionne celui de la langue principale pour le titre de l’article, les métadonnées PDF et l’en-tête courant. Le bloc des résumés peut présenter les autres titres et sous-titres. Leurs titres courts restent disponibles si leur langue devient principale. |
| Résumés et mots-clés | LaPreprint accepte plusieurs résumés sous forme de blocs titrés. Typstographe associe explicitement à chaque langue un titre, un résumé et ses mots-clés, rend chaque bloc dans sa langue et utilise les mots-clés principaux dans les métadonnées PDF. LaPreprint a une liste de mots-clés globale. |
| Auteurs et affiliations | Les deux gèrent plusieurs auteurs, des affiliations et l’ORCID. La bibliothèque commune conserve les identifiants, les signatures d’affiliation en texte libre et le statut explicite d’auteur correspondant. Le parseur MyST accepte notamment courriel et ROR. Le rendu d’origine affiche les noms, les indices d’affiliation et l’ORCID. |
| Bibliographie, style CSL et sommaire | LaPreprint reçoit un chemin bibliographique et un style. Typstographe fournit la bibliographie du projet et le style choisi, puis insère le sommaire facultatif. La provenance d’import et les identités internes des notices restent gérées par le projet. |
| Langue, papier, orientation et puces | LaPreprint accepte le format papier et fixe les retraits des listes. L’essai applique aussi la langue, l’orientation et la règle de puces du contrat Article. |

Le groupe [Publication](article-contract.md#publication) renseigne le DOI,
l’accès ouvert, la revue, le genre et les dates éditoriales, ainsi que la
citation courte et le premier folio. La citation courte est explicite, ce
qui préserve les noms composés et les conventions de signature. Le logo
éditorial relève du modèle. Les blocs libres dans la marge restent à évaluer.

## Recette commune après le correctif

Le [test de régression CLI](../crates/cli/tests/scripts.rs) change le modèle
d’un article mathématique en utilisant une copie exacte d’« Article de
travail », puis sauvegarde, rouvre et exporte le projet. Avant le correctif,
la validation échouait sur l’import de `mathematics.typ` dans `contenu.typ`.
[Le cœur](../crates/core/src/content/shared/settings.rs) résout désormais les
dépendances du modèle et du corps comme lors de la compilation courante.
LaPreprint a été testé sans ajouter les imports de mathématiques, de renvois
ou de tableaux au modèle.

Les quatre parcours passent via la CLI pour les deux modèles. À chaque
aller-retour, les projets ont été sauvegardés et rouverts. Le corps structuré,
les métadonnées, les cibles de renvoi et les ressources ont été comparés.
Le corps Typst, les métadonnées JSON, la bibliographie Hayagriva et les images
sont identiques octet par octet lorsque présents. Au retour, le source
principal, le modèle, son manifeste et l’inventaire des dépendances retrouvent
également leur état initial.

| Parcours | Résultat |
| --- | --- |
| [Article bilingue](../fixtures/projects/article-working.typsto), A4 portrait, Chicago auteur-date | Trois pages dans les deux modèles. Auteurs et affiliations, deux résumés, mots-clés, sommaire, note, citation en bloc, citations et bibliographie. |
| Même article, anglais, A5 paysage, APA | Six pages dans « Article de travail » et cinq dans LaPreprint. Titre courant anglais, deux résumés, style CSL APA et lien ORCID ajouté pour l’essai. |
| [Article mathématique](../examples/cli/article-mathematics.json) | Une page par modèle. Quatre formules Typst et LaTeX balisées dans le PDF, équations `(1)` et `(2)`, renvois avec page et MiTeX embarqué. |
| [Article avec renvois](../examples/cli/article-cross-references.json) enrichi | Une page par modèle. Renvois vers les sections, le tableau et l’image, légende et texte alternatif de l’image, en-têtes des deux axes du tableau, listes et lien externe. |

Les huit exports compilent avec Typst 0.15.1, sans polices système et avec
répertoires de paquets externes vides, en demandant PDF/UA-1 et PDF/A-2b.
Poppler confirme notamment les titres hiérarchiques, la note, les quatre
formules, le texte alternatif de l’image et les portées des en-têtes du tableau.
Les pages ont été inspectées visuellement. La conformité n’a pas été vérifiée
avec veraPDF et l’ordre de lecture reste à qualifier avant livraison.

Un essai complémentaire sur l’article bilingue confirme le style IEEE, les
citations numériques et la bibliographie avec le sommaire désactivé, dans les
deux modèles. Les données exportées restent identiques.

Le titre à gauche, la hiérarchie numérotée et le titre courant donnent au
modèle une identité distincte. La marge gauche de 25 % est conservée sur
toutes les pages. LaPreprint prévoit d’y placer des informations éditoriales
sur la première page. Les notes de bas de page restent sous la colonne de
texte. Après intégration, le pied de page français affiche `1 sur 3` et
un renvoi vers une section numérotée affiche « Section 2 ».

## Manques réels et décision de périmètre

- **Contrat Article actuel.** La recette valide la possibilité de changer de
  mise en page avec toutes les familles de contenu prises en charge. Elle
  n’a révélé aucun champ d’en-tête à ajouter pour le périmètre de rédaction
  actuel. Conserver les structures et les capacités existantes pour le deuxième
  modèle. Les métadonnées éditoriales retenues sont désormais disponibles dans Publication.
- **Rédaction mathématique.** LaPreprint règle la présentation des équations.
  Le type Article couvre les formules, les équations et leurs renvois. Pour un
  véritable article de mathématiques, il manque des blocs sémantiques pour
  les énoncés (théorèmes, lemmes, définitions) et les preuves. Le type devra
  pouvoir conserver leur contenu riche et les cibles de renvoi des énoncés.
  Les modèles détermineront leur rendu et les règles de numérotation. Le
  contrat sera défini à partir d’un exemple représentatif, indépendamment des
  paquets Typst que les modèles pourront employer pour le rendu.
- **Finitions du modèle.** La pagination et les renvois de section sont
  localisés. La galerie affiche la vignette de LaPreprint. La recette CLI
  vérifie le changement de modèle et l’export sur trois documents.
