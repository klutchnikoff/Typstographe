# MCP structuré

Le serveur autonome et la [passerelle rattachée](mcp-local.md) utilisent `rmcp` et
le même contrat documentaire Rust que Tauri. La logique d’édition appartient au
propriétaire Yrs, les permissions et le transport à l’adaptateur.

```sh
cargo build --locked --offline -p typstographe-cli
target/debug/typstographe-cli mcp --read-root /chemin/projets --write-root /chemin/projets
```

Les racines, répétables, doivent exister. Elles sont indépendantes : ouvrir un
fichier en écriture exige lecture **et** écriture. Sans racine, le travail en
mémoire et le rendu restent possibles. Aucun accès réseau documentaire, programme
externe ou préférence personnelle n’est exposé. stdout est réservé au protocole.
`--lang fr` traduit les messages ; la langue du document reste indépendante.

## Découverte

Le parcours est [progressif](mcp-discovery.md) : commencer par
`typstographe://overview` pour le type actif, ses capacités et les règles de session.

1. `document_types.list` : fiches **compactes** des types et modèles, avec les
   groupes et profils à venir dans `discovery`. Aucun schéma ni en-tête complet.
2. `document_types.describe {"type":"article"}` : métadonnées initiales,
   champs et collections, index des capacités et fiches de modèles. Un profil
   `planned` n’est pas créable ; ses `capability_needs` sont des intentions,
   jamais des opérations garanties. La fiche `cv` reste consultable sans contrat
   exécutable. Voir le [catalogue](document-type-catalogue.md).
3. `commands.list` : opérations et support de l’adaptateur, **sans schémas**.
   `execution.direct_tool` indique un outil exposé ; `execution.proposal_step`
   indique une étape autorisée dans une proposition rattachée. Les permissions
   et la validité de l’édition restent contrôlées à l’exécution.
4. `capabilities.describe {"id":"insert.footnote"}` : une signature sémantique,
   ses contraintes et ses **étapes exécutables** (`inline.replace` dans ce cas).
   L’appel accepte aussi les identifiants d’opérations et des outils `proposals.*`.
   Pour un outil exposé, son schéma inclut la référence MCP `document`.
5. Lire `typstographe://guide` avant d’éditer, puis `document.inspect` et
   `document.structure` pour l’état confirmé et les zones ciblables.

`tools/list` conserve les schémas d’entrée complets de tous les outils nommés ;
les définitions inutilisées ne sont plus recopiées dans chacun d’eux.

Les capacités sémantiques n’ont pas nécessairement un outil de même nom : une
citation en bloc, une liste ou une image utilise `block.insert/replace`, une note
ou citation bibliographique utilise `inline.replace`. Leurs exemples décrivent le
nœud attendu. Ajouter d’abord une image avec `resource.add` (octets base64) ; une
citation bibliographique doit référencer une entrée réellement présente.
Les retours simples/forcés utilisent aussi `inline.replace` avec un nœud
`softBreak`/`hardBreak` ; les sauts de paragraphe utilisent `block.split`, pas un
caractère LF dans `text.insert`. Les items non imbriqués disposent de
`list.item.split`, `list.item.join` et `list.item.exit` ; leurs exemples et
restrictions sont exposés par `capabilities.describe` et `tools/list`.
`document.set_model` reçoit son identifiant et son source Typst, sans import
implicite depuis un chemin. Les collections d’en-tête utilisent des IDs stables.

Les sept ressources virtuelles `typstographe://overview`, `guide`, `types`,
`commands`, `content-capabilities`, `document`, `models` complètent les outils.
Les index sont compacts ; les détails se demandent individuellement. Elles sont
lues dans la même file que les commandes et décrivent un état confirmé cohérent.
Les URI `file:` et chemins arbitraires sont refusés. Relire après une modification.

## Cibles, styles et lots

Les réponses contiennent `{version, ok, document, outcome, permissions}`.
Renvoyer **la dernière référence `document` entière** à chaque appel documentaire.
Elle contient une identité opaque et `guard: {document, revision}`. Un remplacement
change l’identité ; une édition change la révision. Une garde périmée est refusée,
sans fusion ni nouvelle tentative automatique. `document.inspect` peut servir à
se resynchroniser sans référence, puis les cibles doivent être relues.

Les chemins désignent les enfants projetés dans la révision gardée. Les offsets
sont en **UTF-16**, dans une zone ; un objet en ligne compte pour une unité. Les
frontières de cellules, champs et annotations sont protégées. Exemple d’étape :

```json
{"id":"text.insert","params":{"target":{"zone":{"kind":"body","path":[0]},"from":0,"to":0},"text":"Bonjour","marks":[{"type":"bold"}]}}
```

Le texte est littéral : ce n’est ni du Typst ni du Markdown. Les paragraphes et
widgets utilisent des nœuds explicites. `text.bold/italic` agit sur une plage non
vide avec `value: on/off`. Pour la frappe future, `context.set` établit une
sélection privée, `context.style` active/désactive un style, `context.insert`
l’utilise. Ces opérations privées n’appartiennent pas aux lots documentaires.
L’insertion explicite suivante n’hérite d’aucun style implicite.

`selector: {select, occurrence?}` recherche exactement dans les zones du brouillon
courant ; une ambiguïté exige l’occurrence à partir de 1. `selector: {block: 1}`
désigne un bloc supérieur du corps. Il remplace une cible et ne peut la cumuler.
Dans un lot, les sélecteurs sont résolus **après les étapes précédentes**.

`document.batch {document, steps, save?}` prépare un candidat isolé, valide sa
forme finale et publie une seule révision avec une seule entrée d’annulation.
Les références intermédiaires entre auteurs et affiliations peuvent ainsi être
réparées dans le même lot. Maximum 256 étapes, budget du cœur de 32 Mio ; une erreur
est typée et indique l’étape concernée. `edit.undo/redo` utilise le même moteur.

## Conservation et rendu

Les `.typsto` structurés conservent le corps, l’en-tête, les ressources, le modèle,
les packages hors ligne et l’état Yjs. Aucun repli vers l’ancienne projection plate.

- `document.open` prend le verrou **avant** lecture (défaut éditable).
- `read_only: true` lit la dernière sauvegarde, même sous le verrou d’un écrivain.
- `document.save` conserve le verrou et vérifie les changements externes.
- `document.save_as` crée une copie indépendante ; une cible existante est refusée.
- Un lot peut sauvegarder uniquement en dernière action (`save.kind: current/as`).
  Si cette sauvegarde échoue, rien du lot n’est publié.
- `document.export` est indépendant de la sauvegarde ; dossier nouveau/vide,
  formats `pdf/typst/both`, `page_images` facultatif (false par défaut).
- `document.validate` vérifie le brouillon et sépare son aptitude à l’export.
  `render.compile` vérifie aussi la compilation du modèle ; `render.page` retourne
  un PNG MCP. `render.locate/selection_boxes` utilise des cibles typées du corps ; la
  géométrie d’en-tête/annotations est explicitement indisponible.

Un export multi-fichiers échoué peut rester partiel. Un serveur `--read-only`
interdit aussi copie, sauvegarde et export. Fermer avec des modifications non
sauvegardées exige `discard_changes: true`. Les compagnons de verrou persistants
ne prouvent pas qu’un processus détient le verrou : seul le verrou OS fait foi.
