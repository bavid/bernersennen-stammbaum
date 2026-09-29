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
