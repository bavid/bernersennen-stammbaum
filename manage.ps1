# manage.ps1 - Familienchronik auf dem Server verwalten
# Nutzung: .\manage.ps1            (Menü)
#          .\manage.ps1 deploy     (direkt ein Befehl: setup|deploy|status|logs|invite|backup|showcase|promote)
#          .\manage.ps1 -Target staging   (Vorschau-Instanz)
#
# Liest .deploy.env (siehe .deploy.env.example), mit -Target staging .deploy.staging.env (siehe .deploy.staging.env.example).
# Alle Server-Befehle stecken in deploy/remote.sh und werden per SSH ausgeführt. Funktioniert mit Windows PowerShell 5.1 und PowerShell 7.

param(
    [string]$Command,
    [ValidateSet('prod', 'staging')][string]$Target = 'prod'
)

$ErrorActionPreference = 'Stop'
$DeployEnvPath = Join-Path $PSScriptRoot $(if ($Target -eq 'staging') { '.deploy.staging.env' } else { '.deploy.env' })
$RemoteScriptPath = Join-Path $PSScriptRoot 'deploy/remote.sh'
$BackupDir = Join-Path $PSScriptRoot 'backups'

if (-not (Test-Path $DeployEnvPath)) {
    Write-Host "  $(Split-Path -Leaf $DeployEnvPath) fehlt. Kopiere die passende .example-Datei und trage den Server ein." -ForegroundColor Red
    exit 1
}

$cfg = @{}
Get-Content $DeployEnvPath | Where-Object { $_ -match '^\s*([A-Z_]+)\s*=\s*([^#]*)' } | ForEach-Object {
    $cfg[$Matches[1]] = $Matches[2].Trim()
}
$Server = "$(if ($cfg.DEPLOY_USER) { $cfg.DEPLOY_USER } else { 'root' })@$($cfg.DEPLOY_HOST)"
$HttpsPort = if ($cfg.HTTPS_PORT) { $cfg.HTTPS_PORT } else { '3010' }
$SiteHost = if ($cfg.DEPLOY_DOMAIN) { $cfg.DEPLOY_DOMAIN } else { $cfg.DEPLOY_HOST }
$RemoteEnv = "APP_DIR='$($cfg.APP_DIR)' REPO_URL='$($cfg.REPO_URL)' BRANCH='$($cfg.BRANCH)' HTTPS_PORT='$HttpsPort' DEPLOY_DOMAIN='$($cfg.DEPLOY_DOMAIN)'"
foreach ($key in 'APP_ENV', 'CONTAINER_NAME', 'IMAGE_TAG') {
    if ($cfg[$key]) { $RemoteEnv += " $key='$($cfg[$key])'" }
}

function Invoke-Remote {
    param([string]$Action, [string]$Argument = '', [string]$ExtraEnv = '')
    # Skript per stdin übergeben (LF-Zeilenenden, UTF-8), damit immer die lokale Version läuft
    $script = (Get-Content -Raw -Encoding UTF8 $RemoteScriptPath) -replace "`r`n", "`n"
    $previous = $OutputEncoding
    $OutputEncoding = New-Object System.Text.UTF8Encoding $false
    try {
        $script | ssh -o StrictHostKeyChecking=accept-new $Server "$RemoteEnv $ExtraEnv bash -s -- $Action $Argument"
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

# Bringt genau das auf der Vorschau getestete SHA nach Prod: main wird vorgespult, Prod deployt dieses SHA
function Invoke-Promote {
    git -C $PSScriptRoot fetch -q origin staging
    if ($LASTEXITCODE -ne 0) { Write-Host "  git fetch fehlgeschlagen (kein Netzwerk?) - Abbruch, um keinen veralteten Stand zu übernehmen." -ForegroundColor Red; return }
    $sha = (git -C $PSScriptRoot rev-parse origin/staging).Trim()
    if ($LASTEXITCODE -ne 0 -or $sha -notmatch '^[0-9a-f]{40}$') { Write-Host "  Konnte SHA von origin/staging nicht ermitteln." -ForegroundColor Red; return }
    Write-Host "  Übernimmt Vorschau-Stand $($sha.Substring(0, 7)) nach Prod (main)." -ForegroundColor Yellow
    if ((Read-Host "  Zum Bestätigen PROD eintippen") -ne 'PROD') { return }
    git -C $PSScriptRoot push origin "${sha}:refs/heads/main"
    if ($LASTEXITCODE -ne 0) { Write-Host "  main lässt sich nicht vorspulen (Stände auseinandergelaufen?)." -ForegroundColor Red; return }
    Invoke-Remote 'deploy' -ExtraEnv "REVISION='$sha'"
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
        { $_ -in '7', 'demo' } { Invoke-Remote 'demo' }
        { $_ -in '8', 'wipe' } {
            Write-Host "  Löscht ALLE Rudel, Hunde, Einträge und Fotos (vorher wird ein Backup erstellt)." -ForegroundColor Red
            if ((Read-Host "  Zum Bestätigen LOESCHEN eintippen") -eq 'LOESCHEN') { Invoke-Remote 'wipe' '--yes' }
        }
        { $_ -in '9', 'setup' } { Invoke-Remote 'setup' }
        { $_ -in '10', 'admin' } {
            # Passwort bleibt lokal: gehasht wird hier, zum Server geht nur der Hash
            $secure = Read-Host "  Neues Admin-Passwort (min. 10 Zeichen)" -AsSecureString
            $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
            $hash = (node (Join-Path $PSScriptRoot 'server/scripts/admin-hash.js') $plain).Trim()
            $plain = $null
            if ($hash -like 'scrypt:*') { Invoke-Remote 'admin' $hash } else { Write-Host "  Hash konnte nicht erzeugt werden." -ForegroundColor Red }
        }
        { $_ -in '11', 'showcase' } {
            if ($Target -ne 'staging') { Write-Host "  Nur für die Vorschau (-Target staging)." -ForegroundColor Red; return }
            Invoke-Remote 'showcase'
        }
        { $_ -in '12', 'promote' } {
            if ($Target -ne 'prod') { Write-Host "  Übernehmen läuft gegen Prod (ohne -Target staging starten)." -ForegroundColor Red; return }
            Invoke-Promote
        }
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
    $label = if ($Target -eq 'staging') { 'VORSCHAU' } else { 'PROD' }
    $color = if ($Target -eq 'staging') { 'Yellow' } else { 'DarkYellow' }
    Write-Host "    Familienchronik [$label]  |  https://${SiteHost}:$HttpsPort" -ForegroundColor $color
    Write-Host "  ============================================" -ForegroundColor DarkYellow
    Write-Host ""
    Write-Host "  [1]  SSH-Konsole öffnen"
    Write-Host "  [2]  Status / Health-Check"
    Write-Host "  [3]  Deploy (neuester Stand von GitHub)" -ForegroundColor Magenta
    Write-Host "  [4]  Logs (letzte 200 Zeilen)"
    Write-Host "  [5]  Backup herunterladen (DB + Fotos)" -ForegroundColor Cyan
    Write-Host "  [6]  Einladungscode für neue Rudel anzeigen" -ForegroundColor Cyan
    Write-Host "  [7]  Öffentliche Demo neu anlegen (echte Rudel bleiben)" -ForegroundColor Cyan
    Write-Host "  [8]  ALLE Daten löschen" -ForegroundColor Red
    Write-Host "  [9]  Erstinstallation (Docker + App)" -ForegroundColor Blue
    Write-Host "  [10] Admin-Passwort setzen (Benutzer: admin)" -ForegroundColor Blue
    if ($Target -eq 'staging') {
        Write-Host "  [11] Vorschau zurücksetzen (Beispieldaten neu)" -ForegroundColor Yellow
    } else {
        Write-Host "  [12] Vorschau-Stand nach Prod übernehmen" -ForegroundColor Magenta
    }
    Write-Host "  [0]  Beenden" -ForegroundColor DarkGray
    Write-Host ""
    $choice = Read-Host "  Auswahl"
    if ($choice -eq '0') { break }
    try { Invoke-Action $choice } catch { Write-Host "  Fehler: $_" -ForegroundColor Red }
    Read-Host "`n  Enter zum Fortfahren"
}
