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

### Évolution et temps de traitement (v14)

- **Archivés masqués** : toggle permanent, appliqué aux vues métier, aux rapports et aux exports filtrés. Préférence mémorisée ; « Effacer » remet les archivés dans le périmètre.
- **Pastille 💬** : repère les dossiers commentés dans les tableaux ; toggle d’affichage mémorisé. Les commentaires restent lisibles dans la fiche et au survol.
- **Évolution** : ouvertures, arrivées réelles (RTA), livraisons et archivages par mois ; états en fin de mois reconstitués uniquement depuis les jalons datés. L’état actuel par cohorte ETA est présenté séparément.
- **Temps de traitement** : moyenne, médiane exacte, min/max, effectif des séquences terminées, attentes en cours et âge médian, inversions exclues. Répartition 0–2 / 3–7 / 8–14 / >14 jours et part des jours cumulés observés par séquence.
- **Qualité des données (% du périmètre)** : chaque séquence est partitionnée en terminées / en attente / inversions / clôturées sans cette étape / départ futur / date de départ non saisie, avec barre de qualité. Une statistique n'est fiable que si la part « avec les 2 dates » est suffisante.
- Le cycle total est mesuré **Validation → Archivage sur les dossiers avec les deux dates**, sans additionner les moyennes de cohortes différentes. **ETA est prévisionnelle ; RTA est réelle**. Leur écart inclut les arrivées en avance et n’entre pas dans le cycle documentaire. Préparer un dossier avant la RTA n’est pas une inversion.
- Vérification : `node tests/evolution.test.cjs`.

### Gros volumes (v13)

- **Aucune limite de lignes** : testé et validé sur un export **150 000 lignes / 44 Mo** — chargement intégral (~80 s : lecture, mapping, analyse), progression visible à chaque étape, interface qui reste réactive (traitement par blocs), pagination fluide.
- Parsing Excel en mode dense (mémoire réduite), libération des gros tableaux après validation du mapping, sauvegarde locale avec message explicite si le stockage du poste est saturé (les données restent en mémoire pour la session).

### Filtres client et performance client (v12)

- **Filtre Clients (1 ou +)** dans la barre globale, permanent sur toutes les pages : cases à cocher avec **recherche**, boutons Tous / Inverser ; se combine avec les autres filtres globaux.
- **Performance client** (onglet Performance COM) : recherche avec suggestions, 6 KPIs, 5 états cliquables (ouvrent les dossiers filtrés du client), alertes dominantes et top dossiers. Les clients à risque de la Vision BU ouvrent aussi cette fiche.

### Performance COM et règles partagées (v11)

- Tuiles COM, sélecteur de portefeuille et fiche de pilotage : états **à traiter / douane / livraison / clôture / archivés**, cliquables vers les dossiers filtrés. Classement et analyse SLA repliables.
- **Administration → Nouvelle alerte** : nom, sévérité, poids, couleur et conditions **ET / OU** (champ vide/renseigné, égalité, contient, comparaison numérique, ancienneté d'une date).
- **Modifier / Masquer / Afficher / Supprimer** : les règles masquées ou supprimées sont exclues des vues métier et du moteur de score. Les règles masquées restent accessibles dans Administration pour les réactiver.
- **Exporter JSON** sauvegarde les réglages et télécharge `spot-reglages.json`. **Importer JSON** valide puis applique une configuration reçue. Le fichier contient les réglages et règles, pas les dossiers.
- Validation du moteur et du format JSON : `node tests/settings.test.cjs`.

```
spot-cockpit/
  index.html  — structure + vues (overview, alertes, dossiers, perfs, BU, admin, guide, méthodo)
  styles.css  — charte AGL navy #0f2a52 (+ sévérités, bulles commentaires, admin)
  app.js      — mapping, moteur alertes/criticité paramétrable, KPIs, filtres, e-mails, exports XLSX
  assets/agl-logo.png
  vercel.json / README.md / GUIDE_USAGE.md
```
