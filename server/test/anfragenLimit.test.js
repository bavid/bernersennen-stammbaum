const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call } = require('./helpers')

// Phase N Task 1: Anfragen haben ein eigenes Limit von 3 je Stunde und IP (Standardwert, ANFRAGE_RATE_LIMIT ist
// hier bewusst nicht gesetzt). Es zählt jede Anfrage, auch abgelehnte - sonst ließe sich das Formular zum
// Ausprobieren von Adressen (DNS-Nachfrage) missbrauchen. Eigene Datei, weil das Limit je Prozess gilt.
const dataDir = useTempDataDir('anfragen-limit')

test('Anfragen: höchstens 3 je Stunde und IP, auch abgelehnte zählen', async (t) => {
  delete process.env.ANFRAGE_RATE_LIMIT
  const { useResolverForTests } = require('../lib/emailCheck')
  const restoreResolver = useResolverForTests({
    resolveMx: async () => [{ exchange: 'mail.example.org', priority: 10 }],
    resolve4: async () => [],
    resolve6: async () => []
  })
  const { server, base } = await startApp()
  t.after(() => {
    restoreResolver()
    cleanup(dataDir, server)
  })
  const db = require('../db')
  const ask = (body) => call(base, '/api/public/anfragen', { method: 'POST', body })

  const statuses = []
  statuses.push((await ask({ typ: 'gutschein', email: 'kein-at-zeichen' })).status)
  statuses.push((await ask({ typ: 'gutschein', email: 'eins@example.org' })).status)
  statuses.push((await ask({ typ: 'gutschein', email: 'zwei@example.org' })).status)
  assert.deepEqual(statuses, [400, 201, 201])

  const fourth = await ask({ typ: 'partner', email: 'drei@example.org', firma: 'Hundesalon Kamm', partnerTyp: 'hundesalon' })
  assert.equal(fourth.status, 429)
  assert.ok(fourth.data.error)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM anfragen').get().n, 2)
})
