# Contrôle de la qualité par la data

> **Surveiller, détecter, corriger — maîtriser la dérive d'un équipement d'analyse de précision dans le temps.**

🔗 **Démo en ligne** : [quality-control-by-data.netlify.app](https://quality-control-by-data.netlify.app/)

---

## Le contexte réel
 
Dans un laboratoire industriel accrédité, un équipement d'analyse chimique peut dériver imperceptiblement — quelques centièmes de pourcent par semaine. À l'œil nu, tout semble normal. Dans les faits, les résultats se dégradent, des écarts s'accumulent, et sans système de détection précoce, le problème n'est visible que lorsqu'il est déjà coûteux.
 
Contrôler manuellement 18 éléments chimiques sur plusieurs mois de mesures est un processus long, répétitif et peu fiable — les dérives faibles restent invisibles dans une colonne de chiffres. J'ai développé cet outil pour automatiser ces calculs et rendre les données exploitables visuellement : un écart qui passerait inaperçu dans un tableau devient immédiatement lisible sur une carte de contrôle.
 
Cet outil est **toujours en production** dans l'entreprise.
 
Ce projet en est la **reproduction web** — construite pour rendre la logique accessible, et pour montrer comment un expert qualité se sert de la data pour rester en contrôle.
 
---
 
## Aperçu
 
| Vue d'ensemble | Plan de maintenance |
|:---:|:---:|
| <img src="assets/ScreenShot-vue-ensemble.jpeg" width="100%"> | <img src="assets/ScreenShot-Maintenance.png" width="100%"> |
 
| Détail par élément | Rapport de contrôle |
|:---:|:---:|
| <img src="assets/ScreenShot-Detail-par-element.png" width="100%"> | <img src="assets/ScreenShot-Rapport-de-controle-de-deviation.png" width="100%"> |

---
 
## Ce que le système permet de faire
 
Un équipement d'analyse est soumis à l'usure, aux variations environnementales, aux interventions de maintenance. La question permanente est : **mesure-t-il encore juste ?**
 
Pour y répondre de façon objective et traçable, le système surveille en continu plusieurs dizaines d'éléments chimiques en parallèle à partir de mesures répétées sur des échantillons de composition certifiée. Pour chaque élément, il calcule l'écart entre la valeur mesurée et la valeur de référence, et le situe par rapport à l'historique de l'instrument.
 
**Vue d'ensemble** — statut global de l'instrument, tuile par élément chimique, compteurs d'anomalies actives. En un coup d'œil : l'équipement est-il sous contrôle, ou faut-il intervenir ?
 
**Détail par élément** — carte de contrôle temporelle complète : évolution des mesures, moyenne historique, limites ±2σ et ±3σ dynamiques, événements de maintenance superposés sur l'axe du temps. Permet de répondre à : cette dérive a-t-elle commencé avant ou après la dernière intervention ?
 
**Maintenance** — plan préventif structuré à deux niveaux (routine hebdomadaire, maintenance complète mensuelle) et historique des interventions. Chaque événement est relié aux cartes de contrôle pour rendre la corrélation dérive/entretien visible et documentée.
 
**Rapport de contrôle** — vue synthétique exportable pour traçabilité et audit.
 
Chaque écran suit le principe **double niveau** : réponse lisible en façade, détail technique accessible d'un clic.
 
---
 
## La méthode de calcul
 
L'algorithme a été extrait du VBA d'origine et vérifié sur les données réelles (voir [`docs/source-analysis.md`](docs/source-analysis.md)).
 
Pour chaque mesure d'un élément chimique :
 
```
z-score = (valeur mesurée − valeur certifiée) / σ_historique
 
Limites dynamiques :
  À surveiller  →  moyenne ± 2σ
  Anomalie      →  moyenne ± 3σ
```
 
- `σ_historique` et la moyenne sont **recalculés sur l'historique réel** à chaque nouvelle campagne — pas de valeurs théoriques figées.
- Statuts : `|z| < 2` conforme · `2 ≤ |z| < 3` à surveiller · `|z| ≥ 3` anomalie.
- Cas limite : si la variabilité historique est quasi nulle (σ → 0), le z-score devient mathématiquement instable. L'élément est marqué `variance insuffisante` — le système ne produit pas de faux diagnostic.
---
 
## Ce que ce projet démontre
 
- **Modélisation d'un flux de données métier complexe** : base évènementielle → consolidation par campagne → analyse statistique → tableau de bord décisionnel.
- **Extraction et transformation de données** depuis un fichier source Excel (`scripts/extract.py`) vers des fichiers JSON structurés et versionnés.
- **Moteur de calcul pur, testé et découplé du DOM** — chaque fonction est exportée et couverte par des tests unitaires.
- **Visualisation de données temporelles** en SVG natif, sans librairie externe.
- **Déploiement d'une application statique** sur Netlify, accessible publiquement.
---
 
## Stack technique
 
- **HTML / CSS / JavaScript vanilla** — zéro dépendance npm en production.
- **Graphiques SVG natifs** — aucune librairie de charting.
- **Python** — extraction et transformation des données source.
- **Accessibilité WCAG AA** — navigation clavier, onglets ARIA, couleur jamais seule pour un statut, `prefers-reduced-motion`.
- **Netlify** — déploiement statique, sans backend.
---
 
## Lancer en local
 
L'application charge les données via `fetch` — un serveur HTTP local est nécessaire.
 
```bash
python -m http.server 8000
# Ouvrir http://localhost:8000
```
 
---
 
## Données et confidentialité
 
Les **identifiants réels** des échantillons de référence sont **anonymisés** (`STD-A`, `STD-B`…). Le **plan de maintenance est un jeu de données fictif** — le fichier source d'entreprise est confidentiel. Les fichiers sources (`.xlsm`) ne sont **jamais** versionnés (voir `.gitignore`).
 
Pour régénérer les données depuis les sources (non publiques) :
 
```bash
python scripts/extract.py
```
 
---
 
## Tests
 
```bash
node test/engine.test.mjs        # 39/39
node test/compliance.test.mjs    # 27/27
```
 
---
 
## Structure du projet
 
```
├── index.html
├── src/            engine.js · compliance.js · app.js · style.css
├── data/           crm_data.json (anonymisé) · maintenance.json (fictif)
├── scripts/        extract.py — extraction Excel → JSON, idempotent
├── test/           engine.test.mjs · compliance.test.mjs
└── docs/           source-analysis.md
```
 
---
 
**Auteur** : Sébastien Oger — Quality Manager, laboratoire de tests métallurgiques accrédité.
Développement autonome · Excel/VBA · Python · JavaScript · Déploiement web.
