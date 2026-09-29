# 🛰 SPOT Cockpit — Pilotage quotidien AGL

Outil de pilotage quotidien sur base de l'export **« Dossiers par COM »**, charte **AGL (Africa Global Logistics)**.
**100% local : la donnée reste dans le navigateur.** Déployable **GitHub + Vercel** (statique uniquement).

Nouveau (v8) : **Épinglés direction** (page dédiée, notes du directeur, export Excel), **outil de cadrage de rapport** (🧭 Rapport : périmètre COM/métier/alertes/dates → Excel mis en forme ou Word structuré, logo), **infobulle des commentaires** au survol des lignes, exports **sans plafond de volume**.

## 1. Démarrage (2 min)

```bash
cd spot-cockpit
python3 -m http.server 8080
# ouvrir http://localhost:8080
```

Ou ouvrez `index.html` directement (File → Open). CDN SheetJS requis pour lire Excel (lib seule, aucune donnée envoyée).

## 2. Chargement Excel + mapping intelligent

1. Cliquez **📤 Charger Excel** ou glissez `Dossiers par COM (2).xlsx` (~10 Mo, ~17 000 lignes et plus, sans limite).
2. Fenêtre **Mapping intelligent** : correspondance auto (normalisation accents/casse + ~60 synonymes FR/EN) avec pastille confiance. Ajustez si besoin → **Valider & analyser**.
3. Données stockées en **IndexedDB en intégralité** (poste uniquement) + mapping en `localStorage`. Rechargées au prochain démarrage. Sans fichier : état vide, aucun chiffre fictif.
4. Changez la **Date pilotage** (défaut 28/09/2026 = date du rapport) : tous délais/SLA recalculés.

Colonnes attendues (30) : `COM, Métier, Sous-métier, Client, Sous-compte, Désignation, Poids, Unité poids, Numéro dossier, Commentaire 1..5, Date ETA, Délai ETA, Date RTA, Délai RTA, Date validation, Auteur ouverture, Date documents complets, Date validation note de détail, Date enregistrement douane, Date facture douane, Date obtention BAE, Date mise en livraison, Date retour livraison, Date facture intervention, Date validation final, Date archivage`.

## 3. Règles d'alerte (croisées des 4 captures)

Ordre process : `Validation → Docs → Note → Enreg → Facture → BAE → Mise → Retour → FactInt → ValidFin → Archivage`.

| Code | Alerte | Sévérité | Déclencheur |
|---|---|---|---|
| A1 | ETA dépassée, BAE manquant | Critique | ETA < pilotage et BAE vide |
| A2 | RTA dépassée, non archivé | Haute | RTA < pilotage et archivage vide |
| A3 | Inversion chronologique | Critique | étape datée avant précédente |
| A4 | Stagnation amont | Haute | Valid→Docs 3j / Docs→Note 2j / Note→Enreg 2j dépassés |
| A5 | Stagnation douane | Haute | Enreg→Facture 3j / Facture→BAE 3j dépassés |
| A6 | Blocage BAE | Critique | Facture présente, BAE vide > 3j |
| A7 | Blocage livraison | Haute | BAE présent, mise/retour > SLA 2j/3j |
| A8 | Clôture en retard | Moyenne | Retour > 5j sans facture/validation/archivage |
| A9 | Qualité / MAJ masse | Moyenne | même date massive, ex 28/09 sur >30% |
| A10 | Donnée manquante/doublon | Moyenne | COM/Client/N° vide ou doublon |

**Score 0–100** : A1+30, A3/A6+25, A2+20, A7+18, A4/A5+15, A8+10, A9/A10+8, bonus retard <−14j +10, ≥3 stagnations +10. Seuils : ≥55 Critique, ≥30 Haute, ≥12 Moyenne, sinon OK. Le rouge des captures = Critique/Haute.

## 4. Vues & navigation

- **Filtres globaux (partout)** : `COM / Métier / Mois ETA / Année ETA / Criticité / 🚨 Types d'alerte multi-critères (1 ou +)` + compteur de périmètre — appliqués à toutes les vues.
- **Pilotage du mois (accueil)** : dashboard simple — sélecteur de mois + ← → + *Mois du jour J*, **filtres COM/Métier/Mois/Année/Criticité synchronisés + filtres de dates (mois/année RTA, période ETA)**, 6 KPIs du mois, sévérités, COM du mois, étapes bloquantes, top 10 priorités — **tout cliquable** vers Alertes/Dossiers/fiches (filtres propagés).
- **Vue d'ensemble** : 6 KPI + **4 indicateurs de sévérité cliquables** + 4 jauges SVG + COM en difficulté (cliquable) + étape bloquante + distribution délais + top alertes + **cas préoccupants cliquables**.
- **Alertes** : 10 cartes par type (icône, sévérité, **couleur paramétrable**, on/off) cliquables/filtrables, COM / Métier / Mois / Année, recherche texte, tri, exports **CSV + XLSX intégraux**.
- **Dossiers** : filtres globaux + Sous-métier / Client / Sous-compte / Mois / Année / recherche textuelle / filtre délai / ETA du…au… / étape, tri, **pagination 100→1000 réglable**, fiche détail (timeline, **🗓 positionnement dates J±n**, **commentaires C1–C5 en bulles, mots-clés surlignés**).
- **Performance COM** : classement **intégral** + **panneau détail** (6 KPIs, criticité, alertes dominantes cliquables, volume mensuel intégral, **délais moyens entre étapes vs SLA**, top 8 dossiers), verdict 🔴🟠🟢, **👁 voir / ⬇ CSV / ✉️ e-mail de situation** par COM.
- **Vision BU** : par Métier/Sous-métier, top clients à risque, matrice Métier × étape.
- **Administration** : jour J modifiable (+ Auj./−1j/+1j), SLA, seuils criticité et ETA/RTA, activation/sévérité/poids/seuil/couleur par alerte, couleurs des sévérités. Sauvegarde locale, recalcul instantané.
- **Guide d'usage** : onglet in-app + `GUIDE_USAGE.md` (rituel 10 min).
- **Épinglés** : épinglez un dossier depuis **Dossiers (★)** ou sa fiche (**☆ Épingler**) ; page dédiée avec recherche, tri, **cases à cocher**, **note du directeur** (locale), export Excel de la sélection ou de tout, badge dans le menu.
- **🧭 Rapport (cadrage)** : modal de cadrage — COM (multi), métier, **types d'alerte (multi)**, criticité, période ETA, mois/année, titre, logo (AGL intégré ou fichier choisi) → **👁 Aperçu**, **📊 Excel (.xlsx)**, **🎨 Excel mis en forme (.xls, en-tête coloré + logo)**, **📄 Word structuré (.doc, 6 sections : synthèse, criticité, par COM, top 15, alertes détaillées, épinglés)**.
- **Infobulle** : survolez une ligne (Dossiers, Alertes, Épinglés, tops, détail COM) → **commentaires complets + note direction** en info-bulle.
- **Exports** : CSV/XLSX/JSON **intégraux (aucune troncature, volume complet, compteur annoncé)** + par COM. Impression via navigateur.

## 5. Déploiement GitHub + Vercel (données toujours locales)

```bash
cd spot-cockpit
git init && git add . && git commit -m "SPOT Cockpit AGL — pilotage quotidien 100% local"
gh repo create spot-cockpit --public --source=. --push
# Vercel :
vercel --prod
# ou : import GitHub repo sur vercel.com → Framework: Other, Root: spot-cockpit
```

`vercel.json` fourni (statique + headers sécurité). Aucune variable d'env, aucune API, aucune base distante.

## 6. Confidentialité

- Lecture Excel via SheetJS **dans le navigateur**.
- Stockage **IndexedDB `spot-cockpit` + localStorage** sur ce poste.
- Aucun `fetch` de données. Vérifiable : onglet Network vide après chargement CDN.
- 🗑 bouton = purge locale.

## 7. Fichiers

```
spot-cockpit/
  index.html  — structure + vues (overview, alertes, dossiers, perfs, BU, admin, guide, méthodo)
  styles.css  — charte AGL navy #0f2a52 (+ sévérités, bulles commentaires, admin)
  app.js      — mapping, moteur alertes/criticité paramétrable, KPIs, filtres, e-mails, exports XLSX
  assets/agl-logo.png
  vercel.json / README.md / GUIDE_USAGE.md
```
