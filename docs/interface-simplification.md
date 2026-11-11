# Simplification et fluidification de l’interface — Chantier E.2

Document de cadrage établi le **8 novembre 2026** à l’issue de l’évaluation complète de
l’interface Web/Tauri (`app/src/`). Il définit le plan de simplification ergonomique à
mener dans le chantier **E** avant d’étendre les modèles (**D**), l’assistance (**F**) et la
relecture par annotations (**J**).

Conformément à la méthode du projet, les nouvelles surfaces (menu contextuel d’objet,
pop-up de sélection fuzzy, gestionnaire bibliographique unifié) seront validées sur
maquette interactive avant modification des contrôleurs de production.

---

## 1. Diagnostic : pourquoi l’interface actuelle paraît complexe

L’architecture actuelle repose sur un composant unique de bandeau interligne ou d’en-tête
(`contextPanel` dans `app/src/context-panel.ts` et `BandHost` dans `app/src/band-layout.ts`)
utilisé indistinctement pour toutes les interactions, ainsi que sur des fenêtres `<dialog>`
empilées pour la bibliographie et les métadonnées. Ce choix initial entraîne cinq frictions
majeures au quotidien :

1. **Trop de clics et de confirmations pour des actions réversibles** :
   - Supprimer un bloc (`widgetFrame`) ou appuyer sur `Backspace` après un badge en ligne
     (`inline-objects.ts`) ouvre un bandeau de confirmation (*« Supprimer le bloc »*,
     *« Supprimer la citation »*) exigeant un second clic sur `Supprimer`, alors que
     l’historique partagé Yrs permet d’annuler immédiatement par `Cmd/Ctrl+Z` et que le
     raccourci `Mod+Backspace` supprime déjà sans confirmation.
   - Insérer un renvoi interne (`cross-reference-panel.ts`) ou une citation simple sans
     numéro de page (`citation-panel.ts`) impose de sélectionner la cible puis de cliquer
     explicitement sur `Valider`.
   - Convertir une liste à puces en liste numérotée via le bloc demande 3 clics (*Roue
     dentée → segment → Valider*).
2. **Sauts de mise en page (*layout shifts*) systématiques** :
   - La moindre micro-action (corriger une faute d’orthographe dans `proofing.ts`, ajouter
     une ligne ou une colonne de tableau via `.table-handle` dans `table-panel.ts`) écarte
     les lignes du paragraphe ou pousse tout le tableau vers le bas en réservant un
     `.band-slot` / `.interline-band-gap`, puis referme le bandeau dès le premier clic.
3. **Contrôles morts ou dupliqués sur les blocs** :
   - L’icône de roue dentée (*Paramètres*) est affichée mais désactivée en permanence sur
     les blocs dépourvus d’options propres (`quote`, `descriptionList`, `postscript`,
     `attachment`).
   - Sur le bloc d’équation (`mathBlock`), l’identifiant `eq:` est présent à la fois dans
     la barre d’en-tête `.widget-bar` (`node-attribute-field.ts`, validation directe) et en
     doublon dans le bandeau `Paramètres` (`properties.ts`, validation par bouton).
4. **Trois paradigmes d’édition concurrents dans l’en-tête documentaire (`#metadata-content`)** :
   - Modification directe sans bouton dans l’onglet *Général* (`metadata-fields.ts`).
   - Accordéons `<details>` dans *Titres* et *Résumés* (`metadata-collections.ts`) mêlant
     édition directe des fiches existantes, brouillon inline avec `Valider / Annuler` à
     l’ajout (`+`), confirmation inline de suppression et 5 mini-boutons par ligne.
   - Cartes ouvrant une modale `<dialog>` centrée dans *Auteurs* et *Affiliations*, mais
     avec confirmation de suppression inline dans la carte.
   - Onglet *Bibliographie* (`bibliography-panel.ts`) servant uniquement de tremplin quasi
     vide vers un bouton *« Gérer les références »*.
5. **Empilement de fenêtres modales (« poupées russes »)** :
   - Depuis le bandeau de citation, cliquer sur *Rechercher en ligne* ouvre la grande
     modale `#bibliography-manager` (`92vw × 90vh`) puis empile immédiatement par-dessus
     la modale `#bibliography-online` (`530px`), et potentiellement une troisième modale
     pour l’arbitrage d’import (`#bibliography-acquisition-review`) ou la sortie d’un
     brouillon modifié (`#bibliography-leave`).

---

## 2. Nouvelle grammaire des surfaces contextuelles dans l’éditeur

Au lieu de forcer toutes les interactions dans un bandeau interligne pleine largeur,
l’éditeur distingue désormais **trois surfaces proportionnées à la tâche** :

| Surface | Déclencheur | Usage | Règle d’interaction |
| :--- | :--- | :--- | :--- |
| **1. Menu contextuel d’objet** *(popover flottant d’actions)* | • Clic gauche sur une poignée (`.table-handle`, bouton `⋯`, icône de bloc)<br>• Clic droit ciblé sur un objet ou une faute (`.spelling-error`, `.inline-object`, `.table-handle`, `.widget-bar`)<br>• Raccourci `Ctrl/Cmd+Entrée` / `Maj+F10` / touche Menu | • **Orthographe** : suggestions + ajout au dictionnaire + ignorer<br>• **Tableaux** : insérer/supprimer lignes et colonnes, basculer ligne/colonne d’en-tête<br>• **Blocs** : convertir liste puces ↔ numérotée, supprimer le bloc<br>• **Badges / Liens** : modifier, aller à la cible / notice, supprimer | Flottant (aucun décalage du document). **1 clic = 1 action immédiate** (annulable par `Cmd/Ctrl+Z`). |
| **2. Pop-up de sélection / saisie** *(popover flottant avec champ)* | • Bouton de barre d’outils ou raccourci clavier<br>• Clic gauche sur un badge de citation, de renvoi ou un lien<br>• Frappe de `@@` pour les citations ou `&&` pour les renvois | • **Citations** : recherche floue (*fuzzy*) + sélection directe ou multiple (`+`) + supplément de page<br>• **Renvois internes** : recherche floue (*fuzzy*) + choix des composantes<br>• **Liens** : saisie, modification et retrait<br>• **Création de tableau** : sélecteur rapide de grille ou dimensions compactes | Flottant, ancré sous le curseur ou l’élément ciblé. **`Entrée` ou clic sur un résultat valide immédiatement** le cas simple. |
| **3. Bandeau / Zone inline** *(pleine largeur de colonne)* | • Insertion ou clic sur un badge de note de bas de page<br>• Paramètres d’accessibilité longs (ex. description `alt` multiligne d’image ou d’équation) | • **Notes de bas de page** (rédaction de prose enrichie sur plusieurs phrases)<br>• **Description accessible (`alt`)** lorsqu’elle n’est pas directement intégrée au pied du bloc | Conserve l’architecture actuelle `BandHost` avec transition de hauteur adoucie. |

### Politique de clic droit (`contextmenu`) vis-à-vis de WebKit / Chromium / WebKitGTK

Pour préserver les services natifs du système sur le texte courant (*Couper, Copier,
Coller* sans alerte de permission presse-papiers WebKit, *Rechercher dans le dictionnaire /
Look Up* et *Traduire* sous macOS) tout en offrant un clic droit pertinent sur les objets
Typstographe (**Choix A retenu**) :

- **Sur la prose courante et les sélections de texte** : l’événement `contextmenu` n’est
  pas intercepté ; le WebView ouvre son menu natif.
- **Sur les objets structurés et annotations Typstographe** (`.spelling-error`,
  `.inline-object`, `.table-handle`, `.widget-bar`) : `event.preventDefault()` bloque le
  menu WebView muet et ouvre exactement le même composant de popover HTML qu’au clic
  gauche.
- Le même composant fonctionne ainsi à l’identique dans Tauri (macOS, Windows, Linux) et
  dans les recettes navigateur (`browser-test`).

---

## 3. Panneau flottant des renvois, des citations et des liens

### 3.1 Renvois internes (`cross-reference-panel.ts` / `cross-reference-index.ts`)

- **Indexation floue pondérée** : remplacer le filtre par sous-chaîne stricte sur `title`
  par un score *fuzzy* portant sur :
  1. l’alias explicite de la cible (ex. `eq:euler`, `bayes`),
  2. le libellé composé par Typst (`ResolvedReference.display`, ex. `Figure 2`,
     `Tableau 1`, `Section 1.2`) et le type de bloc (`fig`, `tab`, `eq`, `sec`),
  3. l’intitulé du titre, la légende ou le texte alternatif (`title` / `alt`).
- **Insertion en 1 geste** : dès l’ouverture du pop-up, le premier résultat pertinent est
  présélectionné ; appuyer sur `Entrée` ou cliquer sur une ligne insère immédiatement le
  renvoi et rend le focus à l’éditeur.
- **Options de composantes (`Libellé complet` / `Page`)** : accessibles sous forme d’un
  commutateur compact en pied de pop-up (ou en cliquant sur le badge une fois inséré),
  sans bloquer l’insertion rapide.

### 3.2 Citations bibliographiques (`citation-panel.ts`)

- **Indexation floue multi-champs** : tolérer les fautes de frappe et les requêtes
  croisant `key`, `authors`, `year` (y compris année sur 2 chiffres) et `title` (ex.
  `dupont 23` ou `bourbaki ens`).
- **Séparation du cas simple et du cas composé** :
  - **En création rapide** : `Entrée` ou clic principal sur une notice insère
    immédiatement la citation simple `(Auteur, Année)` et referme le pop-up.
  - **Pour une citation multiple ou paginée** : un bouton `+` (ou `Shift+Entrée`) ajoute
    la notice au groupe en cours dans le pop-up sans le fermer ; cliquer sur un badge de
    citation existant rouvre le pop-up directement sur les notices citées pour renseigner
    les pages (`p. 42`), réordonner les entrées ou basculer entre *Standard* et *Dans la
    phrase*. Une fois la composition ouverte, `Entrée` depuis la recherche ajoute la
    notice active au groupe. `Insérer` ou `Appliquer` publie la citation en une seule
    édition et `Échap` abandonne le brouillon.

La frappe de `@@` ouvre les citations et `&&` ouvre les renvois internes, lorsque la
commande correspondante est disponible. `Échap` annule les deux frappes. `Entrée` écrit
les deux signes tant qu’aucune recherche ou navigation n’a commencé, puis reprend son
rôle de validation. Un raccourci annulé laisse l’indicateur d’enregistrement dans son
état précédent. Une frappe simple et le collage conservent le texte littéral.

### 3.3 Liens (`link-panel.ts`)

- Le bouton *Lien* et `Ctrl/Cmd+K` ouvrent le même panneau flottant que les
  renvois et les citations, dans le corps du document et dans les champs riches
  de l’en-tête. Le panneau s’ancre à la sélection, au curseur ou au lien ciblé
  et conserve la disposition du texte.
- Sur une sélection, l’adresse s’applique au texte sélectionné. Au curseur,
  le texte du lien est facultatif. L’adresse sert de libellé par défaut.
- Un clic sur un lien existant rouvre le panneau avec l’adresse préremplie.
  *Appliquer* modifie cette adresse. *Retirer le lien* conserve le texte visible
  et le retrait peut être annulé avec `Ctrl/Cmd+Z`.
- `Entrée` valide la saisie et `Échap` l’abandonne. Après fermeture au clavier,
  le focus revient à l’éditeur, avec la sélection ou le curseur approprié.
  La reprise après fermeture restaure l’adresse et le texte saisis en brouillon.

---

## 4. Allègement des blocs et suppression directe avec `Undo`

1. **Suppression directe sans bandeau de confirmation** :
   - Cliquer sur la corbeille d’un widget de bloc supprime immédiatement le bloc via la
     commande gardée existante, avec annulation complète par `Cmd/Ctrl+Z` (et notification
     discrète dans la barre d’état).
   - Dans le corps du texte, appuyer une première fois sur `Backspace` (ou `Delete`) au
     contact d’un badge en ligne (`.inline-object`) le **sélectionne visuellement** ;
     appuyer une seconde fois le **supprime directement** sans ouvrir de bandeau de
     confirmation.
2. **Nettoyage de la barre d’en-tête `.widget-bar`** :
   - **Masquer le bouton de paramètres (roue dentée)** sur les blocs qui n’ont aucun
     paramètre externe (`quote`, `descriptionList`, `postscript`, `attachment`), au lieu
     d’afficher une icône désactivée en permanence.
   - **Supprimer le doublon d’alias sur `mathBlock`** : conserver le champ `eq:` dans
     `.widget-bar` (`nodeAttributeField`) et ne plus le répéter dans le panneau de
     paramètres.
   - **Remplacer les paramètres à 2 choix** (ex. `bulletList` ↔ `orderedList`, cases à
     cocher d’en-tête de tableau) par des bascules directes dans le menu du bloc ou de la
     poignée de tableau, sans bouton `Valider`.

---

## 5. Harmonisation de l’en-tête documentaire et des modales

### 5.1 Unification des onglets de métadonnées (`shell-metadata.ts`, `metadata-collections.ts`)

- **Édition commune des collections (*Titres*, *Résumés*, *Auteurs*, *Affiliations*)**
  - Une carte ouvre la modale d’édition. Le bouton `+` centré en bas ouvre le même
    formulaire pour une nouvelle fiche. `Échap` annule la saisie et rend le focus à
    son déclencheur. La poignée permet de réordonner à la souris ou au clavier.
  - La corbeille retire directement une fiche autonome, avec annulation dans
    l’historique du document. Une confirmation précise l’effet d’une suppression
    sur les associations d’une autre fiche ou sur les titres, le résumé et les mots-clés
    d’une même langue. La fiche de la langue principale est protégée.
- **Onglet *Bibliographie* (`bibliography-panel.ts`)** :
  - L’onglet présente le style bibliographique et le bouton *Gérer les références*.
    Le panneau **Document** donne aussi accès directement aux notices.

### 5.2 Désimbrication des modales bibliographiques (`bibliography-manager.ts`, `bibliography-online.ts`)

- `#bibliography-manager` réunit la bibliothèque, la recherche en ligne et la revue
  d’acquisition ou d’import dans une seule fenêtre. Depuis le sélecteur de citations,
  *Rechercher en ligne* ouvre directement la vue de recherche.
- Les confirmations d’abandon ou de suppression apparaissent au-dessus du formulaire de droite.

### 5.3 Organisation globale de la fenêtre (`shell-layout.ts`, `shell-panels.ts`)

- La **palette de commandes** (`ui.palette`) s’ouvre dans une modale centrée en haut de
  la fenêtre. `Ctrl/Cmd+Maj+P` place le focus dans la recherche. Les flèches parcourent
  les résultats, `Entrée` exécute la commande choisie et `Échap` rend le focus à son point de départ.
- **Séparation *Projets* / *Document* dans le rail latéral** : *Document* regroupe les
  accès liés au projet actif (*Plan, Bibliographie, Ressources, Versions, Relectures*).
  Les rubriques dépliables s’ouvrent indépendamment. *Projets*, *Préférences* et
  *Assistance* restent des accès de la barre latérale.

---

## 6. Tableau récapitulatif (`Before / After / Why`)

| Before | After | Why |
| :--- | :--- | :--- |
| **Suppression d’un bloc ou d’un badge inline** : ouvre un bandeau de confirmation exigeant un 2e clic sur `Supprimer`. | **Suppression directe** au clic sur la corbeille (et sélection au 1er `Backspace` puis suppression au 2e pour un badge), annulable par `Cmd/Ctrl+Z`. | Toute action immédiatement réversible par `Undo` doit s’exécuter sans boîte de confirmation. |
| **Correction orthographique (`proofing.ts`) et poignées de tableau (`table-panel.ts`)** : ouvrent un bandeau `.context-band` qui décale le texte ou le tableau. | **Menu contextuel flottant (popover HTML)** au clic gauche sur la poignée et au clic droit ciblé sur la faute ou l’objet. | Zéro saut de mise en page (*layout shift*), 1 clic = 1 action, et conservation du menu natif WebKit sur le texte courant. |
| **Insertion de renvoi (`cross-reference-panel.ts`) et de citation (`citation-panel.ts`)** : bandeau interligne + recherche par sous-chaîne stricte + clic obligatoire sur `Valider`. | **Pop-up flottant avec recherche floue (*fuzzy*)** ; `Entrée` ou clic insère immédiatement le badge dans le cas nominal. | Passe de 3–4 actions avec décalage du paragraphe à 1 geste fluide sans déplacement du texte. |
| **Roue dentée (`Paramètres`) sur tous les blocs** : affichée mais grisée (`disabled`) sur `quote`, `descriptionList`, `postscript`, `attachment`, et dupliquant `alias` sur `mathBlock`. | **Masquer la roue dentée** lorsqu’aucun paramètre externe n’existe, et garder `eq:` uniquement dans l’en-tête du bloc. | Supprime les boutons morts et la redondance entre l’en-tête et le bandeau. |
| **En-tête documentaire (`metadata-collections.ts`)** : 3 modes de validation concurrents, 5 mini-boutons par ligne d’accordéon et onglet *Bibliographie* quasi vide. | **Cartes communes**, modale d’ajout et d’édition, poignée et corbeille. Accès direct aux références. | Réduit l’encombrement de l’en-tête et rend explicites les suppressions qui touchent plusieurs fiches ou onglets. |
| **Parcours bibliographique (`bibliography-manager.ts` + `bibliography-online.ts` + `review-dialog.ts`)** : jusqu’à 3–4 `<dialog>` modales superposées. | **Gestionnaire bibliographique à niveau unique** intégrant la recherche en ligne et la revue d’import comme vues internes. | Élimine l’effet « poupées russes » et garde un cadre visuel stable. |

---

## 7. Découpage proposé pour la mise en œuvre (lots courts E.2)

1. **Lot E.2a — Popovers de l’éditeur et actions directes** :
   - Suppression directe des blocs et suppression en deux temps (`Backspace` × 2) des
     badges inline, retrait des roues dentées désactivées et du doublon `alias` sur
     `mathBlock`.
   - Composant de **menu contextuel d’objet** (clic gauche sur poignées/blocs + clic droit
     ciblé sur `.spelling-error`, `.inline-object`, `.table-handle`, `.widget-bar`)
     appliqué à l’orthographe, aux poignées de tableaux et à la conversion Puces ↔ Numérotée.
     Depuis une cellule, le menu affiche les groupes Ligne et Colonne.
2. **Lot E.2b — Panneau flottant des renvois, des citations et des liens — terminé**
   - Pop-up flottant avec recherche floue pondérée pour les renvois internes et les
     citations bibliographiques, validation directe sur `Entrée`/clic et édition rapide
     au clic sur un badge existant.
   - Renvois internes : le sélecteur conserve la ligne de texte et cherche aussi dans les
     libellés et les pages du dernier aperçu Typst. `$` limite la recherche aux équations.
     Les flèches parcourent les résultats depuis le champ de recherche et `Échap` rend le
     curseur à l’éditeur. `Appliquer` reste disponible pour modifier un badge existant.
   - Citations bibliographiques : même panneau flottant et même retour au curseur. La
     composition affiche les références, les localisateurs et la forme de la citation
     après `+`, `Maj+Entrée` ou l’ouverture d’un badge existant.
   - Liens : insertion sur une sélection ou au curseur, modification et retrait
     annulable via le même composant, selon le [parcours des liens](#33-liens-link-panelts).
   - Recette à la souris et au clavier dans Chromium et WebKit, y compris la saisie
     dans la modale de résumé, la reprise d’un lien en brouillon et les raccourcis
     `@@` et `&&`.
3. **Lot E.2c — Gestionnaire bibliographique et palette centrée — terminé**
   - La recherche en ligne et les arbitrages d’acquisition sont intégrés au gestionnaire.
   - La palette s’ouvre en haut de la fenêtre. La recherche, le choix au clavier et le
     retour du focus avec `Échap` ont été vérifiés sous Chromium et WebKit.
4. **Lot E.2d — Harmonisation des en-têtes de métadonnées et accès *Projets / Document*** :
   - Cartes et modales communes pour les collections de métadonnées (*Titres, Résumés,
     Auteurs, Affiliations*), avec suppression directe annulable pour les fiches autonomes.
   - Panneaux *Projets* et *Document* dans les deux modes du rail, avec accès direct aux
     notices bibliographiques depuis *Document*.
