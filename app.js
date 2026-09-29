/* SPOT Cockpit AGL — 100% local. Moteur pilotage quotidien. */
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
const ALERT_BASE = {
  A1:{t:"ETA dépassée, BAE manquant", sev:"Critique", c:"#d92d20", h:"Le navire est arrivé (ETA < pilotage) mais pas de BAE → risque surestaries / blocage client.", w:30, days:0, on:true, ico:"🚢"},
  A2:{t:"RTA dépassée, non archivé", sev:"Haute", c:"#e9730c", h:"RTA passée et dossier non archivé → clôture en retard.", w:20, days:0, on:true, ico:"📦"},
  A3:{t:"Inversion chronologique", sev:"Critique", c:"#d92d20", h:"Une étape est datée avant l'étape précédente → erreur de saisie ou contournement process.", w:25, days:0, on:true, ico:"🔀"},
  A4:{t:"Stagnation amont (> SLA)", sev:"Haute", c:"#e9730c", h:"Validation → Docs → Note bloqués plus longtemps que le SLA.", w:15, days:0, on:true, ico:"⏳"},
  A5:{t:"Stagnation douane", sev:"Haute", c:"#e9730c", h:"Enregistrement sans facture, ou facture sans BAE (dépassement SLA).", w:15, days:0, on:true, ico:"🏛️"},
  A6:{t:"Blocage BAE", sev:"Critique", c:"#d92d20", h:"Facture douane présente, BAE vide depuis plus de X jours → point dur douane.", w:25, days:3, on:true, ico:"🛂"},
  A7:{t:"Blocage livraison", sev:"Haute", c:"#e9730c", h:"BAE obtenu mais mise/retour en retard vs SLA.", w:18, days:2, on:true, ico:"🚚"},
  A8:{t:"Clôture en retard", sev:"Moyenne", c:"#ca8a04", h:"Retour effectué mais facture/validation/archivage en attente.", w:10, days:5, on:true, ico:"🧾"},
  A9:{t:"Qualité donnée / MAJ masse", sev:"Moyenne", c:"#ca8a04", h:"Date identique massive ou champs vides/doublons.", w:8, days:30, on:true, ico:"🧹"},
  A10:{t:"Donnée manquante / doublon", sev:"Moyenne", c:"#ca8a04", h:"COM, client ou n° dossier vide, ou n° dossier en double.", w:8, days:0, on:true, ico:"❓"},
};
const SEV_DEFAULT = {Critique:"#d92d20", Haute:"#e9730c", Moyenne:"#ca8a04", OK:"#12805c"};
const DEFAULT_CFG = {
  pilot:"2026-09-28", thCrit:55, thHaute:30, thMoy:12, etaCrit:-7, rtaCrit:-7,
  sla:{...SLA_DEFAULT}, alerts:JSON.parse(JSON.stringify(ALERT_BASE)), sevColors:{...SEV_DEFAULT}
};
let CFG = JSON.parse(JSON.stringify(DEFAULT_CFG));
function loadCfg(){ try{ const raw=localStorage.getItem("spot_cfg"); if(raw){ const c=JSON.parse(raw); CFG={...JSON.parse(JSON.stringify(DEFAULT_CFG)),...c, sla:{...SLA_DEFAULT,...(c.sla||{})}, sevColors:{...SEV_DEFAULT,...(c.sevColors||{})}}; Object.keys(ALERT_BASE).forEach(k=>{ CFG.alerts[k]={...ALERT_BASE[k],...(c.alerts?.[k]||{})}; }); } }catch{} }
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
const diffJ = (a,b) => (!a||!b)?null:Math.round((a-b)/86400000);
const todayPilot = () => { const v=$("#pilotDate").value; if(v){const d=new Date(v+"T00:00:00"); if(!isNaN(d)) return d;} const d=new Date(); d.setHours(0,0,0,0); return d; };

/* ---------- État ---------- */
const S = { rows:[], enriched:[], mapping:null, headers:[], fileName:"", alertFilter:null, sevFilter:"", sortMain:{k:"crit",dir:-1}, sortAlert:{k:"crit",dir:-1}, pageMain:0, pageAlert:0, perPage:100, activeView:"pilotage", selCom:"", pilMonth:"" };
/* Filtres globaux — appliqués à toutes les vues */
const F = { com:"", metier:"", crit:"", month:"", year:"", rtaMonth:"", rtaYear:"", dFrom:"", dTo:"" };
const MOIS=["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
const ymLabel=ym=>{ if(!ym) return ""; const [y,m]=ym.split("-"); return `${MOIS[+m-1]||m} ${y}`; };
const toast = m => { const t=document.createElement("div"); t.className="toast"; t.innerHTML=m; $("#toasts").appendChild(t); setTimeout(()=>t.remove(),4200); };

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
function applyMapping(headers, rows, mapping){
  const colIdx={}; headers.forEach((h,i)=>colIdx[h]=i);
  return rows.map((r,ri)=>{
    const g=k=>{ const m=mapping[k]; if(!m||!m.col||!(m.col in colIdx)) return ""; const v=r[colIdx[m.col]]; return v==null?"":String(v).trim(); };
    const o={_i:ri, com:g("com"), metier:g("metier"), sousMetier:g("sousMetier"), client:g("client"), sousCompte:g("sousCompte"), designation:g("designation"), poids:g("poids"), dossier:g("dossier"),
      com1:g("com1"),com2:g("com2"),com3:g("com3"),com4:g("com4"),com5:g("com5"), auteur:g("auteur"),
      dateETA:excelToDate(rows[ri][colIdx[mapping.dateETA?.col]] ?? g("dateETA")), dateRTA:excelToDate(rows[ri][colIdx[mapping.dateRTA?.col]] ?? g("dateRTA")),
      dateValidation:excelToDate(rows[ri][colIdx[mapping.dateValidation?.col]] ?? ""), dateDocs:excelToDate(rows[ri][colIdx[mapping.dateDocs?.col]] ?? ""),
      dateNote:excelToDate(rows[ri][colIdx[mapping.dateNote?.col]] ?? ""), dateEnreg:excelToDate(rows[ri][colIdx[mapping.dateEnreg?.col]] ?? ""),
      dateFactDouane:excelToDate(rows[ri][colIdx[mapping.dateFactDouane?.col]] ?? ""), dateBAE:excelToDate(rows[ri][colIdx[mapping.dateBAE?.col]] ?? ""),
      dateMise:excelToDate(rows[ri][colIdx[mapping.dateMise?.col]] ?? ""), dateRetour:excelToDate(rows[ri][colIdx[mapping.dateRetour?.col]] ?? ""),
      dateFactInt:excelToDate(rows[ri][colIdx[mapping.dateFactInt?.col]] ?? ""), dateValidFinal:excelToDate(rows[ri][colIdx[mapping.dateValidFinal?.col]] ?? ""),
      dateArchivage:excelToDate(rows[ri][colIdx[mapping.dateArchivage?.col]] ?? ""),
      delaiETA_raw:rows[ri][colIdx[mapping.delaiETA?.col] ?? -1], delaiRTA_raw:rows[ri][colIdx[mapping.delaiRTA?.col] ?? -1]};
    // fallback: si mapping texte a échoué pour dates (objets Date SheetJS), relire brut
    return o;
  });
}

/* ---------- Moteur d'enrichissement ---------- */
function enrichAll(rows){
  const P=todayPilot();
  const counts={}; rows.forEach(r=>{ if(r.dossier) counts[r.dossier]=(counts[r.dossier]||0)+1; });
  // détection MAJ masse : date docs la plus fréquente
  const freq={}; rows.forEach(r=>{ if(r.dateDocs){const k=r.dateDocs.getTime(); freq[k]=(freq[k]||0)+1;}});
  let topFreq=0; Object.values(freq).forEach(v=>{topFreq=Math.max(topFreq,v);});
  const masseRatio = rows.length? topFreq/rows.length : 0;
  return rows.map(r=>{
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
    // inversions
    const inv=[]; let prev=null, prevL="";
    [...(r.dateETA?[["ETA",r.dateETA]]:[]), ...(r.dateRTA?[["RTA",r.dateRTA]]:[]), ...STEPS.map(s=>[s.label,r[s.dateKey]])].forEach(([l,d])=>{
      if(d){ if(prev&&d<prev) inv.push(prevL+" → "+l); prev=d; prevL=l; } 
    });
    // alertes (paramétrables depuis Administration)
    const al=[];
    const on=k=>CFG.alerts[k]?.on!==false;
    if(on("A1")&&r.dateETA&&delaiETA!=null&&delaiETA<0&&!r.dateBAE) al.push({c:"A1",d:`ETA ${fmtD(r.dateETA)} dépassée de ${-delaiETA}j sans BAE`});
    if(on("A2")&&r.dateRTA&&delaiRTA!=null&&delaiRTA<0&&!r.dateArchivage) al.push({c:"A2",d:`RTA ${fmtD(r.dateRTA)} dépassée de ${-delaiRTA}j, non archivé`});
    if(on("A3")) inv.forEach(x=>al.push({c:"A3",d:"Inversion : "+x}));
    if(on("A4")&&stagn.some(s=>s.label.startsWith("Validation")||s.label.startsWith("Docs")||s.label.startsWith("Note"))) al.push({c:"A4",d:stagn.filter(s=>/Validation|Docs|Note/.test(s.label)).map(s=>`${s.label} : ${s.jours}j`).join(" • ")});
    if(on("A5")&&stagn.some(s=>/Enreg|Facture→BAE/.test(s.label))) al.push({c:"A5",d:stagn.filter(s=>/Enreg|Facture/.test(s.label)).map(s=>`${s.label} : ${s.jours}j`).join(" • ")});
    if(on("A6")&&r.dateFactDouane&&!r.dateBAE&&diffJ(P,r.dateFactDouane)>(CFG.alerts.A6.days??3)) al.push({c:"A6",d:`Facture douane ${fmtD(r.dateFactDouane)} sans BAE depuis ${diffJ(P,r.dateFactDouane)}j`});
    if(on("A7")&&r.dateBAE&&(!r.dateMise||!r.dateRetour)){ const d=diffJ(P,r.dateBAE); if(d>(CFG.alerts.A7.days??2)) al.push({c:"A7",d:`BAE ${fmtD(r.dateBAE)}, livraison en attente depuis ${d}j`}); }
    if(on("A8")&&r.dateRetour&&(!r.dateFactInt||!r.dateValidFinal||!r.dateArchivage)&&diffJ(P,r.dateRetour)>(CFG.alerts.A8.days??5)) al.push({c:"A8",d:`Retour ${fmtD(r.dateRetour)} sans clôture depuis ${diffJ(P,r.dateRetour)}j`});
    if(on("A10")){
      if(!r.com||!r.client||!r.dossier) al.push({c:"A10",d:"Champ clé vide : "+[!r.com&&"COM",!r.client&&"Client",!r.dossier&&"N° dossier"].filter(Boolean).join(", ")});
      if(r.dossier&&counts[r.dossier]>1) al.push({c:"A10",d:`N° dossier en double (${counts[r.dossier]}×)`});
    }
    // score criticité (poids paramétrables)
    let sc=0;
    al.forEach(a=>{ sc+= (CFG.alerts[a.c]?.w ?? 8); });
    if(delaiETA!=null&&delaiETA<-14) sc+=10; if(delaiRTA!=null&&delaiRTA<-14) sc+=8;
    if(stagn.length>=3) sc+=10;
    sc=Math.min(100,sc);
    const crit = sc>=CFG.thCrit?"Critique": sc>=CFG.thHaute?"Haute": sc>=CFG.thMoy?"Moyenne":"OK";
    const comments=[r.com1,r.com2,r.com3,r.com4,r.com5].filter(x=>x&&String(x).trim()).join(" • ");
    const etaYM=r.dateETA?`${r.dateETA.getFullYear()}-${String(r.dateETA.getMonth()+1).padStart(2,"0")}`:"";
    const rtaYM=r.dateRTA?`${r.dateRTA.getFullYear()}-${String(r.dateRTA.getMonth()+1).padStart(2,"0")}`:"";
    return {...r, delaiETA, delaiRTA, etape:etape.label, etapeKey, stagn, inv, alerts:al, score:sc, crit, comments, lastIdx, etaYM, etaYear:r.dateETA?String(r.dateETA.getFullYear()):"", etaMonth:r.dateETA?String(r.dateETA.getMonth()+1).padStart(2,"0"):"", rtaYM, rtaYear:r.dateRTA?String(r.dateRTA.getFullYear()):""};
  });
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
  $("#gCount").textContent=n.toLocaleString("fr-FR")+" dossier"+(n>1?"s":"");
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
  const c=comOv!==undefined?comOv:F.com, m=metOv!==undefined?metOv:F.metier;
  const mo=monthOv!==undefined?monthOv:F.month, y=yearOv!==undefined?yearOv:F.year, cr=critOv!==undefined?critOv:F.crit;
  if(c&&r.com!==c) return false;
  if(m&&r.metier!==m) return false;
  if(mo&&r.etaYM!==mo) return false;
  if(y&&r.etaYear!==y) return false;
  if(cr&&r.crit!==cr) return false;
  if(F.rtaMonth&&r.rtaYM!==F.rtaMonth) return false;
  if(F.rtaYear&&r.rtaYear!==F.rtaYear) return false;
  if(F.dFrom){ const d1=new Date(F.dFrom+"T00:00:00"); if(!r.dateETA||r.dateETA<d1) return false; }
  if(F.dTo){ const d2=new Date(F.dTo+"T00:00:00"); if(!r.dateETA||r.dateETA>d2) return false; }
  return true;
}
function baseFiltered(){ return S.enriched.filter(r=>matchGlobal(r)); }
/* écriture centralisée d'un filtre global + synchro des miroirs + rerendu */
function setF(key,val){
  F[key]=val||"";
  const map={com:["#gCom","#fCom","#pCom"],metier:["#gMetier","#fMetier","#pMetier"],crit:["#gCrit","#fCrit","#pCrit"],month:["#gMonth","#fMonth","#pMonth"],year:["#gYear","#fYear","#pYear"],rtaMonth:["#pRtaMonth"],rtaYear:["#pRtaYear"]};
  (map[key]||[]).forEach(s=>setSelect($(s),F[key]));
  if(key==="com"&&$("#alertCom")) setSelect($("#alertCom"),F.com);
  if(key==="month"&&$("#alertMonth")) setSelect($("#alertMonth"),F.month);
  if(key==="year"&&$("#alertYear")) setSelect($("#alertYear"),F.year);
  S.pageMain=0; S.pageAlert=0;
  renderAll();
}
function clearAllFilters(){
  F.com=F.metier=F.crit=F.month=F.year=F.rtaMonth=F.rtaYear=F.dFrom=F.dTo="";
  ["gCom","gMetier","gCrit","gMonth","gYear","fCom","fMetier","fSous","fClient","fSousCpte","fCrit","fDelay","fStep","fEta1","fEta2","fSearch","fMonth","fYear","alertSearch","alertCom","alertMetier","alertMonth","alertYear","pCom","pMetier","pCrit","pMonth","pYear","pRtaMonth","pRtaYear","pFrom","pTo"].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=""; });
  S.alertFilter=null; S.sevFilter=""; S.pageMain=0; S.pageAlert=0;
  $$("#sevChips .chip").forEach((x,i)=>x.classList.toggle("active",i===0));
  renderAll();
}
function filteredMain(){
  const q=norm($("#fSearch").value||""), sm=$("#fSous").value, cl=$("#fClient").value, sc=$("#fSousCpte").value, dl=$("#fDelay").value, st=$("#fStep").value;
  const e1=$("#fEta1").value?new Date($("#fEta1").value+"T00:00:00"):null, e2=$("#fEta2").value?new Date($("#fEta2").value+"T00:00:00"):null;
  return S.enriched.filter(r=>{
    if(!matchGlobal(r)) return false;
    if(sm&&r.sousMetier!==sm) return false;
    if(cl&&r.client!==cl) return false; if(sc&&r.sousCompte!==sc) return false;
    if(st&&r.etapeKey!==st&&!(st==="archive"&&r.dateArchivage)) return false;
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
  S.enriched.forEach(r=>r.alerts.forEach(a=>list.push({r,a})));
  return list.filter(({r,a})=>{
    if(type&&a.c!==type) return false;
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
const DLONG={ETA:"ETA (arrivée prévue)",RTA:"RTA",validation:"Validation",docs:"Documents complets",note:"Note de détail",douane:"Enreg. douane",factDouane:"Facture douane",bae:"BAE",mise:"Mise en livraison",retour:"Retour livraison",factInt:"Facture intervention",validFinal:"Validation finale",archivage:"Archivage"};
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
  $("#navAlertCount").textContent=E.reduce((s,r)=>s+r.alerts.length,0);
  const gc=$("#gCount"); if(gc) gc.textContent=tot.toLocaleString("fr-FR")+" dossier"+(tot>1?"s":"")+" (filtres globaux)";
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
    return `<button class="sev-card${active}" data-sev="${sev}" style="--c:${col};--cbg:${col}18"><span class="sev-ico">${ico}</span><span style="flex:1"><small>${sev}</small><b>${n.toLocaleString("fr-FR")}</b><span>${h}</span></span><span style="font-size:18px;color:${col}">→</span></button>`;
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
  const top=baseFiltered().sort((a,b)=>b.score-a.score).slice(0,8);
  const q=norm($("#fSearch")?.value||"");
  $("#worryTable tbody").innerHTML=top.map(r=>`<tr data-i="${r._i}" style="cursor:pointer" class="${r.crit==="Critique"?"crit":""}"><td><b style="color:${sevColor(r.crit)}">${r.score}</b> ${pill(r.crit)}</td><td><b>${esc(r.dossier||"—")}</b></td><td>${esc(r.com||"—")}</td><td>${esc((r.client||"").slice(0,26))}</td><td>${delayCell(r.delaiETA,r.dateETA)}</td><td>${r.alerts.map(a=>`<span class="pill ${alertDef(a.c).sev==="Critique"?"crit":alertDef(a.c).sev==="Haute"?"haute":"moy"}" title="${esc(a.d)}">${a.c}</span>`).join(" ")}</td><td style="white-space:normal;min-width:220px;font-size:12px">${hiComment((r.comments||"").slice(0,160),q)||"<span style='color:#94a3b8'>—</span>"}</td></tr>`).join("")||'<tr><td colspan="7" style="text-align:center;color:#64748b">—</td></tr>';
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
    return `<button class="sev-card" data-sev="${sev}" style="--c:${col};--cbg:${col}18"><span class="sev-ico">${ico}</span><span style="flex:1"><small>${sev}</small><b>${n.toLocaleString("fr-FR")}</b></span><span style="font-size:18px;color:${col}">→</span></button>`;
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
  $("#pilTable tbody").innerHTML=top.map(r=>`<tr data-i="${r._i}" style="cursor:pointer" class="${r.crit==="Critique"?"crit":""}"><td><b style="color:${sevColor(r.crit)}">${r.score}</b> ${pill(r.crit)}</td><td><b>${esc(r.dossier||"—")}</b></td><td>${esc(r.com||"—")}</td><td>${esc((r.client||"").slice(0,26))}</td><td>${delayCell(r.delaiETA,r.dateETA)}</td><td>${r.alerts.map(a=>`<span class="pill ${alertDef(a.c).sev==="Critique"?"crit":alertDef(a.c).sev==="Haute"?"haute":"moy"}" title="${esc(a.d)}">${a.c}</span>`).join(" ")}</td></tr>`).join("")||(S.enriched.length?'<tr><td colspan="6"><div class="empty-state"><b>Rien à signaler ce mois-ci ✔</b></div></td></tr>':'<tr><td colspan="6"><div class="empty-state"><b>En attente de données</b>Chargez votre export Excel.</div></td></tr>');
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
  $("#delayDist").innerHTML=buckets.map(([l,f])=>{const n=E.filter(f).length;return `<div class="bar-row"><span>Délai ETA ${l}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(n/max*100)}%;background:${l.startsWith("≤")||l.startsWith("-")?"#d92d20":l.startsWith("0")?"#e9730c":"#12805c"}"></div></div><b>${n}</b></div>`;}).join("")+`<div class="footer-note">Délai = ETA − date pilotage. Négatif = déjà arrivé. Même logique RTA. Filtrez par délai dans l'onglet Dossiers.</div>`;
}
function renderTopAlerts(){
  const list=filteredAlerts().slice(0,6);
  $("#topAlerts").innerHTML=list.length?list.map(({r,a})=>{const d=ALERT_DEFS[a.c];return `<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid #eef2f7"><span style="width:10px;height:10px;border-radius:50%;background:${d.c};margin-top:5px;flex:none"></span><div style="flex:1"><b>${a.c} — ${esc(d.t)}</b><br><span style="font-size:12px;color:#475569">${esc(r.dossier||"—")} • ${esc(r.com||"—")} • ${esc(a.d)}</span></div><button class="btn small" data-open="${r._i}">Ouvrir</button></div>`;}).join(""):(S.enriched.length?'<p style="color:#64748b">Aucune alerte sur ce périmètre. ✔</p>':'<div class="empty-state"><b>En attente de données</b>Chargez votre export Excel pour voir les alertes du jour.</div>');
  $$("#topAlerts [data-open]").forEach(b=>b.onclick=()=>openDrawer(+b.dataset.open));
}
function renderAlertTypes(){
  const counts={}; Object.keys(CFG.alerts).forEach(k=>counts[k]=0);
  baseFiltered().forEach(r=>r.alerts.forEach(a=>counts[a.c]++));
  $("#alertTypes").innerHTML=Object.entries(CFG.alerts).map(([k,d])=>`<div class="alert-type ${S.alertFilter===k?"active":""}${d.on===false?" off":""}" data-t="${k}" style="--c:${d.c};${d.on===false?"opacity:.45;filter:grayscale(.6)":""}" title="${esc(d.h)} — poids ${d.w}, seuil ${d.days}j${d.on===false?" (désactivée — voir Administration)":""}"><small>${d.ico||"•"} ${k} • ${d.sev}${d.on===false?" • OFF":""}</small><b>${counts[k].toLocaleString("fr-FR")}</b><span><b style="font-size:12px">${esc(d.t)}</b><br>${esc(d.h)}</span></div>`).join("");
  $$("#alertTypes .alert-type").forEach(el=>el.onclick=()=>{ S.alertFilter=S.alertFilter===el.dataset.t?null:el.dataset.t; S.pageAlert=0; renderAlertTypes(); renderAlertTable(); });
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
  $("#dossierCount").textContent=rows.length.toLocaleString("fr-FR")+" dossier(s)";
  $("#mainPagerInfo").textContent=`Page ${S.pageMain+1}/${pages}`;
  $("#mainTable tbody").innerHTML=slice.map(r=>`<tr class="${r.crit==="Critique"?"crit":""}" data-i="${r._i}" style="cursor:pointer"><td>${pill(r.crit)}<br><small style="color:#64748b">${r.score}</small></td><td><b>${esc(r.dossier||"—")}</b><br><small style="color:#64748b">${esc(r.designation||"")}</small></td><td>${esc(r.com||"—")}<br><small style="color:#64748b">${esc(r.auteur||"")}</small></td><td>${esc((r.client||"").slice(0,26))}<br><small style="color:#64748b">${esc(r.sousCompte||"")}</small></td><td>${delayCell(r.delaiETA,r.dateETA)}</td><td>${delayCell(r.delaiRTA,r.dateRTA)}</td><td><span class="pill ${r.dateArchivage?"ok":"grey"}">${esc(r.etape)}</span></td><td style="font-size:11.5px;color:#334155">V:${fmtD(r.dateValidation)}<br>D:${fmtD(r.dateDocs)} • N:${fmtD(r.dateNote)}<br>E:${fmtD(r.dateEnreg)} • B:${fmtD(r.dateBAE)}</td><td>${r.alerts.slice(0,3).map(a=>`<span class="pill ${ALERT_DEFS[a.c].sev==="Critique"?"crit":ALERT_DEFS[a.c].sev==="Haute"?"haute":"moy"}" title="${esc(a.d)}">${a.c}</span>`).join(" ")}${r.alerts.length>3?` <small>+${r.alerts.length-3}</small>`:""}</td></tr>`).join("")||(S.enriched.length?'<tr><td colspan="9"><div class="empty-state"><b>Aucun dossier avec ces filtres</b>Élargissez les critères ou réinitialisez les filtres globaux.</div></td></tr>':'<tr><td colspan="9"><div class="empty-state"><b>Aucune donnée chargée</b>Chargez votre export Excel « Dossiers par COM » via 📤 Charger Excel ou glisser-déposer.</div></td></tr>');
  $$("#mainTable tbody tr[data-i]").forEach(tr=>tr.onclick=()=>openDrawer(+tr.dataset.i));
}
function renderAlertTable(){
  const list=filteredAlerts();
  const pages=Math.max(1,Math.ceil(list.length/S.perPage)); S.pageAlert=Math.min(S.pageAlert,pages-1);
  const slice=list.slice(S.pageAlert*S.perPage,(S.pageAlert+1)*S.perPage);
  $("#alertPagerInfo").textContent=`${list.length.toLocaleString("fr-FR")} alerte(s) • Page ${S.pageAlert+1}/${pages}`;
  $("#alertTable tbody").innerHTML=slice.map(({r,a})=>{const d=ALERT_DEFS[a.c];return `<tr data-i="${r._i}" style="cursor:pointer"><td>${pill(d.sev)}<br><small>${a.c} • ${r.score}</small></td><td><b>${esc(r.dossier||"—")}</b></td><td>${esc(r.com||"—")}</td><td>${esc((r.client||"").slice(0,24))}</td><td><b style="color:${d.c}">${a.c} — ${esc(d.t)}</b></td><td style="white-space:normal;min-width:220px">${esc(a.d)}</td><td>${delayCell(r.delaiETA,r.dateETA)}</td><td style="white-space:normal;min-width:200px;font-size:11.5px">${esc((r.comments||"").slice(0,140))}</td><td><button class="btn small" data-i="${r._i}">→</button></td></tr>`;}).join("")||(S.enriched.length?'<tr><td colspan="9"><div class="empty-state"><b>Aucune alerte avec ces filtres</b>Élargissez les critères ou réinitialisez les filtres globaux.</div></td></tr>':'<tr><td colspan="9"><div class="empty-state"><b>Aucune donnée chargée</b>Chargez votre export Excel « Dossiers par COM » pour voir les alertes.</div></td></tr>');
  $$("#alertTable tbody tr").forEach(tr=>tr.onclick=()=>openDrawer(+tr.dataset.i));
}
function perfStats(rows){
  const by={};
  rows.forEach(r=>{const k=r.com||"(vide)";(by[k]=by[k]||{n:0,sc:0,crit:0,eta:[],bae:0,arch:0});const o=by[k];o.n++;o.sc+=r.score;o.crit+=(r.crit==="Critique"||r.crit==="Haute")?1:0;if(r.delaiETA!=null)o.eta.push(r.delaiETA);if(r.dateBAE)o.bae++;if(r.dateArchivage)o.arch++;});
  return Object.entries(by).map(([k,v])=>({...v,k,avg:v.sc/v.n,rate:v.crit/v.n,med:v.eta.length?[...v.eta].sort((a,b)=>a-b)[Math.floor(v.eta.length/2)]:null,tBae:v.bae/v.n,tArch:v.arch/v.n})).sort((a,b)=>b.avg-a.avg);
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
  $$("#perfTable tbody tr").forEach(tr=>{
    const com=tr.dataset.com;
    tr.querySelector('[data-act="see"]').onclick=e=>{ e.stopPropagation(); setF("com",com); goto("dossiers"); };
    tr.querySelector('[data-act="csv"]').onclick=e=>{ e.stopPropagation(); download(`spot_situation_${com}.csv`,"﻿"+toCSV(S.enriched.filter(r=>r.com===com)),"text/csv"); toast(`⬇ Situation <b>${esc(com)}</b> exportée en intégralité (CSV)`); };
    tr.querySelector('[data-act="mail"]').onclick=e=>{ e.stopPropagation(); openMailModal(com); };
    tr.onclick=e=>{ if(e.target.closest("button")) return; S.selCom=com; renderPerfs(); };
  });
  renderComDetail();
}
/* Détail d'un COM : KPIs, criticité, alertes, mois, top dossiers */
function renderComDetail(){
  const com=S.selCom;
  $("#comDetailName").textContent=com||"—";
  const body=$("#comDetailKpis"), sev=$("#comDetailSev"), al=$("#comDetailAlerts"), mo=$("#comDetailMonths"), st=$("#comDetailStages"), tb=$("#comDetailTable tbody");
  if(!com){ body.innerHTML=""; sev.innerHTML="<p style='color:#64748b'>—</p>"; al.innerHTML=""; mo.innerHTML=""; st.innerHTML=""; tb.innerHTML='<tr><td colspan="7"><div class="empty-state"><b>Sélectionnez un COM</b>Cliquez une ligne du classement.</div></td></tr>'; return; }
  const rows=baseFiltered().filter(r=>r.com===com);
  const n=rows.length||1;
  const crit=rows.filter(r=>r.crit==="Critique").length, haute=rows.filter(r=>r.crit==="Haute").length, moy=rows.filter(r=>r.crit==="Moyenne").length, ok=rows.filter(r=>r.crit==="OK").length;
  const etaMed=(()=>{const v=rows.map(r=>r.delaiETA).filter(v=>v!=null).sort((a,b)=>a-b);return v.length?v[Math.floor(v.length/2)]:null;})();
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
  const byA={}; rows.forEach(r=>r.alerts.forEach(a=>{byA[a.c]=(byA[a.c]||0)+1;}));
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
    return {l:`${a.label} → ${b.label}`, avg:n?s/n:null, n, sla:CFG.sla[b.k]??null};
  });
  const mxS=Math.max(1,...avgs.map(x=>x.avg||0));
  st.innerHTML=avgs.map(x=>x.avg==null
    ?`<div class="bar-row"><span>${esc(x.l)}</span><div class="bar-track"></div><b style="color:#94a3b8">—</b></div>`
    :`<div class="bar-row"><span>${esc(x.l)}${x.sla!=null&&x.avg>x.sla?' <b class="late">⚠</b>':""}<br><small style="color:#64748b">SLA ${x.sla??"—"}j • n=${x.n}</small></span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(x.avg/mxS*100)}%;background:${x.sla!=null&&x.avg>x.sla?sevColor("Critique"):"#0f2a52"}"></div></div><b>${x.avg.toFixed(1)}j</b></div>`).join("");
  const top=[...rows].sort((a,b)=>b.score-a.score).slice(0,8);
  const q=norm($("#fSearch")?.value||"");
  tb.innerHTML=top.map(r=>`<tr data-i="${r._i}" style="cursor:pointer" class="${r.crit==="Critique"?"crit":""}"><td><b style="color:${sevColor(r.crit)}">${r.score}</b></td><td><b>${esc(r.dossier||"—")}</b></td><td>${esc((r.client||"").slice(0,26))}</td><td>${delayCell(r.delaiETA,r.dateETA)}</td><td><span class="pill ${r.dateArchivage?"ok":"grey"}">${esc(r.etape)}</span></td><td>${r.alerts.slice(0,3).map(a=>`<span class="pill ${alertDef(a.c).sev==="Critique"?"crit":alertDef(a.c).sev==="Haute"?"haute":"moy"}" title="${esc(a.d)}">${a.c}</span>`).join(" ")}</td><td style="white-space:normal;min-width:200px;font-size:12px">${hiComment((r.comments||"").slice(0,140),q)||"<span style='color:#94a3b8'>—</span>"}</td></tr>`).join("")||'<tr><td colspan="7" style="text-align:center;color:#64748b">—</td></tr>';
  $$("#comDetailTable tbody tr[data-i]").forEach(tr=>tr.onclick=()=>openDrawer(+tr.dataset.i));
}
function renderBU(){
  const E=baseFiltered();
  const byM={}; E.forEach(r=>{const k=r.metier||"(vide)";byM[k]=(byM[k]||0)+1;});
  const arrM=Object.entries(byM).sort((a,b)=>b[1]-a[1]); const max=Math.max(1,...arrM.map(a=>a[1]));
  $("#buBars").innerHTML=arrM.length?arrM.map(([k,v])=>`<div class="bar-row"><span>Métier ${esc(k)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(v/max*100)}%;background:#0f2a52"></div></div><b>${v}</b></div>`).join(""):"<div class='empty-state'><b>Aucune donnée</b>Chargez votre export Excel.</div>";
  const byC={}; E.forEach(r=>{if(r.crit==="Critique"||r.crit==="Haute"){const k=r.client||"(vide)";byC[k]=(byC[k]||0)+1;}});
  const arrC=Object.entries(byC).sort((a,b)=>b[1]-a[1]); const maxC=Math.max(1,...arrC.map(a=>a[1]));
  $("#clientBars").innerHTML=(arrC.map(([k,v])=>`<div class="bar-row"><span>${esc(k.slice(0,24))}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(v/maxC*100)}%;background:#d92d20"></div></div><b>${v}</b></div>`).join(""))||"<p style='color:#64748b'>—</p>";
  const cc=$("#clientCount"); if(cc) cc.textContent=`(${arrC.length} clients)`;
  const mets=[...new Set(E.map(r=>r.metier||"(vide)"))].slice(0,12);
  $("#buMatrix tbody").innerHTML=mets.map(m=>{const rows=E.filter(r=>(r.metier||"(vide)")===m);const c=k=>rows.filter(r=>r.etapeKey===k||(k==="archive"&&r.dateArchivage)).length;return `<tr><td><b>${esc(m)}</b></td><td>${rows.length}</td><td>${c("validation")}</td><td>${c("docs")}</td><td>${c("note")}</td><td>${c("douane")}</td><td>${c("bae")}</td><td>${c("mise")+c("retour")}</td><td>${c("factInt")+c("validFinal")}</td><td>${rows.filter(r=>r.dateArchivage).length}</td></tr>`;}).join("")||'<tr><td colspan="10"><div class="empty-state"><b>Aucune donnée</b>Chargez votre export Excel.</div></td></tr>';
}
function renderMethodo(){
  $("#methodoBody").innerHTML=`
  <h4>1. Chaîne process & ordre attendu</h4>
  <p><code>Validation → Docs complets → Note détail → Enreg. douane → Facture douane → BAE → Mise livraison → Retour → Facture intervention → Validation finale → Archivage</code>, avec <code>ETA / RTA</code> en amont. Tout non-respect = <b>A3 inversion</b> (+${CFG.alerts.A3.w} pts).</p>
  <h4>2. Délais ETA / RTA (date pilotage = ${esc($("#pilotDate").value||CFG.pilot)})</h4><p><code>Délai = Date − Date pilotage</code>. Recalculé en local. <b>Négatif = déjà arrivé.</b> Seuils : <code>&lt; 0 alerte</code>, <code>&lt; ${CFG.etaCrit} ETA critique</code>, <code>&lt; ${CFG.rtaCrit} RTA critique</code> (réglables dans Administration).</p>
  <h4>3. SLA par transition (jours, réglables)</h4>
  <p>${Object.entries(CFG.sla).map(([k,v])=>`${k} <b>${v}j</b>`).join(" • ")}. Dépassement = stagnation, alertes A4/A5/A7/A8.</p>
  <h4>4. Les 10 alertes (poids et sévérités réglables)</h4>
  <p>${Object.entries(CFG.alerts).map(([k,d])=>`<code>${k}</code> ${d.ico||""} <b>${esc(d.t)}</b> (${d.sev}, +${d.w}${d.on===false?", <b>désactivée</b>":""}) — ${esc(d.h)}`).join("<br>")}</p>
  <h4>5. Score de criticité 0–100</h4><p>Somme des poids${" "}• bonus retard &lt;−14j (+10) • ≥3 stagnations (+10). Seuils : <code>≥${CFG.thCrit} Critique</code> • <code>≥${CFG.thHaute} Haute</code> • <code>≥${CFG.thMoy} Moyenne</code> • sinon OK.</p>
  <h4>6. Mapping intelligent</h4><p>Normalisation (minuscules, sans accents, espaces) + dictionnaire ~60 synonymes FR/EN. Score 0–100, pastille verte/orange/rouge. Modifiable avant analyse, mémorisé en local. Dates : serial Excel + JJ/MM/AAAA + ISO.</p>
  <h4>7. Confidentialité</h4><p>Lecture Excel via SheetJS <b>dans le navigateur</b>, stockage <b>IndexedDB + localStorage</b> sur ce poste uniquement. E-mails via <code>mailto</code> (votre messagerie). Déploiement Vercel/GitHub = fichiers statiques.</p>`;
}
function renderAll(){ renderPilotage(); renderKPIs(); renderComBars(); renderSteps(); renderDelays(); renderTopAlerts(); renderAlertTypes(); renderAlertTable(); renderMain(); renderPerfs(); renderBU(); }
/* ---------- Administration ---------- */
function renderAdmin(){
  $("#cfgPilot").value=$("#pilotDate").value||CFG.pilot;
  $("#cfgThCrit").value=CFG.thCrit; $("#cfgThHaute").value=CFG.thHaute; $("#cfgThMoy").value=CFG.thMoy;
  $("#cfgEtaCrit").value=CFG.etaCrit; $("#cfgRtaCrit").value=CFG.rtaCrit;
  const slaLabels={validation:"Valid→Docs",docs:"Docs→Note",note:"Note→Enreg",douane:"Enreg→Fact",factDouane:"Fact→BAE",bae:"BAE→Mise",mise:"Mise→Retour",retour:"Retour→FactInt",factInt:"FactInt→ValidFin",validFinal:"ValidFin→Archiv"};
  $("#cfgSlaGrid").innerHTML=Object.keys(SLA_DEFAULT).map(k=>`<div class="f-field"><label>${slaLabels[k]} (j)</label><input type="number" min="0" max="60" data-sla="${k}" value="${CFG.sla[k]}"></div>`).join("");
  $("#cfgAlertTable tbody").innerHTML=Object.entries(CFG.alerts).map(([k,d])=>`<tr><td><b>${k}</b> ${d.ico||""}</td><td><b>${esc(d.t)}</b><br><small style="color:#64748b">${esc(d.h)}</small></td><td><input type="checkbox" data-on="${k}" ${d.on!==false?"checked":""} style="width:18px;height:18px"></td><td><select data-sev="${k}">${["Critique","Haute","Moyenne"].map(s=>`<option ${d.sev===s?"selected":""}>${s}</option>`).join("")}</select></td><td><input type="number" min="0" max="50" data-w="${k}" value="${d.w}"></td><td><input type="number" min="0" max="90" data-days="${k}" value="${d.days}" title="Seuil jours (A6/A7/A8/A9)"></td><td><input type="color" class="cfg-color" data-col="${k}" value="${d.c}"></td></tr>`).join("");
  $("#cfgSevColors").innerHTML=["Critique","Haute","Moyenne","OK"].map(s=>`<div class="f-field"><label>${s}</label><div style="display:flex;gap:8px;align-items:center"><input type="color" class="cfg-color" data-sevc="${s}" value="${CFG.sevColors[s]}"><b>${S.enriched.filter(r=>r.crit===s).length} dossiers</b></div></div>`).join("");
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
}
function applyCfgAndRerender(msg){
  saveCfg(); applySevColors();
  $("#pilotDate").value=CFG.pilot;
  if(S.rows.length){ S.enriched=enrichAll(S.rows); fillSelects(); }
  renderAll(); renderMethodo(); renderGuide(); renderAdmin();
  if(msg) toast(msg);
}
/* ---------- Guide d'usage ---------- */
function renderGuide(){
  const el=$("#guideBody"); if(!el) return;
  el.innerHTML=`
  <div class="guide-step"><b>1. Charger l'Excel du jour (1 min).</b> 📤 <i>Charger Excel</i> ou glisser-déposer <code>Dossiers par COM.xlsx</code> (aucune donnée d'exemple : seuls vos dossiers s'affichent). Vérifiez le mapping auto (pastilles vertes), Valider. Données stockées <b>en local uniquement</b> (IndexedDB, intégralité des lignes).</div>
  <div class="guide-step"><b>2. Régler le jour de pilotage.</b> En haut 📅 <code>${esc($("#pilotDate").value||CFG.pilot)}</code> ou boutons <code>Auj.</code> / <code>−1j</code> / <code>+1j</code>, ou dans <b>Administration</b>. Tout (délais ETA/RTA, SLA, alertes, scores) est <b>recalculé instantanément</b>.</div>
  <div class="guide-step"><b>3. Filtrer partout.</b> La barre <b>🔎 Filtres globaux</b> (COM, Métier, <b>Mois/Année ETA</b>, Criticité) s'applique à <b>toutes les vues</b> : pilotage du mois, synthèse, alertes, dossiers, COM, BU. Chaque vue garde ses filtres propres en plus (recherche, délais, étapes, tri). <i>Effacer</i> réinitialise tout.</div>
  <div class="guide-step"><b>3bis. Dashboard Pilotage du mois (accueil).</b> Vue simple et claire centrée sur <b>le mois</b> (sélecteur + ← → + <i>Mois du jour J</i>) avec ses propres filtres <b>COM / Métier / Mois / Année / Criticité</b> (synchronisés avec la barre globale) + <b>filtres de dates : mois/année RTA, période ETA du…au…</b> : KPIs du mois, sévérités, COM du mois, étapes bloquantes, top priorités — <b>tout est cliquable</b> (un clic applique les filtres et ouvre la bonne vue).</div>
  <div class="guide-step"><b>3. Lire les indicateurs.</b> Cartes <code>🔴 Critique / 🟠 Haute / 🟡 Moyenne / 🟢 OK</code> en Vue d'ensemble : <b>cliquez</b> pour voir les alertes. Tableau <b>Cas préoccupants</b> : clic = fiche dossier, commentaires surlignés (RFCV, BL, BAE…).</div>
  <div class="guide-step"><b>4. Traiter les alertes.</b> Onglet Alertes → cliquez une carte <code>A1…A10</code> (ex : A6 Blocage BAE), filtrez par COM / Métier / <b>mois-année</b>, ouvrez la fiche : <b>🗓 positionnement dates</b> (chaque jalon situé en J±n sur un axe), timeline, stagnations &gt; SLA, commentaires C1–C5.</div>
  <div class="guide-step"><b>5. Piloter par COM.</b> Performance COM : classement <b>complet</b> + <b>panneau détail</b> (KPIs, criticité, alertes dominantes, volume mensuel <b>complet</b>, <b>délais moyens entre étapes vs SLA</b>, top dossiers). 👁 voir dossiers, ⬇ CSV/XLSX du COM, ✉️ e-mail.</div>
  <div class="guide-step"><b>6. Exporter sans limite.</b> <b>Toutes les listes sont intégrales</b> (COM, métiers, clients, mois, matrice BU) ; seuls les tableaux de dossiers/alertes sont <b>paginés</b> (100 à 1000 lignes/page réglables) pour rester fluides. Exports <code>CSV / XLSX / JSON</code> : volume complet, compteur annoncé, aucune troncature.</div>
  <div class="guide-step"><b>7. Régler les seuils.</b> <b>Administration</b> : SLA par étape, seuils ETA/RTA critiques (défaut ${CFG.etaCrit}j), poids et sévérités A1–A10, activation on/off, couleurs. 💾 Enregistrer → recalcul immédiat. ↩ Défaut pour réinitialiser.</div>
  <div class="guide-step"><b>8. Rituel quotidien conseillé (10 min).</b> Charger Excel → vérifier date → lire indicateurs → traiter 🔴 puis 🟠 → envoyer situations COM en difficulté → exporter la sélection du jour.</div>
  <div class="footer-note">🔒 Confidentialité : lecture Excel dans le navigateur (SheetJS), stockage IndexedDB + localStorage sur ce poste. E-mails via votre messagerie (mailto, aucune donnée envoyée par l'app). Déploiement Vercel = fichiers statiques.</div>`;
}

/* ---------- Drawer ---------- */
function openDrawer(i){
  const r=S.enriched.find(x=>x._i===i); if(!r) return;
  $("#dCrit").innerHTML=`${pill(r.crit)} <span class="pill info">score ${r.score}</span> <span class="pill grey">${esc(r.etape)}</span>`;
  $("#dTitle").textContent="Dossier "+(r.dossier||"—");
  $("#dSub").innerHTML=`${esc(r.com||"—")} • ${esc(r.client||"—")} • ${esc(r.designation||"")} • ETA ${fmtD(r.dateETA)} (${r.delaiETA??"—"}j) • RTA ${fmtD(r.dateRTA)} (${r.delaiRTA??"—"}j)`;
  const stepRow=(l,d,extra)=>{ const done=!!d; const late=extra&&extra.late; return `<div class="t-step ${done?(late?"late-step":"done"):"todo"}"><b>${l}</b><div>${done?fmtD(d)+(extra?.txt?" — "+extra.txt:""):"En attente"}</div></div>`; };
  const invTxt=r.inv.length?`<div class="footer-note">⚠ <b>Inversions :</b> ${esc(r.inv.join(" ; "))}</div>`:"";
  const stagTxt=r.stagn.length?`<div class="footer-note">⏱ <b>Stagnations &gt; SLA :</b> ${esc(r.stagn.map(s=>s.label+" "+s.jours+"j").join(" • "))}</div>`:"";
  $("#dBody").innerHTML=`
    <div class="chips" style="margin-bottom:8px">${r.alerts.map(a=>`<span class="pill ${ALERT_DEFS[a.c].sev==="Critique"?"crit":ALERT_DEFS[a.c].sev==="Haute"?"haute":"moy"}">${a.c}</span>`).join("")||'<span class="pill ok">Aucune alerte</span>'}</div>
    ${r.alerts.map(a=>`<div style="background:${a.c==="A1"||a.c==="A3"||a.c==="A6"?"#fdecec":"#fff7ed"};border:1px solid #f0d9c8;border-radius:10px;padding:8px 10px;margin-bottom:6px"><b>${a.c} — ${esc(ALERT_DEFS[a.c].t)}</b><br><span style="font-size:12.5px">${esc(a.d)}</span></div>`).join("")}
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
      ${stepRow("ETA (arrivée prévue)",r.dateETA)}${stepRow("RTA",r.dateRTA)}
      ${STEPS.map(s=>stepRow(s.label,r[s.dateKey])).join("")}
    </div>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn small" id="dCom">Filtrer ce COM</button><button class="btn small" id="dDos">Copier n° dossier</button></div>`;
  $("#drawer").classList.add("open");
  $("#dCom").onclick=()=>{ setF("com",r.com||""); goto("dossiers"); $("#drawer").classList.remove("open"); };
  $("#dDos").onclick=()=>{ navigator.clipboard?.writeText(r.dossier||""); toast("N° dossier copié"); };
}

/* ---------- Navigation ---------- */
function goto(v){
  S.activeView=v;
  $$(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===v));
  $$(".view").forEach(s=>s.classList.toggle("active",s.id==="view-"+v));
  $("#viewTitle").textContent={overview:"Vue d'ensemble",pilotage:"Pilotage du mois — dossiers du mois",alertes:"Alertes",dossiers:"Dossiers",perfs:"Performance COM",bu:"Vision BU / Section",admin:"Administration",guide:"Guide d'usage",methodo:"Méthodologie"}[v]||v;
  window.scrollTo({top:0,behavior:"smooth"});
}

/* ---------- Import ---------- */
function showMapping(headers,sampleRows,done){
  const auto=autoMap(headers);
  const tb=$("#mapTable tbody");
  tb.innerHTML=FIELDS.map(f=>{const m=auto[f.k];return `<tr><td><b>${f.label}</b><br><small style="color:#64748b">${f.k}</small></td><td><select data-k="${f.k}" style="width:100%;border:1px solid #dfe6f0;border-radius:8px;padding:7px"><option value="">— ignorer —</option>${headers.map(h=>`<option ${h===m.col?"selected":""}>${esc(h)}</option>`).join("")}</select></td><td><span class="conf ${m.conf}">${m.conf==="high"?"✓ haute":m.conf==="mid"?"~ moyenne":"? faible"}</span></td></tr>`;}).join("");
  $("#mapBack").classList.add("open");
  $("#mapClose").onclick=$("#mapCancel").onclick=()=>{ $("#mapBack").classList.remove("open"); };
  $("#mapValid").onclick=()=>{
    const mapping={}; $$("#mapTable select").forEach(s=>{mapping[s.dataset.k]={col:s.value,conf:"high",score:100};});
    $("#mapBack").classList.remove("open"); done(mapping);
  };
}
async function ingest(headers, body, fileName){
  $("#loadStatus").textContent=`Analyse de ${body.length.toLocaleString("fr-FR")} lignes…`;
  showMapping(headers, body.slice(0,5), async mapping=>{
    S.headers=headers; S.mapping=mapping; S.fileName=fileName;
    try{ localStorage.setItem("spot_mapping",JSON.stringify(mapping)); localStorage.setItem("spot_file",fileName); }catch{}
    const t0=performance.now();
    // applique mapping par chunks pour rester fluide
    const mapped=applyMapping(headers, body, mapping);
    S.rows=mapped; S.enriched=enrichAll(mapped);
    /* dashboard : mois du jour J par défaut s'il existe dans les données */
    const pym=pilotYM();
    S.pilMonth=S.enriched.some(r=>r.etaYM===pym)?pym:"";
    fillSelects(); S.pageMain=0; S.pageAlert=0; renderAll(); renderMethodo(); renderGuide();
    try{ await IDB.put("dossiers",{fileName,rows:mapped}); $("#storageInfo").textContent=`Stockage : IndexedDB local ✓ (${mapped.length.toLocaleString("fr-FR")} lignes)`; }catch{ $("#storageInfo").textContent="Stockage : mémoire (navigateur saturé) — exports toujours intégraux"; }
    toast(`✅ <b>${S.enriched.length.toLocaleString("fr-FR")} dossiers</b> analysés en ${((performance.now()-t0)/1000).toFixed(1)}s — ${S.enriched.reduce((s,r)=>s+r.alerts.length,0)} alertes, ${S.enriched.filter(r=>r.crit==="Critique").length} critiques.`);
    $("#loadStatus").textContent=`${S.enriched.length.toLocaleString("fr-FR")} dossiers • ${fileName}`;
  });
}
function readFile(f){
  if(!f) return;
  $("#loadStatus").textContent="Lecture "+f.name+" ("+(f.size/1048576).toFixed(1)+" Mo)…";
  const rd=new FileReader();
  rd.onload=e=>{
    try{
      const wb=XLSX.read(e.target.result,{type:"array",cellDates:true});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const arr=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:""});
      if(arr.length<2){ toast("❌ Fichier vide"); return; }
      const headers=arr[0].map(h=>String(h||"").trim());
      ingest(headers, arr.slice(1).filter(r=>r.some(c=>String(c).trim()!=="")), f.name);
    }catch(err){ console.error(err); toast("❌ Erreur lecture : "+err.message); }
  };
  rd.readAsArrayBuffer(f);
}
function csvLine(r){
  const q=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  return [r.crit,r.score,r.dossier,r.com,r.metier,r.sousMetier,r.client,r.sousCompte,r.designation,fmtD(r.dateETA),r.delaiETA,fmtD(r.dateRTA),r.delaiRTA,r.etape,r.alerts.map(a=>a.c+":"+a.d).join(" | "),r.comments,fmtD(r.dateValidation),fmtD(r.dateDocs),fmtD(r.dateNote),fmtD(r.dateEnreg),fmtD(r.dateFactDouane),fmtD(r.dateBAE),fmtD(r.dateMise),fmtD(r.dateRetour),fmtD(r.dateFactInt),fmtD(r.dateValidFinal),fmtD(r.dateArchivage)].map(q).join(";");
}
/* Export volume complet : construction par blocs, aucune troncature, tout en local */
function toCSV(rows){
  const head="crit;score;dossier;com;metier;sousMetier;client;sousCompte;designation;eta;delaiETA;rta;delaiRTA;etape;alertes;commentaires;validation;docs;note;enreg;factDouane;bae;mise;retour;factInt;validFinal;archivage";
  const CH=2000, parts=[head];
  for(let i=0;i<rows.length;i+=CH){
    const blk=[];
    for(let j=i;j<Math.min(i+CH,rows.length);j++) blk.push(csvLine(rows[j]));
    parts.push(blk.join("\n"));
  }
  return parts.join("\n");
}
function download(name,content,type){ const b=new Blob([content],{type}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),4000); }
function exportXLSX(name, rows){
  try{
    const data=rows.map(r=>({"Criticité":r.crit,"Score":r.score,"N° dossier":r.dossier,"COM":r.com,"Métier":r.metier,"Sous-métier":r.sousMetier,"Client":r.client,"Sous-compte":r.sousCompte,"Désignation":r.designation,"ETA":fmtD(r.dateETA),"Délai ETA":r.delaiETA,"RTA":fmtD(r.dateRTA),"Délai RTA":r.delaiRTA,"Étape":r.etape,"Alertes":r.alerts.map(a=>a.c+" : "+a.d).join(" | "),"Commentaires":r.comments,"Validation":fmtD(r.dateValidation),"Docs complets":fmtD(r.dateDocs),"Note détail":fmtD(r.dateNote),"Enreg. douane":fmtD(r.dateEnreg),"Facture douane":fmtD(r.dateFactDouane),"BAE":fmtD(r.dateBAE),"Mise livraison":fmtD(r.dateMise),"Retour":fmtD(r.dateRetour),"Fact. intervention":fmtD(r.dateFactInt),"Validation finale":fmtD(r.dateValidFinal),"Archivage":fmtD(r.dateArchivage)}));
    const ws=XLSX.utils.json_to_sheet(data);
    ws["!cols"]=[{wch:10},{wch:7},{wch:14},{wch:14},{wch:8},{wch:10},{wch:28},{wch:12},{wch:24},{wch:12},{wch:9},{wch:12},{wch:9},{wch:22},{wch:50},{wch:50},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:14},{wch:14},{wch:12}];
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"SPOT");
    XLSX.writeFile(wb,name);
    toast(`⬇ <b>${esc(name)}</b> — export intégral : <b>${rows.length.toLocaleString("fr-FR")} lignes</b>, aucune troncature`);
  }catch(e){ console.error(e); toast("❌ Export XLSX impossible : "+e.message); }
}
/* ---------- E-mail situation par COM (100% local via messagerie) ---------- */
let MAIL_COM="";
function buildComReport(com){
  const P=todayPilot();
  const rows=S.enriched.filter(r=>r.com===com);
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
    `CSV détaillé du COM en pièce jointe (à joindre depuis le téléchargement).`,``,`Cordialement,`,`SPOT Cockpit AGL (100% local)`
  ];
  return {subj, body:lines.join("\n"), rows};
}
function openMailModal(com){
  MAIL_COM=com;
  const {subj,body}=buildComReport(com);
  $("#mailSubject").value=subj; $("#mailBody").value=body; $("#mailTo").value="";
  $("#mailBack").classList.add("open");
}

/* ---------- Init ---------- */
async function init(){
  loadCfg(); applySevColors();
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
  $("#cfgSave").onclick=()=>{ collectAdmin(); applyCfgAndRerender("💾 <b>Réglages enregistrés</b> (local) — alertes recalculées"); };
  $("#cfgReset").onclick=()=>{ if(!confirm("Réinitialiser tous les réglages ?"))return; CFG=JSON.parse(JSON.stringify(DEFAULT_CFG)); applyCfgAndRerender("↩ Réglages par défaut restaurés"); };
  $("#cfgToday").onclick=()=>{ $("#cfgPilot").value=iso(new Date()); };
  $("#cfgReport").onclick=()=>{ $("#cfgPilot").value="2026-09-28"; };
  $("#guidePrint").onclick=()=>window.print();
  // dashboard pilotage du mois
  $("#pilMonth").onchange=e=>{ S.pilMonth=e.target.value; renderPilotage(); };
  $("#pilPrev").onclick=()=>{ S.pilMonth=ymShift(S.pilMonth||pilotYM(),-1); setSelect($("#pilMonth"),S.pilMonth); renderPilotage(); };
  $("#pilNext").onclick=()=>{ S.pilMonth=ymShift(S.pilMonth||pilotYM(),1); setSelect($("#pilMonth"),S.pilMonth); renderPilotage(); };
  $("#pilJ").onclick=()=>{ S.pilMonth=pilotYM(); setSelect($("#pilMonth"),S.pilMonth); renderPilotage(); toast("📅 Mois du jour J : <b>"+ymLabel(S.pilMonth)+"</b>"); };
  // filtres du dashboard (miroirs globaux + dates)
  ["pCom","pMetier","pCrit","pMonth","pYear","pRtaMonth","pRtaYear"].forEach(id=>{const el=document.getElementById(id); if(el) el.addEventListener("change",()=>{ const k={pCom:"com",pMetier:"metier",pCrit:"crit",pMonth:"month",pYear:"year",pRtaMonth:"rtaMonth",pRtaYear:"rtaYear"}[id]; setF(k,el.value); });});
  ["pFrom","pTo"].forEach(id=>{const el=document.getElementById(id); if(el) el.addEventListener("change",()=>{ F.dFrom=$("#pFrom").value; F.dTo=$("#pTo").value; S.pageMain=0; S.pageAlert=0; renderAll(); });});
  $("#pClearF").onclick=()=>{ clearAllFilters(); toast("Filtres réinitialisés"); };
  // mail modal
  $("#mailClose").onclick=()=>$("#mailBack").classList.remove("open");
  $("#mailCopy").onclick=()=>{ navigator.clipboard?.writeText($("#mailBody").value); toast("📋 Corps de l'e-mail copié"); };
  $("#mailCsv").onclick=()=>{ download(`spot_situation_${MAIL_COM}.csv`,"﻿"+toCSV(S.enriched.filter(r=>r.com===MAIL_COM)),"text/csv"); };
  $("#mailOpen").onclick=()=>{ const to=$("#mailTo").value.trim(), su=$("#mailSubject").value, bo=$("#mailBody").value; window.location.href=`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(su)}&body=${encodeURIComponent(bo)}`; toast("📧 Messagerie ouverte — joignez le CSV du COM"); };
  ["fCom","fMetier","fSous","fClient","fSousCpte","fCrit","fDelay","fEta1","fEta2","fStep","fMonth","fYear"].forEach(id=>{const el=document.getElementById(id); if(el) el.addEventListener("change",()=>{
    if(id==="fCom") F.com=el.value; else if(id==="fMetier") F.metier=el.value; else if(id==="fCrit") F.crit=el.value;
    else if(id==="fMonth") F.month=el.value; else if(id==="fYear") F.year=el.value;
    if(["fCom","fMetier","fCrit","fMonth","fYear"].includes(id)){ setSelect($("#gCom"),F.com); setSelect($("#gMetier"),F.metier); setSelect($("#gCrit"),F.crit); setSelect($("#gMonth"),F.month); setSelect($("#gYear"),F.year); }
    S.pageMain=0; renderAll();
  });});
  ["gCom","gMetier","gCrit","gMonth","gYear"].forEach(id=>{const el=document.getElementById(id); if(el) el.addEventListener("change",()=>{ const k={gCom:"com",gMetier:"metier",gCrit:"crit",gMonth:"month",gYear:"year"}[id]; setF(k,el.value); });});
  $("#gClear").onclick=()=>{ clearAllFilters(); toast("Filtres réinitialisés"); };
  $("#fSearch").addEventListener("input",()=>{S.pageMain=0;renderMain();});
  $("#alertSearch").addEventListener("input",()=>{S.pageAlert=0;renderAlertTable();});
  ["alertCom","alertMetier","alertMonth","alertYear"].forEach(id=>{const el=document.getElementById(id); if(el) el.addEventListener("change",()=>{S.pageAlert=0;renderAlertTable();});});
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
  const fullToast=n=>`⬇ Export intégral : <b>${n.toLocaleString("fr-FR")} lignes</b> — aucune troncature (100% local)`;
  $("#btnCsv").onclick=()=>{const r=filteredMain(); download("spot_dossiers_filtres.csv","﻿"+toCSV(r),"text/csv"); toast(fullToast(r.length));};
  $("#btnXlsx").onclick=()=>exportXLSX("spot_dossiers_filtres.xlsx",filteredMain());
  $("#btnJson").onclick=()=>{const r=filteredMain(); download("spot_dossiers_filtres.json",JSON.stringify(r),"application/json"); toast(fullToast(r.length));};
  $("#alertExport").onclick=()=>{const r=filteredAlerts().map(x=>x.r); download("spot_alertes.csv","﻿"+toCSV(r),"text/csv"); toast(fullToast(r.length));};
  $("#alertExportX").onclick=()=>exportXLSX("spot_alertes.xlsx",filteredAlerts().map(x=>x.r));
  $("#perfExport").onclick=()=>{const t=$("#perfTable");let csv="COM;Dossiers;Critique+Haute;Score;Verdict\n";$$("#perfTable tbody tr").forEach(tr=>{csv+=[...tr.children].slice(0,4).map(td=>td.innerText.replace(/\n/g," ")).join(";")+"\n";});download("spot_performance_com.csv","﻿"+csv,"text/csv");};
  $("#perfExportX").onclick=()=>{ const by={}; S.enriched.forEach(r=>{const k=r.com||"(vide)";(by[k]=by[k]||{n:0,sc:0,crit:0});by[k].n++;by[k].sc+=r.score;by[k].crit+=(r.crit==="Critique"||r.crit==="Haute")?1:0;}); const data=Object.entries(by).map(([k,v])=>({"COM":k,"Dossiers":v.n,"% Crit+Haute":Math.round(v.crit/v.n*100),"Score moyen":(v.sc/v.n).toFixed(1)})); const ws=XLSX.utils.json_to_sheet(data); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"COM"); XLSX.writeFile(wb,"spot_performance_com.xlsx"); toast("⬇ Performance COM exportée (XLSX)"); };
  $("#btnExport").onclick=()=>{const r=filteredMain(); download("spot_export_"+(S.fileName||"cockpit").replace(/\.[^.]+$/,"")+".csv","﻿"+toCSV(r),"text/csv"); toast(fullToast(r.length));};
  $("#comDetailSee").onclick=()=>{ if(S.selCom) setF("com",S.selCom); goto("dossiers"); };
  $("#comDetailCsv").onclick=()=>{ if(!S.selCom) return; const r=S.enriched.filter(x=>x.com===S.selCom); download(`spot_situation_${S.selCom}.csv`,"﻿"+toCSV(r),"text/csv"); toast(fullToast(r.length)); };
  $("#comDetailXlsx").onclick=()=>{ if(S.selCom) exportXLSX(`spot_situation_${S.selCom}.xlsx`,S.enriched.filter(x=>x.com===S.selCom)); };
  $("#comDetailMail").onclick=()=>{ if(S.selCom) openMailModal(S.selCom); };
  $("#btnReset").onclick=async()=>{ if(!confirm("Effacer les données locales ?"))return; S.rows=[];S.enriched=[];S.fileName="";await IDB.del("dossiers");localStorage.removeItem("spot_mapping");localStorage.removeItem("spot_file");fillSelects();renderAll();toast("🗑 Données locales effacées"); };
  $("#btnImport").onclick=()=>$("#fileInput").click();
  $("#fileInput").onchange=e=>readFile(e.target.files[0]);
  $("#fileInput2").onchange=e=>readFile(e.target.files[0]);
  const dz=$("#dropZone"); ["dragover","dragenter"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add("over");})); ["dragleave","drop"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove("over");})); dz.addEventListener("drop",e=>readFile(e.dataTransfer.files[0]));
  await IDB.open();
  // restauration locale — aucune donnée factice : sans fichier, état vide + appel au chargement
  try{
    const saved=await IDB.get("dossiers");
    const mp=localStorage.getItem("spot_mapping"); if(mp) S.mapping=JSON.parse(mp);
    const fn=localStorage.getItem("spot_file");
    if(saved&&saved.rows&&saved.rows.length){ S.rows=saved.rows; S.fileName=fn||saved.fileName||"restauré"; S.enriched=enrichAll(S.rows); fillSelects(); renderAll(); $("#loadStatus").textContent=S.enriched.length.toLocaleString("fr-FR")+" dossiers restaurés (local) • "+S.fileName; toast("💾 Données locales restaurées : "+S.enriched.length.toLocaleString("fr-FR")+" dossiers."); }
    else { fillSelects(); renderAll(); $("#loadStatus").textContent="En attente de votre export Excel — glissez le fichier ici."; }
  }catch{ fillSelects(); renderAll(); }
  renderAll();
}
document.readyState==="loading"?document.addEventListener("DOMContentLoaded",init):init();
})();
