@echo off
REM =====================================================================
REM  Email Pilots - Landing site launcher
REM  Starts the Vite dev server and opens your browser automatically.
REM =====================================================================
setlocal
cd /d "%~dp0"

echo ==============================================
echo    Email Pilots - Landing (dev server)
echo ==============================================
echo.

REM Check Node is available.
where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js was not found on your PATH.
  echo     Install it from https://nodejs.org and run this again.
  echo.
  pause
  exit /b 1
)

REM Install dependencies on first run.
if not exist "node_modules\" (
  echo Installing dependencies ^(first run, this can take a minute^)...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [X] npm install failed. See the messages above.
    pause
    exit /b 1
  )
  echo.
)

echo Starting the dev server... a browser tab will open automatically.
echo Leave this window open while you work; press Ctrl+C to stop.
echo.

REM  --open tells Vite to open the browser at the correct URL once ready.
REM  Live reload is on: edits under landing\src update the page instantly.
call npm run dev -- --open

REM Reached when the server is stopped (Ctrl+C) or fails to start.
echo.
echo Dev server stopped.
pause
endlocal
