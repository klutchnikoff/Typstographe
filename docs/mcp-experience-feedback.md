# Retour d'expérience et pistes d'amélioration du serveur MCP de Typstographe

Ce document synthétise les enseignements tirés d'un test complet « à froid » du serveur MCP de **Typstographe** (en mode attaché, sans aucune lecture préalable du code source du dépôt), au cours duquel un article mathématique complet (construction de $\mathbb{R}$ par les suites de Cauchy de $\mathbb{Q}$, unicité à unique isomorphisme près et démonstrations du théorème des valeurs intermédiaires) a été rédigé et soumis via `proposals.submit`.

---

## 1. Bilan général : ce qui fonctionne déjà très bien

1. **Découverte progressive (*progressive disclosure*) très efficace** :
   - Dès `initialize`, le champ `instructions` oriente immédiatement vers `typstographe://overview`, `typstographe://guide`, `commands.list` et `capabilities.describe`.
   - La séparation entre **index compacts** (`commands.list`, `typstographe://overview`) et **schémas détaillés à la demande** (`capabilities.describe`) permet à un agent de comprendre l'architecture complète en 2 ou 3 requêtes sans saturer sa fenêtre de contexte.
2. **Modèle mental clair et sans ambiguïté** :
   - La distinction entre **outils directs** (`execution.direct_tool: true`) et **étapes de proposition** (`execution.proposal_step: true`, passées dans `steps` de `proposals.submit`) est explicite dans `commands.list`.
   - Les invariants structurels sont clairement posés : prose littérale sans balisage Typst/Markdown, marques explicites (`bold`, `italic`, `link`), formules mathématiques en Typst pur (ou MiTeX) sans délimiteurs `$`, indexation UTF-16 et verrouillage optimiste via `DocumentRef` (`id` + `guard.revision`).
3. **Exemples exécutables dans `capabilities.describe`** :
   - Les exemples fournis sur `math.inline`, `math.block`, `block.bullet`, `block.numbered`, `block.description`, `block.quote` et `insert.reference` montrent directement la structure exacte des nœuds `Node` attendus par `block.insert` / `block.splice` / `inline.replace`.

---

## 2. Problèmes repérés lors du test

### 2.1. Asymétrie de validation Typst entre `proposals.submit` et l'application dans l'UI

- **Symptôme observé** :
  - Lors de la première soumission, une formule `mathInline` contenait `u notin cal(N)` (syntaxe LaTeX au lieu de la syntaxe Typst `u in.not cal(N)`).
  - Le serveur MCP a accepté la proposition (`"ok": true`, `"status": "pending"`) car la structure JSON de l'arbre était valide.
  - En revanche, dans l'interface graphique, lorsque l'utilisateur a accepté le changement et cliqué sur **« Appliquer 1 changement »**, le compilateur Typst a levé l'erreur :
    > `Typst : unknown variable: notin`
  - **Blocage** : l'interface refuse alors d'appliquer la proposition, mais ne permet pas non plus à l'utilisateur de corriger la formule à la volée avant application, ni d'appliquer le texte pour corriger l'erreur mathématique dans un second temps.

- **Améliorations souhaitables** :
  1. **Validation de la compilation Typst dès `proposals.submit` (côté MCP)** :
     - Compiler le brouillon résultant (ou chaque nœud `mathInline` / `mathBlock`) lors de l'appel à `proposals.submit`.
     - Si une formule contient une erreur de compilation Typst (`notin`, `cap` au lieu de `inter`, parenthèse/crochet non apparié, etc.), **refuser `proposals.submit`** en renvoyant une erreur structurée précise (chemin du bloc/nœud mathématique fautif + diagnostic Typst).
     - *Bénéfice* : l'agent corrige immédiatement sa syntaxe Typst en quelques secondes avant même que l'humain ne soit sollicité dans le comparateur.
  2. **Souplesse dans le comparateur (côté UI)** :
     - Étudier s'il faut permettre dans l'interface soit d'éditer un bloc proposé avant de l'appliquer, soit d'accepter un changement même lorsqu'une formule mathématique locale contient une erreur de syntaxe à corriger dans l'éditeur.

---

### 2.2. Visibilité dans l'UI d'une proposition invalidée ou obsolète (`revision` dépassée)

- **Symptôme observé** :
  - Alors qu'une proposition ciblait `revision: 5`, le document est passé à `revision: 16` (ou la proposition est passée en `"status": "rejected"` côté serveur).
  - Dans l'interface, la proposition restait affichée dans le comparateur mais avec le bouton **« Appliquer 1 changement »** grisé et non cliquable, sans message explicite indiquant si l'utilisateur devait d'abord cocher « Accepter » sur le groupe de changements ou si la proposition était devenue obsolète/rejetée suite à un changement de révision.

- **Améliorations souhaitables** :
  1. **Côté UI** : afficher clairement la raison pour laquelle le bouton « Appliquer » est désactivé (*« Aucun changement sélectionné »* vs *« Proposition obsolète : le document a été modifié depuis sa soumission »* vs *« Proposition refusée »*).
  2. **Côté MCP (`context.get` / `proposals.get`)** : permettre d'appeler `proposals.get` sans paramètre `proposal` (ou exposer l'identifiant et le statut de la proposition courante dans `context.get` / `document.inspect`) afin qu'un agent qui se reconnecte puisse inspecter ou annuler sa proposition en cours même s'il n'en a plus l'UUID en mémoire.

---

### 2.3. Mathématiques en UTF-8 (`√2`, `ℝ`, `ℚ`, `≤`, `ₙ`) vs `mathInline`, titres et gras

- **Symptôme observé** :
  - Dans le corps des paragraphes, l'agent a bien utilisé des nœuds `mathInline` et `mathBlock` en syntaxe Typst.
  - En revanche, dans les **titres (`heading`)** et dans quelques **amorces de listes en gras**, l'agent a utilisé des caractères mathématiques Unicode en plein texte (`Existence de √2 et des racines n-ièmes dans ℝ`, `Définition 2.1 — Suite de Cauchy dans ℚ`, `Preuve de l'inégalité f(c) ≤ k`, `(aₙ)`).
  - Le rendu typographique de ces caractères UTF-8 dans la police de texte (en particulier le radical `√2` sans barre supérieure ou les indices Unicode `ₙ`) est nettement inférieur au rendu mathématique Typst.

- **Pourquoi l'agent a contourné `mathInline` par de l'UTF-8** :
  1. Dans les **titres (`heading`)**, l'agent a hésité à insérer des nœuds `mathInline` par crainte qu'ils ne soient pas supportés dans les titres (table des matières, ancres, références croisées).
  2. Dans les **amorces de listes en gras**, comme `mathInline` ne porte pas de marque `bold` (et ne doit d'ailleurs pas en porter !), l'agent a voulu éviter de découper son segment gras autour d'une formule et a tout écrit en texte gras UTF-8.

- **Position retenue / recommandation d'architecture : interdire les mathématiques dans les titres (`heading`) et dans le gras (`bold`), et verrouiller l'échappatoire UTF-8** :

  1. **Pourquoi interdire `mathInline` au milieu d'un texte en gras (`bold`)** :
     - **Raison sémantique** : en mathématiques, la graisse n'est pas un ornement typographique mais un opérateur sémantique ($x$ est un scalaire, $\mathbf{x}$ ou `bold(x)` est un vecteur ; $A$ et $\mathbf{A}$ ne désignent pas le même objet ; $\mathbb{R}$ possède déjà sa propre graisse *blackboard bold*). Appliquer un gras ambiant à une formule falsifierait son sens mathématique ; ne pas l'appliquer crée une rupture visuelle disgracieuse (une formule « maigre » trouant un segment en gras).
     - **Alternative éditoriale propre** : les amorces en gras (en début d'item de liste ou d'énoncé) doivent rester purement nominales (**« Existence des radicaux : »**, **« Théorème — Continuité uniforme. »**) ou utiliser une liste de définitions (`block.description`), et les formules doivent apparaître dans la phrase en romain qui suit.

  2. **Pourquoi interdire `mathInline` dans les titres (`heading`)** :
     - **Raison typographique** : dans les modèles visuels (où les titres de niveau 1 et 2 sont en gras et le niveau 3 en italique), insérer une formule mathématique dans un titre reproduit le conflit de graisse/style ci-dessus.
     - **Raison technique propre à Typstographe** : garder les `heading` strictement textuels garantit que les titres extraits par `references.list` (pour les renvois croisés `insert.reference`), la table des matières (`outline()`) et les signets PDF (*PDF bookmarks*) restent de simples chaînes de caractères propres et prévisibles.
     - **Raison éditoriale** : dans la tradition de l'édition mathématique soignée (Bourbaki, Rudin, Serre, Dieudonné), les titres nomment le **concept** ou le **rôle logique** en toutes lettres plutôt que de juxtaposer des symboles :
       - *« 1. Des lacunes du corps des rationnels à la complétion métrique »* plutôt que *« 1. Des lacunes de $\mathbb{Q}$ à la complétion »* ;
       - *« 2.2. Idéal des suites négligeables et passage au corps quotient »* plutôt que *« 2.2. Le corps quotient $\mathbb{R} = \mathcal{C}/\mathcal{N}$ »* ;
       - *« Étape 2 — Majoration de la valeur au point limite »* plutôt que *« Étape 2 — Preuve de $f(c) \le k$ »*.

  3. **La condition indispensable : le « double verrou » contre l'échappatoire UTF-8** :
     - Comme l'a montré notre test, si l'on interdit `mathInline` dans les titres ou le gras *sans* interdire les caractères mathématiques Unicode dans les nœuds `text`, un modèle de langage contournera la règle en écrivant `ℝ`, `ℚ`, `√2`, `≤`, `ₙ` en UTF-8.
     - Il faut donc associer deux règles complémentaires dans le validateur (`proposals.submit` / `document.validate`) :
       - **Verrou 1 (structurel)** : les `heading` n'acceptent que des nœuds `text` (pas de `mathInline`), et un `mathInline` ne peut ni porter la marque `bold`/`italic` ni être inséré à l'intérieur d'un intitulé en gras.
       - **Verrou 2 (lexical sur les nœuds `text`)** : tout caractère Unicode appartenant aux plages de symboles mathématiques ou d'indices/exposants (`ℝ`, `ℚ`, `ℤ`, `ℕ`, `ℂ`, `𝒞`, `𝒩`, `√`, `≤`, `≥`, `≠`, `∈`, `∉`, `⊂`, `⊆`, `∀`, `∃`, `∞`, `→`, `↦`, `₀–₉`, `ₙ`, etc.) est **refusé dans un nœud `text`** avec un message d'erreur explicite guidant l'agent :
         > `mathematical_unicode_in_text: Do not use Unicode mathematical symbols in plain text. In body prose, use a mathInline node with Typst syntax. In headings or bold labels, write the concept in full words (e.g. "corps des réels" instead of "ℝ", "racine carrée de deux" instead of "√2").`

---

### 2.4. L'anti-pattern Markdown « `bulletList` + amorce en gras » au lieu de `descriptionList`

- **Symptôme observé** :
  - À trois reprises dans l'article (liste des lacunes de $\mathbb{Q}$, liste des propriétés de $\Phi$, liste des applications du théorème des valeurs intermédiaires), l'agent a utilisé une liste à puces (`bulletList`) dont chaque item commence par un nœud `text` en gras suivi de deux-points (`t("Image continue d'un intervalle : ", ["bold"])`) au lieu d'utiliser l'environnement dédié `block.description` (`descriptionList` $\rightarrow$ `descriptionItem` $\rightarrow$ `descriptionTerm` + `descriptionDefinition`).

- **Analyse des causes et pourquoi c'est une mauvaise pratique dans Typstographe** :
  1. **Un biais hérité de Markdown** : comme CommonMark n'a pas de syntaxe native pour les listes de définitions, les LLM sont fortement entraînés à les simuler par `- **Terme :** définition...` et transposent mécaniquement ce patron dans l'arbre JSON.
  2. **Rupture de la séparation sémantique / présentation** : le rôle fondamental de Typstographe est que l'auteur exprime la structure sémantique (`descriptionTerm` / `descriptionDefinition`) et que le **modèle visuel** décide de la mise en forme du terme (gras, petites capitales, italique, séparateur deux-points ou tiret cadratin, retrait). Coder en dur du gras et ` : ` dans une `bulletList` court-circuite le modèle visuel.
  3. **Cause directe du mélange « gras + maths »** : c'est précisément en voulant écrire une fausse entrée de description en gras au début d'un `listItem` que l'agent a été tenté d'écrire `Existence de √2 et des racines n-ièmes dans ℝ :` en texte gras UTF-8. Avec une vraie `descriptionList` où `descriptionTerm` est un intitulé nominal court (sans `mathInline` ni `marks`, par exemple *« Existence des radicaux »*), la séparation entre l'intitulé et le contenu mathématique de la `descriptionDefinition` devient naturelle et automatique.

- **Améliorations souhaitables** :
  1. **Dans `typstographe://guide` et dans la description de `block.bullet` / `block.description`** :
     - Ajouter la règle explicite : *« Never simulate a description list using a `bulletList` or `orderedList` starting with bold lead-in text and a colon; always use `descriptionList` (`block.description`), with a plain nominal `descriptionTerm` (no trailing colon, no math) and the explanation in `descriptionDefinition`. »*
  2. **Dans le validateur (`proposals.submit` / `document.validate`)** :
     - Contraindre `descriptionTerm` (comme `heading`) à du texte pur sans `mathInline` ni ponctuation finale `:` redondante avec le modèle.
     - (Optionnel) Détecter ou avertir lorsqu'un `listItem` de `bulletList` commence par un nœud `text` en `bold` se terminant par `:` ou `—`, pour inviter l'agent à utiliser `descriptionList`.

---

### 2.5. Pertinence de `bold` et `italic` face à l'emphase sémantique (`emph`)

- **Ce que fait actuellement Typstographe (découvert via `capabilities.describe` et `document.source`)** :
  - Dans le contrat JSON / MCP, les deux marques de style s'appellent **`bold`** (`text.bold`) et **`italic`** (`text.italic`).
  - Pourtant, la description de `text.italic` parle bien d'emphase (*« Emphasize selection or subsequent typing »*) et, lors de la génération du code Typst (`document.source`), Typstographe traduit déjà :
    - `mark: "italic"` $\rightarrow$ **`#emph[...]`** (qui, dans Typst comme `\emph{}` en LaTeX, bascule automatiquement entre romain et italique selon le contexte englobant, par exemple à l'intérieur d'un bloc `quote` ou d'un titre en italique),
    - `mark: "bold"` $\rightarrow$ **`#strong[...]`**.
  - En revanche, comme `italic` est stocké comme une marque plate (`marks: [{"type": "italic"}]`) sur un nœud `text`, on ne peut pas imbriquer une emphase dans une emphase au sein d'un même paragraphe, et son nom `italic` induit l'agent en erreur en lui présentant un style visuel au lieu d'une fonction sémantique.

- **Pourquoi interdire `bold` au MCP et assumer pleinement `emph`** :
  1. **En typographie soignée, le gras (`bold` / `#strong`) n'a pas sa place au milieu d'un paragraphe de prose** :
     - Le gras appartient à la signalétique structurelle du document (titres, termes de listes de description, intitulés d'énoncés), laquelle est entièrement prise en charge par le **modèle visuel** de Typstographe.
     - Laisser `bold` accessible au MCP incite les LLM à commettre des anti-patterns structurels (simuler des sous-titres, simuler des `descriptionList`, ou mettre en gras des mots-clés au fil des phrases comme sur le web).
     - **Supprimer ou interdire `bold` pour le MCP** force mécaniquement l'agent à utiliser les vraies structures sémantiques (`heading`, `descriptionList`).
  2. **Renommer ou documenter `italic` comme une véritable emphase sémantique (`emph`)** :
     - Contrairement au gras, l'emphase (`#emph[...]`) est indispensable en prose académique (introduction d'un terme défini au fil d'une phrase, locution latine/étrangère, mise en relief logique).
     - Renommer la capacité/marque en `text.emph` / `emph` (ou documenter explicitement que `text.italic` produit `#emph[...]` avec bascule romain/italique et doit être réservé à l'emphase sémantique courte, jamais autour d'un `mathInline`) alignerait parfaitement le contrat MCP avec la philosophie sémantique de Typstographe et de Typst.

---

## 3. Améliorations concrètes de l'auto-documentation MCP

### 3.1. Enrichir `examples` sur `block.splice`, `block.insert` et `proposals.submit`
- Actuellement, `capabilities.describe` renvoie `examples: []` pour `block.splice`, `block.insert` et `proposals.submit`.
- Ajouter un exemple court et idiomatique dans `block.splice` (ou `proposals.submit`) montrant comment insérer en une seule opération une section composée d'un `heading` (en toutes lettres) et d'un `paragraph` mêlant `text`, `marks` et `mathInline`.
- Mentionner dans `typstographe://guide` que pour rédiger ou remplacer plusieurs blocs consécutifs dans une proposition, `block.splice` avec une liste de `nodes` est l'approche recommandée.

### 3.2. Consignes explicites sur la composition mathématique en Typst
- Ajouter dans `typstographe://guide` et dans la description de `math.inline` / `math.block` :
  1. **Zéro mathématique en UTF-8 dans les nœuds `text`** : interdire explicitement l'usage de caractères Unicode mathématiques (`√`, `ℝ`, `ℚ`, `ℤ`, `ℕ`, `≤`, `≥`, `≠`, `∈`, `∉`, `∀`, `∃`, `∞`, indices/exposants Unicode `₀–₉`, `ₙ`, lettres grecques isolées) dans les nœuds `text`. Toute notation mathématique doit utiliser `mathInline` ou `mathBlock`.
  2. **Rédaction des titres et des intitulés en gras** : demander de rédiger les titres (`heading`) et les amorces en gras en toutes lettres (sans symboles mathématiques), et de placer les formules dans le corps des paragraphes ou des définitions via `mathInline` / `mathBlock`.
  3. **Rappel des idiomes Typst fréquents vs LaTeX** (lorsque `language: "typst"` est utilisé) :
     - $\notin$ s'écrit `in.not` (et non `notin`),
     - $\cap$ et $\cup$ s'écrivent `inter` et `union` (et non `cap` / `cup`),
     - $\subset$ et $\subseteq$ s'écrivent `subset` et `subset.eq`,
     - $\setminus$ s'écrit `without`,
     - les intervalles semi-ouverts à crochets retournés $[a, b[$ s'écrivent `lr([a, b[)` si utilisés dans une formule.

### 3.3. Alléger la charge utile de `document.inspect`
- `document.inspect` et `typstographe://document` renvoient systématiquement la totalité du code source Typst du modèle (`settings.model.source`, plusieurs centaines de lignes) à chaque appel.
- Comme le modèle visuel est déjà consultable via `typstographe://models` (et que le contenu du modèle n'est pas modifiable en mode attaché), omettre `settings.model.source` par défaut dans `document.inspect` (ou ne renvoyer que `model.id` et ses options résolues) réduirait fortement la taille des réponses JSON échangées avec le serveur MCP.

---

## 4. Questions en suspens à trancher

1. **Politique sur les mathématiques dans les titres (`heading`)** :
   - Souhaite-t-on **interdire par schéma/validation** les nœuds `mathInline` dans les `heading` (pour forcer des titres purement rédactionnels et garantir des tables des matières et références croisées propres), ou les autoriser exceptionnellement tout en les déconseillant dans le guide MCP ?
2. **Détection automatique des symboles mathématiques UTF-8 dans la prose (`text`)** :
   - Souhaite-t-on que le validateur de `proposals.submit` / `document.validate` rejette (ou signale par un diagnostic dédié) les nœuds `text` contenant des symboles mathématiques Unicode (`√`, `ℝ`, `ℚ`, `≤`, `≥`, `≠`, `∈`, `∀`, `∃`, indices Unicode `ₙ`, etc.) afin de forcer l'agent à utiliser `mathInline` ou à reformuler ses titres en toutes lettres ?
3. **Validation Typst synchrone lors de `proposals.submit`** :
   - Peut-on brancher le compilateur Typst (déjà utilisé par `render.compile` et par l'UI) directement dans la validation de `proposals.submit` pour garantir l'invariant suivant : *« Toute proposition acceptée par `proposals.submit` (`ok: true`) est garantie de compiler sans erreur Typst lorsque l'utilisateur clique sur Appliquer »* ?
4. **Ensembles d'énoncés mathématiques (Théorème, Définition, Lemme, Démonstration)** :
   - À terme, souhaite-t-on introduire un bloc sémantique dédié (ou un profil de bloc dans le contrat d'article) pour les énoncés et démonstrations, ou conserver l'approche actuelle par sous-titres (`heading` de niveau 3) et listes de définitions (`descriptionList`) ?
