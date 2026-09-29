# Site de l’ASBM – Babyfoot Marseille

Site statique du club, construit avec [Astro](https://astro.build). Aucune base de données,
aucun cookie, aucun service tiers au chargement.

## Voir le site tout de suite

Ouvrez `dist/index.html` dans votre navigateur (double-clic). Cette version locale
fonctionne sans installation.

## Travailler sur le site

Prérequis : [Node.js](https://nodejs.org) 22 ou plus récent.

```bash
npm install          # une seule fois
npm run dev          # site de travail sur http://localhost:4321, rechargé à chaque modification
npm run build        # version à mettre en ligne (dossier dist/)
npm run build:local  # version à ouvrir par double-clic (liens relatifs)
```

## Modifier les contenus

| Contenu | Fichier |
|---|---|
| Actualités et tournois | `src/content/actualites/*.md` (un fichier par annonce) |
| Modèle d’annonce de tournoi DYP | `src/content/actualites/_modele-tournoi-dyp.md` |
| Horaires, adresse, contact, tables, transports, réseaux sociaux | `src/data/club.json` |
| Joueurs du club absents des classements FFBF | `src/data/joueurs-club-ajouts.json` |
| Histoire (frise) | `src/data/histoire.json` |
| Palmarès | `src/data/palmares.json` |
| Mentions légales | `src/pages/mentions-legales.astro` |

Pour annoncer un tournoi : copiez le modèle, renommez-le (`2026-11-13-tournoi-dyp.md`),
modifiez les champs en tête de fichier et retirez la ligne `brouillon: true`.
Les tournois passés basculent automatiquement dans « Actualités passées » à la
reconstruction du site.

Formats possibles : `open`, `dyp`, `championnat`, `vie-du-club`.

## À compléter par le club

Les éléments manquants sont signalés sur le site par une étiquette jaune « À compléter » :

- histoire du club (dates clés, fondateurs, lieux successifs) ;
- palmarès ;
- règlement intérieur du club ;
- mentions légales : directeur de la publication, confirmation du siège social, hébergeur ;
- logo en haute définition (la version actuelle vient de la page Facebook).

## Mettre en ligne (gratuit)

1. Déposer ce dossier sur un dépôt GitHub.
2. Le relier à **Cloudflare Pages** (ou Netlify) : commande de build `npm run build`,
   dossier de sortie `dist`. Le fichier `public/_headers` ajoute les en-têtes de sécurité.
3. Plus tard : acheter un nom de domaine, puis renseigner `site` dans `astro.config.mjs`.

Étape suivante possible : ajouter un petit CMS (Decap ou Keystatic) pour que les bénévoles
publient les actualités depuis un formulaire, sans toucher aux fichiers.

## Page Compétitions

Quatre onglets, tous alimentés automatiquement par l’API publique `api.tablesoccer.org`
(la même que celle de [coral.ffbabyfoot.fr](https://coral.ffbabyfoot.fr/tournaments/) et de tablesoccer.org) :

| Onglet | Contenu | Données |
|---|---|---|
| Calendrier club | Tournois organisés par l’ASBM : compétitions FFBF dont le club est organisateur + tournois annoncés dans les actualités (open, DYP, championnat) | `ffbf-calendrier.json` + `src/content/actualites/` |
| Calendrier FFBF | Circuit National : Open Loisir, Opens régionaux et nationaux, championnats ; filtres par type et « Région PACA » | `ffbf-calendrier.json` |
| Calendrier ITSF | Circuit mondial, drapeaux des pays hôtes ; filtres France, Bonzini, Leonhart | `itsf-calendrier.json` |
| Résultats récents | Podiums ITSF et FFBF ; filtre « Joueurs du club » : classement de chaque licencié ASBM sur ses tournois des 12 derniers mois | `itsf-resultats.json`, `ffbf-resultats.json`, `club-resultats.json` |

Le script `scripts/maj-competitions.mjs` récupère tout avant chaque build
(`npm run maj-competitions` pour le lancer seul). La logique est dans `scripts/competitions-core.mjs`.
Sans réseau, les dernières données sont conservées.

- **Joueurs du club** : repérés automatiquement dans les classements FFBF (licence rattachée au sigle `ASBM`).
  Pour ajouter un joueur absent des classements, renseigner son code joueur dans
  `src/data/joueurs-club-ajouts.json` (le code figure dans l’adresse de sa fiche sur coral.ffbabyfoot.fr).
- **Images des tables** : une vignette par marque (filtres « Table » et chaque tournoi), décrite dans
  `src/data/tables.json` et stockée dans `public/tables/` (480 × 360 px, table seule sur fond blanc,
  d'après les visuels des tables officielles et reconnues par l'ITSF). Bonzini B90, Leonhart Leo Tournament,
  Tornado, Garlando World Champion, Roberto Sport Revolution, Rosengart, Ullrich Beast ; la Multitable
  s'affiche avec le mot « MULTI ». Une marque inconnue utilise une illustration générique. Pour un tournoi
  du club, la marque se précise avec `table:` en tête de l’annonce (Bonzini par défaut).

Le fichier `.github/workflows/deploiement.yml` reconstruit et publie le site sur GitHub Pages
à chaque modification et **chaque matin**, ce qui tient calendriers et résultats à jour sans intervention.
Il suffit d’activer GitHub Pages (Settings → Pages → Source : GitHub Actions).

## Plan d’accès (page Venir jouer)

Deux cartes SVG dans la charte du site (`src/components/PlanAcces.astro`) : plan de situation
(métro M1/M2, tram T1/T2/T3 aux couleurs RTM, gares, grands axes) et zoom du quartier (bâtiments,
arrêts, itinéraires à pied calculés sur le réseau de rues). Le composant est **généré** :

```bash
pip install shapely
python3 scripts/carte/generer-plan.py
```

Les données OpenStreetMap (ODbL) sont enregistrées dans `scripts/carte/*.json` ; la mise en page et
les textes (itinéraires) sont dans `scripts/carte/gabarit-plan.astro`. La carte interactive
OpenStreetMap reste disponible en dessous, chargée seulement au clic.

## Réseaux, logo et photos

- Page « Nos réseaux » (`src/pages/reseaux.astro`) : liens Facebook, Instagram et YouTube, définis dans
  `reseaux` et `contact` de `src/data/club.json` (repris dans le pied de page et sur la page Compétitions).
- Logo : `public/logo-asbm.webp` (récupéré sur la page Facebook, 200 px). Remplacer par le
  fichier original du club pour une meilleure netteté.
- Photos : `public/photos/`, décrites dans `src/data/photos.json` (texte alternatif, légende).
  Vérifier l’accord des personnes photographiées avant la mise en ligne.

## Le baby-foot interactif

Le jeu de la page d’accueil est dans `src/scripts/babyfoot.js` (script autonome, sans dépendance).
Réglages utiles en tête de fichier : vitesse de déplacement des barres rouges (`V_IA`),
vitesse maximale de la balle (`VMAX`), taille des joueurs (`FIG`).
Les rouges jouent comme en compétition : contrôle, passes gardien → défense → milieu → attaque,
balle posée sur le joueur central, puis tir dans l’ouverture (fonction `jouerPossession`).

## Design

Voir `DESIGN.md` : palette bleu Marseille et règles de lisibilité, typographies
(Big Shoulders Display, Atkinson Hyperlegible Next), principes de mise en page.
