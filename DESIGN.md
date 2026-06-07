# Design

## Theme
Light, « salle de métrologie » : fond blanc pur, encre froide presque noire, filets fins (hairlines), beaucoup d'air. Aucune ombre lourde. L'aspect « instrument » vient de la rigueur d'alignement et de la chasse fixe sur les nombres, pas d'effets.

## Color (OKLCH)
Stratégie : **Restrained** (neutres + un seul accent). Le sémaphore est réservé au statut.

| Rôle | Valeur | Usage |
|---|---|---|
| `--bg` | `oklch(1 0 0)` | fond global (blanc pur) |
| `--surface` | `oklch(0.976 0.003 250)` | panneaux, cartes, en-têtes de tableau |
| `--surface-2` | `oklch(0.955 0.004 250)` | barre latérale / zones secondaires |
| `--ink` | `oklch(0.23 0.02 255)` | texte principal (contraste ≥ 7:1) |
| `--muted` | `oklch(0.50 0.018 255)` | texte secondaire (≥ 4.5:1) |
| `--border` | `oklch(0.90 0.005 255)` | filets |
| `--accent` | `oklch(0.52 0.13 258)` | interactif : liens, onglet actif, action primaire (indigo) |
| `--accent-ink` | `oklch(0.98 0.01 258)` | texte sur accent |
| `--ok` | `oklch(0.60 0.12 150)` | statut conforme (vert) |
| `--warn` | `oklch(0.70 0.15 75)` | statut à surveiller (ambre) |
| `--alert` | `oklch(0.56 0.20 25)` | statut anomalie (rouge) |

Chaque statut a aussi une variante `-soft` (fond très clair de la même teinte) pour les badges et les bandes ±2σ/±3σ des cartes.

## Typography
- **UI / texte** : `system-ui` (Inter-like natif), une seule famille. Échelle rem fixe, ratio ~1.2.
- **Données numériques** : `ui-monospace` (chasse fixe) pour valeurs, z-scores, dates dans les tableaux — alignement et lisibilité métrologique.
- Pas de police d'affichage. Hiérarchie par taille + graisse.

## Components
- **Badge de statut** : pastille (forme) + libellé texte + bordure, jamais couleur seule.
- **Onglets ARIA** : `tablist` / `tab` / `tabpanel`, clavier flèches, `.tabpanel[hidden]{display:none}`.
- **Carte de contrôle SVG** : série de points (moyenne sur 3 réplicats) + barres d'erreur, ligne moyenne, bandes ±2σ (ambre) et ±3σ (rouge), marqueurs verticaux de maintenance (pointillés) avec tooltip.
- **Tableau de données** : date, valeur, z-score, biais, statut ; nombres en mono.
- **Panneau « Pour les experts »** : repliable (`<details>`), porte le détail technique (formules, σ, n).

## Layout
- En-tête fin : titre + verdict global + sélecteur de standard.
- Vue 1 (Vue d'ensemble) : grille d'éléments `repeat(auto-fit, minmax(190px, 1fr))`, chaque tuile = symbole + statut + compteur.
- Vue 2 (Détail) : carte de contrôle large + tableau dessous + plan/historique de maintenance.
- Responsive structurel : la grille se recompose ; le tableau défile horizontalement sous 640px.

## Motion
Sobre, 150–220 ms, ease-out. Transition d'onglet et de statut uniquement. `prefers-reduced-motion` → transitions neutralisées. Aucune séquence d'entrée orchestrée.
