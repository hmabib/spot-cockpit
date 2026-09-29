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
La barre **🔎 Filtres globaux** (`COM / Métier / Mois ETA / Année ETA / Criticité`) s'applique à **toutes les vues** : synthèse, alertes, dossiers, COM, BU. Le compteur affiche le périmètre filtré.
- Chaque vue ajoute ses filtres propres : recherche texte, délais, étapes, tri (Dossiers, Alertes).
- *Effacer* (barre globale) réinitialise **tous** les filtres d'un coup.

## 4. Lire les indicateurs (Vue d'ensemble, déjà filtrés)
- **Cartes KPI** : dossiers pilotés, critiques, ETA dépassée sans BAE, taux BAE/archivé, stagnation moyenne.
- **Indicateurs de sévérité** (nouveau) : `🔴 Critique / 🟠 Haute / 🟡 Moyenne / 🟢 OK` — **cliquez** pour ouvrir les alertes filtrées (OK → dossiers sains).
- **COM en difficulté** : cliquez un COM → ses dossiers.
- **Cas préoccupants** : top 8 scores → clic = fiche dossier complète.
- **Top alertes du jour** : bouton *Ouvrir* = fiche.

## 5. Traiter les alertes (clic → cas)
1. Onglet **Alertes** : 10 cartes `A1…A10` avec icône, sévérité, compteur (périmètre global respecté). **Cliquez** = filtrer, re-cliquez = annuler. Grisées = désactivées dans Administration.
2. Filtres : sévérité (pastilles), COM, Métier, **Mois/Année ETA**, recherche texte (`n° dossier, client, RFCV, BL…`), tri (criticité / ETA / RTA / stagnation).
3. Cliquez une ligne → **fiche dossier** : score, alertes détaillées, timeline process, stagnations > SLA, inversions, **commentaires C1–C5 en bulles** (mots-clés RFCV/BL/BAE surlignés, vides signalés).

## 6. Piloter par COM (détail + exports + e-mail)
Onglet **Performance COM** : classement (périmètre global respecté), verdict 🔴🟠🟢, par ligne :
- **👁** voir les dossiers du COM,
- **⬇** exporter le CSV du COM,
- **✉️** ouvrir la fenêtre **Situation COM** : destinataire, objet auto (`SPOT [date] — Situation COM …`), corps auto (KPI, 8 cas prioritaires, extraits commentaires, seuils), boutons **Copier**, **⬇ CSV du COM**, **Ouvrir dans ma messagerie** (pensez à joindre le CSV — `mailto:` ne joint pas tout seul).
- **Panneau détail** sous le classement (clic sur une ligne) : 6 KPIs du COM, répartition criticité, alertes dominantes (cliquables → Alertes), **volume par mois ETA**, top 8 dossiers (clic = fiche), boutons Dossiers/CSV/XLSX/E-mail.

## 7. Dossiers : filtres multicritères
Globaux + `Sous-métier / Client / Sous-compte / Mois / Année / Recherche textuelle / Filtre délai (ETA, RTA, stagnation, blocage BAE) / ETA du…au… / Étape`. Tri en cliquant les en-têtes, pagination 100, **CSV / XLSX / JSON intégraux** des lignes filtrées (compteur annoncé, aucune omission).

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
