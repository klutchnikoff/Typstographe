# Recherche et acquisition bibliographiques en ligne — C.5

## Utilisation

Dans un Article, ouvrir **Bibliographie → Gérer les références → Rechercher en
ligne** (icône globe). La même action est disponible dans le bandeau d’insertion
d’une citation. Saisir un titre, un auteur ou un DOI ; choisir les sources puis
lancer explicitement la recherche. La frappe et la recherche locale du projet
ne déclenchent aucun appel réseau.

Les flèches parcourent les résultats en gardant le focus dans la recherche.
Entrée, un clic ou **Vérifier la notice** ouvre le formulaire commun. Vérifier
le type natif Hayagriva et les champs, corriger si nécessaire, puis choisir
**Ajouter** ou **Ajouter et citer**. Annuler n’ajoute rien. Un rapprochement
ambigu ouvre les mêmes choix que l’import de fichiers : conserver séparément
avec une autre clé, ou désigner la notice correspondante. Les valeurs existantes
ne sont pas écrasées par défaut.

Cairn est une **récupération ciblée**, par DOI `10.3917/…`, identifiant OAI,
URL d’article/chapitre portant un identifiant, ou URL moderne contenant un ISBN
et un numéro de page. Pour cette dernière forme, la résolution doit retrouver
exactement le chemin et la page dans Crossref. Une URL non résolue est signalée ;
il n’y a ni recherche générale Cairn, ni lecture du texte intégral, ni contournement
d’une page protégée.

## Frontières techniques

- `typstographe-bibliography-sources` porte HTTP, XML et conversion des métadonnées.
  La crate bibliographique et le cœur documentaire restent sans réseau/Tokio.
- Le premier adaptateur réseau est Tauri (`bibliography_online`). La CLI et MCP
  conservent leurs opérations documentaires ; aucune nouvelle commande réseau
  n’est ajoutée à leur catalogue dans ce lot. Le client public de la crate est
  réutilisable, avec un exemple de qualification volontaire `lookup`.
- Client HTTPS partagé, validation des certificats et proxy du système ; aucune
  URL utilisateur n’est directement téléchargée. Les hôtes et endpoints sont
  fixés dans le collecteur ; les redirections sont refusées.
- Requête limitée à 512 octets, 1–20 résultats par fournisseur (8 dans l’interface),
  corps limité à 2 Mio, trois requêtes simultanées, intervalle Crossref de 400 ms.
  Connexion limitée à 5 s, requête à 12 s, parcours d’un fournisseur à 30 s.
  Aucune relance automatique ni clé d’accès demandée.
- Un fournisseur indisponible n’efface pas les résultats des autres. Les erreurs
  réseau, délais, limitations de débit, réponses invalides et absence de résultat
  sont distingués. Une réponse devenue obsolète ne peut remplacer la recherche
  courante, remplir un formulaire fermé ou modifier un autre document.

### Origine et vérification

Les résultats Crossref et Cairn restent distincts, même pour un DOI identique.
Le résultat Cairn prend son titre, ses auteurs, sa date et ses pages dans l’OAI
Cairn. Crossref peut fournir son type et les informations de publication
contenante (ouvrage/revue, éditeurs, ISBN/ISSN). L’échec de cet enrichissement
laisse un résultat Cairn incomplet et vérifiable avec un avertissement.

Le projet conserve un **instantané Hayagriva converti**, nommé selon le fournisseur,
et sa provenance d’import. Ce n’est pas une archive brute de la réponse JSON/XML.
Le formulaire corrige la notice native sans réécrire cet instantané. Les identités
et la provenance du jeu préparé restent immuables ; `reviewed` transporte ses
corrections dans `bibliography.review_import` et `bibliography.apply`. Le scope
`import` de la préparation du formulaire diffère la décision sur les clés
occupées au plan d’import ; le scope `project` reste strict. Le schéma
exécuté est publié dans [le catalogue](commands.json).

La publication repasse par le rapprochement commun, les empreintes et le lot
atomique. Une citation utilise l’identité issue du rapprochement, y compris
quand la notice existe déjà. L’ajout et la citation s’annulent ensemble.
Les brouillons privés, leurs corrections et décisions utilisent la récupération
existante, sans nouvelle interrogation réseau à la reprise. Après ajout, le
stockage CAS 16, la sauvegarde et les exports restent autonomes hors ligne ;
aucun changement de format ni bibliothèque personnelle n’est introduit.

## Qualification — 6 novembre 2026

Essais volontaires sur les services publics :

| Entrée                                         | Fournisseur                      | Résultat                                                                |
| ---------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| `10.3917/dbu.jorro.2022.01.0155`               | Crossref                         | Titre déposé de l’ouvrage, avertissement titre chapitre = ouvrage       |
| Même DOI                                       | Cairn OAI + publication Crossref | « Émancipation », Jérôme Eneau, 2022, p. 155–159                        |
| URL moderne Cairn ISBN 9782807340534, page 155 | Cairn                            | Même chapitre, après résolution exacte de l’URL                         |
| `10.2307/2118559`                              | zbMATH Open                      | Andrew Wiles, _Modular elliptic curves and Fermat’s Last Theorem_, 1995 |

Les fixtures de [métadonnées publiques](../fixtures/bibliography/online/README.md)
permettent les tests automatisés sans disponibilité des fournisseurs.
Les tests couvrent les conversions natives, les bornes, les erreurs et délais,
les identités erronées, les pannes partielles, la correction privée, les doublons,
les décisions explicites, le clavier, les réponses obsolètes, la récupération et
l’annulation atomique. Les recettes naviguent dans Chromium et WebKit avec le
cœur Rust réel ; seul le transport des résultats en ligne est simulé. Aucune
capture, trace ou vidéo n’est produite.

```sh
cargo test --locked --offline -p typstographe-bibliography-sources
# Appel réseau explicite, absent de la suite automatisée :
cargo run --locked --offline -p typstographe-bibliography-sources --example lookup -- '10.2307/2118559' zbmath
```

Références : [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/),
[zbMATH Open API](https://api.zbmath.org/), [Cairn OAI](https://oai.cairn.info/).
