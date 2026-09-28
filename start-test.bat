@echo off
rem Startet die lokale Testumgebung (eigene Daten, Test-Admin admin / test-admin). Browser: http://localhost:5173
cd /d "%~dp0"
call npm run dev:test
