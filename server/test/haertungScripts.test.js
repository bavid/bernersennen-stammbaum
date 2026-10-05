const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

// DevOps Schritt 1 (docs/superpowers/plans/2026-10-04-devops-sicherheit.md): die Härtungs-Skripte in deploy/haertung
// laufen nur auf dem Server und nur nach Freigabe - hier wird geprüft, was sich ohne Server prüfen lässt: Syntax
// (bash -n), set -euo pipefail, --check/--help in jedem Skript, keine Server-IP und keine gesperrten Namen (Muster aus
// dem lokalen pre-commit-Hook, der selbst nicht im Repo liegt), die Markierung der Sicherung außer Haus passt zur App,
// die compose-Override-Datei enthält die Härtung, remote.sh kommt mit dem Deploy-Nutzer (sudo) zurecht.
const ROOT = path.resolve(__dirname, '..', '..')
const HAERTUNG = path.join(ROOT, 'deploy', 'haertung')
const REMOTE_SH = path.join(ROOT, 'deploy', 'remote.sh')
const OVERRIDE = path.join(ROOT, 'docker-compose.override.yml')

const read = (file) => fs.readFileSync(file, 'utf8')
const haertungFiles = fs.readdirSync(HAERTUNG).map((name) => path.join(HAERTUNG, name))
const shellScripts = haertungFiles.filter((file) => file.endsWith('.sh'))
const numbered = shellScripts.filter((file) => /^\d\d-/.test(path.basename(file)))
// Skripte mit eigener Hilfe (--help) und --check: alle außer der Bibliothek lib.sh.
const runnable = shellScripts.filter((file) => path.basename(file) !== 'lib.sh')
// Alles, was auf den Server kopiert oder von dort gelesen wird - darf weder IP noch gesperrte Namen enthalten.
const textFiles = [...haertungFiles, REMOTE_SH, OVERRIDE]

// Wie deployScript.test.js: Git-Bash zuerst, ohne passende bash werden die bash-Tests übersprungen.
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
const bashPath = (p) => p.replace(/\\/g, '/')

test('deploy/haertung: alle erwarteten Skripte und Vorlagen liegen vor', () => {
  const names = haertungFiles.map((file) => path.basename(file))
  for (const expected of [
    'README.md',
    'lib.sh',
    '01-firewall.sh',
    '02-ssh.sh',
    '03-updates.sh',
    '04-crowdsec.sh',
    '05-docker.sh',
    '06-restic.sh',
    '07-restore-test.sh',
    'check.sh',
    'fap-backup.sh',
    'haertung.env.example',
    'sudoers-fap-deploy.tpl',
    'apt-52fap-unattended-upgrades.conf'
  ]) {
    assert.ok(names.includes(expected), `${expected} fehlt`)
  }
  assert.equal(numbered.length, 7, 'sieben nummerierte Blöcke')
  assert.ok(!names.includes('haertung.env'), 'die echte haertung.env gehört nicht ins Repo')
})

test('jedes Skript: bash-Shebang, set -euo pipefail am Anfang, deutscher Kopfkommentar', () => {
  for (const file of shellScripts) {
    const lines = read(file).split('\n')
    assert.equal(lines[0], '#!/usr/bin/env bash', `${path.basename(file)}: Shebang`)
    assert.ok(lines[1].startsWith('# ') && lines[1].length > 20, `${path.basename(file)}: Kopfkommentar in Zeile 2`)
    const head = lines.slice(0, 20).join('\n')
    assert.match(head, /^set -euo pipefail$/m, `${path.basename(file)}: set -euo pipefail in den ersten 20 Zeilen`)
  }
})

test('jedes Skript: bash -n (Syntax)', { skip }, () => {
  for (const file of [...shellScripts, REMOTE_SH]) {
    const result = spawnSync(bash, ['-n', bashPath(file)], { encoding: 'utf8' })
    assert.equal(result.status, 0, `${path.basename(file)}: ${result.stderr}`)
  }
})

test('jedes ausführbare Skript kennt --check und --help, die Blöcke laden lib.sh und parse_flags', () => {
  for (const file of runnable) {
    const source = read(file)
    assert.match(source, /--check/, `${path.basename(file)}: --check`)
    assert.match(source, /usage\(\)/, `${path.basename(file)}: usage()`)
  }
  for (const file of [...numbered, path.join(HAERTUNG, 'check.sh')]) {
    const source = read(file)
    assert.match(source, /source "\$HAERTUNG_DIR\/lib\.sh"/, `${path.basename(file)}: lädt lib.sh`)
    assert.match(source, /\bparse_flags\b/, `${path.basename(file)}: parse_flags`)
    assert.match(source, /\bneed_root\b/, `${path.basename(file)}: need_root`)
  }
})

test('--help läuft ohne root durch und zeigt den Aufruf (nichts wird angefasst)', { skip }, () => {
  for (const file of runnable) {
    const result = spawnSync(bash, [bashPath(file), '--help'], { encoding: 'utf8', env: { ...process.env, HAERTUNG_DIR: '' } })
    assert.equal(result.status, 0, `${path.basename(file)}: ${result.stderr}`)
    assert.match(result.stdout, /^Aufruf: /m, `${path.basename(file)}: Aufruf-Zeile`)
  }
})

test('unbekannte Option wird abgelehnt (Status 1, FEHLER)', { skip }, () => {
  for (const file of runnable) {
    const result = spawnSync(bash, [bashPath(file), '--kaputt'], { encoding: 'utf8' })
    assert.equal(result.status, 1, path.basename(file))
    assert.match(result.stderr, /FEHLER: Unbekannte Option/, path.basename(file))
  }
})

test('keine IP-Adressen (außer localhost, 0.0.0.0 und den Beispiel-Netzen) in Skripten, Vorlagen und README', () => {
  const allowed = /^(127\.0\.0\.1|0\.0\.0\.0|203\.0\.113\.\d+|192\.0\.2\.\d+|198\.51\.100\.\d+)$/
  for (const file of textFiles) {
    const hits = (read(file).match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g) || []).filter((ip) => !allowed.test(ip))
    assert.deepEqual(hits, [], `${path.basename(file)} enthält IP-Adressen`)
  }
})

// Die Server-IP steht nur in .deploy.env (nicht versioniert) - wenn sie da ist, darf sie nirgends auftauchen.
test('die Server-Adresse aus .deploy.env steht nirgends', () => {
  const envFile = path.join(ROOT, '.deploy.env')
  if (!fs.existsSync(envFile)) return
  const host = (read(envFile).match(/^DEPLOY_HOST=(\S+)/m) || [])[1]
  if (!host) return
  for (const file of textFiles) {
    assert.ok(!read(file).includes(host), `${path.basename(file)} enthält die Server-Adresse`)
  }
})

// Das Muster der gesperrten Namen liegt nur im lokalen pre-commit-Hook (bewusst nicht im Repo): ist er da, gilt er hier
// auch für die Härtungs-Dateien, Zeile für Zeile wie im Hook.
test('keine gesperrten Namen (Muster aus dem lokalen pre-commit-Hook)', () => {
  const hook = path.join(ROOT, '.git', 'hooks', 'pre-commit')
  if (!fs.existsSync(hook) || !fs.statSync(hook).isFile()) return
  const match = read(hook).match(/^PATTERN="([^"]+)"/m)
  if (!match) return
  const pattern = new RegExp(match[1].replace(/\\b/g, '\\b'), 'i')
  for (const file of textFiles) {
    const hit = read(file)
      .split('\n')
      .find((line) => pattern.test(line))
    assert.equal(hit, undefined, `${path.basename(file)}: gesperrter Name in „${hit}“`)
  }
})

test('README nennt jeden Block und jedes Skript in der Reihenfolge, Risiko und Rückweg', () => {
  const readme = read(path.join(HAERTUNG, 'README.md'))
  for (const file of runnable) {
    assert.ok(readme.includes(path.basename(file)), `README erwähnt ${path.basename(file)} nicht`)
  }
  const order = numbered.map((file) => readme.indexOf(path.basename(file)))
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'Skripte in Reihenfolge erklärt')
  assert.match(readme, /Risiko/)
  assert.match(readme, /Zurück|Rückweg|Rollback/)
  assert.match(readme, /Cloud Firewall/, 'Hetzner Cloud Firewall als zweite Schicht')
  assert.match(readme, /Storage Box/, 'Storage Box einrichten')
  assert.match(readme, /forget/, 'Aufbewahrung vom eigenen Rechner')
  assert.match(readme, /\$DEPLOY_HOST/, 'Platzhalter statt Adresse')
})

test('fap-backup.sh schreibt die Markierung, die die App als Sicherung außer Haus liest', { skip }, (t) => {
  const { OFFSITE_MARKER_FILE, readOffsiteMarker } = require('../lib/autoBackup')
  const source = read(path.join(HAERTUNG, 'fap-backup.sh'))
  assert.match(source, new RegExp(`OFFSITE_MARKER=${OFFSITE_MARKER_FILE.replace('.', '\\.')}`), 'Dateiname wie in lib/autoBackup.js')
  assert.match(source, /\\"kind\\":\\"offsite\\"/, 'kind offsite')
  assert.match(source, /FAP_BACKUP_SOURCE_ONLY/, 'Funktionen lassen sich laden (06, 07, check.sh)')

  // fb_write_marker mit den Funktionen des Skripts: neue Datei + rename, Besitzer wie der Ordner (chown hier überdeckt).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'haertung-marker-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const script = [
    `source "${bashPath(path.join(HAERTUNG, 'fap-backup.sh'))}"`,
    'chown() { :; }',
    `fb_write_marker "${bashPath(dir)}" '{"at":"2026-10-03T01:50:00.000Z","bytes":4096,"kind":"offsite"}'`
  ].join('\n')
  const result = spawnSync(bash, ['-c', script], { encoding: 'utf8', env: { ...process.env, FAP_BACKUP_SOURCE_ONLY: '1' } })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(readOffsiteMarker(dir), { at: '2026-10-03T01:50:00.000Z', bytes: 4096, kind: 'offsite' })
  assert.deepEqual(fs.readdirSync(dir), [OFFSITE_MARKER_FILE], 'keine Zwischendatei bleibt liegen')
})

test('docker-compose.override.yml: Härtung für den App-Container, Basis-Datei bindet weiter nur an 127.0.0.1', () => {
  const override = read(OVERRIDE)
  for (const key of ['no-new-privileges:true', 'cap_drop:', '- ALL', 'read_only: true', 'tmpfs:', '- /tmp:', 'memory:', 'cpus:', 'pids:']) {
    assert.ok(override.includes(key), `Override enthält ${key}`)
  }
  assert.match(override, /^services:\r?\n {2}chronik:/m, 'gleicher Dienstname wie docker-compose.yml')
  assert.doesNotMatch(override, /ports:|volumes:|image:|build:/, 'nur Härtung - Ports, Volumes und Image bleiben in der Basis-Datei')
  const base = read(path.join(ROOT, 'docker-compose.yml'))
  assert.match(base, /"127\.0\.0\.1:\$\{HTTPS_PORT:-3010\}:3000"/)
  assert.match(read(path.join(HAERTUNG, '05-docker.sh')), /docker-compose\.override\.yml/, '05-docker.sh kennt die Override-Datei')
})

test('remote.sh: als Deploy-Nutzer läuft docker über sudo -n, als root ohne; chown über den vollen Pfad (sudoers-Regel)', () => {
  const source = read(REMOTE_SH)
  assert.match(source, /SUDO="sudo -n"/)
  assert.match(source, /^COMPOSE="\$SUDO docker compose"$/m)
  assert.match(source, /^DOCKER="\$SUDO docker"$/m)
  assert.match(source, /\$SUDO chown "\$CONTAINER_UID:\$CONTAINER_UID" "\$APP_DIR\/data"/)
  assert.match(source, /\$DOCKER image prune/)
  assert.doesNotMatch(source, /^\s+docker (compose|image)/m, 'kein nacktes docker mehr')
  const sudoers = read(path.join(HAERTUNG, 'sudoers-fap-deploy.tpl'))
  assert.doesNotMatch(sudoers, /NOPASSWD:\s*ALL/, 'kein pauschales NOPASSWD')
  assert.match(sudoers, /env_keep \+= "APP_COMMIT"/, 'APP_COMMIT kommt durch sudo')
  assert.match(sudoers, /\/usr\/bin\/chown \* \/opt\/\*/, 'chown nur unter /opt')
  assert.match(sudoers, /__USER__/, 'Platzhalter für den Nutzernamen')
})
