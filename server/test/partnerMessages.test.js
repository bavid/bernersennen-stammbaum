const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createHousehold, getCookie } = require('./helpers')

// Phase P2 Task 9: Kontaktformular auf dem Portal (POST /api/public/partners/:slug/contact) und der
// Posteingang des Partners (/api/partner-area/messages). Das eigene Limit (5 je Stunde und IP) prüft
// test/partnerContactLimit.test.js - hier ist es hochgesetzt. t.test() bleibt auf einer Ebene.
const ADMIN_TEST_PASSWORD = 'admin-test-partner-messages-1'
const dataDir = useTempDataDir('partner-messages', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300', CONTACT_RATE_LIMIT: '500' })

const PORTAL_TEXT = 'Kleine Gruppen, viel Geduld und jede Menge Leckerli – so arbeiten wir mit euren Hunden.'
const NACHRICHT = 'Hallo, habt ihr im Oktober noch einen Platz im Welpenkurs frei?'

test('Kontaktformular und Posteingang der Partner', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const config = require('../config')

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)
  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const del = (urlPath, cookie) => call(base, urlPath, { method: 'DELETE', cookie })

  const contact = (slug, body) => post(`/api/public/partners/${slug}/contact`, body)
  const inbox = async (cookie) => {
    const res = await get('/api/partner-area/messages', cookie)
    assert.equal(res.status, 200)
    return res.data
  }
  const messagesOf = (partnerId) => db.prepare('SELECT * FROM partner_messages WHERE partner_id = ? ORDER BY id').all(partnerId)
  const sample = (overrides = {}) => ({ name: 'Mara Beispiel', email: 'mara@example.org', nachricht: NACHRICHT, ...overrides })

  let counter = 0
  async function createPartner(overrides = {}, { withArea = true } = {}) {
    counter += 1
    const input = { name: `Kontakt Partner ${counter}`, slug: `kontakt-partner-${counter}`, typ: 'hundeschule', plz: '10115', portalText: PORTAL_TEXT, status: 'aktiv', ...overrides }
    const partner = await post('/api/admin/partners', input, adminCookie)
    assert.equal(partner.status, 201)
    if (!withArea) return { partner: partner.data }
    const area = await post(`/api/admin/partners/${partner.data.id}/area`, undefined, adminCookie)
    assert.equal(area.status, 201)
    const login = await post('/api/login', { secret: area.data.key })
    return { partner: partner.data, cookie: getCookie(login.res) }
  }

  async function publishDog(cookie, name, { published = true } = {}) {
    const dog = await post('/api/dogs', { name, geschlecht: 'ruede', tierart: 'hund', vermittlungStatus: 'in_vermittlung' }, cookie)
    assert.equal(dog.status, 201)
    if (!published) return { id: dog.data.id, slug: null }
    const steckbrief = await put(`/api/dogs/${dog.data.id}/steckbrief`, { published: true }, cookie)
    assert.equal(steckbrief.status, 200)
    return { id: dog.data.id, slug: steckbrief.data.public_slug }
  }

  const school = await createPartner()
  const household = await createHousehold(base, 'Familie Ohne Posteingang')

  await t.test('gültige Nachricht: 201 { ok: true } ohne Echo, landet ungelesen im Posteingang', async () => {
    const res = await contact(school.partner.slug, sample({ telefon: '030 123456' }))
    assert.equal(res.status, 201)
    assert.deepEqual(res.data, { ok: true })

    const [row] = messagesOf(school.partner.id)
    assert.equal(row.name, 'Mara Beispiel')
    assert.equal(row.email, 'mara@example.org')
    assert.equal(row.telefon, '030 123456')
    assert.equal(row.nachricht, NACHRICHT)
    assert.equal(row.bezug, null)
    assert.equal(row.gelesen_at, null)
    assert.equal(row.is_demo, 0)

    const box = await inbox(school.cookie)
    assert.equal(box.unread, 1)
    assert.equal(box.messages.length, 1)
    assert.deepEqual(Object.keys(box.messages[0]).sort(), ['bezug', 'createdAt', 'email', 'gelesen', 'gelesenAt', 'id', 'nachricht', 'name', 'telefon'])
    assert.equal(box.messages[0].gelesen, false)
    assert.equal(box.messages[0].nachricht, NACHRICHT)
  })

  await t.test('Validierung: Nachricht 10 bis 2000 Zeichen, reiner Text, E-Mail oder Telefon, Name bis 80 Zeichen', async () => {
    const before = messagesOf(school.partner.id).length
    const invalid = [
      sample({ nachricht: 'Zu kurz!!' }),
      sample({ nachricht: 'x'.repeat(2001) }),
      sample({ nachricht: '   \u0007\u0007  kurz   ' }),
      sample({ nachricht: 'Hallo <script>alert(1)</script> ihr Lieben' }),
      sample({ nachricht: 42 }),
      sample({ nachricht: undefined }),
      sample({ email: undefined }),
      sample({ email: '', telefon: '' }),
      sample({ email: 'keine-adresse' }),
      sample({ email: 'mara@example.org?cc=x' }),
      sample({ email: undefined, telefon: 'ruft mich an' }),
      sample({ name: 'x'.repeat(81) }),
      sample({ bezugSlug: 42 })
    ]
    for (const body of invalid) assert.equal((await contact(school.partner.slug, body)).status, 400, JSON.stringify(body).slice(0, 80))
    assert.equal(messagesOf(school.partner.id).length, before, 'nichts gespeichert')

    const minimal = await contact(school.partner.slug, { email: undefined, telefon: '+49 30 987654', nachricht: 'Zehn Zeich' })
    assert.equal(minimal.status, 201)
    const cleaned = await contact(school.partner.slug, sample({ name: '  Tom\u0000 Muster‮ ', nachricht: 'Zeile eins\u0007\nZeile zwei⁦ mit Frage?' }))
    assert.equal(cleaned.status, 201)
    const rows = messagesOf(school.partner.id)
    const last = rows[rows.length - 1]
    assert.equal(last.name, 'Tom Muster')
    assert.equal(last.nachricht, 'Zeile eins\nZeile zwei mit Frage?')
    assert.equal(rows[rows.length - 2].email, null)
    assert.equal(rows[rows.length - 2].name, null)
  })

  await t.test('Honeypot "website" -> 400, nichts gespeichert', async () => {
    const before = messagesOf(school.partner.id).length
    const res = await contact(school.partner.slug, sample({ website: 'https://example.org/spam' }))
    assert.equal(res.status, 400)
    assert.equal(messagesOf(school.partner.id).length, before)
  })

  await t.test('404: unbekannt, ohne Bereich, Kontaktformular aus, nicht öffentlich (Entwurf, pausiert, gesperrt)', async () => {
    assert.equal((await contact('gibt-es-nicht', sample())).status, 404)

    const noArea = await createPartner({}, { withArea: false })
    assert.equal((await contact(noArea.partner.slug, sample())).status, 404)

    const formOff = await createPartner({ kontaktformularAktiv: false })
    assert.equal((await contact(formOff.partner.slug, sample())).status, 404)

    const draft = await createPartner({ status: 'entwurf' })
    assert.equal((await contact(draft.partner.slug, sample())).status, 404)

    const paused = await createPartner({ status: 'pausiert' })
    assert.equal((await contact(paused.partner.slug, sample())).status, 404)

    const locked = await createPartner()
    db.prepare('UPDATE partners SET gesperrt = 1 WHERE id = ?').run(locked.partner.id)
    assert.equal((await contact(locked.partner.slug, sample())).status, 404)

    for (const { partner } of [noArea, formOff, draft, paused, locked]) assert.equal(messagesOf(partner.id).length, 0)
  })

  await t.test('bezugSlug: veröffentlichtes Tier DIESES Tierheims -> "Anfrage zu …", sonst 400', async () => {
    const shelter = await createPartner({ typ: 'tierheim' })
    const otherShelter = await createPartner({ typ: 'tierheim' })
    const benno = await publishDog(shelter.cookie, 'Benno')
    const hidden = await publishDog(shelter.cookie, 'Heimlich', { published: false })
    const foreign = await publishDog(otherShelter.cookie, 'Fremdling')

    const ok = await contact(shelter.partner.slug, sample({ bezugSlug: benno.slug }))
    assert.equal(ok.status, 201)
    assert.equal(messagesOf(shelter.partner.id)[0].bezug, 'Anfrage zu Benno')
    assert.equal((await inbox(shelter.cookie)).messages[0].bezug, 'Anfrage zu Benno')

    for (const bezugSlug of [foreign.slug, 'gibt-es-nicht']) {
      assert.equal((await contact(shelter.partner.slug, sample({ bezugSlug }))).status, 400, bezugSlug)
    }
    // unveröffentlicht: kein Slug - ein erfundener Slug zum Namen hilft auch nicht
    assert.equal(hidden.slug, null)
    // ein vermitteltes Tier hat keinen öffentlichen Steckbrief mehr
    db.prepare("UPDATE dogs SET vermittlung_status = 'vermittelt' WHERE id = ?").run(benno.id)
    assert.equal((await contact(shelter.partner.slug, sample({ bezugSlug: benno.slug }))).status, 400)
    // bei einem Partner ohne Tierheim-Bereich gibt es keine Tiere
    assert.equal((await contact(school.partner.slug, sample({ bezugSlug: foreign.slug }))).status, 400)
    assert.equal(messagesOf(shelter.partner.id).length, 1)
  })

  await t.test('Demo-Partner: das Kontaktformular speichert nichts (403)', async () => {
    const demo = await createPartner()
    db.prepare('UPDATE partners SET is_demo = 1 WHERE id = ?').run(demo.partner.id)
    const res = await contact(demo.partner.slug, sample())
    assert.equal(res.status, 403)
    assert.equal(messagesOf(demo.partner.id).length, 0)
  })

  await t.test('Posteingang: nur eigene, gelesen markieren, löschen, unread auch in /api/me', async () => {
    const other = await createPartner()
    await contact(other.partner.slug, sample({ nachricht: 'Nachricht an den anderen Partner.' }))
    const foreignId = messagesOf(other.partner.id)[0].id

    const box = await inbox(school.cookie)
    assert.ok(!box.messages.some((m) => m.id === foreignId))
    const ids = box.messages.map((m) => m.id)
    assert.deepEqual(ids, [...ids].sort((a, b) => b - a), 'neueste zuerst')
    assert.equal(box.unread, box.messages.length)

    const me = await get('/api/me', school.cookie)
    assert.equal(me.data.partner.unread, box.unread)
    assert.equal((await get('/api/me', household.cookie)).data.partner, undefined)

    assert.equal((await post(`/api/partner-area/messages/${foreignId}/read`, undefined, school.cookie)).status, 404)
    assert.equal((await del(`/api/partner-area/messages/${foreignId}`, school.cookie)).status, 404)
    assert.equal((await post('/api/partner-area/messages/abc/read', undefined, school.cookie)).status, 404)
    assert.equal(messagesOf(other.partner.id)[0].gelesen_at, null)

    const read = await post(`/api/partner-area/messages/${ids[0]}/read`, undefined, school.cookie)
    assert.equal(read.status, 200)
    assert.equal(read.data.id, ids[0])
    assert.equal(read.data.gelesen, true)
    assert.match(read.data.gelesenAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    // zweimal lesen ändert den Zeitpunkt nicht
    const again = await post(`/api/partner-area/messages/${ids[0]}/read`, undefined, school.cookie)
    assert.equal(again.data.gelesenAt, read.data.gelesenAt)
    assert.equal((await inbox(school.cookie)).unread, box.unread - 1)
    assert.equal((await get('/api/me', school.cookie)).data.partner.unread, box.unread - 1)

    assert.equal((await del(`/api/partner-area/messages/${ids[1]}`, school.cookie)).status, 204)
    assert.ok(!(await inbox(school.cookie)).messages.some((m) => m.id === ids[1]))
    assert.equal((await del(`/api/partner-area/messages/${ids[1]}`, school.cookie)).status, 404)
    assert.equal(messagesOf(other.partner.id).length, 1, 'fremde Nachricht bleibt')
  })

  await t.test('nur im Partner-Bereich: ohne Sitzung 401, aus einem Zuhause 403', async () => {
    assert.equal((await get('/api/partner-area/messages')).status, 401)
    assert.equal((await get('/api/partner-area/messages', household.cookie)).status, 403)
  })

  await t.test('Aufbewahrung: Nachrichten älter als 180 Tage verschwinden beim Lesen und beim nächsten Eingang', async () => {
    const insertAged = (partnerId, days) =>
      db
        .prepare("INSERT INTO partner_messages (partner_id, email, nachricht, created_at) VALUES (?, 'alt@example.org', 'Eine ältere Nachricht.', datetime('now', ?))")
        .run(partnerId, `-${days} days`).lastInsertRowid

    const oldId = insertAged(school.partner.id, 181)
    const keptId = insertAged(school.partner.id, 179)
    const box = await inbox(school.cookie)
    assert.ok(!box.messages.some((m) => m.id === oldId))
    assert.ok(box.messages.some((m) => m.id === keptId))
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM partner_messages WHERE id = ?').get(oldId).n, 0)

    const shelf = await createPartner()
    const shelfOld = insertAged(shelf.partner.id, 200)
    const strangerOld = insertAged(school.partner.id, 190)
    assert.equal((await contact(shelf.partner.slug, sample())).status, 201)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM partner_messages WHERE id = ?').get(shelfOld).n, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM partner_messages WHERE id = ?').get(strangerOld).n, 1, 'nur die eigenen des Partners')

    // unread zählt keine abgelaufenen Nachrichten mit, auch bevor sie gelöscht sind
    const unreadBefore = (await get('/api/me', shelf.cookie)).data.partner.unread
    insertAged(shelf.partner.id, 181)
    assert.equal((await get('/api/me', shelf.cookie)).data.partner.unread, unreadBefore)
  })

  await t.test('Demo-Partner-Sitzung liest den Posteingang, markiert und löscht aber nicht', async () => {
    const { replaceDemoPack } = require('../lib/demoPack')
    replaceDemoPack(db, config.uploadDir)
    const login = await post('/api/demo', { as: 'partner' })
    assert.equal(login.status, 200)
    const cookie = getCookie(login.res)
    const box = await get('/api/partner-area/messages', cookie)
    assert.equal(box.status, 200)
    assert.ok(Array.isArray(box.data.messages))
    assert.equal(typeof login.data.partner.unread, 'number')

    const someId = db.prepare('SELECT id FROM partner_messages ORDER BY id LIMIT 1').get().id
    assert.equal((await post(`/api/partner-area/messages/${someId}/read`, undefined, cookie)).status, 403)
    assert.equal((await del(`/api/partner-area/messages/${someId}`, cookie)).status, 403)
  })
})
