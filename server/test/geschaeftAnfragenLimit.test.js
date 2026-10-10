const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call } = require('./helpers')
const { heuteBerlin, datumPlusTage } = require('../lib/terminvorschlaege')

// Geschäftsanfrage: dasselbe knappe Limit wie alle Anfragen (3 je Stunde und IP, Standardwert), auch abgelehnte
// zählen. Eigene Datei, weil das Limit je Prozess gilt.
const dataDir = useTempDataDir('geschaeft-limit')

function naechsterWerktag() {
  const morgen = datumPlusTage(heuteBerlin(), 1)
  return new Date(`${morgen}T00:00:00Z`).getUTCDay() === 0 ? datumPlusTage(morgen, 1) : morgen
}

function body(email, termine = [{ datum: naechsterWerktag(), zeitfenster: 'nachmittag' }]) {
  return {
    typ: 'partner',
    firma: 'Tierheim Flocke',
    name: 'Benno Beispiel',
    email,
    plz: '10115',
    geschaeft: { art: 'tierheim', ort: 'Berlin', einwilligung: true, termine }
  }
}

test('Geschäftsanfragen: höchstens 3 je Stunde und IP, auch abgelehnte zählen', async (t) => {
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
  const ask = (payload) => call(base, '/api/public/anfragen', { method: 'POST', body: payload })

  const statuses = []
  statuses.push((await ask(body('eins@example.org', []))).status)
  statuses.push((await ask(body('zwei@example.org'))).status)
  statuses.push((await ask(body('drei@example.org'))).status)
  statuses.push((await ask(body('vier@example.org'))).status)
  assert.deepEqual(statuses, [400, 201, 201, 429])
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM geschaeft_anfragen').get().n, 2)
})
