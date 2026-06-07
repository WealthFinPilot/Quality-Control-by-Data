// app.js — orchestration UI. Lit le DOM, appelle le moteur pur, écrit les résultats.
// Aucune dépendance externe. Graphiques en SVG natif.

import { analyzeStandard } from "./engine.js";
import {
  statusLabel,
  maintenanceInRange,
  dateRange,
  limitsContext,
  nearestMaintenanceAfter,
} from "./compliance.js";

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
function frMonth(iso) { const d = new Date(iso); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }

// Noms complets en français des éléments chimiques rencontrés.
const ELEMENT_NAMES = {
  C: "Carbone", Si: "Silicium", Mn: "Manganèse", P: "Phosphore", S: "Soufre",
  Cr: "Chrome", Mo: "Molybdène", Ni: "Nickel", Al: "Aluminium", Co: "Cobalt",
  Cu: "Cuivre", Nb: "Niobium", V: "Vanadium", W: "Tungstène", Sn: "Étain",
  Pb: "Plomb", B: "Bore", Mg: "Magnésium", Zn: "Zinc", Fe: "Fer", Ti: "Titane",
  Ag: "Argent",
};

const SVG_NS = "http://www.w3.org/2000/svg";
const STATUS_GLYPH = { ok: "●", warning: "▲", alert: "■", insufficient_variance: "○", invalid: "○" };

const state = {
  crm: null,
  maintenance: null,
  standardId: null,
  analysis: null,
  element: null,
};

// ---------- Utilitaires ----------
const $ = (sel) => document.querySelector(sel);

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

function svg(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

// Formatage numérique adaptatif (les très petites valeurs gardent assez de décimales).
function fmt(x, ref = Math.abs(x)) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  if (ref === 0) return "0";
  if (ref < 0.01) return x.toFixed(4);
  if (ref < 1) return x.toFixed(3);
  if (ref < 100) return x.toFixed(2);
  return x.toFixed(1);
}

function badge(status) {
  return el("span", { class: "badge", "data-status": status }, [
    el("span", { class: "glyph", "aria-hidden": "true" }, STATUS_GLYPH[status] || "○"),
    statusLabel(status),
  ]);
}

// Statut courant d'un élément = statut de sa dernière mesure valide.
// Le statut historique (e.status) couvre toute la période — trop alarmant pour le tableau de bord.
function getCurrentStatus(e) {
  for (let i = e.series.length - 1; i >= 0; i--) {
    const p = e.series[i];
    if (p.status !== "invalid" && p.status !== "insufficient_variance") return p.status;
  }
  return e.status;
}

// Verdict de maîtrise d'un élément pour la synthèse du rapport.
// On NE colore PAS en rouge le pire cas historique : un écart ponctuel détecté puis
// corrigé prouve que la surveillance fonctionne, ce n'est pas une perte de maîtrise.
//
// « % conforme » = mesures dans les limites d'ACTION (±3σ). En MSP, ±2σ est une limite
// de SURVEILLANCE (warning), pas un rejet : un point « à surveiller » reste conforme.
// Conséquence voulue : un élément ultra-stable dont tous les points sont à surveiller
// à cause d'un biais minime n'est pas affiché à 0 % conforme — son biais est signalé à part.
function elementVerdict(e) {
  const tight = limitsContext(e).tight;
  const real = e.series.filter((p) => p.status === "ok" || p.status === "warning" || p.status === "alert");
  const alerts = real.filter((p) => p.status === "alert").length;
  const rate = real.length ? ((real.length - alerts) / real.length) * 100 : 100;
  const current = getCurrentStatus(e);
  // Biais moyen relatif à la valeur certifiée (signe = direction).
  const biasRel = e.certified ? ((e.mean - e.certified) / e.certified) * 100 : 0;
  if (tight) return { status: "ok", label: "Stable", rate, biasRel, tight: true };
  if (current === "alert") return { status: "alert", label: "À corriger", rate, biasRel, tight: false };
  if (current === "warning") return { status: "warning", label: "À surveiller", rate, biasRel, tight: false };
  return { status: "ok", label: "Maîtrisé", rate, biasRel, tight: false };
}

function verdictBadge(v) {
  return el("span", { class: "badge", "data-status": v.status }, [
    el("span", { class: "glyph", "aria-hidden": "true" }, STATUS_GLYPH[v.status] || "○"),
    v.label,
  ]);
}

// Bilan de confiance global : taux de mesures restées dans les limites sur toute la période.
// Les écarts purement statistiques (éléments quasi constants, limites trop serrées) sont
// comptés à part : ils ne traduisent pas un vrai problème de mesure.
function confidenceReport(a) {
  let total = 0, realFlagged = 0, statFlagged = 0, alerts = 0;
  for (const e of a.elements) {
    const tight = limitsContext(e).tight;
    for (const p of e.series) {
      if (p.status === "ok" || p.status === "warning" || p.status === "alert") {
        total += 1;
        if (p.status === "warning" || p.status === "alert") {
          if (tight) { statFlagged += 1; }
          else { realFlagged += 1; if (p.status === "alert") alerts += 1; }
        }
      }
    }
  }
  const rate = total ? (1 - realFlagged / total) * 100 : 100;
  let level, title;
  if (rate >= 96) { level = "ok"; title = "Confiance élevée"; }
  else if (rate >= 92) { level = "ok"; title = "Confiance satisfaisante"; }
  else if (rate >= 88) { level = "warning"; title = "Confiance correcte, à surveiller"; }
  else { level = "warning"; title = "Confiance à confirmer"; }
  return { level, title, rate, total, realFlagged, statFlagged, alerts };
}

// Construit le récit « ce qui a coincé et comment ça a été réglé ».
// Sépare les vraies dérives (corrélées à une maintenance) des écarts purement
// statistiques sur éléments quasi constants (limites trop serrées).
function buildIncidents(a, events) {
  const real = [];
  const statistical = [];
  for (const e of a.elements) {
    const flagged = e.series.filter((p) => p.status === "warning" || p.status === "alert");
    if (!flagged.length) continue;
    if (limitsContext(e).tight) { statistical.push(e); continue; }

    const hasAlert = flagged.some((p) => p.status === "alert");
    // Un incident vaut d'être raconté s'il y a une alerte ou un motif (≥ 2 écarts).
    // Un écart isolé sur une longue série reste du bruit, déjà visible dans la synthèse.
    if (!hasAlert && flagged.length < 2) continue;

    const firstDrift = flagged[0].date;
    const fix = nearestMaintenanceAfter(firstDrift, events, 75);
    let resolved = false;
    if (fix) {
      const fixT = new Date(fix.date).getTime();
      // La première mesure valide après l'intervention est-elle revenue dans les limites ?
      const next = e.series.find((p) =>
        new Date(p.date).getTime() > fixT &&
        (p.status === "ok" || p.status === "warning" || p.status === "alert"));
      resolved = next ? next.status === "ok" : false;
    }
    real.push({ e, count: flagged.length, firstDrift, hasAlert, fix, resolved });
  }
  return { real, statistical };
}

// ---------- Tooltip ----------
const tooltip = $("#tooltip");
function showTooltip(html, x, y) {
  tooltip.innerHTML = html;
  tooltip.dataset.show = "true";
  const pad = 12;
  let left = x + pad;
  let top = y + pad;
  const r = tooltip.getBoundingClientRect();
  if (left + r.width > window.innerWidth - 8) left = x - r.width - pad;
  if (top + r.height > window.innerHeight - 8) top = y - r.height - pad;
  tooltip.style.left = `${Math.max(8, left)}px`;
  tooltip.style.top = `${Math.max(8, top)}px`;
}
function hideTooltip() { tooltip.dataset.show = "false"; }

// ---------- Chargement ----------
async function boot() {
  try {
    const [crm, maintenance] = await Promise.all([
      fetch("data/crm_data.json").then((r) => r.json()),
      fetch("data/maintenance.json").then((r) => r.json()),
    ]);
    state.crm = crm;
    state.maintenance = maintenance;
    state.standardId = crm.standards[0].id;
    initStandardPicker();
    initTabs();
    renderMaintenance();
    $("#print-btn").addEventListener("click", () => window.print());
    selectStandard(state.standardId);
    $("#app").setAttribute("aria-busy", "false");
  } catch (err) {
    $("#app").innerHTML =
      `<p role="alert" style="padding:2rem 0;color:var(--alert)">Impossible de charger les données (${err.message}). Vérifiez que l'app est servie via un serveur HTTP.</p>`;
  }
}

// ---------- Sélecteur de standard ----------
function initStandardPicker() {
  const sel = $("#std-select");
  sel.innerHTML = "";
  for (const s of state.crm.standards) {
    sel.appendChild(el("option", { value: s.id }, s.id));
  }
  sel.addEventListener("change", () => selectStandard(sel.value));
}

function selectStandard(id) {
  state.standardId = id;
  $("#std-select").value = id;
  const standard = state.crm.standards.find((s) => s.id === id);
  state.analysis = analyzeStandard(standard);
  state.element = state.analysis.elements[0]?.element ?? null;
  renderOverview();
  initElementPicker();
  renderDetail();
  renderReport();
}

// ---------- Vue 1 : vue d'ensemble ----------
// Dates de mesure distinctes du standard courant, triées : pas du curseur temporel.
let overviewDates = [];

// État d'un élément jusqu'à une date butoir : statut courant (dernière mesure valide
// ≤ butoir) + comptes cumulés. Réutilise les limites calculées sur tout l'historique.
function elementStateUpTo(e, cutoffT) {
  const pts = e.series.filter((p) => new Date(p.date).getTime() <= cutoffT);
  let cur = "ok", valid = false;
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    if (p.status !== "invalid" && p.status !== "insufficient_variance") { cur = p.status; valid = true; break; }
  }
  return {
    cur: valid ? cur : "ok",
    warnings: pts.filter((p) => p.status === "warning").length,
    alerts: pts.filter((p) => p.status === "alert").length,
    total: pts.length,
  };
}

function renderOverview() {
  const a = state.analysis;
  const standard = state.crm.standards.find((s) => s.id === a.id);
  overviewDates = [...new Set(standard.measurements.map((m) => m.date).filter(Boolean))].sort();

  const scrub = $("#timescrub");
  const range = $("#time-range");
  const lastIdx = overviewDates.length - 1;
  if (overviewDates.length > 1) {
    scrub.hidden = false;
    range.min = "0";
    range.max = String(lastIdx);
    range.step = "1";
    range.value = String(lastIdx);
    $("#time-start").textContent = frMonth(overviewDates[0]);
    $("#time-end").textContent = frMonth(overviewDates[lastIdx]);
    range.oninput = () => paintOverview(Number(range.value));
  } else {
    scrub.hidden = true;
  }
  paintOverview(lastIdx);
}

// Peint verdict + compteurs + tuiles pour la date butoir overviewDates[idx].
// Appelé à chaque mouvement du curseur sans reconstruire le curseur lui-même.
function paintOverview(idx) {
  const a = state.analysis;
  const cutoff = overviewDates[idx] ?? overviewDates[overviewDates.length - 1] ?? null;
  const cutoffT = cutoff ? new Date(cutoff).getTime() : Infinity;
  const isLatest = idx >= overviewDates.length - 1;

  if (cutoff) $("#time-label").textContent = frMonth(cutoff);

  const states = a.elements.map((e) => elementStateUpTo(e, cutoffT));
  const nowInAlert = states.filter((s) => s.cur === "alert").length;
  const nowInWarning = states.filter((s) => s.cur === "warning").length;

  let verdictStatus = "ok";
  if (nowInAlert > 0) verdictStatus = "alert";
  else if (nowInWarning > 0) verdictStatus = "warning";

  const verdictTitles = { ok: "Sous contrôle", warning: "À surveiller", alert: "Anomalie détectée" };
  const verdictPlains = {
    ok: "La dernière mesure de chaque élément est conforme aux limites de contrôle.",
    warning: `${nowInWarning} élément${nowInWarning > 1 ? "s" : ""} s'écarte légèrement lors de la dernière mesure.`,
    alert: `${nowInAlert} élément${nowInAlert > 1 ? "s" : ""} dépasse les limites sur la dernière mesure — vérification recommandée.`,
  };

  $("#verdict").dataset.status = verdictStatus;
  $("#verdict-title").textContent = verdictTitles[verdictStatus];
  const $plain = $("#verdict-plain");
  $plain.textContent = verdictPlains[verdictStatus];
  $plain.appendChild(el("small", { class: "verdict-date" },
    ` — état au ${cutoff || "—"}${isLatest ? " (dernier contrôle)" : ""}`));

  const counters = $("#counters");
  counters.innerHTML = "";
  const items = [
    { kind: "neutral", num: a.totals.elementCount, lbl: "éléments suivis", icon: null, action: null },
    { kind: "warn",    num: nowInWarning, lbl: "à surveiller", icon: "▲", action: null },
    { kind: "alert",   num: nowInAlert,   lbl: "anomalies",    icon: "■", action: nowInAlert > 0 ? "Prendre action ⚠️" : null },
  ];
  for (const it of items) {
    counters.appendChild(
      el("div", { class: "counter", "data-kind": it.kind }, [
        el("span", { class: "counter-row" }, [
          el("span", { class: "num" }, String(it.num)),
          it.icon ? el("span", { "aria-hidden": "true", class: "counter-icon" }, it.icon) : null,
        ]),
        el("span", { class: "lbl" }, it.lbl),
        it.action ? el("span", { class: "counter-action" }, it.action) : null,
      ])
    );
  }

  const grid = $("#element-grid");
  grid.innerHTML = "";
  for (let i = 0; i < a.elements.length; i++) {
    const e = a.elements[i];
    const st = states[i];
    const outCount = st.warnings + st.alerts;
    const card = el("button", {
      class: "el-card",
      type: "button",
      "aria-label": `${ELEMENT_NAMES[e.element] || e.element} : ${statusLabel(st.cur)}. Voir le détail.`,
      onclick: () => { state.element = e.element; $("#el-select").value = e.element; selectTab("detail"); renderDetail(); },
    }, [
      el("div", { class: "el-top" }, [
        el("span", { class: "sym" }, e.element),
        badge(st.cur),
      ]),
      el("span", { class: "name" }, ELEMENT_NAMES[e.element] || e.element),
      el("span", { class: "el-cert" }, `Certifié : ${fmt(e.certified)} %`),
      el("span", { class: "el-cert" }, [
        `${outCount}/${st.total}`,
        el("span", { "aria-hidden": "true" }, outCount > 0 ? " ▲" : " ●"),
      ]),
    ]);
    grid.appendChild(card);
  }
}

// ---------- Vue 2 : détail ----------
function initElementPicker() {
  const sel = $("#el-select");
  sel.innerHTML = "";
  for (const e of state.analysis.elements) {
    sel.appendChild(el("option", { value: e.element }, `${e.element} — ${ELEMENT_NAMES[e.element] || e.element}`));
  }
  sel.value = state.element;
  sel.onchange = () => {
    state.element = sel.value;
    renderDetail();
    history.replaceState(null, "", `#detail/${state.element}`);
  };
}

function renderDetail() {
  const e = state.analysis.elements.find((x) => x.element === state.element);
  if (!e) return;
  $("#detail-sym").textContent = e.element;
  $("#detail-full").textContent = ELEMENT_NAMES[e.element] || e.element;

  const plainByStatus = {
    ok: "Les mesures restent proches de la valeur attendue. Rien à signaler.",
    warning: "Quelques mesures s'écartent un peu : à garder à l'œil.",
    alert: "Des mesures sortent des limites : une vérification s'impose.",
    insufficient_variance: "Les mesures sont quasi identiques : pas assez de variation pour juger.",
  };
  $("#detail-plain").textContent = plainByStatus[e.status] || "";

  const note = limitsContext(e);
  const noteBox = $("#detail-note");
  if (note.tight) {
    noteBox.hidden = false;
    noteBox.innerHTML = `<strong>Limites très serrées.</strong> ${note.note}`;
  } else {
    noteBox.hidden = true;
    noteBox.textContent = "";
  }

  renderChart(e);
  renderExpert(e);
  renderTable(e);
}

function renderExpert(e) {
  const host = $("#expert-stats");
  host.innerHTML = "";
  const stats = [
    ["Valeur certifiée (cible)", `${fmt(e.certified)} %`],
    ["Moyenne mesurée", `${fmt(e.mean)} %`],
    ["Écart-type σ (historique)", fmt(e.sigma, e.sigma)],
    ["Nombre de mesures (n)", String(e.n)],
    ["Limites ±2σ", `${fmt(e.limits.warningLow)} – ${fmt(e.limits.warningHigh)}`],
    ["Limites ±3σ", `${fmt(e.limits.alertLow)} – ${fmt(e.limits.alertHigh)}`],
  ];
  for (const [k, v] of stats) {
    host.appendChild(el("div", { class: "stat" }, [
      el("span", { class: "k" }, k),
      el("span", { class: "v" }, v),
    ]));
  }
  $("#expert-formula").textContent =
    `z = (valeur mesurée − valeur certifiée) / σ_historique\n` +
    `  = (x − ${fmt(e.certified)}) / ${fmt(e.sigma, e.sigma)}`;
}

function renderTable(e) {
  const tb = $("#detail-tbody");
  tb.innerHTML = "";
  for (const p of e.series) {
    const rel = p.bias && p.bias.relative !== null ? ` (${p.bias.relative >= 0 ? "+" : ""}${p.bias.relative.toFixed(1)} %)` : "";
    tb.appendChild(el("tr", { "data-status": p.status }, [
      el("td", {}, p.date),
      el("td", { class: "num" }, p.value === null ? "—" : fmt(p.value)),
      el("td", { class: "num" }, p.bias ? `${p.bias.absolute >= 0 ? "+" : ""}${fmt(p.bias.absolute, Math.abs(p.bias.absolute))}${rel}` : "—"),
      el("td", { class: "num" }, p.z === null ? "—" : (p.z >= 0 ? "+" : "") + p.z.toFixed(2)),
      el("td", {}, badge(p.status)),
    ]));
  }
}

// ---------- Carte de contrôle SVG ----------
function renderChart(e) {
  const host = $("#chart-host");
  host.innerHTML = "";
  const node = buildChart(e);
  host.appendChild(node);
  if (node.tagName === "svg") renderLegend();
  else $("#chart-legend").innerHTML = "";
}

// Construit la carte de contrôle SVG d'un élément (réutilisée par le rapport).
// Retourne un <svg> ou un <p> de repli.
function buildChart(e, interactive = true) {
  const points = e.series.filter((p) => p.value !== null);
  if (points.length === 0 || e.status === "insufficient_variance") {
    return el("p", { class: "muted", style: "padding:1.5rem 0.5rem;" },
      e.status === "insufficient_variance"
        ? "Mesures quasi identiques : la carte de contrôle n'apporte rien ici."
        : "Aucune mesure exploitable pour cet élément.");
  }

  const W = 760, H = 320;
  const m = { top: 18, right: 16, bottom: 40, left: 64 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  const times = points.map((p) => new Date(p.date).getTime());
  const t0 = Math.min(...times), t1 = Math.max(...times);
  const span = t1 - t0 || 1;

  // Domaine Y : englobe les limites ±3σ et les valeurs (± barre d'erreur).
  let yMin = Math.min(e.limits.alertLow, ...points.map((p) => p.value - (p.std || 0)));
  let yMax = Math.max(e.limits.alertHigh, ...points.map((p) => p.value + (p.std || 0)));
  const padY = (yMax - yMin) * 0.08 || Math.abs(yMax) * 0.1 || 1;
  yMin -= padY; yMax += padY;

  const xOf = (t) => m.left + ((t - t0) / span) * iw;
  const yOf = (v) => m.top + (1 - (v - yMin) / (yMax - yMin)) * ih;

  const root = svg("svg", {
    class: "chart-svg", viewBox: `0 0 ${W} ${H}`,
    role: "img",
    "aria-label": `Carte de contrôle de ${ELEMENT_NAMES[e.element] || e.element} : ${points.length} mesures, statut ${statusLabel(e.status)}.`,
  });

  // Bandes ±2σ et ±3σ
  root.appendChild(svg("rect", {
    class: "band-3", x: m.left, y: yOf(e.limits.alertHigh),
    width: iw, height: yOf(e.limits.alertLow) - yOf(e.limits.alertHigh),
  }));
  root.appendChild(svg("rect", {
    class: "band-2", x: m.left, y: yOf(e.limits.warningHigh),
    width: iw, height: yOf(e.limits.warningLow) - yOf(e.limits.warningHigh),
  }));

  // Grille Y + libellés
  const yTicks = niceTicks(yMin, yMax, 5);
  for (const v of yTicks) {
    const y = yOf(v);
    root.appendChild(svg("line", { class: "grid-line", x1: m.left, y1: y, x2: m.left + iw, y2: y }));
    root.appendChild(svg("text", { class: "axis-text", x: m.left - 8, y: y + 3, "text-anchor": "end" }, fmt(v)));
  }

  // Lignes de limites + moyenne
  const hline = (v, cls) => svg("line", { class: cls, x1: m.left, y1: yOf(v), x2: m.left + iw, y2: yOf(v) });
  root.appendChild(hline(e.limits.alertHigh, "limit-3"));
  root.appendChild(hline(e.limits.alertLow, "limit-3"));
  root.appendChild(hline(e.limits.warningHigh, "limit-2"));
  root.appendChild(hline(e.limits.warningLow, "limit-2"));
  root.appendChild(hline(e.mean, "mean-line"));

  // Axe X : quelques dates
  const xTickCount = Math.min(6, points.length);
  for (let i = 0; i < xTickCount; i++) {
    const t = t0 + (span * i) / Math.max(1, xTickCount - 1);
    const x = xOf(t);
    const d = new Date(t).toISOString().slice(0, 7);
    root.appendChild(svg("text", { class: "axis-text", x, y: H - 22, "text-anchor": "middle" }, d));
  }
  root.appendChild(svg("line", { class: "axis-line", x1: m.left, y1: m.top + ih, x2: m.left + iw, y2: m.top + ih }));

  // Overlay maintenance (lignes verticales + zone de survol)
  const range = dateRange(e);
  const events = maintenanceInRange(state.maintenance.events, range.start, range.end);
  for (const ev of events) {
    const x = xOf(new Date(ev.date).getTime());
    root.appendChild(svg("line", { class: "maint-line", x1: x, y1: m.top, x2: x, y2: m.top + ih }));
    if (!interactive) continue;
    const hit = svg("rect", { class: "maint-hit", x: x - 5, y: m.top, width: 10, height: ih });
    hit.addEventListener("mouseenter", (ePtr) => showTooltip(
      `<strong>${ev.type || "Maintenance"}</strong><br><span class="tt-mono">${ev.date}</span>` +
      (ev.task ? `<br>${ev.task}` : "") + (ev.notes ? `<br>${ev.notes}` : ""),
      ePtr.clientX, ePtr.clientY));
    hit.addEventListener("mousemove", (ePtr) => showTooltip(tooltip.innerHTML, ePtr.clientX, ePtr.clientY));
    hit.addEventListener("mouseleave", hideTooltip);
    root.appendChild(hit);
  }

  // Points + barres d'erreur
  for (const p of points) {
    const x = xOf(new Date(p.date).getTime());
    const y = yOf(p.value);
    if (p.std) {
      root.appendChild(svg("line", { class: "errbar", x1: x, y1: yOf(p.value - p.std), x2: x, y2: yOf(p.value + p.std) }));
    }
    const dot = svg("circle", { class: `pt-${p.status}`, cx: x, cy: y, r: 4 });
    if (interactive) {
      dot.addEventListener("mouseenter", (ePtr) => showTooltip(
        `<span class="tt-mono">${p.date}</span><br><strong>${fmt(p.value)} %</strong>` +
        `<br>z = ${p.z === null ? "—" : p.z.toFixed(2)} · ${statusLabel(p.status)}`,
        ePtr.clientX, ePtr.clientY));
      dot.addEventListener("mousemove", (ePtr) => showTooltip(tooltip.innerHTML, ePtr.clientX, ePtr.clientY));
      dot.addEventListener("mouseleave", hideTooltip);
    }
    root.appendChild(dot);
  }

  return root;
}

function renderLegend() {
  const lg = $("#chart-legend");
  lg.innerHTML = "";
  const swatch = (color, dash) => {
    const s = el("span", { class: "lg-swatch" });
    s.style.borderTopColor = `var(${color})`;
    if (dash) s.style.borderTopStyle = "dashed";
    return s;
  };
  const items = [
    [swatch("--ink"), "Moyenne"],
    [swatch("--warn", true), "Limites ±2σ (à surveiller)"],
    [swatch("--alert", true), "Limites ±3σ (anomalie)"],
    [swatch("--accent", true), "Maintenance"],
  ];
  for (const [sw, label] of items) {
    lg.appendChild(el("span", {}, [sw, label]));
  }
  lg.appendChild(el("span", {}, [
    el("span", { class: "badge", "data-status": "ok", style: "padding:0 0.4rem" }, "● point = mesure (moyenne de 3)"),
  ]));
}

function niceTicks(min, max, count) {
  const range = max - min || 1;
  const raw = range / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(v);
  return ticks;
}

// ---------- Vue 3 : maintenance ----------
function renderMaintenance() {
  const M = state.maintenance;
  $("#maint-purpose").textContent = M.purpose || "";

  // Procédures (routine / complète)
  const proc = $("#procedures");
  proc.innerHTML = "";
  for (const p of M.procedures || []) {
    proc.appendChild(el("div", { style: "margin-bottom:0.6rem;" }, [
      el("strong", {}, `${p.name} — `),
      el("span", { class: "muted" }, `${p.frequency} · ${p.steps.length} étapes`),
      el("p", { class: "muted", style: "font-size:0.85rem; margin-top:0.15rem;" }, p.plain || ""),
    ]));
  }

  // Catalogue des tâches
  const tb = $("#plan-tbody");
  tb.innerHTML = "";
  const sorted = [...M.preventive_plan].sort((a, b) =>
    (b.impact === "élevé") - (a.impact === "élevé"));
  for (const t of sorted) {
    const level = t.routine ? "Routine + complète" : "Complète";
    tb.appendChild(el("tr", {}, [
      el("td", {}, [
        el("strong", {}, t.task),
        el("div", { class: "muted", style: "font-size:0.8rem;" }, t.plain || ""),
      ]),
      el("td", { class: "freq" }, level),
      el("td", {}, t.impact === "élevé"
        ? el("span", { class: "badge", "data-status": "alert", title: t.description }, [
            el("span", { class: "glyph", "aria-hidden": "true" }, "●"), "Élevé"])
        : el("span", { class: "muted" }, "Standard")),
    ]));
  }

  // Historique
  const tl = $("#maint-timeline");
  tl.innerHTML = "";
  const events = [...M.events].sort((a, b) => new Date(b.date) - new Date(a.date));
  for (const ev of events) {
    tl.appendChild(el("li", {}, [
      el("span", { class: "date" }, ev.date),
      el("div", {}, [
        el("div", { class: "task" }, ev.type || ev.task || "Intervention"),
        el("div", { class: "notes" }, [
          ev.task && ev.type ? `${ev.task} · ` : "",
          ev.notes || "",
          ev.technician ? ` — ${ev.technician}` : "",
        ].join("")),
      ]),
    ]));
  }
}

// ---------- Vue 4 : rapport imprimable ----------
const LINKEDIN = "https://www.linkedin.com/in/s%C3%A9bastien-oger-49009382/";

function renderReport() {
  const a = state.analysis;
  const standard = state.crm.standards.find((s) => s.id === a.id);
  const host = $("#report-body");
  host.innerHTML = "";

  // Période couverte (toutes mesures confondues).
  const allDates = standard.measurements.map((m) => m.date).filter(Boolean).sort();
  const period = allDates.length ? `${allDates[0]} → ${allDates[allDates.length - 1]}` : "—";
  const today = new Date().toISOString().slice(0, 10);

  // En-tête du rapport avec l'image atome.
  host.appendChild(el("header", { class: "report-head" }, [
    el("img", { src: "assets/atome.png", alt: "", class: "report-logo", width: "72", height: "48" }),
    el("div", {}, [
      el("span", { class: "iso-mark" }, "ISO/IEC 17025"),
      el("h2", {}, "Rapport de contrôle de déviation"),
      el("p", { class: "muted" }, "Spectromètre d'émission optique — surveillance de la justesse"),
    ]),
  ]));

  // Métadonnées.
  const meta = el("dl", { class: "report-meta" });
  const addMeta = (k, v) => { meta.appendChild(el("dt", {}, k)); meta.appendChild(el("dd", { class: "mono" }, v)); };
  addMeta("Échantillon de référence", a.id);
  addMeta("Période analysée", period);
  addMeta("Nombre de mesures", String(standard.measurements.length));
  addMeta("Éléments suivis", String(a.totals.elementCount));
  addMeta("Édité le", today);
  host.appendChild(meta);

  // Bilan de confiance global (peut-on faire confiance à cette machine ?).
  const conf = confidenceReport(a);
  host.appendChild(el("h3", { class: "section-title" }, "Bilan de confiance"));
  host.appendChild(el("div", { class: "report-verdict", "data-status": conf.level }, [
    el("strong", {}, conf.title),
    document.createTextNode(
      ` — sur l'ensemble de la période, ${conf.rate.toFixed(1)} % des ${conf.total} mesures sont restées ` +
      `dans les limites de contrôle. La machine présente une bonne reproductibilité et reste maîtrisée par le laboratoire.`),
    el("p", { class: "muted", style: "font-size:0.8rem; margin-top:0.4rem;" },
      `${conf.realFlagged} mesure(s) ont demandé une vraie attention sur la période` +
      `${conf.alerts ? `, dont ${conf.alerts} dépassement(s) marqué(s)` : ""}. ` +
      (conf.statFlagged
        ? `${conf.statFlagged} autre(s) écart(s) sont purement statistiques (éléments quasi constants, voir plus bas). `
        : "") +
      `Pour l'état actuel de l'appareil, consulter le tableau de bord principal.`),
  ]));

  // Tableau de synthèse — la couleur reflète la maîtrise réelle, pas le pire cas historique.
  host.appendChild(el("h3", { class: "section-title" }, "Synthèse par élément"));
  host.appendChild(el("p", { class: "muted", style: "max-width:74ch; margin-bottom:0.8rem; font-size:0.85rem;" },
    "« % conforme » = mesures restées dans les limites d'action (±3σ) ; un point « à surveiller » "
    + "(±2σ) reste conforme. La colonne « Maîtrise » traduit l'état réel : un écart isolé puis corrigé "
    + "ne dégrade pas la maîtrise. Le détail factuel figure plus bas."));
  const thead = el("thead", {}, el("tr", {}, [
    el("th", { scope: "col" }, "Élément"),
    el("th", { scope: "col" }, "Certifié"),
    el("th", { scope: "col" }, "Moyenne"),
    el("th", { scope: "col" }, "σ"),
    el("th", { scope: "col" }, "n"),
    el("th", { scope: "col" }, "% conforme"),
    el("th", { scope: "col" }, "Maîtrise"),
  ]));
  const tbody = el("tbody");
  for (const e of a.elements) {
    const v = elementVerdict(e);
    tbody.appendChild(el("tr", { "data-status": v.status }, [
      el("td", {}, `${e.element} — ${ELEMENT_NAMES[e.element] || e.element}`),
      el("td", { class: "num" }, fmt(e.certified)),
      el("td", { class: "num" }, fmt(e.mean)),
      el("td", { class: "num" }, fmt(e.sigma, e.sigma)),
      el("td", { class: "num" }, String(e.n)),
      el("td", { class: "num" }, `${v.rate.toFixed(0)} %`),
      el("td", {}, verdictBadge(v)),
    ]));
  }
  host.appendChild(el("div", { class: "table-scroll" }, el("table", {}, [thead, tbody])));

  // Récit : ce qui a demandé une intervention, et comment ça a été réglé.
  const incidents = buildIncidents(a, state.maintenance.events);
  host.appendChild(el("h3", { class: "section-title" }, "Ce qui a demandé une intervention"));
  host.appendChild(el("p", { class: "muted", style: "max-width:70ch; margin-bottom:0.8rem; font-size:0.85rem;" },
    "Quelques écarts au cours de la période sont normaux pour un appareil suivi en continu. " +
    "L'essentiel est qu'ils soient détectés tôt et corrigés."));

  if (incidents.real.length === 0) {
    host.appendChild(el("p", { class: "muted" },
      "Aucune dérive réelle nécessitant une correction sur la période."));
  } else {
    const ul = el("ul", { class: "incidents" });
    for (const inc of incidents.real) {
      const name = ELEMENT_NAMES[inc.e.element] || inc.e.element;
      const sev = inc.hasAlert ? "des mesures hors limites (±3σ)" : "un écart à surveiller (±2σ)";
      const fixTxt = inc.fix
        ? `Intervention : ${inc.fix.type || "maintenance"} du ${inc.fix.date}${inc.fix.notes ? ` — ${inc.fix.notes}` : ""}.`
        : "Aucune intervention directement corrélée trouvée dans la fenêtre suivante.";
      const resTxt = inc.resolved
        ? " Les mesures suivantes sont revenues dans les limites."
        : (inc.fix ? " À confirmer sur les mesures suivantes." : "");
      ul.appendChild(el("li", {}, [
        el("strong", {}, `${inc.e.element} (${name}) — ${frMonth(inc.firstDrift)}`),
        el("div", { style: "font-size:0.88rem;" },
          `${inc.count} mesure(s) avec ${sev}. ${fixTxt}${resTxt}`),
      ]));
    }
    host.appendChild(ul);
  }

  if (incidents.statistical.length) {
    const box = el("div", { class: "callout", style: "max-width:74ch;" });
    box.appendChild(el("p", {}, [
      el("strong", {}, "À distinguer des vraies dérives — biais stables, connus et maîtrisés. "),
      "Ces éléments sont si reproductibles que leurs limites de surveillance (±2σ) se resserrent à " +
      "quelques millièmes. Un biais systématique minime suffit alors à les placer « à surveiller », " +
      "sans jamais franchir la limite d'action (±3σ) : ce n'est pas une non-conformité, mais un écart " +
      "faible et constant, possiblement inférieur à l'incertitude de mesure de l'appareil.",
    ]));
    const ul = el("ul", { class: "bias-list" });
    for (const e of incidents.statistical) {
      const v = elementVerdict(e);
      const abs = e.mean - e.certified;
      const dir = v.biasRel > 0 ? "haussier" : v.biasRel < 0 ? "baissier" : "neutre";
      ul.appendChild(el("li", {}, [
        el("strong", {}, `${e.element} (${ELEMENT_NAMES[e.element] || e.element})`),
        ` : biais ${dir} de ${v.biasRel >= 0 ? "+" : ""}${v.biasRel.toFixed(1)} % ` +
        `(${abs >= 0 ? "+" : ""}${fmt(abs, Math.abs(abs))} en absolu) — ` +
        `${v.rate.toFixed(0)} % des mesures dans les limites d'action.`,
      ]));
    }
    box.appendChild(ul);
    host.appendChild(box);
  }

  // Cartes de contrôle des éléments réellement concernés (cohérent avec le récit des incidents).
  const drifting = incidents.real.map((inc) => inc.e);
  host.appendChild(el("h3", { class: "section-title" },
    drifting.length ? "Cartes de contrôle des éléments concernés" : "Cartes de contrôle"));
  if (drifting.length === 0) {
    host.appendChild(el("p", { class: "muted" }, "Aucune dérive réelle sur la période : la machine est restée sous contrôle."));
  } else {
    const charts = el("div", { class: "report-charts" });
    for (const e of drifting) {
      const ctx = limitsContext(e);
      const fig = el("figure", { class: "report-chart" }, [
        el("figcaption", {}, `${e.element} — ${ELEMENT_NAMES[e.element] || e.element} · ${statusLabel(e.status)}`),
        buildChart(e, false),
      ]);
      if (ctx.tight) {
        fig.appendChild(el("p", { class: "callout callout-sm" },
          [el("strong", {}, "Limites très serrées. "), ctx.note]));
      }
      charts.appendChild(fig);
    }
    host.appendChild(charts);
  }

  // Maintenance sur la période.
  const evts = maintenanceInRange(state.maintenance.events, allDates[0], allDates[allDates.length - 1]);
  host.appendChild(el("h3", { class: "section-title" }, "Interventions de maintenance sur la période"));
  if (evts.length === 0) {
    host.appendChild(el("p", { class: "muted" }, "Aucune intervention enregistrée sur la période."));
  } else {
    const ul = el("ul", { class: "report-maint" });
    for (const ev of evts) {
      ul.appendChild(el("li", {}, [
        el("span", { class: "mono" }, ev.date), document.createTextNode("  "),
        el("strong", {}, ev.type || ev.task || "Intervention"),
        document.createTextNode(ev.notes ? ` — ${ev.notes}` : ""),
      ]));
    }
    host.appendChild(ul);
  }

  // Pied de rapport.
  host.appendChild(el("footer", { class: "report-foot" }, [
    el("span", {}, "Sébastien Oger — Quality Manager. "),
    el("a", { href: LINKEDIN, target: "_blank", rel: "noopener" }, "Profil LinkedIn"),
    el("span", { class: "muted" }, " · Données anonymisées, maintenance fictive (démonstration de portfolio)."),
  ]));
}

// ---------- Onglets ARIA ----------
const TABS = ["overview", "detail", "maint", "report"];
function initTabs() {
  const tablist = document.querySelectorAll('[role="tab"]');
  tablist.forEach((tab) => {
    tab.addEventListener("click", () => selectTab(tab.id.replace("tab-", "")));
    tab.addEventListener("keydown", (e) => {
      const idx = TABS.indexOf(tab.id.replace("tab-", ""));
      let next = null;
      if (e.key === "ArrowRight") next = (idx + 1) % TABS.length;
      else if (e.key === "ArrowLeft") next = (idx - 1 + TABS.length) % TABS.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = TABS.length - 1;
      if (next !== null) {
        e.preventDefault();
        const id = `tab-${TABS[next]}`;
        selectTab(TABS[next]);
        document.getElementById(id).focus();
      }
    });
  });
}

function selectTab(name) {
  if (!TABS.includes(name)) name = "overview";
  for (const t of TABS) {
    const tab = document.getElementById(`tab-${t}`);
    const panel = document.getElementById(`panel-${t}`);
    const active = t === name;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    panel.hidden = !active;
  }
  const base = location.hash.slice(1).split("/")[0];
  if (base !== name) {
    history.replaceState(null, "", `#${name}`);
  }
}

function applyHash() {
  const [tab, elem] = (location.hash.slice(1) || "overview").split("/");
  if (tab === "detail" && elem && state.analysis?.elements.some((e) => e.element === elem)) {
    state.element = elem;
    $("#el-select").value = elem;
    renderDetail();
  }
  selectTab(tab);
}
boot().then(applyHash);
window.addEventListener("hashchange", applyHash);
