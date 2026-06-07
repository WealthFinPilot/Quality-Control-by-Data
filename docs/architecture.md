# Architecture technique

Décisions structurantes du projet. Pour l'algorithme métier, voir
[`source-analysis.md`](source-analysis.md) ; pour la direction visuelle,
[`../DESIGN.md`](../DESIGN.md).

## Principe général

Application **statique, sans backend** : tout le calcul se fait dans le navigateur
à partir de fichiers JSON pré-extraits. Aucune dépendance npm en production,
aucune librairie de graphiques. Déploiement Netlify (publication de la racine).

```
Excel (.xlsm, hors dépôt)
        │  scripts/extract.py  (idempotent, anonymise)
        ▼
data/crm_data.json  +  data/maintenance.json
        │  fetch() au démarrage
        ▼
src/engine.js  (calculs purs)  →  src/compliance.js  (interprétation)
        │
        ▼
src/app.js  (rendu DOM + SVG)  ↔  index.html / src/style.css
```

## Séparation des responsabilités

| Module | Rôle | Dépend du DOM ? |
|---|---|---|
| `src/engine.js` | Calculs purs : moyenne, σ, z-score, biais, limites, statuts. | Non |
| `src/compliance.js` | Interprétation : libellés simples, verdict, compteurs, corrélation maintenance, note « limites serrées ». | Non |
| `src/app.js` | Chargement, état, rendu des 4 vues, cartes SVG, onglets, impression. | Oui |
| `index.html` / `style.css` | Structure sémantique + design system OKLCH. | — |

Cette séparation rend `engine.js` et `compliance.js` **testables en Node sans
navigateur** (`test/*.mjs`), et garantit que la logique de calcul ne dépend
jamais de l'affichage.

## Choix techniques notables

- **Graphiques SVG construits à la main** (`buildChart`) plutôt qu'une librairie :
  zéro dépendance, contrôle total du rendu et de l'accessibilité, impression nette.
  La même fonction sert le détail interactif et le rapport (paramètre `interactive`).
- **Calcul côté client à chaque chargement** : les limites de contrôle sont
  recalculées sur l'historique réel, fidèlement à l'outil d'origine. Pas de valeurs
  figées dans le JSON (le JSON ne contient que les mesures brutes + valeurs certifiées).
- **Onglets ARIA + deep-link par `#hash`** : chaque vue est partageable par URL ;
  navigation clavier (flèches, Home/End).
- **Impression** : une feuille `@media print` isole le rapport (`#panel-report`)
  et masque l'interface ; `window.print()` permet l'export PDF natif, sans outil tiers.

## Sécurité et confidentialité des données

- Les fichiers source (`.xlsm`, `.pdf`) et le code VBA (`.bas`, `.cls`, …) sont
  **exclus du dépôt** (`.gitignore`).
- Les **identifiants réels** de standards sont remplacés par des alias (`STD-A`…).
  La table de correspondance vit dans `scripts/aliases.local.json` (gitignoré,
  motif `*.local.json`) ; le format est documenté dans `aliases.example.json`.
- Les données de maintenance sont **fictives** (le fichier source était confidentiel).

## Interprétation « monde réel » : les limites serrées

Les limites étant **dynamiques** (`moyenne ± kσ`), un élément très répétable
(σ minuscule) obtient des limites extrêmement étroites : un écart négligeable en
valeur absolue peut alors dépasser ±2σ/±3σ. `compliance.js` détecte ce cas
(coefficient de variation σ/moyenne < 2 %) et affiche une **note explicative**
dans le détail et le rapport, pour éviter de surinterpréter un dépassement
purement statistique. C'est un garde-fou d'interprétation, pas une correction du calcul.

## Tests

- `test/engine.test.mjs` (39) : formules, cas limites, invariant d'identité,
  recoupement avec les valeurs réelles d'Excel.
- `test/compliance.test.mjs` (24) : libellés, verdict, fenêtre de maintenance,
  note de limites serrées.
- Vérification navigateur manuelle (Chrome headless + CDP) : responsive, absence
  d'erreurs console, export PDF.
