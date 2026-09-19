# Flotte – Application de maintenance des bateaux

Application web mobile (installable sur téléphone/tablette) pour la gestion de la maintenance
d'une flotte de bateaux de location.

- **Techniciens** : saisissent chaque intervention (date, heures moteur, durée de l'intervention,
  description, pièces utilisées) directement depuis leur mobile ou tablette, avec autocomplétion
  sur les descriptions et les pièces déjà utilisées pour aller plus vite.
- **Gérant (admin)** : consulte les interventions en attente, les valide et saisit leur
  valorisation (montant).

## Architecture

```
backend/    API REST Node.js + Express + TypeScript + SQL Server (mssql/tedious)
frontend/   PWA React + TypeScript + Vite (installable sur mobile, mobile-first)
```

## Base de données : SQL Server

Le backend se connecte à un serveur **SQL Server** existant (par exemple celui installé sur votre
serveur Windows) via des variables d'environnement — aucune base n'est embarquée dans l'application.

1. Sur le serveur SQL Server, créez une base dédiée (ex. `FlotteMaintenance`) et un login SQL
   dédié à l'application avec les droits `db_owner` sur cette base (recommandé plutôt que
   d'utiliser `sa`) :
   ```sql
   CREATE DATABASE FlotteMaintenance;
   GO
   CREATE LOGIN flotte_app WITH PASSWORD = 'ChoisirUnMotDePasseFort!';
   GO
   USE FlotteMaintenance;
   CREATE USER flotte_app FOR LOGIN flotte_app;
   ALTER ROLE db_owner ADD MEMBER flotte_app;
   GO
   ```
   Cela suppose que le serveur est en **mode d'authentification mixte** (SQL Server + Windows). Si
   seule l'authentification Windows est activée, activez le mode mixte dans SQL Server Management
   Studio (Propriétés du serveur → Sécurité) puis redémarrez le service.
2. Vérifiez que le port TCP de SQL Server (1433 par défaut) est ouvert dans le pare-feu Windows
   pour la machine qui exécutera l'API, et que le protocole TCP/IP est activé dans
   "SQL Server Configuration Manager".
3. Configurez le backend en copiant `backend/.env.example` en `backend/.env` puis en renseignant
   ces variables (ce fichier est chargé automatiquement au démarrage, il n'y a rien d'autre à
   faire) :

   | Variable | Description | Défaut |
   |---|---|---|
   | `DB_SERVER` | Adresse ou nom du serveur SQL Server | `localhost` |
   | `DB_PORT` | Port TCP | `1433` |
   | `DB_NAME` | Nom de la base | `FlotteMaintenance` |
   | `DB_USER` | Login SQL | — |
   | `DB_PASSWORD` | Mot de passe du login | — |
   | `DB_ENCRYPT` | Chiffrer la connexion (`true`/`false`) | `true` |
   | `DB_TRUST_SERVER_CERTIFICATE` | Accepter le certificat auto-signé du serveur (`true`/`false`) | `true` |

   ⚠️ **Si une valeur contient un `#`** (fréquent dans un mot de passe), encadrez-la de guillemets
   dans `.env` (`DB_PASSWORD="Mot#DePasse123"`), sinon tout ce qui suit le `#` est silencieusement
   coupé (traité comme un commentaire).

Le backend crée automatiquement les tables nécessaires au premier démarrage (`IF OBJECT_ID(...) IS NULL CREATE TABLE ...`) — pas de script de migration séparé à lancer.

## Démarrage rapide

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env   # puis éditez .env avec vos identifiants SQL Server
npm run seed   # crée les tables + 31 bateaux + un compte admin et un compte technicien de démo
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
3. Renseigner la date, les heures moteur, la durée de l'intervention, la description (des
   suggestions apparaissent au fur et à mesure de la saisie, basées sur les interventions
   précédentes) et les pièces utilisées (autocomplétion également, avec reprise automatique de la
   référence et du prix par défaut si déjà connus).
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

- **SQL Server** : connexion via le pilote officiel `mssql` (tedious) à votre instance existante,
  au lieu d'embarquer une base dédiée à l'application — pratique pour s'intégrer aux sauvegardes
  et à l'infrastructure déjà en place sur votre serveur Windows. L'authentification utilisée est
  un login SQL Server dédié (voir section ci-dessus) plutôt que l'authentification Windows
  intégrée : c'est la pratique recommandée pour un compte de service applicatif, et cela évite les
  complications de Kerberos si l'API n'est pas hébergée sur une machine du même domaine Windows.
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
- Définir les variables `DB_*` pointant vers le SQL Server de production (voir section
  "Base de données : SQL Server").
- Construire le frontend (`npm run build` dans `frontend/`) et servir le dossier `dist/` derrière
  un serveur web (ou héberger l'API et le frontend sur la même origine pour éviter la config CORS).
- Construire le backend (`npm run build` puis `npm start`).
- Les sauvegardes de la base restent gérées comme le reste de votre SQL Server (plan de
  maintenance / sauvegardes déjà en place sur le serveur Windows).
