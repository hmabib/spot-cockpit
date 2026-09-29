# 📖 SPOT Cockpit AGL — Guide d'usage (pilotage quotidien, 10 min)

## 0. Principe
- **100 % local** : Excel lu dans le navigateur, stocké en IndexedDB sur ce poste. Aucune donnée envoyée.
- **Date de pilotage** = jour J du pilotage. Tous les délais (`ETA − J`), SLA, alertes et scores sont recalculés instantanément quand on la change.

## 1. Charger l'Excel du jour (1 min)
1. **📤 Charger Excel** ou glisser-déposer `Dossiers par COM.xlsx` dans le cadre pointillé.
2. Fenêtre **Mapping intelligent** : vérifiez les pastilles (🟢 haute / 🟠 moyenne / 🔴 faible), ajustez si besoin → **Valider & analyser**.
3. Le bandeau affiche `X dossiers • nom du fichier`. Les données sont mémorisées en local et restaurées au redémarrage.

## 2. Régler le jour J (modifiable à tout moment)
- En haut : champ 📅 **Date pilotage** + boutons **Auj.** / **−1j** / **+1j**.
- Ou **Administration → Date pilotage** (+ raccourci *Date rapport 28/09/2026*).
- Chaque changement → toast `📅 Pilotage au … — tout recalculé`.

## 3. Lire les indicateurs (Vue d'ensemble)
- **Cartes KPI** : dossiers pilotés, critiques, ETA dépassée sans BAE, taux BAE/archivé, stagnation moyenne.
- **Indicateurs de sévérité** (nouveau) : `🔴 Critique / 🟠 Haute / 🟡 Moyenne / 🟢 OK` — **cliquez** pour ouvrir les alertes filtrées (OK → dossiers sains).
- **COM en difficulté** : cliquez un COM → ses dossiers.
- **Cas préoccupants** : top 8 scores → clic = fiche dossier complète.
- **Top alertes du jour** : bouton *Ouvrir* = fiche.

## 4. Traiter les alertes (clic → cas)
1. Onglet **Alertes** : 10 cartes `A1…A10` avec icône, sévérité, compteur. **Cliquez** = filtrer, re-cliquez = annuler. Grisées = désactivées dans Administration.
2. Filtres : sévérité (pastilles), COM, recherche texte (`n° dossier, client, RFCV, BL…`), tri (criticité / ETA / RTA / stagnation).
3. Cliquez une ligne → **fiche dossier** : score, alertes détaillées, timeline process, stagnations > SLA, inversions, **commentaires C1–C5 en bulles** (mots-clés RFCV/BL/BAE surlignés, vides signalés).

## 5. Piloter par COM (exports + e-mail)
Onglet **Performance COM** : classement, verdict 🔴🟠🟢, par ligne :
- **👁** voir les dossiers du COM,
- **⬇** exporter le CSV du COM,
- **✉️** ouvrir la fenêtre **Situation COM** : destinataire, objet auto (`SPOT [date] — Situation COM …`), corps auto (KPI, 8 cas prioritaires, extraits commentaires, seuils), boutons **Copier**, **⬇ CSV du COM**, **Ouvrir dans ma messagerie** (pensez à joindre le CSV — `mailto:` ne joint pas tout seul).

## 6. Dossiers : filtres multicritères
`COM / Métier / Sous-métier / Client / Sous-compte / Criticité / Recherche textuelle / Filtre délai (ETA, RTA, stagnation, blocage BAE) / ETA du…au… / Étape`. Tri en cliquant les en-têtes, pagination 100, **CSV / XLSX / JSON** des lignes filtrées.

## 7. Régler les alertes (Administration)
- **SLA par transition** (jours), **seuils** ETA/RTA critiques et criticité (défaut `≥55 / ≥30 / ≥12`, ETA/RTA `< −7j`).
- Par alerte `A1…A10` : **activation on/off, sévérité, poids (points), seuil jours, couleur**.
- **Couleurs des sévérités** : color pickers Critique/Haute/Moyenne/OK → pastilles, cartes, indicateurs.
- **💾 Enregistrer** = sauvegarde locale + recalcul immédiat. **↩ Défaut** = réinitialiser.

## 8. Rituel quotidien conseillé (10 min)
1. Charger l'Excel → 2. Vérifier la date → 3. Lire 🔴🟠 → 4. Traiter **Cas préoccupants** → 5. Envoyer ✉️ aux COM en difficulté → 6. Exporter XLSX du jour.

## 9. Dépannage
| Symptôme | Solution |
|---|---|
| Fichier non reconnu | Vérifier `.xlsx` export SPOT, 1re ligne = en-têtes ; ajuster le mapping |
| 0 dossier après filtres | Bouton *Effacer* les filtres (Dossiers) |
| Couleurs/seuils perdus | Ils sont en `localStorage` du navigateur — ne pas vider le stockage du site |
| E-mail sans pièce jointe | Normal (`mailto:`) → joindre manuellement le CSV téléchargé |
| Lent (>15 000 lignes) | Normal 2–5 s ; ne pas fermer l'onglet pendant l'analyse |
