# Article — audit de fidélité de LaPreprint et IEEE pour MyST

Les deux adaptations en cours ont passé la recette de changement de modèle.
Cet audit relève les écarts entre leur code et le code amont. La fidélité des
rendus reste à qualifier avant de retenir les adaptations dans le catalogue.

## Sources de référence

- [LaPreprint Typst, révision `c908cd0`](https://github.com/LaPreprint/typst/blob/c908cd05da8e13eb8add652a613d00add73d1f58/lapreprint.typ)
  et [son adaptation MyST, révision `b7496d3`](https://github.com/myst-templates/lapreprint-typst/blob/b7496d369fa6b143621afbebed0e87406f276bd2/lapreprint.typ).
  Les deux partagent la composition générale. Le source historique fixe Noto
  Sans par défaut, tandis que le port MyST laisse Typst choisir la police quand
  `font-face` est absent. L’adaptation de Typstographe cite le port MyST et
  utilise explicitement Libertinus Serif. La révision MyST est le point de
  départ proposé pour la reprise. Le choix de la police de référence doit
  suivre le rendu de la révision retenue.
- [IEEE pour MyST, révision `e40d103`, `template.typ`](https://github.com/myst-templates/ieee-typst-template/blob/e40d10316580912aed84348170b479133acc5622/template.typ)
  et [`main.typ`](https://github.com/myst-templates/ieee-typst-template/blob/e40d10316580912aed84348170b479133acc5622/main.typ).
  Le premier est la composition de référence. Le second projette les données
  MyST et ne transmet notamment que la première affiliation de chaque auteur.

La référence visuelle doit être rejouée à partir de ces sources et d’entrées
connues. Le LaPreprint historique et le port IEEE utilisent `locate(fn)`, qui
échoue sous Typst 0.15.1. Le port LaPreprint MyST emploie déjà `context` et son
chemin `date: none` doit être corrigé pour tester les brouillons. Pour IEEE,
Typst 0.15.1 indique aussi que l’ancienne règle `show par: set block(spacing:
…)` est devenue inopérante et recommande `set par(spacing: …)`. Le
[manuel de Typst](https://typst.app/docs/reference/model/par/) distingue
`leading`, l’espace entre les lignes, de `spacing`, l’espace entre
paragraphes. Pour une ancienne règle de composition, la référence historique
doit être mesurée avec un compilateur qui l’applique encore, puis comparée
au port minimal qui tourne sous la version embarquée. Sur un essai minimal
sous 0.15.1, deux paragraphes à 10 pt occupent 38,24 pt avec les réglages
par défaut comme avec l’ancienne règle ignorée, et 32,74 pt avec
`set par(spacing: 0.65em)`. Cette mesure compare l’effet des règles sur
0.15.1 ; elle ne mesure pas le rendu historique.

## Raccordement au contrat Article

L’entrée publique reste [`article(..., body)`](article-contract.md). Le
[générateur](../crates/core/src/document_types/runtime/source.rs) transmet les
collections et les options par `#show: article.with(...)`. Le modèle projette
ces données vers les arguments internes du gabarit amont. Les identifiants et
les valeurs de l’archive restent ceux du type.

| Entrée Article | LaPreprint | IEEE pour MyST |
| --- | --- | --- |
| `localizations` et langue principale | Titre principal et sous-titre → `title`, `subtitle`. Titre court → `short-title`. Les résumés peuvent devenir les blocs `(title, content)` déjà prévus par LaPreprint. La ligne de mots-clés principale est hors des filets. Les titres traduits et les mots-clés secondaires demandent une extension de cette composition. | Titre, résumé et mots-clés principaux → `title`, `abstract`, `index-terms`. Sous-titre, titres secondaires, résumés et mots-clés secondaires sont des extensions visuelles. L’amont ne compose aucun titre courant. |
| `authors`, `affiliations` | Utiliser [`prepare-authorship`](../crates/core/templates/capabilities/authorship.typ) pour résoudre les identifiants, puis composer noms, exposants, affiliations et ORCID avec les règles amont. La signature officielle reste le texte transmis. | La grille amont reçoit les noms et l’adresse électronique. Une signature officielle simple peut alimenter une ligne d’affiliation. Plusieurs signatures, un ORCID et le rôle de correspondant demandent une extension. La projection exacte des champs amont `department`, `organization` et `location` est possible pour des données séparées, absentes de notre structure actuelle. Le modèle ne découpe pas une signature officielle à partir de sa ponctuation. |
| Bibliographie | Le projet fournit le chemin Hayagriva et le style CSL effectif. Conserver la taille de 8 pt et le titre de bibliographie de 10 pt sur le profil de référence, puis traduire le titre selon la langue du document. APA est le défaut amont, Chicago auteur-date celui du manifeste actuel. | Le projet fournit le chemin Hayagriva. Le manifeste impose le CSL IEEE. Rétablir le titre de 10 pt et les notices à 8 pt dans la colonne. |
| Papier, orientation, sommaire et puces | Le papier et les puces passent par les règles du modèle. Le port amont utilise US Letter par défaut. Le manifeste actuel choisit A4 et autorise paysage et sommaire. Évaluer la fidélité à réglages égaux avant de décider des défauts. | L’amont a deux branches de marges, A4 et Letter. Le manifeste actuel impose Letter portrait et désactive le sommaire. Le choix d’exposer aussi A4 est une décision de catalogue. |

`loadFrontmatter` et la consolidation MyST d’affiliations traitent l’import
dans leur environnement. Typstographe a déjà ses propres codecs et ses liens
par identifiant. Le [SVG ORCID amont](https://github.com/myst-templates/lapreprint-typst/blob/b7496d369fa6b143621afbebed0e87406f276bd2/frontmatter.typ#L1-L15)
est une ressource de présentation pour un identifiant existant. L’API commune
de [`show-abstracts`](../crates/core/templates/capabilities/abstracts.typ)
peut ordonner les langues et appeler un moteur de rendu propre au modèle.

### Capacités du corps et fonctions de présentation

| Capacités du type | Sortie de Typstographe | Intégration à partir de l’amont |
| --- | --- | --- |
| Paragraphes, titres 1–3 | `par`, `heading` natifs | Reporter les règles `set` et `show` de composition avec leur portée. Vérifier un niveau 3 suivi d’un paragraphe. Le générateur fournit un `par` explicite et le modèle d’origine peut recevoir du texte en flux. Un bloc forcé autour du titre modifie ce raccord. |
| Gras, italique, lien | `strong`, `emph`, `link` natifs | Garder les règles natives et le thème amont. LaPreprint colore aussi les renvois. |
| Listes à puces, numérotées et de descriptions | `list`, `enum`, `terms` | L’amont fixe les retraits des deux premières à 10 pt et 9 pt. Le marqueur suit le réglage effectif du modèle. La liste de descriptions utilise Typst natif. |
| Citation en bloc, note de bas de page | `quote` avec attribution, `footnote` | Laisser Typst composer les deux sous les styles et la géométrie du modèle. Les sources de référence ne définissent pas de règle dédiée. |
| Image et tableau | `figure(image(...))`, `figure(table(...))`, légendes et labels natifs. `table-header-cell` préserve les en-têtes de lignes accessibles. | Reprendre la composition native. Le raccord `layout-figures` couvre les placements de Typstographe, dont la pleine largeur IEEE et les tableaux longs. Tester ce raccord à part du profil amont et vérifier qu’il conserve les ancrages. |
| Maths en ligne et en bloc | `math-formula` produit un `math.equation` natif, depuis Typst ou via MiTeX. | Reprendre `(1)` et l’espace des blocs de 1 em pour LaPreprint et 0,65 em pour IEEE. La syntaxe de saisie reste une propriété du document. |
| Citation bibliographique | `citation` regroupe des `cite` natifs. | Garder la sémantique native pour le CSL. La fonction de composition de la bibliographie peut reprendre exactement la présentation amont avec les chemins fournis par le type. |
| Renvoi interne | `cross-reference` résout une cible stable et produit aussi le libellé de badge. | Le `show ref` amont d’IEEE vise les renvois natifs vers les équations. Le rendu de Typstographe utilise `reference-style` et un `link`. Le résolveur commun produit déjà `(n)` pour une équation numérotée. Tester le texte et le lien du renvoi, ainsi que les cas Typstographe avec page. |

[Source générée des blocs et objets en ligne](../crates/core/src/content/schema.rs) ·
[Disposition des figures](../crates/core/templates/capabilities/figures.typ) ·
[Renvois et texte du badge](../crates/core/templates/capabilities/cross-references.typ)

## Écarts de composition à traiter

### LaPreprint

| Zone | Code de référence | Première adaptation |
| --- | --- | --- |
| Page et en-tête courant | Marge gauche de 25 % sur toutes les pages. DOI et accès ouvert sur la première. Titre court et citation courte ensuite, en 8 pt. | Même marge et titre courant. Citation courte et en-tête éditorial absents. |
| Pied et marge éditoriale | Filet supérieur de 1 pt, retrait de 8 pt en haut et 2 pt à droite, grille 75/25. Revue et date à gauche, pagination à droite. Logo en haut de marge, dates et blocs éditoriaux en bas de marge de première page via `place`. | Filet et retraits conservés. Le pied est réduit à la pagination. Les placements en marge sont absents. |
| Titre et auteurs | Titre 17 pt avec retrait de 2 pt dessous, sous-titre 14 pt. Noms 11 pt demi-gras, indices et ORCID graphique sur la même ligne, jointure éditoriale. Bloc auteurs avec retrait vertical de 10 pt et affiliations sous forme d’entrées enchaînées. | `title` sémantique à 17 pt sans ce retrait explicite. Rendu générique des auteurs, lien ORCID textuel et affiliations ligne par ligne. |
| Résumés | Filets supérieur et inférieur de 1 pt, retraits verticaux de 16 pt. Titre coloré demi-gras à 9 pt et texte justifié. Ligne de mots-clés à 9 pt sous les filets, après un espacement horizontal de 8 pt entre libellé et contenu. Espace de 10 pt avant le corps. | Retraits de 8 pt, filets de 0,55 pt, et blocs génériques à 10 pt avec les mots-clés à l’intérieur. |
| Corps et bibliographie | Espacement de paragraphes à 1,5 em dans le corps MyST. Premier niveau à 12 pt en petites capitales avec espaces faibles de 20 et 13,75 pt, deuxième à 10 pt italique avec 10 pt avant et après, troisième dans le flux avec deux-points. Traitement distinct des remerciements. Bibliographie 8 pt avec titre à 10 pt. | La majorité des valeurs des titres est conservée. Le traitement des remerciements et les tailles de bibliographie manquent. Le tableau dense reçoit un réglage ajouté pour Typstographe. |

[Composition LaPreprint amont](https://github.com/myst-templates/lapreprint-typst/blob/b7496d369fa6b143621afbebed0e87406f276bd2/lapreprint.typ) ·
[Modèle repris depuis le source](../crates/core/templates/article-lapreprint.typ)

### IEEE pour MyST

| Zone | Code de référence | Première adaptation |
| --- | --- | --- |
| Papier, police et colonnes | STIX Two Text à 10 pt, branches de marges A4 et Letter, deux colonnes avec gouttière de 12 pt. | Libertinus Serif à 10 pt, mêmes formules de marge et de gouttière. STIX Two Text est absente du moteur embarqué et disponible sous SIL OFL. Pour la fidélité hors ligne, épingler la police et l’exporter lorsque utilisée. |
| Titre et auteurs | Titre centré à 18 pt précédé de 3 pt faibles, puis 8,35 mm. Grille de trois auteurs par rangée, gouttière de 12 pt, noms à 12 pt et 16 pt entre rangées. 40 pt après la dernière. | Titre sémantique à 18 pt, sans les 3 pt. Grille équivalente sur le nombre d’auteurs, mais 8 pt faibles après chaque rangée et 20 pt après la grille, avec un bloc supplémentaire pour les correspondants. |
| Résumé et mots-clés | En gras au corps hérité, retrait de 1 em, libellé italique sur la ligne du texte, filet absent, séparation portée par le flux de paragraphes et 2 pt après l’ensemble. | Texte à 9 pt, retrait nul, interligne de 0,7 em, blocs séparés avec espaces de 9 et 12 pt. Titres traduits à 11 pt, sous-titres à 10 pt et ponctuation adaptée au français. |
| Corps et titres | Corps justifié, retrait de première ligne à 1 em, espacement historique de 0,65 em appliqué via `show par`. Niveaux `I.`, `A.`, `1)`. Niveau 1 à 12 pt, centré en petites capitales, avec 20 pt avant et 13,75 pt après. Niveau 2 italique avec 10 pt avant et après. Niveau 3 dans le flux et terminé par deux-points. Remerciements à 10 pt sans numéro visible. | Justification et retrait conservés. La règle moderne de paragraphe est l’équivalent recommandé par le compilateur, avec effet à mesurer. Les titres de 10 pt sont mis en blocs avec de nouveaux espacements en em aux trois niveaux. |
| Renvois et bibliographie | Renvoi d’équation par numéro entre parenthèses. Bibliographie à 8 pt et titre à 10 pt. | Renvoi d’équation pris en charge par le résolveur commun. Taille de bibliographie à 8 pt, sans rétablissement explicite du titre à 10 pt. |

[Composition IEEE amont](https://github.com/myst-templates/ieee-typst-template/blob/e40d10316580912aed84348170b479133acc5622/template.typ) ·
[Première adaptation](../experiments/ieee-myst/model.typ) ·
[Sources et licence des polices STIX](https://www.stixfonts.org/)

### Reprise IEEE et mesures

Le modèle du catalogue a rétabli STIX Two Text, le retrait et les espacements
du titre, la grille des auteurs et ses 16 pt entre rangées et 40 pt après la
dernière, le corps gras de 10 pt du résumé, les retraits des mots-clés, les
titres aux trois niveaux et la bibliographie à 8 pt avec son titre à 10 pt
en anglais. La structure commune fournit désormais les trois champs facultatifs
d’affiliation. Le gabarit utilise la signature officielle lorsque ces champs
sont tous vides. L’expérience précédente reste disponible pour comparaison.

- **Source amont sur Typst 0.15.1.** Le port de référence remplace
  `locate(fn)` par `context` et applique `par(spacing: 0.65em)`. Avec les
  mêmes éléments Typst dans le corps, le cas monolingue de deux pages avec
  quatre auteurs, équation, renvoi et bibliographie donne deux images
  identiques à 1 400 px et les mêmes coordonnées pour les 827 mots extraits.
- **Source originale sur Typst 0.11.1.** Le titre, la grille d’auteurs,
  le résumé et les titres relevés commencent aux mêmes positions. Les
  césures et la répartition du corps entre colonnes diffèrent.
- **Export réel depuis un projet.** La première comparaison a révélé deux
  différences liées aux blocs émis par l’éditeur. Le modèle compose le
  titre de niveau 3 sur la ligne du paragraphe suivant, en conservant
  le titre natif et les deux ancres. Il retire du flux la zone vide
  d’insertion en fin de document. Avec les mêmes caractères de ponctuation
  dans les entrées, les deux pages du projet monolingue sont identiques
  pixel par pixel à la référence adaptée à Typst 0.15.1, à 1 400 px.
  La version historique sous 0.11.1 garde les différences relevées plus haut.
  Le rôle sémantique des remerciements reste à définir avec le contrat.

## Contrat Article

### En-tête Publication — mis en œuvre

Un onglet facultatif conserve les informations éditoriales avec l’article.
Les modèles reçoivent une structure `publication` et décident de sa disposition.
Les champs sont accessibles quel que soit le modèle actif, pour pouvoir préparer
un manuscrit puis le soumettre avec un autre modèle.

| Champ | Valeur | Usage de LaPreprint |
| --- | --- | --- |
| DOI de l’article | Facultatif, forme canonique sans préfixe URL. L’interface peut normaliser une URL `https://doi.org/…` saisie. | Lien sur la première page. |
| Revue ou plateforme | Texte libre facultatif. | Pied de page. |
| Genre éditorial | Texte libre facultatif, par exemple « Article original ». | Titre du bloc en marge. |
| Statut d’accès | Non renseigné, ouvert ou restreint. | Le badge « Open Access » apparaît si l’accès est explicitement ouvert. |
| Dates de soumission, d’acceptation et de publication | Trois champs facultatifs. Réutiliser le format de date structuré du projet et accepter un libellé personnalisé. Une date personnalisée n’est pas interprétée. | Dates en marge, date de publication dans le pied. Reprendre les formats amont pour le profil de référence et le formatage localisé pour les autres langues. |
| Citation courte | Champ en ligne facultatif, par exemple « Martin et Dupont, 2026 ». | Après le titre court dans l’en-tête courant. Sans valeur renseignée, le titre court suffit. |
| Première page | Entier strictement positif, facultatif. Valeur effective 1 en l’absence de choix. | Initialise le compteur de page. Les renvois, le sommaire et les folios utilisent ce compteur. Pour LaPreprint, conserver « 1 sur 2 » à partir de 1 et afficher « 37 », puis « 38 », en pagination continue. |

Typst 0.15.1 confirme que `counter(page).update(37)` au début du flux
donne les folios 37 et 38 aux pages physiques 1 et 2. Le sommaire et
`cross-reference` emploient déjà ces folios. Les dates restent des valeurs
fixes du projet, y compris si l’interface propose « Aujourd’hui ». L’en-tête
réservé à la première page s’affiche sur la première page physique, même si
elle porte le folio 37. Un modèle comme IEEE peut masquer ses folios dans
le pied de page tout en les utilisant pour les renvois.

Le logo éditorial relève du modèle et de ses ressources. Les blocs de marge
libres `(title, content)` proposés par LaPreprint sont reportés jusqu’à un
cas d’usage qui justifie leur saisie. Les zones en marge réservées au genre et
aux dates font partie de la recette complète de Publication.

### Remerciements — capacité différée

La future capacité conservera le contenu des remerciements dans le document.
Le modèle pourra le composer en section dédiée ou en note de bas de page.
Pour le cas d’une section, un rôle `acknowledgments` sur un titre de niveau 1
reste une piste. Le libellé, les renvois, la place au sommaire et l’interface
de saisie seront précisés avec le contrat.

Les deux sources amont masquent le numéro en comparant le texte à deux
graphies anglaises. Avec Typst 0.15.1, un titre natif `numbering: none` garde
son ancre et sa place au sommaire sans consommer un numéro. Dans l’essai
« I. Introduction / Remerciements / II. Discussion », masquer le numéro par
une règle d’affichage seule consomme au contraire un numéro. Les
remerciements placés entre deux sections forment donc un cas de recette
distinct du cas courant en fin d’article. Un autre essai montre qu’un
titre non numéroté n’ouvre pas non plus une nouvelle série de sous-sections.
Un niveau 2 suivant reprend la dernière série numérotée, par exemple
« I.A. Contexte / Remerciements / I.B. Suite du contexte ».

### Affiliations IEEE — décision mise en œuvre

La structure `authorship` conserve les signatures officielles en texte libre
et les liens par identifiant. Les champs facultatifs `department`,
`institution` et `location` complètent la signature. IEEE affiche les champs
renseignés, un par ligne, les deux premiers en italique et le lieu en romain.
Si les trois sont vides, il compose la signature officielle en italique,
avec ses retours à la ligne. La grille conserve les affiliations de chaque
auteur et son courriel. Le profil de référence couvre les deux parcours.

Les théorèmes, lemmes et preuves relèvent d’un lot indépendant. Aucun des
deux gabarits examinés ne les définit. LaPreprint et IEEE pour MyST seront
repris lors de l’intégration de ces capacités.

## Recette avant intégration

1. Produire pour chaque référence un article monolingue de plusieurs pages.
   Fixer le papier, la police, la langue, la date et le CSL. Inclure deux
   rangées d’auteurs, des résumés sur plusieurs lignes, les trois niveaux de
   titres, du texte entre les titres, une équation et son renvoi, une image,
   une note, une bibliographie et des remerciements. Documenter les changements
   strictement nécessaires à la compilation sous Typst 0.15.1.
2. Compiler la projection du même contenu dans le modèle Typstographe avec le
   même moteur et les mêmes fichiers de police. Comparer tailles de pages,
   césures, positions des lignes et des filets, puis les pages rasterisées.
   Examiner chaque différence résiduelle. Les métadonnées techniques du PDF
   sont hors du critère d’identité visuelle. Conserver un cas complet et un
   brouillon sans données facultatives.
3. Rejouer séparément le français, le multilingue, les affiliations partagées,
   les renvois de page, les figures flottantes et le tableau long. Documenter
   la présentation de ces extensions au point où elles divergent de l’amont.
   Rejouer ensuite sauvegarde, réouverture et export hors ligne sur le même
   projet pour vérifier l’interchangeabilité.

### Reprise LaPreprint

Le port reprend les règles du code MyST épinglé à `b7496d3`. Il garde la
marge gauche de 25 % sur toutes les pages, le titre sémantique à 17 pt dans une
boîte en ligne, le sous-titre à 14 pt, le corps effectif à 11 pt sous Typst 0.15.1,
les filets du résumé à 1 pt et leurs retraits verticaux de 16 pt. Le pied
reprend la grille 75/25, le filet et les retraits amont. Le bloc éditorial
retrouve sa place en bas de la marge sur la première page physique. La
reprise du code a également rétabli l’espacement du logo ORCID et la couleur
de la citation bibliographique.

La comparaison monolingue utilise trois pages US Letter, Libertinus Serif,
l’anglais, APA, deux auteurs, deux affiliations, un ORCID, le DOI, les trois
dates, les trois niveaux de titres, une équation, son renvoi, une citation et
la bibliographie. Avec un lien Typst équivalent au renvoi structuré `(1)`
dans la référence et les mêmes caractères dans le texte, les trois pages
rasterisées à 1 400 px sont identiques pixel par pixel sous Typst 0.15.1.
La recette de pagination continue donne 37, 38 et 39 avec le DOI et les dates
sur la première page physique. L’export PDF standard fonctionne. Le profil PDF/UA-1 de Typst refuse le
lien DOI dans son en-tête traité en artefact. Ce cas devra rejoindre la
recette d’accessibilité commune.

Les titres traduits, les mots-clés par langue, le correspondant explicite
et les renvois localisés s’appuient sur nos structures. LaPreprint conserve la
signature officielle entière des affiliations. Pour les remerciements, le
port conserve la règle historique des deux graphies anglaises en attendant
la capacité dédiée. Le logo éditorial et les blocs libres en marge ne
nécessitent aucun champ supplémentaire pour ce port.
