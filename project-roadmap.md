# Feuille de route — Application web d'analyse de données statique

Reproduire ce type de projet : **outil métier pur front (HTML/CSS/JS vanilla), déployé sur Netlify, alimenté par des données extraites d'un fichier source, avec un moteur de calcul testé et une UI accessible.**

---

## Phase 0 — Cadrage (avant d'écrire une ligne)

**Livrable : une décision par question, consignée dans CLAUDE.md.**

| Question | Ce qu'il faut trancher |
|---|---|
| Quel problème métier ? | Formuler en une phrase le besoin de l'utilisateur final |
| Quelle source de données ? | Format, provenance, contraintes de confidentialité |
| Quelle plateforme cible ? | Netlify statique = zéro backend, zéro dépendance |
| Quels algorithmes candidats ? | Lister les formules existantes (PDF, VBA, Excel…), identifier les divergences |
| Quel scope V1 ? | Nommer explicitement ce qui est **hors scope** (évite le gold-plating) |

---

## Phase 1 — Audit et choix algorithmique

**Livrable : `docs/source-analysis.md` + algorithme validé empiriquement.**

1. **Lire les sources existantes** : formule du cahier des charges, logique VBA/Excel, données brutes.
2. **Implémenter chaque variante** en isolation (aucun DOM, aucun effet de bord).
3. **Écrire les tests d'identité** : pour chaque entrée de référence, le bon résultat doit ressortir en #1.
4. **Décider sur la base des tests**, pas sur la présentation formelle — garder la variante qui passe 100 %.
5. **Documenter le rejet** des variantes écartées (raison chiffrée, pas d'opinion).

> Règle : si aucune variante ne passe, l'hypothèse sur les données est fausse — revenir à la source avant de coder l'UI.

---

## Phase 2 — Extraction et validation des données

**Livrable : fichiers JSON propres dans `data/`, script d'extraction versionné.**

1. **Un seul script d'extraction** (`scripts/extract_*.py`) — seul point d'entrée source → JSON. Idempotent (re-exécutable sans doublon).
2. **Schéma JSON fixé** avant d'écrire le script : nommer tous les champs, typer les valeurs, décider du format des cas ambigus (ex. : séparateur EN DASH vs trait d'union, `'0.15 min'` vs float).
3. **Vérification avant intégration** : compter les entrées, repérer les valeurs nulles, valider les plages (pas de composition > 100 %).
4. **Backfill** : si le schéma V2 ajoute des champs, les rétro-remplir sur les entrées V1 (`shape: []`, `type: ""`).
5. **Ajouter la source au `.gitignore`** immédiatement (`*.xlsx`, `*.xlsm`, `*.pdf`).

---

## Phase 3 — Moteur de calcul (logique pure)

**Livrable : `src/engine.js` (ou `compliance.js`) + `test/engine.test.mjs` vert à 100 %.**

- Le module ne touche pas au DOM, n'importe aucune lib.
- Chaque fonction est exportée et testable individuellement (`parseX`, `satisfies`, `score`, `rank`).
- **Tests écrits avant ou avec le code** : cas nominaux, cas limites (valeur absente, valeur nulle, ex æquo légitimes).
- Invariant d'identité : chaque entrée de référence doit se retrouver en co-top quand on lui donne sa propre composition en entrée.
- **Ne pas modifier ce fichier après validation** — noter l'interdiction dans CLAUDE.md.

---

## Phase 4 — Design system et UI (skill Impeccable)

**Livrable : `src/style.css` avec tokens OKLCH, `index.html` sémantique, UI WCAG AA.**

1. **Charger le skill Impeccable** (`/impeccable`) pour définir la direction artistique avant de toucher au CSS.
2. **Palette OKLCH** : définir les tokens couleur une seule fois en variables CSS (`--accent`, `--pass`, `--fail`, `--bg`, `--surface`…). Ne jamais écrire de couleur en dur dans les règles.
3. **Structure HTML d'abord** : `<header>`, `<nav>`, `<main>`, `<footer>` ; sections avec `aria-labelledby` ; formulaires avec labels explicites.
4. **Accessibilité non négociable** : WCAG AA sur tous les contrastes ; états focus visibles ; `aria-live` sur les zones de résultats dynamiques.
5. **Navigation par onglets ARIA** si plusieurs vues : pattern `role="tablist"` / `role="tab"` / `role="tabpanel"` + clavier (ArrowLeft/ArrowRight). Ajouter impérativement `.tabpanel[hidden]{display:none}` pour neutraliser les `display` CSS qui écraseraient l'attribut `hidden`.
6. **Couleur jamais seule** pour un état critique : badge texte + fond + bordure + texte descriptif (`X/Y met`).

---

## Phase 5 — Intégration UI ↔ moteur

**Livrable : fonctionnalité complète, testée dans un vrai navigateur.**

1. Connecter les `fetch` des JSON aux modules JS : un seul chargement au boot, mis en cache dans des variables de module.
2. Câbler les événements (submit, input, click) sans couplage fort — les handlers lisent le DOM, appellent le moteur pur, écrivent les résultats.
3. **Test navigateur obligatoire** avant de déclarer terminé : ouvrir l'app, charger l'exemple, vérifier les résultats attendus, tester le cas vide et le cas d'erreur.
4. Vérifier que les deux états d'affichage (panel visible / caché) fonctionnent — les bugs de `hidden` vs `display` ne sont visibles qu'au navigateur.

---

## Phase 6 — Tests de non-régression

**Livrable : suite de tests verte, bloquante avant tout commit.**

```
node test/engine.test.mjs      # identité 100 %
node test/compliance.test.mjs  # parsing, satisfies, tri, pondération
```

- Ajouter un test pour chaque bug trouvé au navigateur (régression).
- Les tests tournent en Node sans navigateur — pas de DOM, pas de fetch réel.
- Documenter dans CLAUDE.md les compteurs attendus (`203/203 + 183/183`) pour que tout collaborateur sache ce qui est « vert ».

---

## Phase 7 — Gestion de version et déploiement

**Livrable : commits logiques sur `master`, déploiement Netlify vérifié.**

### Stratégie de branches
- **Travail sur feature branch** (`feat/nom-court`) dès qu'une fonctionnalité dépasse un commit.
- **Rebase sur `master`** (pas de merge commit) avant de pousser : `git fetch origin && git rebase origin/master`.
- **Supprimer la branche** après merge — pas de branches orphelines.

### Commits
- Un commit = un livrable logique (extraction données / moteur / UI / tests / doc).
- Convention : `feat:`, `fix:`, `docs:`, `chore:`, `test:`.
- Ne jamais commiter : fichiers source (xlsx, xlsm, pdf), données client, clés d'API.

### Netlify
- `netlify.toml` minimal : `publish = "."`, `command = ""`.
- Le déploiement se déclenche sur push `master` — **vérifier en prod** après chaque merge significatif.
- Aucun build step → aucune dépendance npm à gérer.

---

## Phase 8 — Documentation et mémoire

**Livrable : README lisible, CLAUDE.md à jour, memory project-synthesis.md.**

| Fichier | Contenu |
|---|---|
| `README.md` | Problème, solution, lien live, stack, tests |
| `docs/source-analysis.md` | Algorithme retenu + variantes rejetées (avec preuves) |
| `docs/architecture.md` | Décisions techniques structurantes |
| `CLAUDE.md` | Contraintes projet, schémas de données, ordre d'exécution V2+ |
| `memory/project-synthesis.md` | Synthèse cross-sessions pour Claude Code |

> CLAUDE.md doit toujours refléter le code tel qu'il existe — si l'implémentation diverge de la spec initiale, **réécrire CLAUDE.md**, pas le code.

---

## Checklist finale avant livraison

- [ ] `node test/*.mjs` : 100 % vert
- [ ] Test navigateur : golden path + cas vide + cas d'erreur
- [ ] Aucun fichier sensible dans `git status`
- [ ] `netlify.toml` présent, déploiement vérifié sur l'URL live
- [ ] README à jour avec lien live fonctionnel
- [ ] CLAUDE.md cohérent avec le code en prod
