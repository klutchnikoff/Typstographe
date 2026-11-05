# Exemples

[article-working.typsto](article-working.typsto) est un article de démonstration
au format CAS 14, avec le générateur Typst 4 (guillemets et apostrophes typographiques, manifeste du modèle embarqué),
régénéré depuis le contenu versionné : auteurs et affiliations, résumés bilingues, sommaire, titres, citation
en bloc, note de bas de page, liste, tableau et citations bibliographiques.
Les ancres de blocs C.1 et l’état Yjs archivé sont concordants : l’ouverture ne
nécessite aucune attribution d’identité susceptible de modifier l’instantané.

Sa bibliothèque contient deux fichiers internes (BibLaTeX et Hayagriva), avec
trois références fictives citées et une notice non citée. Les quatre citations
illustrent les groupes de références, les compléments de pages ou de chapitre
et la forme narrative. Le modèle compose la bibliographie finale automatiquement.

Ouvrir le fichier dans typstOgraphe ; aucun fichier bibliographique externe
n’est nécessaire. Les scripts JSON de la CLI sont dans [cli/](cli/).

Le courrier utilise les cibles et nœuds du contrat structuré courant : paragraphes
explicites, métadonnées, gras, P.-S. et mention de pièce jointe. Depuis la racine :

```sh
mkdir -p output
cargo run --locked --offline -p typstographe-cli -- script examples/cli/courrier.json
```

Le résultat est `output/courrier-script.typsto`. Pour rejouer l’exemple, choisir
une destination libre dans son action `save` ; le script ne remplace pas un fichier existant.

## Renvois

[article-cross-references.typsto](article-cross-references.typsto) utilise le modèle
courant et montre les renvois vers un titre et un tableau : libellé complet, page
ou les deux. Les cibles ont des identités stables ; modifier leur intitulé ne
casse pas les renvois. L’exemple et ses dépendances sont autonomes hors ligne.
La [recette CLI](cli/article-cross-references.json) le reconstruit vers une
destination libre ; modifier son chemin de sortie pour conserver l’exemple fourni.
