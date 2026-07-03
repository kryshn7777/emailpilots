@echo off
cd /d %~dp0
title Email Pilots - GUI2
echo Starting Email Pilots (GUI2)...
set EPT_GUI=2
npm run dev
pause
