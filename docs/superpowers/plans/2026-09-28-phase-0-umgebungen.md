# Phase 0 – Umgebungen (lokal → Vorschau 3005 → Prod) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine zweite, getrennte Instanz („Vorschau", Port 3005, Branch `staging`) neben der Familien-Instanz
(Port 3010, Branch `main`) betreiben können, plus eine lokale Testumgebung mit eigenen Daten.

**Architecture:** `docker-compose.yml` wird parametrisiert (Containername, Image-Tag), damit zwei Compose-Projekte
auf einem Server laufen, ohne sich Container oder Images zu überschreiben. `APP_ENV` (production | staging | dev)
steuert ein Hinweis-Band im Client und schützt Prod vor Test-Skripten. `deploy/remote.sh` kann ein exaktes SHA
deployen, sichert vor jedem Deploy und bekommt den Befehl `showcase` zum Zurücksetzen der Vorschau.

**Tech Stack:** Node 24, Express 4, better-sqlite3, node:test, React 18, Vitest + jsdom, Bash, PowerShell 5.1.

**Repo-Konventionen:** Code-Kommentare deutsch, Test-Namen englisch. Kein Semikolon, 2 Leerzeichen, einfache
Anführungszeichen (siehe bestehende Dateien). Server-Tests: `npm --prefix server test` (node:test,
`server/test/*.test.js`, Helfer in `server/test/helpers.js`). Client-Tests: `npm --prefix client test` (Vitest;
Komponententests brauchen die Zeile `// @vitest-environment jsdom` und rendern mit `react-dom/client` + `act`, siehe
`client/src/components/ExpandableText.test.jsx`). Arbeitsbranch: `staging`.

---

### Task 1: Compose-Datei parametrisieren

**Files:**
- Modify: `docker-compose.yml:3-5`
- Modify: `.dockerignore`

- [ ] **Step 1: Containername und Image-Tag aus Variablen lesen**

In `docker-compose.yml` die Zeilen

```yaml
    build: .
    image: bernersennen-stammbaum:latest
    container_name: bernersennen-stammbaum
```

ersetzen durch

```yaml
    build: .
    # Zwei Instanzen auf einem Server (Familien-Instanz und Vorschau) brauchen eigene Namen,
    # sonst überschreibt die eine das Image bzw. den Container der anderen. Standard = Familien-Instanz.
    image: bernersennen-stammbaum:${IMAGE_TAG:-latest}
    container_name: ${CONTAINER_NAME:-bernersennen-stammbaum}
```

- [ ] **Step 2: Testdaten aus dem Image fernhalten**

In `.dockerignore` nach der Zeile `server/uploads` einfügen:

```
server/.testenv
```

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml .dockerignore
git commit -m "chore: Compose-Instanzen über CONTAINER_NAME und IMAGE_TAG trennbar"
```

---

### Task 2: `APP_ENV` im Server

**Files:**
- Modify: `server/config.js`
- Modify: `server/routes/auth.js:40-42` (Route `GET /config`)
- Test: `server/test/appenv.test.js` (neu)

- [ ] **Step 1: Failing test schreiben**

`server/test/appenv.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call } = require('./helpers')

const dataDir = useTempDataDir('appenv', { APP_ENV: 'staging' })

test('readAppEnv accepts known environments and falls back to the runtime', () => {
  const { readAppEnv } = require('../config')
  assert.equal(readAppEnv('staging', true), 'staging')
  assert.equal(readAppEnv('dev', false), 'dev')
  assert.equal(readAppEnv('', true), 'production')
  assert.equal(readAppEnv(undefined, false), 'dev')
  assert.equal(readAppEnv('quatsch', true), 'production')
})

test('/api/config tells the client which environment it runs in', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const res = await call(base, '/api/config')
  assert.equal(res.status, 200)
  assert.equal(res.data.appEnv, 'staging')
})
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `cd server && node --test test/appenv.test.js`
Expected: FAIL (`readAppEnv is not a function`)

- [ ] **Step 3: Implementieren**

In `server/config.js` direkt nach `const DEV_JWT_SECRET = …` einfügen:

```js
const APP_ENVS = ['production', 'staging', 'dev']

// Umgebung für Hinweis-Band und Schutzschalter: production | staging (Vorschau) | dev (lokal).
// Ohne gültige Angabe entscheidet NODE_ENV.
function readAppEnv(value = process.env.APP_ENV, production = isProduction) {
  const env = (value || '').trim()
  if (APP_ENVS.includes(env)) return env
  return production ? 'production' : 'dev'
}
```

Im exportierten Objekt nach `isProduction,` ergänzen:

```js
  appEnv: readAppEnv(),
  readAppEnv,
```

In `server/routes/auth.js` die Route

```js
router.get('/config', (req, res) => {
  res.json({ inviteRequired: Boolean(config.inviteCode) })
})
```

ersetzen durch

```js
router.get('/config', (req, res) => {
  res.json({ inviteRequired: Boolean(config.inviteCode), appEnv: config.appEnv })
})
```

- [ ] **Step 4: Tests laufen lassen**

Run: `cd server && node --test test/appenv.test.js && npm test`
Expected: PASS, alle Server-Tests grün.

- [ ] **Step 5: Commit**

```bash
git add server/config.js server/routes/auth.js server/test/appenv.test.js
git commit -m "feat: APP_ENV (production|staging|dev) über /api/config"
```

---

### Task 3: Hinweis-Band „Vorschau" im Client

**Files:**
- Create: `client/src/components/EnvBanner.jsx`
- Test: `client/src/components/EnvBanner.test.jsx`
- Modify: `client/src/main.jsx`
- Modify: `client/src/styles/layout.css` (am Ende anhängen)

- [ ] **Step 1: Failing test schreiben**

`client/src/components/EnvBanner.test.jsx`:

```jsx
// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'

const { config } = vi.hoisted(() => ({ config: vi.fn() }))
vi.mock('../api', () => ({ api: { config } }))

import EnvBanner from './EnvBanner.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  await act(async () => createRoot(container).render(<EnvBanner />))
}

afterEach(() => {
  container?.remove()
  config.mockReset()
})

test('the preview shows a banner that data gets reset', async () => {
  config.mockResolvedValue({ appEnv: 'staging' })
  await render()
  expect(container.textContent).toContain('Vorschau')
})

test('the local test environment is marked, too', async () => {
  config.mockResolvedValue({ appEnv: 'dev' })
  await render()
  expect(container.textContent).toContain('Testsystem')
})

test('production shows nothing, and a failing request shows nothing either', async () => {
  config.mockResolvedValue({ appEnv: 'production' })
  await render()
  expect(container.textContent).toBe('')
  container.remove()
  config.mockRejectedValue(new Error('offline'))
  await render()
  expect(container.textContent).toBe('')
})
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `cd client && npx vitest run src/components/EnvBanner.test.jsx`
Expected: FAIL (`Failed to resolve import "./EnvBanner.jsx"`)

- [ ] **Step 3: Komponente schreiben**

`client/src/components/EnvBanner.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { api } from '../api'

const LABELS = {
  staging: 'Vorschau – Beispieldaten, die regelmäßig zurückgesetzt werden',
  dev: 'Testsystem (lokal)'
}

// Band ganz oben, damit niemand die Vorschau oder die lokale Testumgebung mit der echten Chronik verwechselt
export default function EnvBanner() {
  const [appEnv, setAppEnv] = useState(null)

  useEffect(() => {
    let active = true
    api
      .config()
      .then((config) => active && setAppEnv(config.appEnv))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const label = LABELS[appEnv]
  if (!label) return null
  return (
    <div className={`env-banner env-${appEnv}`} role="note">
      {label}
    </div>
  )
}
```

- [ ] **Step 4: Einbinden und gestalten**

In `client/src/main.jsx` den Import ergänzen (nach dem Import von `ToastProvider`):

```jsx
import EnvBanner from './components/EnvBanner.jsx'
```

und im Render-Baum `<EnvBanner />` direkt vor `<App />` setzen:

```jsx
      <ToastProvider>
        <EnvBanner />
        <App />
      </ToastProvider>
```

Am Ende von `client/src/styles/layout.css` anhängen:

```css
/* Band für Vorschau (staging) und lokale Testumgebung (dev) */
.env-banner {
  position: relative;
  z-index: 60;
  padding: 4px var(--space-4);
  background: repeating-linear-gradient(-45deg, #f4c542 0 12px, #f7d774 12px 24px);
  color: #2a211a;
  font-size: var(--text-xs);
  font-weight: 800;
  letter-spacing: 0.03em;
  text-align: center;
}

.env-banner.env-dev {
  background: repeating-linear-gradient(-45deg, #9ed1b8 0 12px, #b9e2cd 12px 24px);
}
```

- [ ] **Step 5: Tests und Build**

Run: `cd client && npx vitest run && npx vite build`
Expected: alle Client-Tests grün, Build ohne Fehler.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/EnvBanner.jsx client/src/components/EnvBanner.test.jsx client/src/main.jsx client/src/styles/layout.css
git commit -m "feat: Hinweis-Band für Vorschau und lokale Testumgebung"
```

---

### Task 4: Beispieldaten für Testumgebung und Vorschau (mit Prod-Schutz)

**Files:**
- Modify: `server/lib/demoPack.js` (Funktion `createDemoPack`: optionaler Name)
- Create: `server/scripts/testenv-seed.js`
- Test: `server/test/testenvSeed.test.js`

- [ ] **Step 1: Failing test schreiben**

`server/test/testenvSeed.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const script = path.join(__dirname, '..', 'scripts', 'testenv-seed.js')

function run(env, args = []) {
  return spawnSync(process.execPath, [script, ...args], {
    env: { ...process.env, JWT_SECRET: 'test-secret', NODE_ENV: 'development', ...env },
    encoding: 'utf8'
  })
}

function familiesIn(dir) {
  const Database = require('better-sqlite3')
  const db = new Database(path.join(dir, 'data.db'), { readonly: true })
  const rows = db.prepare('SELECT name, is_demo FROM families ORDER BY name').all()
  db.close()
  return rows.map((row) => [row.name, row.is_demo])
}

test('testenv-seed never runs in production', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-seedguard-'))
  const result = run({ DATA_DIR: dir, APP_ENV: 'production' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /nie in Produktion/)
  assert.equal(fs.existsSync(path.join(dir, 'data.db')), false)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('testenv-seed creates the public demo and a writable test pack; --reset starts over', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-testenv-'))
  const env = { DATA_DIR: dir, APP_ENV: 'dev' }

  const first = run(env)
  assert.equal(first.status, 0, first.stderr)
  assert.match(first.stdout, /Passwort: sonnenhang/)
  assert.deepEqual(familiesIn(dir), [
    ['Rudel vom Sonnenhang', 1],
    ['Rudel vom Sonnenhang (Test)', 0]
  ])

  assert.equal(run(env).status, 0)
  assert.equal(familiesIn(dir).length, 2, 'second run replaces the demo and keeps the test pack')

  assert.equal(run(env, ['--reset']).status, 0)
  assert.equal(familiesIn(dir).length, 2)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('on the preview the test pack gets a random password', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-preview-'))
  const result = run({ DATA_DIR: dir, APP_ENV: 'staging' })
  assert.equal(result.status, 0, result.stderr)
  assert.doesNotMatch(result.stdout, /Passwort: sonnenhang/)
  assert.match(result.stdout, /Passwort: \S{8,}/)
  fs.rmSync(dir, { recursive: true, force: true })
})
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `cd server && node --test test/testenvSeed.test.js`
Expected: FAIL (Skript existiert nicht)

- [ ] **Step 3: `createDemoPack` bekommt einen optionalen Namen**

In `server/lib/demoPack.js` die Signatur

```js
function createDemoPack(db, { password, isDemo, copyImage }) {
```

ersetzen durch

```js
function createDemoPack(db, { password, isDemo, copyImage, name = FAMILY_NAME }) {
```

und im Insert `.run(FAMILY_NAME, bcrypt.hashSync(password, 10), isDemo ? 1 : 0)` ersetzen durch
`.run(name, bcrypt.hashSync(password, 10), isDemo ? 1 : 0)`.

- [ ] **Step 4: Seed-Skript schreiben**

`server/scripts/testenv-seed.js`:

```js
// Füllt die lokale Testumgebung bzw. die Vorschau (Port 3005) mit Beispieldaten. Läuft nie in Produktion.
//   node scripts/testenv-seed.js          -> öffentliche Demo neu, Test-Rudel anlegen (falls es fehlt)
//   node scripts/testenv-seed.js --reset  -> vorher ALLE Rudel dieser Umgebung löschen
const crypto = require('node:crypto')
const { appEnv, uploadDir } = require('../config')

if (appEnv === 'production') {
  console.error('testenv-seed läuft nur in der Testumgebung oder Vorschau (APP_ENV=dev|staging), nie in Produktion.')
  process.exit(1)
}

const db = require('../db')
const { deleteFamily, removeUploads } = require('../lib/families')
const { createDemoPack, createImageCopier, replaceDemoPack } = require('../lib/demoPack')

const TEST_PACK_NAME = 'Rudel vom Sonnenhang (Test)'
// Lokal ein festes Passwort (E2E-Skripte), auf der öffentlich erreichbaren Vorschau ein zufälliges
const testPassword = appEnv === 'dev' ? 'sonnenhang' : crypto.randomBytes(9).toString('base64url')

function deleteAllFamilies() {
  for (const family of db.prepare('SELECT id FROM families').all()) {
    removeUploads(uploadDir, deleteFamily(db, family.id))
  }
}

try {
  if (process.argv.includes('--reset')) deleteAllFamilies()
  replaceDemoPack(db, uploadDir)
  if (!db.prepare('SELECT 1 FROM families WHERE name = ?').get(TEST_PACK_NAME)) {
    createDemoPack(db, { name: TEST_PACK_NAME, password: testPassword, isDemo: false, copyImage: createImageCopier(uploadDir) })
    console.log(`Test-Rudel "${TEST_PACK_NAME}" – Passwort: ${testPassword}`)
  } else {
    console.log(`Test-Rudel "${TEST_PACK_NAME}" besteht schon (Passwort unverändert)`)
  }
  console.log(`Umgebung: ${appEnv} – öffentliche Demo über „Demo ansehen" auf der Login-Seite`)
} catch (err) {
  console.error(`testenv-seed fehlgeschlagen: ${err.message}`)
  process.exitCode = 1
} finally {
  db.close()
}
```

- [ ] **Step 5: Tests laufen lassen**

Run: `cd server && node --test test/testenvSeed.test.js && npm test`
Expected: PASS, alle Server-Tests grün.

- [ ] **Step 6: Commit**

```bash
git add server/lib/demoPack.js server/scripts/testenv-seed.js server/test/testenvSeed.test.js
git commit -m "feat: testenv-seed für Testumgebung und Vorschau, nie in Produktion"
```

---

### Task 5: Lokale Testumgebung starten

**Files:**
- Create: `scripts/testenv.js`
- Create: `start-test.bat`
- Modify: `package.json` (Root, Abschnitt `scripts`)
- Modify: `server/package.json` (Skript `dev`)
- Modify: `.gitignore`

- [ ] **Step 1: Starter schreiben**

`scripts/testenv.js`:

```js
// Lokale Testumgebung: eigene Daten (server/.testenv), Test-Admin (admin / test-admin), APP_ENV=dev.
//   npm run dev:test       -> bei Bedarf Beispieldaten anlegen, dann Server + Client starten
//   npm run testenv:seed   -> nur Beispieldaten auffrischen (Demo neu, Test-Rudel falls es fehlt)
//   npm run testenv:reset  -> alles in der Testumgebung löschen und neu befüllen
const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { hashPassword } = require('../server/lib/adminAuth')

const root = path.join(__dirname, '..')
const dataDir = path.join(root, 'server', '.testenv')
const TEST_ADMIN_PASSWORD = 'test-admin'

function seed(env, args = []) {
  const result = spawnSync(process.execPath, [path.join(root, 'server', 'scripts', 'testenv-seed.js'), ...args], {
    cwd: path.join(root, 'server'),
    env,
    stdio: 'inherit'
  })
  if (result.status !== 0) process.exit(result.status || 1)
}

async function main() {
  fs.mkdirSync(dataDir, { recursive: true })
  const env = {
    ...process.env,
    DATA_DIR: dataDir,
    APP_ENV: 'dev',
    DEV_TOOLS: '1',
    CODE_PEPPER: 'dev',
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD_HASH: await hashPassword(TEST_ADMIN_PASSWORD)
  }
  const mode = process.argv[2]
  if (mode === '--reset') return seed(env, ['--reset'])
  if (mode === '--seed') return seed(env)

  if (!fs.existsSync(path.join(dataDir, 'data.db'))) seed(env)
  console.log('Testumgebung: http://localhost:5173 · Admin: http://localhost:5173/admin (admin / test-admin)')
  const child = spawn('npm', ['run', 'dev'], { cwd: root, env, stdio: 'inherit', shell: true })
  child.on('exit', (code) => process.exit(code ?? 0))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: npm-Skripte, Windows-Starter, nodemon, .gitignore**

In `package.json` (Root) im Objekt `scripts` nach `"dev:client": …` ergänzen:

```json
    "dev:test": "node scripts/testenv.js",
    "testenv:seed": "node scripts/testenv.js --seed",
    "testenv:reset": "node scripts/testenv.js --reset",
```

`start-test.bat` (Zeilenenden CRLF):

```bat
@echo off
rem Startet die lokale Testumgebung (eigene Daten, Test-Admin admin / test-admin). Browser: http://localhost:5173
cd /d "%~dp0"
call npm run dev:test
```

In `server/package.json` das Skript `dev` ersetzen durch (sonst startet nodemon bei jedem DB-Schreibzugriff neu):

```json
    "dev": "nodemon --ignore data.db* --ignore uploads/ --ignore .testenv/ index.js",
```

In `.gitignore` unter `# Laufzeitdaten` ergänzen:

```
server/.testenv/
```

- [ ] **Step 3: Ausprobieren**

Run: `npm run testenv:reset`
Expected: Ausgabe mit `Test-Rudel "Rudel vom Sonnenhang (Test)" – Passwort: sonnenhang`, Exit-Code 0,
Ordner `server/.testenv/` enthält `data.db` und `uploads/`; `git status` zeigt `server/.testenv` nicht.

- [ ] **Step 4: Commit**

```bash
git add scripts/testenv.js start-test.bat package.json server/package.json .gitignore
git commit -m "feat: lokale Testumgebung (npm run dev:test) mit eigenen Daten und Test-Admin"
```

---

### Task 6: `deploy/remote.sh` für zwei Instanzen

**Files:**
- Modify: `deploy/remote.sh`

- [ ] **Step 1: Kopfkommentar**

Die Befehlsliste im Kopf ergänzen bzw. ändern:

```bash
#   deploy         neuesten Stand holen (oder REVISION=<sha>), vorher Backup, Image neu bauen, neu starten
#   showcase       NUR Vorschau/Staging: alle Daten löschen und Beispieldaten neu anlegen (vorher Backup)
#
# Variablen für eine zweite Instanz (Vorschau), z. B.:
#   APP_DIR=/opt/bernersennen-stammbaum-staging BRANCH=staging HTTPS_PORT=3005 \
#   CONTAINER_NAME=fap-preview IMAGE_TAG=staging APP_ENV=staging bash -s -- setup
# REVISION=<sha> deployt genau diesen Stand (z. B. das auf der Vorschau getestete SHA nach Prod).
```

- [ ] **Step 2: Neue Variablen**

Nach `DEPLOY_DOMAIN="${DEPLOY_DOMAIN:-}"` einfügen:

```bash
REVISION="${REVISION:-}"
APP_ENV="${APP_ENV:-production}"
CONTAINER_NAME="${CONTAINER_NAME:-bernersennen-stammbaum}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
```

- [ ] **Step 3: `checkout` kann ein exaktes SHA**

Die Funktion `checkout` ersetzen durch:

```bash
checkout() {
  mkdir -p "$APP_DIR"
  cd "$APP_DIR"
  if [ ! -d .git ]; then
    log "Klone $REPO_URL nach $APP_DIR"
    git init -q
    git remote add origin "$REPO_URL"
  fi
  git fetch -q origin "$BRANCH"
  local target="origin/$BRANCH"
  if [ -n "$REVISION" ]; then
    git cat-file -e "$REVISION^{commit}" 2>/dev/null || git fetch -q origin "$REVISION" || fail "Stand $REVISION nicht gefunden"
    target="$REVISION"
  fi
  git checkout -q -B "$BRANCH" "$target"
  git reset -q --hard "$target"
  log "Stand: $(git log -1 --format='%h %s')"
}
```

- [ ] **Step 4: `ensure_env` schreibt die Instanz-Werte**

In `ensure_env` nach `env_default TRUST_PROXY 1` ergänzen:

```bash
    env_default APP_ENV "$APP_ENV"
    env_default CONTAINER_NAME "$CONTAINER_NAME"
    env_default IMAGE_TAG "$IMAGE_TAG"
```

- [ ] **Step 5: Backup mit `.env`, und nur wenn die App läuft**

Die Funktion `backup` ersetzen durch:

```bash
backup() {
  cd "$APP_DIR"
  local stamp file
  stamp="$(date +%F-%H%M%S)"
  file="backups/chronik-$stamp.tgz"
  # Konsistenter Snapshot über die SQLite-Backup-API, auch während die App läuft
  $COMPOSE exec -T chronik node -e \
    "require('better-sqlite3')('/data/data.db').backup('/data/snapshot.db').then(() => process.exit(0))"
  # .env gehört dazu: ohne die Secrets (JWT_SECRET, später CODE_PEPPER) sind Sessions und Codes wertlos
  (umask 077 && tar czf "$file" -C data snapshot.db uploads -C "$APP_DIR" .env)
  rm -f data/snapshot.db
  log "Backup: $APP_DIR/$file ($(du -h "$file" | cut -f1))"
}

# Vor Deploys sichern – Migrationen lassen sich nicht zurückdrehen. Beim allerersten Start gibt es noch nichts.
backup_if_running() {
  cd "$APP_DIR"
  if [ -f .env ] && $COMPOSE ps --status running -q chronik 2>/dev/null | grep -q .; then
    backup
  fi
}
```

- [ ] **Step 6: Befehle `deploy` und `showcase`**

Im `case` den Zweig `deploy)` ersetzen durch:

```bash
  deploy)
    backup_if_running
    checkout
    ensure_env
    start
    ;;
```

und vor dem Zweig `admin)` einfügen:

```bash
  showcase)
    cd "$APP_DIR"
    case "$(env_value APP_ENV)" in
      staging|dev) ;;
      *) fail "showcase setzt alle Daten zurück – nur für Vorschau/Staging (APP_ENV=staging in .env)" ;;
    esac
    backup
    $COMPOSE exec -T chronik node scripts/testenv-seed.js --reset
    ;;
```

- [ ] **Step 7: Syntax prüfen**

Run: `bash -n deploy/remote.sh && echo OK`
Expected: `OK`

- [ ] **Step 8: Commit**

```bash
git add deploy/remote.sh
git commit -m "feat: remote.sh für zweite Instanz – REVISION, Backup vor Deploy, .env im Backup, showcase"
```

---

### Task 7: `manage.ps1` mit Ziel Vorschau oder Prod

**Files:**
- Modify: `manage.ps1` (UTF-8 mit BOM, CRLF – beides beibehalten)
- Create: `.deploy.staging.env.example`

- [ ] **Step 1: Beispiel-Konfiguration der Vorschau**

`.deploy.staging.env.example`:

```
# Kopieren nach .deploy.staging.env (gitignored) – wird von manage.ps1 -Target staging gelesen. Enthält KEINE Secrets.
DEPLOY_HOST=203.0.113.10
DEPLOY_USER=root
APP_DIR=/opt/bernersennen-stammbaum-staging
REPO_URL=https://github.com/bavid/bernersennen-stammbaum.git
BRANCH=staging
HTTPS_PORT=3005
APP_ENV=staging
CONTAINER_NAME=fap-preview
IMAGE_TAG=staging
DEPLOY_DOMAIN=
```

In `.gitignore` bei den Secrets ergänzen: `.deploy.staging.env`

- [ ] **Step 2: Parameter und Konfigurationsdatei**

Den Kopf von `manage.ps1` ändern: Die Nutzungszeilen um `.\manage.ps1 -Target staging` ergänzen und

```powershell
param([string]$Command)
```

ersetzen durch

```powershell
param(
    [string]$Command,
    [ValidateSet('prod', 'staging')][string]$Target = 'prod'
)
```

Die Zeile `$DeployEnvPath = Join-Path $PSScriptRoot '.deploy.env'` ersetzen durch

```powershell
$DeployEnvPath = Join-Path $PSScriptRoot $(if ($Target -eq 'staging') { '.deploy.staging.env' } else { '.deploy.env' })
```

In der Fehlermeldung bei fehlender Datei den Dateinamen aus `$DeployEnvPath` ausgeben:

```powershell
    Write-Host "  $(Split-Path -Leaf $DeployEnvPath) fehlt. Kopiere die passende .example-Datei und trage den Server ein." -ForegroundColor Red
```

Die Zeile `$RemoteEnv = …` ersetzen durch

```powershell
$RemoteEnv = "APP_DIR='$($cfg.APP_DIR)' REPO_URL='$($cfg.REPO_URL)' BRANCH='$($cfg.BRANCH)' HTTPS_PORT='$HttpsPort' DEPLOY_DOMAIN='$($cfg.DEPLOY_DOMAIN)'"
foreach ($key in 'APP_ENV', 'CONTAINER_NAME', 'IMAGE_TAG') {
    if ($cfg[$key]) { $RemoteEnv += " $key='$($cfg[$key])'" }
}
```

- [ ] **Step 3: „Vorschau → Prod übernehmen"**

Nach der Funktion `Save-Backup` einfügen:

```powershell
# Bringt genau das auf der Vorschau getestete SHA nach Prod: main wird vorgespult, Prod deployt dieses SHA
function Invoke-Promote {
    git -C $PSScriptRoot fetch -q origin staging
    $sha = (git -C $PSScriptRoot rev-parse origin/staging).Trim()
    Write-Host "  Übernimmt Vorschau-Stand $($sha.Substring(0, 7)) nach Prod (main)." -ForegroundColor Yellow
    if ((Read-Host "  Zum Bestätigen PROD eintippen") -ne 'PROD') { return }
    git -C $PSScriptRoot push origin "${sha}:refs/heads/main"
    if ($LASTEXITCODE -ne 0) { Write-Host "  main lässt sich nicht vorspulen (Stände auseinandergelaufen?)." -ForegroundColor Red; return }
    $script:RemoteEnv += " REVISION='$sha'"
    Invoke-Remote 'deploy'
}
```

- [ ] **Step 4: Menü**

Im `switch` von `Invoke-Action` ergänzen (vor `default`):

```powershell
        { $_ -in '11', 'showcase' } {
            if ($Target -ne 'staging') { Write-Host "  Nur für die Vorschau (-Target staging)." -ForegroundColor Red; return }
            Invoke-Remote 'showcase'
        }
        { $_ -in '12', 'promote' } {
            if ($Target -ne 'prod') { Write-Host "  Übernehmen läuft gegen Prod (ohne -Target staging starten)." -ForegroundColor Red; return }
            Invoke-Promote
        }
```

Im Menükopf die Zeile mit dem Titel ersetzen durch

```powershell
    $label = if ($Target -eq 'staging') { 'VORSCHAU' } else { 'PROD' }
    $color = if ($Target -eq 'staging') { 'Yellow' } else { 'DarkYellow' }
    Write-Host "    Familienchronik [$label]  |  https://${SiteHost}:$HttpsPort" -ForegroundColor $color
```

und unter `[10]` ergänzen:

```powershell
    if ($Target -eq 'staging') {
        Write-Host "  [11] Vorschau zurücksetzen (Beispieldaten neu)" -ForegroundColor Yellow
    } else {
        Write-Host "  [12] Vorschau-Stand nach Prod übernehmen" -ForegroundColor Magenta
    }
```

- [ ] **Step 5: Syntax prüfen**

Run (PowerShell):

```powershell
$null = [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path .\manage.ps1), [ref]$null, [ref]$errors); $errors.Count
```

Expected: `0`. Außerdem `Get-Content manage.ps1 -Encoding Byte -TotalCount 3` → `239 187 191` (BOM erhalten).

- [ ] **Step 6: Commit**

```bash
git add manage.ps1 .deploy.staging.env.example .gitignore
git commit -m "feat: manage.ps1 -Target staging, Vorschau zurücksetzen, Vorschau nach Prod übernehmen"
```

---

### Task 8: README

**Files:**
- Modify: `README.md` (Abschnitt „Lokal starten" und „Auf einem Server betreiben")

- [ ] **Step 1: Testumgebung dokumentieren**

Im Abschnitt „Lokal starten" nach dem Codeblock mit `npm run dev` einfügen:

```markdown
**Testumgebung mit eigenen Daten:** `npm run dev:test` (Windows: `start-test.bat`) startet Server und Client mit
Daten unter `server/.testenv/`, einem Test-Admin (`admin` / `test-admin`) und dem Band „Testsystem".
`npm run testenv:reset` löscht die Testdaten und legt die Beispieldaten neu an. Die echte lokale Datenbank bleibt
unberührt.
```

- [ ] **Step 2: Vorschau-Instanz dokumentieren**

Im Serverabschnitt nach „Weitere Menüpunkte …" einfügen:

```markdown
**Vorschau (zweite Instanz):** Auf demselben Server läuft eine Vorschau mit Branch `staging` auf Port 3005 – nur
Beispieldaten, oben das Band „Vorschau". `.deploy.staging.env.example` nach `.deploy.staging.env` kopieren, dann
`.\manage.ps1 -Target staging` (Erstinstallation mit **[9]**, Beispieldaten mit **[11]**). Freigegebene Stände
bringt `.\manage.ps1` → **[12]** nach Prod: `main` wird auf genau das getestete SHA vorgespult und deployt.
Jeder Deploy sichert vorher DB, Fotos und `.env`.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: Testumgebung und Vorschau-Instanz"
```

---

### Task 9 (Koordinator, nicht Sub-Agent): Vorschau auf dem Server einrichten

Dieser Schritt braucht SSH-Zugang und wird vom Koordinator selbst ausgeführt.

- [ ] **Step 1:** `git push -u origin staging`
- [ ] **Step 2:** Vorschau einrichten:
  `ssh root@<SERVER-IP> "APP_DIR=/opt/bernersennen-stammbaum-staging BRANCH=staging HTTPS_PORT=3005 CONTAINER_NAME=fap-preview IMAGE_TAG=staging APP_ENV=staging bash -s -- setup" < deploy/remote.sh`
- [ ] **Step 3:** Beispieldaten: dieselben Variablen, Befehl `showcase`.
- [ ] **Step 4:** Prüfen: `docker ps` zeigt `bernersennen-stammbaum` (3010) **und** `fap-preview` (3005) mit
  getrennten Images; `curl http://127.0.0.1:3005/health` ok; Prod unverändert (Health, Demo-Login, Rudelzahl).
- [ ] **Step 5:** Öffentlicher Zugang über HTTPS braucht einen Eintrag im gemeinsamen Proxy (`/opt/proxy/Caddyfile`,
  Repo „server"): `https://{$PUBLIC_IP}:3005 { import ip_cert; encode zstd gzip; reverse_proxy 127.0.0.1:3005 }`.
  **Nur nach Freigabe durch den Nutzer**, weil die Datei zu einem anderen Projekt gehört.
