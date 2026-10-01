/* SPOT Cockpit AGL — moteur de pilotage quotidien. */
(() => {
"use strict";
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = v => (v==null?"":String(v)).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/* ---------- Référentiels ---------- */
const STEPS = [
  {k:"validation", label:"Validation", dateKey:"dateValidation"},
  {k:"docs", label:"Documents complets", dateKey:"dateDocs"},
  {k:"note", label:"Note de détail", dateKey:"dateNote"},
  {k:"douane", label:"Enreg. douane", dateKey:"dateEnreg"},
  {k:"factDouane", label:"Facture douane", dateKey:"dateFactDouane"},
  {k:"bae", label:"BAE", dateKey:"dateBAE"},
  {k:"mise", label:"Mise en livraison", dateKey:"dateMise"},
  {k:"retour", label:"Retour livraison", dateKey:"dateRetour"},
  {k:"factInt", label:"Facture intervention", dateKey:"dateFactInt"},
  {k:"validFinal", label:"Validation finale", dateKey:"dateValidFinal"},
  {k:"archivage", label:"Archivage", dateKey:"dateArchivage"},
];
const SLA_DEFAULT = {validation:3, docs:2, note:2, douane:3, factDouane:3, bae:2, mise:3, retour:5, factInt:3, validFinal:5};
/* Référentiel aligné sur la logique maison (Overdue L1–L9) : la sévérité reflète le blocage
   en cours (point dur douane = Critique, flux à traiter = Haute, stock à solder = Moyenne).
   Seules les stagnations EN COURS scorent (l'historique reste visible, sans points). */
const ALERT_BASE = {
  A1:{t:"ETA dépassée, BAE manquant", sev:"Critique", c:"#d92d20", h:"L'arrivée estimée est dépassée sans BAE (risque surestaries). L'ETA ne confirme pas l'arrivée réelle ; consulter la RTA.", w:30, days:0, on:true, ico:"🚢"},
  A2:{t:"RTA passée, non archivé", sev:"Moyenne", c:"#ca8a04", h:"Arrivée réelle confirmée (RTA) mais dossier non archivé : stock à solder.", w:15, days:0, on:true, ico:"📦"},
  A3:{t:"Inversion chronologique", sev:"Critique", c:"#d92d20", h:"Une étape est datée avant la précédente au-delà de la tolérance → erreur de saisie ou contournement (la facturation anticipée après mise/retour est acceptée).", w:25, days:2, on:true, ico:"🔀"},
  A4:{t:"Stagnation amont en cours (> SLA)", sev:"Haute", c:"#e9730c", h:"Validation → Docs → Note bloqués maintenant plus longtemps que le SLA.", w:15, days:0, on:true, ico:"⏳"},
  A5:{t:"Facture douane en retard", sev:"Critique", c:"#d92d20", h:"Enregistrement présent, facture douane vide depuis plus de X jours → point dur douane.", w:30, days:3, on:true, ico:"🏛️"},
  A6:{t:"Blocage BAE", sev:"Critique", c:"#d92d20", h:"Facture douane présente, BAE vide depuis plus de X jours → point dur douane.", w:30, days:3, on:true, ico:"🛂"},
  A7:{t:"Blocage livraison", sev:"Haute", c:"#e9730c", h:"BAE obtenu mais mise/retour en attente depuis plus de X jours.", w:18, days:2, on:true, ico:"🚚"},
  A8:{t:"Clôture en retard", sev:"Moyenne", c:"#ca8a04", h:"Retour effectué mais facture prestation ou archivage en attente depuis plus de X jours.", w:10, days:5, on:true, ico:"🧾"},
  A9:{t:"Qualité donnée / MAJ masse", sev:"Moyenne", c:"#ca8a04", h:"Une même date posée en masse sur plus de X % des dossiers → vérifier import/interface.", w:8, days:30, on:true, ico:"🧹"},
  A10:{t:"Donnée manquante / doublon", sev:"Moyenne", c:"#ca8a04", h:"COM, client ou n° dossier vide, ou n° dossier en double.", w:8, days:0, on:true, ico:"❓"},
  A11:{t:"Retour conteneur / facture en attente", sev:"Haute", c:"#e9730c", h:"Mise effectuée mais ni retour ni facture prestation depuis plus de X jours (conteneur non restitué).", w:15, days:7, on:true, ico:"🔄"},
  A12:{t:"Facture prestation en attente", sev:"Haute", c:"#e9730c", h:"Dossier déclaré et BAE obtenu mais facture prestation vide depuis plus de X jours.", w:15, days:7, on:true, ico:"💰"},
};
const SEV_DEFAULT = {Critique:"#d92d20", Haute:"#e9730c", Moyenne:"#ca8a04", OK:"#12805c"};
const DEFAULT_CFG = {
  pilot:"2026-09-28", thCrit:55, thHaute:30, thMoy:12, etaCrit:-7, rtaCrit:-7,
  sla:{...SLA_DEFAULT}, alerts:JSON.parse(JSON.stringify(ALERT_BASE)), sevColors:{...SEV_DEFAULT}
};
/* ---------- Overdue Files Hinterland — 9 points de contrôle ---------- */
/* Périmètre configurable (défaut : sous-métier 20C). Chaque point = étape manquante + ancienneté > seuil vs date pilotage. */
const OVERDUE_DEFS = {
  L1:{t:"BAE en retard", h:"Enreg + Facture douane présents, BAE vide, non archivé", sev:"Critique", c:"#d92d20", ico:"🛂"},
  L2:{t:"Facture Douane en retard", h:"Enreg présent, Facture douane vide, non archivé", sev:"Critique", c:"#d92d20", ico:"🏛️"},
  L3:{t:"Mise en Livraison en retard", h:"BAE présent, Mise vide, sans facture, non archivé", sev:"Haute", c:"#e9730c", ico:"🚚"},
  L4:{t:"Livraison en retard", h:"Ni retour ni facture, non archivé : mise ancienne, ou flux terrestre (sans ETA/RTA) bloqué", sev:"Haute", c:"#e9730c", ico:"📦"},
  L5:{t:"Retour Conteneur en retard", h:"Livré, sans facture ni archivage, BAE ancien (conteneur non restitué)", sev:"Haute", c:"#e9730c", ico:"🔄"},
  L6:{t:"Déclarés sans facture prestation", h:"Enreg + BAE présents, sans facture intervention, non archivé", sev:"Haute", c:"#e9730c", ico:"🧾"},
  L7:{t:"Facture prestation en retard", h:"Sans facture ni archivage : retour effectué, ou BAE ancien", sev:"Moyenne", c:"#ca8a04", ico:"💰"},
  L8:{t:"Archivage dossier en retard", h:"Tout dossier non archivé du périmètre", sev:"Moyenne", c:"#ca8a04", ico:"🗄️"},
  L9:{t:"Dossiers sans déclaration", h:"Validation présente, sans enregistrement, ETA connue", sev:"Moyenne", c:"#ca8a04", ico:"❓"},
  L10:{t:"Dossiers avec Débours", h:"Marqueur financier transversal (montant/solde débours) — champ non présent dans l'extraction, non calculé", sev:"Haute", c:"#e9730c", ico:"💳"},
};
const OVERDUE_DEFAULT = {perim:["20C"], days:{L1:3,L2:1,L3:12,L4a:18,L4b:12,L4c:13,L5:45,L6:1,L7:21,L10:0}};
/* Seuils par règle (L4 a trois bras ; L8/L9 sans seuil ; L10 non calculée) */
const OVRULE_DAYS = {L1:["L1"],L2:["L2"],L3:["L3"],L4:["L4a","L4b","L4c"],L5:["L5"],L6:["L6"],L7:["L7"],L8:[],L9:[],L10:[]};
const OVDAY_LBL = {L1:"L1",L2:"L2",L3:"L3",L4a:"L4 mise",L4b:"L4 terrest.",L4c:"L4 amont",L5:"L5",L6:"L6",L7:"L7",L10:"L10"};
OVERDUE_DEFAULT.rules = Object.fromEntries(Object.entries(OVERDUE_DEFS).map(([k,d])=>[k,{on:k!=="L10",sev:d.sev,c:d.c,deleted:false}]));
let OVERDUE = JSON.parse(JSON.stringify(OVERDUE_DEFAULT));
function loadOverdue(){ try{ const raw=localStorage.getItem("spot_overdue"); if(raw){ const o=JSON.parse(raw); if(o&&typeof o==="object"){ if(Array.isArray(o.perim)&&o.perim.length) OVERDUE.perim=o.perim.map(String); if(o.days&&typeof o.days==="object") Object.keys(OVERDUE_DEFAULT.days).forEach(k=>{ const v=Number(o.days[k]); if(Number.isFinite(v)&&v>=0&&v<=3650) OVERDUE.days[k]=v; }); if(o.rules&&typeof o.rules==="object") Object.keys(OVERDUE_DEFAULT.rules).forEach(k=>{ const s=o.rules[k]; if(s&&typeof s==="object"){ const t=OVERDUE.rules[k]; if(typeof s.on==="boolean") t.on=s.on; if(["Critique","Haute","Moyenne"].includes(s.sev)) t.sev=s.sev; if(typeof s.c==="string"&&/^#[0-9a-f]{6}$/i.test(s.c)) t.c=s.c; if(typeof s.deleted==="boolean") t.deleted=s.deleted; } }); } } }catch(err){ console.warn("Overdue non restauré",err); } }
/* Visibilité d'une règle Overdue (réglable/masquable/supprimable en Administration) */
function ovActive(c){ const rl=OVERDUE.rules&&OVERDUE.rules[c]; return !rl||(rl.on!==false&&!rl.deleted); }
function ovSev(c){ const rl=OVERDUE.rules&&OVERDUE.rules[c]; return (rl&&rl.sev)||OVERDUE_DEFS[c].sev; }
function ovColor(c){ const rl=OVERDUE.rules&&OVERDUE.rules[c]; return (rl&&rl.c)||OVERDUE_DEFS[c].c; }
function saveOverdue(){ try{ localStorage.setItem("spot_overdue",JSON.stringify(OVERDUE)); }catch{} }
let CFG = JSON.parse(JSON.stringify(DEFAULT_CFG));
function loadCfg(){ try{ const raw=localStorage.getItem("spot_cfg"); if(raw) CFG=SpotSettings.validate(JSON.parse(raw),DEFAULT_CFG); }catch(err){ console.warn("Réglages non restaurés",err); } }
function saveCfg(){ try{ localStorage.setItem("spot_cfg",JSON.stringify(CFG)); }catch{} }
function alertDef(k){ return CFG.alerts[k]||ALERT_BASE[k]; }
function sevColor(sev){ return CFG.sevColors[sev]||SEV_DEFAULT[sev]||"#64748b"; }
function applySevColors(){ const r=document.documentElement.style; r.setProperty("--agl-red",sevColor("Critique")); r.setProperty("--agl-orange",sevColor("Haute")); }
// compat : ALERT_DEFS et SLA lus dynamiquement
const ALERT_DEFS = new Proxy({}, { get:(t,k)=>alertDef(k), ownKeys:()=>Object.keys(CFG.alerts), getOwnPropertyDescriptor:()=>({enumerable:true,configurable:true}) });
const SLA = new Proxy({}, { get:(t,k)=>CFG.sla[k]??SLA_DEFAULT[k], ownKeys:()=>Object.keys(SLA_DEFAULT), getOwnPropertyDescriptor:()=>({enumerable:true,configurable:true}) });
const FIELDS = [
  {k:"com", label:"COM", syn:["com","commercial","chargé","cm","comercial","owner"]},
  {k:"metier", label:"Métier", syn:["metier","métier","bu","section","metiers"]},
  {k:"sousMetier", label:"Sous-métier", syn:["sous-metier","sous metier","sousmetier","sous métier","sub"]},
  {k:"client", label:"Client", syn:["client","customer","nom client"]},
  {k:"sousCompte", label:"Sous-compte", syn:["sous-compte","sous compte","souscompte","compte","sub account"]},
  {k:"designation", label:"Désignation", syn:["designation","désignation","marchandise","libelle","libellé","description","nature"]},
  {k:"poids", label:"Poids", syn:["poids","weight","tonnage"]},
  {k:"dossier", label:"Numéro dossier", syn:["numero dossier","numéro dossier","n° dossier","num dossier","dossier","reference","référence","ref dossier","ndo"]},
  {k:"com1", label:"Commentaire 1", syn:["commentaire 1","commentaire1","comm 1","com 1"]},
  {k:"com2", label:"Commentaire 2", syn:["commentaire 2","commentaire2"]},
  {k:"com3", label:"Commentaire 3", syn:["commentaire 3","commentaire3"]},
  {k:"com4", label:"Commentaire 4", syn:["commentaire 4","commentaire4"]},
  {k:"com5", label:"Commentaire 5", syn:["commentaire 5","commentaire5"]},
  {k:"dateETA", label:"Date ETA", syn:["date eta","eta","date_eta","arrivee prevue","arrivée prévue"]},
  {k:"delaiETA", label:"Délai ETA", syn:["delai eta","délai eta","delai_eta","delai eta (j)","dela i eta"]},
  {k:"dateRTA", label:"Date RTA", syn:["date rta","rta","date_rta"]},
  {k:"delaiRTA", label:"Délai RTA", syn:["delai rta","délai rta","delai_rta"]},
  {k:"dateValidation", label:"Date validation", syn:["date validation","validation","date_validation","date ouverture"]},
  {k:"auteur", label:"Auteur ouverture", syn:["auteur ouverture","auteur","ouvert par","operateur","opérateur","creator"]},
  {k:"dateDocs", label:"Date documents complets", syn:["date documents complets","documents complets","docs complets","date_docs","doc complet"]},
  {k:"dateNote", label:"Date validation note de détail", syn:["date validation note de detail","note de detail","note de détail","date_note","validation note"]},
  {k:"dateEnreg", label:"Date enregistrement douane", syn:["date enregistrement douane","enregistrement douane","date_enreg","enreg douane"]},
  {k:"dateFactDouane", label:"Date facture douane", syn:["date facture douane","facture douane","date_facture_douane"]},
  {k:"dateBAE", label:"Date obtention BAE", syn:["date obtention bae","obtention bae","bae","date_bae","bon a enlever"]},
  {k:"dateMise", label:"Date mise en livraison", syn:["date mise en livraison","mise en livraison","date_mise"]},
  {k:"dateRetour", label:"Date retour livraison", syn:["date retour livraison","retour livraison","date_retour"]},
  {k:"dateFactInt", label:"Date facture intervention", syn:["date facture intervention","facture intervention","date_facture_intervention"]},
  {k:"dateValidFinal", label:"Date validation final", syn:["date validation final","validation final","validation finale","date_validation_final"]},
  {k:"dateArchivage", label:"Date archivage", syn:["date archivage","archivage","date_archivage","cloture","clôture"]},
];

/* ---------- Utils dates ---------- */
const norm = s => (s==null?"":String(s)).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
function excelToDate(v){
  if(v==null||v==="") return null;
  if(v instanceof Date && !isNaN(v)) { v.setHours(0,0,0,0); return v; }
  if(typeof v==="number" && v>20000 && v<80000){ const d=new Date(Math.round((v-25569)*86400*1000)); d.setHours(0,0,0,0); return d; }
  const s=String(v).trim();
  if(!s) return null;
  let m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if(m){ let [_,a,b,c]=m; let y=+c; if(y<100) y+=2000; const d=new Date(y,+b-1,+a); if(!isNaN(d)) {d.setHours(0,0,0,0); return d;} }
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m){ const d=new Date(+m[1],+m[2]-1,+m[3]); if(!isNaN(d)){d.setHours(0,0,0,0); return d;} }
  const d=new Date(s); if(!isNaN(d)){d.setHours(0,0,0,0); return d;}
  return null;
}
const fmtD = d => d? d.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}) : "—";
/* Nombres : séparateur de milliers = espace insécable classique (U+00A0), toujours visible.
   (toLocaleString fr-FR utilise une espace fine U+202F qui s'affiche quasi invisible selon les polices/navigateurs.) */
const fmtN = v => (v==null||!Number.isFinite(+v)) ? "—" : Number(v).toLocaleString("fr-FR").replace(/[\u202F\u2009]/g, "\u00A0");
const diffJ = (a,b) => (!a||!b)?null:Math.round((a-b)/86400000);
const todayPilot = () => { const v=$("#pilotDate").value; if(v){const d=new Date(v+"T00:00:00"); if(!isNaN(d)) return d;} const d=new Date(); d.setHours(0,0,0,0); return d; };

/* ---------- État ---------- */
const S = { rows:[], enriched:[], mapping:null, headers:[], fileName:"", alertFilter:null, sevFilter:"", sortMain:{k:"crit",dir:-1}, sortAlert:{k:"crit",dir:-1}, pageMain:0, pageAlert:0, perPage:100, activeView:"pilotage", selCom:"", pilMonth:"", pins:{}, notes:{}, pinSel:new Set(), pinQ:"", pinSort:"score", selClient:"", clientQ:"", ovCom:"", ovClient:"", ovQ:"", ovCat:"", ovSev:"", ovMinAge:"", ovEta1:"", ovEta2:"", ovSort:"age", ovPage:0, ovRefDate:"2026-09-21" };
/* Filtres globaux — appliqués à toutes les vues */
const F = { com:"", metier:"", crit:"", month:"", year:"", rtaMonth:"", rtaYear:"", dFrom:"", dTo:"", alertTypes:[], clients:[], hideArchived:false };
/* Préférences persistantes (toggles) */
S.prefs={commentBadge:true};
function loadPrefs(){ try{ const p=JSON.parse(localStorage.getItem("spot_prefs")||"{}"); S.prefs={commentBadge:p.commentBadge!==false}; F.hideArchived=!!p.hideArchived; }catch{} const ha=$("#gHideArchived"); if(ha) ha.checked=F.hideArchived; const cb=$("#gCommentBadge"); if(cb) cb.checked=S.prefs.commentBadge; }
function savePrefs(){ try{ localStorage.setItem("spot_prefs",JSON.stringify({commentBadge:S.prefs.commentBadge,hideArchived:F.hideArchived})); }catch{} }
/* visibilité multi-critères des types d'alerte : vide = tous visibles */
function matchTypes(r){ return !F.alertTypes.length || r.alerts.some(a=>F.alertTypes.includes(a.c)); }
function visibleAlerts(r){ return r.alerts.filter(a=>CFG.alerts[a.c]&&CFG.alerts[a.c].on!==false&&!CFG.alerts[a.c].deleted&&(!F.alertTypes.length||F.alertTypes.includes(a.c))); }
/* Épinglés direction + notes du directeur — persistés en local */
function loadLocal(){ try{ S.pins=JSON.parse(localStorage.getItem("spot_pins")||"{}")||{}; }catch{ S.pins={}; } try{ S.notes=JSON.parse(localStorage.getItem("spot_notes")||"{}")||{}; }catch{ S.notes={}; } }
function savePins(){ try{ localStorage.setItem("spot_pins",JSON.stringify(S.pins)); }catch{} }
function saveNotes(){ try{ localStorage.setItem("spot_notes",JSON.stringify(S.notes)); }catch{} }
function togglePin(i){
  if(S.pins[i]){ delete S.pins[i]; toast("☆ Retiré des épinglés"); }
  else { S.pins[i]=1; toast("📌 Dossier épinglé — voir l'onglet <b>Épinglés</b>"); }
  const dp=$("#dPin"); if(dp) dp.textContent=S.pins[i]?"★ Épinglé":"☆ Épingler";
  savePins(); renderAll();
}
/* Infobulle au survol : note direction + commentaires complets */
function tipHTML(r){
  const parts=[];
  if(S.notes[r._i]) parts.push(`<div class="tip-h">📌 Note direction</div>${esc(S.notes[r._i]).replace(/\n/g,"<br>")}`);
  const c=(r.comments||"").trim();
  parts.push(`<div class="tip-h">💬 Commentaires (1–5)</div>${c?esc(c).replace(/\n/g,"<br>"):'<i style="color:#94a3b8">Aucun commentaire saisi</i>'}`);
  return parts.join("");
}
const MOIS=["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
const ymLabel=ym=>{ if(!ym) return ""; const [y,m]=ym.split("-"); return `${MOIS[+m-1]||m} ${y}`; };
const toast = m => { const t=document.createElement("div"); t.className="toast"; t.innerHTML=m; $("#toasts").appendChild(t); setTimeout(()=>t.remove(),4200); };
function setImportState(state,message){
  const hero=$("#heroBox");
  ["loaded","loading","error"].forEach(c=>hero.classList.toggle(c,c===state));
  $("#importState").textContent={loaded:"Fichier chargé",loading:"Import en cours",error:"Import à vérifier",empty:"En attente d’un fichier"}[state];
  $("#importTitle").textContent=state==="loaded"?`${fmtN(S.enriched.length)} dossiers disponibles`:state==="loading"?"Préparation des dossiers":state==="error"?"L’import n’a pas abouti":"Importez vos dossiers";
  $("#loadStatus").textContent=message||S.fileName||"Export « Dossiers par COM »";
  $("#importAction").textContent=S.enriched.length?"Remplacer le fichier":"Choisir un fichier";
  const be=$("#btnEject"); if(be) be.disabled=(state!=="loaded");
}

/* IndexedDB minimal */
const IDB = {
  db:null,
  open(){ return new Promise(res=>{ try{ const r=indexedDB.open("spot-cockpit",1); r.onupgradeneeded=e=>{e.target.result.createObjectStore("kv");}; r.onsuccess=e=>{IDB.db=e.target.result;res(true);}; r.onerror=()=>res(false);}catch{res(false)} }); },
  put(k,v){ return new Promise(res=>{ if(!IDB.db) return res(false); try{ const tx=IDB.db.transaction("kv","readwrite"); tx.objectStore("kv").put(v,k); tx.oncomplete=()=>res(true); tx.onerror=()=>res(false);}catch{res(false)} }); },
  get(k){ return new Promise(res=>{ if(!IDB.db) return res(null); try{ const tx=IDB.db.transaction("kv","readonly"); const q=tx.objectStore("kv").get(k); q.onsuccess=()=>res(q.result||null); q.onerror=()=>res(null);}catch{res(null)} }); },
  del(k){ return new Promise(res=>{ if(!IDB.db) return res(false); try{ const tx=IDB.db.transaction("kv","readwrite"); tx.objectStore("kv").delete(k); tx.oncomplete=()=>res(true); tx.onerror=()=>res(false);}catch{res(false)} }); }
};

/* ---------- Mapping intelligent ---------- */
function autoMap(headers){
  const nh=headers.map(norm);
  const out={};
  FIELDS.forEach(f=>{
    let best={idx:-1,score:0};
    nh.forEach((h,i)=>{
      let sc=0;
      if(h===norm(f.label)) sc=100;
      f.syn.forEach(s=>{ const ns=norm(s); if(h===ns) sc=Math.max(sc,95); else if(h.includes(ns)&&ns.length>2) sc=Math.max(sc,70); else if(ns.includes(h)&&h.length>2) sc=Math.max(sc,55); });
      if(h.includes(norm(f.label))&&norm(f.label).length>2) sc=Math.max(sc,75);
      if(sc>best.score) best={idx:i,score:sc};
    });
    out[f.k]={col:best.idx>=0?headers[best.idx]:"", conf:best.score>=90?"high":best.score>=60?"mid":"low", score:best.score};
  });
  return out;
}
function applyMapping(headers, rows, mapping){ const colIdx={}; headers.forEach((h,i)=>colIdx[h]=i); return rows.map((_,ri)=>mapRow(headers,colIdx,rows,ri,mapping)); }
/* Version par blocs (gros volumes, ex. 150 000 lignes) : l'interface reste réactive + progression visible */
async function applyMappingAsync(headers, rows, mapping, onProgress){
  const colIdx={}; headers.forEach((h,i)=>colIdx[h]=i);
  const out=new Array(rows.length); const CH=25000;
  for(let i=0;i<rows.length;i+=CH){
    const end=Math.min(i+CH,rows.length);
    for(let j=i;j<end;j++) out[j]=mapRow(headers,colIdx,rows,j,mapping);
    if(onProgress) onProgress(end,rows.length);
    await new Promise(r=>setTimeout(r));
  }
  return out;
}
function mapRow(headers, colIdx, rows, ri, mapping){
  const r=rows[ri];
    const g=k=>{ const m=mapping[k]; if(!m||!m.col||!(m.col in colIdx)) return ""; const v=r[colIdx[m.col]]; return v==null?"":String(v).trim(); };
    return {_i:ri, com:g("com"), metier:g("metier"), sousMetier:g("sousMetier"), client:g("client"), sousCompte:g("sousCompte"), designation:g("designation"), poids:g("poids"), dossier:g("dossier"),
      com1:g("com1"),com2:g("com2"),com3:g("com3"),com4:g("com4"),com5:g("com5"), auteur:g("auteur"),
      dateETA:excelToDate(rows[ri][colIdx[mapping.dateETA?.col]] ?? g("dateETA")), dateRTA:excelToDate(rows[ri][colIdx[mapping.dateRTA?.col]] ?? g("dateRTA")),
      dateValidation:excelToDate(rows[ri][colIdx[mapping.dateValidation?.col]] ?? ""), dateDocs:excelToDate(rows[ri][colIdx[mapping.dateDocs?.col]] ?? ""),
      dateNote:excelToDate(rows[ri][colIdx[mapping.dateNote?.col]] ?? ""), dateEnreg:excelToDate(rows[ri][colIdx[mapping.dateEnreg?.col]] ?? ""),
      dateFactDouane:excelToDate(rows[ri][colIdx[mapping.dateFactDouane?.col]] ?? ""), dateBAE:excelToDate(rows[ri][colIdx[mapping.dateBAE?.col]] ?? ""),
      dateMise:excelToDate(rows[ri][colIdx[mapping.dateMise?.col]] ?? ""), dateRetour:excelToDate(rows[ri][colIdx[mapping.dateRetour?.col]] ?? ""),
      dateFactInt:excelToDate(rows[ri][colIdx[mapping.dateFactInt?.col]] ?? ""), dateValidFinal:excelToDate(rows[ri][colIdx[mapping.dateValidFinal?.col]] ?? ""),
      dateArchivage:excelToDate(rows[ri][colIdx[mapping.dateArchivage?.col]] ?? ""),
      delaiETA_raw:rows[ri][colIdx[mapping.delaiETA?.col] ?? -1], delaiRTA_raw:rows[ri][colIdx[mapping.delaiRTA?.col] ?? -1]};
}

/* ---------- Moteur d'enrichissement ---------- */
function dossierCounts(rows){ const counts={}; rows.forEach(r=>{ if(r.dossier) counts[r.dossier]=(counts[r.dossier]||0)+1; }); return counts; }
/* MAJ masse (A9) : date posée en masse sur plus de X % des dossiers → import/interface à vérifier */
let massInfo={set:null,pct:0};
function massDates(rows){
  massInfo={set:null,pct:0};
  const rule=CFG.alerts.A9;
  if(!rule||rule.on===false||rule.deleted||rule.conditions||!rows.length) return;
  const pct=rule.days??30;
  const freq=new Map();
  rows.forEach(r=>{ STEPS.forEach(s=>{ const d=r[s.dateKey]; if(d instanceof Date&&!isNaN(d)){ const t=d.getTime(); freq.set(t,(freq.get(t)||0)+1); } }); });
  let top=0; const set=new Set();
  freq.forEach((n,t)=>{ const share=n/rows.length*100; if(share>pct){ set.add(t); if(share>top) top=share; } });
  if(set.size) massInfo={set,pct:Math.round(top)};
}
function enrichAll(rows){ const P=todayPilot(), counts=dossierCounts(rows); massDates(rows); return rows.map(r=>enrichRow(r,P,counts)); }
/* Version par blocs (gros volumes) : progression visible, interface non figée */
async function enrichAllAsync(rows, onProgress){
  const P=todayPilot(), counts=dossierCounts(rows); massDates(rows);
  const out=new Array(rows.length); const CH=20000;
  for(let i=0;i<rows.length;i+=CH){
    const end=Math.min(i+CH,rows.length);
    for(let j=i;j<end;j++) out[j]=enrichRow(rows[j],P,counts);
    if(onProgress) onProgress(end,rows.length);
    await new Promise(r=>setTimeout(r));
  }
  return out;
}
function enrichRow(r, P, counts){
    const delaiETA = r.dateETA? diffJ(r.dateETA,P) : (typeof r.delaiETA_raw==="number"?r.delaiETA_raw:(parseFloat(r.delaiETA_raw)||null));
    const delaiRTA = r.dateRTA? diffJ(r.dateRTA,P) : (typeof r.delaiRTA_raw==="number"?r.delaiRTA_raw:(parseFloat(r.delaiRTA_raw)||null));
    // étape bloquante = dernière étape renseignée
    let lastIdx=-1; STEPS.forEach((s,i)=>{ if(r[s.dateKey]) lastIdx=i; });
    const etape = lastIdx<0?{k:"validation",label:"À ouvrir"}: lastIdx>=STEPS.length-1?{k:"archive",label:"Archivé"}: {k:STEPS[lastIdx+1].k, label:"En attente : "+STEPS[lastIdx+1].label};
    const etapeKey = lastIdx<0?"validation": lastIdx>=STEPS.length-1?"archive": STEPS[lastIdx+1].k;
    // stagnations
    const stagn=[]; 
    const pushStag=(from,to,sla,label)=>{ if(from&&!to){ const d=diffJ(P,from); if(d!=null&&d>sla) stagn.push({label,jours:d}); } else if(from&&to){ const d=diffJ(to,from); if(d!=null&&d>sla) stagn.push({label:label+" (écoulé)",jours:d}); } };
    pushStag(r.dateValidation,r.dateDocs,SLA.validation,"Validation→Docs");
    pushStag(r.dateDocs,r.dateNote,SLA.docs,"Docs→Note");
    pushStag(r.dateNote,r.dateEnreg,SLA.note,"Note→Enreg");
    pushStag(r.dateEnreg,r.dateFactDouane,SLA.douane,"Enreg→Facture");
    pushStag(r.dateFactDouane,r.dateBAE,SLA.factDouane,"Facture→BAE");
    pushStag(r.dateBAE,r.dateMise,SLA.bae,"BAE→Mise");
    pushStag(r.dateMise,r.dateRetour,SLA.mise,"Mise→Retour");
    pushStag(r.dateRetour,r.dateFactInt,SLA.retour,"Retour→FactInt");
    pushStag(r.dateFactInt,r.dateValidFinal,SLA.factInt,"FactInt→ValidFin");
    pushStag(r.dateValidFinal,r.dateArchivage,SLA.validFinal,"ValidFin→Archiv");
    // inversions (écart en jours conservé pour la tolérance ; la facturation anticipée après mise/retour est acceptée)
    const inv=[]; let prev=null, prevL="", prevK="";
    STEPS.map(s=>[s.label,s.dateKey,r[s.dateKey]]).forEach(([l,k,d])=>{
      if(d){ if(prev&&d<prev) inv.push({t:prevL+" → "+l, gap:diffJ(prev,d), pk:prevK, ck:k}); prev=d; prevL=l; prevK=k; }
    });
    // alertes (paramétrables depuis Administration)
    // Seules les stagnations EN COURS scorent ; l'historique (écoulé) reste visible sans points.
    const al=[];
    const on=k=>!!CFG.alerts[k]&&CFG.alerts[k].on!==false&&!CFG.alerts[k].deleted&&!CFG.alerts[k].conditions;
    const stagnNow=stagn.filter(s=>!/\(écoulé\)/.test(s.label));
    if(on("A1")&&r.dateETA&&delaiETA!=null&&delaiETA<0&&!r.dateBAE) al.push({c:"A1",d:`Arrivée estimée ${fmtD(r.dateETA)} dépassée de ${-delaiETA}j sans BAE · ${r.dateRTA?"arrivée réelle : "+fmtD(r.dateRTA):"RTA non renseignée : arrivée réelle non confirmée"}`});
    if(on("A2")&&r.dateRTA&&delaiRTA!=null&&delaiRTA<0&&!r.dateArchivage) al.push({c:"A2",d:`RTA ${fmtD(r.dateRTA)} dépassée de ${-delaiRTA}j, non archivé`});
    if(on("A3")){ const tol=CFG.alerts.A3.days??2; inv.filter(x=>x.gap>tol&&!(x.ck==="dateFactInt"&&(x.pk==="dateRetour"||x.pk==="dateMise"))).forEach(x=>al.push({c:"A3",d:"Inversion : "+x.t})); }
    if(on("A4")&&stagnNow.some(s=>s.label.startsWith("Validation")||s.label.startsWith("Docs")||s.label.startsWith("Note"))) al.push({c:"A4",d:stagnNow.filter(s=>/Validation|Docs|Note/.test(s.label)).map(s=>`${s.label} : ${s.jours}j`).join(" • ")});
    if(on("A5")&&r.dateEnreg&&!r.dateFactDouane&&diffJ(P,r.dateEnreg)>(CFG.alerts.A5.days??3)) al.push({c:"A5",d:`Enregistrement ${fmtD(r.dateEnreg)} sans facture douane depuis ${diffJ(P,r.dateEnreg)}j → point dur douane`});
    if(on("A6")&&r.dateFactDouane&&!r.dateBAE&&diffJ(P,r.dateFactDouane)>(CFG.alerts.A6.days??3)) al.push({c:"A6",d:`Facture douane ${fmtD(r.dateFactDouane)} sans BAE depuis ${diffJ(P,r.dateFactDouane)}j`});
    if(on("A7")&&r.dateBAE&&(!r.dateMise||!r.dateRetour)){ const d=diffJ(P,r.dateBAE); if(d>(CFG.alerts.A7.days??2)) al.push({c:"A7",d:`BAE ${fmtD(r.dateBAE)}, livraison en attente depuis ${d}j`}); }
    if(on("A8")&&r.dateRetour&&(!r.dateFactInt||!r.dateArchivage)&&diffJ(P,r.dateRetour)>(CFG.alerts.A8.days??5)) al.push({c:"A8",d:`Retour ${fmtD(r.dateRetour)} sans clôture (facture/archivage) depuis ${diffJ(P,r.dateRetour)}j`});
    if(on("A9")&&massInfo.set&&STEPS.some(s=>{ const d=r[s.dateKey]; return d instanceof Date&&massInfo.set.has(d.getTime()); })) al.push({c:"A9",d:`Date posée en masse sur ${massInfo.pct}% des dossiers — vérifier import/interface`});
    if(on("A10")){
      if(!r.com||!r.client||!r.dossier) al.push({c:"A10",d:"Champ clé vide : "+[!r.com&&"COM",!r.client&&"Client",!r.dossier&&"N° dossier"].filter(Boolean).join(", ")});
      if(r.dossier&&counts[r.dossier]>1) al.push({c:"A10",d:`N° dossier en double (${counts[r.dossier]}×)`});
    }
    if(on("A11")&&r.dateMise&&!r.dateRetour&&!r.dateFactInt&&diffJ(P,r.dateMise)>(CFG.alerts.A11.days??7)) al.push({c:"A11",d:`Mise ${fmtD(r.dateMise)} sans retour ni facture depuis ${diffJ(P,r.dateMise)}j`});
    if(on("A12")&&r.dateEnreg&&r.dateBAE&&!r.dateFactInt&&diffJ(P,r.dateEnreg)>(CFG.alerts.A12.days??7)) al.push({c:"A12",d:`Enregistré ${fmtD(r.dateEnreg)} (BAE ${fmtD(r.dateBAE)}) sans facture prestation depuis ${diffJ(P,r.dateEnreg)}j`});
    // exclusivités : l'alerte la plus précise l'emporte (évite le double comptage d'un même blocage)
    if(al.some(a=>a.c==="A11")){ const i=al.findIndex(a=>a.c==="A7"); if(i>=0) al.splice(i,1); }
    if(al.some(a=>a.c==="A12")){ const i=al.findIndex(a=>a.c==="A8"); if(i>=0) al.splice(i,1); }
    const ruleRow={...r,delaiETA,delaiRTA,etapeKey,stagnCount:stagn.length,comments:[r.com1,r.com2,r.com3,r.com4,r.com5].filter(Boolean).join(" • ")};
    Object.entries(CFG.alerts).forEach(([code,rule])=>{
      if(rule.on!==false&&!rule.deleted&&rule.conditions&&SpotSettings.matches(rule,ruleRow,P)) al.push({c:code,d:rule.h||rule.t});
    });
    // score criticité (poids paramétrables) : somme des blocages en cours.
    // L'ancienneté est déjà portée par les seuils de chaque règle (pas de double comptage).
    let sc=0;
    al.forEach(a=>{ sc+= (CFG.alerts[a.c]?.w ?? 8); });
    sc=Math.min(100,sc);
    const crit = sc>=CFG.thCrit?"Critique": sc>=CFG.thHaute?"Haute": sc>=CFG.thMoy?"Moyenne":"OK";
    const comments=[r.com1,r.com2,r.com3,r.com4,r.com5].filter(x=>x&&String(x).trim()).join(" • ");
    const etaYM=r.dateETA?`${r.dateETA.getFullYear()}-${String(r.dateETA.getMonth()+1).padStart(2,"0")}`:"";
    const rtaYM=r.dateRTA?`${r.dateRTA.getFullYear()}-${String(r.dateRTA.getMonth()+1).padStart(2,"0")}`:"";
    return {...r, delaiETA, delaiRTA, etape:etape.label, etapeKey, stagn, inv, alerts:al, score:sc, crit, comments, lastIdx, etaYM, etaYear:r.dateETA?String(r.dateETA.getFullYear()):"", etaMonth:r.dateETA?String(r.dateETA.getMonth()+1).padStart(2,"0"):"", rtaYM, rtaYear:r.dateRTA?String(r.dateRTA.getFullYear()):""};
}

/* ---------- Overdue : périmètre + 9 points + suivi ---------- */
function overdueInPerim(r){
  if(!OVERDUE.perim.length) return true;
  const sm=String(r.sousMetier||"").trim();
  return OVERDUE.perim.some(p=>sm===String(p).trim());
}
function overdueAge(pilot, d){ return (!d||!(d instanceof Date)||isNaN(d))?null:Math.round((pilot-d)/86400000); }
function overdueOf(r, pilot){
  if(!overdueInPerim(r)) return [];
  const D=OVERDUE.days, out=[];
  const ageEnreg=overdueAge(pilot,r.dateEnreg), ageFact=overdueAge(pilot,r.dateFactDouane), ageBAE=overdueAge(pilot,r.dateBAE), ageMise=overdueAge(pilot,r.dateMise), ageValid=overdueAge(pilot,r.dateValidation);
  const noETA=!r.dateETA&&!r.dateRTA;
  if(ovActive("L1")&&r.dateEnreg&&r.dateFactDouane&&!r.dateBAE&&!r.dateArchivage&&ageFact!=null&&ageFact>D.L1) out.push({c:"L1", age:ageFact, ref:r.dateFactDouane, miss:"BAE"});
  if(ovActive("L2")&&r.dateEnreg&&!r.dateFactDouane&&!r.dateArchivage&&ageEnreg!=null&&ageEnreg>D.L2) out.push({c:"L2", age:ageEnreg, ref:r.dateEnreg, miss:"Facture douane"});
  if(ovActive("L3")&&r.dateBAE&&!r.dateMise&&!r.dateFactInt&&!r.dateArchivage&&ageBAE!=null&&ageBAE>D.L3) out.push({c:"L3", age:ageBAE, ref:r.dateBAE, miss:"Mise en livraison"});
  if(ovActive("L4")&&!r.dateRetour&&!r.dateFactInt&&!r.dateArchivage){
    let am=null, rf=null;
    if(r.dateMise&&ageMise!=null&&ageMise>D.L4a){ am=ageMise; rf=r.dateMise; }
    else if(r.dateBAE&&!r.dateMise&&noETA&&ageBAE!=null&&ageBAE>D.L4b){ am=ageBAE; rf=r.dateBAE; }
    else if(r.dateValidation&&!r.dateEnreg&&noETA&&ageValid!=null&&ageValid>D.L4c){ am=ageValid; rf=r.dateValidation; }
    if(am!=null) out.push({c:"L4", age:am, ref:rf, miss:"Livraison"});
  }
  if(ovActive("L5")&&(r.dateMise||r.dateRetour)&&!r.dateFactInt&&!r.dateArchivage&&ageBAE!=null&&ageBAE>D.L5) out.push({c:"L5", age:ageBAE, ref:r.dateBAE, miss:"Conteneur / facture"});
  if(ovActive("L6")&&r.dateEnreg&&r.dateBAE&&!r.dateFactInt&&!r.dateArchivage&&ageEnreg!=null&&ageEnreg>D.L6) out.push({c:"L6", age:ageEnreg, ref:r.dateEnreg, miss:"Facture prestation"});
  if(ovActive("L7")&&!r.dateFactInt&&!r.dateArchivage){
    if(r.dateRetour) out.push({c:"L7", age:overdueAge(pilot,r.dateRetour), ref:r.dateRetour, miss:"Facture prestation"});
    else if(r.dateBAE&&ageBAE!=null&&ageBAE>D.L7) out.push({c:"L7", age:ageBAE, ref:r.dateBAE, miss:"Facture prestation"});
  }
  if(ovActive("L8")&&!r.dateArchivage) out.push({c:"L8", age:ageBAE!=null?ageBAE:(ageEnreg!=null?ageEnreg:ageValid), ref:r.dateBAE||r.dateEnreg||r.dateValidation, miss:"Archivage"});
  if(ovActive("L9")&&r.dateValidation&&!r.dateEnreg&&r.dateETA) out.push({c:"L9", age:ageValid, ref:r.dateValidation, miss:"Enregistrement douane"});
  return out;
}
function overdueAll(){
  const P=todayPilot();
  const list=[];
  S.enriched.forEach(r=>{ if(F.hideArchived&&r.dateArchivage) return; overdueOf(r,P).forEach(o=>list.push({r,o})); });
  return list;
}
function overdueMatchGlobal(r){
  if(F.com&&r.com!==F.com) return false;
  if(F.metier&&r.metier!==F.metier) return false;
  if(F.clients.length&&!F.clients.includes(String(r.client||"").trim())) return false;
  if(F.crit&&r.crit!==F.crit) return false;
  if(F.month&&r.etaYM!==F.month) return false;
  if(F.year&&r.etaYear!==F.year) return false;
  if(F.rtaMonth&&r.rtaYM!==F.rtaMonth) return false;
  if(F.rtaYear&&r.rtaYear!==F.rtaYear) return false;
  if(F.dFrom){ const d1=new Date(F.dFrom+"T00:00:00"); if(!r.dateETA||r.dateETA<d1) return false; }
  if(F.dTo){ const d2=new Date(F.dTo+"T00:00:00"); if(!r.dateETA||r.dateETA>d2) return false; }
  return true;
}
function overdueGlobalList(){
  return overdueAll().filter(({r})=>overdueMatchGlobal(r));
}
function overdueCounts(){
  const counts={L1:0,L2:0,L3:0,L4:0,L5:0,L6:0,L7:0,L8:0,L9:0};
  overdueGlobalList().forEach(({o})=>{ counts[o.c]=(counts[o.c]||0)+1; });
  return counts;
}
function overdueFiltered(){
  const q=norm(S.ovQ||""), com=S.ovCom||"", client=S.ovClient||"", cat=S.ovCat||"", sev=S.ovSev||"";
  const minAge=S.ovMinAge===""||S.ovMinAge==null?null:+S.ovMinAge;
  const e1=S.ovEta1?new Date(S.ovEta1+"T00:00:00"):null, e2=S.ovEta2?new Date(S.ovEta2+"T00:00:00"):null;
  let list=overdueAll().filter(({r,o})=>{
    // choix locaux de la vue
    if(com&&r.com!==com) return false;
    if(client&&r.client!==client) return false;
    if(cat&&o.c!==cat) return false;
    if(sev&&ovSev(o.c)!==sev) return false;
    if(minAge!=null&&!(o.age>=minAge)) return false;
    if(e1&&(!r.dateETA||r.dateETA<e1)) return false;
    if(e2&&(!r.dateETA||r.dateETA>e2)) return false;
    // logique globale : mêmes filtres que les autres vues
    if(!overdueMatchGlobal(r)) return false;
    if(q){ const hay=norm([r.dossier,r.client,r.designation,r.com,r.comments].join(" ")); if(!hay.includes(q)) return false; }
    return true;
  });
  list.sort((a,b)=> S.ovSort==="dossier" ? String(a.r.dossier||"").localeCompare(String(b.r.dossier||"")) : S.ovSort==="com" ? String(a.r.com||"").localeCompare(String(b.r.com||"")) : S.ovSort==="client" ? String(a.r.client||"").localeCompare(String(b.r.client||"")) : (b.o.age||0)-(a.o.age||0));
  return list;
}
/* Référence de mesure manuelle : date choisie, recomptée par le système depuis le fichier chargé */
const OV_REF_DEFAULT="2026-09-21";
function ovRefDate(){ const v=S.ovRefDate||""; if(!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null; const d=new Date(v+"T00:00:00"); return isNaN(d)?null:d; }
function ovRefLabel(){ const d=ovRefDate(); return d?("Réf. "+String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")):"Référence"; }
function saveOvRefDate(){ try{ localStorage.setItem("spot_ovrefdate", S.ovRefDate||""); }catch{} }
function loadOvRefDate(){ try{ const v=localStorage.getItem("spot_ovrefdate"); S.ovRefDate=(v&&/^\d{4}-\d{2}-\d{2}$/.test(v))?v:OV_REF_DEFAULT; }catch{ S.ovRefDate=OV_REF_DEFAULT; } }
function overdueListAt(pilot){
  const list=[];
  if(!(pilot instanceof Date)||isNaN(pilot)) return list;
  S.enriched.forEach(r=>{ if(F.hideArchived&&r.dateArchivage) return; if(!overdueMatchGlobal(r)) return; overdueOf(r,pilot).forEach(o=>list.push({r,o})); });
  return list;
}
function overdueCountsAt(pilot){
  const counts={L1:0,L2:0,L3:0,L4:0,L5:0,L6:0,L7:0,L8:0,L9:0};
  overdueListAt(pilot).forEach(({o})=>{ counts[o.c]=(counts[o.c]||0)+1; });
  return counts;
}
function overdueToCSV(rows){
  const q=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  const head=["categorie","libelle","dossier","com","client","etape_manquante","anciennete_j","date_reference","ETA","RTA","commentaires"];
  const lines=[head.join(";")];
  rows.forEach(({r,o})=>lines.push([o.c,OVERDUE_DEFS[o.c].t,r.dossier,r.com,r.client,o.miss,o.age,fmtD(o.ref),fmtD(r.dateETA),fmtD(r.dateRTA),r.comments].map(q).join(";")));
  return "﻿"+lines.join("\n");
}

/* ---------- Filtres ---------- */
function uniq(k){ const s=new Set(); S.enriched.forEach(r=>{ if(r[k]) s.add(String(r[k]).trim()); }); return [...s].sort((a,b)=>a.localeCompare(b,"fr")); }
function uniqYM(){ const s=new Set(); S.enriched.forEach(r=>{ if(r.etaYM) s.add(r.etaYM); }); return [...s].sort(); }
function uniqYear(){ const s=new Set(); S.enriched.forEach(r=>{ if(r.etaYear) s.add(r.etaYear); }); return [...s].sort().reverse(); }
function setSelect(el,v){ if(!el) return; el.value=v||""; }
function fillSelects(){
  const coms=uniq("com"), mets=uniq("metier"), yms=uniqYM(), yrs=uniqYear();
  const rtaYms=[...new Set(S.enriched.map(r=>r.rtaYM).filter(Boolean))].sort();
  const rtaYrs=[...new Set(S.enriched.map(r=>r.rtaYear).filter(Boolean))].sort().reverse();
  const opt=(cur,vals,lbl)=>'<option value="">'+lbl+'</option>'+vals.map(v=>`<option value="${esc(v)}" ${v===cur?"selected":""}>${esc(v)}</option>`).join("");
  const optYM=cur=>'<option value="">Tous</option>'+yms.map(v=>`<option value="${v}" ${v===cur?"selected":""}>${esc(ymLabel(v))}</option>`).join("");
  // barre globale
  setSelect($("#gCom"),F.com); $("#gCom").innerHTML=opt(F.com,coms,"Tous");
  setSelect($("#gMetier"),F.metier); $("#gMetier").innerHTML=opt(F.metier,mets,"Tous");
  setSelect($("#gMonth"),F.month); $("#gMonth").innerHTML=optYM(F.month);
  setSelect($("#gYear"),F.year); $("#gYear").innerHTML='<option value="">Toutes</option>'+yrs.map(v=>`<option ${v===F.year?"selected":""}>${v}</option>`).join("");
  setSelect($("#gCrit"),F.crit);
  // datalist clients (recherche performance client) — intégral
  const clOpt=$("#clientOptions"); if(clOpt){ const cur=$("#clientSearch")?.value; clOpt.innerHTML=uniq("client").map(c=>`<option value="${esc(c)}">`).join(""); if(cur!=null) $("#clientSearch").value=cur; }
  // dossiers (miroirs + spécifiques)
  setSelect($("#fCom"),F.com); $("#fCom").innerHTML=opt(F.com,coms,"Tous");
  setSelect($("#fMetier"),F.metier); $("#fMetier").innerHTML=opt(F.metier,mets,"Tous");
  setSelect($("#fCrit"),F.crit);
  setSelect($("#fMonth"),F.month); $("#fMonth").innerHTML=optYM(F.month);
  setSelect($("#fYear"),F.year); $("#fYear").innerHTML='<option value="">Toutes</option>'+yrs.map(v=>`<option ${v===F.year?"selected":""}>${v}</option>`).join("");
  const sous=uniq("sousMetier"), cls=uniq("client"), scs=uniq("sousCompte");
  const keep=(id,vals)=>{ const el=$(id); const cur=el.value; el.innerHTML=opt(cur,vals,"Tous"); };
  keep("#fSous",sous); keep("#fClient",cls); keep("#fSousCpte",scs);
  // alertes
  setSelect($("#alertCom"),F.com); $("#alertCom").innerHTML=opt($("#alertCom").value||F.com,coms,"Tous");
  const am=$("#alertMetier"); keep("#alertMetier",mets);
  setSelect($("#alertMonth"),F.month); $("#alertMonth").innerHTML=optYM($("#alertMonth").value||F.month);
  setSelect($("#alertYear"),F.year); $("#alertYear").innerHTML='<option value="">Toutes</option>'+yrs.map(v=>{const cur=$("#alertYear").value||F.year;return `<option ${v===cur?"selected":""}>${v}</option>`;}).join("");
  const n=baseFiltered().length;
  $("#gCount").textContent=fmtN(n)+" dossier"+(n>1?"s":"");
  /* mois du dashboard */
  const pm=$("#pilMonth");
  if(pm){ const cur=S.pilMonth; pm.innerHTML='<option value="">Tous les mois</option>'+yms.map(v=>`<option value="${v}" ${v===cur?"selected":""}>${esc(ymLabel(v))}</option>`).join(""); }
  /* filtres du dashboard pilotage (miroirs + dates RTA/période) */
  setSelect($("#pCom"),F.com); $("#pCom").innerHTML=opt(F.com,coms,"Tous");
  setSelect($("#pMetier"),F.metier); $("#pMetier").innerHTML=opt(F.metier,mets,"Tous");
  setSelect($("#pMonth"),F.month); $("#pMonth").innerHTML=optYM(F.month);
  setSelect($("#pYear"),F.year); $("#pYear").innerHTML='<option value="">Toutes</option>'+yrs.map(v=>`<option ${v===F.year?"selected":""}>${v}</option>`).join("");
  setSelect($("#pCrit"),F.crit);
  setSelect($("#pRtaMonth"),F.rtaMonth); $("#pRtaMonth").innerHTML='<option value="">Tous</option>'+rtaYms.map(v=>`<option value="${v}" ${v===F.rtaMonth?"selected":""}>${esc(ymLabel(v))}</option>`).join("");
  setSelect($("#pRtaYear"),F.rtaYear); $("#pRtaYear").innerHTML='<option value="">Toutes</option>'+rtaYrs.map(v=>`<option ${v===F.rtaYear?"selected":""}>${v}</option>`).join("");
  if($("#pFrom")) $("#pFrom").value=F.dFrom;
  if($("#pTo")) $("#pTo").value=F.dTo;
}
/* Filtres globaux : toute vue = baseFiltered() */
function matchGlobal(r, comOv, metOv, monthOv, yearOv, critOv){
  if(!matchTypes(r)) return false;
  const c=comOv!==undefined?comOv:F.com, m=metOv!==undefined?metOv:F.metier;
  const mo=monthOv!==undefined?monthOv:F.month, y=yearOv!==undefined?yearOv:F.year, cr=critOv!==undefined?critOv:F.crit;
  if(c&&r.com!==c) return false;
  if(m&&r.metier!==m) return false;
  if(F.clients.length&&!F.clients.includes(String(r.client||"").trim())) return false;
  if(F.hideArchived&&r.dateArchivage) return false;
  if(mo&&r.etaYM!==mo) return false;
  if(y&&r.etaYear!==y) return false;
  if(cr&&r.crit!==cr) return false;
  if(F.rtaMonth&&r.rtaYM!==F.rtaMonth) return false;
  if(F.rtaYear&&r.rtaYear!==F.rtaYear) return false;
  if(F.dFrom){ const d1=new Date(F.dFrom+"T00:00:00"); if(!r.dateETA||r.dateETA<d1) return false; }
  if(F.dTo){ const d2=new Date(F.dTo+"T00:00:00"); if(!r.dateETA||r.dateETA>d2) return false; }
  return true;
}
function baseFiltered(){ return S.enriched.filter(r=>matchGlobal(r)).map(r=>({...r,alerts:visibleAlerts(r)})); }
/* écriture centralisée d'un filtre global + synchro des miroirs + rerendu */
function setF(key,val){
  F[key]=val||"";
  const map={com:["#gCom","#fCom","#pCom","#alertCom"],metier:["#gMetier","#fMetier","#pMetier","#alertMetier"],crit:["#gCrit","#fCrit","#pCrit"],month:["#gMonth","#fMonth","#pMonth","#alertMonth","#pilMonth"],year:["#gYear","#fYear","#pYear","#alertYear"],rtaMonth:["#pRtaMonth"],rtaYear:["#pRtaYear"]};
  if(key==="month") S.pilMonth=F.month;
  (map[key]||[]).forEach(s=>{
    const el=$(s);
    if(key==="month"&&F.month&&el&&![...el.options].some(o=>o.value===F.month)){
      const option=document.createElement("option"); option.value=F.month; option.textContent=ymLabel(F.month); el.appendChild(option);
    }
    setSelect(el,F[key]);
  });
  S.pageMain=0; S.pageAlert=0;
  renderAll();
}
function clearAllFilters(){
  F.com=F.metier=F.crit=F.month=F.year=F.rtaMonth=F.rtaYear=F.dFrom=F.dTo=""; F.alertTypes=[]; F.clients=[]; S.clientQ=""; F.hideArchived=false; const ha=$("#gHideArchived"); if(ha) ha.checked=false; savePrefs();
  S.pilMonth=""; setSelect($("#pilMonth"),"");
  ["gCom","gMetier","gCrit","gMonth","gYear","fCom","fMetier","fSous","fClient","fSousCpte","fCrit","fDelay","fStep","fEta1","fEta2","fSearch","fMonth","fYear","alertSearch","alertCom","alertMetier","alertMonth","alertYear","pCom","pMetier","pCrit","pMonth","pYear","pRtaMonth","pRtaYear","pFrom","pTo","ovCom","ovClient","ovCat","ovSev","ovSearch","ovMinAge","ovEta1","ovEta2","ovSort"].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=""; });
  S.alertFilter=null; S.sevFilter=""; S.pageMain=0; S.pageAlert=0;
  S.ovCom=""; S.ovClient=""; S.ovQ=""; S.ovCat=""; S.ovSev=""; S.ovMinAge=""; S.ovEta1=""; S.ovEta2=""; S.ovSort="age"; S.ovPage=0;
  $$("#sevChips .chip").forEach((x,i)=>x.classList.toggle("active",i===0));
  renderAll();
}
function filteredMain(){
  const q=norm($("#fSearch").value||""), sm=$("#fSous").value, cl=$("#fClient").value, sc=$("#fSousCpte").value, dl=$("#fDelay").value, st=$("#fStep").value;
  const e1=$("#fEta1").value?new Date($("#fEta1").value+"T00:00:00"):null, e2=$("#fEta2").value?new Date($("#fEta2").value+"T00:00:00"):null;
  return baseFiltered().filter(r=>{
    if(!matchGlobal(r)) return false;
    if(!matchTypes(r)) return false;
    if(sm&&r.sousMetier!==sm) return false;
    if(cl&&r.client!==cl) return false; if(sc&&r.sousCompte!==sc) return false;
    const stageGroups={douane:["douane","factDouane","bae"],livraison:["mise","retour"],cloture:["factInt","validFinal","archivage"]};
    if(st==="priority"&&!["Critique","Haute"].includes(r.crit)) return false;
    if(stageGroups[st]&&!stageGroups[st].includes(r.etapeKey)) return false;
    if(st&&st!=="priority"&&!stageGroups[st]&&r.etapeKey!==st&&!(st==="archive"&&r.dateArchivage)) return false;
    if(e1&&(!r.dateETA||r.dateETA<e1)) return false; if(e2&&(!r.dateETA||r.dateETA>e2)) return false;
    if(dl==="etaLate"&&!(r.delaiETA<0)) return false; if(dl==="etaCrit"&&!(r.delaiETA<CFG.etaCrit)) return false;
    if(dl==="rtaLate"&&!(r.delaiRTA<0)) return false; if(dl==="rtaCrit"&&!(r.delaiRTA<CFG.rtaCrit)) return false;
    if(dl==="stagn"&&!r.stagn.length) return false;
    if(dl==="blocked"&&!r.alerts.some(a=>["A6","A7"].includes(a.c))) return false;
    if(q){ const hay=norm([r.dossier,r.client,r.designation,r.com,r.sousCompte,r.auteur,r.comments,r.metier,r.sousMetier].join(" ")); if(!hay.includes(q)) return false; }
    return true;
  });
}
function filteredAlerts(){
  const q=norm($("#alertSearch").value||""), cLoc=$("#alertCom").value, mLoc=$("#alertMetier").value, moLoc=$("#alertMonth").value, yLoc=$("#alertYear").value;
  const sev=S.sevFilter, type=S.alertFilter;
  let list=[];
  S.enriched.forEach(r=>visibleAlerts(r).forEach(a=>list.push({r,a})));
  return list.filter(({r,a})=>{
    if(type&&a.c!==type) return false;
    if(F.alertTypes.length&&!F.alertTypes.includes(a.c)) return false;
    if(sev&&ALERT_DEFS[a.c].sev!==sev) return false;
    if(!matchGlobal(r, cLoc||F.com, mLoc||F.metier, moLoc||F.month, yLoc||F.year, F.crit)) return false;
    if(q){ const hay=norm([r.dossier,r.client,r.designation,r.com,r.comments,a.d].join(" ")); if(!hay.includes(q)) return false; }
    return true;
  }).sort((x,y)=>{
    const k=S.sortAlert.k;
    if(k==="eta") return (x.r.delaiETA??999)-(y.r.delaiETA??999);
    if(k==="rta") return (x.r.delaiRTA??999)-(y.r.delaiRTA??999);
    if(k==="stagn") return (y.r.stagn.reduce((s,s2)=>s+s2.jours,0))-(x.r.stagn.reduce((s,s2)=>s+s2.jours,0));
    return y.r.score-x.r.score;
  });
}

/* ---------- Rendus ---------- */
function pill(c){ const col=sevColor(c); return `<span class="pill ${c==="Critique"?"crit":c==="Haute"?"haute":c==="Moyenne"?"moy":"ok"}" style="${c==="Critique"||c==="Haute"||c==="Moyenne"?`border-color:${col};color:${col}`:""}">${c}</span>`; }
function delayCell(d,dt){ if(d==null) return "—"; const cls=d<0?"late":d<=3?"":"early"; return `${fmtD(dt)}<br><span class="${cls}">${d>0?"+":""}${d}j</span>`; }
/* Surbrillance mots-clés commentaires */
const KW = ["RFCV","BL","BAE","ETA","RTA","DOUANE","FACTURE","LIVRAISON","MISE","RETOUR","ARCHIVAGE","BLOQU","URGENT","ATTENTE","SURTAXE","SURESTARIE","OK","RECU","REÇU","VALID"];
function hiComment(txt, query){
  let h=esc(txt||"");
  KW.forEach(k=>{ h=h.replace(new RegExp(`(${k})`,"gi"),"<mark>$1</mark>"); });
  if(query&&query.length>1){ try{ h=h.replace(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")})`,"gi"),"<mark>$1</mark>"); }catch{} }
  // dates JJ/MM
  h=h.replace(/(\d{1,2}\/\d{1,2})(?!\/)/g,"<b>$1</b>");
  return h;
}
function commentBubbles(r, query){
  const arr=[r.com1,r.com2,r.com3,r.com4,r.com5];
  if(!arr.some(c=>c&&String(c).trim())) return `<div class="cmt cmt-empty"><div class="cmt-head"><span class="cmt-num">∅</span><b>Aucun commentaire saisi</b></div><p style="color:#64748b">Pensez à renseigner C1–C5 dans SPOT (ex : « atte RFCV », « ok BL client »).</p></div>`;
  return arr.map((c,i)=>{
    const t=String(c||"").trim();
    if(!t) return `<div class="cmt cmt-empty"><div class="cmt-head"><span class="cmt-num">C${i+1}</span><span style="font-size:12px;color:#94a3b8">— vide —</span></div></div>`;
    return `<div class="cmt"><div class="cmt-head"><span class="cmt-num">C${i+1}</span></div><p>${hiComment(t,query)}</p></div>`;
  }).join("");
}
/* Positionnement des dates : chaque date jalons située vs jour J (pilotage) */
const DSHORT={ETA:"ETA",RTA:"RTA",validation:"Valid.",docs:"Docs",note:"Note",douane:"Enreg.",factDouane:"Fact.",bae:"BAE",mise:"Mise",retour:"Retour",factInt:"FactInt",validFinal:"ValidFin",archivage:"Archiv."};
const DLONG={ETA:"ETA (arrivée estimée)",RTA:"RTA (arrivée réelle)",validation:"Validation",docs:"Documents complets",note:"Note de détail",douane:"Enreg. douane",factDouane:"Facture douane",bae:"BAE",mise:"Mise en livraison",retour:"Retour livraison",factInt:"Facture intervention",validFinal:"Validation finale",archivage:"Archivage"};
function datePositionHTML(r){
  const P=todayPilot();
  const pts=[["ETA",r.dateETA],["RTA",r.dateRTA],...STEPS.map(s=>[s.k,r[s.dateKey]])];
  const dated=pts.filter(([k,d])=>!!d);
  if(!dated.length) return `<div class="footer-note">🗓 Aucune date renseignée — positionnement impossible.</div>`;
  const times=dated.map(([k,d])=>d.getTime()).concat([P.getTime()]);
  const mn=Math.min(...times), mx=Math.max(...times), span=(mx-mn)||86400000;
  const pct=t=>Math.min(97,Math.max(3,(t-mn)/span*100));
  const pj=pct(P.getTime());
  const dots=dated.map(([k,d],i)=>{
    const t=d.getTime(), off=diffJ(d,P), p=pct(t);
    const col=t<P.getTime()?"#0f2a52":t>P.getTime()?"#2563eb":sevColor("Critique");
    const offTxt=off===0?"J":off>0?`J+${off}`:`J${off}`;
    return `<div class="dpt" style="left:${p.toFixed(1)}%;top:${30+(i%2)*24}px" title="${esc(DLONG[k])} : ${fmtD(d)} (${offTxt})"><div class="ddot" style="background:${col}"></div><div class="dlab">${DSHORT[k]}</div><div class="doff" style="color:${col}">${offTxt}</div></div>`;
  }).join("");
  const rows=pts.map(([k,d])=>{
    if(!d) return `<tr><td>${esc(DLONG[k])}</td><td style="color:#94a3b8">—</td><td><span class="pill grey">en attente</span></td></tr>`;
    const off=diffJ(d,P);
    const chip=off<0?`<span class="pill haute">J${off} • passée</span>`:off>0?`<span class="pill info">J+${off} • à venir</span>`:`<span class="pill crit">J • aujourd'hui</span>`;
    return `<tr><td>${esc(DLONG[k])}</td><td><b>${fmtD(d)}</b></td><td>${chip}</td></tr>`;
  }).join("");
  const horizon=Math.round(span/86400000);
  return `<div class="daxis" title="Axe temporel : ${fmtD(new Date(mn))} → ${fmtD(new Date(mx))}"><div class="jline" style="left:${pj.toFixed(1)}%"></div><div class="jlab" style="left:${pj.toFixed(1)}%">J • ${fmtD(P)}</div>${dots}</div>
  <div class="legend" style="margin:2px 0 4px"><span><i class="dot" style="background:#0f2a52"></i>passée</span><span><i class="dot" style="background:#2563eb"></i>à venir</span><span><i class="dot" style="background:${sevColor("Critique")}"></i>jour J</span><span>• horizon ${horizon}j (${fmtD(new Date(mn))} → ${fmtD(new Date(mx))})</span></div>
  <table class="dtable">${rows}</table>`;
}
function gaugeSVG(pct,color){
  const r=52, cx=65, cy=62, a0=Math.PI, a1=Math.PI+Math.PI*(Math.max(0,Math.min(100,pct))/100);
  const pt=a=>`${(cx+r*Math.cos(a)).toFixed(1)},${(cy-r*Math.sin(a)).toFixed(1)}`;
  const large=pct>50?1:0;
  const arc=pct<=0?"":`M ${pt(a0)} A ${r} ${r} 0 ${large} 1 ${pt(a1)}`;
  return `<svg class="gauge-svg" viewBox="0 0 130 78"><path d="M ${pt(a0)} A ${r} ${r} 0 0 1 ${pt(Math.PI*2)}" fill="none" stroke="#e6ecf5" stroke-width="12" stroke-linecap="round"/><path d="${arc}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"/><text x="65" y="58" text-anchor="middle" font-size="20" font-weight="800" fill="#0f2a52">${pct}%</text></svg>`;
}
function renderKPIs(){
  const E=baseFiltered(), P=todayPilot();
  const tot=E.length;
  const crit=E.filter(r=>r.crit==="Critique").length, haute=E.filter(r=>r.crit==="Haute").length;
  const arch=E.filter(r=>r.dateArchivage).length;
  const bae=E.filter(r=>r.dateBAE).length;
  const etaLate=E.filter(r=>r.delaiETA!=null&&r.delaiETA<0&&!r.dateBAE).length;
  const avgStag= tot? Math.round(E.reduce((s,r)=>s+r.stagn.reduce((a,b)=>a+b.jours,0),0)/tot):0;
  const kpis=[
    {l:"Dossiers pilotés",v:tot,s:`fichier : ${esc(S.fileName||"aucun — chargez un Excel")}`,c:"#0f2a52"},
    {l:"Critiques",v:crit,s:`${tot?Math.round(crit/tot*100):0}% • haute: ${haute}`,c:"#d92d20"},
    {l:"ETA dépassée sans BAE",v:etaLate,s:"risque surestaries",c:"#e9730c"},
    {l:"Taux BAE",v:(tot?Math.round(bae/tot*100):0)+"%",s:`${bae} dossiers`,c:"#2563eb"},
    {l:"Taux archivé",v:(tot?Math.round(arch/tot*100):0)+"%",s:`${arch} clôturés`,c:"#12805c"},
    {l:"Stagnation moy.",v:avgStag+"j",s:"cumul SLA dépassés",c:"#475569"},
  ];
  $("#kpiGrid").innerHTML=kpis.map(k=>`<div class="kpi" style="--kpi-c:${k.c}"><label>${k.l}</label><strong>${k.v}</strong><span>${k.s}</span></div>`).join("");
  const g=[
    {t:"Complétude Docs",p:tot?Math.round(E.filter(r=>r.dateDocs).length/tot*100):0,c:"#0f2a52",h:"Docs complets renseignés"},
    {t:"Fluidité douane",p:tot?Math.round(E.filter(r=>r.dateFactDouane).length/Math.max(1,E.filter(r=>r.dateEnreg).length)*100):0,c:"#00a9ce",h:"Facturé / Enregistré"},
    {t:"Sortie BAE",p:tot?Math.round(bae/tot*100):0,c:"#12805c",h:"BAE obtenus"},
    {t:"Dossiers sains",p:tot?Math.round(E.filter(r=>r.crit==="OK").length/tot*100):0,c:tot&&E.filter(r=>r.crit==="OK").length/tot<.5?"#d92d20":"#12805c",h:"Sans alerte"},
  ];
  $("#gaugeGrid").innerHTML=g.map(x=>`<div class="gauge-card"><h4>${x.t}</h4>${gaugeSVG(x.p,x.c)}<p>${x.h}</p></div>`).join("");
  $("#navAlertCount").textContent=E.reduce((s,r)=>s+visibleAlerts(r).length,0);
  const gc=$("#gCount"); if(gc) gc.textContent=fmtN(tot)+" dossier"+(tot>1?"s":"")+" (filtres globaux)";
  renderSevGrid();
  renderWorry();
}
/* Indicateurs différenciés par sévérité — cliquables vers Alertes */
function renderSevGrid(){
  const E=baseFiltered();
  const groups=[["Critique","🔴","Dossiers à traiter en priorité"],["Haute","🟠","Action rapide requise"],["Moyenne","🟡","À surveiller"],["OK","🟢","Sains, sans alerte"]];
  $("#sevGrid").innerHTML=groups.map(([sev,ico,h])=>{
    const n=E.filter(r=>r.crit===sev).length;
    const col=sevColor(sev);
    const active=S.sevFilter===sev?" active":"";
    return `<button class="sev-card${active}" data-sev="${sev}" style="--c:${col};--cbg:${col}18"><span class="sev-ico">${ico}</span><span style="flex:1"><small>${sev}</small><b>${fmtN(n)}</b><span>${h}</span></span><span style="font-size:18px;color:${col}">→</span></button>`;
  }).join("");
  $$("#sevGrid .sev-card").forEach(b=>b.onclick=()=>{
    if(b.dataset.sev==="OK"){ setF("crit","OK"); goto("dossiers"); return; }
    S.sevFilter=S.sevFilter===b.dataset.sev?"":b.dataset.sev;
    $$("#sevChips .chip").forEach(x=>x.classList.toggle("active",(x.dataset.sev||"")===S.sevFilter));
    renderSevGrid(); goto("alertes"); renderAlertTable();
  });
}
/* Cas préoccupants — top scores (filtres globaux appliqués), clic = drawer */
function renderWorry(){
  const top=baseFiltered().filter(matchTypes).sort((a,b)=>b.score-a.score).slice(0,8);
  const q=norm($("#fSearch")?.value||"");
  $("#worryTable tbody").innerHTML=top.map(r=>`<tr data-i="${r._i}" style="cursor:pointer" class="${r.crit==="Critique"?"crit":""}" data-tip="${esc(tipHTML(r))}"><td><b style="color:${sevColor(r.crit)}">${r.score}</b> ${pill(r.crit)}</td><td><b>${esc(r.dossier||"—")}</b></td><td>${esc(r.com||"—")}</td><td>${esc((r.client||"").slice(0,26))}</td><td>${delayCell(r.delaiETA,r.dateETA)}</td><td>${r.alerts.map(a=>`<span class="pill ${alertDef(a.c).sev==="Critique"?"crit":alertDef(a.c).sev==="Haute"?"haute":"moy"}" title="${esc(a.d)}">${a.c}</span>`).join(" ")}</td><td style="white-space:normal;min-width:220px;font-size:12px">${hiComment((r.comments||"").slice(0,160),q)||"<span style='color:#94a3b8'>—</span>"}</td></tr>`).join("")||'<tr><td colspan="7" style="text-align:center;color:#64748b">—</td></tr>';
  $$("#worryTable tbody tr[data-i]").forEach(tr=>tr.onclick=()=>openDrawer(+tr.dataset.i));
}
/* ---------- Dashboard Pilotage du mois (simple, 100% cliquable) ---------- */
function pilotYM(){ const P=todayPilot(); return `${P.getFullYear()}-${String(P.getMonth()+1).padStart(2,"0")}`; }
function ymShift(ym,d){ if(!ym) return pilotYM(); let [y,m]=ym.split("-").map(Number); m+=d; while(m<1){m+=12;y--;} while(m>12){m-=12;y++;} return `${y}-${String(m).padStart(2,"0")}`; }
function pilRows(){ return baseFiltered().filter(r=>!S.pilMonth||r.etaYM===S.pilMonth); }
/* propage le mois du dashboard vers les filtres globaux avant de naviguer */
function withPilMonth(){ if(S.pilMonth) setF("month",S.pilMonth); }
function renderPilotage(){
  const E=pilRows();
  const tot=E.length;
  const crit=E.filter(r=>r.crit==="Critique").length, haute=E.filter(r=>r.crit==="Haute").length;
  const bae=E.filter(r=>r.dateBAE).length, arch=E.filter(r=>r.dateArchivage).length;
  const etaLate=E.filter(r=>r.delaiETA!=null&&r.delaiETA<0&&!r.dateBAE).length;
  $("#pilTitle").textContent=S.pilMonth?ymLabel(S.pilMonth):"tous les mois";
  const kpis=[
    {l:"Dossiers du mois",v:tot,s:S.fileName?esc(S.fileName):"aucun fichier",c:"#0f2a52",go:()=>{withPilMonth();goto("dossiers");}},
    {l:"Critiques",v:crit,s:`${tot?Math.round(crit/tot*100):0}% du mois`,c:sevColor("Critique"),go:()=>{withPilMonth();setF("crit","Critique");goto("dossiers");}},
    {l:"Hautes",v:haute,s:`${tot?Math.round(haute/tot*100):0}% du mois`,c:sevColor("Haute"),go:()=>{withPilMonth();setF("crit","Haute");goto("dossiers");}},
    {l:"ETA dépassée ss BAE",v:etaLate,s:"risque surestaries",c:"#e9730c",go:()=>{withPilMonth();setF("crit","");$("#fDelay").value="etaLate";S.pageMain=0;renderMain();goto("dossiers");}},
    {l:"Taux BAE",v:(tot?Math.round(bae/tot*100):0)+"%",s:`${bae} dossiers`,c:"#2563eb"},
    {l:"Taux archivé",v:(tot?Math.round(arch/tot*100):0)+"%",s:`${arch} clôturés`,c:"#12805c"},
  ];
  $("#pilKpis").innerHTML=kpis.map((k,i)=>`<button class="kpi" data-k="${i}" style="--kpi-c:${k.c};${k.go?"cursor:pointer":""};text-align:left;font-family:inherit" ${k.go?"":"disabled"}><label>${k.l}</label><strong>${k.v}</strong><span>${k.s}</span></button>`).join("");
  $$("#pilKpis .kpi[data-k]").forEach(b=>{ const k=kpis[+b.dataset.k]; if(k.go) b.onclick=k.go; });
  /* sévérités cliquables */
  const groups=[["Critique","🔴"],["Haute","🟠"],["Moyenne","🟡"],["OK","🟢"]];
  $("#pilSev").innerHTML=groups.map(([sev,ico])=>{
    const n=E.filter(r=>r.crit===sev).length, col=sevColor(sev);
    return `<button class="sev-card" data-sev="${sev}" style="--c:${col};--cbg:${col}18"><span class="sev-ico">${ico}</span><span style="flex:1"><small>${sev}</small><b>${fmtN(n)}</b></span><span style="font-size:18px;color:${col}">→</span></button>`;
  }).join("");
  $$("#pilSev .sev-card").forEach(b=>b.onclick=()=>{
    withPilMonth();
    if(b.dataset.sev==="OK"){ setF("crit","OK"); goto("dossiers"); return; }
    S.sevFilter=b.dataset.sev;
    $$("#sevChips .chip").forEach(x=>x.classList.toggle("active",(x.dataset.sev||"")===S.sevFilter));
    goto("alertes"); renderAlertTypes(); renderAlertTable();
  });
  /* COM du mois */
  const by={}; E.forEach(r=>{ const k=r.com||"(vide)"; (by[k]=by[k]||{n:0,sc:0,crit:0}); by[k].n++; by[k].sc+=r.score; by[k].crit+=(r.crit==="Critique"||r.crit==="Haute")?1:0; });
  const arr=Object.entries(by).map(([k,v])=>({k,...v,avg:v.sc/v.n,rate:v.crit/v.n})).sort((a,b)=>b.avg-a.avg);
  const max=Math.max(1,...arr.map(a=>a.avg));
  $("#pilCom").innerHTML=arr.length?arr.map(a=>`<div class="bar-row"><span><b style="cursor:pointer;color:#0f2a52" data-com="${esc(a.k)}">${esc(a.k)}</b><br><span style="color:#64748b">${a.n} dos. • ${Math.round(a.rate*100)}% alertés</span></span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(a.avg/max*100)}%;background:${a.avg>=CFG.thCrit?sevColor("Critique"):a.avg>=CFG.thHaute?sevColor("Haute"):"#2563eb"}"></div></div><b>${a.avg.toFixed(0)}</b></div>`).join(""):(S.enriched.length?'<p style="color:#64748b">Aucun dossier ce mois-ci.</p>':'<div class="empty-state"><b>En attente de données</b>Chargez votre export Excel.</div>');
  $$("#pilCom [data-com]").forEach(el=>el.onclick=()=>{ withPilMonth(); setF("com",el.dataset.com); goto("dossiers"); });
  /* étapes du mois */
  const labels={validation:"À ouvrir / Valid.",docs:"Docs complets",note:"Note détail",douane:"Enreg. douane",factDouane:"Fact. douane",bae:"BAE",mise:"Mise livr.",retour:"Retour livr.",factInt:"Fact. interv.",validFinal:"Valid. finale",archivage:"Archivé"};
  const order=["validation","docs","note","douane","factDouane","bae","mise","retour","factInt","validFinal","archivage"];
  const cnt={}; order.forEach(k=>cnt[k]=0);
  E.forEach(r=>{ const k=r.lastIdx<0?"validation":r.dateArchivage?"archivage":STEPS[Math.min(r.lastIdx+1,10)].k; cnt[k]=(cnt[k]||0)+1; });
  const mx=Math.max(1,...order.map(k=>cnt[k]));
  $("#pilSteps").innerHTML=order.map(k=>`<div class="bar-row"><span>${labels[k]}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(cnt[k]/mx*100)}%;background:${["bae","mise","retour"].includes(k)?sevColor("Critique"):k==="archivage"?sevColor("OK"):"#0f2a52"}"></div></div><b>${cnt[k]}</b></div>`).join("");
  /* priorité du mois */
  const top=[...E].sort((a,b)=>b.score-a.score).slice(0,10);
  $("#pilTable tbody").innerHTML=top.map(r=>`<tr data-i="${r._i}" style="cursor:pointer" class="${r.crit==="Critique"?"crit":""}" data-tip="${esc(tipHTML(r))}"><td><b style="color:${sevColor(r.crit)}">${r.score}</b> ${pill(r.crit)}</td><td><b>${esc(r.dossier||"—")}</b></td><td>${esc(r.com||"—")}</td><td>${esc((r.client||"").slice(0,26))}</td><td>${delayCell(r.delaiETA,r.dateETA)}</td><td>${r.alerts.map(a=>`<span class="pill ${alertDef(a.c).sev==="Critique"?"crit":alertDef(a.c).sev==="Haute"?"haute":"moy"}" title="${esc(a.d)}">${a.c}</span>`).join(" ")}</td></tr>`).join("")||(S.enriched.length?'<tr><td colspan="6"><div class="empty-state"><b>Rien à signaler ce mois-ci ✔</b></div></td></tr>':'<tr><td colspan="6"><div class="empty-state"><b>En attente de données</b>Chargez votre export Excel.</div></td></tr>');
  $$("#pilTable tbody tr[data-i]").forEach(tr=>tr.onclick=()=>openDrawer(+tr.dataset.i));
}
function renderComBars(){
  const by={}; baseFiltered().forEach(r=>{ const k=r.com||"(vide)"; (by[k]=by[k]||{n:0,sc:0,crit:0}); by[k].n++; by[k].sc+=r.score; by[k].crit+= (r.crit==="Critique"||r.crit==="Haute")?1:0; });
  const arr=Object.entries(by).map(([k,v])=>({k,...v,avg:v.sc/v.n, rate:v.crit/v.n})).sort((a,b)=>b.avg-a.avg);
  const max=Math.max(1,...arr.map(a=>a.avg));
  $("#comBars").innerHTML=arr.length?arr.map(a=>`<div class="bar-row"><span><b style="cursor:pointer;color:#0f2a52" data-com="${esc(a.k)}">${esc(a.k)}</b><br><span style="color:#64748b">${a.n} dos. • ${Math.round(a.rate*100)}% alertés</span></span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(a.avg/max*100)}%;background:${a.avg>=CFG.thCrit?sevColor("Critique"):a.avg>=CFG.thHaute?sevColor("Haute"):"#2563eb"}"></div></div><b>${a.avg.toFixed(0)}</b></div>`).join(""):(S.enriched.length?'<p style="color:#64748b">Aucun COM sur ce périmètre filtré.</p>':'<div class="empty-state"><b>En attente de données</b>Chargez votre export Excel pour voir les COM en difficulté.</div>');
  $$("#comBars [data-com]").forEach(el=>el.onclick=()=>{ setF("com",el.dataset.com); goto("dossiers"); });
}
function renderSteps(){
  const keys=["validation","docs","note","douane","factDouane","bae","mise","retour","factInt","validFinal","archivage"];
  const labels={validation:"À ouvrir / Valid.",docs:"Docs complets",note:"Note détail",douane:"Enreg. douane",factDouane:"Fact. douane",bae:"BAE",mise:"Mise livr.",retour:"Retour livr.",factInt:"Fact. interv.",validFinal:"Valid. finale",archivage:"Archivé"};
  const cnt={}; keys.forEach(k=>cnt[k]=0);
  baseFiltered().forEach(r=>{ cnt[r.lastIdx<0?"validation": r.dateArchivage?"archivage": STEPS[Math.min(r.lastIdx+1,10)].k ]=(cnt[r.lastIdx<0?"validation": r.dateArchivage?"archivage": STEPS[Math.min(r.lastIdx+1,10)].k]||0)+1; });
  const order=["validation","docs","note","douane","factDouane","bae","mise","retour","factInt","validFinal","archivage"];
  const max=Math.max(1,...order.map(k=>cnt[k]));
  $("#stepBars").innerHTML=order.map(k=>`<div class="bar-row"><span>${labels[k]}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(cnt[k]/max*100)}%;background:${["bae","mise","retour"].includes(k)?"#d92d20":k==="archivage"?"#12805c":"#0f2a52"}"></div></div><b>${cnt[k]}</b></div>`).join("");
}
function renderDelays(){
  const E=baseFiltered();
  const buckets=[["≤ -15j",r=>r.delaiETA!=null&&r.delaiETA<=-15],["-14 à -8j",r=>r.delaiETA!=null&&r.delaiETA>=-14&&r.delaiETA<=-8],["-7 à -1j",r=>r.delaiETA!=null&&r.delaiETA>=-7&&r.delaiETA<0],["0 à +3j",r=>r.delaiETA!=null&&r.delaiETA>=0&&r.delaiETA<=3],["> +3j",r=>r.delaiETA!=null&&r.delaiETA>3],["Sans ETA",r=>r.delaiETA==null]];
  const max=Math.max(1,...buckets.map(([,f])=>E.filter(f).length));
  $("#delayDist").innerHTML=buckets.map(([l,f])=>{const n=E.filter(f).length;return `<div class="bar-row"><span>Délai ETA ${l}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(n/max*100)}%;background:${l.startsWith("≤")||l.startsWith("-")?"#d92d20":l.startsWith("0")?"#e9730c":"#12805c"}"></div></div><b>${n}</b></div>`;}).join("")+`<div class="footer-note">ETA − jour de pilotage : une valeur négative indique une prévision échue. Seule la RTA confirme l’arrivée réelle.</div>`;
}
function renderTopAlerts(){
  const list=filteredAlerts().slice(0,6);
  $("#topAlerts").innerHTML=list.length?list.map(({r,a})=>{const d=ALERT_DEFS[a.c];return `<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid #eef2f7"><span style="width:10px;height:10px;border-radius:50%;background:${d.c};margin-top:5px;flex:none"></span><div style="flex:1"><b>${a.c} — ${esc(d.t)}</b><br><span style="font-size:12px;color:#475569">${esc(r.dossier||"—")} • ${esc(r.com||"—")} • ${esc(a.d)}</span></div><button class="btn small" data-open="${r._i}">Ouvrir</button></div>`;}).join(""):(S.enriched.length?'<p style="color:#64748b">Aucune alerte sur ce périmètre. ✔</p>':'<div class="empty-state"><b>En attente de données</b>Chargez votre export Excel pour voir les alertes du jour.</div>');
  $$("#topAlerts [data-open]").forEach(b=>b.onclick=()=>openDrawer(+b.dataset.open));
}
function renderAlertTypes(){
  const counts={}; Object.keys(CFG.alerts).forEach(k=>counts[k]=0);
  baseFiltered().forEach(r=>visibleAlerts(r).forEach(a=>counts[a.c]++));
  $("#alertTypes").innerHTML=Object.entries(CFG.alerts).filter(([k,d])=>d.on!==false&&!d.deleted&&(!F.alertTypes.length||F.alertTypes.includes(k))).map(([k,d])=>`<button class="alert-type ${S.alertFilter===k?"active":""}" data-t="${k}" style="--c:${d.c}" title="${esc(d.h)}"><small>${esc(d.ico||"•")} ${k} · ${d.sev}</small><b>${fmtN(counts[k])}</b><span>${esc(d.t)}</span></button>`).join("")||'<div class="empty-state"><b>Aucune alerte visible</b>Activez une règle dans Administration.</div>';
  $$("#alertTypes .alert-type").forEach(el=>el.onclick=()=>{ S.alertFilter=S.alertFilter===el.dataset.t?null:el.dataset.t; S.pageAlert=0; renderAlertTypes(); renderAlertTable(); });
}
function renderOverdue(){
  const pilotEl=$("#ovPilot"); if(pilotEl) pilotEl.textContent=fmtD(todayPilot());
  const cardsEl=$("#ovCards"); if(!cardsEl) return;
  const counts=overdueCounts();
  const total=Object.values(counts).reduce((s,n)=>s+n,0);
  const nav=$("#navOverdueCount"); if(nav) nav.textContent=total;
  const refDate=ovRefDate(), refLabel=ovRefLabel(), refCounts=overdueCountsAt(refDate);
  const visRules=Object.keys(OVERDUE_DEFS).filter(c=>c!=="L10"&&ovActive(c));
  const daysTxt=k=>(OVERDUE.days[k]!=null?` • &gt;${OVERDUE.days[k]}j`:" • sans seuil");
  cardsEl.innerHTML=visRules.map(k=>{ const d=OVERDUE_DEFS[k];
    const n=counts[k]||0, rvc=refCounts[k]??0, ec=n-rvc;
    const active=S.ovCat===k?" active":"";
    const ecTxt=ec===0?"= réf.":(ec>0?`+${ec}`:`${ec}`);
    return `<button class="alert-type${active}" data-ov="${k}" style="--c:${ovColor(k)}" title="${esc(d.h)}${OVERDUE.days[k]!=null?` — Seuil > ${OVERDUE.days[k]}j`:""}"><small>${d.ico} ${k} · ${ovSev(k)}</small><b>${fmtN(n)}</b><span>${esc(d.t)}</span><small style="color:${ec===0?"#12805c":"#b45309"}">${esc(refLabel)} : ${rvc} (${ecTxt})${daysTxt(k)}</small></button>`;
  }).join("")||'<div class="empty-state"><b>Aucune règle Overdue active</b>Réactivez des règles dans Administration → Overdue.</div>';
  // date de référence manuelle (recalculée par le système)
  const ovRefDateEl=$("#ovRefDate");
  if(ovRefDateEl&&document.activeElement!==ovRefDateEl) ovRefDateEl.value=S.ovRefDate||"";
  $$("#ovCards [data-ov]").forEach(el=>el.onclick=()=>{ S.ovCat=S.ovCat===el.dataset.ov?"":el.dataset.ov; const sel=$("#ovCat"); if(sel) sel.value=S.ovCat; S.ovPage=0; renderOverdue(); });
  // sélecteurs : choix reconstruits à chaque rendu pour rester cohérents avec le fichier chargé
  const inPerim=S.enriched.filter(overdueInPerim);
  const coms=[...new Set(inPerim.map(r=>r.com||"(vide)"))].sort((a,b)=>a.localeCompare(b,"fr"));
  const clients=[...new Set(inPerim.map(r=>String(r.client||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"fr"));
  const ovCom=$("#ovCom");
  if(ovCom){ const cur=S.ovCom; ovCom.innerHTML='<option value="">Tous</option>'+coms.map(c=>`<option value="${esc(c)}" ${c===cur?"selected":""}>${esc(c)}</option>`).join(""); }
  const ovClient=$("#ovClient");
  if(ovClient){ const cur=S.ovClient; ovClient.innerHTML='<option value="">Tous</option>'+clients.slice(0,500).map(c=>`<option value="${esc(c)}" ${c===cur?"selected":""}>${esc(c)}</option>`).join("")+(clients.length>500?`<option value="" disabled>+${clients.length-500} autres — affinez la recherche</option>`:""); }
  const ovCat=$("#ovCat");
  if(ovCat){ ovCat.innerHTML='<option value="">Toutes</option>'+visRules.map(k=>`<option value="${k}">${k} — ${esc(OVERDUE_DEFS[k].t)}</option>`).join(""); }
  if(ovCat) ovCat.value=(S.ovCat&&visRules.includes(S.ovCat))?S.ovCat:""; if(S.ovCat&&!visRules.includes(S.ovCat)) S.ovCat="";
  const ovSev=$("#ovSev"); if(ovSev) ovSev.value=S.ovSev||"";
  const ovMinAge=$("#ovMinAge"); if(ovMinAge&&document.activeElement!==ovMinAge) ovMinAge.value=S.ovMinAge||"";
  const ovEta1=$("#ovEta1"); if(ovEta1&&!S.ovEta1) ovEta1.value=""; if(ovEta1&&S.ovEta1) ovEta1.value=S.ovEta1;
  const ovEta2=$("#ovEta2"); if(ovEta2&&!S.ovEta2) ovEta2.value=""; if(ovEta2&&S.ovEta2) ovEta2.value=S.ovEta2;
  // suivi : mesure du jour vs référence recalculée par le système
  const refTh=$("#ovRefTh"); if(refTh) refTh.textContent=refLabel+(refDate?"":" (choisir une date)");
  const tb=$("#ovFollow tbody");
  if(tb){
    tb.innerHTML=visRules.map(k=>{ const d=OVERDUE_DEFS[k];
      const b=refCounts[k]??0, s=counts[k]||0, ec=s-b;
      let evo;
      if(!refDate) evo='<span style="color:#94a3b8">—</span>';
      else if(b>0){ const p=Math.round((s-b)/b*100); evo=p>0?`🔺 +${p}%`:p<0?`🔽 ${p}%`:"➖ stable"; }
      else evo=s>0?"🆕 nouveau":"➖";
      return `<tr><td><b>${k}</b> ${esc(d.t)}</td><td><b>${fmtN(b)}</b></td><td><b style="color:${ovColor(k)}">${fmtN(s)}</b></td><td style="color:${ec===0?"#12805c":"#b45309"}"><b>${ec===0?"= OK":(ec>0?`+${ec}`:ec)}</b></td><td>${evo}</td></tr>`;
    }).join("");
  }
  // par COM (respecte les filtres globaux pour rester cohérent avec les autres vues)
  const perCom={};
  overdueGlobalList().forEach(({r,o})=>{ const k=r.com||"(vide)"; (perCom[k]=perCom[k]||{n:0}); perCom[k].n++; perCom[k][o.c]=(perCom[k][o.c]||0)+1; });
  const ovHead=$("#ovComTable thead tr");
  if(ovHead) ovHead.innerHTML=`<th>COM</th><th>Dos.</th>${visRules.map(k=>`<th>${k}</th>`).join("")}`;
  const ct=$("#ovComTable tbody");
  if(ct){
    const arr=Object.entries(perCom).sort((a,b)=>b[1].n-a[1].n);
    const ncol=visRules.length+2;
    ct.innerHTML=arr.map(([k,v])=>`<tr><td><b style="cursor:pointer;color:#0f2a52" data-ovcom="${esc(k)}">${esc(k)}</b></td><td><b>${fmtN(v.n)}</b></td>${visRules.map(c=>`<td>${v[c]||""}</td>`).join("")}</tr>`).join("")||`<tr><td colspan="${ncol}" style="text-align:center;color:#64748b">Chargez l'Excel pour voir les COM Hinterland.</td></tr>`;
    $$("#ovComTable [data-ovcom]").forEach(el=>el.onclick=()=>{ S.ovCom=el.dataset.ovcom; const s=$("#ovCom"); if(s) s.value=S.ovCom; S.ovPage=0; renderOverdue(); goto("overdue"); });
  }
  // calibration vs référence recalculée par le système (+ ligne Débours non calculée)
  const calRefTh=$("#ovCalibRefTh"); if(calRefTh) calRefTh.textContent=refLabel;
  const cal=$("#ovCalib tbody");
  if(cal){
    const rows=visRules.map(k=>{ const d=OVERDUE_DEFS[k];
      const s=counts[k]||0, rvc=refCounts[k]??0, ec=s-rvc;
      const seuil=OVERDUE.days[k]!=null?`<b>&gt; ${OVERDUE.days[k]}j</b>`:'<span style="color:#94a3b8">sans seuil</span>';
      return `<tr><td><b>${k}</b></td><td>${esc(d.t)}<br><small style="color:#64748b">${esc(d.h)}</small></td><td>${seuil}</td><td><b>${fmtN(s)}</b></td><td>${fmtN(rvc)}</td><td style="color:${ec===0?"#12805c":Math.abs(ec)<=3?"#b45309":"#d92d20"}"><b>${ec===0?"✓ OK":(ec>0?`+${ec}`:ec)}</b></td></tr>`;
    });
    if(!OVERDUE.rules?.L10?.deleted) rows.push(`<tr><td><b>L10</b></td><td>${esc(OVERDUE_DEFS.L10.t)}<br><small style="color:#64748b">${esc(OVERDUE_DEFS.L10.h)}</small></td><td><span style="color:#94a3b8">champ requis</span></td><td>—</td><td>—</td><td><span style="color:#94a3b8">non calculé</span></td></tr>`);
    cal.innerHTML=rows.join("");
  }
  // table dossiers
  const list=overdueFiltered();
  $("#ovCount").textContent=fmtN(list.length)+" dossier(s)";
  const pages=Math.max(1,Math.ceil(list.length/S.perPage)); S.ovPage=Math.min(S.ovPage,pages-1);
  const slice=list.slice(S.ovPage*S.perPage,(S.ovPage+1)*S.perPage);
  $("#ovPagerInfo").textContent=`${fmtN(list.length)} dossier(s) • Page ${S.ovPage+1}/${pages}`;
  const q=norm(S.ovQ||"");
  $("#ovTable tbody").innerHTML=slice.map(({r,o})=>{const d=OVERDUE_DEFS[o.c];return `<tr data-i="${r._i}" style="cursor:pointer" data-tip="${esc(tipHTML(r))}"><td><span class="pill" style="border-color:${ovColor(o.c)};color:${ovColor(o.c)}"><b>${o.c}</b></span><br><small>${d.ico} ${esc(d.t.slice(0,18))}</small></td><td><b>${esc(r.dossier||"—")}</b></td><td>${esc(r.com||"—")}</td><td>${esc((r.client||"").slice(0,24))}</td><td>${esc(o.miss)}<br><small style="color:#64748b">réf ${fmtD(o.ref)}</small></td><td><b class="late">${o.age}j</b></td><td>${delayCell(r.delaiETA,r.dateETA)}</td><td style="white-space:normal;min-width:200px;font-size:11.5px">${hiComment((r.comments||"").slice(0,140),q)||"<span style='color:#94a3b8'>—</span>"}</td></tr>`;}).join("")||(S.enriched.length?'<tr><td colspan="8"><div class="empty-state"><b>Aucun Overdue sur ce périmètre</b>Ajustez les seuils ou le COM.</div></td></tr>':'<tr><td colspan="8"><div class="empty-state"><b>Aucune donnée chargée</b>Chargez votre export Excel « Dossiers par COM ».</div></td></tr>');
  $$("#ovTable tbody tr[data-i]").forEach(tr=>tr.onclick=()=>openDrawer(+tr.dataset.i));
}
function sortRows(rows){
  const {k,dir}=S.sortMain;
  const val=r=> k==="crit"?r.score: k==="dossier"?String(r.dossier||""): k==="com"?String(r.com||""): k==="client"?String(r.client||""): k==="eta"?(r.delaiETA??9999): k==="rta"?(r.delaiRTA??9999): k==="etape"?r.etape: r.score;
  return [...rows].sort((a,b)=>{ const x=val(a),y=val(b); return (x>y?1:x<y?-1:0)*dir; });
}
function renderMain(){
  const rows=sortRows(filteredMain());
  const pages=Math.max(1,Math.ceil(rows.length/S.perPage)); S.pageMain=Math.min(S.pageMain,pages-1);
  const slice=rows.slice(S.pageMain*S.perPage,(S.pageMain+1)*S.perPage);
  $("#dossierCount").textContent=fmtN(rows.length)+" dossier(s)";
  $("#mainPagerInfo").textContent=`Page ${S.pageMain+1}/${pages}`;
  $("#mainTable tbody").innerHTML=slice.map(r=>`<tr class="${r.crit==="Critique"?"crit":""}" data-i="${r._i}" style="cursor:pointer" data-tip="${esc(tipHTML(r))}"><td>${pill(r.crit)}<br><small style="color:#64748b">${r.score}</small></td><td><b>${esc(r.dossier||"—")}</b>${S.prefs.commentBadge&&r.comments?' <span class="cmt-dot" title="Commentaires disponibles — survolez pour les lire">💬</span>':""}<button class="star ${S.pins[r._i]?"on":""}" data-star="${r._i}" title="Épingler / désépingler">★</button><br><small style="color:#64748b">${esc(r.designation||"")}</small></td><td>${esc(r.com||"—")}<br><small style="color:#64748b">${esc(r.auteur||"")}</small></td><td>${esc((r.client||"").slice(0,26))}<br><small style="color:#64748b">${esc(r.sousCompte||"")}</small></td><td>${delayCell(r.delaiETA,r.dateETA)}</td><td>${delayCell(r.delaiRTA,r.dateRTA)}</td><td><span class="pill ${r.dateArchivage?"ok":"grey"}">${esc(r.etape)}</span></td><td style="font-size:11.5px;color:#334155">V:${fmtD(r.dateValidation)}<br>D:${fmtD(r.dateDocs)} • N:${fmtD(r.dateNote)}<br>E:${fmtD(r.dateEnreg)} • B:${fmtD(r.dateBAE)}</td><td>${r.alerts.slice(0,3).map(a=>`<span class="pill ${ALERT_DEFS[a.c].sev==="Critique"?"crit":ALERT_DEFS[a.c].sev==="Haute"?"haute":"moy"}" title="${esc(a.d)}">${a.c}</span>`).join(" ")}${r.alerts.length>3?` <small>+${r.alerts.length-3}</small>`:""}</td></tr>`).join("")||(S.enriched.length?'<tr><td colspan="9"><div class="empty-state"><b>Aucun dossier avec ces filtres</b>Élargissez les critères ou réinitialisez les filtres globaux.</div></td></tr>':'<tr><td colspan="9"><div class="empty-state"><b>Aucune donnée chargée</b>Chargez votre export Excel « Dossiers par COM » via 📤 Charger Excel ou glisser-déposer.</div></td></tr>');
  $$("#mainTable tbody tr[data-i]").forEach(tr=>tr.onclick=()=>openDrawer(+tr.dataset.i));
}
function renderAlertTable(){
  const list=filteredAlerts();
  const pages=Math.max(1,Math.ceil(list.length/S.perPage)); S.pageAlert=Math.min(S.pageAlert,pages-1);
  const slice=list.slice(S.pageAlert*S.perPage,(S.pageAlert+1)*S.perPage);
  $("#alertPagerInfo").textContent=`${fmtN(list.length)} alerte(s) • Page ${S.pageAlert+1}/${pages}`;
  $("#alertTable tbody").innerHTML=slice.map(({r,a})=>{const d=ALERT_DEFS[a.c];return `<tr data-i="${r._i}" style="cursor:pointer" data-tip="${esc(tipHTML(r))}"><td>${pill(d.sev)}<br><small>${a.c} • ${r.score}</small></td><td><b>${esc(r.dossier||"—")}</b></td><td>${esc(r.com||"—")}</td><td>${esc((r.client||"").slice(0,24))}</td><td><b style="color:${d.c}">${a.c} — ${esc(d.t)}</b></td><td style="white-space:normal;min-width:220px">${esc(a.d)}</td><td>${delayCell(r.delaiETA,r.dateETA)}</td><td style="white-space:normal;min-width:200px;font-size:11.5px">${esc((r.comments||"").slice(0,140))}</td><td><button class="btn small" data-i="${r._i}">→</button></td></tr>`;}).join("")||(S.enriched.length?'<tr><td colspan="9"><div class="empty-state"><b>Aucune alerte avec ces filtres</b>Élargissez les critères ou réinitialisez les filtres globaux.</div></td></tr>':'<tr><td colspan="9"><div class="empty-state"><b>Aucune donnée chargée</b>Chargez votre export Excel « Dossiers par COM » pour voir les alertes.</div></td></tr>');
  $$("#alertTable tbody tr").forEach(tr=>tr.onclick=()=>openDrawer(+tr.dataset.i));
}
function perfStats(rows){
  const by={};
  rows.forEach(r=>{const k=r.com||"(vide)";(by[k]=by[k]||{n:0,sc:0,crit:0,eta:[],bae:0,arch:0});const o=by[k];o.n++;o.sc+=r.score;o.crit+=(r.crit==="Critique"||r.crit==="Haute")?1:0;if(r.delaiETA!=null)o.eta.push(r.delaiETA);if(r.dateBAE)o.bae++;if(r.dateArchivage)o.arch++;});
  return Object.entries(by).map(([k,v])=>({...v,k,avg:v.sc/v.n,rate:v.crit/v.n,med:durationStats(v.eta)?.median??null,tBae:v.bae/v.n,tArch:v.arch/v.n})).sort((a,b)=>b.avg-a.avg);
}
function verdictPill(avg){
  return avg>=CFG.thCrit?'<span class="pill crit">🔴 En difficulté</span>':avg>=CFG.thHaute?'<span class="pill haute">🟠 À surveiller</span>':'<span class="pill ok">🟢 Fluide</span>';
}
function renderPerfs(){
  const arr=perfStats(baseFiltered());
  const dif=arr.filter(a=>a.avg>=CFG.thHaute).length;
  if(!S.selCom||!arr.some(a=>a.k===S.selCom)) S.selCom=arr[0]?.k||"";
  $("#perfKpis").innerHTML=[{l:"COM suivis",v:arr.length,s:"commerciaux actifs"},{l:"COM en difficulté",v:dif,s:`score ≥ ${CFG.thHaute}`},{l:"Plus critique",v:arr[0]?.k||"—",s:arr[0]?`score ${arr[0].avg.toFixed(0)}`:""},{l:"Plus fluide",v:arr.length?arr[arr.length-1].k:"—",s:arr.length?`score ${arr[arr.length-1].avg.toFixed(0)}`:""}].map(k=>`<div class="kpi"><label>${k.l}</label><strong style="font-size:18px">${esc(String(k.v))}</strong><span>${esc(k.s)}</span></div>`).join("");
  $("#perfTable tbody").innerHTML=arr.map(a=>`<tr data-com="${esc(a.k)}" class="${a.k===S.selCom?"sel":""}"><td><b style="cursor:pointer;color:#0f2a52" data-act="see">${esc(a.k)}</b></td><td>${a.n}</td><td>${Math.round(a.rate*100)}%</td><td><div class="progress"><i style="width:${Math.min(100,a.avg)}%;background:${a.avg>=CFG.thCrit?sevColor("Critique"):a.avg>=CFG.thHaute?sevColor("Haute"):"#12805c"}"></i></div><small>${a.avg.toFixed(1)}</small></td><td class="${a.med<0?"late":"early"}">${a.med==null?"—":a.med+"j"}</td><td>${Math.round(a.tBae*100)}%</td><td>${Math.round(a.tArch*100)}%</td><td>${verdictPill(a.avg)}</td><td style="white-space:nowrap"><button class="btn small" data-act="see" title="Voir les dossiers">👁</button> <button class="btn small" data-act="csv" title="Exporter CSV du COM">⬇</button> <button class="btn small" data-act="mail" title="Envoyer la situation par e-mail">✉️</button></td></tr>`).join("")||'<tr><td colspan="9"><div class="empty-state"><b>Aucune donnée</b>Chargez votre export Excel pour voir le classement des COM.</div></td></tr>';
  $$("#perfTable tbody tr[data-com]").forEach(tr=>{
    const com=tr.dataset.com;
    tr.querySelector('[data-act="see"]').onclick=e=>{ e.stopPropagation(); setF("com",com); goto("dossiers"); };
    tr.querySelector('[data-act="csv"]').onclick=e=>{ e.stopPropagation(); download(`spot_situation_${com}.csv`,toCSVParts(baseFiltered().filter(r=>r.com===com)),"text/csv"); toast(`⬇ Situation <b>${esc(com)}</b> exportée en intégralité (CSV)`); };
    tr.querySelector('[data-act="mail"]').onclick=e=>{ e.stopPropagation(); openMailModal(com); };
    tr.onclick=e=>{ if(e.target.closest("button")) return; S.selCom=com; renderPerfs(); };
  });
  renderComDetail();
  renderComTiles(arr);
}
/* Détail d'un COM : KPIs, criticité, alertes, mois, top dossiers */
function renderComDetail(){
  const com=S.selCom;
  $("#comDetailName").textContent=com||"—";
  const body=$("#comDetailKpis"), sev=$("#comDetailSev"), al=$("#comDetailAlerts"), mo=$("#comDetailMonths"), st=$("#comDetailStages"), tb=$("#comDetailTable tbody");
  if(!com){ $("#comStatusBoard").innerHTML=""; body.innerHTML=""; sev.innerHTML="<p style='color:#64748b'>—</p>"; al.innerHTML=""; mo.innerHTML=""; st.innerHTML=""; tb.innerHTML='<tr><td colspan="7"><div class="empty-state"><b>Sélectionnez un COM</b>Cliquez une ligne du classement.</div></td></tr>'; return; }
  const rows=baseFiltered().filter(r=>r.com===com);
  renderComStatus(rows);
  const n=rows.length||1;
  const crit=rows.filter(r=>r.crit==="Critique").length, haute=rows.filter(r=>r.crit==="Haute").length, moy=rows.filter(r=>r.crit==="Moyenne").length, ok=rows.filter(r=>r.crit==="OK").length;
  const etaMed=durationStats(rows.map(r=>r.delaiETA).filter(v=>v!=null))?.median??null;
  const kpis=[
    {l:"Dossiers",v:rows.length,s:`100% du périmètre filtré`,c:"#0f2a52"},
    {l:"Critiques",v:crit,s:`${Math.round(crit/n*100)}%`,c:sevColor("Critique")},
    {l:"Hautes",v:haute,s:`${Math.round(haute/n*100)}%`,c:sevColor("Haute")},
    {l:"Retard ETA médian",v:etaMed==null?"—":etaMed+"j",s:"délai médian",c:etaMed<0?"#d92d20":"#12805c"},
    {l:"Taux BAE",v:Math.round(rows.filter(r=>r.dateBAE).length/n*100)+"%",s:"BAE obtenus",c:"#2563eb"},
    {l:"Taux archivé",v:Math.round(rows.filter(r=>r.dateArchivage).length/n*100)+"%",s:"clôturés",c:"#12805c"},
  ];
  body.innerHTML=kpis.map(k=>`<div class="kpi" style="--kpi-c:${k.c}"><label>${k.l}</label><strong>${k.v}</strong><span>${k.s}</span></div>`).join("");
  const sevRows=[["Critique",crit],["Haute",haute],["Moyenne",moy],["OK",ok]];
  const mx=Math.max(1,...sevRows.map(x=>x[1]));
  sev.innerHTML=sevRows.map(([s,v])=>`<div class="bar-row"><span>${s}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(v/mx*100)}%;background:${sevColor(s)}"></div></div><b>${v}</b></div>`).join("");
  const vrows=rows.filter(matchTypes);
  const byA={}; vrows.forEach(r=>r.alerts.forEach(a=>{ if(!F.alertTypes.length||F.alertTypes.includes(a.c)) byA[a.c]=(byA[a.c]||0)+1; }));
  const arrA=Object.entries(byA).sort((a,b)=>b[1]-a[1]).slice(0,6); const mxA=Math.max(1,...arrA.map(x=>x[1]),1);
  al.innerHTML=arrA.length?arrA.map(([k,v])=>{const d=alertDef(k);return `<div class="bar-row"><span style="cursor:pointer" data-al="${k}" title="${esc(d.h)}"><b style="color:${d.c}">${k}</b> ${esc(d.t.slice(0,26))}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(v/mxA*100)}%;background:${d.c}"></div></div><b>${v}</b></div>`;}).join(""):"<p style='color:#64748b'>Aucune alerte sur ce périmètre. ✔</p>";
  $$("#comDetailAlerts [data-al]").forEach(el=>el.onclick=()=>{ S.alertFilter=el.dataset.al; S.pageAlert=0; goto("alertes"); renderAlertTypes(); renderAlertTable(); });
  const byM={}; rows.forEach(r=>{ if(r.etaYM) byM[r.etaYM]=(byM[r.etaYM]||0)+1; });
  const arrM=Object.entries(byM).sort(); const mxM=Math.max(1,...arrM.map(x=>x[1]),1);
  mo.innerHTML=arrM.length?arrM.map(([k,v])=>`<div class="bar-row"><span>${ymLabel(k)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(v/mxM*100)}%;background:#0f2a52"></div></div><b>${v}</b></div>`).join(""):"<p style='color:#64748b'>Pas de mois ETA renseignés.</p>";
  /* délais moyens entre étapes consécutives (positionnement process du COM) */
  const pairs=[]; for(let i=0;i<STEPS.length-1;i++) pairs.push([STEPS[i],STEPS[i+1]]);
  const avgs=pairs.map(([a,b])=>{
    let s=0,n=0; rows.forEach(r=>{ const d1=r[a.dateKey],d2=r[b.dateKey]; if(d1&&d2){ const d=diffJ(d2,d1); if(d!=null&&d>=0){s+=d;n++;} } });
    return {l:`${a.label} → ${b.label}`, avg:n?s/n:null, n, sla:CFG.sla[a.k]??null};
  });
  const mxS=Math.max(1,...avgs.map(x=>x.avg||0));
  st.innerHTML=avgs.map(x=>x.avg==null
    ?`<div class="bar-row"><span>${esc(x.l)}</span><div class="bar-track"></div><b style="color:#94a3b8">—</b></div>`
    :`<div class="bar-row"><span>${esc(x.l)}${x.sla!=null&&x.avg>x.sla?' <b class="late">⚠</b>':""}<br><small style="color:#64748b">SLA ${x.sla??"—"}j • n=${x.n}</small></span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(x.avg/mxS*100)}%;background:${x.sla!=null&&x.avg>x.sla?sevColor("Critique"):"#0f2a52"}"></div></div><b>${x.avg.toFixed(1)}j</b></div>`).join("");
  const top=[...vrows].sort((a,b)=>b.score-a.score).slice(0,8);
  const q=norm($("#fSearch")?.value||"");
  tb.innerHTML=top.map(r=>`<tr data-i="${r._i}" style="cursor:pointer" class="${r.crit==="Critique"?"crit":""}" data-tip="${esc(tipHTML(r))}"><td><b style="color:${sevColor(r.crit)}">${r.score}</b></td><td><b>${esc(r.dossier||"—")}</b></td><td>${esc((r.client||"").slice(0,26))}</td><td>${delayCell(r.delaiETA,r.dateETA)}</td><td><span class="pill ${r.dateArchivage?"ok":"grey"}">${esc(r.etape)}</span></td><td>${r.alerts.slice(0,3).map(a=>`<span class="pill ${alertDef(a.c).sev==="Critique"?"crit":alertDef(a.c).sev==="Haute"?"haute":"moy"}" title="${esc(a.d)}">${a.c}</span>`).join(" ")}</td><td style="white-space:normal;min-width:200px;font-size:12px">${hiComment((r.comments||"").slice(0,140),q)||"<span style='color:#94a3b8'>—</span>"}</td></tr>`).join("")||'<tr><td colspan="7" style="text-align:center;color:#64748b">—</td></tr>';
  $$("#comDetailTable tbody tr[data-i]").forEach(tr=>tr.onclick=()=>openDrawer(+tr.dataset.i));
}
/* Multi-sélecteur des clients visibles (toutes pages) — recherche incluse */
function renderClientMulti(){
  const btn=$("#gClientBtn"); if(!btn) return;
  const sel=F.clients;
  btn.innerHTML=sel.length?`👥 ${esc(sel.slice(0,2).join(", "))}${sel.length>2?` (+${sel.length-2})`:""} ▾`:"👥 Tous ▾";
  btn.title=sel.length?`Clients visibles : ${sel.join(", ")}`:"Choisir les clients visibles sur toutes les pages";
}
function renderClientPanel(){
  const panel=$("#gClientPanel"); if(!panel) return;
  const q=norm(S.clientQ||"");
  let list=uniq("client");
  if(q) list=list.filter(c=>norm(c).includes(q));
  const cap=200, more=list.length>cap;
  const shown=list.slice(0,cap);
  panel.innerHTML=`<div style="position:sticky;top:0;background:#fff;padding:2px 2px 6px"><input id="gClientQ" placeholder="Rechercher un client…" value="${esc(S.clientQ||"")}" style="width:100%;border:1px solid var(--agl-line);border-radius:8px;padding:7px;font-size:12.5px"></div>`
    +(shown.length?shown.map(c=>`<label class="msel-opt" title="${esc(c)}"><input type="checkbox" data-cl="${esc(c)}" ${F.clients.includes(c)?"checked":""}><span style="flex:1">${esc(c)}</span></label>`).join(""):'<p style="color:#64748b;font-size:12px;padding:6px">Aucun client trouvé.</p>')
    +(more?`<p style="color:#64748b;font-size:11px;padding:4px 6px">+${list.length-cap} autres — affinez la recherche.</p>`:"")
    +`<div style="display:flex;gap:6px;margin-top:8px;position:sticky;bottom:0;background:#fff;padding-top:6px"><button class="btn small" id="clAll">Tous</button><button class="btn small ghost" id="clInv">Inverser</button></div>`;
  const qEl=$("#gClientQ"); qEl.focus(); qEl.setSelectionRange(qEl.value.length,qEl.value.length);
  qEl.oninput=e=>{ S.clientQ=e.target.value; renderClientPanel(); };
  panel.onchange=e=>{
    const cb=e.target.closest?e.target.closest("input[data-cl]"):null; if(!cb) return;
    const c=cb.dataset.cl;
    if(cb.checked){ if(!F.clients.includes(c)) F.clients.push(c); }
    else { F.clients=F.clients.filter(x=>x!==c); }
    S.pageMain=0; S.pageAlert=0; renderAll();
  };
  panel.onclick=e=>{
    if(e.target.id==="clAll"){ F.clients=[]; S.clientQ=""; S.pageMain=0; S.pageAlert=0; renderAll(); }
    if(e.target.id==="clInv"){ const all=uniq("client"); F.clients=all.filter(c=>!F.clients.includes(c)); S.pageMain=0; S.pageAlert=0; renderAll(); }
  };
}
/* Multi-sélecteur des types d'alerte visibles (toutes pages) */
function renderAlertMulti(){
  const btn=$("#gAlertBtn"), panel=$("#gAlertPanel");
  if(!btn||!panel) return;
  const sel=F.alertTypes;
  btn.innerHTML=sel.length?`🚨 ${esc(sel.slice(0,3).join(", "))}${sel.length>3?` (+${sel.length-3})`:""} ▾`:"🚨 Toutes ▾";
  btn.title=sel.length?`Types visibles : ${sel.join(", ")} — cliquez pour modifier`:"Choisir les types d'alerte visibles sur toutes les pages";
  panel.innerHTML=Object.entries(CFG.alerts).filter(([,d])=>d.on!==false&&!d.deleted).map(([k,d])=>`<label class="msel-opt" title="${esc(d.h)}"><input type="checkbox" data-at="${k}" ${sel.includes(k)?"checked":""}><span class="dot" style="background:${d.c}"></span><b>${k}</b><span style="flex:1">${esc(d.t)}</span></label>`).join("")+`<div style="display:flex;gap:6px;margin-top:8px"><button class="btn small" id="msAll">Tous</button><button class="btn small ghost" id="msInv">Inverser</button></div>`;
}
/* ---------- Temps de traitement par séquence + évolution mensuelle ---------- */
/* ETA is a forecast, RTA an observed arrival. Preparation may precede either.
   Only consecutive processing milestones form processing-time sequences. */
function processSeq(){ return STEPS.map(s=>[s.label,s.dateKey]); }
function durationStats(values){
  if(!values.length) return null;
  const ds=[...values].sort((a,b)=>a-b),n=ds.length;
  return {n,sum:ds.reduce((s,d)=>s+d,0),mean:ds.reduce((s,d)=>s+d,0)/n,median:n%2?ds[Math.floor(n/2)]:(ds[n/2-1]+ds[n/2])/2,min:ds[0],max:ds[n-1]};
}
function stepStats(rows){
  const seq=processSeq(), out=[],pilot=todayPilot(), total=rows.length;
  for(let i=0;i<seq.length-1;i++){
    const [la,ka]=seq[i],[lb,kb]=seq[i+1];
    const ds=[],waiting=[];let inversions=0,closed=0,missing=0,future=0;
    rows.forEach(r=>{
      const a=r[ka],b=r[kb];
      if(!a){missing++;return;}
      if(b){const d=diffJ(b,a);if(d>=0)ds.push(d);else inversions++;return;}
      if(r.dateArchivage||seq.slice(i+2).some(([,key])=>r[key])){closed++;return;}
      const age=diffJ(pilot,a);
      if(age>=0)waiting.push(age);else future++;
    });
    if(!total) continue;
    const stats=durationStats(ds),age=durationStats(waiting);
    const buckets=[["0–2 j",d=>d<=2],["3–7 j",d=>d>2&&d<=7],["8–14 j",d=>d>7&&d<=14],[">14 j",d=>d>14]].map(([label,test])=>({label,n:ds.filter(test).length,pct:ds.length?ds.filter(test).length/ds.length*100:0}));
    const share=x=>total?x/total*100:0;
    out.push({from:la,to:lb,total,n:ds.length,mean:stats?.mean??null,median:stats?.median??null,min:stats?.min??null,max:stats?.max??null,sum:stats?.sum??0,waiting:waiting.length,age:age?.median??null,inversions,closed,missing,future,qTerm:share(ds.length),qWait:share(waiting.length),qInv:share(inversions),qClosed:share(closed),qMissing:share(missing),qFuture:share(future),coverage:share(ds.length+inversions),buckets});
  }
  const tot=out.reduce((s,p)=>s+p.sum,0)||1;
  out.forEach(p=>p.pct=p.sum/tot*100);
  return out;
}
function monthStats(rows){
  const by={};
  rows.forEach(r=>{
    const k=r.etaYM||"(sans ETA)";
    const o=by[k]=by[k]||{n:0,crit:0,haute:0,moy:0,ok:0,arch:0,sc:0};
    o.n++; o.sc+=r.score;
    o[r.crit==="Critique"?"crit":r.crit==="Haute"?"haute":r.crit==="Moyenne"?"moy":"ok"]++;
    if(r.dateArchivage) o.arch++;
  });
  return Object.entries(by).sort((a,b)=>a[0]==="(sans ETA)"?1:b[0]==="(sans ETA)"?-1:a[0].localeCompare(b[0]));
}
function etaRtaStats(rows){
  const ds=[];
  rows.forEach(r=>{ if(!r.dateETA||!r.dateRTA) return; const d=diffJ(r.dateRTA,r.dateETA); if(d!=null) ds.push(d); });
  if(!ds.length) return null;
  ds.sort((a,b)=>a-b);
  return {...durationStats(ds),late:ds.filter(d=>d>0).length,early:ds.filter(d=>d<0).length};
}
function cycleStats(rows){
  const ds=[];rows.forEach(r=>{if(r.dateValidation&&r.dateArchivage){const d=diffJ(r.dateArchivage,r.dateValidation);if(d>=0)ds.push(d);}});return durationStats(ds);
}
function monthlyHistory(rows){
  const by={},ym=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`,pilot=todayPilot();
  const bucket=k=>by[k]||(by[k]={opened:0,arrived:0,delivered:0,archived:0,states:Array(STEPS.length).fill(0)});
  rows.forEach(r=>{
    for(const [key,target] of [["dateValidation","opened"],["dateRTA","arrived"],["dateRetour","delivered"],["dateArchivage","archived"]])if(r[key]&&r[key]<=pilot)bucket(ym(r[key]))[target]++;
    const events=STEPS.map((s,i)=>({date:r[s.dateKey],i})).filter(e=>e.date&&e.date<=pilot).sort((a,b)=>a.date-b.date||a.i-b.i);
    if(!events.length)return;
    const snapshots=new Map();events.forEach(e=>snapshots.set(ym(e.date),e.i));
    const first=events[0].date,end=events[events.length-1].i===STEPS.length-1?events[events.length-1].date:pilot;
    let latest=-1;
    for(let date=new Date(first.getFullYear(),first.getMonth(),1);date<=end;date=new Date(date.getFullYear(),date.getMonth()+1,1)){
      const key=ym(date);if(snapshots.has(key))latest=snapshots.get(key);
      if(latest>=0)bucket(key).states[latest]++;
    }
  });
  return Object.entries(by).sort((a,b)=>a[0].localeCompare(b[0]));
}
function renderEvolution(){
  const card=$("#evoCard"); if(!card) return;
  const rows=baseFiltered();
  const pairs=stepStats(rows), ms=monthStats(rows), es=etaRtaStats(rows),cycle=cycleStats(rows);
  const slow=pairs.filter(p=>p.n).sort((a,b)=>b.mean-a.mean)[0];
  const topMonth=[...ms].sort((a,b)=>b[1].n-a[1].n)[0];
  const kpis=[
    {l:"RTA vs ETA (médian)",v:es?es.median+"j":"—",s:es?`${es.early} arrivées en avance • ${es.late} en retard`:"pas de couple ETA/RTA",c:es?(es.median>0?"#d92d20":"#12805c"):"#64748b"},
    {l:"Cycle clôturé moyen",v:cycle?cycle.mean.toFixed(1)+"j":"—",s:cycle?`Validation → archivage · ${cycle.n} dossiers · médiane ${cycle.median}j` :"Aucun cycle complet renseigné",c:"#0f2a52"},
    {l:"Séquence la plus lente",v:slow?slow.mean.toFixed(1)+"j":"—",s:slow?`${slow.from} → ${slow.to} (n=${slow.n})`:"—",c:"#e9730c"},
    {l:"Mois le plus chargé",v:topMonth?(topMonth[0]==="(sans ETA)"?"Sans ETA":ymLabel(topMonth[0])):"—",s:topMonth?`${topMonth[1].n} dossiers • ${Math.round(topMonth[1].arch/topMonth[1].n*100)}% archivés`:"—",c:"#2563eb"},
  ];
  $("#evoKpis").innerHTML=kpis.map(k=>`<div class="kpi" style="--kpi-c:${k.c}"><label>${k.l}</label><strong>${k.v}</strong><span>${esc(k.s)}</span></div>`).join("");
  // évolution mensuelle : dossiers et leur état
  const mxM=Math.max(1,...ms.map(x=>x[1].n));
  $("#evoMonths tbody").innerHTML=ms.map(([k,o])=>{
    const ch=o.crit+o.haute;
    return `<tr><td><b>${k==="(sans ETA)"?"Sans ETA":esc(ymLabel(k))}</b></td><td>${o.n}</td><td><div class="stack" title="Critique ${o.crit} • Haute ${o.haute} • Moyenne ${o.moy} • OK ${o.ok}">${[["crit",sevColor("Critique")],["haute",sevColor("Haute")],["moy",sevColor("Moyenne")],["ok",sevColor("OK")]].map(([g,c])=>o[g]?`<i style="width:${Math.max(1.5,o[g]/o.n*100)}%;background:${c}"></i>`:"").join("")}</div></td><td>${Math.round(ch/o.n*100)}%</td><td>${(o.sc/o.n).toFixed(1)}</td><td>${Math.round(o.arch/o.n*100)}%</td></tr>`;
  }).join("")||'<tr><td colspan="6"><div class="empty-state"><b>Aucune donnée</b>Chargez votre export Excel.</div></td></tr>';
  $$("#evoMonths tbody tr").forEach(tr=>tr.onclick=()=>{const title=tr.querySelector("td b");if(!title)return;const ym=uniqYM().find(y=>ymLabel(y)===title.textContent);if(ym)setF("month",ym);});
  // horloge des temps de traitement : moyenne, médiane, min, max, part du cycle
  const mxS=Math.max(1,...pairs.map(p=>p.mean||0));
  const qseg=(w,c)=>w>0?`<i style="width:${Math.max(1.2,w)}%;background:${c}"></i>`:"";
  $("#evoSteps tbody").innerHTML=pairs.map(p=>{
    const qtip=esc(`${p.qTerm.toFixed(1)}% terminées · ${p.qWait.toFixed(1)}% en attente · ${p.qInv.toFixed(1)}% inversions · ${p.qClosed.toFixed(1)}% clôturées sans étape · ${p.qFuture.toFixed(1)}% départ futur · ${p.qMissing.toFixed(1)}% sans date départ`);
    return `<tr><td><b>${esc(p.from)} → ${esc(p.to)}</b><br><small style="color:#64748b">${p.n} terminées · ${p.waiting} en attente${p.age!==null?` (âge médian ${p.age}j)`:""} · ${p.inversions} inversions · ${p.closed} sans étape · ${p.missing} sans date</small></td><td><b>${p.mean!==null?p.mean.toFixed(1)+"j":"—"}</b></td><td>${p.median!==null?p.median+"j":"—"}</td><td>${p.min!==null?p.min+"j":"—"}</td><td>${p.max!==null?p.max+"j":"—"}</td><td><div class="bar-track"><div class="bar-fill" style="width:${Math.round((p.mean||0)/mxS*100)}%;background:#2563eb"></div></div><small>${p.pct.toFixed(1)}% des jours observés</small></td><td>${p.buckets.map(b=>`${b.label} : ${b.pct.toFixed(0)}%`).join("<br>")}</td><td style="min-width:190px"><div class="stack" title="${qtip}">${qseg(p.qTerm,"#12805c")}${qseg(p.qWait,"#e9730c")}${qseg(p.qInv,"#d92d20")}${qseg(p.qClosed,"#2563eb")}${qseg(p.qFuture,"#7c3aed")}${qseg(p.qMissing,"#cbd5e1")}</div><small style="color:#64748b">${p.coverage.toFixed(1)}% avec les 2 dates${p.qMissing>0?` · ${p.qMissing.toFixed(1)}% sans date départ`:""}</small></td></tr>`;
  }).join("")||'<tr><td colspan="8"><div class="empty-state"><b>Pas assez de dates renseignées</b></div></td></tr>';
  $("#evoHistory tbody").innerHTML=monthlyHistory(rows).map(([key,o])=>`<tr><td><b>${esc(ymLabel(key))}</b></td><td>${o.opened}</td><td>${o.arrived}</td><td>${o.delivered}</td><td>${o.archived}</td><td>${o.states.slice(0,-1).reduce((s,n)=>s+n,0)}</td><td>${o.states.map((n,i)=>n?`${esc(STEPS[i].label)} : ${n}`:"").filter(Boolean).join("<br>")||"—"}</td></tr>`).join("")||'<tr><td colspan="7">Aucun historique daté disponible.</td></tr>';
}
function renderBU(){
  const E=baseFiltered();
  const byM={}; E.forEach(r=>{const k=r.metier||"(vide)";byM[k]=(byM[k]||0)+1;});
  const arrM=Object.entries(byM).sort((a,b)=>b[1]-a[1]); const max=Math.max(1,...arrM.map(a=>a[1]));
  $("#buBars").innerHTML=arrM.length?arrM.map(([k,v])=>`<div class="bar-row"><span>Métier ${esc(k)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(v/max*100)}%;background:#0f2a52"></div></div><b>${v}</b></div>`).join(""):"<div class='empty-state'><b>Aucune donnée</b>Chargez votre export Excel.</div>";
  const byC={}; E.forEach(r=>{if(r.crit==="Critique"||r.crit==="Haute"){const k=r.client||"(vide)";byC[k]=(byC[k]||0)+1;}});
  const arrC=Object.entries(byC).sort((a,b)=>b[1]-a[1]); const maxC=Math.max(1,...arrC.map(a=>a[1]));
  $("#clientBars").innerHTML=(arrC.map(([k,v])=>`<div class="bar-row" data-client="${esc(k)}" style="cursor:pointer" title="Voir la performance client de ${esc(k)}"><span>${esc(k.slice(0,24))}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(v/maxC*100)}%;background:#d92d20"></div></div><b>${v}</b></div>`).join(""))||"<p style='color:#64748b'>—</p>";
  $$("#clientBars [data-client]").forEach(el=>el.onclick=()=>{ S.selClient=el.dataset.client; $("#clientSearch").value=S.selClient; renderClientDetail(); goto("perfs"); });
  const cc=$("#clientCount"); if(cc) cc.textContent=`(${arrC.length} clients)`;
  const mets=[...new Set(E.map(r=>r.metier||"(vide)"))].slice(0,12);
  $("#buMatrix tbody").innerHTML=mets.map(m=>{const rows=E.filter(r=>(r.metier||"(vide)")===m);const c=k=>rows.filter(r=>r.etapeKey===k||(k==="archive"&&r.dateArchivage)).length;return `<tr><td><b>${esc(m)}</b></td><td>${rows.length}</td><td>${c("validation")}</td><td>${c("docs")}</td><td>${c("note")}</td><td>${c("douane")}</td><td>${c("bae")}</td><td>${c("mise")+c("retour")}</td><td>${c("factInt")+c("validFinal")}</td><td>${rows.filter(r=>r.dateArchivage).length}</td></tr>`;}).join("")||'<tr><td colspan="10"><div class="empty-state"><b>Aucune donnée</b>Chargez votre export Excel.</div></td></tr>';
}
function renderMethodo(){
  $("#methodoBody").innerHTML=`
  <h4>1. Chaîne process & ordre attendu</h4>
  <p><code>Validation → Docs → Note → Douane → Facture douane → BAE → Mise → Retour → Facture intervention → Validation finale → Archivage</code>. La préparation peut précéder l'arrivée réelle. A3 vérifie l'ordre des jalons avec une tolérance de saisie (jours réglables) ; la facturation anticipée après mise/retour est une pratique acceptée, pas une inversion.</p>
  <h4>2. ETA estimative / RTA réelle (pilotage = ${esc($("#pilotDate").value||CFG.pilot)})</h4><p>Une ETA passée indique une prévision échue, pas une arrivée confirmée. La RTA est l'arrivée réelle. <code>RTA − ETA</code> mesure l'avance (négatif) ou le retard (positif) d'arrivée. Les temps de traitement se calculent séparément entre jalons réellement renseignés.</p>
  <h4>3. SLA par transition (jours, réglables)</h4>
  <p>${Object.entries(CFG.sla).map(([k,v])=>`${k} <b>${v}j</b>`).join(" • ")}. Seules les stagnations <b>en cours</b> déclenchent A4 (l'historique écoulé reste visible sans points). A5/A6/A7/A8/A11/A12 se déclenchent sur l'ancienneté du blocage (seuils jours réglables) ; l'alerte la plus précise l'emporte (A11 prime A7, A12 prime A8).</p>
  <h4>4. Alertes actives (poids et sévérités réglables)</h4>
  <p>${Object.entries(CFG.alerts).filter(([,d])=>d.on!==false&&!d.deleted).map(([k,d])=>`<code>${k}</code> ${esc(d.ico||"")} <b>${esc(d.t)}</b> (${d.sev}, +${d.w}) — ${esc(d.h)}`).join("<br>")}</p>
  <h4>5. Score de criticité 0–100</h4><p>Somme des poids des blocages <b>en cours</b> (l'ancienneté est déjà portée par les seuils de chaque règle, sans double comptage). Seuils : <code>≥${CFG.thCrit} Critique</code> (point dur douane + ETA compromise) • <code>≥${CFG.thHaute} Haute</code> (flux à traiter) • <code>≥${CFG.thMoy} Moyenne</code> (stock à solder) • sinon OK.</p>
  <h4>6. Mapping intelligent</h4><p>Normalisation (minuscules, sans accents, espaces) + dictionnaire ~60 synonymes FR/EN. Score 0–100, pastille verte/orange/rouge. Modifiable avant analyse, mémorisé en local. Dates : serial Excel + JJ/MM/AAAA + ISO.</p>
  <h4>7. Confidentialité</h4><p>Lecture Excel via SheetJS <b>dans le navigateur</b>, stockage <b>IndexedDB + localStorage</b> sur ce poste uniquement. E-mails via <code>mailto</code> (votre messagerie). Déploiement Vercel/GitHub = fichiers statiques.</p>`;
}
function renderAll(){ renderPilotage(); renderKPIs(); renderComBars(); renderSteps(); renderDelays(); renderTopAlerts(); renderAlertTypes(); renderAlertTable(); renderOverdue(); renderMain(); renderPerfs(); renderBU(); renderEvolution(); renderAlertMulti(); renderClientMulti(); renderPins(); renderClientDetail();if(S.drawerId!==undefined&&$("#drawer").classList.contains("open"))openDrawer(S.drawerId);renderCommentBadges(); }
function renderCommentBadges(){
  $$("tr[data-i] .cmt-dot").forEach(el=>el.remove());
  if(!S.prefs.commentBadge)return;
  const lookup=new Map(S.enriched.map(r=>[r._i,r]));
  $$("tr[data-i]").forEach(tr=>{const r=lookup.get(+tr.dataset.i);if(!r||!(r.comments||S.notes[r._i]))return;const label=[...tr.querySelectorAll("td b")].find(el=>el.textContent===(r.dossier||"—"));if(label){const badge=document.createElement("span");badge.className="cmt-dot";badge.textContent="💬";badge.title="Commentaires disponibles — survolez pour les lire";label.after(badge);}});
}
/* ---------- Administration ---------- */
function renderAdmin(){
  renderRuleManager();
  $("#cfgPilot").value=$("#pilotDate").value||CFG.pilot;
  $("#cfgThCrit").value=CFG.thCrit; $("#cfgThHaute").value=CFG.thHaute; $("#cfgThMoy").value=CFG.thMoy;
  $("#cfgEtaCrit").value=CFG.etaCrit; $("#cfgRtaCrit").value=CFG.rtaCrit;
  const slaLabels={validation:"Valid→Docs",docs:"Docs→Note",note:"Note→Enreg",douane:"Enreg→Fact",factDouane:"Fact→BAE",bae:"BAE→Mise",mise:"Mise→Retour",retour:"Retour→FactInt",factInt:"FactInt→ValidFin",validFinal:"ValidFin→Archiv"};
  $("#cfgSlaGrid").innerHTML=Object.keys(SLA_DEFAULT).map(k=>`<div class="f-field"><label>${slaLabels[k]} (j)</label><input type="number" min="0" max="60" data-sla="${k}" value="${CFG.sla[k]}"></div>`).join("");
  $("#cfgAlertTable tbody").innerHTML=Object.entries(CFG.alerts).map(([k,d])=>`<tr><td><b>${k}</b> ${d.ico||""}</td><td><b>${esc(d.t)}</b><br><small style="color:#64748b">${esc(d.h)}</small></td><td><input type="checkbox" data-on="${k}" ${d.on!==false?"checked":""} style="width:18px;height:18px"></td><td><select data-sev="${k}">${["Critique","Haute","Moyenne"].map(s=>`<option ${d.sev===s?"selected":""}>${s}</option>`).join("")}</select></td><td><input type="number" min="0" max="50" data-w="${k}" value="${d.w}"></td><td><input type="number" min="0" max="90" data-days="${k}" value="${d.days}" title="Seuil jours (ancienneté du blocage ; A3 = tolérance d'inversion ; A9 = % de dossiers)"></td><td><input type="color" class="cfg-color" data-col="${k}" value="${d.c}"></td></tr>`).join("");
  $("#cfgSevColors").innerHTML=["Critique","Haute","Moyenne","OK"].map(s=>`<div class="f-field"><label>${s}</label><div style="display:flex;gap:8px;align-items:center"><input type="color" class="cfg-color" data-sevc="${s}" value="${CFG.sevColors[s]}"><b>${S.enriched.filter(r=>r.crit===s).length} dossiers</b></div></div>`).join("");
  $$("#cfgAlertTable tbody tr").forEach(row=>{const input=row.querySelector("[data-on]");if(input&&CFG.alerts[input.dataset.on]?.deleted)row.remove();});
  const ovBody=$("#cfgOverdueTable tbody");
  if(ovBody){
    ovBody.innerHTML=Object.keys(OVERDUE_DEFS).filter(k=>!OVERDUE.rules[k]?.deleted).map(k=>{ const d=OVERDUE_DEFS[k], r=OVERDUE.rules[k];
      const subs=OVRULE_DAYS[k]||[];
      const seuil=subs.length?subs.map(s=>`<label style="display:block;font-size:11px;color:#64748b">${OVDAY_LBL[s]}<br><input type="number" min="0" max="3650" data-ovdays="${s}" value="${OVERDUE.days[s]}" style="width:76px"></label>`).join(""):(k==="L10"?'<span style="color:#94a3b8">champ requis</span>':'<span style="color:#94a3b8">sans seuil</span>');
      return `<tr style="${r.on===false?"opacity:.55":""}"><td><b>${k}</b> ${d.ico||""}</td><td><b>${esc(d.t)}</b><br><small style="color:#64748b">${esc(d.h)}</small></td><td><input type="checkbox" data-ovon="${k}" ${r.on!==false?"checked":""} style="width:18px;height:18px"></td><td><select data-ovsev="${k}">${["Critique","Haute","Moyenne"].map(s=>`<option ${r.sev===s?"selected":""}>${s}</option>`).join("")}</select></td><td>${seuil}</td><td><input type="color" class="cfg-color" data-ovcol="${k}" value="${r.c}"></td><td style="white-space:nowrap"><button class="btn small" data-ovtoggle="${k}">${r.on===false?"Afficher":"Masquer"}</button> <button class="btn small ghost" data-ovdel="${k}" aria-label="Supprimer ${k}">Supprimer</button></td></tr>`;
    }).join("");
    $$("#cfgOverdueTable [data-ovtoggle]").forEach(b=>b.onclick=()=>{ const r=OVERDUE.rules[b.dataset.ovtoggle]; r.on=r.on===false; saveOverdue(); renderAll(); renderAdmin(); renderMethodo(); toast(r.on?"Règle Overdue affichée":"Règle Overdue masquée partout"); });
    $$("#cfgOverdueTable [data-ovdel]").forEach(b=>b.onclick=()=>{ OVERDUE.rules[b.dataset.ovdel].deleted=true; saveOverdue(); renderAll(); renderAdmin(); renderMethodo(); toast("Règle Overdue supprimée (↩ Défaut pour restaurer)"); });
    $$("#cfgOverdueTable [data-ovon]").forEach(i=>i.onchange=()=>{ OVERDUE.rules[i.dataset.ovon].on=i.checked; saveOverdue(); renderAll(); renderAdmin(); });
  }
  const ovDel=$("#cfgOverdueDeleted");
  if(ovDel){
    const gone=Object.keys(OVERDUE_DEFS).filter(k=>OVERDUE.rules[k]?.deleted);
    ovDel.innerHTML=gone.length?`<details class="detail-section"><summary>Règles Overdue supprimées (${gone.length}) — restaurer</summary><div style="display:flex;gap:6px;flex-wrap:wrap;padding:8px 0">${gone.map(k=>`<button class="btn small" data-ovrestore="${k}">↩ ${k} ${esc(OVERDUE_DEFS[k].t)}</button>`).join("")}</div></details>`:"";
    $$("#cfgOverdueDeleted [data-ovrestore]").forEach(b=>b.onclick=()=>{ const r=OVERDUE.rules[b.dataset.ovrestore]; r.deleted=false; r.on=true; saveOverdue(); renderAll(); renderAdmin(); renderMethodo(); toast("Règle Overdue restaurée"); });
  }
  const ovPer=$("#cfgOverduePerim"); if(ovPer) ovPer.value=OVERDUE.perim.join(", ");
}
function collectAdmin(){
  CFG.pilot=$("#cfgPilot").value||CFG.pilot;
  CFG.thCrit=+$("#cfgThCrit").value||55; CFG.thHaute=+$("#cfgThHaute").value||30; CFG.thMoy=+$("#cfgThMoy").value||12;
  CFG.etaCrit=+$("#cfgEtaCrit").value||-7; CFG.rtaCrit=+$("#cfgRtaCrit").value||-7;
  $$("#cfgSlaGrid input").forEach(i=>{ CFG.sla[i.dataset.sla]=Math.max(0,+i.value||0); });
  $$("#cfgAlertTable input[data-on]").forEach(i=>{ CFG.alerts[i.dataset.on].on=i.checked; });
  $$("#cfgAlertTable select[data-sev]").forEach(s=>{ CFG.alerts[s.dataset.sev].sev=s.value; });
  $$("#cfgAlertTable input[data-w]").forEach(i=>{ CFG.alerts[i.dataset.w].w=Math.max(0,+i.value||0); });
  $$("#cfgAlertTable input[data-days]").forEach(i=>{ CFG.alerts[i.dataset.days].days=Math.max(0,+i.value||0); });
  $$("#cfgAlertTable input[data-col]").forEach(i=>{ CFG.alerts[i.dataset.col].c=i.value; });
  $$("#cfgSevColors input[data-sevc]").forEach(i=>{ CFG.sevColors[i.dataset.sevc]=i.value; });
  $$("#cfgOverdueTable input[data-ovdays]").forEach(i=>{ if(i.dataset.ovdays in OVERDUE_DEFAULT.days) OVERDUE.days[i.dataset.ovdays]=Math.max(0,+i.value||0); });
  $$("#cfgOverdueTable input[data-ovon]").forEach(i=>{ if(OVERDUE.rules[i.dataset.ovon]) OVERDUE.rules[i.dataset.ovon].on=i.checked; });
  $$("#cfgOverdueTable select[data-ovsev]").forEach(s=>{ if(OVERDUE.rules[s.dataset.ovsev]) OVERDUE.rules[s.dataset.ovsev].sev=s.value; });
  $$("#cfgOverdueTable input[data-ovcol]").forEach(i=>{ if(OVERDUE.rules[i.dataset.ovcol]) OVERDUE.rules[i.dataset.ovcol].c=i.value; });
  const ovPer=$("#cfgOverduePerim"); if(ovPer) OVERDUE.perim=ovPer.value.split(",").map(s=>s.trim()).filter(Boolean);
  saveOverdue();
}
async function applyCfgAndRerender(msg){
  saveCfg(); applySevColors();
  F.alertTypes=F.alertTypes.filter(k=>CFG.alerts[k]&&CFG.alerts[k].on!==false&&!CFG.alerts[k].deleted);
  if(S.alertFilter&&(!CFG.alerts[S.alertFilter]||CFG.alerts[S.alertFilter].on===false||CFG.alerts[S.alertFilter].deleted)) S.alertFilter=null;
  $("#pilotDate").value=CFG.pilot;
  if(S.rows.length){
    S.enriched=await enrichAllAsync(S.rows,(d,t)=>setImportState("loading",`Recalcul : ${fmtN(d)} / ${fmtN(t)}…`));
    fillSelects(); setImportState("loaded",S.fileName);
  }
  renderAll(); renderMethodo(); renderGuide(); renderAdmin();
  if(S.drawerId!==undefined&&$("#drawer").classList.contains("open")) openDrawer(S.drawerId);
  if(msg) toast(msg);
}
/* Performance client : KPIs, états cliquables, alertes, top dossiers */
function renderClientDetail(){
  const body=$("#clientPerfBody"); if(!body) return;
  const client=S.selClient;
  if(!client){ body.innerHTML='<div class="empty-state"><b>Sélectionnez un client</b>Recherchez un client ci-dessus pour voir ses états, ses KPIs et ses alertes.</div>'; return; }
  const rows=baseFiltered().filter(r=>r.client===client);
  const n=rows.length||1;
  const crit=rows.filter(r=>r.crit==="Critique").length, haute=rows.filter(r=>r.crit==="Haute").length;
  const etaMed=durationStats(rows.map(r=>r.delaiETA).filter(v=>v!=null))?.median??null;
  const bae=rows.filter(r=>r.dateBAE).length, arch=rows.filter(r=>r.dateArchivage).length;
  const kpis=[
    {l:"Dossiers",v:rows.length,s:"périmètre filtré",c:"#0f2a52"},
    {l:"Critiques",v:crit,s:`${Math.round(crit/n*100)}%`,c:sevColor("Critique")},
    {l:"Hautes",v:haute,s:`${Math.round(haute/n*100)}%`,c:sevColor("Haute")},
    {l:"Retard ETA médian",v:etaMed==null?"—":etaMed+"j",s:"délai médian",c:etaMed<0?"#d92d20":"#12805c"},
    {l:"Taux BAE",v:Math.round(bae/n*100)+"%",s:"BAE obtenus",c:"#2563eb"},
    {l:"Taux archivé",v:Math.round(arch/n*100)+"%",s:"clôturés",c:"#12805c"},
  ];
  const groups=[{label:"À traiter",color:"#d92d20",test:r=>r.crit==="Critique"||r.crit==="Haute",step:"priority"},{label:"En douane",color:"#2563eb",test:r=>["douane","factDouane","bae"].includes(r.etapeKey),step:"douane"},{label:"En livraison",color:"#e9730c",test:r=>["mise","retour"].includes(r.etapeKey),step:"livraison"},{label:"À clôturer",color:"#ca8a04",test:r=>["factInt","validFinal","archivage"].includes(r.etapeKey),step:"cloture"},{label:"Archivés",color:"#12805c",test:r=>!!r.dateArchivage,step:"archive"}];
  const byA={}; rows.forEach(r=>visibleAlerts(r).forEach(a=>byA[a.c]=(byA[a.c]||0)+1));
  const arrA=Object.entries(byA).sort((a,b)=>b[1]-a[1]).slice(0,5); const mxA=Math.max(1,...arrA.map(x=>x[1]));
  const top=[...rows].sort((a,b)=>b.score-a.score).slice(0,8);
  body.innerHTML=`<div class="kpi-grid" style="grid-template-columns:repeat(6,1fr)">${kpis.map(k=>`<div class="kpi" style="--kpi-c:${k.c}"><label>${k.l}</label><strong>${k.v}</strong><span>${k.s}</span></div>`).join("")}</div>
  <div class="com-status-board" style="padding:0 0 12px">${groups.map(g=>`<button class="status-tile" data-clstep="${g.step}" style="--status-color:${g.color}"><span>${g.label}</span><b>${rows.filter(g.test).length}</b><small>Voir les dossiers →</small></button>`).join("")}</div>
  <div class="panels"><div class="card"><div class="card-h"><h3>Alertes dominantes</h3></div><div class="card-b"><div class="bars">${arrA.length?arrA.map(([k,v])=>{const d=alertDef(k);return `<div class="bar-row"><span><span class="dot" style="background:${d.c}"></span>${k} — ${esc(d.t)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(v/mxA*100)}%;background:${d.c}"></div></div><b>${v}</b></div>`;}).join(""):"<p style='color:#64748b'>Aucune alerte active.</p>"}</div></div></div>
  <div class="card"><div class="card-h"><h3>Top dossiers du client</h3></div><div class="table-wrap" style="max-height:280px"><table><thead><tr><th>Score</th><th>N° dossier</th><th>COM</th><th>ETA / Délai</th><th>Étape</th><th>Alertes</th></tr></thead><tbody>${top.map(r=>`<tr data-i="${r._i}" style="cursor:pointer" class="${r.crit==="Critique"?"crit":""}" data-tip="${esc(tipHTML(r))}"><td><b style="color:${sevColor(r.crit)}">${r.score}</b></td><td><b>${esc(r.dossier||"—")}</b></td><td>${esc(r.com||"—")}</td><td>${delayCell(r.delaiETA,r.dateETA)}</td><td><span class="pill ${r.dateArchivage?"ok":"grey"}">${esc(r.etape)}</span></td><td>${visibleAlerts(r).slice(0,3).map(a=>`<span class="pill ${alertDef(a.c).sev==="Critique"?"crit":alertDef(a.c).sev==="Haute"?"haute":"moy"}" title="${esc(a.d)}">${a.c}</span>`).join(" ")}</td></tr>`).join("")||'<tr><td colspan="6" style="text-align:center;color:#64748b">Aucun dossier sur ce périmètre.</td></tr>'}</tbody></table></div></div></div>`;
  $$("#clientPerfBody [data-clstep]").forEach(b=>b.onclick=()=>{ $("#fClient").value=client; $("#fStep").value=b.dataset.clstep; S.pageMain=0; renderMain(); goto("dossiers"); });
  $$("#clientPerfBody tbody tr[data-i]").forEach(tr=>tr.onclick=()=>openDrawer(+tr.dataset.i));
}
/* Configuration editor and shareable JSON. */
let editingRule="";
function renderRuleManager(){
  $("#ruleManager").innerHTML=Object.entries(CFG.alerts).filter(([,d])=>!d.deleted).map(([code,d])=>`<article class="rule-card ${d.on===false?"muted":""}" style="--rule-color:${d.c}"><div class="rule-card-top"><span class="pill info">${code}</span><span class="rule-state">${d.on===false?"Masquée":"Active"}</span></div><h4>${esc(d.t)}</h4><p>${d.conditions?`${d.conditions.length} condition(s) · ${d.mode==="any"?"OU":"ET"}`:esc(d.h)}</p><div class="rule-card-bottom"><span>${d.sev} · ${d.w} pts</span><div><button class="btn small" data-rule-edit="${code}">Modifier</button><button class="btn small" data-rule-toggle="${code}">${d.on===false?"Afficher":"Masquer"}</button><button class="btn small ghost" data-rule-delete="${code}" aria-label="Supprimer ${esc(d.t)}">Supprimer</button></div></div></article>`).join("");
}
function conditionRow(condition={field:"dateETA",op:"olderThan",value:3}){
  const row=document.createElement("div"); row.className="condition-row";
  const labels={comments:"Commentaires",delaiETA:"Délai ETA (jours)",delaiRTA:"Délai RTA (jours)",etapeKey:"Étape (code)",stagnCount:"Nombre de stagnations"};
  row.innerHTML=`<select data-condition="field" aria-label="Champ">${SpotSettings.fields.map(k=>`<option value="${k}" ${k===condition.field?"selected":""}>${esc(labels[k]||FIELDS.find(f=>f.k===k)?.label||k)}</option>`).join("")}</select><select data-condition="op" aria-label="Opérateur">${Object.entries(SpotSettings.operators).map(([k,v])=>`<option value="${k}" ${k===condition.op?"selected":""}>${esc(v)}</option>`).join("")}</select><input data-condition="value" aria-label="Valeur" value="${esc(condition.value??"")}" placeholder="Valeur"><button class="btn small ghost" data-condition-remove aria-label="Retirer cette condition">✕</button>`;
  const sync=()=>{const op=row.querySelector('[data-condition="op"]').value;const value=row.querySelector('[data-condition="value"]');value.disabled=["empty","present"].includes(op);value.type=["gt","lt","olderThan"].includes(op)?"number":"text";};
  row.querySelector('[data-condition="op"]').onchange=sync; sync();
  $("#ruleConditions").appendChild(row);
}
function openRule(code=""){
  editingRule=code;
  const d=CFG.alerts[code]||{t:"",sev:"Haute",w:15,c:"#e9730c",h:"",mode:"all"};
  $("#ruleEditorTitle").textContent=code?"Modifier l’alerte "+code:"Nouvelle alerte";
  $("#ruleLabel").value=d.t; $("#ruleSeverity").value=d.sev; $("#ruleWeight").value=d.w;
  $("#ruleColor").value=d.c; $("#ruleDescription").value=d.h; $("#ruleMode").value=d.mode||"all";
  $("#ruleBuiltIn").hidden=!code||!!d.conditions; $("#ruleError").textContent=""; $("#ruleConditions").innerHTML="";
  if(d.conditions)d.conditions.forEach(conditionRow);else if(!code)conditionRow();
  $("#ruleBack").classList.add("open"); $("#ruleLabel").focus();
}
function saveRule(){
  try{
    let code=editingRule;
    if(!code){let i=1;while(CFG.alerts["R"+i])i++;code="R"+i;}
    const conditions=$$("#ruleConditions .condition-row").map(row=>({field:row.querySelector('[data-condition="field"]').value,op:row.querySelector('[data-condition="op"]').value,value:row.querySelector('[data-condition="value"]').value}));
    const rule={...(CFG.alerts[code]||{}),t:$("#ruleLabel").value,sev:$("#ruleSeverity").value,w:Number($("#ruleWeight").value),c:$("#ruleColor").value,h:$("#ruleDescription").value,days:CFG.alerts[code]?.days||0,on:true,deleted:false,ico:"•"};
    if(conditions.length){rule.conditions=conditions;rule.mode=$("#ruleMode").value;}
    else if(ALERT_BASE[code]){delete rule.conditions;delete rule.mode;}
    else throw Error("Ajoutez au moins une condition");
    CFG=SpotSettings.validate({...CFG,alerts:{...CFG.alerts,[code]:rule}},DEFAULT_CFG);
    $("#ruleBack").classList.remove("open"); applyCfgAndRerender("Règle enregistrée et appliquée");
  }catch(err){$("#ruleError").textContent=err.message;}
}
function setupSettings(){
  $("#ruleNew").onclick=()=>openRule();
  $("#ruleClose").onclick=$("#ruleCancel").onclick=()=>$("#ruleBack").classList.remove("open");
  $("#conditionAdd").onclick=()=>conditionRow(); $("#ruleSave").onclick=saveRule;
  $("#ruleConditions").onclick=e=>{if(e.target.closest("[data-condition-remove]"))e.target.closest(".condition-row").remove();};
  $("#ruleManager").onclick=e=>{
    const edit=e.target.closest("[data-rule-edit]"),toggle=e.target.closest("[data-rule-toggle]"),del=e.target.closest("[data-rule-delete]");
    if(edit)openRule(edit.dataset.ruleEdit);
    if(toggle){const d=CFG.alerts[toggle.dataset.ruleToggle];d.on=d.on===false;applyCfgAndRerender(d.on?"Alerte affichée":"Alerte masquée partout");}
    if(del){const d=CFG.alerts[del.dataset.ruleDelete];d.deleted=true;d.on=false;applyCfgAndRerender("Alerte supprimée");}
  };
  $("#cfgAlertTable").addEventListener("change",e=>{if(e.target.matches("[data-on]")){CFG.alerts[e.target.dataset.on].on=e.target.checked;applyCfgAndRerender("Visibilité mise à jour");}});
  $("#settingsExport").onclick=()=>{
    try{collectAdmin();CFG=SpotSettings.validate(CFG,DEFAULT_CFG);OVERDUE=SpotSettings.validateOverdue(OVERDUE,OVERDUE_DEFAULT);saveOverdue();applyCfgAndRerender();download("spot-reglages.json",JSON.stringify({format:"spot-settings",version:1,exportedAt:new Date().toISOString(),settings:{...CFG,overdue:OVERDUE}},null,2),"application/json");toast("Réglages sauvegardés · JSON prêt à partager (alertes + Overdue)");}catch(err){toast(esc(err.message));}
  };
  $("#settingsImport").onclick=()=>$("#settingsFile").click();
  $("#settingsFile").onchange=async e=>{const file=e.target.files[0];e.target.value="";if(!file)return;try{const parsed=JSON.parse(await file.text());const config=SpotSettings.validate(parsed,DEFAULT_CFG);const ov=SpotSettings.validateOverdue(parsed.format==="spot-settings"?parsed.settings?.overdue:parsed.overdue,OVERDUE_DEFAULT);CFG=config;OVERDUE=ov;saveOverdue();applyCfgAndRerender("Réglages JSON importés et sauvegardés");}catch(err){toast("Import refusé : "+esc(err.message));}};
  $("#ruleBack").onclick=e=>{if(e.target===$("#ruleBack"))$("#ruleBack").classList.remove("open");};
  document.addEventListener("keydown",e=>{if(e.key==="Escape")$("#ruleBack").classList.remove("open");});
}
function renderComTiles(arr){
  $("#comPicker").innerHTML='<option value="">Choisir un COM</option>'+arr.map(a=>`<option value="${esc(a.k)}" ${a.k===S.selCom?"selected":""}>${esc(a.k)}</option>`).join("");
  $("#comTiles").innerHTML=arr.map(a=>`<button class="com-tile ${S.selCom===a.k?"selected":""}" data-com-tile="${esc(a.k)}"><span class="com-tile-head"><b>${esc(a.k)}</b><span class="pill ${a.avg>=CFG.thHaute?"haute":"ok"}">${a.avg>=CFG.thHaute?"À traiter":"Sous contrôle"}</span></span><strong>${fmtN(a.n)} <small>dossiers</small></strong><span class="com-tile-stats"><span>${Math.round(a.rate*100)}% prioritaires</span><span>${Math.round(a.tArch*100)}% clôturés</span></span><span class="progress"><i style="width:${Math.round(a.tArch*100)}%;background:#12805c"></i></span><span class="com-tile-link">Ouvrir la fiche de pilotage →</span></button>`).join("");
}
function renderComStatus(rows){
  const groups=[{label:"À traiter",color:"#d92d20",test:r=>r.crit==="Critique"||r.crit==="Haute"},{label:"En douane",color:"#2563eb",test:r=>["douane","factDouane","bae"].includes(r.etapeKey)},{label:"En livraison",color:"#e9730c",test:r=>["mise","retour"].includes(r.etapeKey)},{label:"À clôturer",color:"#ca8a04",test:r=>["factInt","validFinal","archivage"].includes(r.etapeKey)},{label:"Archivés",color:"#12805c",test:r=>!!r.dateArchivage}];
  $("#comStatusBoard").innerHTML=groups.map((g,i)=>`<button class="status-tile" data-status="${i}" style="--status-color:${g.color}"><span>${g.label}</span><b>${rows.filter(g.test).length}</b><small>Voir les dossiers →</small></button>`).join("");
  $$("#comStatusBoard [data-status]").forEach(b=>b.onclick=()=>{const com=S.selCom;setF("com",com);$("#fStep").value=["priority","douane","livraison","cloture","archive"][+b.dataset.status];S.pageMain=0;renderMain();goto("dossiers");});
}
/* ---------- Guide d'usage ---------- */
function renderGuide(){
  const el=$("#guideBody"); if(!el) return;
  el.innerHTML=`
  <div class="guide-step"><b>1. Charger l'Excel du jour (1 min).</b> 📤 <i>Charger Excel</i> ou glisser-déposer <code>Dossiers par COM.xlsx</code> (aucune donnée d'exemple : seuls vos dossiers s'affichent). Vérifiez le mapping auto (pastilles vertes), Valider. Intégralité des lignes conservée.</div>
  <div class="guide-step"><b>2. Régler le jour de pilotage.</b> En haut 📅 <code>${esc($("#pilotDate").value||CFG.pilot)}</code> ou boutons <code>Auj.</code> / <code>−1j</code> / <code>+1j</code>, ou dans <b>Administration</b>. Tout (délais ETA/RTA, SLA, alertes, scores) est <b>recalculé instantanément</b>.</div>
  <div class="guide-step"><b>3. Filtrer partout.</b> La barre <b>🔎 Filtres globaux</b> (COM, Métier, <b>Mois/Année ETA</b>, Criticité, <b>Types d'alerte 🚨</b>) s'applique à <b>toutes les vues</b> : pilotage du mois, synthèse, alertes, dossiers, COM, BU. Le sélecteur <b>🚨 Types d'alerte</b> permet de n'afficher qu'<b>un ou plusieurs types</b> (A1…A12, cases à cocher) dans les listes ; vide = tous visibles. Chaque vue garde ses filtres propres en plus (recherche, délais, étapes, tri). <i>Effacer</i> réinitialise tout.</div>
  <div class="guide-step"><b>3bis. Dashboard Pilotage du mois (accueil).</b> Vue simple et claire centrée sur <b>le mois</b> (sélecteur + ← → + <i>Mois du jour J</i>) avec ses propres filtres <b>COM / Métier / Mois / Année / Criticité</b> (synchronisés avec la barre globale) + <b>filtres de dates : mois/année RTA, période ETA du…au…</b> : KPIs du mois, sévérités, COM du mois, étapes bloquantes, top priorités — <b>tout est cliquable</b> (un clic applique les filtres et ouvre la bonne vue).</div>
  <div class="guide-step"><b>3. Lire les indicateurs.</b> Cartes <code>🔴 Critique / 🟠 Haute / 🟡 Moyenne / 🟢 OK</code> en Vue d'ensemble : <b>cliquez</b> pour voir les alertes. Tableau <b>Cas préoccupants</b> : clic = fiche dossier, commentaires surlignés (RFCV, BL, BAE…).</div>
  <div class="guide-step"><b>4. Traiter les alertes.</b> Onglet Alertes → cliquez une carte <code>A1…A12</code> (ex : A6 Blocage BAE), filtrez par COM / Métier / <b>mois-année</b>, ouvrez la fiche : <b>🗓 positionnement dates</b> (chaque jalon situé en J±n sur un axe), timeline, stagnations &gt; SLA, commentaires C1–C5.</div>
  <div class="guide-step"><b>5. Piloter par COM.</b> Performance COM : classement <b>complet</b> + <b>panneau détail</b> (KPIs, criticité, alertes dominantes, volume mensuel <b>complet</b>, <b>délais moyens entre étapes vs SLA</b>, top dossiers). 👁 voir dossiers, ⬇ CSV/XLSX du COM, ✉️ e-mail.</div>
  <div class="guide-step"><b>6. Exporter sans limite.</b> <b>Toutes les listes sont intégrales</b> (COM, métiers, clients, mois, matrice BU) ; seuls les tableaux de dossiers/alertes sont <b>paginés</b> (100 à 1000 lignes/page réglables) pour rester fluides. Exports <code>CSV / XLSX / JSON</code> : volume complet, compteur annoncé, aucune troncature.</div>
  <div class="guide-step"><b>7. Régler les seuils.</b> <b>Administration</b> : SLA par étape, seuils ETA/RTA critiques (défaut ${CFG.etaCrit}j), poids et sévérités A1–A12 (A5 = facture douane, A11 = retour conteneur, A12 = facture prestation), activation on/off, couleurs. 💾 Enregistrer → recalcul immédiat. ↩ Défaut pour réinitialiser.</div>
  <div class="guide-step"><b>8. Rituel quotidien conseillé (10 min).</b> Charger Excel → vérifier date → lire indicateurs → traiter 🔴 puis 🟠 → envoyer situations COM en difficulté → exporter la sélection du jour.</div>
  <div class="footer-note">💡 Astuce : épinglez les dossiers suivis (onglet <b>Épinglés</b>), ajoutez vos notes, puis générez un rapport cadré via 🧭 <b>Rapport</b> (Excel mis en forme ou Word structuré).</div>`;
}

/* ---------- Drawer ---------- */
function openDrawer(i){
  const source=S.enriched.find(x=>x._i===i); if(!source) return;
  if(F.hideArchived&&source.dateArchivage){$("#drawer").classList.remove("open");return;}
  const r={...source,alerts:visibleAlerts(source)}; S.drawerId=i;
  $("#dPin").textContent=S.pins[i]?"★ Épinglé":"☆ Épingler";
  $("#dCrit").innerHTML=`${pill(r.crit)} <span class="pill info">score ${r.score}</span> <span class="pill grey">${esc(r.etape)}</span>`;
  $("#dTitle").textContent="Dossier "+(r.dossier||"—");
  $("#dSub").innerHTML=`${esc(r.com||"—")} • ${esc(r.client||"—")} • ${esc(r.designation||"")} • ETA ${fmtD(r.dateETA)} (${r.delaiETA??"—"}j) • RTA ${fmtD(r.dateRTA)} (${r.delaiRTA??"—"}j)`;
  const stepRow=(l,d,extra)=>{ const done=!!d; const late=extra&&extra.late; return `<div class="t-step ${done?(late?"late-step":"done"):"todo"}"><b>${l}</b><div>${done?fmtD(d)+(extra?.txt?" — "+extra.txt:""):"En attente"}</div></div>`; };
  const invTxt=r.inv.length?`<div class="footer-note">⚠ <b>Inversions :</b> ${esc(r.inv.map(x=>typeof x==="string"?x:x.t).join(" ; "))}<br><small style="color:#64748b">Tolérance saisie : ${CFG.alerts.A3?.days??2}j • facturation anticipée après mise/retour acceptée.</small></div>`:"";
  const stagTxt=r.stagn.length?`<div class="footer-note">⏱ <b>Stagnations &gt; SLA :</b> ${esc(r.stagn.map(s=>s.label+" "+s.jours+"j").join(" • "))}</div>`:"";
  $("#dBody").innerHTML=`
    <div class="chips" style="margin-bottom:8px">${r.alerts.map(a=>`<span class="pill ${ALERT_DEFS[a.c].sev==="Critique"?"crit":ALERT_DEFS[a.c].sev==="Haute"?"haute":"moy"}">${a.c}</span>`).join("")||'<span class="pill ok">Aucune alerte</span>'}</div>
    ${r.alerts.map(a=>`<div style="background:${(alertDef(a.c)?.sev||"Moyenne")==="Critique"?"#fdecec":"#fff7ed"};border:1px solid #f0d9c8;border-radius:10px;padding:8px 10px;margin-bottom:6px"><b>${a.c} — ${esc(alertDef(a.c).t)}</b><br><span style="font-size:12.5px">${esc(a.d)}</span></div>`).join("")}
    ${invTxt}${stagTxt}
    <h4 style="margin:12px 0 4px">🗓 Positionnement dates — jalons situés vs jour J (${fmtD(todayPilot())})</h4>
    ${datePositionHTML(r)}
    <h4 style="margin:12px 0 4px">🧾 Fiche</h4>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12.5px;background:#f8faff;border:1px solid #dfe6f0;border-radius:10px;padding:10px">
      <div><b>COM</b><br>${esc(r.com||"—")}</div><div><b>Auteur</b><br>${esc(r.auteur||"—")}</div>
      <div><b>Métier</b><br>${esc(r.metier||"—")} / ${esc(r.sousMetier||"—")}</div><div><b>Sous-compte</b><br>${esc(r.sousCompte||"—")}</div>
      <div style="grid-column:span 2"><b>Client</b><br>${esc(r.client||"—")}</div>
      <div style="grid-column:span 2"><b>Désignation • Poids</b><br>${esc(r.designation||"—")} • ${esc(r.poids||"—")}</div>
    </div>
    <h4 style="margin:12px 0 4px">💬 Commentaires 1–5 (suite des éléments commentés)</h4>
    <div>${commentBubbles(r, "")}</div>
    <div class="footer-note">💡 Mots-clés surlignés : RFCV, BL, BAE, ETA/RTA, DOUANE, FACTURE, LIVRAISON… Vides signalés pour relance de saisie.</div>
    <h4 style="margin:12px 0 4px">🛤 Timeline process + délais calculés</h4>
    <div class="timeline">
      ${stepRow("ETA (arrivée estimée)",r.dateETA)}${stepRow("RTA (arrivée réelle)",r.dateRTA)}
      ${STEPS.map(s=>stepRow(s.label,r[s.dateKey])).join("")}
    </div>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn small" id="dCom">Filtrer ce COM</button><button class="btn small" id="dDos">Copier n° dossier</button></div>`;
  $("#drawer").classList.add("open");
  $("#dCom").onclick=()=>{ setF("com",r.com||""); goto("dossiers"); $("#drawer").classList.remove("open"); };
  $("#dDos").onclick=()=>{ navigator.clipboard?.writeText(r.dossier||""); toast("N° dossier copié"); };
  $("#dPin").onclick=()=>togglePin(i);
}

/* ---------- Épinglés direction (page dédiée) ---------- */
function pinRows(){
  let arr=baseFiltered().filter(r=>S.pins[r._i]);
  if(S.pinQ){ const q=norm(S.pinQ); arr=arr.filter(r=>norm([r.dossier,r.com,r.client,r.designation,r.metier].join(" ")).includes(q)); }
  if(S.pinSort==="eta") arr=[...arr].sort((a,b)=>(a.delaiETA??9e9)-(b.delaiETA??9e9));
  else if(S.pinSort==="dossier") arr=[...arr].sort((a,b)=>String(a.dossier||"").localeCompare(String(b.dossier||"")));
  else arr=[...arr].sort((a,b)=>b.score-a.score);
  return arr;
}
function renderPins(){
  const cnt=$("#navPinCount"); if(cnt) cnt.textContent=Object.keys(S.pins).length;
  const tb=$("#pinTable tbody"); if(!tb) return;
  const arr=pinRows();
  $("#pinCount").textContent=arr.length+" dossier(s) épinglé(s)";
  tb.innerHTML=arr.map(r=>`<tr data-i="${r._i}" class="${r.crit==="Critique"?"crit":""}" style="cursor:pointer" data-tip="${esc(tipHTML(r))}"><td><input type="checkbox" data-psel="${r._i}" ${S.pinSel.has(r._i)?"checked":""}></td><td><button class="star on" data-star="${r._i}" title="Retirer des épinglés">★</button></td><td><b>${esc(r.dossier||"—")}</b></td><td>${esc(r.com||"—")}</td><td>${esc((r.client||"").slice(0,24))}</td><td>${pill(r.crit)}</td><td>${delayCell(r.delaiETA,r.dateETA)}</td><td><span class="pill ${r.dateArchivage?"ok":"grey"}">${esc(r.etape)}</span></td><td><textarea class="pin-note" data-note="${r._i}" rows="2" placeholder="Note du directeur (reste en local)…">${esc(S.notes[r._i]||"")}</textarea></td><td style="font-size:11.5px;white-space:normal;min-width:180px">${esc((r.comments||"").slice(0,120))||"<span style='color:#94a3b8'>—</span>"}</td></tr>`).join("")||`<tr><td colspan="10"><div class="empty-state"><b>Aucun dossier épinglé</b>Épinglez depuis l'onglet Dossiers (★ dans la ligne) ou la fiche détaillée (☆ Épingler).</div></td></tr>`;
}
function exportXLSXNotes(name,rows){
  const data=rows.map(r=>({"N° dossier":r.dossier,"COM":r.com,"Métier":r.metier,"Client":r.client,"Criticité":r.crit,"Score":r.score,"ETA":fmtD(r.dateETA),"Délai ETA":r.delaiETA,"Étape":r.etape,"Note direction":S.notes[r._i]||"","Alertes":r.alerts.map(a=>a.c+" : "+a.d).join(" | "),"Commentaires":r.comments}));
  const ws=XLSX.utils.json_to_sheet(data); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"Épinglés"); XLSX.writeFile(wb,name); toast(`⬇ <b>${esc(name)}</b> — ${rows.length} dossier(s)`);
}
/* ---------- Cadrage de rapport : périmètre + exports Excel mis en forme / Word structuré ---------- */
let CADRE_LOGO=null;
function badgeLogo(){ const c=document.createElement("canvas"); c.width=240; c.height=64; const x=c.getContext("2d"); x.fillStyle="#12805c"; x.fillRect(0,0,240,64); x.fillStyle="#fff"; x.font="bold 26px Arial"; x.fillText("AGL",20,42); x.font="14px Arial"; x.fillText("SPOT COCKPIT",84,40); return c.toDataURL("image/png"); }
async function preloadLogo(){ try{ const img=new Image(); img.src="assets/agl-logo.png"; await img.decode(); const h=64,w=Math.max(120,Math.round(img.width/img.height*64)); const c=document.createElement("canvas"); c.width=w; c.height=h; c.getContext("2d").drawImage(img,0,0,w,h); CADRE_LOGO=c.toDataURL("image/png"); }catch{ CADRE_LOGO=badgeLogo(); } }
function getLogo(){ return CADRE_LOGO||badgeLogo(); }
function fillCadre(){
  const coms=uniq("com"), mets=uniq("metier"), yms=uniqYM(), yrs=uniqYear();
  $("#cadreCom").innerHTML=coms.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
  $("#cadreMetier").innerHTML='<option value="">Tous</option>'+mets.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join("");
  $("#cadreAlerts").innerHTML=Object.entries(CFG.alerts).filter(([,d])=>d.on!==false&&!d.deleted).map(([k,d])=>`<option value="${k}">${k} — ${esc(d.t)}</option>`).join("");
  $("#cadreMonth").innerHTML='<option value="">Tous</option>'+yms.map(v=>`<option value="${v}">${esc(ymLabel(v))}</option>`).join("");
  $("#cadreYear").innerHTML='<option value="">Toutes</option>'+yrs.map(v=>`<option>${v}</option>`).join("");
  cadreRefresh();
}
function cadreRows(){
  const coms=[...$("#cadreCom").selectedOptions].map(o=>o.value);
  const met=$("#cadreMetier").value, crit=$("#cadreCrit").value;
  const types=[...$("#cadreAlerts").selectedOptions].map(o=>o.value);
  const from=excelToDate($("#cadreFrom").value), to=excelToDate($("#cadreTo").value);
  const ym=$("#cadreMonth").value, yr=$("#cadreYear").value;
  return S.enriched.filter(r=>{
    if(F.hideArchived&&r.dateArchivage) return false;
    if(coms.length&&!coms.includes(String(r.com||"").trim())) return false;
    if(met&&r.metier!==met) return false;
    if(crit&&r.crit!==crit) return false;
    if(ym&&r.etaYM!==ym) return false;
    if(yr&&String(r.etaYear||"")!==yr) return false;
    if(from&&(!r.dateETA||r.dateETA<from)) return false;
    if(to&&(!r.dateETA||r.dateETA>to)) return false;
    if(types.length&&!r.alerts.some(a=>types.includes(a.c))) return false;
    return true;
  }).map(r=>({...r,alerts:visibleAlerts(r).filter(a=>!types.length||types.includes(a.c))}));
}
function cadreRefresh(){ const rows=cadreRows(); $("#cadreInfo").innerHTML=`Périmètre : <b>${fmtN(rows.length)} dossiers</b> • ${rows.reduce((s,r)=>s+r.alerts.length,0)} alertes • ${rows.filter(r=>r.crit==="Critique").length} critiques • pilotage du ${fmtD(todayPilot())}`; }
function cadreBody(rows){
  const title=$("#cadreTitle").value||"Rapport de pilotage SPOT";
  const n=rows.length||1;
  const crit=rows.filter(r=>r.crit==="Critique").length, haute=rows.filter(r=>r.crit==="Haute").length, moy=rows.filter(r=>r.crit==="Moyenne").length, ok=rows.filter(r=>r.crit==="OK").length;
  const bae=rows.filter(r=>r.dateBAE).length, arch=rows.filter(r=>r.dateArchivage).length;
  const byCom={}; rows.forEach(r=>{ const k=r.com||"(vide)"; (byCom[k]=byCom[k]||{n:0,sc:0,ch:0}); byCom[k].n++; byCom[k].sc+=r.score; byCom[k].ch+=(r.crit==="Critique"||r.crit==="Haute")?1:0; });
  const top=[...rows].sort((a,b)=>b.score-a.score).slice(0,15);
  const alerts=[]; rows.forEach(r=>r.alerts.forEach(a=>alerts.push({r,a})));
  const kpis=[["Dossiers du périmètre",rows.length],["Critiques / Hautes",crit+" / "+haute],["Moyennes / OK",moy+" / "+ok],["Taux BAE",Math.round(bae/n*100)+"%"],["Taux archivé",Math.round(arch/n*100)+"%"],["Alertes",alerts.length]];
  const comTable=`<table border="1" cellspacing="0" cellpadding="4"><tr><th>COM</th><th>Dossiers</th><th>% Crit+Haute</th><th>Score moyen</th></tr>${Object.entries(byCom).sort((a,b)=>b[1].sc/b[1].n-a[1].sc/a[1].n).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${v.n}</td><td>${Math.round(v.ch/v.n*100)}%</td><td>${(v.sc/v.n).toFixed(1)}</td></tr>`).join("")||"<tr><td colspan=4>—</td></tr>"}</table>`;
  const topTable=`<table border="1" cellspacing="0" cellpadding="4"><tr><th>Score</th><th>N° dossier</th><th>COM</th><th>Client</th><th>ETA</th><th>Délai</th><th>Étape</th><th>Alertes</th></tr>${top.map(r=>`<tr><td><b>${r.score}</b></td><td>${esc(r.dossier||"—")}</td><td>${esc(r.com||"—")}</td><td>${esc(r.client||"—")}</td><td>${fmtD(r.dateETA)}</td><td>${r.delaiETA??"—"}</td><td>${esc(r.etape)}</td><td>${r.alerts.map(a=>a.c).join(" ")}</td></tr>`).join("")||"<tr><td colspan=8>—</td></tr>"}</table>`;
  const alTable=`<table border="1" cellspacing="0" cellpadding="4"><tr><th>Alerte</th><th>Type</th><th>Détail</th><th>N° dossier</th><th>COM</th><th>Client</th><th>ETA</th></tr>${alerts.map(({r,a})=>`<tr><td><b>${a.c}</b></td><td>${esc(alertDef(a.c).t)}</td><td>${esc(a.d)}</td><td>${esc(r.dossier||"—")}</td><td>${esc(r.com||"—")}</td><td>${esc(r.client||"—")}</td><td>${fmtD(r.dateETA)}</td></tr>`).join("")||"<tr><td colspan=7>—</td></tr>"}</table>`;
  const pins=rows.filter(r=>S.pins[r._i]);
  const pinTable=`<table border="1" cellspacing="0" cellpadding="4"><tr><th>N° dossier</th><th>COM</th><th>Client</th><th>ETA</th><th>Étape</th><th>Note direction</th></tr>${pins.map(r=>`<tr><td>${esc(r.dossier||"—")}</td><td>${esc(r.com||"—")}</td><td>${esc(r.client||"—")}</td><td>${fmtD(r.dateETA)}</td><td>${esc(r.etape)}</td><td>${esc(S.notes[r._i]||"—")}</td></tr>`).join("")||"<tr><td colspan=6>Aucun dossier épinglé dans ce périmètre</td></tr>"}</table>`;
  const comsSel=[...$("#cadreCom").selectedOptions].map(o=>esc(o.value)).join(", ");
  return `<h1>${esc(title)}</h1><p class="meta">Généré le ${new Date().toLocaleDateString("fr-FR")} • pilotage du ${fmtD(todayPilot())} • ${fmtN(rows.length)} dossiers${comsSel?" • COM : "+comsSel:""}</p>
  <h2>1. Synthèse</h2><table border="1" cellspacing="0" cellpadding="4">${kpis.map(k=>`<tr><th>${k[0]}</th><td>${k[1]}</td></tr>`).join("")}</table>
  <h2>2. Répartition par criticité</h2><table border="1" cellspacing="0" cellpadding="4"><tr><th>Critique</th><th>Haute</th><th>Moyenne</th><th>OK</th></tr><tr><td>${crit}</td><td>${haute}</td><td>${moy}</td><td>${ok}</td></tr></table>
  <h2>3. Par COM</h2>${comTable}
  <h2>4. Dossiers prioritaires (top 15)</h2>${topTable}
  <h2>5. Alertes détaillées (${alerts.length})</h2>${alTable}
  <h2>6. Dossiers épinglés (${pins.length})</h2>${pinTable}`;
}
function cadreExportXls(){
  const rows=cadreRows(); if(!rows.length){ toast("Périmètre vide — élargissez le cadrage"); return; }
  const html=`<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><style>h1{font:700 20px Calibri;color:#0f2a52}h2{font:700 14px Calibri;color:#12805c;margin:14px 0 6px}table{border-collapse:collapse;font:11px Calibri}th{background:#0f2a52;color:#fff;border:1px solid #94a3b8;padding:4px 8px;text-align:left}td{border:1px solid #cbd5e1;padding:3px 7px}.meta{font:11px Calibri;color:#475569}</style></head><body><table><tr><td><img src="${getLogo()}" width="120"></td></tr></table>${cadreBody(rows)}</body></html>`;
  download(`spot_rapport_cadre_${new Date().toISOString().slice(0,10)}.xls`,html,"application/vnd.ms-excel");
  toast("⬇ Rapport Excel mis en forme téléchargé");
}
function cadreExportWord(){
  const rows=cadreRows(); if(!rows.length){ toast("Périmètre vide — élargissez le cadrage"); return; }
  const html=`<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>body{font-family:Calibri,Arial;font-size:12px}h1{color:#0f2a52;font-size:22px;margin:0 0 4px}h2{color:#12805c;font-size:15px;border-bottom:2px solid #12805c;padding-bottom:3px;margin:18px 0 8px}table{border-collapse:collapse;width:100%;font-size:10.5px}th{background:#0f2a52;color:#fff;border:1px solid #64748b;padding:5px 8px;text-align:left}td{border:1px solid #cbd5e1;padding:4px 7px;vertical-align:top}.meta{color:#475569;font-size:11px}</style></head><body><p><img src="${getLogo()}" width="110"></p>${cadreBody(rows)}</body></html>`;
  download(`spot_rapport_cadre_${new Date().toISOString().slice(0,10)}.doc`,html,"application/msword");
  toast("⬇ Rapport Word structuré téléchargé");
}
function openCadre(){ if(!S.enriched.length){ toast("Chargez d'abord l'Excel du jour"); return; } fillCadre(); $("#cadrePreview").style.display="none"; $("#cadreBack").classList.add("open"); }
/* ---------- Navigation ---------- */
function goto(v){
  S.activeView=v;
  setSelect($("#mobileNav"),v);
  $$(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===v));
  $$(".view").forEach(s=>s.classList.toggle("active",s.id==="view-"+v));
  $("#viewTitle").textContent={overview:"Vue d'ensemble",pilotage:"Pilotage du mois — dossiers du mois",alertes:"Alertes",overdue:"Overdue — Hinterland",dossiers:"Dossiers",epingles:"Dossiers épinglés",evolution:"Évolution mensuelle",perfs:"Performance COM",bu:"Vision BU / Section",admin:"Administration",guide:"Guide d'usage",methodo:"Méthodologie"}[v]||v;
  window.scrollTo({top:0,behavior:"smooth"});
}

/* ---------- Import ---------- */
function showMapping(headers,sampleRows,done){
  const auto=autoMap(headers);
  const tb=$("#mapTable tbody");
  tb.innerHTML=FIELDS.map(f=>{const m=auto[f.k];return `<tr><td><b>${f.label}</b><br><small style="color:#64748b">${f.k}</small></td><td><select data-k="${f.k}" style="width:100%;border:1px solid #dfe6f0;border-radius:8px;padding:7px"><option value="">— ignorer —</option>${headers.map(h=>`<option ${h===m.col?"selected":""}>${esc(h)}</option>`).join("")}</select></td><td><span class="conf ${m.conf}">${m.conf==="high"?"✓ haute":m.conf==="mid"?"~ moyenne":"? faible"}</span></td></tr>`;}).join("");
  $("#mapBack").classList.add("open");
  $("#mapClose").onclick=$("#mapCancel").onclick=()=>{ $("#mapBack").classList.remove("open"); setImportState(S.enriched.length?"loaded":"empty",S.fileName||"Import annulé — choisissez un fichier"); };
  $("#mapValid").onclick=()=>{
    const mapping={}; $$("#mapTable select").forEach(s=>{mapping[s.dataset.k]={col:s.value,conf:"high",score:100};});
    $("#mapBack").classList.remove("open");
    const run=done; $("#mapValid").onclick=null; done=null; // libère le tableau source (gros volumes)
    run(mapping);
  };
}
async function ingest(headers, body, fileName){
  setImportState("loading",`Vérifiez les colonnes · ${fmtN(body.length)} lignes`);
  showMapping(headers, body.slice(0,5), async mapping=>{
    S.headers=headers; S.mapping=mapping; S.fileName=fileName;
    try{ localStorage.setItem("spot_mapping",JSON.stringify(mapping)); localStorage.setItem("spot_file",fileName); }catch{}
    const t0=performance.now();
    // mapping puis analyse par blocs : tout est chargé, sans figer l'interface, sans limite de lignes
    const mapped=await applyMappingAsync(headers, body, mapping, (d,t)=>setImportState("loading",`Lecture des lignes : ${fmtN(d)} / ${fmtN(t)}…`));
    S.rows=mapped;
    S.enriched=await enrichAllAsync(mapped, (d,t)=>setImportState("loading",`Analyse des alertes : ${fmtN(d)} / ${fmtN(t)}…`));
    S.pilMonth=F.month;
    fillSelects(); S.pageMain=0; S.pageAlert=0; renderAll(); renderMethodo(); renderGuide(); renderAdmin();
    setImportState("loaded",fileName);
    try{ setImportState("loading","Sauvegarde locale…"); await IDB.put("dossiers",{fileName,rows:mapped}); setImportState("loaded",fileName); }
    catch{ setImportState("loaded",fileName); toast("⚠️ Volume important : données conservées pour cette session (sauvegarde locale saturée)."); }
    toast(`✅ <b>${fmtN(S.enriched.length)} dossiers</b> analysés en ${((performance.now()-t0)/1000).toFixed(1)}s — ${S.enriched.reduce((s,r)=>s+r.alerts.length,0)} alertes, ${S.enriched.filter(r=>r.crit==="Critique").length} critiques.`);
  });
}
function readFile(f){
  if(!f) return;
  setImportState("loading",`Lecture de ${f.name}…`);
  const rd=new FileReader();
  rd.onprogress=e=>{ if(e.lengthComputable) setImportState("loading",`Lecture de ${f.name}… ${Math.round(e.loaded/e.total*100)}%`); };
  rd.onload=e=>{
    (async()=>{
      try{
        await new Promise(r=>setTimeout(r)); // laisse afficher l'état de lecture
        let wb;
        try{ wb=XLSX.read(e.target.result,{type:"array",cellDates:true,dense:true}); }
        catch{ wb=XLSX.read(e.target.result,{type:"array",cellDates:true}); }
        setImportState("loading",`Décodage des lignes de ${f.name}…`);
        await new Promise(r=>setTimeout(r));
        const ws=wb.Sheets[wb.SheetNames[0]];
        const arr=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:""});
        if(arr.length<2){ setImportState("error","Le fichier ne contient aucun dossier"); toast("❌ Fichier vide"); return; }
        const headers=arr[0].map(h=>String(h||"").trim());
        ingest(headers, arr.slice(1).filter(r=>r.some(c=>String(c).trim()!=="")), f.name);
      }catch(err){ console.error(err); setImportState("error","Vérifiez le format du fichier, puis réessayez"); toast("❌ Erreur lecture : "+esc(err.message)); }
    })();
  };
  rd.onerror=()=>setImportState("error","Impossible de lire le fichier — réessayez");
  rd.readAsArrayBuffer(f);
}
function csvLine(r){
  const q=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  return [r.crit,r.score,r.dossier,r.com,r.metier,r.sousMetier,r.client,r.sousCompte,r.designation,fmtD(r.dateETA),r.delaiETA,fmtD(r.dateRTA),r.delaiRTA,r.etape,r.alerts.map(a=>a.c+":"+a.d).join(" | "),r.comments,fmtD(r.dateValidation),fmtD(r.dateDocs),fmtD(r.dateNote),fmtD(r.dateEnreg),fmtD(r.dateFactDouane),fmtD(r.dateBAE),fmtD(r.dateMise),fmtD(r.dateRetour),fmtD(r.dateFactInt),fmtD(r.dateValidFinal),fmtD(r.dateArchivage)].map(q).join(";");
}
/* Export sans plafond : lignes découpées en blocs assemblés en Blob (aucune limite de volume) */
function toCSVParts(rows){
  const parts=["﻿crit;score;dossier;com;metier;sousMetier;client;sousCompte;designation;eta;delaiETA;rta;delaiRTA;etape;alertes;commentaires;validation;docs;note;enreg;factDouane;bae;mise;retour;factInt;validFinal;archivage\n"];
  const blk=[];
  for(let j=0;j<rows.length;j++){
    blk.push(csvLine(rows[j])+"\n");
    if(blk.length>=5000){ parts.push(blk.join("")); blk.length=0; }
  }
  if(blk.length) parts.push(blk.join(""));
  return parts;
}
function toCSV(rows){ return toCSVParts(rows).join(""); }
function download(name,content,type){ const b=new Blob(Array.isArray(content)?content:[content],{type}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),4000); }
function exportXLSX(name, rows){
  try{
    const data=rows.map(r=>({"Criticité":r.crit,"Score":r.score,"N° dossier":r.dossier,"COM":r.com,"Métier":r.metier,"Sous-métier":r.sousMetier,"Client":r.client,"Sous-compte":r.sousCompte,"Désignation":r.designation,"ETA":fmtD(r.dateETA),"Délai ETA":r.delaiETA,"RTA":fmtD(r.dateRTA),"Délai RTA":r.delaiRTA,"Étape":r.etape,"Alertes":r.alerts.map(a=>a.c+" : "+a.d).join(" | "),"Commentaires":r.comments,"Validation":fmtD(r.dateValidation),"Docs complets":fmtD(r.dateDocs),"Note détail":fmtD(r.dateNote),"Enreg. douane":fmtD(r.dateEnreg),"Facture douane":fmtD(r.dateFactDouane),"BAE":fmtD(r.dateBAE),"Mise livraison":fmtD(r.dateMise),"Retour":fmtD(r.dateRetour),"Fact. intervention":fmtD(r.dateFactInt),"Validation finale":fmtD(r.dateValidFinal),"Archivage":fmtD(r.dateArchivage)}));
    const ws=XLSX.utils.json_to_sheet(data);
    ws["!cols"]=[{wch:10},{wch:7},{wch:14},{wch:14},{wch:8},{wch:10},{wch:28},{wch:12},{wch:24},{wch:12},{wch:9},{wch:12},{wch:9},{wch:22},{wch:50},{wch:50},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:14},{wch:14},{wch:12}];
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"SPOT");
    XLSX.writeFile(wb,name);
    toast(`⬇ <b>${esc(name)}</b> — export intégral : <b>${fmtN(rows.length)} lignes</b>, aucune troncature`);
  }catch(e){ console.error(e); toast("❌ Export XLSX impossible : "+e.message); }
}
/* ---------- E-mail situation par COM (100% local via messagerie) ---------- */
let MAIL_COM="";
function buildComReport(com){
  const P=todayPilot();
  const rows=baseFiltered().filter(r=>r.com===com);
  const crit=rows.filter(r=>r.crit==="Critique"), haute=rows.filter(r=>r.crit==="Haute");
  const etaLate=rows.filter(r=>r.delaiETA!=null&&r.delaiETA<0&&!r.dateBAE);
  const top=[...rows].sort((a,b)=>b.score-a.score).slice(0,8);
  const subj=`SPOT ${fmtD(P)} — Situation ${com} : ${rows.length} dossiers (${crit.length} critiques, ${haute.length} hautes)`;
  const lines=[
    `Bonjour,`,``,
    `Situation SPOT au ${fmtD(P)} — COM ${com} :`,``,
    `• Dossiers suivis : ${rows.length}  |  Critiques : ${crit.length}  |  Hautes : ${haute.length}  |  ETA dépassée sans BAE : ${etaLate.length}`,
    `• Taux BAE : ${rows.length?Math.round(rows.filter(r=>r.dateBAE).length/rows.length*100):0}%  |  Taux archivé : ${rows.length?Math.round(rows.filter(r=>r.dateArchivage).length/rows.length*100):0}%`,
    ``,`CAS PRÉOCCUPANTS (à traiter en priorité) :`,
    ...top.map((r,i)=>`${i+1}. Dos ${r.dossier||"—"} — ${r.client||"—"} — score ${r.score} (${r.crit}) — ETA ${fmtD(r.dateETA)} (${r.delaiETA??"—"}j) — ${r.etape} — Alertes : ${r.alerts.map(a=>a.c).join(", ")||"—"}`),
    ``,`DÉTAIL PAR DOSSIER (extraits commentaires) :`,
    ...top.map(r=>`— ${r.dossier||"—"} : ${(r.comments||"sans commentaire").slice(0,180)}`),
    ``,`Fichier : ${S.fileName||"—"} — Seuils en vigueur : Critique ≥ ${CFG.thCrit}, Haute ≥ ${CFG.thHaute} (réglables dans Administration).`,
    `CSV détaillé du COM en pièce jointe (à joindre depuis le téléchargement).`,``,`Cordialement,`,`SPOT Cockpit AGL`
  ];
  return {subj, body:lines.join("\n"), rows};
}
function openMailModal(com){
  MAIL_COM=com;
  const {subj,body}=buildComReport(com);
  $("#mailSubject").value=subj; $("#mailBody").value=body; $("#mailTo").value="";
  $("#mailBack").classList.add("open");
}

/* Éjecte le fichier chargé : décharge le dataset, prêt pour un nouvel import.
   1 clic sans confirmation (le fichier source reste rechargeable).
   Purge : mémoire, IndexedDB, nom de fichier, épingles/notes (indexées par ligne, donc caduques).
   Conserve : mapping, réglages, seuils, snapshots, préférences. */
async function ejectFile(){
  if(!S.enriched.length){ toast("Aucun fichier chargé"); return; }
  S.rows=[]; S.enriched=[]; S.fileName=""; S.mapping=null; S.headers=[];
  S.pins={}; S.notes={}; S.pinSel=new Set(); savePins(); saveNotes();
  try{ await IDB.del("dossiers"); }catch{}
  try{ localStorage.removeItem("spot_file"); }catch{}
  const dr=$("#drawer"); if(dr) dr.classList.remove("open"); S.drawerId=undefined;
  S.pageMain=0; S.pageAlert=0; S.ovPage=0;
  clearAllFilters(); fillSelects(); renderAll(); setImportState("empty");
  toast("⏏ Fichier éjecté — épingles et notes effacées, réglages conservés.");
}

/* ---------- Init ---------- */
async function init(){
  loadCfg(); loadOverdue(); loadOvRefDate(); applySevColors();
  if(CFG.pilot) $("#pilotDate").value=CFG.pilot;
  renderMethodo(); renderGuide(); renderAdmin();
  $$(".nav-btn").forEach(b=>b.onclick=()=>goto(b.dataset.view));
  $$("[data-goto]").forEach(b=>b.onclick=()=>goto(b.dataset.goto));
  $("#dClose").onclick=()=>$("#drawer").classList.remove("open");
  const setPilot=d=>{ $("#pilotDate").value=d; CFG.pilot=d; saveCfg(); if(S.rows.length){ S.enriched=enrichAll(S.rows); renderAll(); } renderMethodo(); renderGuide(); renderAdmin(); toast("📅 Pilotage au <b>"+fmtD(todayPilot())+"</b> — tout recalculé"); };
  const iso=d=>d.toISOString().slice(0,10);
  $("#pilotDate").onchange=e=>setPilot(e.target.value);
  $("#btnToday").onclick=()=>{ const d=new Date(); setPilot(iso(d)); };
  $("#btnMinus1").onclick=()=>{ const d=todayPilot(); d.setDate(d.getDate()-1); setPilot(iso(d)); };
  $("#btnPlus1").onclick=()=>{ const d=todayPilot(); d.setDate(d.getDate()+1); setPilot(iso(d)); };
  // admin
  $("#cfgSave").onclick=()=>{try{collectAdmin();CFG=SpotSettings.validate(CFG,DEFAULT_CFG);applyCfgAndRerender("Réglages enregistrés · alertes recalculées");}catch(err){toast(esc(err.message));}};
  $("#cfgReset").onclick=()=>{ if(!confirm("Réinitialiser tous les réglages ?"))return; CFG=JSON.parse(JSON.stringify(DEFAULT_CFG)); OVERDUE=JSON.parse(JSON.stringify(OVERDUE_DEFAULT)); saveOverdue(); S.ovRefDate=OV_REF_DEFAULT; saveOvRefDate(); applyCfgAndRerender("↩ Réglages par défaut restaurés"); };
  $("#cfgToday").onclick=()=>{ $("#cfgPilot").value=iso(new Date()); };
  $("#cfgReport").onclick=()=>{ $("#cfgPilot").value="2026-09-28"; };
  $("#guidePrint").onclick=()=>window.print();
  // overdue : date de référence manuelle (écart recalculé par le système)
  const ovRefDateEl=$("#ovRefDate"); if(ovRefDateEl) ovRefDateEl.onchange=e=>{ S.ovRefDate=e.target.value; saveOvRefDate(); S.ovPage=0; renderOverdue(); toast(`📏 Référence de mesure : <b>${esc(ovRefLabel())}</b> — écart recalculé`); };
  $$("[data-refdate]").forEach(b=>b.onclick=()=>{ S.ovRefDate=b.dataset.refdate; saveOvRefDate(); S.ovPage=0; renderOverdue(); toast(`📏 Référence de mesure : <b>${esc(ovRefLabel())}</b>`); });
  const ovComEl=$("#ovCom"); if(ovComEl) ovComEl.onchange=e=>{ S.ovCom=e.target.value; S.ovPage=0; renderOverdue(); };
  const ovClientEl=$("#ovClient"); if(ovClientEl) ovClientEl.onchange=e=>{ S.ovClient=e.target.value; S.ovPage=0; renderOverdue(); };
  const ovQ=$("#ovSearch"); if(ovQ) ovQ.addEventListener("input",e=>{ S.ovQ=e.target.value; S.ovPage=0; renderOverdue(); });
  const ovCat=$("#ovCat"); if(ovCat) ovCat.onchange=e=>{ S.ovCat=e.target.value; S.ovPage=0; renderOverdue(); };
  const ovSev=$("#ovSev"); if(ovSev) ovSev.onchange=e=>{ S.ovSev=e.target.value; S.ovPage=0; renderOverdue(); };
  const ovMinAge=$("#ovMinAge"); if(ovMinAge) ovMinAge.addEventListener("input",e=>{ S.ovMinAge=e.target.value; S.ovPage=0; renderOverdue(); });
  const ovEta1=$("#ovEta1"); if(ovEta1) ovEta1.onchange=e=>{ S.ovEta1=e.target.value; S.ovPage=0; renderOverdue(); };
  const ovEta2=$("#ovEta2"); if(ovEta2) ovEta2.onchange=e=>{ S.ovEta2=e.target.value; S.ovPage=0; renderOverdue(); };
  const ovSort=$("#ovSort"); if(ovSort) ovSort.onchange=e=>{ S.ovSort=e.target.value; S.ovPage=0; renderOverdue(); };
  const ovClear=$("#ovClear"); if(ovClear) ovClear.onclick=()=>{ S.ovCom=""; S.ovClient=""; S.ovQ=""; S.ovCat=""; S.ovSev=""; S.ovMinAge=""; S.ovEta1=""; S.ovEta2=""; S.ovSort="age"; S.ovPage=0; const q=$("#ovSearch"); if(q) q.value=""; const m=$("#ovMinAge"); if(m) m.value=""; const a=$("#ovEta1"); if(a) a.value=""; const b=$("#ovEta2"); if(b) b.value=""; renderOverdue(); toast("Filtres Overdue réinitialisés"); };
  const ovPrev=$("#ovPrev"); if(ovPrev) ovPrev.onclick=()=>{ S.ovPage=Math.max(0,S.ovPage-1); renderOverdue(); };
  const ovNext=$("#ovNext"); if(ovNext) ovNext.onclick=()=>{ S.ovPage++; renderOverdue(); };
  const ovExp=$("#ovExport"); if(ovExp) ovExp.onclick=()=>{ const r=overdueFiltered(); download("spot_overdue.csv",[overdueToCSV(r)],"text/csv"); toast(`⬇ Overdue exporté : <b>${fmtN(r.length)} dossiers</b>`); };
  const ovExpX=$("#ovExportX"); if(ovExpX) ovExpX.onclick=()=>{ const r=overdueFiltered(); exportXLSX("spot_overdue.xlsx",r.map(x=>({...x.r,overdueCat:x.o.c,overdueMiss:x.o.miss,overdueAge:x.o.age}))); };
  // dashboard pilotage du mois
  $("#pilMonth").onchange=e=>setF("month",e.target.value);
  $("#pilPrev").onclick=()=>setF("month",ymShift(S.pilMonth||pilotYM(),-1));
  $("#pilNext").onclick=()=>setF("month",ymShift(S.pilMonth||pilotYM(),1));
  $("#pilJ").onclick=()=>{ setF("month",pilotYM()); toast("📅 Mois du jour J : <b>"+ymLabel(S.pilMonth)+"</b>"); };
  // filtres du dashboard (miroirs globaux + dates)
  ["pCom","pMetier","pCrit","pMonth","pYear","pRtaMonth","pRtaYear"].forEach(id=>{const el=document.getElementById(id); if(el) el.addEventListener("change",()=>{ const k={pCom:"com",pMetier:"metier",pCrit:"crit",pMonth:"month",pYear:"year",pRtaMonth:"rtaMonth",pRtaYear:"rtaYear"}[id]; setF(k,el.value); });});
  ["pFrom","pTo"].forEach(id=>{const el=document.getElementById(id); if(el) el.addEventListener("change",()=>{ F.dFrom=$("#pFrom").value; F.dTo=$("#pTo").value; S.pageMain=0; S.pageAlert=0; renderAll(); });});
  $("#pClearF").onclick=()=>{ clearAllFilters(); toast("Filtres réinitialisés"); };
  setupSettings();
  $("#mobileNav").onchange=e=>goto(e.target.value);
  const priorityOption=document.createElement("option");priorityOption.value="priority";priorityOption.textContent="À traiter (Critique + Haute)";$("#fStep").appendChild(priorityOption);
  const selectCom=com=>{S.selCom=com;renderPerfs();$("#comDetailName").scrollIntoView({behavior:"smooth",block:"center"});};
  $("#comPicker").onchange=e=>selectCom(e.target.value);
  $("#comTiles").onclick=e=>{const tile=e.target.closest("[data-com-tile]");if(tile)selectCom(tile.dataset.comTile);};
  loadLocal(); loadPrefs();
  // épinglés
  $("#mainTable").addEventListener("click",e=>{ const st=e.target.closest("[data-star]"); if(st){ e.stopPropagation(); togglePin(+st.dataset.star); } },true);
  $("#pinTable").addEventListener("click",e=>{
    const st=e.target.closest("[data-star]"); if(st){ e.stopPropagation(); togglePin(+st.dataset.star); return; }
    if(e.target.closest("textarea,input")) return;
    const row=e.target.closest("tr[data-i]"); if(row) openDrawer(+row.dataset.i);
  },true);
  $("#pinTable").addEventListener("change",e=>{
    const nt=e.target.closest("[data-note]"); if(nt){ S.notes[+nt.dataset.note]=nt.value; saveNotes(); toast("📝 Note direction enregistrée"); return; }
    const cb=e.target.closest("[data-psel]"); if(cb){ if(cb.checked) S.pinSel.add(+cb.dataset.psel); else S.pinSel.delete(+cb.dataset.psel); }
  });
  $("#pinSearch").addEventListener("input",e=>{ S.pinQ=e.target.value; renderPins(); });
  $("#pinSort").addEventListener("change",e=>{ S.pinSort=e.target.value; renderPins(); });
  $("#pinExportSel").onclick=()=>{ const sel=pinRows().filter(r=>S.pinSel.has(r._i)); if(!sel.length){ toast("Cochez d'abord des dossiers"); return; } exportXLSXNotes("spot_epingles_selection.xlsx",sel); };
  $("#pinExportAll").onclick=()=>{ const arr=pinRows(); if(!arr.length){ toast("Aucun épinglé"); return; } exportXLSXNotes("spot_epingles.xlsx",arr); };
  $("#pinClearSel").onclick=()=>{ S.pinSel.clear(); renderPins(); };
  // cadrage rapport
  preloadLogo();
  $("#btnCadre").onclick=openCadre;
  $("#cadreClose").onclick=()=>$("#cadreBack").classList.remove("open");
  $("#cadreLogoBtn").onclick=()=>$("#cadreLogo").click();
  $("#cadreLogo").addEventListener("change",e=>{ const f=e.target.files[0]; if(!f) return; const rd=new FileReader(); rd.onload=()=>{ CADRE_LOGO=rd.result; $("#cadreLogoName").textContent=f.name; toast("🖼 Logo du rapport mis à jour"); }; rd.readAsDataURL(f); });
  ["cadreCom","cadreMetier","cadreAlerts","cadreCrit","cadreFrom","cadreTo","cadreMonth","cadreYear"].forEach(id=>$("#"+id).addEventListener("change",cadreRefresh));
  $("#cadreApercu").onclick=()=>{ const rows=cadreRows(); const pv=$("#cadrePreview"); pv.style.display="block"; pv.innerHTML=`<p><img src="${getLogo()}" width="110"></p>`+cadreBody(rows); };
  $("#cadreXlsx").onclick=()=>{ const rows=cadreRows(); if(!rows.length){ toast("Périmètre vide"); return; } exportXLSX(`spot_rapport_cadre_${new Date().toISOString().slice(0,10)}.xlsx`,rows); };
  $("#cadreXls").onclick=cadreExportXls;
  $("#cadreWord").onclick=cadreExportWord;
  // infobulle commentaires (toutes les listes)
  const tip=$("#tip"); let tipCur=null;
  document.addEventListener("mouseover",e=>{ const t=e.target.closest?e.target.closest("[data-tip]"):null; if(!t||t===tipCur) return; tipCur=t; tip.innerHTML=t.dataset.tip; tip.style.display="block"; const r=t.getBoundingClientRect(); const w=Math.min(440,innerWidth-24); let x=Math.max(8,Math.min(r.left,innerWidth-w-8)); let y=r.bottom+8; const h=Math.min(280,tip.offsetHeight||200); if(y+h>innerHeight-8) y=Math.max(8,r.top-8-h); tip.style.left=x+"px"; tip.style.top=y+"px"; });
  document.addEventListener("mouseout",e=>{ const t=e.target.closest?e.target.closest("[data-tip]"):null; if(t&&(!e.relatedTarget||!t.contains(e.relatedTarget))){ tip.style.display="none"; tipCur=null; } });
  window.addEventListener("scroll",()=>{ tip.style.display="none"; tipCur=null; },true);
  // mail modal
  $("#mailClose").onclick=()=>$("#mailBack").classList.remove("open");
  $("#mailCopy").onclick=()=>{ navigator.clipboard?.writeText($("#mailBody").value); toast("📋 Corps de l'e-mail copié"); };
  $("#mailCsv").onclick=()=>{ download(`spot_situation_${MAIL_COM}.csv`,toCSVParts(baseFiltered().filter(r=>r.com===MAIL_COM)),"text/csv"); };
  $("#mailOpen").onclick=()=>{ const to=$("#mailTo").value.trim(), su=$("#mailSubject").value, bo=$("#mailBody").value; window.location.href=`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(su)}&body=${encodeURIComponent(bo)}`; toast("📧 Messagerie ouverte — joignez le CSV du COM"); };
  ["fCom","fMetier","fSous","fClient","fSousCpte","fCrit","fDelay","fEta1","fEta2","fStep","fMonth","fYear"].forEach(id=>{const el=document.getElementById(id); if(el) el.addEventListener("change",()=>{
    if(["fCom","fMetier","fCrit","fMonth","fYear"].includes(id)){ setF({fCom:"com",fMetier:"metier",fCrit:"crit",fMonth:"month",fYear:"year"}[id],el.value); return; }
    S.pageMain=0; renderAll();
  });});
  ["gCom","gMetier","gCrit","gMonth","gYear"].forEach(id=>{const el=document.getElementById(id); if(el) el.addEventListener("change",()=>{ const k={gCom:"com",gMetier:"metier",gCrit:"crit",gMonth:"month",gYear:"year"}[id]; setF(k,el.value); });});
  $("#gClear").onclick=()=>{ clearAllFilters(); toast("Filtres réinitialisés"); };
  $("#gHideArchived").onchange=e=>{ F.hideArchived=e.target.checked; savePrefs(); S.pageMain=0; S.pageAlert=0; renderAll(); toast(F.hideArchived?"📦 Dossiers archivés masqués (toutes les vues)":"📦 Dossiers archivés affichés"); };
  $("#gCommentBadge").onchange=e=>{ S.prefs.commentBadge=e.target.checked; savePrefs(); renderCommentBadges(); toast(S.prefs.commentBadge?"💬 Pastille commentaires activée":"💬 Pastille commentaires désactivée"); };
  // multi-sélecteur types d'alerte (toutes pages)
  $("#gAlertBtn").onclick=e=>{ e.stopPropagation(); $("#gAlertPanel").classList.toggle("open"); };
  document.addEventListener("click",e=>{ const w=$("#gAlertWrap"); if(w&&!w.contains(e.target)) $("#gAlertPanel").classList.remove("open"); const wc=$("#gClientWrap"); if(wc&&!wc.contains(e.target)) $("#gClientPanel").classList.remove("open"); });
  // multi-sélecteur clients (toutes pages) avec recherche
  $("#gClientBtn").onclick=e=>{ e.stopPropagation(); const p=$("#gClientPanel"); const open=!p.classList.contains("open"); if(open) renderClientPanel(); p.classList.toggle("open",open); };
  $("#clientSearch").addEventListener("change",e=>{ S.selClient=e.target.value.trim(); e.target.blur(); renderClientDetail(); });
  $("#gAlertPanel").addEventListener("change",e=>{
    const cb=e.target.closest?e.target.closest("input[data-at]"):null; if(!cb) return;
    const k=cb.dataset.at;
    if(cb.checked){ if(!F.alertTypes.includes(k)) F.alertTypes.push(k); }
    else { F.alertTypes=F.alertTypes.filter(x=>x!==k); }
    if(S.alertFilter&&!F.alertTypes.includes(S.alertFilter)) S.alertFilter=null;
    S.pageMain=0; S.pageAlert=0; renderAll();
  });
  $("#gAlertPanel").addEventListener("click",e=>{
    if(e.target.id==="msAll"){ F.alertTypes=[]; S.pageMain=0; S.pageAlert=0; renderAll(); }
    if(e.target.id==="msInv"){ const all=Object.keys(CFG.alerts).filter(k=>CFG.alerts[k]?.on!==false&&!CFG.alerts[k]?.deleted); F.alertTypes=all.filter(k=>!F.alertTypes.includes(k));S.alertFilter=null; S.pageMain=0; S.pageAlert=0; renderAll(); }
  });
  $("#fSearch").addEventListener("input",()=>{S.pageMain=0;renderMain();});
  $("#alertSearch").addEventListener("input",()=>{S.pageAlert=0;renderAlertTable();});
  ["alertCom","alertMetier","alertMonth","alertYear"].forEach(id=>{const el=document.getElementById(id); if(el) el.addEventListener("change",()=>setF({alertCom:"com",alertMetier:"metier",alertMonth:"month",alertYear:"year"}[id],el.value));});
  $("#alertSort").addEventListener("change",e=>{S.sortAlert.k={crit:"crit",eta:"eta",rta:"rta",stagn:"stagn"}[e.target.value]||"crit";S.pageAlert=0;renderAlertTable();});
  $$("#sevChips .chip").forEach(c=>c.onclick=()=>{$$("#sevChips .chip").forEach(x=>x.classList.remove("active"));c.classList.add("active");S.sevFilter=c.dataset.sev;S.pageAlert=0;renderAlertTable();});
  $("#mainPrev").onclick=()=>{S.pageMain=Math.max(0,S.pageMain-1);renderMain();};
  $("#mainNext").onclick=()=>{S.pageMain++;renderMain();};
  $("#alertPrev").onclick=()=>{S.pageAlert=Math.max(0,S.pageAlert-1);renderAlertTable();};
  $("#alertNext").onclick=()=>{S.pageAlert++;renderAlertTable();};
  const syncPP=v=>{ S.perPage=+v||100; setSelect($("#mainPerPage"),String(S.perPage)); setSelect($("#alertPerPage"),String(S.perPage)); S.pageMain=0; S.pageAlert=0; renderMain(); renderAlertTable(); };
  $("#mainPerPage").onchange=e=>syncPP(e.target.value);
  $("#alertPerPage").onchange=e=>syncPP(e.target.value);
  $$("#mainTable th[data-k]").forEach(th=>th.onclick=()=>{const k=th.dataset.k;S.sortMain.dir=S.sortMain.k===k?-S.sortMain.dir:-1;S.sortMain.k=k;renderMain();});
  $$("#alertTable th[data-k]").forEach(th=>th.onclick=()=>{const k=th.dataset.k;S.sortAlert.dir=-1;S.sortAlert.k=k;S.pageAlert=0;renderAlertTable();});
  $("#btnClearF").onclick=()=>{clearAllFilters();};
  const fullToast=n=>`⬇ Export intégral : <b>${fmtN(n)} lignes</b> — aucune troncature`;
  $("#btnCsv").onclick=()=>{const r=filteredMain(); download("spot_dossiers_filtres.csv",toCSVParts(r),"text/csv"); toast(fullToast(r.length));};
  $("#btnXlsx").onclick=()=>exportXLSX("spot_dossiers_filtres.xlsx",filteredMain());
  $("#btnJson").onclick=()=>{const r=filteredMain(); download("spot_dossiers_filtres.json",JSON.stringify(r),"application/json"); toast(fullToast(r.length));};
  $("#alertExport").onclick=()=>{const r=filteredAlerts().map(x=>x.r); download("spot_alertes.csv",toCSVParts(r),"text/csv"); toast(fullToast(r.length));};
  $("#alertExportX").onclick=()=>exportXLSX("spot_alertes.xlsx",filteredAlerts().map(x=>x.r));
  $("#perfExport").onclick=()=>{const t=$("#perfTable");let csv="COM;Dossiers;Critique+Haute;Score;Verdict\n";$$("#perfTable tbody tr").forEach(tr=>{csv+=[...tr.children].slice(0,4).map(td=>td.innerText.replace(/\n/g," ")).join(";")+"\n";});download("spot_performance_com.csv","﻿"+csv,"text/csv");};
  $("#perfExportX").onclick=()=>{ const data=perfStats(baseFiltered()).map(v=>({"COM":v.k,"Dossiers":v.n,"% Crit+Haute":Math.round(v.rate*100),"Score moyen":v.avg.toFixed(1)})); const ws=XLSX.utils.json_to_sheet(data); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"COM"); XLSX.writeFile(wb,"spot_performance_com.xlsx"); toast("⬇ Performance COM exportée (XLSX)"); };
  $("#btnExport").onclick=()=>{const r=filteredMain(); download("spot_export_"+(S.fileName||"cockpit").replace(/\.[^.]+$/,"")+".csv",toCSVParts(r),"text/csv"); toast(fullToast(r.length));};
  $("#comDetailSee").onclick=()=>{ if(S.selCom) setF("com",S.selCom); goto("dossiers"); };
  $("#comDetailCsv").onclick=()=>{ if(!S.selCom) return; const r=baseFiltered().filter(x=>x.com===S.selCom); download(`spot_situation_${S.selCom}.csv`,toCSVParts(r),"text/csv"); toast(fullToast(r.length)); };
  $("#comDetailXlsx").onclick=()=>{ if(S.selCom) exportXLSX(`spot_situation_${S.selCom}.xlsx`,baseFiltered().filter(x=>x.com===S.selCom)); };
  $("#comDetailMail").onclick=()=>{ if(S.selCom) openMailModal(S.selCom); };
  $("#btnReset").onclick=async()=>{ if(!confirm("Effacer les données locales ?"))return; S.rows=[];S.enriched=[];S.fileName="";await IDB.del("dossiers");localStorage.removeItem("spot_mapping");localStorage.removeItem("spot_file");clearAllFilters();fillSelects();renderAll();setImportState("empty");toast("🗑 Données locales effacées"); };
  const be=$("#btnEject"); if(be) be.onclick=()=>ejectFile();
  $("#btnImport").onclick=()=>$("#fileInput").click();
  $("#fileInput").onchange=e=>{ readFile(e.target.files[0]); e.target.value=""; };
  $("#fileInput2").onchange=e=>{ readFile(e.target.files[0]); e.target.value=""; };
  const dz=$("#dropZone"); ["dragover","dragenter"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add("over");})); ["dragleave","drop"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove("over");})); dz.addEventListener("drop",e=>readFile(e.dataTransfer.files[0]));
  await IDB.open();
  // restauration locale — aucune donnée factice : sans fichier, état vide + appel au chargement
  try{
    const saved=await IDB.get("dossiers");
    const mp=localStorage.getItem("spot_mapping"); if(mp) S.mapping=JSON.parse(mp);
    const fn=localStorage.getItem("spot_file");
    if(saved&&saved.rows&&saved.rows.length){ S.rows=saved.rows; S.fileName=fn||saved.fileName||"restauré"; setImportState("loading",`Analyse de ${fmtN(saved.rows.length)} lignes restaurées…`); S.enriched=await enrichAllAsync(S.rows,(d,t)=>setImportState("loading",`Analyse : ${fmtN(d)} / ${fmtN(t)}…`)); fillSelects(); renderAll(); setImportState("loaded",S.fileName); }
    else { fillSelects(); renderAll(); setImportState("empty"); }
  }catch{ fillSelects(); renderAll(); }
  renderAll(); renderAdmin();
}
document.readyState==="loading"?document.addEventListener("DOMContentLoaded",init):init();
})();
