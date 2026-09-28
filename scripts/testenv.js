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
  const child = spawn('npm run dev', { cwd: root, env, stdio: 'inherit', shell: true })
  child.on('exit', (code) => process.exit(code ?? 0))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
