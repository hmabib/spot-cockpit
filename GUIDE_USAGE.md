# 📖 SPOT Cockpit AGL — Guide d'usage (pilotage quotidien, 10 min)

## 0. Principe
- **100 % local, aucune donnée d'exemple** : seuls vos dossiers Excel s'affichent. Excel lu dans le navigateur, stocké en IndexedDB sur ce poste. Aucune donnée envoyée.
- **Date de pilotage** = jour J du pilotage. Tous les délais (`ETA − J`), SLA, alertes et scores sont recalculés instantanément quand on la change.
- **Exports intégraux** : CSV/XLSX/JSON construits par blocs, sans limite de volume ni troncature.

## 1. Charger l'Excel du jour (1 min)
1. **📤 Charger Excel** ou glisser-déposer `Dossiers par COM.xlsx` dans le cadre pointillé.
2. Fenêtre **Mapping intelligent** : vérifiez les pastilles (🟢 haute / 🟠 moyenne / 🔴 faible), ajustez si besoin → **Valider & analyser**.
3. Le bandeau affiche `X dossiers • nom du fichier`. Les données sont mémorisées en local et restaurées au redémarrage. Sans fichier : les vues affichent un appel au chargement (aucun chiffre fictif).

## 2. Régler le jour J (modifiable à tout moment)
- En haut : champ 📅 **Date pilotage** + boutons **Auj.** / **−1j** / **+1j**.
- Ou **Administration → Date pilotage** (+ raccourci *Date rapport 28/09/2026*).
- Chaque changement → toast `📅 Pilotage au … — tout recalculé`.

## 3. Filtres globaux — partout, tout le temps
La barre **🔎 Filtres globaux** (`COM / Métier / Mois ETA / Année ETA / Criticité / 🚨 Types d'alerte`) s'applique à **toutes les vues** : pilotage du mois, synthèse, alertes, dossiers, COM, BU. Le compteur affiche le périmètre filtré.
- **🚨 Types d'alerte (multi-critères)** : cochez **un ou plusieurs types** (A1…A10) pour ne voir que ceux-là dans les listes (alertes, dossiers, tops, détail COM) ; vide = tous visibles. Boutons *Tous* / *Inverser*. Sur l'onglet Alertes, les cartes A1…A10 restent un raccourci de filtre simple (se combine avec la sélection).
- Chaque vue ajoute ses filtres propres : recherche texte, délais, étapes, tri (Dossiers, Alertes).
- *Effacer* (barre globale) réinitialise **tous** les filtres d'un coup.

## 3bis. Dashboard Pilotage du mois (accueil, simple et clair)
Vue d'accueil centrée sur **le mois** (sélecteur + ← → + *Mois du jour J*, défaut = mois du jour J) avec ses propres filtres **COM / Métier / Mois / Année / Criticité** (synchronisés avec la barre globale) + **filtres de dates : mois/année RTA, période ETA du…au…** : 6 KPIs du mois, 4 sévérités, COM du mois, étapes bloquantes, top 10 priorités — **tout est cliquable** : un clic applique les filtres et ouvre Alertes, Dossiers ou la fiche.

## 3ter. Épinglés direction + note du directeur
- **Épingler** : ★ dans la ligne Dossiers, ou bouton **☆ Épingler** dans la fiche détaillée. Le badge du menu affiche le nombre.
- Onglet **Épinglés** : recherche, tri (score / retard ETA / n°), **cases à cocher** pour la sélection, **note du directeur** éditable par ligne (enregistrée en local), export Excel de la **sélection** ou de **tous** (colonne « Note direction » incluse).
- Les épingles et notes **restent sur ce poste** et survivent au rechargement.

## 3quater. 🧭 Cadrer un rapport (Excel / Word)
Bouton **🧭 Rapport** en haut : choisissez le périmètre (**COM multiples**, métier, **types d'alerte multiples**, criticité, période ETA, mois/année), le **titre** et le **logo** (AGL intégré par défaut, ou votre fichier). Compteur de périmètre en direct, **👁 Aperçu**, puis :
- **🎨 Excel mis en forme (.xls)** : en-tête coloré + logo, tableaux stylés ;
- **📄 Word structuré (.doc)** : 6 sections numérotées (synthèse, criticité, par COM, top 15, alertes détaillées, épinglés) ;
- **📊 Excel données (.xlsx)** : les dossiers du périmètre en table brute.

## 3quinquies. Infobulle commentaires
Survolez une ligne (Dossiers, Alertes, Épinglés, priorités, détail COM) : une info-bulle affiche les **commentaires 1–5 complets** et la **note direction** éventuelle.

## 4. Lire les indicateurs (Vue d'ensemble, déjà filtrés)
- **Cartes KPI** : dossiers pilotés, critiques, ETA dépassée sans BAE, taux BAE/archivé, stagnation moyenne.
- **Indicateurs de sévérité** (nouveau) : `🔴 Critique / 🟠 Haute / 🟡 Moyenne / 🟢 OK` — **cliquez** pour ouvrir les alertes filtrées (OK → dossiers sains).
- **COM en difficulté** : cliquez un COM → ses dossiers.
- **Cas préoccupants** : top 8 scores → clic = fiche dossier complète.
- **Top alertes du jour** : bouton *Ouvrir* = fiche.

## 5. Traiter les alertes (clic → cas)
1. Onglet **Alertes** : 10 cartes `A1…A10` avec icône, sévérité, compteur (périmètre global respecté). **Cliquez** = filtrer, re-cliquez = annuler. Grisées = désactivées dans Administration.
2. Filtres : sévérité (pastilles), COM, Métier, **Mois/Année ETA**, recherche texte (`n° dossier, client, RFCV, BL…`), tri (criticité / ETA / RTA / stagnation).
3. Cliquez une ligne → **fiche dossier** : score, alertes détaillées, **🗓 positionnement dates** (axe temporel : chaque jalon ETA→archivage situé en J±n vs jour J + tableau exact), timeline process, stagnations > SLA, inversions, **commentaires C1–C5 en bulles** (mots-clés RFCV/BL/BAE surlignés, vides signalés).

## 6. Piloter par COM (détail + exports + e-mail)
Onglet **Performance COM** : classement **complet** (tous les COM, scroll), verdict 🔴🟠🟢, par ligne :
- **👁** voir les dossiers du COM,
- **⬇** exporter le CSV du COM,
- **✉️** ouvrir la fenêtre **Situation COM** : destinataire, objet auto (`SPOT [date] — Situation COM …`), corps auto (KPI, 8 cas prioritaires, extraits commentaires, seuils), boutons **Copier**, **⬇ CSV du COM**, **Ouvrir dans ma messagerie** (pensez à joindre le CSV — `mailto:` ne joint pas tout seul).
- **Panneau détail** sous le classement (clic sur une ligne) : 6 KPIs du COM, répartition criticité, alertes dominantes (cliquables → Alertes), **volume par mois ETA (tous les mois)**, **⏱ délais moyens entre étapes vs SLA** (positionnement du COM dans le process), top 8 dossiers (clic = fiche), boutons Dossiers/CSV/XLSX/E-mail.

## 6bis. Évolution : archivés, pastille 💬, historique et temps de traitement
- Barre globale : **Archivés masqués** (toggle permanent — vues, rapports et exports ; mémorisé ; *Effacer* les ré-affiche) et **Pastille 💬** (repère les dossiers commentés dans les tableaux ; mémorisée).
- Onglet **Évolution** : **ETA = prévision, RTA = arrivée réelle** (leur écart peut être négatif = avance). Historique mensuel des jalons **réellement datés** (ouvertures, arrivées RTA, livraisons, archivages, en-cours fin de mois) + état actuel par **cohorte ETA** (clic sur un mois = filtre global).
- **Temps de traitement par séquence** (Validation → Archivage) : moyenne, médiane exacte, min/max, séquences terminées, attentes en cours (âge médian), inversions exclues, répartition 0–2 / 3–7 / 8–14 / >14 j et part des jours observés. Préparer un dossier avant la RTA **n'est pas** une inversion.

## 7. Dossiers : filtres multicritères
Globaux + `Sous-métier / Client / Sous-compte / Mois / Année / Recherche textuelle / Filtre délai (ETA, RTA, stagnation, blocage BAE) / ETA du…au… / Étape`. Tri en cliquant les en-têtes, **pagination 100 à 1000 lignes/page (réglable)**, **CSV / XLSX / JSON intégraux** des lignes filtrées (compteur annoncé, aucune omission). Toutes les autres listes (COM, métiers, clients, mois, matrice BU) sont **intégrales et scrollables**.

## 8. Régler les alertes (Administration)
- **SLA par transition** (jours), **seuils** ETA/RTA critiques et criticité (défaut `≥55 / ≥30 / ≥12`, ETA/RTA `< −7j`).
- Par alerte `A1…A10` : **activation on/off, sévérité, poids (points), seuil jours, couleur**.
- **Couleurs des sévérités** : color pickers Critique/Haute/Moyenne/OK → pastilles, cartes, indicateurs.
- **💾 Enregistrer** = sauvegarde locale + recalcul immédiat. **↩ Défaut** = réinitialiser.

## 9. Rituel quotidien conseillé (10 min)
1. Charger l'Excel → 2. Vérifier la date → 3. Filtrer le mois → 4. Lire 🔴🟠 → 5. Traiter **Cas préoccupants** → 6. Envoyer ✉️ aux COM en difficulté → 7. Exporter XLSX du jour (intégral).

## 10. Dépannage
| Symptôme | Solution |
|---|---|
| Fichier non reconnu | Vérifier `.xlsx` export SPOT, 1re ligne = en-têtes ; ajuster le mapping |
| 0 dossier après filtres | Bouton *Effacer* de la barre globale (tout réinitialise) |
| Couleurs/seuils perdus | Ils sont en `localStorage` du navigateur — ne pas vider le stockage du site |
| E-mail sans pièce jointe | Normal (`mailto:`) → joindre manuellement le CSV téléchargé |
| Lent (>15 000 lignes) | Normal 2–5 s ; ne pas fermer l'onglet pendant l'analyse |
| Export incomplet ailleurs | Ici les exports annoncent leur nombre de lignes et sont intégraux — vérifiez le compteur du toast |
