@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.5+ est requis.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installation automatique des dependances...
  call npm install --omit=dev --no-audit --no-fund
  if errorlevel 1 pause & exit /b 1
)
node server.js
pause
