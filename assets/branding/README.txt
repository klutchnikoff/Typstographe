Typstographe — identité st

Le nom s’écrit « Typstographe » en texte courant. Le logotype distingue
la ligature « st » par sa couleur et son inclinaison.

SOURCES
ligature-st.svg : ligature st d’EB Garamond Italic, agrandie de 15 % pour
les icônes. Son orientation italique originale et son contour sont conservés.
wordmark.svg : Typ et ographe en EB Garamond romain ; st italique rouille,
tourné de 25° et inséré entre les deux parties du nom.
PROVENANCE.txt et licenses/EB-Garamond-OFL.txt consignent la provenance.
Tous les dessins sont des tracés SVG autonomes, sans police à installer.
L’ancien signe tO reste disponible dans ligature.svg.

SPLASH ET ACCUEIL
La prévisualisation splash.html et l’accueil Tauri utilisent splash.svg,
brand.css et le même module motion.mjs. Une seule lecture, sans bloquer les
actions ; le retour à l’accueil et les changements de thème ne la rejouent pas.
Le mode mouvement réduit affiche immédiatement le logotype complet.
Le tracé du s descend, puis la liaison et le retournement dans la tête du t,
la hampe et le pied, enfin la barre. La caméra recule et pivote de 25° ; les
autres lettres apparaissent progressivement. Durée totale : 2,7 secondes.
Les trajectoires éditables sont dans strokes.json. generate.py produit
stroke-data.mjs ; reveal.mjs définit les zones de révélation. Le contour de
la police n’est jamais échantillonné ni modifié. Le même découpage vectoriel
est conservé jusqu’à la fin, sans changement d’épaisseur au raccord.

ICÔNES
exports/macos/icon.icns : 16 à 1024 px, avec Retina.
exports/windows/icon.ico : 16, 24, 32, 48, 64, 128, 256 px ; couche 32 en premier.
exports/linux/hicolor/ : PNG et SVG scalable de l’application.
exports/documents/ : mêmes déclinaisons pour les projets .typsto, sous forme
d’une feuille portant st. Le fond macOS conserve son léger dégradé ; les
fonds Windows et Linux sont unis. Les PNG sont en RGBA 8 bits par canal.
Les petits dessins monochromes sont dans optical/. Les fichiers @2x utilisent
la même silhouette à double résolution, sans épaississement artificiel.
Le catalogue d’interface expose st sous « typstographe » ; la palette conserve
l’icône Lucide wrench.

ASSOCIATIONS DES FICHIERS
L’extension reste .typsto. La configuration Tauri déclare le type
org.typstographe.project et le MIME application/x-typstographe.
Le générateur de langues natives ajoute les déclarations et l’icône document
au même Info.plist que les langues Fluent. Le paquet macOS inclut document.icns.
Le hook Windows NSIS choisit document.ico pour la classe créée par Tauri.
Les paquets Linux incluent le type MIME, ses icônes et un lanceur qui transmet
le chemin avec %f. Les paquets DEB/RPM actualisent les caches du bureau ;
l’AppImage embarque ces métadonnées et dépend de son intégration au bureau.
L’installation du paquet est nécessaire pour enregistrer les associations :
npm start n’installe pas les associations sur le système.

Les demandes natives attendent que l’interface soit prête, puis suivent le
même choix de conservation/enregistrement/abandon que l’ouverture ordinaire.
Un formulaire déjà ouvert est terminé avant de présenter ce choix.
Le plugin officiel single-instance transmet les demandes à l’instance active ;
les recettes isolées et MCP conservent leur fonctionnement indépendant.

RÉGÉNÉRER ET PRÉVISUALISER
python3 assets/branding/generate.py
Prérequis : Python 3 et rsvg-convert (librsvg). Aucune police ni bibliothèque
Python supplémentaire n’est nécessaire. --icons-only conserve le splash.
Le script met à jour app/src-tauri/icons/ et les ressources de document MIME.
Pour consulter docs/mockups/branding.html, servir la racine du dépôt avec
python3 -m http.server 8341 --bind 127.0.0.1
Les aperçus se trouvent dans previews/ ; identity.png et mobile.png sont des
références historiques de l’ancienne identité tO.

VÉRIFICATION
Contrôler les PNG RGBA, les couches ICO et ICNS, et leur correspondance avec
les ressources natives. Les tests d’accueil couvrent Chromium et WebKit,
les petites fenêtres, le thème sombre, la lecture unique et le mouvement réduit.
Les tests des associations contrôlent les fichiers des paquets et les déclarations
macOS même après régénération des langues.
