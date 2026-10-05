const test = require('node:test')
const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, getCookie, createHousehold } = require('./helpers')

// Phase G Task 6: GET /api/admin/server (routes/adminServer.js) - nur für den Admin, no-store, keine Pfade oder Hostnamen.
// Die Messwerte kommen aus einer gestubbten Probe (lib/serverMetrics.js setServerMonitorForTests), nie vom echten System.
const ADMIN_TEST_PASSWORD = 'admin-test-server-1'
const dataDir = useTempDataDir('admin-server')

const GB = 1024 ** 3
const MB = 1024 ** 2
const NOW = Date.parse('2026-10-03T08:00:00Z')

const probe = {
  now: () => NOW,
  memory: async () => ({ total: 4 * GB, available: 0.3 * GB }),
  disk: async () => ({ total: 40 * GB, used: 36 * GB, free: 4 * GB }),
  load: () => ({ cores: 2, load1: 0.4, load5: 0.3, load15: 0.2 }),
  uptime: () => ({ server: 86400, app: 60 }),
  appRss: () => 40 * MB,
  fileSize: async () => 2 * MB,
  dirSize: async () => 10 * MB
}

test('Admin-Reiter Server: nur Admin, no-store, Messwerte mit Ampel und ohne Pfade', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const config = require('../config')
  const { createServerMonitor, setServerMonitorForTests } = require('../lib/serverMetrics')
  const { writeBackupMarker } = require('../lib/autoBackup')
  const restore = setServerMonitorForTests(
    createServerMonitor({
      probe,
      dirs: {
        dataDir,
        dbPath: config.dbPath,
        uploadDir: config.uploadDir,
        partnerMediaDir: config.partnerMediaDir,
        backupDir: config.backupDir
      },
      warnings: { check: async () => [], status: () => ({ aktiv: true, eingerichtet: false }) },
      commit: 'abcdef1234567890abcdef1234567890abcdef12'
    })
  )
  const { server, base } = await startApp()
  t.after(() => {
    restore()
    cleanup(dataDir, server)
  })
  await writeBackupMarker(config.backupDir, { at: '2026-10-03T01:30:00Z', bytes: 5 * MB, kind: 'deploy' })

  await t.test('ohne Admin-Cookie 401 (auch für einen angemeldeten Bereich), trotzdem no-store', async () => {
    const anonymous = await call(base, '/api/admin/server')
    assert.equal(anonymous.status, 401)
    assert.equal(anonymous.headers.get('cache-control'), 'no-store')
    const household = await createHousehold(base, 'Zuhause Birkenweg')
    const member = await call(base, '/api/admin/server', { cookie: household.cookie })
    assert.equal(member.status, 401)
  })

  await t.test('als Admin: Werte, Ampel, Stand und letztes Backup - no-store, ohne Pfade und Hostnamen', async () => {
    const login = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
    const res = await call(base, '/api/admin/server', { cookie: getCookie(login.res) })
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')

    const { data } = res
    assert.equal(data.speicher.belegtProzent, 92.5)
    assert.equal(data.speicher.ampel, 'kritisch')
    assert.equal(data.platte.belegtProzent, 90)
    assert.equal(data.platte.ampel, 'kritisch')
    assert.equal(data.last.ampel, 'ok')
    assert.deepEqual(data.stand, {
      version: 'abcdef1',
      letztesBackup: { at: '2026-10-03T01:30:00.000Z', bytes: 5 * MB, art: 'deploy' },
      ausserHaus: null
    })
    assert.equal(data.groessen.fotos, 20 * MB)
    assert.ok(Array.isArray(data.verlauf))

    const json = JSON.stringify(data)
    assert.doesNotMatch(json, /[\\/]/, 'keine Pfade')
    for (const secret of [dataDir, path.basename(dataDir), os.hostname(), 'backups', 'uploads', 'data.db']) {
      assert.ok(!json.includes(secret), `enthält nicht ${secret}`)
    }
  })
})
