# C.1 — Ancres et renvois

Décisions validées les 3 et 4 novembre 2026 ; implémentation du premier périmètre
sur `feat/c1-cross-references`. Les objets référencés sont les titres, images et
tableaux du corps. Les équations et théorèmes réutiliseront ce contrat.

## Identité et commandes communes

Les blocs possèdent une ancre documentaire opaque, indépendante de leur titre,
position ou numéro. Les éléments créés par l’éditeur reçoivent leur identité par
l’extension officielle Tiptap UniqueID, complétée pour les copies documentaires
et la création directe du paragraphe final partagé. Les nouvelles structures des
commandes Rust utilisent le même vocabulaire d’ancres. Les contrôles de validité,
d’unicité et d’existence des cibles appartiennent au cœur.

Modifier un titre conserve son identité ; déplacer un bloc conserve son ancre.
Une copie reçoit de nouvelles ancres. Les renvois copiés avec leurs cibles suivent
les copies ; un renvoi copié seul continue à viser la cible originale. Pour copier
une forêt avec des relations internes via CLI/MCP, transmettre cette forêt dans
le même `block.splice`, plutôt que des insertions indépendantes.

`references.list` présente, dans l’ordre documentaire, les `id`, `kind`, `title`
et `path` courants des cibles. Le chemin sert aux éditions de la révision courante ;
le renvoi conserve l’`id`. Les identifiants ne sont pas affichés dans le sélecteur.

La capacité publique `insert.reference` décrit un atome `crossReference` :

```json
{
  "type": "crossReference",
  "attrs": {
    "target": "identifiant-lu-dans-references-list",
    "include_label": true,
    "include_page": true
  }
}
```

Il occupe une unité UTF-16, comme les notes et citations. `inline.replace` l’insère
dans une zone riche ; `node.set_attrs` modifie sa cible ou ses composantes. Aucun
texte Typst, numéro ou chemin du système de fichiers ne peut remplacer la cible.

Au moins une composante est nécessaire. Une cible absente, un identifiant invalide,
une ancre dupliquée ou un objet incompatible fait refuser la publication finale.
Un lot peut retirer/recibler les renvois puis supprimer leur cible atomiquement ;
une tentative incomplète ne publie rien. La frappe destructrice est aussi protégée
dans l’éditeur avant son envoi au propriétaire documentaire.

## Présentation et Typst

L’utilisateur coche **Libellé complet**, **Page**, ou les deux. Il n’y a ni choix
« Numéro seul » ni menu « Selon le modèle » : le modèle possède toujours la
présentation. La combinaison vide ne se valide pas.

Le source dérivé utilise des labels dans l’espace `tog-…`, distinct des intitulés,
et importe le wrapper autonome `capabilities/cross-references.typ`. Celui-ci utilise
les éléments, compteurs, numérotations, emplacements et liens de Typst. Les titres
non numérotés sont référencés par leur texte ; les figures sans légende ne reçoivent
pas un numéro zéro artificiel. Sans numérotation ni légende, le supplément du
modèle fournit le libellé ; un modèle peut définir un rendu plus descriptif.

`cross-reference(target, include-label: true, include-page: false)` est l’entrée
stable. `reference-style(label: auto, page: auto, combine: auto)` permet au modèle
de fournir des fonctions Typst produisant le libellé, la page et leur combinaison.
Les deux premières reçoivent l’élément cible ; la dernière reçoit les deux contenus.
Par défaut, la combinaison est « libellé (page N) ». Les modèles fournis déclarent
leur numérotation de pages sans changer leur pied de page visible. Une référence
de page dans un modèle qui ne déclare aucune numérotation produit un diagnostic.

Le wrapper expose par métadonnées le contenu qu’il vient de composer. Le rendu
natif lit ces valeurs lors de la compilation déjà nécessaire à l’aperçu et les
transmet avec ses pages. Les badges n’effectuent ni seconde compilation ni comptage
concurrent. Un document ou modèle modifié invalide les libellés précédents ; en
attendant le rendu confirmé, le badge décrit sa cible sans inventer de numéro.

Le wrapper et son inventaire sont copiés dans le projet et l’export. Aucun paquet
Universe ni accès réseau supplémentaire n’est requis.

## Sélecteur, badges et conservation du travail

Le sélecteur utilise `contextPanel`, `BandHost`, `navigationGroup` et la voie
commune `applyObjectEdit`. Il apparaît au-dessus du point d’insertion, avec la même
présentation dans le texte ou un widget. Il conserve la ligne et la structure.

- La recherche porte sur les titres et légendes, sans distinguer casse ou accents.
  Les résultats conservent l’ordre documentaire et leur icône de genre.
- Les flèches changent la cible sans quitter la recherche ; un clic sélectionne.
  Entrée valide ; Échap annule. L’action principale est à l’extrémité droite.
- L’insertion et la validation replacent le curseur après le badge. L’annulation
  utilise le marque-page d’ouverture, continuellement reporté par le bandeau commun.
- Les badges sarcelle réutilisent le focus, l’espacement, l’activation à droite,
  le clic et la confirmation de suppression des objets en ligne existants.
- Clic et commande contextuelle Ctrl/Cmd + Entrée ouvrent le même panneau.
  Les formulaires ouverts passent par la conservation et la reprise communes.
  Une cible disparue pendant la saisie ne doit pas être remplacée silencieusement.

Les comparaisons Versions/MCP conservent ensemble les changements de cibles et
leurs renvois dépendants. Le regroupement est conservateur : si une cible apparaît
ou disparaît avec ses usages, le corps est une unité de décision. La composition
reste validée par le moteur avant toute publication.

## Limites et suite

Un renvoi vise une cible ; les groupes et plages de renvois sont différés. Les
ancres des autres blocs préparent leur adressage, sans annoncer un renvoi numéroté
universel. La sélection de cible par clic dans l’aperçu est différée : elle passera
par un mode explicite du sélecteur et réutilisera la correspondance backward.
En cas d’ambiguïté, il faudra demander un choix, sans deviner le label le plus proche.

L’exemple [article-cross-references.typsto](../examples/article-cross-references.typsto)
utilise le modèle courant. Sa [recette CLI](../examples/cli/article-cross-references.json)
reconstruit le projet vers une destination libre. Le fichier de travail local
`article-working.typsto` n’est pas remplacé.

## Vérification locale — 4 novembre 2026

- Workspace Rust : 456 tests réussis, un test ignoré ; les six tests ciblés des
  renvois couvrent aussi les compteurs Typst, les callbacks du modèle et l’image
  sans légende. Clippy passe avec les avertissements interdits, y compris pour
  le pilote de recettes.
- Interface : 434 tests Vitest, six tests Node et 30 tests de contrat partagé
  réussis. Les recettes graphiques totalisent neuf parcours sous Chromium et
  trois sous WebKit, sans capture ni trace.
- Compilation TypeScript/Vite, formatage, contrôles de dépendances du cœur,
  longueur des modules Rust et 19 tests du routage CI réussis.
- L’exemple est reconstruit par sa recette CLI puis exporté hors ligne en PDF
  et Typst. Le wrapper embarqué correspond au source courant. Les quatre
  documents locaux préexistants sont conservés à l’identique.

Ces contrôles ne remplacent ni la qualification CI multisystème ni la recette
utilisateur avant fusion.
