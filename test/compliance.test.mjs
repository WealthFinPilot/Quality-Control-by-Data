// Tests de la logique de conformité. Exécuter : node test/compliance.test.mjs
import { readFileSync } from "node:fs";
import { analyzeStandard, analyzeElement } from "../src/engine.js";
import {
  statusLabel,
  statusPlain,
  instrumentVerdict,
  formatCount,
  maintenanceInRange,
  dateRange,
  nearestMaintenanceAfter,
  limitsContext,
  TIGHT_CV,
  STATUS_META,
} from "../src/compliance.js";

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    console.error("  ✗ " + name);
  }
}

// --- libellés --------------------------------------------------------------
ok("statusLabel ok", statusLabel("ok") === "Conforme");
ok("statusLabel alert", statusLabel("alert") === "Anomalie");
ok("statusLabel inconnu -> fallback", statusLabel("???") === STATUS_META.invalid.label);
ok("statusPlain non vide", statusPlain("warning").length > 0);

// --- formatCount -----------------------------------------------------------
ok("formatCount", formatCount(4, 25) === "4 / 25");

// --- verdict global --------------------------------------------------------
ok("verdict ok",
  instrumentVerdict({ status: "ok", totals: {} }).title === "Sous contrôle");
ok("verdict warning",
  instrumentVerdict({ status: "warning", totals: { elementsInWarning: 2 } }).title === "À surveiller");
ok("verdict alert",
  instrumentVerdict({ status: "alert", totals: { elementsInAlert: 3 } }).title === "Anomalie détectée");

// --- maintenance dans une fenêtre ------------------------------------------
const events = [
  { date: "2023-01-05", type: "Preventive maintenance" },
  { date: "2023-06-15", type: "Calibration" },
  { date: "2024-04-11", type: "Source replacement" },
];
const win = maintenanceInRange(events, "2023-02-01", "2023-12-31");
ok("maintenanceInRange filtre", win.length === 1 && win[0].type === "Calibration");
ok("maintenanceInRange vide si rien", maintenanceInRange(events, "2025-01-01", "2025-12-31").length === 0);
ok("maintenanceInRange events null", maintenanceInRange(null, "2023-01-01", "2023-12-31").length === 0);
ok("maintenanceInRange trié",
  maintenanceInRange(events, "2023-01-01", "2024-12-31").map((e) => e.date).join() ===
    "2023-01-05,2023-06-15,2024-04-11");

// --- nearestMaintenanceAfter -----------------------------------------------
ok("maintenance proche après dérive",
  nearestMaintenanceAfter("2023-06-01", events, 30)?.date === "2023-06-15");
ok("aucune maintenance dans la fenêtre",
  nearestMaintenanceAfter("2023-08-01", events, 10) === null);

// --- dateRange + corrélation sur données réelles ---------------------------
const data = JSON.parse(readFileSync(new URL("../data/crm_data.json", import.meta.url)));
const maint = JSON.parse(readFileSync(new URL("../data/maintenance.json", import.meta.url)));
const A = data.standards.find((s) => s.id === "STD-A");
const C = analyzeElement(A, "C");
const r = dateRange(C);
ok("dateRange début", r.start === "2023-01-09");
ok("dateRange fin", r.end === "2024-01-10");
const overlap = maintenanceInRange(maint.events, r.start, r.end);
ok("maintenance superposable à STD-A", overlap.length > 0);

// Cohérence globale sur tous les standards.
for (const s of data.standards) {
  const full = analyzeStandard(s);
  const v = instrumentVerdict(full);
  ok(`verdict ${s.id} cohérent avec statut`, v.status === full.status);
}

// --- limitsContext (limites serrées / élément quasi constant) --------------
// Élément très stable ET signalé -> note de limites serrées.
ok("limitsContext tight quand CV faible + flag",
  limitsContext({ mean: 0.11, sigma: 0.002, counts: { warnings: 25, alerts: 0 } }).tight === true);
ok("limitsContext fournit une note",
  typeof limitsContext({ mean: 0.11, sigma: 0.002, counts: { warnings: 25, alerts: 0 } }).note === "string");
// Élément stable mais non signalé -> pas de note.
ok("limitsContext non tight si pas de flag",
  limitsContext({ mean: 0.11, sigma: 0.002, counts: { warnings: 0, alerts: 0 } }).tight === false);
// Élément avec dispersion normale -> pas de note même si signalé.
ok("limitsContext non tight si CV élevé",
  limitsContext({ mean: 0.2, sigma: 0.02, counts: { warnings: 1, alerts: 1 } }).tight === false);
ok("limitsContext note null si non tight",
  limitsContext({ mean: 0.2, sigma: 0.02, counts: { warnings: 1, alerts: 0 } }).note === null);
// Cas réel : Ni de STD-A doit être détecté comme limites serrées.
const ni = analyzeStandard(data.standards.find((s) => s.id === "STD-A")).elements.find((e) => e.element === "Ni");
ok("STD-A Ni détecté limites serrées", limitsContext(ni).tight === true);
ok("TIGHT_CV = 0.02", TIGHT_CV === 0.02);

// --- plan préventif présent ------------------------------------------------
ok("plan préventif non vide", Array.isArray(maint.preventive_plan) && maint.preventive_plan.length > 0);

console.log(`compliance.test.mjs : ${pass}/${pass + fail} passing`);
if (fail > 0) process.exit(1);
