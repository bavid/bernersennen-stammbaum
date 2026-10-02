const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir } = require('./helpers')

const dataDir = useTempDataDir('guest-access')

test('Phase V2: Allow-List der Besuchs-Sitzung und Schreib-Limit je Gast', async (t) => {
  t.after(() => {
    require('../db').close()
    require('node:fs').rmSync(dataDir, { recursive: true, force: true })
  })
  const { isGuestAllowed } = require('../lib/guestAccess')
  const { writeLimitKey } = require('../middleware/abuse')
  const allowed = (method, originalUrl) => isGuestAllowed({ method, originalUrl })

  await t.test('erlaubt: ansehen, kommentieren, eigene Kommentare löschen, zurückwechseln, Besuch beenden', () => {
    for (const url of ['/api/me', '/api/dogs', '/api/dogs/12', '/api/dogs/all', '/api/dogs/links', '/api/timeline?dogId=3', '/api/timeline/recent?limit=4', '/api/breeding', '/api/notes', '/api/besuche', '/uploads/abc.jpg']) {
      assert.equal(allowed('GET', url), true, url)
    }
    assert.equal(allowed('HEAD', '/uploads/abc.jpg'), true)
    assert.equal(allowed('GET', '/API/DOGS/'), true, 'Groß/klein und Schrägstrich wie Express')
    assert.equal(allowed('POST', '/api/timeline/5/comments'), true)
    assert.equal(allowed('DELETE', '/api/timeline/5/comments/9'), true)
    assert.equal(allowed('POST', '/api/view'), true)
    assert.equal(allowed('POST', '/api/logout'), true)
    assert.equal(allowed('DELETE', '/api/besuche/bei/4'), true)
  })

  await t.test('gesperrt: alles andere, auch exotische Schreibweisen', () => {
    const denied = [
      ['GET', '/api/vouchers/mine'],
      ['GET', '/api/users'],
      ['GET', '/api/family/members'],
      ['GET', '/api/erlebt-mit/offen'],
      ['GET', '/api/dogs/12/shares'],
      ['GET', '/api/dogs/%31'],
      ['GET', '/api//dogs'],
      ['GET', '/api/partner-area/profile'],
      ['POST', '/api/dogs'],
      ['PUT', '/api/dogs/12'],
      ['DELETE', '/api/timeline/5'],
      ['PUT', '/api/timeline/5/comments/9'],
      ['POST', '/api/timeline/5/comments/9'],
      ['POST', '/api/uploads'],
      ['POST', '/api/besuche/einladungen'],
      ['DELETE', '/api/besuche/gaeste/4'],
      ['POST', '/api/discover'],
      ['POST', '/api/messages'],
      ['PATCH', '/api/me'],
      ['OPTIONS', '/api/dogs']
    ]
    for (const [method, url] of denied) assert.equal(allowed(method, url), false, `${method} ${url}`)
  })

  await t.test('Schreib-Limit: ein Gast zählt unter seinem eigenen Zuhause, nicht beim Gastgeber', () => {
    assert.equal(writeLimitKey({ isGuest: true, homeId: 7, familyId: 9 }), 'guest-7')
    assert.equal(writeLimitKey({ isGuest: false, homeId: 7, familyId: 9 }), 'family-9')
  })
})
