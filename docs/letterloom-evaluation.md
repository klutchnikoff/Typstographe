# Évaluation de Letterloom pour le type Courrier

## Décision

La galerie présente trois libellés courts sous le type **Courrier** dans la galerie :
**Français**, **Britannique** et **Américain**. Ils désignent les conventions
de composition. La langue du texte reste un réglage du document. Le modèle
Français reprend Courrier personnel et garde la disposition pour enveloppe
DL à fenêtre en A4 portrait.

Prendre le paquet Typst comme référence de composition. Un adaptateur natif
court paraît préférable pour ce modèle précis. L’essai direct doit déjà composer
lui-même la signature, le P.-S. et les P.J., choisir des alignements distincts
pour éviter les coupures de date et déclarer le format de numérotation requis
pour les renvois. Le gain d’embarquer le paquet serait surtout son moteur
d’en-tête graphique, de signatures multiples et d’incorporation de pièces, trois
fonctions hors du contrat actuel. Si un futur modèle les utilise, le paquet
natif peut être embarqué et épinglé comme dépendance de ce seul modèle. La couche
MyST apporte une liaison à son front matter et n’est pas nécessaire ici.

## Sources épinglées

| Source | Version ou révision examinée | Licence et dépendances |
| --- | --- | --- |
| [Paquet Typst Letterloom](https://typst.app/universe/package/letterloom/) | 3.0.2, [tag et source](https://github.com/nandac/letterloom/tree/f1ea4f667d73aa88b40d751fc2b414f9d078c92b). [Archive distribuée](https://packages.typst.org/preview/letterloom-3.0.2.tar.gz), SHA-256 `e2955d56bb7bca3819cbc1e35c4677f280c9eb47fb93c0b3272a49db65e1fb42`. | [Unlicense](https://github.com/nandac/letterloom/blob/f1ea4f667d73aa88b40d751fc2b414f9d078c92b/LICENSE). Typst ≥ 0.14.0. Trois modules Typst, imports relatifs, aucun autre paquet. Libertinus Serif pour le corps et les notes, DejaVu Sans Mono pour le pied de page facultatif. Ces deux familles sont disponibles dans le CLI Typst 0.15.1 sans polices système. |
| [Adaptation MyST Letterloom](https://github.com/stefanv/myst-typst-letterloom/tree/3f325fe5734d176362055f0a78a71845e80500dc) | [Manifeste 0.1.0](https://github.com/stefanv/myst-typst-letterloom/blob/3f325fe5734d176362055f0a78a71845e80500dc/template.yml) au commit `3f325fe5734d176362055f0a78a71845e80500dc`. | [MIT-0 pour l’adaptation, Unlicense pour les trois modules Letterloom incorporés](https://github.com/stefanv/myst-typst-letterloom/blob/3f325fe5734d176362055f0a78a71845e80500dc/LICENSE.md). Le moteur Typst est presque identique à 3.0.2, avec un correctif d’espacement pour l’en-tête graphique à côté de l’expéditeur. La préparation du document passe par MyST/JTeX. |

Les trois sources Typst du paquet ont été utilisées telles quelles dans l’essai.
En cas d’adoption, les importer par chemin relatif depuis un modèle, inscrire
la version, la licence, la source et le hash dans l’inventaire des paquets, et
joindre la notice de licence. Une reprise de code dans un modèle doit elle aussi
indiquer la provenance et conserver la notice associée.

## Correspondance avec le contrat

Références locales : [contrat YAML](../crates/core/types/courrier/type.yaml),
[profil Courrier](type-profiles/courrier.md) et
[modèle Courrier personnel](../crates/core/templates/courrier-personnel.typ).

| Élément du Courrier | Letterloom natif | Adaptation à Typstographe |
| --- | --- | --- |
| Expéditeur, organisme, fonction, service, adresse, téléphone et courriel | `from-name` et `from-address` acceptent du contenu Typst. | Regrouper les coordonnées dans le bloc d’adresse et garder la fonction près du nom dans la signature. Préserver les lignes d’adresse. |
| Destinataire et adresse | `to-name`, `to-address`. Bloc obligatoirement à gauche dans la composition du paquet. | Ce placement convient à un autre modèle que Courrier personnel, qui place le destinataire dans la zone de fenêtre DL. |
| Objet et référence | `subject` accepte du contenu déjà composé. Pas de champ dédié à la référence. | Composer ensemble les champs présents, avec des libellés localisés et sans masquer une référence lorsque l’objet est encore vide. |
| Lieu et date | `date` accepte le résultat déjà formaté. Le paquet ne localise pas lui-même les dates et aligne par défaut leur largeur sur celle du bloc expéditeur. | Réutiliser [`format-date`](../crates/core/templates/capabilities/dates.typ) et Datify. Garder la date optionnelle et fixe, respecter une valeur personnalisée littérale, traiter le lieu seul et l’ordinal français. Choisir la largeur de date indépendamment de celle de l’expéditeur. |
| Corps et formule d’appel ou de clôture | `doc` porte le corps. Les options `salutation` et `closing` sont indépendantes et facultatives quand le masque est adapté. | Les formules existantes restent dans le corps. En anglais, l’essai place l’objet avant la formule d’appel, selon le même ordre que le courrier français. Le rendu amont place l’objet après la formule quand les deux sont fournis en paramètres. |
| Signature et nom | `signatures` accepte un ou plusieurs signataires. Le nom est obligatoire pour chaque entrée. Si l’image est absente, un emplacement de 40 pt est laissé. | Conserver une signature issue du projet et la place manuscrite même si le nom est encore vide. Placer le P.-S. et les mentions de pièces dans le même flux, après la signature. |
| P.-S. et mentions de pièces jointes | Le paquet n’a pas de crochet de post-scriptum. `enclosures` liste des descriptions et peut ajouter des pages de pièces qui ont un fichier. | Réutiliser [`letter-notes`](../crates/core/templates/capabilities/correspondence.typ), qui conserve le contenu riche de nos mentions et leur place après la signature. Les pièces elles-mêmes restent hors du fichier Courrier. |
| Langue, format, orientation et puces | `paper-size` règle le format. Langue, orientation et marqueurs peuvent être fixés autour de l’appel. Les numéros visibles sont écrits par le pied de page. | Fixer la langue Typst à partir de l’option de document, maintenir les puces locales et déclarer `page(numbering: "1")` pour le format des renvois, même avec un pied de page propre au modèle. |

`required-fields` a un double effet dans Letterloom 3.0.2. Une entrée listée
est requise et affichée. Une entrée retirée est masquée, même si une valeur est
fournie. Les chaînes et contenus vides fournis restent invalides, y compris pour
les champs retirés. L’adaptateur construit donc à la fois les arguments et le
masque à partir des valeurs présentes. La validation documentaire à l’export
reste celle de Courrier, où seuls le destinataire et l’objet sont requis.

L’[adaptation MyST](https://github.com/stefanv/myst-typst-letterloom/blob/3f325fe5734d176362055f0a78a71845e80500dc/template.typ)
regroupe déjà l’adresse, le courriel et le téléphone. Elle apporte un réglage
de largeur de signature, une image d’en-tête et le format US Letter par défaut.
Elle impose un titre et un expéditeur, renseigne la date avec
`datetime.today()` quand elle manque, utilise un format de date à mois anglais,
et expose un seul signataire. Référence, lieu et P.-S. n’ont pas d’équivalent
dédié dans le manifeste. La liste des pièces y reste commentée.

## Essais sur Typst 0.15.1

Le CLI Typstographe a créé et exporté
[`examples/cli/courrier.json`](../examples/cli/courrier.json) en Typst et PDF.
Dans une copie de l’export, l’essai a substitué uniquement le modèle et fourni
les trois modules Letterloom par chemin relatif. Le corps, ses labels et les
dépendances communes de l’export sont restés ceux de Typstographe. La compilation
Typst s’est faite avec `--ignore-system-fonts` et des chemins de paquets et de
cache vides. L’exemple Typst fourni par Letterloom compile également dans ces
conditions, après substitution de son import du registre par le chemin local.

- Le premier essai avec les réglages natifs a coupé « Rennes, le 24 octobre
  2026 » sur deux lignes à la largeur du bloc expéditeur. Il a aussi placé
  les mentions sur une nouvelle page lorsque `letter-notes` était appelé
  après la fonction Letterloom, dont le `set page` délimite la composition.
  Les alignements distincts ont rétabli la date sur une ligne. La signature
  et les notes ont été composées ensemble à la fin du flux passé au paquet.
- Le courrier français de l’export tient sur une page A4, avec date localisée,
  emplacement manuscrit et mentions après la signature. Deux variantes
  confirment « Le 1ᵉʳ janvier 2026 » sans lieu et la conservation exacte
  d’une date personnalisée « Fin du mois ».
- Le courrier anglais tient sur une page US Letter. Il conserve les coordonnées
  professionnelles, une référence, la signature SVG et deux mentions, dont une
  avec italique et lien. La date ressort en « October 24, 2026 ». Le français
  et l’anglais ont été contrôlés visuellement et par extraction du texte.
  Le même courrier anglais compile avec `--pdf-standard a-2b,ua-1` et son PDF
  est signalé comme balisé par Poppler.
- Un brouillon sans coordonnées ni date compile et conserve la place manuscrite
  en A5 paysage (210 × 148 mm). L’essai confirme aussi qu’une chaîne vide
  transmise à Letterloom provoque une erreur tant qu’elle n’est pas omise.
- Un document de trois pages vérifie titre, renvois vers le titre et le tableau
  avec numéros de page, note de bas de page, lien, citation, image flottante,
  tableau flottant et mention de pièce après le corps. Sans `page(numbering: "1")`,
  le renvoi à la page échoue même si le pied de page numérote les pages 2 et
  suivantes.

La chaîne MyST/JTeX a été étudiée dans les sources. La recette ci-dessus porte
sur le paquet natif avec le CLI Typst et sur un export du document existant.

### Essai d’un modèle Typst autonome

Un modèle temporaire reprend le flux de Letterloom 3.0.2, avec l’expéditeur
et la date à droite, le destinataire à gauche, le corps en Libertinus Serif
11 pt, les espacements de paragraphe 0,8/1,8 em et la numérotation visible
à partir de la deuxième page. La date prend sa propre largeur. L’objet et
la référence restent ensemble avant la formule d’appel, rédigée dans le
corps. La signature et les mentions de fin réutilisent le contrat Courrier.
Cette composition s’inspire du paquet. Elle diverge de ses réglages par défaut
sur la datation, le rythme du bloc de signature et la présentation des mentions.

Le changement de modèle a été effectué par `document.set_model` sur deux
vrais `.typsto`, français en A4 et anglais en US Letter. Après enregistrement,
réouverture et retour à Courrier personnel, les exports des métadonnées et du
corps Typst sont identiques octet par octet. La signature SVG est présente
dans les deux exports. Les dates restent localisées, le P.-S. et les P.J.
suivent le bloc de signature. Un courrier anglais de trois pages conserve
la signature en dernière page et numérote les pages 2 et 3. Un brouillon
A5 paysage avec une date personnalisée est prévisualisable. L’export anglais
avec signature compile hors ligne sous Typst 0.15.1, y compris avec
`--pdf-standard a-2b,ua-1`. Cette compilation ne vaut pas audit complet de
l’accessibilité.

Ces premiers essais utilisaient un modèle temporaire par la CLI.
L’intégration ci-dessous reprend les variantes validées.

## Intégration au catalogue

| Libellé | Composition de l’exemple |
| --- | --- |
| Français | Modèle Courrier personnel, A4, destinataire dans la zone de fenêtre DL. |
| Britannique | A4 par défaut, expéditeur et date à droite, destinataire et signature à gauche. Date « 24 October 2026 » et adresses de Bristol. La composition reprend Letterloom. |
| Américain | US Letter par défaut, alignement à gauche dans la convention *full block*. Date « October 24, 2026 » et adresses de Portland, Maine. |

Les deux variantes ont été exportées depuis des `.typsto` avec signature,
P.-S. et mention de pièce jointe. Les deux PDF tiennent sur une page et
recompilent hors ligne avec les profils PDF/A-2b et PDF/UA-1 de Typst.
Le passage du modèle britannique à l’américain a changé le format par défaut
de A4 à US Letter. Les exports du corps, des métadonnées et de la signature
sont identiques.

La galerie génère les vignettes à partir des modèles embarqués et de
courriers fictifs. Français conserve l’identifiant `courrier.model.personal`.
Les modèles `courrier.model.british` et `courrier.model.american` partagent
le rendu Typst du bloc de signature, du P.-S. et des mentions de pièces
jointes. Leurs manifestes déclarent des formats par défaut différents.
Un format explicitement choisi suit le document lors du changement de
modèle. Les dates personnalisées restent littérales. La date structurée
en anglais est composée selon la convention du modèle sélectionné.

Les choix britanniques de date et d’adresse suivent le
[guide GOV.UK](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/style-guides/a-to-z-style-guide/#dates).
La date et la composition américaine suivent le
[guide de correspondance professionnelle de Purdue](https://owl.purdue.edu/owl/subject_specific_writing/professional_technical_writing/basic_business_letters/).

## Extensions éventuelles du type

- Plusieurs signataires ou destinataires, une ligne « À l’attention de » et
  des destinataires en copie sont des données éditoriales. Un usage réel
  justifierait de leur donner une structure commune dans Courrier.
- Un logo choisi par l’organisation relève du modèle et de ses ressources.
  Un logo modifiable par document demanderait un champ de ressource défini par
  le type ou une option de modèle exposée.
- Joindre des fichiers au projet ou ajouter leurs pages au PDF sont des
  opérations distinctes. Le mécanisme de Letterloom fait la seconde. Notre
  capacité P.J. couvre aujourd’hui des mentions textuelles. Elle reste
  suffisante pour les modèles intégrés.
