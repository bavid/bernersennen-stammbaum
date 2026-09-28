const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

// Viele Login/Gutschein-Aufrufe in einer Session: Standard-Limits (20 / 15 min) grosszügiger setzen.
// Die eigentliche codeLimiter-Prüfung hat ein eigenes kleines Limit in test/codeLimiter.test.js.
const dataDir = useTempDataDir('vouchers', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

test('Gutscheine einlösen, Login per Schlüssel, Sitzungs-Epoche', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { createBatch } = require('../lib/vouchers')
  const { hashCode, encryptCode, normalizeCode, formatCode } = require('../lib/codes')

  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const redeem = (body) => post('/api/vouchers/redeem', body)
  const check = (code) => post('/api/vouchers/check', { code })
  const login = (body) => post('/api/login', body)

  function oneCode(kind = 'admin', extra = {}) {
    const { codes } = createBatch(db, { label: 'Testcharge', kind, size: 1, ...extra })
    return codes[0]
  }

  await t.test('1. Einlösen legt "Meine Chronik" an, key/fromOthers in der Antwort', async () => {
    const code = oneCode()
    const res = await redeem({ code, name: 'Zuhause am Deich' })
    assert.equal(res.status, 201)
    assert.equal(res.data.art, 'zuhause')
    assert.equal(res.data.home.id, res.data.id)
    assert.equal(res.data.key, formatCode(normalizeCode(code)))
    assert.equal(res.data.fromOthers, true)
    assert.deepEqual(res.data.memberships, [])

    const cookie = getCookie(res.res)
    const me = await call(base, '/api/me', { cookie })
    assert.equal(me.status, 200)
    assert.equal(me.data.art, 'zuhause')
    assert.equal(me.data.name, 'Zuhause am Deich')
  })

  await t.test('2. zweites Einlösen desselben Codes -> 410 "schon eingelöst"', async () => {
    const code = oneCode()
    const first = await redeem({ code, name: 'Zuhause am Deich' })
    assert.equal(first.status, 201)

    const second = await redeem({ code, name: 'Nochmal' })
    assert.equal(second.status, 410)
    assert.match(second.data.error, /schon eingelöst/)
  })

  await t.test('3. gleichzeitiges Einlösen: genau eine 201, die andere 410', async () => {
    const code = oneCode()
    const [a, b] = await Promise.all([
      redeem({ code, name: 'Zuhause A' }),
      redeem({ code, name: 'Zuhause B' })
    ])
    const statuses = [a.status, b.status].sort()
    assert.deepEqual(statuses, [201, 410])
  })

  await t.test('4. /vouchers/check: offen, eingelöst, abgelaufen, widerrufen, unbekannt', async () => {
    const openCode = oneCode()
    const openStatus = await check(openCode)
    assert.equal(openStatus.status, 200)
    assert.equal(openStatus.data.status, 'offen')

    const redeemedCode = oneCode()
    await redeem({ code: redeemedCode, name: 'Zuhause Redeemed' })
    const redeemedStatus = await check(redeemedCode)
    assert.equal(redeemedStatus.data.status, 'eingelöst')

    const expiredCode = oneCode()
    db.prepare('UPDATE vouchers SET expires_at = ? WHERE code_hash = ?').run('2000-01-01 00:00:00', hashCode(normalizeCode(expiredCode)))
    const expiredStatus = await check(expiredCode)
    assert.equal(expiredStatus.data.status, 'abgelaufen')

    const revokedCode = oneCode()
    db.prepare("UPDATE vouchers SET revoked_at = datetime('now') WHERE code_hash = ?").run(hashCode(normalizeCode(revokedCode)))
    const revokedStatus = await check(revokedCode)
    assert.equal(revokedStatus.data.status, 'widerrufen')

    const unknown = await check('ZZZZ-ZZZZ-ZZZZ')
    assert.equal(unknown.data.status, 'unbekannt')

    const badFormat = await check('zu-kurz')
    assert.equal(badFormat.data.status, 'unbekannt')
  })

  await t.test('5. Einlösen: abgelaufen, zurückgezogen, unbekannt', async () => {
    const expiredCode = oneCode()
    db.prepare('UPDATE vouchers SET expires_at = ? WHERE code_hash = ?').run('2000-01-01 00:00:00', hashCode(normalizeCode(expiredCode)))
    const expiredRes = await redeem({ code: expiredCode, name: 'Zuhause X' })
    assert.equal(expiredRes.status, 410)
    assert.match(expiredRes.data.error, /abgelaufen/)

    const revokedCode = oneCode()
    db.prepare("UPDATE vouchers SET revoked_at = datetime('now') WHERE code_hash = ?").run(hashCode(normalizeCode(revokedCode)))
    const revokedRes = await redeem({ code: revokedCode, name: 'Zuhause Y' })
    assert.equal(revokedRes.status, 410)
    assert.match(revokedRes.data.error, /zurückgezogen/)

    const unknownRes = await redeem({ code: 'ZZZZ-ZZZZ-ZZZZ', name: 'Zuhause Z' })
    assert.equal(unknownRes.status, 404)
  })

  await t.test('6. Login mit dem Schlüssel in verschiedenen Schreibweisen', async () => {
    const code = oneCode()
    const redeemed = await redeem({ code, name: 'Zuhause Schreibweisen' })
    assert.equal(redeemed.status, 201)
    const normalized = normalizeCode(code)

    const lowerSpaced = formatCode(normalized).toLowerCase().replace(/-/g, ' ')
    const viaLower = await login({ secret: lowerSpaced })
    assert.equal(viaLower.status, 200)
    assert.equal(viaLower.data.id, redeemed.data.id)

    // Eigene, bekannte Codes mit '0' bzw. '1' drin - um O->0 und I/L->1 gezielt zu testen
    // (generateCode würfelt zufällig, ohne Garantie auf eine bestimmte Ziffer)
    const insertFixedVoucher = (fixedCode) => {
      const batch = db.prepare("INSERT INTO voucher_batches (label, kind, size) VALUES ('Fest', 'admin', 1)").run()
      db.prepare("INSERT INTO vouchers (batch_id, code_hash, code_cipher, code_hint) VALUES (?, ?, ?, ?)").run(
        batch.lastInsertRowid,
        hashCode(fixedCode),
        encryptCode(fixedCode),
        fixedCode.slice(-4)
      )
    }

    const ohCode = 'ABCDEFGH0234'
    insertFixedVoucher(ohCode)
    const ohRedeem = await redeem({ code: ohCode, name: 'Zuhause Oh' })
    assert.equal(ohRedeem.status, 201)
    const viaOh = await login({ secret: 'ABCD-EFGH-O234' }) // O statt 0
    assert.equal(viaOh.status, 200)
    assert.equal(viaOh.data.id, ohRedeem.data.id)

    const ilCode = 'ABCDEFGH1213'
    insertFixedVoucher(ilCode)
    const ilRedeem = await redeem({ code: ilCode, name: 'Zuhause Il' })
    assert.equal(ilRedeem.status, 201)
    const viaIl = await login({ secret: 'ABCD-EFGH-I2L3' }) // I/L statt 1
    assert.equal(viaIl.status, 200)
    assert.equal(viaIl.data.id, ilRedeem.data.id)
  })

  await t.test('7. Login mit einem noch offenen Gutschein -> 409 { redeem: true }', async () => {
    const code = oneCode()
    const res = await login({ secret: code })
    assert.equal(res.status, 409)
    assert.equal(res.data.redeem, true)
  })

  await t.test('8. Einladungs-Gutschein aus Rudel R macht das Zuhause beim Einlösen zum Mitglied', async () => {
    const rudel = await createFamily(base, 'Familie Sonnenhang', 'rudel-pw-8')
    const code = oneCode('rudel', { issuedByFamilyId: rudel.data.id, joinFamilyId: rudel.data.id })

    const res = await redeem({ code, name: 'Zuhause Beitritt' })
    assert.equal(res.status, 201)
    assert.equal(res.data.memberships.length, 1)
    assert.equal(res.data.memberships[0].id, rudel.data.id)
  })

  await t.test('9. Gutschein mit join_family_id einer Demo-Familie -> keine Mitgliedschaft', async () => {
    const demoRudel = await createFamily(base, 'Familie Demo Acht', 'demo-pw-9')
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demoRudel.data.id)
    const code = oneCode('rudel', { joinFamilyId: demoRudel.data.id })

    const res = await redeem({ code, name: 'Zuhause Ohne Beitritt' })
    assert.equal(res.status, 201)
    assert.deepEqual(res.data.memberships, [])
  })

  await t.test('10. Honeypot beim Einlösen -> 400', async () => {
    const code = oneCode()
    const res = await redeem({ code, name: 'Bot-Zuhause', website: 'http://spam.example' })
    assert.equal(res.status, 400)
  })

  await t.test('11. alte Rudel-Passwörter funktionieren weiter, "!" passt auf keine Familie', async () => {
    const rudel = await createFamily(base, 'Familie Altbestand', 'altes-pw-11')
    const viaPassword = await login({ password: 'altes-pw-11' })
    assert.equal(viaPassword.status, 200)
    assert.equal(viaPassword.data.id, rudel.data.id)

    const viaSecretAlias = await login({ secret: 'altes-pw-11' })
    assert.equal(viaSecretAlias.status, 200)

    const viaBang = await login({ secret: '!' })
    assert.equal(viaBang.status, 401)
  })

  await t.test('12. Benutzername/Passwort beim Einlösen: Validierung', async () => {
    const onlyUsername = await redeem({ code: oneCode(), name: 'Zuhause A', username: 'nele' })
    assert.equal(onlyUsername.status, 400)

    const onlyPassword = await redeem({ code: oneCode(), name: 'Zuhause B', password: 'geheim123' })
    assert.equal(onlyPassword.status, 400)

    const shortUsername = await redeem({ code: oneCode(), name: 'Zuhause C', username: 'ab', password: 'geheim123' })
    assert.equal(shortUsername.status, 400)

    const badChars = await redeem({ code: oneCode(), name: 'Zuhause D', username: 'ne le!', password: 'geheim123' })
    assert.equal(badChars.status, 400)

    const shortPassword = await redeem({ code: oneCode(), name: 'Zuhause E', username: 'nele-e', password: 'kurz' })
    assert.equal(shortPassword.status, 400)

    const badEmail = await redeem({
      code: oneCode(),
      name: 'Zuhause F',
      username: 'nele-f',
      password: 'geheim123',
      email: 'keine-email'
    })
    assert.equal(badEmail.status, 400)

    const okCode = oneCode()
    const ok = await redeem({ code: okCode, name: 'Zuhause G', username: 'nele-g', password: 'geheim123', email: 'nele@example.com' })
    assert.equal(ok.status, 201)
    const user = db.prepare('SELECT username, email, family_id FROM users WHERE username = ?').get('nele-g')
    assert.equal(user.family_id, ok.data.id)
    assert.equal(user.email, 'nele@example.com')

    const taken = await redeem({ code: oneCode(), name: 'Zuhause H', username: 'NELE-G', password: 'anderespw1' })
    assert.equal(taken.status, 409)
    assert.match(taken.data.error, /vergeben/)
  })

  await t.test('13. Name des Zuhauses ist Pflicht', async () => {
    const missing = await redeem({ code: oneCode() })
    assert.equal(missing.status, 400)

    const tooLong = await redeem({ code: oneCode(), name: 'X'.repeat(81) })
    assert.equal(tooLong.status, 400)
  })

  await t.test('14. Sitzungs-Epoche: auth_epoch direkt erhöht -> altes Cookie 401', async () => {
    const code = oneCode()
    const redeemed = await redeem({ code, name: 'Zuhause Epoche' })
    const cookie = getCookie(redeemed.res)

    const before = await call(base, '/api/me', { cookie })
    assert.equal(before.status, 200)

    db.prepare('UPDATE families SET auth_epoch = auth_epoch + 1 WHERE id = ?').run(redeemed.data.id)

    const after = await call(base, '/api/me', { cookie })
    assert.equal(after.status, 401)
    assert.match(after.data.error, /Sitzung abgelaufen/)
  })
})
