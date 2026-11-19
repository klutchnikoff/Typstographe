# Quire et Plain Typst Book — préparation de Livre et Mémoire/thèse

Évaluation du 14 novembre 2026. Les fiches [Livre](type-profiles/book.md) et
[Mémoire/thèse](type-profiles/thesis.md) décrivent des types prévus. Les choix
ci-dessous restent à valider avant de fixer leurs contrats.

Partir des usages éditoriaux permet de définir les capacités de Typstographe.
Quire et Plain Typst Book apportent des exemples et des cas de recette.
Chaque modèle adapte ensuite le même contrat à ses propres règles Typst
pour retrouver la composition de référence.

## Correspondance avec les sources

| Sujet | Quire 0.1.0 | Plain Typst Book |
| --- | --- | --- |
| Point d’entrée | La règle `quire.with(…)` reçoit les données éditoriales et le corps. Elle compose la page de titre, les pages liminaires et la mise en page longue. | La règle `template.with(…)` de `style.typ` reçoit le corps, le titre, le sous-titre et une chaîne pour les auteurs. Le fichier `template.typ` prépare ces arguments depuis MyST. |
| Structure du corps | `top-level` assigne des rôles aux niveaux de titre pour le document. Avec parties, les rôles sont partie, chapitre, section et sous-section. Les parties sont en chiffres romains et les chapitres gardent une numérotation continue. `part` et `chapter` acceptent une épigraphe et son attribution. Le wrapper `appendix` passe les divisions d’annexe en lettres. | Tout titre de niveau 1 ouvre un chapitre sur une nouvelle page. Parties et annexes demanderaient une adaptation. Le sommaire utilise `outline` avec une profondeur paramétrable. |
| Pages liminaires | Page de titre avec institution, champs libres `info`, dédicace, colophon, remerciements, résumés et mots-clés par langue. `info` permet de composer des lignes de direction et de soutenance. Le type Mémoire/thèse devra leur donner une structure réutilisable. | Couverture avec image facultative, préface facultative et sommaire. Les titres « Preface » et « Contents » sont en dur. Une adaptation doit localiser ces titres et qualifier la préface sur plusieurs pages, car elle est composée dans une `box`. |
| Mise en page et compteurs | Modes papier et écran, pages liminaires en romain et corps en arabe, ouvertures au recto à l’impression. Dans l’essai, les compteurs suivent la division courante et distinguent figures et tableaux. | Mode A4 par défaut, marges latérales de 20 % et 10 %, folios du corps désactivés par défaut. Figures et équations recommencent au chapitre. Dans l’essai, une image, un tableau puis une image donnent `1.1`, `1.2`, `1.3` dans la même série de numéros. |
| Bibliographie | Règles de présentation pour les appels natifs à `bibliography`. L’exemple commun utilise une bibliographie globale. | L’adaptateur MyST peut ajouter une bibliographie globale APA. Le style Typst reçoit un corps où l’on peut appeler `bibliography` directement. |

Sources examinées : [Quire 0.1.0 sur Typst Universe](https://typst.app/universe/package/quire/),
[archive publiée](https://packages.typst.org/preview/quire-0.1.0.tar.gz) et
[dépôt Quire](https://github.com/mariovagomarzal/quire).
Plain Typst Book est figé au commit `031d1bd7f930719979f994858cf0f71a85e570a5`.
Voir son [style Typst](https://github.com/myst-templates/plain_typst_book/blob/031d1bd7f930719979f994858cf0f71a85e570a5/style.typ)
et son [adaptateur MyST](https://github.com/myst-templates/plain_typst_book/blob/031d1bd7f930719979f994858cf0f71a85e570a5/template.typ).

## Essai de compilation

Essai temporaire avec Typst 0.15.1, épinglé dans Typstographe. Les deux appels
Typst reçoivent le même corps avec deux divisions principales, un titre de
section, des images et des équations, un tableau, une note, des renvois et des
citations issues de Hayagriva. Quire reçoit en plus le marqueur natif d’annexe
et des pages liminaires académiques. L’essai compile directement le style
Typst de Plain, séparément de MyST. Les paquets épinglés étaient présents dans
un répertoire local et les polices système désactivées. Les pages de titre,
de sommaire et de chapitre ont été contrôlées sur les PDF rendus.

- **Français.** Dans Quire, `lang: "fr"` produit les libellés natifs de Typst
  en français. Les chaînes propres à Quire retombent en anglais : « Contents »,
  « Acknowledgments », « Chapter », et « Abstract » devant le résumé français.
  Quire 0.1.0 fournit l’anglais, l’espagnol et le catalan. La date de soutenance
  passée via la fonction `format-date` de Typstographe affiche « 14 novembre
  2026 ». La traduction Quire et les numéros de chapitres en toutes lettres
  sont à qualifier si l’on adapte ce modèle.
- **Papier et écran.** Le même manuscrit Quire donne 12 pages en mode écran
  et 23 en mode papier, dont 11 pages intercalaires sans texte dans cet essai.
  Les ouvertures au recto relèvent du modèle.
- **Renvois depuis une annexe.** La figure et l’équation visées portent les
  numéros `2.1` dans le chapitre. Le renvoi natif de Quire affiche `B.1`
  depuis l’annexe, et l’appel direct à notre fonction `cross-reference`
  affiche `A.1`. La recette de chaque modèle devra vérifier le numéro et le
  lien dans le PDF ainsi que le texte du badge, dans les deux sens entre
  chapitres et annexes. Il faut prendre le numéro dans le contexte de la
  cible, y compris quand sa règle de numérotation dépend de l’emplacement.
- **Bibliographies par chapitre.** Une variante indépendante des deux modèles
  a compilé deux `bibliography` sur un même fichier Hayagriva, en citant les
  mêmes notices dans un ordre différent. Avec un `group` distinct par
  chapitre, le style IEEE redémarre à `[1]` dans chacun. Le regroupement
  par défaut peut poursuivre la numérotation. Typst fournit aussi `target`
  pour cibler explicitement des citations. Avant de proposer l’option, vérifier
  les notes, les citations groupées, les annexes et les styles auteur-date
  dans un manuscrit complet. La portée pourra être une option de modèle
  (globale ou par chapitre) avec une seule bibliothèque par projet.
  [Documentation de Typst](https://typst.app/docs/reference/model/bibliography/#multiple-bibliographies)

### Dépendances et distribution

Quire déclare MIT pour le code et MIT-0 pour son gabarit de projet. Il charge
directement `hydra:0.6.3`, `num2words:0.2.0`, `theorion:0.6.0` et
`codly:1.3.0`. Les sources chargent aussi `oxifmt:1.0.0` via Hydra,
ainsi que `showybox:2.0.4` et `octique:0.1.1` via Theorion. Ce chargement
a lieu même dans le manuscrit sans théorèmes ni code. Le manifeste de
[num2words 0.2.0](https://typst.app/universe/package/num2words/) déclare
LGPL-3.0-or-later. En cas d’intégration, qualifier sa distribution avec les
autres dépendances dans l’application et l’export Typst hors ligne.
Les polices conseillées par Quire sont externes au paquet. L’essai substitue
Libertinus Serif, New Computer Modern Math et DejaVu Sans Mono.

Plain Typst Book est sous MIT. Le style Typst seul n’importe aucun paquet.
L’adaptateur MyST déclare `marge:0.1.0`. Les familles utilisées dans l’essai
par le style sont Libertinus Serif et New Computer Modern.

## Contrats proposés à la validation

### Divisions du corps

| Capacité | Ce que le document doit pouvoir exprimer |
| --- | --- |
| **Partie** | Regrouper des chapitres sous un titre commun. Les parties sont facultatives. Un livre qui commence directement par un chapitre reste valide. |
| **Chapitre** | Identifier une division qui possède un titre, une ancre stable et un corps structuré. Le corps peut contenir les sections, notes, citations, images, tableaux et équations déjà pris en charge. Un titre court pour les en-têtes courants et une épigraphe avec attribution sont des extensions à examiner. |
| **Section** | Organiser le contenu à l’intérieur d’un chapitre ou d’une annexe avec les titres hiérarchisés existants. |
| **Annexe** | Identifier une division de complément avec son titre, son ancre et son contenu. Elle peut recevoir des renvois et apparaître au sommaire. |

Renommer ou déplacer un chapitre conserve son ancre ainsi que les cibles des
renvois vers son contenu. Le sommaire et les signets PDF dérivent des
divisions. La forme de stockage, les commandes de déplacement dans l’éditeur
et les signatures Typst restent à préciser. Un chapitre est une unité
éditoriale dès le contrat. Son traitement comme titre Typst relève de
l’adaptation du modèle.

### Données et textes liminaires

- **Commun aux deux types.** Définir des contenus facultatifs pour la
  dédicace, la préface et les remerciements. Déterminer les besoins de saisie
  de chacun. La préface, par exemple, doit pouvoir accueillir plusieurs
  paragraphes et plusieurs pages.
- **Livre.** Réutiliser les titres et l’identité des auteurs. Préciser la
  direction d’ouvrage, les informations de publication et l’image de
  couverture selon les usages. L’attribution d’un chapitre à des auteurs
  distincts est à examiner pour les ouvrages collectifs.
- **Mémoire/thèse.** Garder un type unique et réutiliser les titres,
  l’identité de l’auteur, les résumés et les mots-clés par langue. Cadrer
  la structure académique avec l’établissement, la formation ou la
  discipline, la direction, le jury facultatif et la date de soutenance
  facultative. Réutiliser les dates structurées et Datify.
- **Bibliographie.** Conserver une bibliothèque Hayagriva par projet.
  Proposer d’abord une bibliographie globale, puis préciser la portée
  par chapitre et les politiques de numérotation avant de l’ouvrir aux
  modèles. Les citations conservent leur identité documentaire.

### Adaptation et recette des modèles

Un modèle peut rendre un chapitre avec un titre Typst de niveau 1, comme
Plain Typst Book, ou adapter les divisions aux règles internes de Quire.
Il choisit la présentation du titre et de la couverture, les ouvertures au
recto, les marges de reliure, les compteurs et le foliotage. Si une fonction
du style d’origine couvre seulement une partie du contrat, compléter ses
règles de composition pour les données restantes. Par exemple, un modèle
dérivé de Plain Typst Book peut garder sa composition de chapitre et ajouter
une présentation propre aux parties et aux annexes.

Préparer un manuscrit avec des chapitres sans partie et sous une partie,
une annexe, des textes liminaires, des citations et des renvois entre
divisions. Vérifier qu’un changement de modèle conserve les données,
l’ordre des divisions et les cibles. Pour les contenus représentables dans
le modèle d’origine, comparer le rendu adapté aux sources Typst, notamment
les marges, les ouvertures, les titres, les filets et les interlignes.
Documenter la composition choisie pour les contenus supplémentaires.

Pour un premier lot, valider ce que contient un chapitre et les règles
d’organisation des parties et annexes. Les deux modèles pourront ensuite
servir à éprouver les contrats de Livre et de Mémoire/thèse. Les
environnements scientifiques et le code structuré garderont leurs contrats
partagés. Les listes de figures et tableaux, l’index et le glossaire restent
à cadrer.
