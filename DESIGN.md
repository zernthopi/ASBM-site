---
name: ASBM – Baby-foot Marseille
version: 2 (identité sport, bleu Marseille)
colors:
  blanc: "#FFFFFF"        # fond de page
  surface: "#EEF6FB"      # panneaux clairs teintés de ciel
  marine: "#0B1D3A"       # texte principal, en-tête, bandeaux sombres, pied de page
  ciel: "#2AA9E0"         # bleu Marseille : aplats, boutons, bandes de chiffres
  ciel-vif: "#52BDEA"     # survol des boutons
  ciel-clair: "#8FD6F5"   # texte d'accent et liens sur fond marine
  bleu: "#075A8F"         # liens et accents texte sur fond blanc
  doux: "#3F5470"         # texte secondaire sur fond clair
  sur-marine-doux: "#B9C9DC"  # texte secondaire sur fond marine
  rouge: "#D0263A"        # équipe adverse du baby-foot uniquement
typography:
  display: "Big Shoulders Display 700/800, en capitales pour les titres, la navigation et les boutons"
  body: "Atkinson Hyperlegible Next, variable (texte courant)"
radius: "4 px (boutons, étiquettes) ; 10 px (panneaux, table)"
theme: "une seule identité claire (pas de thème sombre), couleurs peintes explicitement"
---

# Principes de design

## Sujet
Un club de baby-foot associatif à Marseille (4e), fondé en 1993 : 9 tables de compétition
(8 Bonzini + 1 Leonhart ITSF), trois soirées par semaine, loisir et compétition.
Le site doit dire en quelques secondes **quand** et **où** venir jouer, et **quels tournois** arrivent.

## Règles de lisibilité (non négociables)
Tous les couples texte/fond passent le niveau WCAG AA (4,5:1), la plupart dépassent 6:1.

| Texte | Fond | Contraste |
|---|---|---|
| marine #0B1D3A | blanc | 16,8:1 |
| bleu #075A8F (liens) | blanc | 7,3:1 |
| doux #3F5470 | blanc | 7,7:1 |
| blanc | marine | 16,8:1 |
| ciel-clair #8FD6F5 | marine | 10,5:1 |
| ciel #2AA9E0 (titres) | marine | 6,3:1 |
| marine | ciel #2AA9E0 (boutons, chiffres) | 6,3:1 |

Interdits : texte noir ou marine sur fond marine ; texte bleu ciel ou bleu pâle sur fond blanc ;
texte blanc sur bleu ciel (2,7:1).

## Allure sport
- En-tête marine avec liseré bleu ciel, navigation en capitales condensées.
- Bandeau d'accueil marine coupé en diagonale, avec un aplat bleu ciel incliné derrière la table.
- Horaires présentés comme un tableau d'affichage (LUN, MER, VEN, 18 H – 22 H).
- « Prochain rendez-vous » en carte de match : bloc date bleu ciel, titre en capitales.
- Bande de chiffres bleu ciel en diagonale (8 Bonzini, 1 Leonhart, 3 soirs, 1993).

## Le baby-foot interactif (élément fort)
Table vue de dessus dessinée en canvas (`src/scripts/babyfoot.js`) : caisson en hêtre verni,
terrain peint avec le sigle du club, barres chromées, joueurs 1-2-5-3 qui pivotent,
balle ombrée qui roule, boulier de score. Physique : rebonds, frappes transmises par la
rotation et le coulissement des barres, buts, remise en jeu.
Commandes : souris, tactile multi-doigts, clavier (flèches, Espace, Échap).
Sur mobile, la table passe à la verticale. Le jeu ne démarre qu'au clic sur « Jouer une partie »
(pas d'animation automatique, le défilement de la page n'est jamais bloqué avant).

## Refusé volontairement
Fond crème + terracotta, grilles de cartes identiques, fondus d'apparition sur chaque section,
flèches « → » dans les boutons, dégradés décoratifs.

## Plancher qualité
Focus clavier visible, cibles tactiles ≥ 44 px, zéro cookie, zéro requête tierce au chargement
(polices hébergées sur le site, carte OpenStreetMap chargée seulement au clic), audit axe sans erreur.
