/* Alignement logique maison (L1-L9) -> alertes de base : criticités et règles.
   Vérifie le VRAI code (enrichAll) sur des dossiers synthétiques au pilotage 2026-09-30.
   Un seul appel enrichAll avec des dates diversifiées (aucune date > 30 % : pas de A9 parasite). */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
global.window = {};
require("../settings.js");
const source = fs.readFileSync(require.resolve("../app.js"), "utf8").replace(
  'document.readyState==="loading"?document.addEventListener("DOMContentLoaded",init):init();',
  "globalThis.testAPI={enrichAll};"
);
const context = {
  Date, console, setTimeout, SpotSettings: window.SpotSettings,
  localStorage: { getItem: () => null, setItem: () => {} },
  document: { querySelector: () => ({ value: "2026-09-30" }), querySelectorAll: () => [], documentElement: { style: { setProperty: () => {} } } },
};
vm.createContext(context);
vm.runInContext(source, context);
const enrichAll = context.testAPI.enrichAll;
const d = (y, m, day) => new Date(y, m - 1, day);
let n = 0;
const M = (o) => ({
  com: "CM10-TECHI1", metier: "20", sousMetier: "20C", client: "CLIENT TEST", sousCompte: "", designation: "",
  poids: "", dossier: "TEST" + (++n), auteur: "",
  com1: "", com2: "", com3: "", com4: "", com5: "",
  dateETA: null, dateRTA: null, dateValidation: null, dateDocs: null, dateNote: null, dateEnreg: null,
  dateFactDouane: null, dateBAE: null, dateMise: null, dateRetour: null, dateFactInt: null,
  dateValidFinal: null, dateArchivage: null, delaiETA_raw: "", delaiRTA_raw: "", ...o,
});
const rows = [
  // 0 L1 : facture sans BAE + ETA compromise -> Critique (A6 + A1)
  M({ dateValidation: d(2026, 8, 1), dateDocs: d(2026, 8, 2), dateNote: d(2026, 8, 3),
    dateEnreg: d(2026, 9, 1), dateFactDouane: d(2026, 9, 2), dateETA: d(2026, 9, 10), dateRTA: d(2026, 9, 12) }),
  // 1 L2 : enreg sans facture + ETA compromise -> Critique (A5 + A1)
  M({ dateValidation: d(2026, 8, 4), dateDocs: d(2026, 8, 5), dateNote: d(2026, 8, 6),
    dateEnreg: d(2026, 9, 3), dateETA: d(2026, 9, 11), dateRTA: d(2026, 9, 13) }),
  // 2 L2 frais (ETA future) -> Haute via A5 seule
  M({ dateValidation: d(2026, 9, 20), dateDocs: d(2026, 9, 21), dateNote: d(2026, 9, 22),
    dateEnreg: d(2026, 9, 25), dateETA: d(2026, 10, 15) }),
  // 3 L6 pré-retour ancien : Enreg sans FactInt -> Haute via A12
  M({ dateValidation: d(2026, 5, 1), dateDocs: d(2026, 5, 2), dateNote: d(2026, 5, 3),
    dateEnreg: d(2026, 5, 4), dateFactDouane: d(2026, 5, 5), dateBAE: d(2026, 5, 6),
    dateMise: d(2026, 5, 7), dateETA: d(2026, 5, 1), dateRTA: d(2026, 5, 5) }),
  // 4 L8 pur : chaîne complète sauf archivage -> Moyenne (A2 + A8)
  M({ dateValidation: d(2026, 6, 1), dateDocs: d(2026, 6, 2), dateNote: d(2026, 6, 3),
    dateEnreg: d(2026, 6, 4), dateFactDouane: d(2026, 6, 5), dateBAE: d(2026, 6, 6),
    dateMise: d(2026, 6, 7), dateRetour: d(2026, 6, 20), dateFactInt: d(2026, 6, 25),
    dateETA: d(2026, 6, 1), dateRTA: d(2026, 6, 5) }),
  // 5 L9 : validation ancienne sans enregistrement -> Moyenne via A4
  M({ dateValidation: d(2024, 1, 5) }),
  // 6 sain archivé (ValidFinal vide comme dans l'extraction) -> OK, pas de A8 fantôme
  M({ dateValidation: d(2026, 9, 6), dateDocs: d(2026, 9, 7), dateNote: d(2026, 9, 8),
    dateEnreg: d(2026, 9, 9), dateFactDouane: d(2026, 9, 10), dateBAE: d(2026, 9, 11),
    dateMise: d(2026, 9, 20), dateRetour: d(2026, 9, 22), dateFactInt: d(2026, 9, 23),
    dateArchivage: d(2026, 9, 24), dateETA: d(2026, 9, 18), dateRTA: d(2026, 9, 19) }),
  // 7 tolérance saisie : inversion 1j -> pas de A3
  M({ dateValidation: d(2026, 9, 11), dateDocs: d(2026, 9, 15), dateNote: d(2026, 9, 14) }),
  // 8 inversion 10j -> A3
  M({ dateValidation: d(2026, 9, 12), dateDocs: d(2026, 9, 25), dateNote: d(2026, 9, 15) }),
  // 9 facturation anticipée après mise/retour acceptée -> pas de A3
  M({ dateValidation: d(2026, 9, 13), dateDocs: d(2026, 9, 16), dateNote: d(2026, 9, 17),
    dateEnreg: d(2026, 9, 18), dateFactDouane: d(2026, 9, 19), dateBAE: d(2026, 9, 21),
    dateMise: d(2026, 9, 22), dateRetour: d(2026, 9, 26), dateFactInt: d(2026, 9, 24) }),
];
const out = enrichAll(rows);
const codes = (r) => r.alerts.map((a) => a.c);

assert.ok(codes(out[0]).includes("A6"), "L1 doit lever A6, obtenu: " + codes(out[0]));
assert.ok(codes(out[0]).includes("A1"), "L1 à ETA compromise doit lever A1, obtenu: " + codes(out[0]));
assert.equal(out[0].crit, "Critique");

assert.ok(codes(out[1]).includes("A5"), "L2 doit lever A5 (Facture douane en retard), obtenu: " + codes(out[1]));
assert.equal(out[1].crit, "Critique");

assert.ok(codes(out[2]).includes("A5"), "blocage douane récent doit lever A5, obtenu: " + codes(out[2]));
assert.equal(out[2].crit, "Haute");

assert.ok(codes(out[3]).includes("A12"), "facture prestation manquante doit lever A12, obtenu: " + codes(out[3]));
assert.equal(out[3].crit, "Haute");

assert.ok(codes(out[4]).includes("A2") && codes(out[4]).includes("A8"), "L8 pur doit lever A2+A8, obtenu: " + codes(out[4]));
assert.ok(!codes(out[4]).some((c) => ["A7", "A11", "A12"].includes(c)), "L8 pur ne doit pas lever A7/A11/A12, obtenu: " + codes(out[4]));
assert.equal(out[4].crit, "Moyenne");

assert.ok(codes(out[5]).includes("A4"), "sans déclaration doit lever A4, obtenu: " + codes(out[5]));
assert.equal(out[5].crit, "Moyenne");

assert.ok(!codes(out[6]).includes("A8"), "dossier soldé ne doit pas lever A8, obtenu: " + codes(out[6]));
assert.equal(out[6].crit, "OK");

assert.ok(!codes(out[7]).includes("A3"), "écart 1j toléré, obtenu: " + codes(out[7]));
assert.ok(codes(out[8]).includes("A3"), "écart 10j doit lever A3, obtenu: " + codes(out[8]));
assert.ok(!codes(out[9]).includes("A3"), "facture anticipée après mise/retour acceptée, obtenu: " + codes(out[9]));

console.log("PASS : criticités et règles alignées maison (L1/L2->Critique, L5/L6->Haute, L8/L9->Moyenne, A8 sans fantôme, A3 tolérant)");
