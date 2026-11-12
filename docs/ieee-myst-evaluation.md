# IEEE pour MyST et le contrat Article

L’essai valide le changement entre un modèle de travail et un modèle à
réglages imposés. Le [modèle Typst](../experiments/ieee-myst/model.typ) et
son [manifeste](../experiments/ieee-myst/model.yaml) sont disponibles dans
les expériences. L’intégration au catalogue reste à décider.

## Adaptation

Le [port MyST à `e40d103`](https://github.com/myst-templates/ieee-typst-template/tree/e40d10316580912aed84348170b479133acc5622)
est une adaptation légère d’un ancien modèle IEEE de Typst. Le fichier
`main.typ` prépare les données MyST, tandis que `template.typ` porte la
composition. La [licence Unlicense](https://github.com/myst-templates/ieee-typst-template/blob/e40d10316580912aed84348170b479133acc5622/LICENSE)
et les crédits sont conservés dans le source de l’essai. L’appel historique
`locate(fn)` échoue avec Typst 0.15.1. L’essai utilise `context` pour les
titres et Libertinus Serif, déjà embarquée, à la place de STIX Two Text.

- L’essai reprend le titre et la grille d’auteurs en pleine largeur,
  le corps à deux colonnes, les niveaux de section `I`, `A`, `1` et la
  présentation des équations. Le titre est composé avec l’élément natif
  `title` pour conserver sa structure dans le PDF.
- Les données du projet passent par la fonction `article(...)`. Les signatures
  officielles restent en texte libre, avec toutes les affiliations associées
  à chaque auteur, son courriel, l’ORCID et le rôle d’auteur correspondant.
  Le port MyST ne sélectionne que la première affiliation de chaque auteur.
  Les résumés et mots-clés multilingues utilisent notre fonction commune.
  Le titre court est conservé dans les données et le modèle d’essai, comme
  le modèle amont, compose le document sans titre courant.
- Le manifeste d’essai impose Letter portrait, les citations numériques IEEE
  et l’absence de sommaire. C’est le profil choisi pour vérifier les régimes du
  manifeste. Le source amont permet notamment aussi le format A4.

## Recette de changement de modèle

Les quatre documents de la recette LaPreprint ont été repris. Pour chacun,
la CLI a sauvegardé et rouvert le même projet à chaque changement de modèle.
Le corps structuré, les métadonnées, les cibles de renvoi et les ressources
sont identiques. Les sources du corps, les métadonnées exportées, les notices
Hayagriva et les images sont identiques octet par octet lorsque présents.
Le retour à « Article de travail » restitue aussi son source principal,
son manifeste et son inventaire de dépendances.

| Document | Article de travail | IEEE pour MyST |
| --- | --- | --- |
| Article bilingue avec bibliographie | A4, Chicago auteur-date, sommaire, 3 pages | Letter portrait, citations numériques, 2 pages |
| Article bilingue avec l’anglais comme langue principale | A5 paysage, APA, sommaire, 6 pages | Letter portrait, citations numériques, 2 pages |
| Article avec équations Typst et LaTeX | 1 page, équations et renvois de page | 1 page, équations et renvois de page |
| Article avec tableaux, figure et renvois | 1 page, en-têtes des deux axes et texte alternatif | 1 page, mêmes en-têtes et texte alternatif |

Pendant l’essai sur le second article, les choix enregistrés A5, paysage,
APA et sommaire sont restés consultables. La tentative de modifier le style
imposé a été refusée et le fichier est resté identique. Les quatre choix
sont redevenus effectifs au retour à « Article de travail ».

Les huit exports des deux modèles recompilent avec Typst 0.15.1, avec les
options PDF/UA-1 et PDF/A-2b, sans polices système et avec répertoires de
paquets externes vides. Les pages du modèle d’essai ont été inspectées et
Poppler confirme notamment le balisage des titres, de la note, des formules,
du tableau et du texte alternatif de la figure. La conformité à une revue
IEEE précise et la validation veraPDF restent à qualifier.

## Placement et tableaux longs

Le modèle appelle la fonction commune `layout-figures`. Un tableau court
à huit colonnes flotte en haut sur toute la largeur et une image flotte en
bas de la même page. Le tableau long à huit colonnes et 78 lignes de données
est composé dans le flux sur les pages 2 et 3, avec 52 puis 26 lignes.
Les en-têtes de colonnes sont répétés. La légende, les renvois et le texte
alternatif de l’image sont conservés. Le texte reprend en deux colonnes
après le tableau. La recette compile hors ligne avec les options PDF/UA-1
et PDF/A-2b de Typst. [Paramètres de `figure` dans Typst](https://typst.app/docs/reference/model/figure/#parameters-scope)

Ouvrir le [document de test](../examples/article-ieee-placement.typsto) dans
l’application ou rejouer l’export depuis la racine du dépôt.

```sh
trial=$(mktemp -d)
mkdir "$trial/packages" "$trial/cache"
cargo run --locked --offline -p typstographe-cli -- export \
  examples/article-ieee-placement.typsto --format both --output "$trial/export"
typst compile --ignore-system-fonts --features a11y-extras \
  --package-path "$trial/packages" --package-cache-path "$trial/cache" \
  --pdf-standard ua-1,a-2b "$trial/export/main.typ" "$trial/ieee.pdf"
pdftotext -layout "$trial/ieee.pdf" -
```

## Ce que l’essai révèle

- **Rôles de certaines sections.** L’amont reconnaît les remerciements à partir
  de deux graphies anglaises du titre pour masquer leur numéro. Un rôle
  sémantique permettrait à une revue de composer des remerciements ou des
  annexes de façon fiable tout en conservant leurs titres et leurs ancres.
  Les usages exacts restent à confirmer sur des articles destinés à une revue.
  [Traitement des titres dans la source amont](https://github.com/myst-templates/ieee-typst-template/blob/e40d10316580912aed84348170b479133acc5622/template.typ#L71-L116)
- **Équations longues.** Une formule de cet essai déborde et son numéro
  chevauche le dernier terme. La même équation, écrite sur trois lignes dans
  le bloc mathématique existant, tient dans la colonne et garde son numéro
  et ses renvois. Examiner un diagnostic de débordement avant d’ajouter une
  option ou une capacité. Les énoncés et les preuves restent un chantier
  distinct du contrat Article.
- **En-tête.** Les affiliations officielles en texte libre, les titres et
  résumés multilingues et la bibliographie suffisent aux exemples testés.
  Le numéro de première page et les autres données de publication restent
  dans le lot d’extension déjà prévu. Les colonnes du corps et leur
  équilibrage relèvent de la mise en page du modèle.

## Rejouer l’essai sur l’article bilingue

Depuis la racine, avec la CLI du dépôt déjà compilée et `jq` disponible.

```sh
trial=$(mktemp -d)
cp fixtures/projects/article-working.typsto "$trial/article.typsto"
jq -n --rawfile source experiments/ieee-myst/model.typ \
  --rawfile manifest experiments/ieee-myst/model.yaml '
  {version: 1, document: {kind: "open", path: "article.typsto"},
   steps: [{id: "document.set_model", params: {
     model_id: "article.model.ieee-myst-evaluation", source: $source, manifest: $manifest
   }}], save: {kind: "current"}}' > "$trial/job.json"
target/debug/typstographe-cli script "$trial/job.json"
target/debug/typstographe-cli export "$trial/article.typsto" --format both --output "$trial/export"
```
