@echo off
REM ============================================================
REM  Email Pilots - launch the landing site (Vite dev server)
REM ============================================================
setlocal
cd /d "%~dp0landing"

if not exist "node_modules" (
  echo Installing landing dependencies, one moment...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. Make sure Node.js is installed and on your PATH.
    pause
    exit /b 1
  )
)

echo.
echo Starting Email Pilots landing site...
echo The browser will open automatically. Press Ctrl+C here to stop.
echo.
call npm run dev -- --open

endlocal
