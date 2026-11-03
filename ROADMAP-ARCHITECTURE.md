# Plan technique de développement

Révisé le **3 novembre 2026**. Ce document accompagne la [roadmap produit](ROADMAP.md)
et ne conserve que les décisions à prendre et les travaux techniques restants.
Les anciennes phases, leurs réalisations et leurs inventaires historiques sont
dans les bilans de docs/ et l’historique Git.

## Cadre à préserver

- Tauri pour l’application, Tiptap/ProseMirror pour l’édition, Yjs pour l’état
  partagé et l’historique des participants, Rust et Typst pour la validation et le rendu.
- Contrats documentaires communs, identifiants publics anglais/latins et catalogue
  de capacités partagé ; l’interface et les agents ne définissent pas leur propre vocabulaire.
- Les modèles produisent la présentation en Typst ; la présentation de l’éditeur
  reste indépendante du type et du modèle.
- Fichiers locaux autonomes et compilation hors ligne, modèles et ressources
  embarqués, écritures atomiques et protection contre les écrasements concurrents.
- Un projet correspond à un .typsto autonome : document, modèle, dépendances,
  ressources et snapshots conservés. L’organisation technique de l’archive
  reste masquée ; le catalogue de projets de l’application ne contient que
  leurs références et les informations nécessaires à leur accès.
- Préférences et profil locaux, distincts du contenu partagé ; les valeurs
  incorporées au document deviennent ses données propres.
- Fluent fournit les langues de l’interface et son repli. Langue documentaire,
  langue d’interface et langue du correcteur sont distinctes.
- Contextes d’édition séparés ; une préédition IME n’est jamais publiée comme
  une modification validée. Les actions distantes préservent le focus humain.
- Propositions MCP isolées, gardées par document/révision, acceptées ou refusées
  par décisions locales dans le comparateur commun d’A.4. Les groupes dépendants
  restent atomiques ; F.3 complète les reçus et le cycle de vie,
  sans second moteur. Sauvegarde et export ont leurs autorisations propres.
- Les nouvelles interfaces sont maquettées et les choix structurants validés
  ensemble ; rechercher les outils maintenus avant de réimplémenter une brique.

Le [contrat structuré](docs/structured-contract.md) et l’[index documentaire](docs/README.md)
sont les références du socle. Aucun maintien artificiel des anciens formats ou
de la projection plate n’est demandé. Les bilans d’A.1–A.4 restent consultables.

## Socle livré — références

A.1–A.5 sont implémentés et recettés localement. Les [contrats courants](docs/README.md)
et le [bilan A.5](docs/a5-closure-results.md) décrivent les constructions normale/de
recette, les gardes et le corpus Courrier/Article entre adaptateurs. La qualification
CI complète du candidat doit encore être vérifiée avant fusion. Les contrôles
matériels, de signature et de distribution restent dans H.

Les contrats du fichier CAS, de récupération et du comparateur restent courants,
même lorsque leur nom conserve le numéro du lot qui les a définis. Le travail
livré ne figure plus comme tâche à faire dans ces roadmaps.

## B. Types, paramètres et manifestes — P1

**Catalogue validé le 1er novembre 2026 :**
[groupes et fiches](docs/document-type-catalogue.md), avec un registre de
découverte commun aux adaptateurs. Garder les profils prévus séparés des
contrats exécutables : disponibilité dérivée des modèles, aucune extension
factice de l’énumération des types. Un type peut appartenir à plusieurs groupes.
Un seul type Mémoire et thèse ; la lettre de motivation reste un Courrier.
Valider le contrat de chaque fiche avant son développement, puis fournir un
premier modèle utilisable. La galerie de création réutilise ces registres :
filtres cumulables, tuiles et vignettes de modèles calculées à la demande par
Typst, indépendamment du document ouvert. Garder le contenu inchangé au
changement de modèle.

Préciser le schéma de chaque type, les genres de valeurs, les groupes de champs,
les capacités et les signatures à implémenter. La note
[Types, modèles et libertés](docs/types-modeles-libertes.md) est une proposition,
avec une clarification validée sur les paramètres et l’interchangeabilité des
modèles ; les autres arbitrages ne remplacent pas encore les contrats actuels.

**Décision validée le 26 octobre 2026 :** le type définit les capacités ; tous
ses modèles les implémentent. Les options de présentation ont un régime libre,
restreint ou imposé, déclaré dans le manifeste, y compris pour les options des
capacités. Une valeur imposée peut être indiquée sans sélecteur. Les métadonnées
de contenu ne sont pas remplacées par le modèle. Séparer choix enregistré et
valeur effective : un choix incompatible utilise le défaut avec avertissement,
sans écrasement ; un choix imposé reste temporaire tant que ce modèle est actif.
Vérifier notamment brouillon → revue à style imposé → brouillon : les citations
restent intactes et le choix initial redevient effectif s’il est autorisé.

### B.1 — Contrats des structures d’en-tête et définition déclarative

**Orientation retenue le 3 novembre 2026 :** séparer les structures d’en-tête
réutilisables, les capacités du corps et leur composition dans un type. La
frontière des comportements exposés doit être formalisée avant de remplacer
les déclarations Rust actuelles. Le format de fichier ne remplace pas ce travail.

Pour chaque structure exposée, définir :

- les données typées, valeurs absentes et défauts, identifiants et ordre ;
- les validations structurelles et métier, les dépendances, les références
  entre collections et le comportement des opérations (ajout, modification,
  suppression, réordonnancement) ;
- les profils des zones riches, les composants d’interface communs, leurs
  interactions et les commandes partagées entre Tauri, CLI et MCP ;
- la sérialisation vers le contrat Typst, sans injection de source par les
  valeurs saisies et sans déplacer la présentation dans le type.

Les premières briques à évaluer sont les champs simples, collections ordonnées,
références entre collections, ensembles multilingues, zones riches à profils et
références de ressources. Éprouver leur composition sur les auteurs et
affiliations : texte officiel libre pour une affiliation, références par
identifiants, auteurs sans affiliation possibles, règles explicites pour retirer
une affiliation référencée. Distinguer les contraintes génériques réutilisables
des règles métier implémentées dans le moteur ; ne pas construire un langage de
programmation de validations ou d’interactions dans le manifeste.

**Format de rédaction : YAML**, chargé avec Serde dans un contrat Rust typé,
avec un **répertoire par type** et un fichier principal `type.yaml`. Traductions
Fluent et documentation peuvent rester dans des fichiers séparés ; les modèles
Typst restent distincts. L’arborescence exacte et la granularité des fichiers
seront validées sur l’exemple, sans multiplier les fichiers par défaut. Commencer
par les types livrés avec l’application ; le chargement de types externes reste
un sujet distinct.

Réutiliser une bibliothèque YAML maintenue compatible avec Serde ; évaluer
`yaml_serde` avant de l’intégrer, sans ajouter `serde_yaml`, qui n’est plus
maintenue. Fixer les conventions de lecture et les diagnostics (champs inconnus,
clés dupliquées, références invalides), sans écrire de parseur spécifique.

**JSON et JSON Schema** servent aux échanges, à la documentation du contrat et
aux contrôles structurels, en réutilisant les outils déjà présents lorsque cela
convient. Aucun de ces formats n’est intrinsèquement plus riche pour nos besoins :
le vocabulaire du contrat détermine ce qui est exprimable. Les références
`$ref` de JSON Schema relient des schémas ; elles ne vérifient pas les liens entre
identifiants d’auteurs et d’affiliations. Les dépendances métier et la cohérence
des éditions restent validées dans le moteur commun, pour tous les adaptateurs.

**Sortie B.1 :** inventaire et contrats des structures/capacités, exemple YAML
auteurs/affiliations et schéma associé, distinction explicite entre déclarations
et comportements implémentés, puis validation commune avant migration. Vérifier
ensuite cette frontière sur Courrier et Article avant de l’étendre aux prochains
types. Une capacité inédite (par exemple les équations) peut demander du code
moteur/éditeur ; sa disponibilité et ses paramètres seront ensuite déclarables.

L’[inventaire B.1 et l’exemple déclaratif](docs/b1-type-contracts.md) constituent
le support des choix validés et des fixtures du contrat. Préparer
aussi les contrats des cibles de références, formules et notices bibliographiques,
puis réaliser les lots C.1–C.4 dans cet ordre. Une capacité encore absente ne
doit pas être annoncée comme exécutable par le manifeste ou le MCP.

**Raccordement B.1 implémenté :** `document_types::definition` et
`document_types::runtime` chargent les contrats embarqués dans `crates/core/types/`.
Ils fournissent champs, collections, vues, capacités, défauts, validation des
valeurs, diagnostics d’export et génération de l’appel Typst aux trois adaptateurs.
Les anciennes listes `FIELDS`/`GROUPS`, `ModelContract`, le schéma Article manuel
et le drapeau `letter_only` sont retirés. Le [contrat courant](docs/type-definitions.md)
décrit les composants enregistrés pour signature, date et fichiers bibliographiques,
la conservation des sources et les recettes. Les structures Rust restent les
codecs des valeurs ; aucun registre concurrent ni chargeur externe n’est ajouté.
Restent les dates structurées, ressources génériques et régimes de modèles.

**Structures d’en-tête — choix validé le 3 novembre 2026 :** enregistrer des
fragments déclaratifs communs et les développer avant la validation finale du
type. Premier fragment : `authorship`, avec les deux collections auteurs et
affiliations, leurs dépendances, règles, vues et liaisons Typst. La référence
`structures: [authorship]` n’introduit ni import de fichier arbitraire ni nouvelle
voie d’édition. Les adaptateurs et le sérialiseur consomment le contrat résolu.
Les collisions de noms et les tentatives de redéfinition sont refusées ; la
première version réutilise les structures à l’identique. Un ordre explicite
permet au type de placer onglets, collections et liaisons sans modifier leur
contenu. Vérifier la conservation exacte du contrat Article, du source Typst
et des parcours de validation/suppression des affiliations référencées.

**Mutualisation implémentée :** fragment unique dans
`crates/core/structures/authorship.yaml`, codecs dans `document_types::authorship`
et raccourci actif dans le manifeste Article. Le développement consomme
`structures`/`order` avant validation et exposition aux adaptateurs. Les ordres
non vides sont des permutations complètes, sans filtre ni remplacement. Une
fixture du contrat Article résolu vérifie sa conservation exacte ; les sources
Typst restent couvertes par la recette existante.

### Arbitrages complémentaires avant implémentation

1. Détails du contrat déclaratif de B.1, migration des types Rust actuels et limites
   d’un éventuel type installable.
2. Champs simples et listes d’enregistrements, valeurs absentes et défauts ;
   conserver les genres jusqu’à la sérialisation Typst et empêcher l’injection
   de source par les valeurs saisies.
3. Représentation des paramètres du type, des paramètres généraux et des options
   du modèle ; schéma des trois régimes validés et exposition des contrôles.
4. Contrôle de conformité des modèles et diagnostic d’incompatibilité, sans
   perte ou réécriture implicite du contenu ; conservation des choix lors des
   changements de régime.
5. Dates : valeur structurée/ISO, insertion fixe d’aujourd’hui, langue du document,
   format demandé au modèle et rôle de l’adaptateur Typst/Datify.
6. Format et emplacement du manifeste, validation des signatures, ressources,
   dépendances et licence des polices.

**Sortie B :** matrice de types/capacités, schémas et contrats testables, avec
un exemple minimal de modèle et des diagnostics compréhensibles.

## C. Capacités et interactions — P1/P2

Pour chaque capacité retenue dans l’[inventaire](docs/capabilities-inventory.md),
définir une fois son contrat, sa disponibilité, ses cibles, son contenu principal,
ses annotations et ses paramètres. Dériver les contrôles de paramètres réellement
disponibles ; ne pas afficher un panneau vide ou un bouton actif sans action.

Réutiliser le cadre de widget et le panneau contextuel communs : insertion,
frontières, brouillon, focus, navigation, validation, annulation, suppression et
positionnement interligne. Tester dans le corps et dans les structures autorisées.
Les éléments de présentation ne font pas partie du document partagé.

Pour une dépendance Typst, conserver un adaptateur public stable et mettre à jour
l’inventaire des paquets, versions, ressources et licences. Vérifier la compilation
de l’export déplacé dans un environnement sans cache de paquets.

### C.1–C.4 — Ordre et périmètres validés le 3 novembre 2026

**Dépendance :** B.1 prépare les contrats, puis C.1 (renvois), C.2 (mathématiques),
C.3 (bibliographie du projet) et C.4 (bibliothèque personnelle). Préciser ensemble
les paramètres et les maquettes avant chaque implémentation. B.1 ne doit pas
attendre la réalisation complète de ces capacités.

- **C.1 — Cibles et renvois.** Séparer identité documentaire stable, éventuel
  label lisible et numéro composé par Typst. Référencer titres, images et tableaux,
  puis étendre le même contrat aux équations et théorèmes. Sélection de cible,
  badge et édition par le cadre commun ; préciser les collisions, copies et
  suppressions de cibles utilisées. Garder des espaces de noms sûrs pour les
  labels documentaires et les clés bibliographiques dans le Typst dérivé.
- **C.2 — Mathématiques.** Un contrat de formule avec source, langage Typst ou
  LaTeX, description accessible et présentation en ligne/en bloc. Les blocs
  peuvent être ciblés par C.1 ; les modèles règlent numérotation et présentation.
  Saisie de code et aperçu en premier, éditeur visuel ensuite, sans conversion
  bidirectionnelle implicite. MiTeX passe par un adaptateur Typst public stable ;
  inventorier et embarquer sa version et ses dépendances pour les fichiers et
  exports hors ligne. Définir le périmètre du code accepté et les diagnostics
  avant de relier la saisie au compilateur.
- **C.3 — Notices du projet.** Remplacer les multiples fichiers originaux par
  une bibliothèque Hayagriva unique, matérialisée dans le `.typsto` et l’export.
  Réutiliser la crate Hayagriva pour import et sérialisation ; évaluer la
  conversion BibLaTeX (champs, macros, relations, accents et contenu riche),
  signaler les pertes et arbitrer les collisions sans écrasement silencieux.
  Décider la conservation éventuelle des sources importées comme provenance,
  sans seconde autorité active. Préserver les identités/clés des notices et les
  liens des citations ; remplacer les cibles actuelles `file_id`/`key` par le
  contrat retenu, sans couche de compatibilité artificielle.
  Le gestionnaire utilise une grande modale commune : liste filtrée et recherche
  fuzzy titre/auteurs à gauche, formulaire par genre à droite, création par +.
  Les éditions restent des brouillons récupérables avant validation ; changement
  de notice ou fermeture propose enregistrer, abandonner ou continuer.
  « Créer et citer » valide la notice et l’insertion dans un seul lot annulable.
  La suppression d’une notice citée est protégée. UI, CLI et MCP partagent
  les validations et opérations ; aucun second formulaire pour l’insertion.
- **C.4 — Bibliothèque personnelle.** Recherche locale au projet avant recherche
  personnelle ; copie d’une notice lors de son utilisation, liens de provenance
  conservés et échanges de corrections explicites. Les deux stockages ont leurs
  révisions et protections contre l’écrasement ; aucune transaction atomique entre
  eux n’est présumée. Aucune modification personnelle ne réécrit silencieusement
  un projet. Le gestionnaire de C.3 est réutilisé avec un choix de bibliothèque.
  Les principes de citekeep (identités, clés locales stables, conflits explicites,
  planification avant écriture) servent de référence ; son moteur Python et son
  format BibTeX ne sont pas retenus implicitement. Évaluer leur réutilisation
  séparément, ainsi que le stockage et le format personnels.

Les contrats actuels de bibliographie restent exécutables jusqu’à leur
remplacement par C.3. Ces décisions décrivent le futur lot ; elles ne changent
pas à elles seules le format courant. Recherche en ligne et gestion de PDF ne
sont pas nécessaires à ce premier parcours.

**Sortie C :** contrat partagé GUI/CLI/MCP, recette clavier et aller-retour du
fichier ; absence de logique spécifique dupliquée dans les déclencheurs.

## D. Modèles et bibliothèque — P1

Définir les identités, versions, manifestes et paquets de ressources des modèles,
leur stockage global et la copie autonome dans chaque document. Distinguer
modèle installé et modèle embarqué ; aucune mise à jour distante implicite.

Faire découler création, sélection et commandes des catalogues disponibles.
Ajouter validation/import, provenance, retrait, aperçu et remplacement explicite.
Pour chaque type livré : modèle neutre utile, corpus de test, export hors ligne
et changement de modèle sans modification du contenu.

**Accessibilité des exports (C/D) :** partager les diagnostics de description
d’image entre les adaptateurs ; conserver et récupérer les brouillons incomplets,
mais bloquer leur export accessible tant que la description manque. Activer les
standards PDF dans l’export commun, vérifier un corpus avec veraPDF en CI et
compléter par une recette humaine des modèles (ordre de lecture, descriptions,
titres et tableaux), les contrôles automatiques ne suffisant pas à tout vérifier.

## E. Interface et réactivité — continu

Conserver les conventions validées des widgets/bandeaux, menus, actions et
raccourcis ; maqueter les extensions sur l’interface Tauri réelle. Examiner
focus, lecture d’écran, contraste, mouvement réduit, petite fenêtre et saisie IME.

**À reprendre — localisation des sélecteurs macOS (31 octobre 2026) :** le menu
Tauri est correctement traduit par Fluent, mais le sélecteur ouvert avec
`npm start` garde ses boutons anglais. Investigation reportée à la demande de
l’utilisateur ; [constats, essais retirés et piste dbv-typst-editor](docs/native-localization-investigation.md).
Comparer les parcours de développement et de bundle et le service natif réel.
Un contrôle de métadonnées ou du titre du panneau ne valide pas ses boutons.

**À faire — adaptation de la barre d’outils et de la palette au type (30 octobre 2026) :** filtrer
les capacités exposées à partir du catalogue du type actif et supprimer les
groupes sans entrée. Ne pas coder « article » ou « courrier » dans la
présentation : « Fin de lettre » disparaît automatiquement d’un article parce
que ses capacités P.-S./P.J. n’y sont pas disponibles. Distinguer cette absence
structurelle de l’indisponibilité contextuelle d’une capacité du type, qui reste
visible mais désactivée par le registre commun. Reconstruire la barre à la
création/ouverture ; vérifier le passage courrier → article → courrier et la
navigation au clavier sans groupe vide ni commande étrangère au type.
La palette réutilise ce même filtrage du catalogue et la même disponibilité
contextuelle, sans maintenir sa propre liste de capacités. Ses résultats
excluent les capacités étrangères au type actif ; les commandes générales de
l’application restent accessibles. Vérifier également les résultats de palette
lors du passage courrier → article → courrier.

**Séparation validée le 27 octobre 2026 :** l’accès **Projets** présente le
catalogue global (récents, épinglés, recherche, création et ouverture) ; l’accès
**Document** présente le plan, les références, les ressources, les versions et les relectures du
projet actif, selon son type. Le catalogue référence les fichiers ; retirer une
entrée ne les supprime pas. Préférences et bibliothèque globales restent
distinctes des données du projet.

Maquetter cette séparation sur la barre verticale existante ; un seul panneau
ouvert à la fois. **Versions** et **Relectures** sont des entrées distinctes.
La consultation de Versions et des propositions MCP partage une modale à 90 %,
avec onglets Contenu/Aperçu/Comparer et confirmations intégrées ; Relectures
garde les interactions prévues dans J. Le choix fenêtres/onglets pour
plusieurs projets ouverts reste lui aussi distinct de cette séparation.

Les tests graphiques Chromium/WebKit vérifient le frontend ; les recettes natives
doivent aussi couvrir WebKit macOS, WebView2 Windows et WebKitGTK Linux.
Vérifier les métadonnées de langue et les menus effectifs dans les parcours de
développement et d’application installée, sans confondre déclaration et traduction.

La [référence de performance](docs/tauri-preview-performance.md) sert de départ :
mesurer saisie, validation, compilation, transport, affichage et mémoire séparément.
Préserver la dernière page valide pendant un rendu, refuser les résultats périmés
et éviter une file de compilations obsolètes. Définir ensemble les budgets sur
documents courts, longs, illustrés et avec plusieurs participants.

**Budget relatif :** exprimer la cible comme un facteur (1,5 à 2, en p95) de la
compilation incrémentale de Typst seul sur le même document, avec une référence
distincte pour le natif et pour le WebAssembly, un plancher absolu pour les petits
documents et un suivi du surcoût par étape. La cible suit ainsi les évolutions de
Typst et détecte les régressions propres à typstOgraphe.

## F. Assistance ACP

**Orientation retenue :** client Rust agent-client-protocol, Codex via codex-acp
pour le premier parcours ; MCP reste le contrat documentaire. Aucun couplage à
ACP ou à un fournisseur d’agent dans le cœur documentaire.

Conserver la [découverte MCP progressive](docs/mcp-discovery.md) : vues compactes
partagées, détails canoniques à la demande, définitions de schémas accessibles
par référence et support de l’adaptateur distinct des permissions. Reprendre
ces générateurs pour ACP, sans ajouter de catalogue parallèle. Le contrat
CLI/cœur reste complet ; les vues MCP allègent sa présentation.

### F.1 Design à valider

Maquette du panneau ouvert depuis la barre latérale : question de hauteur
adaptative, réponse dessous, pied d’actions stable, historique consultable et
brouillon conservé. Une conversation libre n’impose pas de mode discuter/modifier.
L’emplacement, les dimensions et la place de l’aperçu restent à valider.

Échap masque sans terminer la session ; Tab garde la navigation standard.
L’envoi par Entrée et la saisie multiligne sont à préciser avec l’IME.
Une Entrée globale n’accepte jamais un lot de modifications.

### F.2 Processus, droits et session

Démarrage volontaire, choix de l’agent dans les préférences, disponibilité visible
et connexion au compte par l’outil de l’agent. Aucune bascule implicite vers une
API facturée. Vérifier versions, authentification, distribution et mise à jour
du client ACP, de l’adaptateur et de l’agent.

Créer et fournir automatiquement un raccordement MCP privé au document courant ;
ne pas demander une configuration manuelle à chaque invitation. Conserver les
outils documentaires seuls dans le premier périmètre, y compris face à la
configuration héritée de l’agent. Préférences globales et autres documents restent
hors du contexte autorisé ; document et sélection confiés sont explicités.

Une conversation par document et agent initialement ; aucun historique ajouté
au .typsto dans le premier périmètre. La conservation éventuelle par l’agent
doit être expliquée. Changer d’agent commence une nouvelle conversation.

Un seul lot en attente, consultation et acceptation/refus explicites, révision
revalidée à l’acceptation. Distinguer interruption, masquage et terminaison ;
terminer/fermer/remplacer révoque l’accès et retire les propositions en attente.
Une reprise ne renvoie ni une demande ni une édition automatiquement.

Le lot soumis prend la forme d’une paire privée base/candidat, avec garde et
opérations documentaires sous-jacentes, telle que définie dans A.4. La soumission
ne crée pas une version visible, n’ouvre pas une relecture J et ne sauvegarde
pas implicitement le projet. Accepter publie via le moteur commun, sous contrôle
de révision ; les écritures de fichiers gardent leurs permissions propres.
La conservation durable éventuelle après décision reste à préciser dans F,
sans introduire par défaut une nouvelle origine de version « agent ».

**Sortie F :** deux agents compatibles vérifiés sur discussion, lecture, proposition,
refus/acceptation, péremption, annulation, interruption et révocation. Ne pas
supposer que les fonctions, forfaits et quotas sont identiques entre agents.

### F.3 Cycle de vie et reçus des propositions

La comparaison humaine et ses reçus par groupes sont livrés : voir le
[contrat courant](docs/a4-comparison-contract.md). Il reste à préciser ensemble
la conservation durable après décision, les reçus supplémentaires requis par ACP
et le parcours de nouvelle proposition sur une base relue. Conserver les gardes,
les groupes dépendants indivisibles et l’autorité humaine ; ne pas construire
un second moteur ni accorder de droits implicites de sauvegarde/export.

## G. Collaboration et hébergement — P2

Étudier Hocuspocus et son connecteur avant de figer le transport distant.
Son protocole n’est pas interchangeable avec un simple serveur y-websocket.
Réutiliser le même document Yjs et l’historique par participant.

**Arbitrage à deux niveaux :** un arbitre local optimiste (frappe immédiate, sans
autorité sur les autres) et un arbitre d’autorité (hôte ou serveur) qui valide
avant admission et diffusion du candidat fusionné avec son état confirmé courant.
Réutiliser `EditingSession` et `SharedSession`, déjà dans `core`, et extraire la
coordination encore liée à Tauri en laissant fichiers, fenêtres et transport dans
les adaptateurs. La validation native convient au desktop ; évaluer compilation
`wasm32`, poids et performances pour un client navigateur avant de retenir WASM.
Comparer un serveur Rust/Yrs à Hocuspocus raccordé au même moteur Rust : appel
distant, module natif, WebAssembly ou processus séparé restent à évaluer.
Intercepter les messages avant application à l’état d’autorité, pas dans un
observateur après modification. Concevoir la reconstruction de l’état local et
la conservation du brouillon après refus distant, en suspendant les mises à jour
qui dépendent de la branche refusée. L’annulation Yjs n’efface pas cette branche
de l’historique CRDT.

Deux parcours à distinguer :

- **Session hébergée depuis le desktop :** processus serveur avec runtime embarqué,
  invitation limitée et révocable, droits, arrêt explicite ; tester d’abord le réseau
  local. Définir les effets de la veille, de la fermeture et de la perte de l’hôte.
- **Service d’organisation :** authentification, autorisation par document,
  stockage durable, ressources et disponibilité indépendante des postes utilisateurs.

Pour un lien Internet vers un poste, évaluer un relais/tunnel ou une autre
stratégie de traversée réseau ; ne pas supposer qu’ouvrir un port local suffit.
Pour Cloudflare, évaluer séparément un relais et un hébergement Workers/Durable
Objects : cycle de vie, état rechargé, persistance, connecteur, coûts et limites.
Le support d’un runtime ne prouve pas l’adéquation de tout le déploiement.

Sources de départ, pas choix d’infrastructure définitifs :
[Hocuspocus](https://tiptap.dev/docs/hocuspocus/server/usage),
[WebSockets et Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/websockets/).

Décider la propriété/sauvegarde des documents partagés, le transfert des images,
les modèles et schémas compatibles, le travail hors connexion et la réconciliation.
Préciser les droits et l’autorité pour les snapshots partagés, la capture d’une
révision cohérente, l’annonce des restaurations et la gestion des éditions
concurrentes ; conserver l’historique lors d’un retour à un état antérieur.
Prévoir un test de charge représentatif à cent utilisateurs sur plusieurs documents,
avec participants lents, collages volumineux, reconnexions et reprise du serveur.

## H. Distribution et vérification — continu

**Découpage validé le 2 novembre 2026 — publication des applications :**

H.1 dispose désormais de la chaîne de packaging/dépôt, de tests de provenance
et d'un essai natif macOS ARM64 ; voir les [résultats et limites](docs/releases.md#vérification-locale-du-lot-h1).
La matrice complète et le premier dépôt réel restent à qualifier en CI.

- **H.1 :** conserver la validation complète comme préalable, puis réutiliser
  le packaging Tauri pour macOS universel (`.dmg`), Linux x86_64 (`.deb`,
  AppImage) et Windows x64 (NSIS). Vérifier la concordance tag/versions/commit,
  inspecter et collecter les paquets, puis les joindre à une release unique en
  brouillon, avec empreintes SHA-256. N'accorder l'écriture GitHub qu'au job
  de dépôt des fichiers, une fois toutes les constructions réussies.
  La relance opère sur le tag immuable ; elle peut compléter un brouillon,
  mais ne modifie pas une release publiée. La publication est manuelle.
  Les constructions manuelles de branche restent des artefacts de test.
- **H.2 :** vérifier le contenu final puis l'installation et le fonctionnement
  des paquets sur les trois systèmes, avec modèles, polices, langues et
  compilation/export hors ligne. Distinguer inspection du paquet et recette
  de l'application réellement installée.
- **H.3 :** signature/notarisation, tap Homebrew après publication et manifeste
  de mise à jour signé ; comptes, clés, canaux et reprise sur échec à valider.
  Aucun contournement de sidecars n'est nécessaire pour le moteur Typst intégré.

Ne pas relancer les tests complets par format : une validation du commit suivie
des constructions/inspections natives et d'un dépôt central des fichiers suffit.
Le premier lot prépare les installateurs non signés, pas une mise à jour automatique.

**Jalon d’export volontaire à développer :** figer l’état ayant produit un PDF
réussi, puis proposer de créer sa version sans bloquer la rédaction ni l’export.
La capture ne doit pas prendre un état ultérieur ; annulation/échec ne déclenche
rien et le quota visible n’empêche pas l’export. Comparaison entre fichiers différée.

Préparer builds reproductibles, paquets et identité stable sur les trois systèmes,
signature/notarisation, associations de fichiers, invitations, mise à jour et retour
sur échec. Vérifier les ressources réellement embarquées et leurs licences.

Maintenir CI et couverture Rust/web, tests de contrats, recettes d’archives/exports,
contrôles des chemins et limites d’import, tests natifs et mesures de performance.
Prévoir corpus de documents réels, documentation utilisateur et diagnostics de
support sans diffusion implicite du contenu des documents.

## Condition de fin de lot

Le comportement et ses limites sont validés, le parcours utilisateur fonctionne,
les changements sont vérifiés et documentés au bon endroit. Une tâche terminée
sort de la roadmap ; ses preuves et décisions vont dans une note ou dans Git.
Une nouvelle dépendance, un changement de contrat ou un choix graphique structurant
revient dans la discussion avant d’engager l’implémentation concernée.

## J. Relecture par suggestions — P2

Représenter les suggestions par des annotations ancrées séparées du contenu,
applicables par les commandes gardées existantes. Conserver les outils dédiés de
relecture ; l’interface commune d’A.4 sert aux snapshots et propositions MCP,
sans imposer sa présentation à J. Mutualiser les composants pertinents ; le
moteur de décisions locales d’A.4 préserve l’atomicité des opérations liées,
et F.3 complète le protocole MCP de ce moteur. La première
relecture humaine textuelle ne dépend pas d’ACP. Distinguer aperçu confirmé et
aperçu candidat explicitement signalé ; revérifier le contenu cible avant toute
acceptation si l’auteur l’a modifié.

A.4 prépare la référence de chaque relecture : créer automatiquement un snapshot
au démarrage d’une nouvelle relecture, le lui rattacher et le conserver inchangé
pendant toute sa durée, en empêchant sa suppression tant qu’elle est en cours.
La reprise ne recrée pas de snapshot ; aucun déclencheur heuristique n’est prévu.
Cette référence est interne à Relectures, hors liste Versions et quota des
100 versions affichées. Son cycle de vie relève de J, sous les limites de volume
du projet ; ne pas dériver son interface des actions de comparaison de snapshots.
La conservation des suggestions, l’effet d’une restauration et la rétention de la
référence après clôture restent à préciser ensemble dans J. Le calcul des
différences entre snapshots et les suggestions ancrées ont des rôles distincts ;
la relecture ne se
réduit pas à un retour global à une ancienne version.
