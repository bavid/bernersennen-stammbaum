const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

// Phase G Task 2: deploy/remote.sh - Syntax, der Caddy-Block für den gemeinsamen Proxy (nur ein Vorschlag auf
// stdout, das Skript fasst /opt/proxy nie an) und PUBLIC_URL in der .env der Instanz. Die Funktionen werden mit
// REMOTE_SH_SOURCE_ONLY=1 geladen, ohne einen Befehl auszuführen (siehe Kommentar im Skript).
const REMOTE_SH = path.resolve(__dirname, '..', '..', 'deploy', 'remote.sh')

// Git-Bash zuerst: unter Windows steht sonst die WSL-bash aus System32 vorne im PATH, und die kennt weder
// Windows-Pfade noch das lokale Repo. Ohne eine passende bash werden die Tests übersprungen, nicht rot.
function findBash() {
  const candidates =
    process.platform === 'win32'
      ? [
          process.env.BASH_BIN,
          'C:\\Program Files\\Git\\bin\\bash.exe',
          path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe'),
          path.join(os.homedir(), 'scoop', 'apps', 'git', 'current', 'bin', 'bash.exe')
        ]
      : [process.env.BASH_BIN, '/bin/bash', '/usr/bin/bash', '/usr/local/bin/bash']
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null
}

const bash = findBash()
const skip = bash ? false : 'keine GNU bash gefunden (BASH_BIN setzen)'

// Git-Bash versteht Windows-Pfade mit Vorwärts-Schrägstrichen; die Backslash-Form bricht in Anführungszeichen.
const bashPath = (p) => p.replace(/\\/g, '/')

// Führt `script` in einer frischen bash aus, in der die Funktionen von remote.sh bereits geladen sind.
function runWithFunctions(script, env = {}) {
  const result = spawnSync(bash, ['-c', `source "${bashPath(REMOTE_SH)}"\n${script}`], {
    encoding: 'utf8',
    env: { ...process.env, DEPLOY_DOMAIN: '', PUBLIC_URL: '', HTTPS_PORT: '', REMOTE_SH_SOURCE_ONLY: '1', ...env }
  })
  assert.equal(result.status, 0, `bash-Fehler: ${result.stderr}`)
  return result.stdout
}

test('remote.sh: Syntax ist gültig (bash -n)', { skip }, () => {
  const result = spawnSync(bash, ['-n', bashPath(REMOTE_SH)], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
})

test('remote.sh: print_caddy_block schlägt mit DEPLOY_DOMAIN den Block für den gemeinsamen Proxy vor', { skip }, () => {
  const out = runWithFunctions('print_caddy_block', { DEPLOY_DOMAIN: 'chronik.example.org', HTTPS_PORT: '3005' })
  const block = ['https://chronik.example.org {', '  encode zstd gzip', '  reverse_proxy 127.0.0.1:3005', '}'].join('\n')
  assert.ok(out.includes(block), `Block fehlt oder abweichend:\n${out}`)
  assert.match(out, /Caddyfile/, 'Hinweis, wohin der Block gehört')
  assert.match(out, /Proxy/, 'Hinweis, dass das Deploy den Proxy nie selbst ändert')
})

test('remote.sh: ohne DEPLOY_DOMAIN gibt print_caddy_block nichts aus', { skip }, () => {
  const out = runWithFunctions('print_caddy_block', { HTTPS_PORT: '3010' })
  assert.equal(out, '')
})

test('remote.sh: setup und deploy geben den Caddy-Block nach dem Start aus', () => {
  const source = fs.readFileSync(REMOTE_SH, 'utf8')
  for (const command of ['setup', 'deploy']) {
    const segment = source.slice(source.indexOf(`\n  ${command})`), source.indexOf(';;', source.indexOf(`\n  ${command})`)))
    assert.match(segment, /\bstart\b[\s\S]*print_caddy_block/, `${command}) ruft print_caddy_block nach start auf`)
  }
})

test('remote.sh: ensure_env übernimmt PUBLIC_URL nur wenn gesetzt und überschreibt nie', { skip }, (t) => {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-sh-'))
  t.after(() => fs.rmSync(appDir, { recursive: true, force: true }))
  // chown/hostname gibt es nur auf dem Server sinnvoll - hier als harmlose Funktionen überdeckt
  const stubs = 'chown() { :; }\nhostname() { echo 203.0.113.10; }\n'
  const envFile = () => fs.readFileSync(path.join(appDir, '.env'), 'utf8')
  const env = { APP_DIR: bashPath(appDir) }

  runWithFunctions(`${stubs}ensure_env`, env)
  assert.match(envFile(), /^JWT_SECRET=[0-9a-f]{64}$/m)
  assert.doesNotMatch(envFile(), /^PUBLIC_URL=/m, 'ohne PUBLIC_URL keine Zeile')

  runWithFunctions(`${stubs}ensure_env`, { ...env, PUBLIC_URL: 'https://chronik.example.org' })
  assert.match(envFile(), /^PUBLIC_URL=https:\/\/chronik\.example\.org$/m, 'wird nachträglich ergänzt')

  runWithFunctions(`${stubs}ensure_env`, { ...env, PUBLIC_URL: 'https://anders.example.org' })
  assert.match(envFile(), /^PUBLIC_URL=https:\/\/chronik\.example\.org$/m, 'bestehender Wert bleibt (env_default)')
  assert.equal(envFile().match(/^PUBLIC_URL=/gm).length, 1)
})

test('remote.sh: site_url bevorzugt PUBLIC_URL aus der .env der Instanz', { skip }, (t) => {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-sh-site-'))
  t.after(() => fs.rmSync(appDir, { recursive: true, force: true }))
  const env = { APP_DIR: bashPath(appDir) }

  fs.writeFileSync(path.join(appDir, '.env'), 'PUBLIC_HOST=203.0.113.10\nHTTPS_PORT=3010\n')
  assert.equal(runWithFunctions('site_url', env).trim(), 'https://203.0.113.10:3010')

  fs.appendFileSync(path.join(appDir, '.env'), 'PUBLIC_URL=https://chronik.example.org\n')
  assert.equal(runWithFunctions('site_url', env).trim(), 'https://chronik.example.org')
})

// Phase G Task 6: das Backup vor Deploys schreibt die Markierung, aus der der Admin-Reiter „Server“ das letzte Backup liest
// (dieselbe Datei wie die tägliche Sicherung der App, lib/autoBackup.js) - hier mit kind "deploy".
test('remote.sh: write_backup_marker lässt den Container data/backups/last-backup.json schreiben, das die App lesen kann', { skip }, (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-sh-marker-'))
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }))
  // Statt docker compose: prüft den Aufruf (exec -T chronik) und führt den Befehl hier mit dem lokalen node aus - mit
  // DATA_DIR wie im Container. root (das Skript) fasst den Ordner dabei nie selbst an.
  const stubs = ['COMPOSE=fake_compose', 'fake_compose() { [ "$1 $2 $3" = "exec -T chronik" ] || return 9; shift 3; "$@"; }', ''].join('\n')
  const env = { DATA_DIR: dataDir }
  const { readBackupMarker } = require('../lib/autoBackup')
  const dir = path.join(dataDir, 'backups')

  const before = Date.now() - 2000
  runWithFunctions(`${stubs}write_backup_marker 123456`, env)
  const marker = readBackupMarker(dir)
  assert.equal(marker.kind, 'deploy')
  assert.equal(marker.bytes, 123456)
  assert.ok(Date.parse(marker.at) >= before - 1000 && Date.parse(marker.at) <= Date.now() + 1000, marker.at)
  assert.equal(fs.existsSync(path.join(dir, '.last-backup.json.tmp')), false, 'keine Zwischendatei bleibt liegen')

  const out = runWithFunctions(`${stubs}write_backup_marker 12ab || echo ABGELEHNT`, env)
  assert.match(out, /ABGELEHNT/, 'nur eine Zahl als Größe')
  assert.equal(readBackupMarker(dir).bytes, 123456, 'die alte Markierung bleibt')

  const source = fs.readFileSync(REMOTE_SH, 'utf8')
  const start = source.indexOf('\nwrite_backup_marker() {')
  const fn = source.slice(start, source.indexOf('\n}', start))
  assert.match(fn, /\$COMPOSE exec -T chronik node -e/, 'der Container schreibt')
  assert.doesNotMatch(fn, /chown|mkdir -p|mv -f|printf/, 'kein Schreiben als root im Ordner der App')
})

test('remote.sh: backup schreibt die Markierung (ohne bei einem Fehler abzubrechen), start baut mit APP_COMMIT', () => {
  const source = fs.readFileSync(REMOTE_SH, 'utf8')
  const backup = source.slice(source.indexOf('\nbackup() {'), source.indexOf('\n}', source.indexOf('\nbackup() {')))
  assert.match(backup, /tar czf[\s\S]*write_backup_marker "\$\(stat -c %s "\$file"\)" \|\| warn/, 'nach dem Archiv, Fehler nur als Warnung')
  const start = source.slice(source.indexOf('\nstart() {'), source.indexOf('\n}', source.indexOf('\nstart() {')))
  assert.match(start, /APP_COMMIT="\$\(git rev-parse HEAD 2>\/dev\/null \|\| true\)" \$COMPOSE up -d --build/)
  const dockerfile = fs.readFileSync(path.resolve(__dirname, '..', '..', 'Dockerfile'), 'utf8')
  // \r?: ein Windows-Checkout (autocrlf) hat CRLF in Dockerfile und Compose-Datei.
  assert.match(dockerfile, /ARG APP_COMMIT=""\r?\nENV APP_COMMIT=\$APP_COMMIT/)
  const compose = fs.readFileSync(path.resolve(__dirname, '..', '..', 'docker-compose.yml'), 'utf8')
  assert.match(compose, /args:\r?\n\s+APP_COMMIT: \$\{APP_COMMIT:-\}/)
})
