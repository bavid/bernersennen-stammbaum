const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createFamily, createHousehold, getCookie } = require('./helpers')

// Phase N Task 2: jedes Ereignis löst genau EINE Benachrichtigung aus - Anfrage (Gutschein/Partner), Einlösen (neues
// Zuhause bzw. Partner-Zugang), Feedback, eingereichter Partner-Beitrag - und Demo, Duplikate und Fehler keine.
// Eingerichtet über den Rückfall aus der Umgebung (erfundene Werte); Telegram ist ein Fake-Client, nie das Netz.
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const ADMIN_TEST_PASSWORD = 'admin-test-notify-hooks-1'
const FAKE_TOKEN = '777777:HOOK-token_nur-fuer-tests-000000000'
const dataDir = useTempDataDir('notify-hooks', {
  TELEGRAM_BOT_TOKEN: FAKE_TOKEN,
  TELEGRAM_CHAT_ID: '-100999',
  ANFRAGE_RATE_LIMIT: '1000'
})

test('Benachrichtigungen: jedes Ereignis genau einmal, Demo und Fehler nie', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { useResolverForTests } = require('../lib/emailCheck')
  const { setTelegramClientForTests } = require('../lib/telegram')
  const { flushNotificationsForTests } = require('../lib/notify')
  const sent = []
  const restoreResolver = useResolverForTests({
    resolveMx: async () => [{ exchange: 'mail.example.org', priority: 10 }],
    resolve4: async () => [],
    resolve6: async () => []
  })
  const restoreClient = setTelegramClientForTests({
    sendMessage: async (message) => {
      sent.push(message)
      return { message_id: sent.length }
    }
  })
  const { server, base } = await startApp()
  t.after(() => {
    restoreClient()
    restoreResolver()
    cleanup(dataDir, server)
  })
  const db = require('../db')

  const login = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(login.res)
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  await put('/api/admin/notify-settings', { beitrag: true }, adminCookie)

  // Führt fn aus, wartet alle Benachrichtigungen ab und gibt die Texte der neu verschickten zurück.
  async function newMessages(fn) {
    const before = sent.length
    const result = await fn()
    await flushNotificationsForTests()
    return { result, texts: sent.slice(before).map((message) => message.text) }
  }

  await t.test('Gutschein-Anfrage: eine Nachricht; Duplikat und ungültige Anfrage keine', async () => {
    const first = await newMessages(() => post('/api/public/anfragen', { typ: 'gutschein', name: 'Wilma Beispiel', email: 'wilma@example.org' }))
    assert.equal(first.result.status, 201)
    assert.deepEqual(first.texts, ['🐾 Neue Gutschein-Anfrage – im Admin unter „Anfragen“ ansehen.'])
    assert.equal(sent.at(-1).chatId, '-100999')

    const duplicate = await newMessages(() => post('/api/public/anfragen', { typ: 'gutschein', email: 'wilma@example.org' }))
    assert.equal(duplicate.result.status, 201)
    assert.deepEqual(duplicate.texts, [], 'keine neue Zeile -> keine Nachricht')

    const invalid = await newMessages(() => post('/api/public/anfragen', { typ: 'gutschein', email: 'kaputt' }))
    assert.equal(invalid.result.status, 400)
    assert.deepEqual(invalid.texts, [])
  })

  await t.test('Partner-Anfrage: eigener Text, ohne personenbezogene Daten', async () => {
    const { result, texts } = await newMessages(() =>
      post('/api/public/anfragen', { typ: 'partner', email: 'kontakt@example.org', firma: 'Hundeschule Pfotenweg', partnerTyp: 'hundeschule' })
    )
    assert.equal(result.status, 201)
    assert.deepEqual(texts, ['🐾 Neue Anfrage für einen Partner-Zugang – im Admin unter „Anfragen“ ansehen.'])
  })

  let household
  await t.test('Einlösen eines Kunden-Gutscheins: eine Registrierung; mit Details der Bereichsname', async () => {
    const { result, texts } = await newMessages(() => createHousehold(base, 'Zuhause Flocke'))
    household = result
    assert.equal(result.status, 201)
    assert.deepEqual(texts, ['🐾 Neue Registrierung – mit einem Gutschein ist ein neuer Bereich entstanden.'])

    await put('/api/admin/notify-settings', { details: true }, adminCookie)
    const detailed = await newMessages(() => createHousehold(base, 'Zuhause Pepper'))
    assert.equal(detailed.texts.length, 1)
    assert.match(detailed.texts[0], /\nBereich: Zuhause Pepper$/)
    await put('/api/admin/notify-settings', { details: false }, adminCookie)

    const unknown = await newMessages(() => post('/api/vouchers/redeem', { code: 'AAAA-BBBB-CCCC', name: 'Niemand' }))
    assert.equal(unknown.result.status, 404)
    assert.deepEqual(unknown.texts, [])
  })

  let partnerCookie
  await t.test('Einlösen eines Partner-Zugangs: eigener Text', async () => {
    const batch = await post('/api/admin/voucher-batches', { label: 'Zugang Schule', size: 1, zweck: 'partnerzugang' }, adminCookie)
    const { result, texts } = await newMessages(() =>
      post('/api/vouchers/redeem', { code: batch.data.codes[0], name: 'Hundeschule Pfotenweg', typ: 'hundeschule', plz: '10115' })
    )
    assert.equal(result.status, 201)
    partnerCookie = getCookie(result.res)
    assert.deepEqual(texts, ['🐾 Ein Partner-Zugang wurde eingelöst – ein neuer Partner richtet sich ein.'])
  })

  await t.test('Feedback und Problemmeldung: je eine Nachricht, ohne Inhalt', async () => {
    const feedback = await newMessages(() => post('/api/messages', { type: 'feedback', text: 'Tolle Seite, danke!' }, household.cookie))
    assert.equal(feedback.result.status, 201)
    assert.equal(feedback.texts.length, 1)
    assert.match(feedback.texts[0], /Neues Feedback/)
    assert.ok(!feedback.texts[0].includes('Tolle Seite'))

    const problem = await newMessages(() => post('/api/messages', { type: 'problem', text: 'Das Foto lädt nicht.' }, household.cookie))
    assert.equal(problem.texts.length, 1)
    assert.match(problem.texts[0], /Problemmeldung/)

    const invalid = await newMessages(() => post('/api/messages', { type: 'feedback', text: '' }, household.cookie))
    assert.equal(invalid.result.status, 400)
    assert.deepEqual(invalid.texts, [])
  })

  await t.test('Partner-Beitrag: Einreichen eine Nachricht, Ändern eines eingereichten keine, erneutes Einreichen eine', async () => {
    const body = { titel: 'Welpenkurs ab Oktober', text: 'Sechs Termine in kleiner Gruppe.', bereich: 'hundeschule' }
    const created = await newMessages(() => post('/api/partner-area/posts', body, partnerCookie))
    assert.equal(created.result.status, 201)
    assert.deepEqual(created.texts, ['🐾 Ein Partner hat einen Beitrag eingereicht – bitte im Admin prüfen und freigeben.'])
    const id = created.result.data.id

    const edited = await newMessages(() => put(`/api/partner-area/posts/${id}`, { ...body, text: 'Jetzt mit sieben Terminen.' }, partnerCookie))
    assert.equal(edited.result.status, 200)
    assert.deepEqual(edited.texts, [], 'liegt schon zur Prüfung - keine zweite Nachricht')

    assert.equal((await post(`/api/admin/promotions/${id}/freigeben`, undefined, adminCookie)).status, 200)
    const resubmitted = await newMessages(() => put(`/api/partner-area/posts/${id}`, { ...body, titel: 'Welpenkurs ab November' }, partnerCookie))
    assert.equal(resubmitted.result.status, 200)
    assert.equal(resubmitted.result.data.freigabe, 'eingereicht')
    assert.equal(resubmitted.texts.length, 1, 'nach der Freigabe geändert -> wieder zur Prüfung')

    const uploadImage = async () => {
      const form = new FormData()
      form.append('file', new Blob([PNG_BYTES], { type: 'image/png' }), 'bild.png')
      return fetch(`${base}/api/partner-area/posts/${id}/image`, { method: 'POST', headers: { Cookie: partnerCookie }, body: form })
    }
    const imageWhilePending = await newMessages(uploadImage)
    assert.equal(imageWhilePending.result.status, 201)
    assert.deepEqual(imageWhilePending.texts, [], 'liegt schon zur Prüfung')
    assert.equal((await post(`/api/admin/promotions/${id}/freigeben`, undefined, adminCookie)).status, 200)
    const imageAfterApproval = await newMessages(uploadImage)
    assert.equal(imageAfterApproval.result.status, 201)
    assert.equal(imageAfterApproval.texts.length, 1, 'ein neues Bild bringt den freigegebenen Beitrag wieder zur Prüfung')

    await put('/api/admin/notify-settings', { details: true }, adminCookie)
    const detailed = await newMessages(() => post('/api/partner-area/posts', { ...body, titel: 'Agility für Einsteiger' }, partnerCookie))
    assert.match(detailed.texts[0], /Partner: Hundeschule Pfotenweg\nTitel: Agility für Einsteiger$/)
    await put('/api/admin/notify-settings', { details: false }, adminCookie)
  })

  await t.test('ausgeschaltet: keine Nachricht', async () => {
    await put('/api/admin/notify-settings', { feedback: false }, adminCookie)
    const { result, texts } = await newMessages(() => post('/api/messages', { type: 'feedback', text: 'Noch einmal danke.' }, household.cookie))
    assert.equal(result.status, 201)
    assert.deepEqual(texts, [])
    await put('/api/admin/notify-settings', { feedback: true }, adminCookie)
  })

  await t.test('Demo: weder Feedback noch Beitrag noch Anfrage lösen etwas aus', async () => {
    const demo = await createFamily(base, 'Rudel Demo Hinweise', 'demo-hinweise-pw-1')
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demo.data.id)
    const feedback = await newMessages(() => post('/api/messages', { type: 'feedback', text: 'Hallo aus der Demo' }, demo.cookie))
    assert.equal(feedback.result.status, 403)
    assert.deepEqual(feedback.texts, [])
    const anfrage = await newMessages(() => post('/api/public/anfragen', { typ: 'gutschein', email: 'demo@example.org' }, demo.cookie))
    assert.equal(anfrage.result.status, 403)
    assert.deepEqual(anfrage.texts, [])

    const partnerArea = db.prepare("SELECT id, partner_id FROM families WHERE art = 'partner'").get()
    db.prepare('UPDATE partners SET is_demo = 1 WHERE id = ?').run(partnerArea.partner_id)
    const demoPartnerPost = await newMessages(() =>
      post('/api/partner-area/posts', { titel: 'Demo-Beitrag', bereich: 'hundeschule' }, partnerCookie)
    )
    assert.deepEqual(demoPartnerPost.texts, [], 'Beiträge eines Demo-Partners lösen nichts aus')
    db.prepare('UPDATE partners SET is_demo = 0 WHERE id = ?').run(partnerArea.partner_id)
  })

  await t.test('der Token steht nie in einer Antwort', async () => {
    const settings = await call(base, '/api/admin/notify-settings', { cookie: adminCookie })
    assert.equal(settings.data.eingerichtet, true)
    assert.equal(settings.data.quelle, 'umgebung')
    assert.ok(!JSON.stringify(settings.data).includes(FAKE_TOKEN))
    assert.ok(sent.every((message) => message.token === FAKE_TOKEN), 'verschickt wird mit dem Token aus der Umgebung')
  })
})
