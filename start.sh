#!/bin/sh
set -eu
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo 'Node.js 22.5+ est requis.'; exit 1; }
if [ ! -d node_modules ]; then
  echo 'Installation automatique des dépendances...'
  npm install --omit=dev --no-audit --no-fund
fi
exec node server.js
