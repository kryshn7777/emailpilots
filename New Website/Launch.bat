@echo off
setlocal enabledelayedexpansion

echo Launching Astro development server...
start cmd /k "npm run dev"

timeout /t 3 /nobreak

echo Opening browser...
start http://localhost:4321

exit /b 0
