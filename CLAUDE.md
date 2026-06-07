# CLAUDE.md — spectrometer-qc-dashboard

> **Lis ce fichier en entier avant toute action.**
> Il est la source de vérité pour ce projet. Si l'implémentation diverge de ce document, mets à jour ce fichier — jamais l'inverse.

---

## Identité du projet

| Champ | Valeur |
|---|---|
| Titre affiché | Quality Control by Data |
| Repo GitHub | `spectrometer-qc-dashboard` (public) |
| Déploiement | Netlify — statique, zéro backend |
| Stack | HTML / CSS / JS vanilla, zéro dépendance npm en production |
| Auteur portfolio | Sébastien Oger — Quality Manager |

---

## Contexte métier

Ce projet reproduit un outil Excel/VBA de surveillance métrologique continue d'un **spectromètre d'émission optique (à étincelle / spark-OES)** utilisé pour l'analyse élémentaire d'aciers et alliages en laboratoire accrédité ISO/IEC 17025.

> **Audience et registre (décision actée le 2026-06-07).** L'app est un projet de
> portfolio destiné à des **recruteurs non-experts** autant qu'à des métrologues.
> Design à **double niveau** : langage simple en façade (« la machine dérive-t-elle ? »),
> détail technique (z-score, σ, limites) accessible à la demande. Livrable principal :
> **dashboard interactif** (+ export rapport en complément). Le plan de maintenance
> fictif comporte un **volet préventif** (périodicités) ET un **historique** superposé
> aux cartes de contrôle.

L'outil original permet de :
- Enregistrer des campagnes de mesures sur des matériaux de référence certifiés (CRM)
- Calculer le **z-score** et le **biais** de chaque mesure par rapport à la valeur certifiée
- Calculer des **limites de contrôle dynamiques ±2σ / ±3σ** à partir de l'historique réel (pas de valeurs théoriques fixes)
- Générer des **cartes de contrôle temporelles** par élément chimique
- Émettre des **warnings** (dépassement 2σ) et des **alertes** (dépassement 3σ)
- Permettre la traçabilité jusqu'au réplicat source

### Périmètre de l'application web
- **Tous les éléments chimiques** présents dans le fichier source sont reproduits (C, Si, Mn, P, S, Cr, Mo, Ni, Al, Co, Cu, Nb, V, W, Sn, et autres).
- **Données CRM** : extraites du fichier source `.xlsm`, blocs standards renommés en alias neutres (`STD-A`, `STD-B`…). Aucun identifiant réel ne doit apparaître dans le repo public.
- **Données de maintenance** : le fichier source référençait un second fichier confidentiel (plans de maintenance). Cette fonctionnalité est reproduite avec un **jeu de données fictif** généré pour la démo (`data/maintenance.json`). Les événements de maintenance se superposent visuellement aux cartes de contrôle pour permettre de corréler dérives et interventions.

---

## Architecture du projet

```
spectrometer-qc-dashboard/
├── index.html
├── src/
│   ├── engine.js           ← calculs purs : z-score, biais, σ, limites dynamiques
│   ├── compliance.js       ← logique warning/alerte, statut par élément
│   └── style.css           ← design system OKLCH, WCAG AA
├── data/
│   ├── crm_data.json       ← données CRM extraites (blocs renommés STD-A, STD-B…)
│   └── maintenance.json    ← événements de maintenance fictifs
├── scripts/
│   └── extract.py          ← extraction Excel → JSON (idempotent)
├── test/
│   ├── engine.test.mjs
│   └── compliance.test.mjs
├── docs/
│   ├── source-analysis.md  ← algorithme retenu + variantes rejetées
│   └── architecture.md     ← décisions techniques structurantes
├── CLAUDE.md               ← ce fichier
├── netlify.toml
└── README.md
```

---

## Schéma des données JSON

### `data/crm_data.json`

```json
{
  "standards": [
    {
      "id": "STD-A",
      "certified_values": {
        "C": 0.17, "Si": 0.21, "Mn": 1.2, "P": 0.011,
        "S": 0.002, "Cr": 0.12, "Mo": 0.023, "Ni": 0.1,
        "Al": 0.018, "Co": 0.001, "Cu": 0.14, "Nb": 0.004
      },
      "measurements": [
        {
          "date": "2024-01-10",
          "values": { "C": 0.17, "Si": 0.21, "Mn": 1.2 },
          "std_by_element": { "C": 0.004, "Si": 0.002, "Mn": 0.009 },
          "replicates": 3
        }
      ]
    }
  ]
}
```

Champs obligatoires par mesure : `date` (ISO 8601), `values` (float par élément), `std_by_element` (float, peut être 0), `replicates` (int).

### `data/maintenance.json`

Trois volets : `procedures` (deux niveaux de maintenance), `preventive_plan` (catalogue des tâches avec `impact` et appartenance à la routine) et `events` (historique daté superposé aux cartes).

```json
{
  "purpose": "Prévenir la contamination de l'appareil et garantir des lectures fiables.",
  "procedures": [
    { "name": "Maintenance de routine", "frequency": "Hebdomadaire", "frequency_days": 7,
      "steps": ["Nettoyage de la chambre", "Désencombrer le tuyau", "Nettoyer le filtre", "Contrôle de fuite", "Étalonner l'appareil"] },
    { "name": "Maintenance complète", "frequency": "Mensuel", "frequency_days": 30, "steps": ["…toutes les tâches…"] }
  ],
  "preventive_plan": [
    { "task": "Nettoyage de la chambre", "routine": true, "impact": "élevé",
      "plain": "On nettoie la chambre où se produit l'étincelle.",
      "description": "Les dépôts contaminent les mesures suivantes." }
  ],
  "events": [
    { "date": "2024-03-19", "type": "Maintenance complète", "technician": "J.M.", "notes": "…" }
  ]
}
```

- **Deux niveaux** : *routine* (hebdo, 5 étapes : chambre, tuyau, filtre, contrôle de fuite, étalonnage) et *complète* (mensuelle, toutes les étapes).
- `impact: "élevé"` = tâche pesant le plus sur la justesse (piston, lentille, chambre, pression de gaz / fuite / argon, remontage-serrage, étalonnage).
- `events[].type` ∈ `"Maintenance de routine"`, `"Maintenance complète"`, `"Ponctuelle"` (ex. changement de bouteille d'argon).
- Tâches (fournies par l'auteur, données fictives) : nettoyage chambre, désencombrer tuyau, nettoyer filtre, contrôle de fuite, étalonnage, nettoyage alcool du piston, nettoyer lentille, vérifier remontage/serrage, vérifier niveaux, eau du filtre, papiers abrasifs, plan de travail, changer bouteille d'argon.

---

## Algorithme de calcul — règles impératives

### z-score
```
z = (x_mesurée - x_certifiée) / σ_historique
```
- `σ_historique` = écart-type calculé sur l'ensemble des mesures passées pour cet élément et ce standard.
- **Cas limite STD → 0** : si `σ_historique < 1e-9`, marquer l'élément `status: "insufficient_variance"`. Ne pas calculer de z-score. Ne pas planter.

### Biais
```
biais = x_mesurée - x_certifiée
biais_relatif = (biais / x_certifiée) × 100   [en %]
```

### Limites de contrôle dynamiques
- Recalculées à chaque ajout de donnée à partir de l'historique réel.
- `warning_high = moyenne + 2σ`, `warning_low = moyenne - 2σ`
- `alert_high = moyenne + 3σ`, `alert_low = moyenne - 3σ`

### Statuts par mesure
| Statut | Condition |
|---|---|
| `"ok"` | `|z| < 2` |
| `"warning"` | `2 ≤ |z| < 3` |
| `"alert"` | `|z| ≥ 3` |
| `"insufficient_variance"` | `σ < 1e-9` |
| `"invalid"` | valeur absente ou non numérique |

### Invariant d'identité (test obligatoire)
Pour chaque entrée de référence, quand on lui soumet sa propre composition mesurée, elle doit figurer dans les valeurs attendues. Tout test qui échoue sur cet invariant bloque la suite.

---

## Moteur de calcul — règles de modification

> **`src/engine.js` ne doit pas être modifié après validation de la suite de tests.**
> Si une correction est nécessaire, documenter la raison dans `docs/source-analysis.md` et mettre à jour les compteurs ci-dessous.

Compteurs de tests attendus (à renseigner après la première exécution verte) :
- `engine.test.mjs` : `39/39` passing
- `compliance.test.mjs` : `27/27` passing

---

## Interface utilisateur — structure attendue

### Navigation par onglets ARIA
Deux vues principales :

**Vue 1 — Dashboard (vue d'ensemble)**
- Statut global de l'instrument (OK / Warning / Alerte)
- Grille de tous les éléments chimiques avec badge d'état par élément
- Compteurs globaux : nombre de warnings actifs, nombre d'alertes actives
- Sélecteur de standard actif (STD-A, STD-B…)

**Vue 2 — Détail par élément**
- Carte de contrôle temporelle : série de mesures + moyenne + limites ±2σ/±3σ
- Événements de maintenance superposés comme marqueurs verticaux (ligne pointillée + tooltip)
- Tableau de données brutes avec z-score, biais, statut, date

### Règles UI non négociables
- Palette OKLCH en variables CSS uniquement — aucune couleur en dur dans les règles.
- Badges d'état : couleur + texte + bordure — jamais couleur seule.
- Pattern tablist ARIA : `role="tablist"` / `role="tab"` / `role="tabpanel"` + navigation clavier ArrowLeft/ArrowRight.
- Ajouter impérativement `.tabpanel[hidden]{display:none}`.
- `aria-live` sur les zones de résultats dynamiques.
- WCAG AA sur tous les contrastes. Focus visible sur tous les éléments interactifs.
- Graphiques : SVG ou Canvas natifs. Tooltip sur hover. Aucune lib de charting externe.

### Direction artistique
Charger le skill Impeccable (`/impeccable`) **avant toute ligne de CSS** pour définir la direction artistique. Contexte à transmettre au skill : outil de laboratoire industriel, audience technique (qualité, métrologie), données scientifiques, registre professionnel et précis. Éviter l'esthétique "dashboard SaaS générique".

---

## Script d'extraction Python

`scripts/extract.py` doit être :
- **Idempotent** : re-exécutable sans créer de doublons.
- **Autonome** : un seul fichier, aucune dépendance externe hors `openpyxl` ou `xlrd`.
- **Documenté** : commentaires sur le mapping onglet source → champ JSON.
- **Traçable** : afficher en console le nombre d'entrées extraites par standard.

**Correspondance de renommage** : elle contient des identifiants RÉELS, donc elle
ne vit PAS dans le script versionné. `extract.py` la charge depuis
`scripts/aliases.local.json` (gitignoré, motif `*.local.json`). Le format est
documenté dans `scripts/aliases.example.json` :
```json
{
  "IDENTIFIANT-REEL-1": "STD-A",
  "IDENTIFIANT-REEL-2": "STD-B"
}
```

---

## Déploiement

### `netlify.toml`
```toml
[build]
  publish = "."
  command = ""
```

### `.gitignore` — entrées obligatoires
```
*.xlsx
*.xlsm
*.xlsb
*.bas
*.cls
*.frm
data/raw/
*.env
```

---

## Ordre d'exécution — jalons

| Jalon | Livrable | Bloquant |
|---|---|---|
| 0 | Lire ce fichier + analyser VBA + `docs/source-analysis.md` | Oui |
| 1 | `data/crm_data.json` validé + `data/maintenance.json` généré | Oui |
| 2 | `node test/engine.test.mjs` : 100 % vert | Oui |
| 3 | UI fonctionnelle, testée en navigateur | Oui |
| 4 | Push GitHub + déploiement Netlify vérifié | Oui |
| 5 | README + CLAUDE.md mis à jour | Oui |

Ne pas passer au jalon suivant si le jalon courant n'est pas validé.

---

## Contraintes absolues

- Ne jamais commiter : `.xlsm`, `.xlsx`, `.bas`, `.cls`, données non anonymisées, clés d'API.
- Aucun identifiant de standard réel dans le repo public (utiliser uniquement les alias `STD-X`).
- Zéro dépendance npm en production.
- Confirmer avant tout push public ou déploiement.
- Si la logique VBA est ambiguë sur un point, consigner l'ambiguïté dans `docs/source-analysis.md` et appliquer l'hypothèse la plus conservatrice — ne pas inventer de comportement.

---

## Checklist finale avant livraison

- [ ] `node test/engine.test.mjs` : 100 % vert
- [ ] `node test/compliance.test.mjs` : 100 % vert
- [ ] Test navigateur : golden path + cas vide + cas d'erreur + navigation clavier
- [ ] Aucun fichier sensible dans `git status`
- [ ] `netlify.toml` présent, URL live vérifiée
- [ ] README à jour avec lien live et captures d'écran
- [ ] Ce fichier `CLAUDE.md` cohérent avec le code en production
- [ ] Compteurs de tests renseignés dans la section "Moteur de calcul"
