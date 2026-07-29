@echo off
cd /d %~dp0
if not exist node_modules (
  echo Installiere Abhaengigkeiten, das dauert beim ersten Start etwas...
  call npm run install:all
)
call npm run dev
