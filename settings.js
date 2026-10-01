/* Serializable alert rules. No executable code is accepted in settings files. */
(() => {
  "use strict";
  const fields=["com","metier","sousMetier","client","sousCompte","designation","dossier","auteur","comments","com1","com2","com3","com4","com5","delaiETA","delaiRTA","etapeKey","stagnCount","dateETA","dateRTA","dateValidation","dateDocs","dateNote","dateEnreg","dateFactDouane","dateBAE","dateMise","dateRetour","dateFactInt","dateValidFinal","dateArchivage"];
  const operators={empty:"Est vide",present:"Est renseigné",eq:"Est égal à",neq:"Est différent de",contains:"Contient",gt:"Est supérieur à",lt:"Est inférieur à",olderThan:"Date passée depuis plus de (jours)"};
  function evaluate(condition,row,pilot){
    const value=row[condition.field],target=condition.value;
    const empty=value==null||String(value).trim()==="";
    if(condition.op==="empty") return empty;
    if(condition.op==="present") return !empty;
    if(empty) return false;
    if(condition.op==="eq") return String(value).toLowerCase()===String(target).toLowerCase();
    if(condition.op==="neq") return String(value).toLowerCase()!==String(target).toLowerCase();
    if(condition.op==="contains") return String(value).toLowerCase().includes(String(target).toLowerCase());
    if(condition.op==="olderThan") return value instanceof Date&&!isNaN(value)&&(pilot-value)/86400000>Number(target);
    const number=Number(value);
    if(!Number.isFinite(number)) return false;
    return condition.op==="gt"?number>Number(target):condition.op==="lt"?number<Number(target):false;
  }
  function matches(rule,row,pilot){
    if(!rule.conditions?.length) return false;
    return rule.mode==="any"?rule.conditions.some(c=>evaluate(c,row,pilot)):rule.conditions.every(c=>evaluate(c,row,pilot));
  }
  function validate(input,defaults){
    const raw=input?.format==="spot-settings"?input.settings:input;
    if(!raw||typeof raw!=="object"||Array.isArray(raw)||!raw.alerts||typeof raw.alerts!=="object"||Array.isArray(raw.alerts)) throw Error("Fichier de réglages SPOT invalide");
    if(input.format==="spot-settings"&&input.version!==1) throw Error("Version du fichier JSON non prise en charge");
    const copy=JSON.parse(JSON.stringify(defaults));
    const num=(v,label,min,max)=>{const n=Number(v);if(typeof v!=="number"||!Number.isFinite(n)||n<min||n>max)throw Error("Valeur invalide : "+label);return n;};
    if(raw.pilot!==undefined){if(!/^\d{4}-\d{2}-\d{2}$/.test(raw.pilot)||isNaN(new Date(raw.pilot)))throw Error("Date de pilotage invalide");copy.pilot=raw.pilot;}
    for(const k of ["thCrit","thHaute","thMoy","etaCrit","rtaCrit"]) if(raw[k]!==undefined)copy[k]=num(raw[k],k,k.startsWith("th")?0:-36500,k.startsWith("th")?100:36500);
    if(copy.thCrit<copy.thHaute||copy.thHaute<copy.thMoy)throw Error("Seuils : Critique ≥ Haute ≥ Moyenne requis");
    for(const k of Object.keys(copy.sla))if(raw.sla?.[k]!==undefined)copy.sla[k]=num(raw.sla[k],k,0,36500);
    const color=v=>typeof v==="string"&&/^#[0-9a-f]{6}$/i.test(v);
    for(const k of Object.keys(copy.sevColors))if(raw.sevColors?.[k]!==undefined){if(!color(raw.sevColors[k]))throw Error("Couleur invalide");copy.sevColors[k]=raw.sevColors[k];}
    for(const [code,d] of Object.entries(raw.alerts)){
      if(!/^[A-Z][A-Z0-9_]{0,19}$/.test(code)||!d||typeof d!=="object"||Array.isArray(d))throw Error("Code ou règle invalide : "+code);
      if(typeof d.t!=="string"||!d.t.trim()||d.t.length>200||!["Critique","Haute","Moyenne"].includes(d.sev)||!color(d.c))throw Error("Libellé, sévérité ou couleur invalide : "+code);
      if(d.on!==undefined&&typeof d.on!=="boolean"||d.deleted!==undefined&&typeof d.deleted!=="boolean")throw Error("État invalide : "+code);
      const rule={t:d.t.trim(),sev:d.sev,c:d.c,w:num(d.w,code+" poids",0,100),days:num(d.days??0,code+" jours",0,36500),on:d.on!==false,deleted:d.deleted===true,h:typeof d.h==="string"?d.h.slice(0,2000):"",ico:typeof d.ico==="string"&&!/[<>]/.test(d.ico)?d.ico.slice(0,10):"•"};
      if(d.conditions!==undefined){
        if(!Array.isArray(d.conditions)||!d.conditions.length||d.conditions.length>30||!["all","any"].includes(d.mode??"all"))throw Error("Conditions invalides : "+code);
        rule.mode=d.mode||"all";
        rule.conditions=d.conditions.map(c=>{
          if(!c||!fields.includes(c.field)||!Object.hasOwn(operators,c.op))throw Error("Champ ou opérateur invalide : "+code);
          let value=c.value??"";
          if(["gt","lt","olderThan"].includes(c.op)){
            if(!["string","number"].includes(typeof value)||String(value).trim()==="")throw Error("Valeur numérique requise : "+code);
            value=num(Number(value),code+" condition",c.op==="olderThan"?0:-36500,36500);
          }
          else if(!["string","number"].includes(typeof value))throw Error("Valeur de condition invalide");
          if(String(value).length>2000)throw Error("Valeur de condition trop longue");
          if(c.op==="olderThan"&&!c.field.startsWith("date"))throw Error("Choisissez un champ date");
          return {field:c.field,op:c.op,value};
        });
      }else if(!Object.hasOwn(defaults.alerts,code))throw Error("Conditions requises pour : "+code);
      copy.alerts[code]=rule;
    }
    return copy;
  }
  /* Réglages Overdue (règles L1-L10 : périmètre, seuils, visibilité). Anciens fichiers sans cette section : valeurs par défaut. */
  function validateOverdue(raw,defaults){
    const copy=JSON.parse(JSON.stringify(defaults));
    if(raw==null) return copy;
    if(typeof raw!=="object"||Array.isArray(raw)) throw Error("Réglages Overdue invalides");
    const num=(v,label,min,max)=>{const n=Number(v);if(typeof v!=="number"||!Number.isFinite(n)||n<min||n>max)throw Error("Valeur invalide : "+label);return n;};
    const color=v=>typeof v==="string"&&/^#[0-9a-f]{6}$/i.test(v);
    if(raw.perim!==undefined){
      if(!Array.isArray(raw.perim)||!raw.perim.length||raw.perim.length>20||raw.perim.some(s=>typeof s!=="string"||!s.trim()||s.length>20)) throw Error("Périmètre Overdue invalide");
      copy.perim=raw.perim.map(s=>s.trim());
    }
    if(raw.days!==undefined){
      if(!raw.days||typeof raw.days!=="object"||Array.isArray(raw.days)) throw Error("Seuils Overdue invalides");
      for(const k of Object.keys(copy.days)) if(raw.days[k]!==undefined) copy.days[k]=num(raw.days[k],"overdue "+k,0,3650);
      for(const k of Object.keys(raw.days)) if(!Object.hasOwn(copy.days,k)) throw Error("Seuil Overdue inconnu : "+k);
    }
    if(raw.rules!==undefined){
      if(!raw.rules||typeof raw.rules!=="object"||Array.isArray(raw.rules)) throw Error("Règles Overdue invalides");
      for(const [code,d] of Object.entries(raw.rules)){
        if(!Object.hasOwn(copy.rules,code)) throw Error("Règle Overdue inconnue : "+code);
        if(!d||typeof d!=="object"||Array.isArray(d)) throw Error("Règle Overdue invalide : "+code);
        const r=copy.rules[code];
        if(d.on!==undefined){ if(typeof d.on!=="boolean") throw Error("État invalide : "+code); r.on=d.on; }
        if(d.sev!==undefined){ if(!["Critique","Haute","Moyenne"].includes(d.sev)) throw Error("Sévérité invalide : "+code); r.sev=d.sev; }
        if(d.c!==undefined){ if(!color(d.c)) throw Error("Couleur invalide : "+code); r.c=d.c; }
        if(d.deleted!==undefined){ if(typeof d.deleted!=="boolean") throw Error("État invalide : "+code); r.deleted=d.deleted; }
      }
    }
    return copy;
  }
  window.SpotSettings={fields,operators,matches,validate,validateOverdue};
})();
