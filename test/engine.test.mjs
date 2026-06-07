// Tests du moteur de calcul. Exécuter : node test/engine.test.mjs
import { readFileSync } from "node:fs";
import {
  mean,
  stdev,
  zScore,
  bias,
  controlLimits,
  measurementStatus,
  analyzeElement,
  analyzeStandard,
  elementsOf,
} from "../src/engine.js";

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
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// --- mean / stdev ----------------------------------------------------------
ok("mean simple", close(mean([1, 2, 3, 4, 5]), 3));
ok("mean vide -> NaN", Number.isNaN(mean([])));
ok("stdev échantillon (n-1)", close(stdev([1, 2, 3, 4, 5]), 1.5811388300841898, 1e-12));
ok("stdev 1 valeur -> 0", stdev([5]) === 0);
ok("stdev 0 valeur -> 0", stdev([]) === 0);
ok("stdev constant -> 0", stdev([2, 2, 2]) === 0);

// --- zScore ----------------------------------------------------------------
ok("zScore nominal", close(zScore(0.2, 0.202, 0.006), -0.3333333333333, 1e-9));
ok("zScore σ nul -> null", zScore(0.2, 0.2, 0) === null);
ok("zScore σ sous seuil -> null", zScore(1, 0, 1e-12) === null);

// --- bias ------------------------------------------------------------------
ok("bias absolu", close(bias(0.21, 0.2).absolute, 0.01, 1e-12));
ok("bias relatif %", close(bias(0.21, 0.2).relative, 5, 1e-12));
ok("bias relatif certifié 0 -> null", bias(0.1, 0).relative === null);

// --- controlLimits ---------------------------------------------------------
const L = controlLimits(0.2012, 0.006);
ok("limite warning haute = m+2σ", close(L.warningHigh, 0.2132, 1e-12));
ok("limite alert basse = m-3σ", close(L.alertLow, 0.1832, 1e-12));

// --- measurementStatus (bornes) -------------------------------------------
ok("status |z|<2 -> ok", measurementStatus(1.99) === "ok");
ok("status |z|=2 -> warning", measurementStatus(2) === "warning");
ok("status 2<=|z|<3 -> warning", measurementStatus(-2.5) === "warning");
ok("status |z|=3 -> alert", measurementStatus(3) === "alert");
ok("status |z|>3 -> alert", measurementStatus(-4) === "alert");
ok("status null -> insufficient_variance", measurementStatus(null) === "insufficient_variance");
ok("status NaN -> insufficient_variance", measurementStatus(NaN) === "insufficient_variance");

// --- analyzeElement sur jeu synthétique ------------------------------------
const synth = {
  id: "STD-T",
  certified_values: { X: 10 },
  measurements: [
    { date: "2024-01-01", values: { X: 10 }, std_by_element: { X: 0 }, replicates: 3 },
    { date: "2024-01-02", values: { X: 11 }, std_by_element: { X: 0 }, replicates: 3 },
    { date: "2024-01-03", values: { X: 9 }, std_by_element: { X: 0 }, replicates: 3 },
    { date: "2024-01-04", values: { X: 10 }, std_by_element: { X: 0 }, replicates: 3 },
  ],
};
const eX = analyzeElement(synth, "X");
ok("analyzeElement n", eX.n === 4);
ok("analyzeElement mean", close(eX.mean, 10, 1e-12));
ok("analyzeElement série complète", eX.series.length === 4);
ok("analyzeElement compteurs totaux", eX.counts.total === 4);

// Variance insuffisante : toutes les valeurs identiques.
const flat = {
  id: "STD-F",
  certified_values: { Y: 5 },
  measurements: [
    { date: "2024-01-01", values: { Y: 5 }, std_by_element: { Y: 0 }, replicates: 3 },
    { date: "2024-01-02", values: { Y: 5 }, std_by_element: { Y: 0 }, replicates: 3 },
  ],
};
const eY = analyzeElement(flat, "Y");
ok("variance insuffisante -> status élément", eY.status === "insufficient_variance");
ok("variance insuffisante -> z null", eY.series[0].z === null);

// Valeur manquante -> invalid, sans planter.
const miss = {
  id: "STD-M",
  certified_values: { Z: 1 },
  measurements: [
    { date: "2024-01-01", values: { Z: 1 }, std_by_element: {}, replicates: 3 },
    { date: "2024-01-02", values: {}, std_by_element: {}, replicates: 3 },
    { date: "2024-01-03", values: { Z: 1.5 }, std_by_element: {}, replicates: 3 },
  ],
};
const eZ = analyzeElement(miss, "Z");
ok("valeur manquante -> invalid", eZ.series[1].status === "invalid");

// --- INVARIANT D'IDENTITÉ ---------------------------------------------------
// Soumettre à un standard sa propre composition certifiée : biais nul, z = 0, ok.
function identityCheck(standard) {
  const single = {
    id: standard.id,
    certified_values: standard.certified_values,
    measurements: [
      {
        date: "0000-00-00",
        values: { ...standard.certified_values },
        std_by_element: {},
        replicates: 3,
      },
      // 2 points décalés pour créer de la variance et permettre un z.
      ...standard.measurements.slice(0, 2),
    ],
  };
  return elementsOf(single).every((el) => {
    const a = analyzeElement(single, el);
    const p = a.series[0];
    if (p.bias === null) return true;
    return close(p.bias.absolute, 0, 1e-9);
  });
}

// --- Vérification contre les données réelles (vérité-terrain Excel) ---------
const data = JSON.parse(readFileSync(new URL("../data/crm_data.json", import.meta.url)));
const A = data.standards.find((s) => s.id === "STD-A");
ok("STD-A présent", !!A);
const C = analyzeElement(A, "C");
ok("STD-A C mean ≈ 0.2012 (Excel)", close(C.mean, 0.2012, 5e-4));
ok("STD-A C sigma ≈ 0.006 (Excel)", close(C.sigma, 0.006, 5e-4));
ok("STD-A C z₁ ≈ -0.333 (Excel)", close(C.series[0].z, -0.3333, 5e-3));
ok("STD-A C limite haute ≈ 0.2132 (Excel)", close(C.limits.warningHigh, 0.2132, 1e-3));

for (const s of data.standards) {
  ok(`invariant identité ${s.id}`, identityCheck(s));
  const full = analyzeStandard(s);
  ok(`analyzeStandard ${s.id} ne plante pas`, full.elements.length > 0);
  ok(`analyzeStandard ${s.id} statut valide`, ["ok", "warning", "alert"].includes(full.status));
}

// --- Bilan -----------------------------------------------------------------
console.log(`engine.test.mjs : ${pass}/${pass + fail} passing`);
if (fail > 0) process.exit(1);
