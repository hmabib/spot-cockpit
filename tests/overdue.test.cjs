/* Règles Overdue L1-L10 : définitions maison, seuils, visibilité (masquer/supprimer), périmètre.
   Vérifie le VRAI code (overdueOf) sans DOM (seuils et dates en dur). */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
global.window = {};
require("../settings.js");
const source = fs.readFileSync(require.resolve("../app.js"), "utf8").replace(
  'document.readyState==="loading"?document.addEventListener("DOMContentLoaded",init):init();',
  "globalThis.testAPI={overdueOf,OVERDUE,OVERDUE_DEFAULT};"
);
const context = {
  Date, console, setTimeout, SpotSettings: window.SpotSettings,
  localStorage: { getItem: () => null, setItem: () => {} },
  document: { querySelector: () => ({ value: "2026-09-30" }), querySelectorAll: () => [], documentElement: { style: { setProperty: () => {} } } },
};
vm.createContext(context);
vm.runInContext(source, context);
const { overdueOf, OVERDUE } = context.testAPI;
const P = new Date(2026, 8, 30);
const d = (y, m, day) => new Date(y, m - 1, day);
const R = (o) => ({
  sousMetier: "20C", com: "CM10-TECHI1", client: "C", dossier: "1",
  dateETA: null, dateRTA: null, dateValidation: null, dateDocs: null, dateNote: null,
  dateEnreg: null, dateFactDouane: null, dateBAE: null, dateMise: null, dateRetour: null,
  dateFactInt: null, dateValidFinal: null, dateArchivage: null, ...o,
});
const codes = (row) => overdueOf(row, P).map((o) => o.c);

// L9 : Valid + sans Enreg + ETA connue (sans seuil d'âge)
assert.ok(codes(R({ dateValidation: d(2026, 9, 20), dateETA: d(2026, 9, 25) })).includes("L9"));
assert.ok(!codes(R({ dateValidation: d(2026, 9, 20) })).includes("L9"), "sans ETA : pas de L9");

// L8 : tout non archivé (sans seuil, sans BAE requis)
assert.ok(codes(R({ dateValidation: d(2026, 9, 29) })).includes("L8"));
assert.ok(!codes(R({ dateValidation: d(2026, 9, 29), dateArchivage: d(2026, 9, 30) })).includes("L8"), "archivé : pas de L8");

// L6 : Enreg + BAE + sans FactInt + ageEnreg > 1
assert.ok(codes(R({ dateValidation: d(2026, 9, 1), dateEnreg: d(2026, 9, 25), dateFactDouane: d(2026, 9, 26), dateBAE: d(2026, 9, 27) })).includes("L6"));
assert.ok(!codes(R({ dateValidation: d(2026, 9, 1), dateEnreg: d(2026, 9, 29), dateBAE: d(2026, 9, 29) })).includes("L6"), "1j : pas encore L6");

// L7 : retour non facturé, sans délai
assert.ok(codes(R({ dateValidation: d(2026, 9, 1), dateEnreg: d(2026, 9, 2), dateBAE: d(2026, 9, 3), dateMise: d(2026, 9, 10), dateRetour: d(2026, 9, 29) })).includes("L7"));
// L7 : BAE ancien sans facture
assert.ok(codes(R({ dateValidation: d(2026, 9, 1), dateEnreg: d(2026, 9, 2), dateBAE: d(2026, 9, 5) })).includes("L7"));

// L3 : BAE + sans Mise + sans FactInt + ageBAE > 12
assert.ok(codes(R({ dateValidation: d(2026, 9, 1), dateEnreg: d(2026, 9, 2), dateBAE: d(2026, 9, 17) })).includes("L3"));
assert.ok(!codes(R({ dateValidation: d(2026, 9, 1), dateEnreg: d(2026, 9, 2), dateBAE: d(2026, 9, 17), dateFactInt: d(2026, 9, 20) })).includes("L3"), "facturé : pas de L3");

// L2 : Enreg sans facture + age > 1
assert.ok(codes(R({ dateValidation: d(2026, 9, 1), dateEnreg: d(2026, 9, 25) })).includes("L2"));
// L1 : Facture sans BAE + age > 3
assert.ok(codes(R({ dateValidation: d(2026, 9, 1), dateEnreg: d(2026, 9, 2), dateFactDouane: d(2026, 9, 25) })).includes("L1"));

// L4 bras A (mise ancienne), B (terrestre), C (amont)
assert.ok(codes(R({ dateValidation: d(2026, 9, 1), dateEnreg: d(2026, 9, 2), dateBAE: d(2026, 9, 3), dateMise: d(2026, 9, 10) })).includes("L4"));
assert.ok(codes(R({ dateValidation: d(2026, 9, 1), dateEnreg: d(2026, 9, 2), dateBAE: d(2026, 9, 15) })).includes("L4"));
assert.ok(codes(R({ dateValidation: d(2026, 9, 15) })).includes("L4"));
assert.ok(!codes(R({ dateValidation: d(2026, 9, 1), dateEnreg: d(2026, 9, 2), dateBAE: d(2026, 9, 3), dateMise: d(2026, 9, 28) })).includes("L4"), "mise de 2j : pas de L4");

// L5 : livré, sans facture ni archivage, BAE > 45j
assert.ok(codes(R({ dateValidation: d(2026, 6, 1), dateEnreg: d(2026, 6, 2), dateBAE: d(2026, 8, 1), dateMise: d(2026, 8, 5) })).includes("L5"));
assert.ok(!codes(R({ dateValidation: d(2026, 9, 1), dateEnreg: d(2026, 9, 2), dateBAE: d(2026, 9, 10), dateMise: d(2026, 9, 15) })).includes("L5"), "BAE récent : pas de L5");

// L10 : jamais calculée (champ débours absent de l'extraction)
assert.ok(!codes(R({ dateValidation: d(2024, 1, 5), dateEnreg: d(2024, 1, 6), dateBAE: d(2024, 1, 7) })).includes("L10"));

// Périmètre : hors 20C → rien
assert.equal(codes(R({ sousMetier: "20A", dateValidation: d(2026, 9, 20), dateETA: d(2026, 9, 25), dateArchivage: d(2026, 9, 26) })).length, 0);

// Visibilité : règle masquée → rien ; supprimée → rien ; restaurée → revient
OVERDUE.rules.L9.on = false;
assert.ok(!codes(R({ dateValidation: d(2026, 9, 20), dateETA: d(2026, 9, 25) })).includes("L9"), "masquée : pas de L9");
OVERDUE.rules.L9.on = true;
OVERDUE.rules.L8.deleted = true;
assert.ok(!codes(R({ dateValidation: d(2026, 9, 29) })).includes("L8"), "supprimée : pas de L8");
OVERDUE.rules.L8.deleted = false;
assert.ok(codes(R({ dateValidation: d(2026, 9, 29) })).includes("L8"), "restaurée : L8 revient");

console.log("PASS : règles Overdue maison (L1-L9 calculées, L10 non calculée, masquer/supprimer/périmètre)");
