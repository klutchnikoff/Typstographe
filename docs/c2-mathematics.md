# C.2 — Formules et équations

Choix validés le 4 novembre 2026. Premier périmètre : corps du type Article,
avec formules en ligne et équations en bloc. Le rendu appartient à Typst et au
modèle, sans prévisualisation mathématique supplémentaire dans l’éditeur.

## Saisie et interactions

| Saisie | Effet |
| --- | --- |
| `$` seul sur une ligne, puis Entrée | Widget d’équation Typst |
| `$$` seuls sur une ligne, puis Entrée | Widget d’équation LaTeX |
| `$cos(x)$` dans le texte | Formule Typst en ligne |
| `$$\cos(x)$$` dans le texte | Formule LaTeX en ligne |

Les doubles dollars choisissent le langage ; ils ne signifient pas une équation
hors ligne dans cette convention. Les déclencheurs restent inactifs dans le code
mathématique, pendant une composition et dans les types sans ces capacités.
Un retour simple avant le marqueur suffit, comme pour les listes.

Dès le délimiteur ouvrant, la saisie passe dans une vraie zone de code : les
règles de prose ne peuvent pas réinterpréter les opérateurs ou les espaces.
Les délimiteurs fermants permettent de reprendre la prose. Un retour arrière
retire une zone en ligne encore vide, en conservant le texte voisin.

L’éditeur conserve le source lisible et éditable. Les formules en ligne montrent
leurs délimiteurs, qui constituent l’habillage de la zone de code. Le widget
hors ligne reprend l’en-tête, la corbeille, les propriétés et les bandeaux communs,
avec une indication Typst/LaTeX. Entrée ou Maj + Entrée ajoute un retour dans le code d’un bloc ;
Tab permet de poursuivre après la formule ou le widget. Ctrl/Cmd + Entrée ouvre
les propriétés. Une ligne de continuation est conservée après chaque widget.

Les lignes vides avant, après ou entre des widgets suivent la règle commune de
l’éditeur : ¶ est affiché sur la ligne, sans caractère ajouté au document.
Retour arrière ou Suppr retire cette ligne sans modifier les widgets voisins ;
Annuler la rétablit. La ligne de reprise obligatoire en fin de document reste
disponible. Les retours internes au source d’une équation restent du code.

Le langage est choisi à la création et reste fixe : aucun sélecteur Typst/LaTeX
n’est proposé dans les propriétés, en ligne comme en bloc. Les deux variantes
conservent leur indication de langage et partagent le moteur de saisie. Le
second dollar d’un délimiteur initial `$$` choisit toujours LaTeX pendant la
création de la zone encore vide ; ce n’est pas une conversion d’une formule écrite.
Dans le contrat, `language` est lié à la création et stocké comme attribut
(`x-editor.placement = "creation"`, `x-editor.storage = "attribute"`). Sa présence
est valide dans le document, mais `node.set_attrs` ne peut pas le modifier.

Les propriétés proposent la description accessible et, pour un bloc, le label.
L’en-tête du widget affiche, juste après son icône, `eq:` grisé et non éditable,
puis une boîte pour le suffixe facultatif. Le suffixe est unique dans le document,
sans espace, deux-points ou dollar. Ce contrôle réutilise le schéma et le même
attribut `alias` que les propriétés, via la commande commune `node.set_attrs`.
Entrée ou sortie du champ valide ; Échap annule et revient au code. Ctrl/Cmd +
Entrée valide puis ouvre les propriétés par la même action que la roue dentée.
Une composition dans le champ n’est pas publiée avant sa validation.

Les deux contrôles restent synchronisés, même avec le panneau ouvert. Confirmer
le champ d’en-tête réactualise un champ de propriétés resté intact, sans écraser
un autre brouillon local ; une modification concurrente étrangère conserve les
règles de refus habituelles. Un doublon ou une erreur garde le texte dans le champ
et la dernière valeur confirmée dans le document. Échap pendant une préparation
annule l’édition avant publication ; une opération déjà publiée reste annulable
par l’historique documentaire.

Le code est une zone de texte partagée : espaces multiples et retours sont
conservés, sans styles de prose ni correction orthographique. La recherche de
prose ignore les formules et conserve les positions du texte qui les suit.
Une formule incorrecte reste éditable et récupérable ; l’aperçu conserve son
dernier rendu valide et affiche le diagnostic de compilation.

## Contrat commun

Les capacités `math.inline` et `math.block` sont déclarées dans le type Article.
Le catalogue commun décrit leurs paramètres et exemples pour Tauri, CLI et MCP.
Les nœuds `mathInline` et `mathBlock` contiennent des nœuds `text` sans marques :

```json
{
  "type": "mathBlock",
  "attrs": {
    "language": "latex",
    "alt": "Fraction de a par b",
    "alias": "fraction"
  },
  "content": [{ "type": "text", "text": "\\frac{a}{b}" }]
}
```

Les délimiteurs de saisie ne font pas partie du source stocké. Insérer un bloc
passe par `block.insert`/`block.splice`, une formule en ligne par `inline.replace`.
Les éditions de source utilisent `text.insert`/`text.delete` sur la zone du nœud ;
les propriétés utilisent `node.set_attrs`. Les mêmes validations s’appliquent
aux mises à jour Yjs/Yrs et aux commandes explicites.

Une formule en ligne possède du contenu éditable, contrairement aux badges
atomiques : sa taille dans le parent est celle du source UTF-16 plus ses deux
frontières structurelles. Les requêtes de zones et les commandes tiennent compte
de cette taille. Une édition visant une partie interne passe par la zone de la
formule, jamais par un décalage supposant un badge d’une unité. La carte vers le
source dérivé représente chaque formule par son expression générée complète,
sans prétendre à une correspondance caractère par caractère avec les glyphes.

## Renvois et modèles

Les blocs reçoivent une ancre stable automatique. Le label personnel est un alias
de recherche indépendant ; le modifier ne casse pas les renvois. Copier un bloc
renouvelle son ancre et efface son alias personnel pour éviter une collision ; les
renvois copiés avec lui suivent la copie, selon C.1.

`references.list` expose les équations et leur intitulé descriptif. Dans le
sélecteur, `eq:` ou `$` filtre les équations, et `eq:fraction`/`$fraction` affine
la recherche. Le badge réutilise le contenu composé pendant le rendu Typst :
le modèle Article fourni numérote les équations en bloc `(1)`, `(2)`, etc.
La suppression d’une équation référencée est protégée comme celle des autres
cibles. Les décisions de comparaison conservent les dépendances C.1. Les
transferts ou échanges d’alias entre équations restent groupés pour qu’une
composition partielle ne crée pas de doublon ; une simple édition de source
ne groupe pas tout le corps.

## Bibliothèque Typst et autonomie

`capabilities/mathematics.typ` expose l’entrée stable :

```typst
math-formula(source, language: "typst", block: false, alt: "")
```

Typst interprète le source mathématique natif. MiTeX 0.2.7 convertit le source
LaTeX puis Typst compose une véritable `math.equation`, avec ses compteurs,
liens et description accessible. Il n’y a pas de liste propre à typstOgraphe de
formules autorisées, ni de promesse de compatibilité avec tout LaTeX : les
possibilités et diagnostics sont ceux des moteurs employés. On saisit une formule,
éventuellement complexe et multiligne, plutôt qu’un document LaTeX complet.

Le paquet officiel MiTeX, ses spécifications, son module WebAssembly et sa licence
Apache-2.0 sont embarqués et inventoriés. Le résolveur commun ajoute les dépendances
importées par le corps, même si le modèle n’a pas d’import explicite du wrapper,
en conservant les ressources déjà embarquées. Un article sans mathématiques
ne transporte pas MiTeX du seul fait de son modèle. Les nouveaux projets, les sauvegardes,
la récupération et les exports transportent les fichiers nécessaires sans cache
externe ni installation LaTeX.

L’intégration actuelle utilise le plugin WebAssembly du paquet Typst, exécuté
par Typst côté Rust, et non par le moteur JavaScript de l’interface. C’est
[l’interface standard des plugins Typst](https://typst.app/docs/reference/foundations/plugin/),
qui permet de conserver le même adaptateur dans un export autonome.
MiTeX expose aussi une [API Rust native `convert_math`](https://docs.rs/mitex/latest/mitex/fn.convert_math.html).
Le [benchmark publié](https://typst.app/universe/package/mitex/) annonce 2,28 s
pour WASM et 0,085 s pour x86 sur 32 500 équations ; il mesure la conversion,
pas notre compilation complète ni la latence d’édition. Une voie native est une
option mesurée dans un [banc isolé](../experiments/mitex-comparison/RESULTS.md)
sur des articles de 10, 50 et 200 formules. Le code converti et les pixels des
aperçus concordent. Le gain se concentre sur le premier rendu ; les mises à
jour complètes à chaud ne montrent pas de gain robuste. Le chemin WASM reste
en place. La latence des articles longs mérite un profilage distinct de la
conversion ; aucune bascule native n’est faite à ce stade.

**Différé :** macros LaTeX et fonctions Typst personnalisées, leur portée et leur
conservation ; éditeur visuel, conversions de syntaxes, théorèmes et preuves.
Aucune option locale de numérotation n’est ajoutée dans ce lot ; le modèle reste
responsable de la numérotation.

Exemple autonome : [article-mathematics.typsto](../examples/article-mathematics.typsto).
Sa [recette CLI](../examples/cli/article-mathematics.json) le reconstruit vers une
destination libre. Les documents locaux préexistants ne sont pas remplacés.

## Accessibilité des formules

La description accessible est le texte alternatif natif de
[`math.equation(alt: ...)`](https://typst.app/docs/reference/math/equation/#parameters-alt),
transmis par notre adaptateur pour Typst comme pour LaTeX/MiTeX. C’est une lecture
en langue naturelle (« a au carré », « a divisé par b »), pas une légende imprimée
ni un label de référence. La saisie reste facultative dans un brouillon et n’est
pas générée automatiquement à partir du code.

Le [guide Typst](https://typst.app/docs/guides/accessibility/#textual-representations)
indique qu’un texte alternatif est actuellement nécessaire pour les mathématiques
accessibles ; son absence fait échouer un export PDF/UA-1. Le recours automatique
à MathML pour HTML et PDF 2.0 est annoncé comme évolution future. Le test local
compile réellement les deux langages, vérifie le refus PDF/UA-1 sans `alt` et le
succès avec `alt`. Ce contrôle ne change pas les réglages d’export de l’application
et ne promet pas la conformité du document entier sur cette seule base.

## Ajustements et vérification — 5 novembre 2026

- Langage choisi à la création, champ `eq:` dans l’en-tête et contrôle générique
  réutilisable, synchronisation avec les propriétés sans duplication de valeur.
- Clavier, validation, doublons, mise à jour du panneau ouvert, annulation avant
  publication, conservation du code et absence de refus global du document.
- 481 tests frontend, 277 tests du cœur et 16 parcours mathématiques
  Chromium/WebKit passent. Les exports PDF/UA-1 sont exercés par le cœur.
- Compilation web, TypeScript et Clippy vérifiés. Aucune capture ; les documents
  locaux et les fichiers d’exemple déjà modifiés restent intacts.

## Vérification locale — 4 novembre 2026

- Suite workspace Rust : 462 tests réussis, un ignoré ; noyau revérifié après
  l’ajustement du modèle (272 tests, dont six consacrés aux mathématiques).
  Les cas couvrent de vrais rendus Typst et MiTeX, le compteur commun, les
  alias, les positions après une formule et la sauvegarde d’un source incomplet.
- Interface : 442 tests Vitest et six tests Node réussis ; 31 tests de contrat
  partagé Yjs/Yrs, dont un aller-retour de source mathématique exact.
- Recettes graphiques : six parcours mathématiques sous Chromium/WebKit,
  et six parcours C.1 de non-régression des renvois. Aucune capture ni trace.
- Compilation web et pilote natif, Clippy avec avertissements interdits,
  formatage Rust/Prettier, limites de modules et dépendances du cœur vérifiés ;
  dix tests du routage CI réussis.
- Exemple reconstruit avec la CLI courante puis exporté en PDF et Typst hors
  ligne ; correspondance du wrapper et de tous les fichiers MiTeX embarqués
  vérifiée. Les quatre documents locaux préexistants restent identiques.

## Correctifs de qualification — 6 novembre 2026

La branche intègre `main`, avec les corrections C.1 de construction du texte Yjs
et de l’exemple archivé. Les contrôles d’intégrité à la reprise restent actifs.

- Les profils riches conservent les ancres des champs d’en-tête. Les formulaires
  privés utilisent l’état confirmé comme base de reprise, sans perdre les
  identités ni produire une édition des champs inchangés. Les recettes couvrent
  reprise, annulation, nouvelle reprise puis validation des titres et résumés.
- Les paragraphes de continuation créés par le moteur, ainsi que le document
  vide servant à isoler un import refusé, reçoivent leur ancre avant publication.
  La reprise ne doit pas modifier l’identité de ces paragraphes.
- Les transactions d’initialisation n’utilisent pas le contrôleur d’aperçu avant
  sa création. La demande finale de démarrage prend le document courant.
- Les assertions de texte DOM excluent les décorations `.paragraph-marker` ;
  elles vérifient séparément la présence de ¶, le texte éditable et les éditions.
  Aucun contenu documentaire n’est masqué par cette correction des recettes.

Les vérifications utilisent une installation npm isolée avec le `postinstall`
versionné de `patch-package`, comme la CI. Les trois exemples versionnés ont été
ouverts par le moteur et contrôlés pour les ancres manquantes ; les copies de
travail locales sont conservées.

Vérifications : 483 tests Vitest, 10 contrôles Node, 31 tests du contrat partagé,
278 tests du cœur et 131 tests natifs réussis (un test ignoré). Les 66 scénarios
Chromium/WebKit ont été vérifiés : 64 réussites dans la recette élargie, puis les
deux imports rejoués avec succès après leur correction. TypeScript, les builds
web et natif de recettes, Clippy, le formatage, les limites de modules Rust et
la frontière des dépendances du cœur passent. Aucune capture ni trace.

Qualification CI multisystème et recette utilisateur à confirmer avant fusion.
