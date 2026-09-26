# manage.ps1 - Familienchronik auf dem Server verwalten
# Nutzung: .\manage.ps1            (Menü)
#          .\manage.ps1 deploy     (direkt ein Befehl: setup|deploy|status|logs|invite|backup)
#
# Liest .deploy.env (siehe .deploy.env.example). Alle Server-Befehle stecken in deploy/remote.sh
# und werden per SSH ausgeführt. Funktioniert mit Windows PowerShell 5.1 und PowerShell 7.

param([string]$Command)

$ErrorActionPreference = 'Stop'
$DeployEnvPath = Join-Path $PSScriptRoot '.deploy.env'
$RemoteScriptPath = Join-Path $PSScriptRoot 'deploy/remote.sh'
$BackupDir = Join-Path $PSScriptRoot 'backups'

if (-not (Test-Path $DeployEnvPath)) {
    Write-Host "  .deploy.env fehlt. Kopiere .deploy.env.example nach .deploy.env und trage den Server ein." -ForegroundColor Red
    exit 1
}

$cfg = @{}
Get-Content $DeployEnvPath | Where-Object { $_ -match '^\s*([A-Z_]+)\s*=\s*([^#]*)' } | ForEach-Object {
    $cfg[$Matches[1]] = $Matches[2].Trim()
}
$Server = "$(if ($cfg.DEPLOY_USER) { $cfg.DEPLOY_USER } else { 'root' })@$($cfg.DEPLOY_HOST)"
$HostPort = if ($cfg.HOST_PORT) { $cfg.HOST_PORT } else { '3000' }
$RemoteEnv = "APP_DIR='$($cfg.APP_DIR)' REPO_URL='$($cfg.REPO_URL)' BRANCH='$($cfg.BRANCH)' HOST_PORT='$HostPort'"

function Invoke-Remote {
    param([string]$Action, [string]$Argument = '')
    # Skript per stdin übergeben (LF-Zeilenenden, UTF-8), damit immer die lokale Version läuft
    $script = (Get-Content -Raw -Encoding UTF8 $RemoteScriptPath) -replace "`r`n", "`n"
    $previous = $OutputEncoding
    $OutputEncoding = New-Object System.Text.UTF8Encoding $false
    try {
        $script | ssh -o StrictHostKeyChecking=accept-new $Server "$RemoteEnv bash -s -- $Action $Argument"
    } finally {
        $OutputEncoding = $previous
    }
}

function Assert-GitPushed {
    $status = git -C $PSScriptRoot status --porcelain
    $ahead = git -C $PSScriptRoot rev-list --count "origin/$($cfg.BRANCH)..HEAD" 2>$null
    if ($status -or ($ahead -and [int]$ahead -gt 0)) {
        Write-Host "  Achtung: Der Server holt origin/$($cfg.BRANCH) von GitHub - lokale Änderungen sind nicht gepusht." -ForegroundColor Yellow
        $go = Read-Host "  Trotzdem deployen? [j/N]"
        return $go -match '^[jJyY]'
    }
    return $true
}

function Save-Backup {
    $output = Invoke-Remote 'backup'
    $output | ForEach-Object { Write-Host "  $_" }
    $line = $output | Where-Object { $_ -match 'Backup: (\S+\.tgz)' } | Select-Object -Last 1
    if ($line -match 'Backup: (\S+\.tgz)') {
        New-Item -ItemType Directory -Force $BackupDir | Out-Null
        scp -o StrictHostKeyChecking=accept-new "${Server}:$($Matches[1])" $BackupDir
        Write-Host "  Gespeichert in $BackupDir" -ForegroundColor Green
    }
}

function Invoke-Action {
    param([string]$Choice)
    switch ($Choice) {
        { $_ -in '1', 'ssh' } { ssh -o StrictHostKeyChecking=accept-new $Server }
        { $_ -in '2', 'status' } { Invoke-Remote 'status' }
        { $_ -in '3', 'deploy' } { if (Assert-GitPushed) { Invoke-Remote 'deploy' } }
        { $_ -in '4', 'logs' } { Invoke-Remote 'logs' }
        { $_ -in '5', 'backup' } { Save-Backup }
        { $_ -in '6', 'invite' } { Write-Host "  Einladungscode: $(Invoke-Remote 'invite')" -ForegroundColor Green }
        { $_ -in '7', 'seed' } {
            $pw = Read-Host "  Passwort für das Demo-Rudel (min. 6 Zeichen)"
            if ($pw.Length -ge 6) { Invoke-Remote 'seed' "'$($pw -replace "'", '')'" }
        }
        { $_ -in '8', 'wipe' } {
            Write-Host "  Löscht ALLE Rudel, Hunde, Einträge und Fotos (vorher wird ein Backup erstellt)." -ForegroundColor Red
            if ((Read-Host "  Zum Bestätigen LOESCHEN eintippen") -eq 'LOESCHEN') { Invoke-Remote 'wipe' '--yes' }
        }
        { $_ -in '9', 'setup' } { Invoke-Remote 'setup' }
        default { Write-Host "  Unbekannte Auswahl: $Choice" -ForegroundColor Red }
    }
}

if ($Command) {
    Invoke-Action $Command
    exit $LASTEXITCODE
}

while ($true) {
    Clear-Host
    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor DarkYellow
    Write-Host "    Familienchronik  |  $Server  |  :$HostPort" -ForegroundColor DarkYellow
    Write-Host "  ============================================" -ForegroundColor DarkYellow
    Write-Host ""
    Write-Host "  [1]  SSH-Konsole öffnen"
    Write-Host "  [2]  Status / Health-Check"
    Write-Host "  [3]  Deploy (neuester Stand von GitHub)" -ForegroundColor Magenta
    Write-Host "  [4]  Logs (letzte 200 Zeilen)"
    Write-Host "  [5]  Backup herunterladen (DB + Fotos)" -ForegroundColor Cyan
    Write-Host "  [6]  Einladungscode für neue Rudel anzeigen" -ForegroundColor Cyan
    Write-Host "  [7]  Demo-Rudel mit Testbildern einspielen" -ForegroundColor Cyan
    Write-Host "  [8]  ALLE Daten löschen" -ForegroundColor Red
    Write-Host "  [9]  Erstinstallation (Docker + App)" -ForegroundColor Blue
    Write-Host "  [0]  Beenden" -ForegroundColor DarkGray
    Write-Host ""
    $choice = Read-Host "  Auswahl"
    if ($choice -eq '0') { break }
    try { Invoke-Action $choice } catch { Write-Host "  Fehler: $_" -ForegroundColor Red }
    Read-Host "`n  Enter zum Fortfahren"
}
