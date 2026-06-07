// compliance.js — interprétation des résultats du moteur.
// Traduit les statuts techniques en langage simple (audience non-experte),
// formate les compteurs et corrèle les mesures avec les interventions de maintenance.
// Pur : aucune dépendance, aucun accès au DOM.

/** Métadonnées des statuts : libellé simple, libellé technique, sévérité. */
export const STATUS_META = {
  ok: {
    label: "Conforme",
    plain: "La machine mesure juste.",
    severity: 0,
  },
  warning: {
    label: "À surveiller",
    plain: "Petit écart : à garder à l'œil.",
    severity: 1,
  },
  alert: {
    label: "Anomalie",
    plain: "Écart important : une action est nécessaire.",
    severity: 2,
  },
  insufficient_variance: {
    label: "Non évaluable",
    plain: "Pas assez de variation pour juger.",
    severity: 0,
  },
  invalid: {
    label: "Donnée manquante",
    plain: "Mesure absente ou illisible.",
    severity: 0,
  },
};

export function statusLabel(status) {
  return (STATUS_META[status] || STATUS_META.invalid).label;
}

export function statusPlain(status) {
  return (STATUS_META[status] || STATUS_META.invalid).plain;
}

/** Verdict global de l'instrument, en une phrase simple. */
export function instrumentVerdict(analysis) {
  const { status, totals } = analysis;
  if (status === "alert") {
    return {
      status,
      title: "Anomalie détectée",
      plain: `${totals.elementsInAlert} élément(s) hors limites : la machine doit être vérifiée.`,
    };
  }
  if (status === "warning") {
    return {
      status,
      title: "À surveiller",
      plain: `${totals.elementsInWarning} élément(s) montrent un léger écart, sans gravité immédiate.`,
    };
  }
  return {
    status,
    title: "Sous contrôle",
    plain: "Tous les éléments sont dans les limites attendues.",
  };
}

/** Formate un compteur "n / N" (remplace le "n\\N" de l'outil d'origine). */
export function formatCount(n, total) {
  return `${n} / ${total}`;
}

// En deçà de ce coefficient de variation (σ/moyenne), l'élément est considéré
// « quasi constant » : ses limites de contrôle dynamiques deviennent très serrées.
export const TIGHT_CV = 0.02;

/**
 * Contexte d'interprétation des limites pour un élément analysé.
 * Quand un élément est très stable (CV faible), un petit écart suffit à le faire
 * sortir des limites — sans que cela traduise forcément un vrai problème réel.
 * Permet d'expliquer systématiquement ce cas à l'utilisateur.
 *
 * @returns {{cv:number, tight:boolean, note:(string|null)}}
 */
export function limitsContext(e) {
  const cv = e.mean ? e.sigma / Math.abs(e.mean) : 0;
  const flagged = (e.counts.warnings + e.counts.alerts) > 0;
  const tight = flagged && cv > 0 && cv < TIGHT_CV;
  return {
    cv,
    tight,
    note: tight
      ? "Élément très stable (dispersion inférieure à 2 %). Les limites de contrôle sont donc très serrées : un écart minime suffit à déclencher une alerte, sans que cela traduise forcément un vrai problème de mesure. À interpréter au regard de l'écart réel, pas seulement du dépassement statistique."
      : null,
  };
}

/** Filtre les événements de maintenance dans une fenêtre de dates [start, end]. */
export function maintenanceInRange(events, start, end) {
  if (!events) return [];
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return events
    .filter((ev) => {
      const t = new Date(ev.date).getTime();
      return t >= s && t <= e;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

/** Bornes de dates (min/max) d'une série d'éléments analysée. */
export function dateRange(elementAnalysis) {
  const dates = elementAnalysis.series
    .map((p) => p.date)
    .filter(Boolean)
    .sort();
  return { start: dates[0], end: dates[dates.length - 1] };
}

/**
 * Pour un point de mesure en dérive, trouve l'intervention de maintenance la plus
 * proche dans les `windowDays` qui suivent — sert à suggérer une corrélation.
 */
export function nearestMaintenanceAfter(date, events, windowDays = 30) {
  const t = new Date(date).getTime();
  const window = windowDays * 86400000;
  let best = null;
  for (const ev of events || []) {
    const dt = new Date(ev.date).getTime() - t;
    if (dt >= 0 && dt <= window && (best === null || dt < best.delta)) {
      best = { event: ev, delta: dt };
    }
  }
  return best ? best.event : null;
}
