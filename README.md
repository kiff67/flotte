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

### Problème fréquent : instance nommée (SQL Server Express)

Si votre serveur est installé en instance nommée (souvent `NOMPC\SQLEXPRESS` avec SQL Server
Express) et que vous mettez `DB_SERVER=NOMPC\SQLEXPRESS`, vous obtiendrez au démarrage une erreur
du type :

```
ConnectionError: Port for SQLEXPRESS not found in NOMPC
code: 'EINSTLOOKUP'
```

En cause : dès qu'un nom d'instance est détecté, le pilote ignore `DB_PORT` et tente de résoder le
port réel via le service **SQL Server Browser** (UDP 1434) — qui échoue si ce service n'est pas
démarré ou si le port est bloqué par le pare-feu. Deux solutions :

- **Recommandé — port TCP fixe, sans nom d'instance** : dans *SQL Server Configuration Manager* →
  `Protocols for SQLEXPRESS` → `TCP/IP` → onglet `IP Addresses` → section `IPAll` : videz
  `TCP Dynamic Ports` et mettez `TCP Port` à une valeur fixe (ex. `1433`), puis redémarrez le
  service `SQL Server (SQLEXPRESS)`. Configurez ensuite `DB_SERVER=NOMPC` (**sans** `\SQLEXPRESS`)
  et `DB_PORT=1433`.
- **Alternative — garder le nom d'instance** : démarrez le service Windows **SQL Server Browser**
  (`services.msc`, démarrage Automatique) et autorisez le port **UDP 1434** dans le pare-feu
  Windows. `DB_SERVER=NOMPC\SQLEXPRESS` fonctionnera alors (`DB_PORT` sera ignoré, sans problème).

### Problème fréquent : erreur TLS ("unsupported protocol" / "ssl_choose_client_version")

Une fois la connexion réseau établie, cette erreur peut apparaître :

```
ConnectionError: Failed to connect to ... - ssl_choose_client_version:unsupported protocol
code: 'ESOCKET'
```

En cause : votre SQL Server (souvent une version assez ancienne fournie avec un logiciel tiers,
type EBP) ne sait négocier que du TLS 1.0/1.1, que Node.js (OpenSSL 3) refuse par défaut. Deux
solutions dans `backend/.env` :

- **Recommandé sur un réseau interne** : `DB_ENCRYPT=false` — la connexion se fait alors sans
  chiffrement TLS, ce qui évite complètement cette négociation. Acceptable pour un serveur qui
  n'est pas exposé à internet ; à revoir si vous migrez un jour vers une version de SQL Server
  plus récente.
- **Si le serveur impose le chiffrement** ("Force Encryption" activé dans SQL Server Configuration
  Manager) : `DB_MIN_TLS_VERSION=TLSv1` autorise Node.js à négocier une version de TLS plus
  ancienne pour cette connexion.

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

L'API backend sert aussi automatiquement le frontend une fois celui-ci construit : un seul
processus Node, un seul port à exposer, pas de configuration CORS à gérer.

### 1. Préparer le build

```bash
cd frontend
npm install
npm run build          # génère frontend/dist

cd ../backend
npm install
npm run build           # génère backend/dist
```

### 2. Configurer `.env` en production

Dans `backend/.env` (voir `.env.example`) :
- `DB_*` pointant vers votre SQL Server (voir section "Base de données : SQL Server" et le
  dépannage ci-dessous si besoin).
- `JWT_SECRET` : une valeur longue et aléatoire, différente de celle de développement.
- `PORT` : le port sur lequel l'appli écoutera (ex. `4000`).

### 3. Lancer et initialiser

```bash
cd backend
npm run seed    # une seule fois, crée les tables et les comptes
npm start        # démarre l'API + le frontend sur http://<machine>:4000
```

À ce stade, l'application est accessible sur le réseau local via `http://<ip-de-la-machine>:4000`.
Changez le mot de passe du compte admin dès que possible (voir section "Évolutions possibles"
pour le self-service, en attendant recréez le compte depuis l'espace "Comptes").

### 4. Garder l'appli démarrée en permanence (Windows)

Un simple `npm start` s'arrête si vous fermez la fenêtre ou si le PC redémarre. Pour un usage en
production, faites-en un **service Windows** avec [NSSM](https://nssm.cc/) (gratuit) :

```powershell
nssm install FlotteMaintenance "C:\Program Files\nodejs\node.exe" "D:\Project VStudio\flotte\backend\dist\index.js"
nssm set FlotteMaintenance AppDirectory "D:\Project VStudio\flotte\backend"
nssm start FlotteMaintenance
```

Le service démarre alors automatiquement avec Windows et redémarre si l'appli plante.

### 5. Rendre l'appli accessible depuis n'importe où (4G/5G, autres sites)

Comme la base de données reste sur votre réseau local, la solution la plus simple et la moins
coûteuse est d'exposer l'appli via un **tunnel Cloudflare** (gratuit), sur la même machine que
l'étape 4 :

1. Créez un compte [Cloudflare](https://dash.cloudflare.com/sign-up) (gratuit) et si possible
   ajoutez-y un nom de domaine (ex. `flotte-navigfrance.fr`, quelques euros/an chez n'importe quel
   registrar, ou utilisez un sous-domaine que vous avez déjà).
2. Installez `cloudflared` sur la machine qui fait tourner le backend :
   ```powershell
   winget install --id Cloudflare.cloudflared
   ```
3. Authentifiez-vous et créez le tunnel :
   ```powershell
   cloudflared tunnel login
   cloudflared tunnel create flotte
   cloudflared tunnel route dns flotte flotte.votredomaine.fr
   ```
4. Créez `C:\Users\<vous>\.cloudflared\config.yml` :
   ```yaml
   tunnel: flotte
   credentials-file: C:\Users\<vous>\.cloudflared\<tunnel-id>.json
   ingress:
     - hostname: flotte.votredomaine.fr
       service: http://localhost:4000
     - service: http_status:404
   ```
5. Installez le tunnel comme service Windows (même logique qu'à l'étape 4) :
   ```powershell
   cloudflared service install
   ```

Vos techniciens et vous accédez alors à `https://flotte.votredomaine.fr` depuis n'importe où — HTTPS
géré automatiquement par Cloudflare, sans ouvrir le moindre port sur votre box/pare-feu, sans
exposer votre IP publique.

**Limite à connaître** : cette solution dépend de la machine qui héberge l'appli et de votre
connexion internet restant allumées. Si vous avez besoin d'une disponibilité plus robuste
(indépendante de votre bureau), l'alternative est de migrer le backend et la base
`FlotteMaintenance` vers un hébergement cloud (ex. un petit VPS + Azure SQL Database) — une
évolution possible plus tard sans tout reconstruire, mais plus coûteuse et plus longue à mettre en
place initialement.

### Sauvegardes

Les sauvegardes de la base restent gérées comme le reste de votre SQL Server (plan de maintenance
déjà en place sur le serveur Windows) — aucune procédure supplémentaire n'est nécessaire côté
application.

### Déploiement sur un serveur Windows géré par Plesk (avec IIS)

Si le serveur est administré via **Plesk** (reconnaissable à une arborescence du type
`D:\Plesk\Vhosts\<domaine>\httpdocs\...`), Plesk gère lui-même la configuration IIS en coulisses :
modifier IIS directement (sites, bindings, `web.config`) risque d'être écrasé à la prochaine
resynchronisation de Plesk. Préférez la fonctionnalité **Node.js intégrée à Plesk** :

1. **Créez un sous-domaine dédié** (pour ne pas toucher au site déjà servi sur le domaine racine),
   ex. `flotte.votredomaine.fr`, depuis Plesk → domaine → `Sous-domaines`.
2. **Déposez le code** (`backend/` et `frontend/`) dans le `httpdocs` de ce sous-domaine.
3. **Activez Node.js** pour ce sous-domaine (icône "Node.js" dans son tableau de bord Plesk) :
   - Version de Node.js : la plus récente disponible (20+).
   - Racine du document : `httpdocs`
   - Racine de l'application : `backend`
   - Fichier de démarrage : `dist/index.js`
4. **Build** : bouton "NPM Install" de Plesk (backend puis frontend), puis `npm run build` dans
   chaque dossier (via SSH/RDP si Plesk ne propose pas de bouton dédié pour le build).
5. **Variables d'environnement** : renseignez `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER`,
   `DB_PASSWORD`, `DB_ENCRYPT`, `JWT_SECRET` dans la section "Variables d'environnement
   personnalisées" de la page Node.js de Plesk (remplace le fichier `.env` dans ce mode de
   déploiement).
6. **Démarrez** via "Enable Node.js" / "Restart App" — Plesk supervise le processus (redémarrage
   automatique en cas de crash ou de redémarrage du serveur).
7. **HTTPS** : onglet "SSL/TLS Certificates" du sous-domaine → "Get free certificate" (Let's
   Encrypt, géré et renouvelé automatiquement par Plesk).
8. **DNS** : si le sous-domaine est nouveau, vérifiez qu'un enregistrement A/CNAME pointe vers
   l'IP de ce serveur.

**Si Plesk n'a pas de section "Node.js"** (extension non installée) : solution de repli avec IIS
en reverse proxy — faire tourner le backend comme service Windows (voir section précédente, via
NSSM), installer les modules IIS **Application Request Routing (ARR)** et **URL Rewrite**, activer
le proxy ARR au niveau serveur, créer un site IIS lié à votre sous-domaine, et ajouter une règle de
réécriture redirigeant tout le trafic vers `http://localhost:<PORT>/{R:1}`. Plus de configuration
manuelle et plus de risque de conflit avec Plesk — à réserver au cas où l'option native n'est
vraiment pas disponible.
