# Analyse de la source — algorithme retenu

> Objectif : reconstituer la logique de l'outil Excel/VBA d'origine, la **vérifier
> empiriquement** sur les données réelles, et figer l'algorithme implémenté dans
> `src/engine.js`.

## 1. Nature de l'instrument

L'outil surveille un **spectromètre d'émission optique (à étincelle / spark-OES)**
utilisé pour l'analyse élémentaire d'aciers et alliages en laboratoire accrédité
ISO/IEC 17025.

> Correction par rapport à la première version du `CLAUDE.md`, qui parlait à tort de
> « spectromètre de masse ». La nature des échantillons (CRM acier) et des éléments
> mesurés (C, Si, Mn, P, S, Cr, Mo, Ni, Al, Co, Cu, Nb, V, Sn…) confirme un OES.

## 2. Données source

Deux fichiers `.xlsm` (un par standard de contrôle), feuille `Analyse` :

| Fichier | Standard réel | Alias public | Éléments mesurés | Mesures |
|---|---|---|---|---|
| Rapport-1 | (anonymisé) | `STD-A` | 13 | 25 (2023-01 → 2024-01) |
| Rapport-2 | (anonymisé) | `STD-B` | 10 | 15 (2024-01 → 2024-11) |

Chaque **mesure** est la moyenne de **3 réplicats** ; l'écart-type des réplicats
sert de barre d'erreur. Les identifiants réels de standards (présents dans les
`.xlsm` et dans une table de ~55 CRM) sont remplacés par des alias neutres.

## 3. Algorithme — formules confirmées

Extraites du VBA (`Module2.bas`) puis **recoupées avec les valeurs calculées** de
la feuille `Analyse`.

### Moyenne et écart-type historiques
Pour un élément donné, sur l'ensemble des mesures du standard :
```
moyenne   = AVERAGE(mesures)
σ_hist    = STDEV(mesures)          (écart-type échantillon, n-1)
```

### z-score (par mesure)
```
z = (valeur_mesurée − valeur_certifiée) / σ_hist
```
**Vérification** (STD-A, élément C, 1ʳᵉ mesure) :
`(0,20 − 0,202) / 0,006 = −0,333` → identique à la cellule `Analyse` (−0,3333). ✔

> ⚠️ Subtilité levée : le VBA contient *deux* calculs de z (un sur la moyenne via
> `(Average − certifié)/σ`, un par mesure). Le z affiché par mesure utilise bien la
> **valeur certifiée** au numérateur, pas la moyenne — confirmé par les données.

### Limites de contrôle dynamiques
Centrées sur la **moyenne historique** (pas sur la valeur certifiée) :
```
warning_high = moyenne + 2σ_hist     warning_low = moyenne − 2σ_hist
alert_high   = moyenne + 3σ_hist     alert_low   = moyenne − 3σ_hist
```
**Vérification** (STD-A, C) : `0,2012 + 2 × 0,006 = 0,2132` → identique. ✔

### Statut par mesure
| Statut | Condition |
|---|---|
| `ok` | `|z| < 2` |
| `warning` | `2 ≤ |z| < 3` |
| `alert` | `|z| ≥ 3` |
| `insufficient_variance` | `σ_hist < 1e-9` (pas de z calculable) |
| `invalid` | valeur absente / non numérique |

### Compteurs par élément
L'outil d'origine affiche `n\N` (ex. `4\25`) : nombre de mesures en dépassement
sur le nombre total. Reproduit tel quel dans le moteur de conformité.

## 4. Variantes écartées

| Variante envisagée | Raison du rejet |
|---|---|
| z basé sur `(mesure − moyenne)/σ` | Donne −0,2 sur le 1ᵉʳ point C ; ne correspond pas à la cellule (−0,333). Rejetée. |
| Limites centrées sur la valeur certifiée | `0,202 ± 2σ` ≠ `0,2132` observé. Le VBA centre sur la moyenne. Rejetée. |
| σ théorique fixe par élément | L'outil recalcule σ sur l'historique réel à chaque ajout. Conservé : σ dynamique. |

## 5. Ambiguïtés restantes (hypothèse conservatrice appliquée)

- **Réplicats** : la valeur source est déjà une moyenne de 3 ; on conserve `replicates = 3`
  et l'écart-type fourni, sans recalculer depuis des réplicats bruts (non disponibles).
- **Éléments non mesurés** : un élément est inclus seulement si la ligne `Lectures`
  vaut `OK` **et** qu'une valeur certifiée existe. Sinon il est ignoré pour ce standard.
- **Maintenance** : fichier source confidentiel non fourni → jeu **fictif** dans
  `data/maintenance.json` (plan préventif + historique), aligné sur la période réelle.
