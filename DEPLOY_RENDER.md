# Déploiement automatique — v1.0.0 PUBLIC

Le dépôt contient `render.yaml`. Render peut créer le Web Service Node et le PostgreSQL à partir de ce Blueprint.

## Une seule intervention humaine

1. Mettre ce dossier dans un dépôt GitHub.
2. Dans Render, créer un **New → Blueprint** et sélectionner le dépôt.
3. Appliquer le Blueprint.

Le Blueprint configure ensuite automatiquement :
- Web Service Node 22 ;
- région Frankfurt ;
- HTTPS et sous-domaine `onrender.com` fournis par Render ;
- PostgreSQL ;
- `DATABASE_URL` relié automatiquement à PostgreSQL ;
- `SESSION_SECRET` généré par Render ;
- `/health` comme health check ;
- déploiement à chaque commit.

## Important pour la bêta gratuite

Render indique que les Web Services gratuits s'endorment après 15 minutes sans trafic et que leur système de fichiers est éphémère. Le PostgreSQL gratuit est limité et expire après 30 jours. Cette configuration est donc destinée à une **bêta publique de test**, pas à une exploitation durable sans évolution de l'infrastructure.

La base PostgreSQL est utilisée automatiquement dès que `DATABASE_URL` est présent. En local, sans `DATABASE_URL`, le jeu retombe sur SQLite.

## Avant ouverture au public

Les informations d'exploitant dans les pages légales doivent être complétées avec les informations réelles de l'adulte/opérateur responsable. Ne pas inventer ces informations.
