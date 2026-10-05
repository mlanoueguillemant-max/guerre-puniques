# Publication — Antiquity Conquest v1.0.0-beta.4

## Mode zéro-configuration
- [x] Base locale SQLite intégrée à Node.js.
- [x] Secret de session généré automatiquement et conservé dans `data/.session-secret`.
- [x] Aucun PostgreSQL externe requis.
- [x] Aucun fichier `.env` obligatoire.
- [x] `start.sh`, `start.bat` et Docker fournis.
- [x] Sauvegarde persistante dans `data/`.
- [x] Authentification, CSRF, cookies HTTP-only et mots de passe hachés.
- [x] Validation serveur des actions de jeu.
- [x] Transactions et verrou applicatif pour éviter les conflits de tours.
- [x] Socket.IO authentifié et limité.
- [x] Rate limiting + Helmet/CSP.

## Vérifications effectuées dans l'archive
- [x] Syntaxe `server.js` vérifiée avec Node.js.
- [x] Tests statiques de sécurité/intégrité passés.
- [x] Aucune dépendance PostgreSQL dans `package.json`.

## Ce que « zéro intervention » ne peut pas supprimer
Une application ne peut pas devenir publiquement accessible sur Internet sans une machine/plateforme qui l'héberge. Cette archive n'a besoin d'aucun service de base de données séparé, mais il faut nécessairement un ordinateur/serveur pour l'exécuter.

Pour une vraie ouverture publique, il faut également que les informations légales correspondent à l'exploitant réel. Elles ne peuvent pas être inventées automatiquement.

## Important
Cette checklist ne constitue ni un avis juridique, ni une certification RGPD, ni un pentest professionnel.
