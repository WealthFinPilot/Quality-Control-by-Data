// engine.js — calculs purs de contrôle de déviation.
// Aucune dépendance, aucun accès au DOM. Toutes les fonctions sont testables seules.
//
// Algorithme figé et vérifié empiriquement — voir docs/source-analysis.md.
// NE PAS modifier après validation de la suite de tests (cf. CLAUDE.md).

export const WARNING_SIGMA = 2;
export const ALERT_SIGMA = 3;
export const VARIANCE_EPSILON = 1e-9; // en deçà, σ considéré nul.

/** Moyenne arithmétique d'un tableau de nombres. NaN si vide. */
export function mean(values) {
  if (!values.length) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Écart-type d'échantillon (n-1), comme STDEV d'Excel.
 * Retourne 0 pour 0 ou 1 valeur (pas de variance calculable).
 */
export function stdev(values) {
  const n = values.length;
  if (n < 2) return 0;
  const m = mean(values);
  const ss = values.reduce((acc, v) => acc + (v - m) ** 2, 0);
  return Math.sqrt(ss / (n - 1));
}

/**
 * z-score d'une mesure : (mesurée − certifiée) / σ_historique.
 * Retourne null si σ est sous le seuil (variance insuffisante).
 */
export function zScore(measured, certified, sigma) {
  if (!(sigma >= VARIANCE_EPSILON)) return null;
  return (measured - certified) / sigma;
}

/** Biais absolu et relatif (%) d'une mesure par rapport à la valeur certifiée. */
export function bias(measured, certified) {
  const absolute = measured - certified;
  const relative = certified !== 0 ? (absolute / certified) * 100 : null;
  return { absolute, relative };
}

/**
 * Limites de contrôle dynamiques, centrées sur la moyenne historique.
 * warning = moyenne ± 2σ, alert = moyenne ± 3σ.
 */
export function controlLimits(m, sigma) {
  return {
    warningHigh: m + WARNING_SIGMA * sigma,
    warningLow: m - WARNING_SIGMA * sigma,
    alertHigh: m + ALERT_SIGMA * sigma,
    alertLow: m - ALERT_SIGMA * sigma,
  };
}

/**
 * Statut d'une mesure à partir de son z-score.
 *  z null              -> "insufficient_variance"
 *  |z| >= 3            -> "alert"
 *  2 <= |z| < 3        -> "warning"
 *  |z| < 2             -> "ok"
 */
export function measurementStatus(z) {
  if (z === null || z === undefined || Number.isNaN(z)) {
    return "insufficient_variance";
  }
  const a = Math.abs(z);
  if (a >= ALERT_SIGMA) return "alert";
  if (a >= WARNING_SIGMA) return "warning";
  return "ok";
}

/**
 * Analyse complète d'un élément pour un standard.
 * Retourne moyenne, σ, valeur certifiée, limites, série de points et compteurs.
 *
 * @param {object} standard  - { certified_values, measurements }
 * @param {string} element   - symbole chimique (ex. "C")
 */
export function analyzeElement(standard, element) {
  const certified = standard.certified_values?.[element];
  const series = [];
  const values = [];

  for (const m of standard.measurements) {
    const v = m.values?.[element];
    if (typeof v === "number" && Number.isFinite(v)) {
      values.push(v);
    }
  }

  const m = mean(values);
  const sigma = stdev(values);
  const limits = controlLimits(m, sigma);
  const hasVariance = sigma >= VARIANCE_EPSILON;

  let warnings = 0;
  let alerts = 0;

  for (const meas of standard.measurements) {
    const v = meas.values?.[element];
    const valid = typeof v === "number" && Number.isFinite(v);
    let z = null;
    let status;

    if (!valid) {
      status = "invalid";
    } else if (typeof certified !== "number") {
      status = "invalid";
    } else if (!hasVariance) {
      status = "insufficient_variance";
    } else {
      z = zScore(v, certified, sigma);
      status = measurementStatus(z);
    }

    if (status === "warning") warnings += 1;
    if (status === "alert") alerts += 1;

    series.push({
      date: meas.date,
      value: valid ? v : null,
      std: meas.std_by_element?.[element] ?? 0,
      replicates: meas.replicates ?? null,
      z,
      bias: valid && typeof certified === "number" ? bias(v, certified) : null,
      status,
    });
  }

  let elementStatus = "ok";
  if (!hasVariance) elementStatus = "insufficient_variance";
  else if (alerts > 0) elementStatus = "alert";
  else if (warnings > 0) elementStatus = "warning";

  return {
    element,
    certified: typeof certified === "number" ? certified : null,
    mean: m,
    sigma,
    n: values.length,
    limits,
    series,
    counts: { warnings, alerts, total: standard.measurements.length },
    status: elementStatus,
  };
}

/** Liste triée des éléments réellement mesurés pour un standard. */
export function elementsOf(standard) {
  return Object.keys(standard.certified_values || {});
}

/**
 * Analyse complète d'un standard : tous ses éléments + statut global.
 * Le statut global est le pire statut rencontré (alert > warning > ok).
 */
export function analyzeStandard(standard) {
  const elements = elementsOf(standard).map((el) => analyzeElement(standard, el));

  let totalWarnings = 0;
  let totalAlerts = 0;
  for (const e of elements) {
    totalWarnings += e.counts.warnings;
    totalAlerts += e.counts.alerts;
  }

  let global = "ok";
  if (elements.some((e) => e.status === "alert")) global = "alert";
  else if (elements.some((e) => e.status === "warning")) global = "warning";

  return {
    id: standard.id,
    elements,
    status: global,
    totals: {
      warnings: totalWarnings,
      alerts: totalAlerts,
      elementsInAlert: elements.filter((e) => e.status === "alert").length,
      elementsInWarning: elements.filter((e) => e.status === "warning").length,
      elementCount: elements.length,
    },
  };
}
