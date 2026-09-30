const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
global.window={};require('../settings.js');
const source=fs.readFileSync(require.resolve('../app.js'),'utf8').replace('document.readyState==="loading"?document.addEventListener("DOMContentLoaded",init):init();','globalThis.testAPI={durationStats,stepStats,etaRtaStats,cycleStats,monthlyHistory,enrichAll,matchGlobal,F};');
const context={Date,console,SpotSettings:window.SpotSettings,document:{querySelector:()=>({value:'2026-09-28'})}};
vm.createContext(context);vm.runInContext(source,context);
const api=context.testAPI,d=day=>new Date(2026,8,day);
const rows=[
  {dateETA:d(8),dateRTA:d(10),dateValidation:d(1),dateDocs:d(3),dateArchivage:d(15),dossier:'1',com:'A',client:'C'},
  {dateETA:d(11),dateRTA:d(9),dateValidation:d(1),dateDocs:d(5),dossier:'2',com:'A',client:'C'},
  {dateValidation:d(5),dateDocs:d(2),dossier:'3',com:'A',client:'C'},
  {dateValidation:d(8),dossier:'4',com:'A',client:'C'}
];
const stats=api.stepStats(rows);
const first=stats.find(p=>p.from==='Validation');
assert.equal(first.n,2);assert.equal(first.mean,3);assert.equal(first.median,3);
assert.equal(first.min,2);assert.equal(first.max,4);assert.equal(first.inversions,1);
assert.equal(first.waiting,1);assert.equal(first.age,20);
assert.equal(first.buckets[0].pct,50);assert.equal(first.buckets[1].pct,50);
assert(!stats.some(p=>p.from.includes('ETA')||p.from.includes('RTA')));
assert.equal(api.etaRtaStats(rows).median,0);assert.equal(api.etaRtaStats(rows).early,1);
assert.equal(api.cycleStats(rows).mean,14);
assert.equal(api.durationStats([0,0]).median,0);
assert.equal(api.durationStats([]),null);
assert(Math.abs(stats.reduce((s,p)=>s+p.pct,0)-100)<1e-9);
const enriched=api.enrichAll(rows);
assert(!enriched[0].inv.length,'La préparation avant RTA ne doit pas être une inversion');
assert(enriched[2].inv.length,'Inversion documentaire réelle détectée');
api.F.hideArchived=true;
assert.equal(enriched.filter(r=>api.matchGlobal(r)).length,3);
const history=api.monthlyHistory(rows);
assert.equal(history[0][0],'2026-09');assert.equal(history[0][1].arrived,2);
assert.equal(history[0][1].archived,1);
const future=[{dateValidation:new Date(2026,9,1)}];
assert.equal(api.monthlyHistory(future).length,0);
console.log('PASS : ETA/RTA séparées du process, médiane paire, cycle réalisé, attentes, inversions, pourcentages, historique et archives');
