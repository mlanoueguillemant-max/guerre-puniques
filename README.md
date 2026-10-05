# Antiquity Conquest — v1.0.0 PUBLIC

Bêta publique gratuite de jeu de stratégie historique multijoueur.

## Déploiement automatique

Le projet contient un Blueprint Render (`render.yaml`) qui configure automatiquement le serveur Node.js et une base PostgreSQL. Après connexion du dépôt à Render et application du Blueprint, les prochains commits peuvent être déployés automatiquement.

La configuration utilise PostgreSQL en production et SQLite en local lorsqu'aucune variable `DATABASE_URL` n'est présente.

## Sécurité incluse

- sessions HTTP-only ;
- CSRF ;
- bcrypt ;
- validation Zod ;
- Helmet/CSP ;
- rate limiting ;
- validation serveur des actions ;
- transactions et verrous de lignes PostgreSQL ;
- authentification Socket.IO ;
- limites de messages Socket.IO ;
- suppression de compte ;
- health check ;
- CI de syntaxe et tests statiques.

## Lancement local

```bash
npm install
npm start
```

Ou utiliser `start.sh` / `start.bat`.

## Production

`DATABASE_URL` active PostgreSQL. `SESSION_SECRET` doit être fourni par l'infrastructure ; le Blueprint Render le génère automatiquement.

## Limites de la formule gratuite

La documentation Render indique que les services Web gratuits s'endorment après 15 minutes d'inactivité et que leur système de fichiers est éphémère. Les bases PostgreSQL gratuites ont également une durée de vie limitée. Cette configuration est donc une **bêta publique de test**, pas une infrastructure commerciale durable. Pour une publication durable, il faudra une offre avec stockage/base persistants et sauvegardes.

## Juridique

Les pages CGU, confidentialité et mentions légales doivent contenir les informations réelles de l'exploitant avant l'ouverture au public. Ce dépôt ne prétend pas remplacer une validation juridique.

## Modèle de jeu

Jeu gratuit, sans paris, sans mise et sans gains en argent réel.
