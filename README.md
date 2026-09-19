# Flotte – Application de maintenance des bateaux

Application web mobile (installable sur téléphone/tablette) pour la gestion de la maintenance
d'une flotte de bateaux de location.

- **Techniciens** : saisissent chaque intervention (date, heures moteur, description, pièces
  utilisées) directement depuis leur mobile ou tablette, avec autocomplétion sur les descriptions
  et les pièces déjà utilisées pour aller plus vite.
- **Gérant (admin)** : consulte les interventions en attente, les valide et saisit leur
  valorisation (montant).

## Architecture

```
backend/    API REST Node.js + Express + TypeScript + SQLite (better-sqlite3)
frontend/   PWA React + TypeScript + Vite (installable sur mobile, mobile-first)
```

## Démarrage rapide

### 1. Backend

```bash
cd backend
npm install
npm run seed   # crée 31 bateaux + un compte admin et un compte technicien de démo
npm run dev    # démarre l'API sur http://localhost:4000
```

Le script `seed` affiche les identifiants créés. Par défaut :
- Admin : `cklein@navigfrance.com` / `admin1234`
- Technicien démo : `technicien@navigfrance.com` / `technicien1234`

Ces identifiants sont configurables via les variables d'environnement `SEED_ADMIN_EMAIL` et
`SEED_ADMIN_PASSWORD`. **Pensez à changer le mot de passe admin dès la première connexion**
(actuellement le mot de passe ne peut être changé que directement en base ou en recréant le
compte depuis l'espace "Comptes" ; voir section Évolutions possibles).

### 2. Frontend

```bash
cd frontend
npm install
npm run dev    # démarre l'app sur http://localhost:5173 (proxy vers l'API :4000)
```

Ouvrez `http://localhost:5173` sur un mobile/tablette du même réseau (ou déployez-le) : le
navigateur proposera "Ajouter à l'écran d'accueil" pour l'installer comme une app.

## Utilisation

### Côté technicien
1. Se connecter avec son compte technicien.
2. Choisir le bateau concerné dans la liste (recherche rapide).
3. Renseigner la date, les heures moteur, la description de l'intervention (des suggestions
   apparaissent au fur et à mesure de la saisie, basées sur les interventions précédentes) et les
   pièces utilisées (autocomplétion également, avec reprise automatique de la référence et du prix
   par défaut si déjà connus).
4. Envoyer : l'intervention passe en statut "En attente" de validation.
5. Dans "Historique", le technicien peut suivre le statut de ses interventions et modifier celles
   encore en attente.

### Côté gérant (admin)
1. Se connecter avec le compte admin.
2. Onglet "Validation" : liste des interventions par statut (en attente / validées / refusées /
   toutes).
3. Ouvrir une intervention en attente : elle affiche le détail complet et un total indicatif du
   coût des pièces (si un prix unitaire a été saisi).
4. Saisir la valeur de l'intervention et valider, ou indiquer un motif et refuser.
5. Onglet "Bateaux" : renommer/compléter les 31 bateaux créés par le seed (modèle,
   immatriculation, port d'attache, heures moteur, actif/inactif).
6. Onglet "Comptes" : créer les comptes techniciens (et d'autres comptes admin si besoin).

## Choix techniques

- **SQLite (better-sqlite3)** : suffisant pour une flotte de 31 bateaux et le volume
  d'interventions associé, sans dépendance à un serveur de base de données externe. Le fichier
  de base est dans `backend/data/flotte.db` (à sauvegarder régulièrement).
- **PWA (Progressive Web App)** : l'application est installable sur l'écran d'accueil comme une
  app mobile, sans passer par les stores. L'app fonctionne dans un navigateur mobile/tablette ;
  la connexion réseau reste nécessaire pour enregistrer les interventions (un brouillon de saisie
  en cours est conservé localement sur l'appareil en cas de perte de connexion pendant la saisie,
  pour éviter de perdre le travail en cours).
- **Autocomplétion** : chaque description et chaque pièce saisie alimente un catalogue
  (`description_catalog`, `parts_catalog`) trié par fréquence d'utilisation, pour des suggestions
  de plus en plus pertinentes au fil du temps.

## Évolutions possibles

- Synchronisation hors-ligne complète (queue locale + sync automatique au retour réseau) pour les
  zones sans réseau (pontons, cales).
- Export comptable des interventions validées (CSV/Excel).
- Changement de mot de passe en self-service et réinitialisation par email.
- Photos jointes à une intervention (avant/après, pièce défectueuse).
- Notifications (email/push) au gérant lors d'une nouvelle intervention en attente.

## Déploiement en production

- Définir `JWT_SECRET` (backend) avec une valeur secrète forte.
- Construire le frontend (`npm run build` dans `frontend/`) et servir le dossier `dist/` derrière
  un serveur web (ou héberger l'API et le frontend sur la même origine pour éviter la config CORS).
- Construire le backend (`npm run build` puis `npm start`) et s'assurer que `backend/data/`
  est sur un volume persistant et sauvegardé.
