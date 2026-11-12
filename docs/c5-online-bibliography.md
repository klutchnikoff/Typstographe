# Recherche et acquisition bibliographiques en ligne — C.5

La recherche par texte combine zbMATH Open et Crossref. La résolution d’un DOI
saisi reste spécialisée en priorité, avec la négociation DOI générique en repli.

## Utilisation

Dans un Article, ouvrir **Bibliographie → Gérer les références → Rechercher en
ligne** (globe). La même action est disponible dans le bandeau d’une citation.
Choisir les sources puis saisir la recherche. Elle part après une
courte pause de frappe.

- **Auteur, titre, année** : recherche dans zbMATH Open et Crossref en parallèle
  lorsque ces sources sont cochées. Crossref recherche tous les préfixes.
  Une année en fin de requête filtre la date de publication, et les requêtes
  courtes compatibles avec un nom bénéficient aussi du champ auteur.
  Avec Cairn activé, un DOI convertible en identifiant Cairn est vérifié auprès
  de Cairn OAI. La notice Cairn prime si elle est disponible. Sinon, le résultat
  reste attribué à Crossref. Un même DOI apparaît une fois, avec priorité à zbMATH.
- **DOI** : récupération par les sources spécialisées appropriées et cochées
  (Cairn OAI, zbMATH). Si aucune notice n’est obtenue, interrogation de `doi.org`
  avec `Accept: application/vnd.citationstyles.csl+json`.
- **Cairn** : DOI `10.3917/…`, identifiant OAI ou URL contenant un identifiant.
  Pour une URL publique sans identifiant, lire uniquement les métadonnées
  bibliographiques explicites pour retrouver son DOI. Si la page est inaccessible
  ou ne fournit pas un DOI unique, demander le DOI ou l’identifiant Cairn.

La recherche textuelle utilise l’API de Crossref. L’accès à Cairn reste ciblé,
par DOI convertible, URL exploitable ou identifiant OAI.

Les flèches parcourent les résultats sans déplacer le focus du champ de recherche.
Entrée, un clic ou **Vérifier la notice** ouvre le formulaire commun. Vérifier le
type natif Hayagriva et les champs, corriger, puis **Ajouter au projet** ou
**Ajouter et citer**. En cas de correspondance à vérifier, choisir **Comparer les
notices**. Un doublon exact réutilise directement la notice du projet.

## Contrat des collecteurs

`typstographe-bibliography-sources` porte le réseau et la conversion des notices.
La crate bibliographique pure et le cœur restent sans réseau/Tokio. L’adaptateur
réseau livré est Tauri (`bibliography_online`) ; la CLI et MCP gardent leurs
opérations documentaires, sans nouveau collecteur réseau exposé dans ce lot.

- Les spécialistes sont interrogés avant le repli DOI. Une notice spécialisée
  **partielle** est proposée avec avertissements ; elle n’est pas remplacée
  automatiquement par une notice générique.
- Le repli s’applique aussi après erreur ou réponse invalide d’un spécialiste.
  Son résultat porte l’origine **DOI** ; les erreurs spécialisées restent visibles.
- Crossref propose ses métadonnées pour les résultats de recherche textuelle.
  Pour un DOI saisi, `doi.org` continue à déléguer à l’agence concernée,
  notamment Crossref ou DataCite.
- Les compléments de publication Cairn proviennent de la notice Crossref déjà
  reçue lors d’une recherche textuelle, ou de la négociation DOI lors d’une
  consultation directe. Les champs OAI propres à la notice (titre, auteurs,
  date et pages) restent prioritaires.
- Le DOI reçu doit correspondre au DOI demandé, chez les spécialistes comme
  dans le repli. Une réponse erronée ne peut produire une citation d’un autre travail.
- La saisie dans l’éditeur et la recherche locale du projet restent hors ligne.
  Une réponse devenue obsolète ne remplace ni une nouvelle recherche ni une saisie.

Le client partage les connexions HTTPS, les certificats et le proxy système.
Bornes : 512 octets de requête, 1–20 résultats demandés (8 affichés dans l’interface),
2 Mio par réponse, trois requêtes simultanées, intervalle DOI de 400 ms, cinq
redirections au maximum, connexion limitée à 5 s et requête à 12 s. Chaque
parcours de fournisseur est limité à 30 s ; la résolution préalable d’une URL
et le repli ont chacun leur propre borne. Crossref est interrogé une requête à
la fois, avec 250 ms entre deux départs. L’enrichissement Cairn de chaque
résultat de recherche est limité à 3 s. Aucune relance automatique.

Les redirections DOI n’atteignent que les services de métadonnées HTTPS reconnus.
Une redirection vers une page éditeur ou un service non pris en charge est
signalée, sans téléchargement de cette destination. Les réponses vides, DOI
absents, formats non servis, erreurs, limitations de débit et délais sont distincts.
Aucune URL arbitraire n’est téléchargée : seuls les endpoints des collecteurs
et les URL Cairn validées sont utilisés.

## Vérification et publication

La notice reçue reste un brouillon privé dans le formulaire commun. En cas de
correspondance ou de clé déjà utilisée, le gestionnaire indique le motif et
compare la notice du projet à la notice reçue. Conserver réutilise la notice
du projet telle quelle. Ajouter exige une clé disponible. Enrichir complète
les champs manquants lorsqu’une correspondance bibliographique le permet.

Si une seule notice du projet possède les mêmes champs bibliographiques,
l’import réutilise sa clé et son identité. Les imports groupés comptent ces
doublons dans leur bilan. Une citation utilise directement la notice existante.

Lorsqu’une notice est ajoutée ou enrichie, le projet conserve un **instantané
Hayagriva converti**, nommé selon la source et distinct de la notice vérifiée.

`bibliography.review_import` reçoit le jeu corrigé `reviewed`, puis
`bibliography.apply` publie l’import gardé. Les identités et la provenance
restent celles de la préparation originale. Le scope de formulaire `import`
diffère les collisions de clés au rapprochement ; le scope `project` reste strict.
Voir [le catalogue documentaire commun](commands.json).

Une citation utilise l’identité issue du rapprochement, y compris pour une
notice déjà présente. L’ajout et la citation forment un seul lot annulable.
Les corrections non validées utilisent la récupération des formulaires, sans
nouvelle requête en ligne à la reprise. Après ajout, CAS 16/17, sauvegarde et export
restent autonomes hors ligne ; aucun changement de schéma d’état ni bibliothèque
personnelle n’est introduit.

## Qualification locale — 7 novembre 2026

Essais volontaires sur les services publics :

| Entrée                             | Parcours                    | Résultat                                                          |
| ---------------------------------- | --------------------------- | ----------------------------------------------------------------- |
| `10.3917/dbu.jorro.2022.01.0155`   | Cairn puis complément DOI   | « Émancipation », Jérôme Eneau, 2022, p. 155–159                  |
| Même DOI, résolveur générique seul | DOI (agence Crossref)       | Titre de l’ouvrage déposé, avertissement titre chapitre = ouvrage |
| `10.2307/2118559`                  | Spécialistes activés        | zbMATH, Andrew Wiles, 1995, sans repli générique                  |
| `10.5284/1015681`                  | Spécialistes puis repli DOI | Rapport archéologique, agence DataCite                            |

Bilan : 20 tests des collecteurs, 13 tests Fluent, 495 tests frontend et les
10 tests de scripts natifs réussis ; Clippy et compilation validés. Les 40
scénarios Chromium/WebKit ont été validés : une recette WebKit existante a
expiré lors de la première passe, puis a réussi au rejeu isolé en 4,6 s, sans
modification du produit ni augmentation du délai. Les nouveaux parcours sont
passés dans les deux moteurs dès cette passe.

Les [fixtures publiques](../fixtures/bibliography/online/README.md) rendent les
tests indépendants des fournisseurs. Les tests du client couvrent la priorité,
les pannes et absences, les notices partielles, les DOI erronés, les formats et
redirections, les limites et délais. Les recettes Chromium/WebKit avec le cœur
Rust couvrent formulaire, provenance, rapprochement, clavier, réponses obsolètes,
récupération, annulation atomique, sauvegarde/réouverture et export hors ligne.
Seul le transport des résultats en ligne est simulé dans ces recettes ; aucune
capture, trace ou vidéo n’est produite.

```sh
cargo test --locked --offline -p typstographe-bibliography-sources
# Qualifications volontaires avec accès réseau :
cargo run --locked --offline -p typstographe-bibliography-sources --example lookup -- 'Wiles' all
cargo run --locked --offline -p typstographe-bibliography-sources --example lookup -- '10.5284/1015681' doi
```

Références : [DOI Content Negotiation](https://citation.doi.org/docs.html),
[DataCite](https://support.datacite.org/docs/datacite-content-resolver),
[zbMATH Open API](https://api.zbmath.org/), [Cairn OAI](https://oai.cairn.info/).
