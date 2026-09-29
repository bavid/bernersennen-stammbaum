const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily, createHousehold, getCookie } = require('./helpers')

// Phase R Task 2 (docs/superpowers/plans/2026-09-29-phase-r-familienverwaltung.md): Mitglieder verwalten
// (/api/family/members), Einladungen mit Rolle, Moderation von Kommentaren/Antworten, Leitung übergeben,
// Familie verlassen/auflösen, Familien-Schlüssel durch ein Leitungs-Mitglied. t.test() bleibt auf einer Ebene.
const dataDir = useTempDataDir('members', { LOGIN_RATE_LIMIT: '600', CODE_RATE_LIMIT: '300' })
const FORBIDDEN = 'Dafür fehlt dir die Berechtigung in dieser Familie.'
const REAUTH = 'Bitte bestätige mit deinem aktuellen Schlüssel bzw. Passwort.'
const MEMBERS = '/api/family/members'

test('Phase R Task 2: Mitglieder, Einladungen mit Rolle, Moderation, Übergabe, Auflösen', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const config = require('../config')
  const { deleteFamily } = require('../lib/families')

  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const del = (urlPath, cookie) => call(base, urlPath, { method: 'DELETE', cookie })
  const membershipRole = (homeId, groupId) =>
    db.prepare('SELECT rolle FROM family_members WHERE member_family_id = ? AND group_family_id = ?').get(homeId, groupId)?.rolle
  const countShares = (dogId) => db.prepare('SELECT COUNT(*) AS c FROM dog_shares WHERE dog_id = ?').get(dogId).c
  const assertForbidden = (res, label) => {
    assert.equal(res.status, 403, `${label}: ${JSON.stringify(res.data)}`)
    assert.equal(res.data.error, FORBIDDEN, label)
  }

  // Ein per Gutschein eingelöstes Zuhause (Schlüssel statt Passwort - der Login ist ein Hash-Lookup, kein
  // bcrypt-Vergleich gegen alle Alt-Familien; sonst würde dieser Test mit jeder weiteren Familie langsamer).
  async function newHome(label) {
    const home = await createHousehold(base, `Zuhause ${label}`)
    assert.equal(home.status, 201, JSON.stringify(home.data))
    return { id: home.data.id, homeCookie: home.cookie, key: home.key }
  }
  // Ein Zuhause gründet eine Familie (wird Leitung, Task 1) und wechselt hinein (cookie: aktiv in der Familie).
  // Das Familien-Passwort dient hier nur dem "gemeinsamen Schlüssel"-Login (homeId === familyId).
  async function newFamily(label, founder = null) {
    const home = founder || (await newHome(`${label} Gründer`))
    const password = `familie-pw-${label.toLowerCase().replace(/\W+/g, '-')}`
    const group = await post('/api/families/group', { name: `Familie ${label}`, password }, home.homeCookie)
    assert.equal(group.status, 201, JSON.stringify(group.data))
    const familyId = group.data.memberships.find((m) => m.name === `Familie ${label}`).id
    const view = await post('/api/view', { familyId }, home.homeCookie)
    assert.equal(view.status, 200)
    return { id: familyId, name: `Familie ${label}`, password, leitung: { ...home, cookie: getCookie(view.res) } }
  }
  // Ein neues Zuhause wird direkt in der DB Mitglied mit seiner Rolle (Beitreten per Passwort/Gutschein prüfen
  // roles.test.js und der Einladungs-Test unten) und wechselt hinein.
  async function join(family, rolle, label) {
    const home = await newHome(label)
    db.prepare('INSERT INTO family_members (member_family_id, group_family_id, rolle) VALUES (?, ?, ?)').run(home.id, family.id, rolle)
    const view = await post('/api/view', { familyId: family.id }, home.homeCookie)
    assert.equal(view.status, 200)
    return { ...home, cookie: getCookie(view.res) }
  }
  async function shareDog(member, family, name) {
    const dog = (await post('/api/dogs', { name, geschlecht: 'huendin' }, member.homeCookie)).data
    const shared = await put(`/api/dogs/${dog.id}/shares`, { familyIds: [family.id] }, member.homeCookie)
    assert.equal(shared.status, 200, JSON.stringify(shared.data))
    return dog
  }
  const familyEntry = async (family, cookie = family.leitung.cookie) => {
    const dog = (await post('/api/dogs', { name: 'Familienhund', geschlecht: 'ruede' }, cookie)).data
    const entry = (await post('/api/timeline', { dogId: dog.id, autorName: 'Leitung', datum: '2026-04-01', titel: 'Ausflug' }, cookie)).data
    return { dog, entry }
  }

  await t.test('außerhalb einer Familie: 400 "Nur in einer Familie möglich"', async () => {
    const home = await newHome('Allein')
    const res = await get(MEMBERS, home.homeCookie)
    assert.equal(res.status, 400)
    assert.equal(res.data.error, 'Nur in einer Familie möglich')
    assert.equal((await put(`${MEMBERS}/1`, { rolle: 'gast' }, home.homeCookie)).status, 400)
    assert.equal((await get(MEMBERS)).status, 401, 'ohne Login 401')
  })

  await t.test('GET: Liste mit Rolle, seit, geteilten Tieren und ichBin; Einladungen nur ab Stellvertretung, nie Codes', async () => {
    const family = await newFamily('Talblick')
    const deputy = await join(family, 'stellvertretung', 'Talblick Vertretung')
    const member = await join(family, 'mitglied', 'Talblick Mitglied')
    const guest = await join(family, 'gast', 'Talblick Gast')
    await shareDog(member, family, 'Wilma')

    const res = await get(MEMBERS, family.leitung.cookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.familyId, family.id)
    assert.equal(res.data.name, family.name)
    assert.equal(res.data.ichBin, 'leitung')
    assert.deepEqual(
      res.data.mitglieder.map((m) => [m.familyId, m.rolle, m.geteilteTiere]),
      [
        [family.leitung.id, 'leitung', 0],
        [deputy.id, 'stellvertretung', 0],
        [member.id, 'mitglied', 1],
        [guest.id, 'gast', 0]
      ]
    )
    assert.equal(res.data.mitglieder[2].name, 'Zuhause Talblick Mitglied')
    assert.match(res.data.mitglieder[0].seit, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    assert.deepEqual(res.data.einladungen, [], 'noch kein Kontingent aufgefüllt')

    // Kontingent auffüllen (GET /vouchers/mine), danach erscheinen die offenen Einladungen - ohne Codes
    const mine = await get('/api/vouchers/mine', family.leitung.cookie)
    assert.equal(mine.status, 200)
    const withInvites = await get(MEMBERS, family.leitung.cookie)
    assert.equal(withInvites.data.einladungen.length, config.voucherQuota)
    for (const invite of withInvites.data.einladungen) {
      assert.deepEqual(Object.keys(invite).sort(), ['ablauf', 'erstelltAm', 'hinweis', 'id', 'rolle'])
      assert.match(invite.hinweis, /^[0-9A-Z]{4}$/)
      assert.equal(invite.rolle, 'mitglied')
      assert.equal(invite.ablauf, null)
    }
    assert.ok(!JSON.stringify(withInvites.data).includes(mine.data[0].code), 'kein Klartext-Code in der Mitgliederliste')

    const asDeputy = await get(MEMBERS, deputy.cookie)
    assert.equal(asDeputy.data.ichBin, 'stellvertretung')
    assert.equal(asDeputy.data.einladungen.length, config.voucherQuota)
    const asMember = await get(MEMBERS, member.cookie)
    assert.equal(asMember.data.ichBin, 'mitglied')
    assert.equal(asMember.data.einladungen, undefined)
    assert.equal(asMember.data.mitglieder.length, 4)
    const asGuest = await get(MEMBERS, guest.cookie)
    assert.equal(asGuest.data.ichBin, 'gast')
    assert.equal(asGuest.data.einladungen, undefined)

    // Der gemeinsame Schlüssel der Familie zählt als Leitung, steht aber selbst nicht in der Liste
    const shared = await post('/api/login', { password: family.password })
    const asShared = await get(MEMBERS, getCookie(shared.res))
    assert.equal(asShared.data.ichBin, 'leitung')
    assert.equal(asShared.data.mitglieder.length, 4)
  })

  await t.test('membershipsOf liefert die Rolle je Mitgliedschaft (buildMe.memberships)', async () => {
    const family = await newFamily('Rollenliste')
    const guest = await join(family, 'gast', 'Rollenliste Gast')
    const me = await get('/api/me', guest.homeCookie)
    assert.equal(me.data.memberships.find((m) => m.id === family.id).rolle, 'gast')
    const lead = await get('/api/me', family.leitung.homeCookie)
    assert.equal(lead.data.memberships.find((m) => m.id === family.id).rolle, 'leitung')
  })

  await t.test('PUT /:homeId: nur die Leitung ändert Rollen; unbekannte Rolle 400, Nicht-Mitglied 404', async () => {
    const family = await newFamily('Rollen')
    const deputy = await join(family, 'stellvertretung', 'Rollen Vertretung')
    const member = await join(family, 'mitglied', 'Rollen Mitglied')
    const outsider = await newHome('Rollen Draußen')

    assertForbidden(await put(`${MEMBERS}/${member.id}`, { rolle: 'gast' }, deputy.cookie), 'Stellvertretung')
    assertForbidden(await put(`${MEMBERS}/${deputy.id}`, { rolle: 'gast' }, member.cookie), 'Mitglied')
    assert.equal(membershipRole(member.id, family.id), 'mitglied')

    const unknown = await put(`${MEMBERS}/${member.id}`, { rolle: 'chef' }, family.leitung.cookie)
    assert.equal(unknown.status, 400)
    assert.equal(unknown.data.error, 'Unbekannte Rolle')
    assert.equal((await put(`${MEMBERS}/${member.id}`, {}, family.leitung.cookie)).status, 400)
    assert.equal((await put(`${MEMBERS}/${outsider.id}`, { rolle: 'gast' }, family.leitung.cookie)).status, 404)
    assert.equal((await put(`${MEMBERS}/abc`, { rolle: 'gast' }, family.leitung.cookie)).status, 404)

    const changed = await put(`${MEMBERS}/${member.id}`, { rolle: 'gast' }, family.leitung.cookie)
    assert.equal(changed.status, 200)
    assert.equal(changed.data.mitglieder.find((m) => m.familyId === member.id).rolle, 'gast')
    assert.equal(membershipRole(member.id, family.id), 'gast')
    assert.equal((await get('/api/me', member.cookie)).data.role, 'gast', 'wirkt sofort auf die Sitzung')
  })

  await t.test('Letzte Leitung: kann sich nicht selbst herabstufen (409) - mit zweiter Leitung schon', async () => {
    const family = await newFamily('Einzig')
    const deputy = await join(family, 'stellvertretung', 'Einzig Vertretung')

    const self = await put(`${MEMBERS}/${family.leitung.id}`, { rolle: 'stellvertretung' }, family.leitung.cookie)
    assert.equal(self.status, 409)
    assert.equal(self.data.error, 'Es muss immer eine Leitung geben.')
    assert.equal(membershipRole(family.leitung.id, family.id), 'leitung')

    // Auch der gemeinsame Schlüssel darf die einzige Leitungs-Mitgliedschaft nicht herabstufen
    const shared = getCookie((await post('/api/login', { password: family.password })).res)
    assert.equal((await put(`${MEMBERS}/${family.leitung.id}`, { rolle: 'mitglied' }, shared)).status, 409)

    assert.equal((await put(`${MEMBERS}/${deputy.id}`, { rolle: 'leitung' }, family.leitung.cookie)).status, 200)
    const demoted = await put(`${MEMBERS}/${family.leitung.id}`, { rolle: 'mitglied' }, family.leitung.cookie)
    assert.equal(demoted.status, 200)
    assert.equal(membershipRole(family.leitung.id, family.id), 'mitglied')
    assert.equal(demoted.data.ichBin, 'mitglied')
    assertForbidden(await put(`${MEMBERS}/${deputy.id}`, { rolle: 'gast' }, family.leitung.cookie), 'ehemalige Leitung')
  })

  await t.test('DELETE /:homeId: Leitung entfernt ein Mitglied samt Freigaben, das Tier bleibt; nicht sich selbst', async () => {
    const family = await newFamily('Abgang')
    const deputy = await join(family, 'stellvertretung', 'Abgang Vertretung')
    const leaving = await join(family, 'mitglied', 'Abgang Mitglied')
    const dog = await shareDog(leaving, family, 'Pepper')
    assert.equal(countShares(dog.id), 1)

    assertForbidden(await del(`${MEMBERS}/${leaving.id}`, deputy.cookie), 'Stellvertretung')
    const self = await del(`${MEMBERS}/${family.leitung.id}`, family.leitung.cookie)
    assert.equal(self.status, 400)
    assert.equal(self.data.error, 'Dich selbst entfernst du über „Familie verlassen“.')
    assert.equal((await del(`${MEMBERS}/999999`, family.leitung.cookie)).status, 404)
    assert.equal((await del(`${MEMBERS}/abc`, family.leitung.cookie)).status, 404)

    const removed = await del(`${MEMBERS}/${leaving.id}`, family.leitung.cookie)
    assert.equal(removed.status, 204)
    assert.equal(membershipRole(leaving.id, family.id), undefined)
    assert.equal(countShares(dog.id), 0, 'Freigabe in die Familie ist weg')
    assert.equal(db.prepare('SELECT family_id FROM dogs WHERE id = ?').get(dog.id).family_id, leaving.id, 'das Tier bleibt im Zuhause')
    assert.equal((await del(`${MEMBERS}/${leaving.id}`, family.leitung.cookie)).status, 404, 'zweites Entfernen: 404')

    // Die Sitzung des Entfernten (aktiv in der Familie) fällt in sein Zuhause zurück
    const me = await get('/api/me', leaving.cookie)
    assert.equal(me.status, 200)
    assert.equal(me.data.id, leaving.id)
    assert.equal((await get(MEMBERS, leaving.cookie)).status, 400)
  })

  await t.test('POST /leitung/:homeId: Übergabe macht das Ziel zur Leitung und den Übergebenden zur Stellvertretung', async () => {
    const family = await newFamily('Staffel')
    const deputy = await join(family, 'stellvertretung', 'Staffel Vertretung')
    const member = await join(family, 'mitglied', 'Staffel Mitglied')

    assertForbidden(await post(`${MEMBERS}/leitung/${member.id}`, undefined, deputy.cookie), 'Stellvertretung übergibt')
    const self = await post(`${MEMBERS}/leitung/${family.leitung.id}`, undefined, family.leitung.cookie)
    assert.equal(self.status, 400)
    assert.equal(self.data.error, 'Du bist schon die Leitung.')
    assert.equal((await post(`${MEMBERS}/leitung/999999`, undefined, family.leitung.cookie)).status, 404)

    const handed = await post(`${MEMBERS}/leitung/${member.id}`, undefined, family.leitung.cookie)
    assert.equal(handed.status, 200)
    assert.equal(handed.data.ichBin, 'stellvertretung')
    assert.deepEqual(
      handed.data.mitglieder.map((m) => [m.familyId, m.rolle]),
      [
        [member.id, 'leitung'],
        [family.leitung.id, 'stellvertretung'],
        [deputy.id, 'stellvertretung']
      ]
    )
    assertForbidden(await put(`${MEMBERS}/${deputy.id}`, { rolle: 'gast' }, family.leitung.cookie), 'nach der Übergabe')
    assert.equal((await put(`${MEMBERS}/${deputy.id}`, { rolle: 'gast' }, member.cookie)).status, 200, 'die neue Leitung verwaltet')

    // Der gemeinsame Schlüssel übergibt nur - er hat keine eigene Mitgliedschaft zum Herabstufen
    const shared = getCookie((await post('/api/login', { password: family.password })).res)
    const back = await post(`${MEMBERS}/leitung/${family.leitung.id}`, undefined, shared)
    assert.equal(back.status, 200)
    assert.equal(membershipRole(family.leitung.id, family.id), 'leitung')
    assert.equal(membershipRole(member.id, family.id), 'leitung', 'das bisherige Ziel bleibt Leitung')
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM family_members WHERE group_family_id = ? AND rolle = 'leitung'").get(family.id).c, 2)
  })

  await t.test('Einladungen mit Rolle: /mine zeigt rolle, PUT /vouchers/:id/rolle je eigener Rolle, Einlösen übernimmt sie', async () => {
    const family = await newFamily('Einladung')
    const deputy = await join(family, 'stellvertretung', 'Einladung Vertretung')
    const member = await join(family, 'mitglied', 'Einladung Mitglied')
    const other = await newFamily('Einladung Fremd')

    const mine = (await get('/api/vouchers/mine', family.leitung.cookie)).data
    assert.equal(mine.length, config.voucherQuota)
    assert.ok(mine.every((v) => v.joins === true && v.rolle === 'mitglied'), 'Standardrolle mitglied')
    const [first, second, third] = mine
    const foreign = (await get('/api/vouchers/mine', other.leitung.cookie)).data[0]

    // Ein Zuhause hat Weitergabe-Gutscheine ohne join_family_id: dort gibt es keine Rolle (null) und PUT ist 404
    const homeVoucher = (await get('/api/vouchers/mine', member.homeCookie)).data[0]
    assert.equal(homeVoucher.rolle, null)
    assert.equal((await put(`/api/vouchers/${homeVoucher.id}/rolle`, { rolle: 'gast' }, member.homeCookie)).status, 404)

    assertForbidden(await put(`/api/vouchers/${first.id}/rolle`, { rolle: 'gast' }, member.cookie), 'Mitglied setzt Rolle')
    assertForbidden(await put(`/api/vouchers/${first.id}/rolle`, { rolle: 'leitung' }, deputy.cookie), 'Stellvertretung lädt Leitung ein')
    assertForbidden(await put(`/api/vouchers/${first.id}/rolle`, { rolle: 'stellvertretung' }, deputy.cookie), 'Stellvertretung lädt Stellvertretung ein')
    const unknown = await put(`/api/vouchers/${first.id}/rolle`, { rolle: 'chef' }, deputy.cookie)
    assert.equal(unknown.status, 400)
    assert.equal(unknown.data.error, 'Unbekannte Rolle')
    const asGuest = await put(`/api/vouchers/${first.id}/rolle`, { rolle: 'gast' }, deputy.cookie)
    assert.equal(asGuest.status, 200)
    assert.deepEqual(asGuest.data, { id: first.id, rolle: 'gast' })
    assert.equal((await put(`/api/vouchers/${second.id}/rolle`, { rolle: 'leitung' }, family.leitung.cookie)).status, 200)
    assert.equal((await put(`/api/vouchers/999999/rolle`, { rolle: 'gast' }, family.leitung.cookie)).status, 404)
    assert.equal((await put(`/api/vouchers/abc/rolle`, { rolle: 'gast' }, family.leitung.cookie)).status, 404)
    assert.equal((await put(`/api/vouchers/${foreign.id}/rolle`, { rolle: 'gast' }, family.leitung.cookie)).status, 404, 'fremde Einladung')
    assert.equal(db.prepare('SELECT join_rolle FROM vouchers WHERE id = ?').get(foreign.id).join_rolle, null)

    const listed = (await get('/api/vouchers/mine', family.leitung.cookie)).data
    assert.deepEqual(
      listed.map((v) => [v.id, v.rolle]),
      [
        [first.id, 'gast'],
        [second.id, 'leitung'],
        [third.id, 'mitglied']
      ]
    )
    const members = (await get(MEMBERS, deputy.cookie)).data
    assert.deepEqual(
      members.einladungen.map((v) => v.rolle).sort(),
      ['gast', 'leitung', 'mitglied']
    )

    // Einlösen: das neue Zuhause bekommt die Rolle der Einladung, ohne Angabe 'mitglied'
    const guestHome = await post('/api/vouchers/redeem', { code: first.code, name: 'Zuhause Gast per Gutschein' })
    assert.equal(guestHome.status, 201)
    assert.deepEqual(guestHome.data.memberships.map((m) => [m.id, m.rolle]), [[family.id, 'gast']])
    assert.equal(membershipRole(guestHome.data.id, family.id), 'gast')
    const leadHome = await post('/api/vouchers/redeem', { code: second.code, name: 'Zuhause Leitung per Gutschein' })
    assert.equal(leadHome.status, 201)
    assert.equal(membershipRole(leadHome.data.id, family.id), 'leitung')
    const plainHome = await post('/api/vouchers/redeem', { code: third.code, name: 'Zuhause Mitglied per Gutschein' })
    assert.equal(plainHome.status, 201)
    assert.equal(membershipRole(plainHome.data.id, family.id), 'mitglied')

    // Eingelöst = nicht mehr offen: die Rolle lässt sich nicht mehr ändern, die Einladung ist aus der Liste
    assert.equal((await put(`/api/vouchers/${first.id}/rolle`, { rolle: 'mitglied' }, family.leitung.cookie)).status, 404)
    assert.equal((await get(MEMBERS, family.leitung.cookie)).data.einladungen.length, 0)
  })

  await t.test('DELETE /einladungen/:voucherId: widerrufen ab Stellvertretung, fremde Einladungen 404', async () => {
    const family = await newFamily('Widerruf')
    const deputy = await join(family, 'stellvertretung', 'Widerruf Vertretung')
    const member = await join(family, 'mitglied', 'Widerruf Mitglied')
    const other = await newFamily('Widerruf Fremd')
    const mine = (await get('/api/vouchers/mine', family.leitung.cookie)).data
    const foreign = (await get('/api/vouchers/mine', other.leitung.cookie)).data[0]

    assertForbidden(await del(`${MEMBERS}/einladungen/${mine[0].id}`, member.cookie), 'Mitglied widerruft')
    assert.equal((await del(`${MEMBERS}/einladungen/${foreign.id}`, family.leitung.cookie)).status, 404)
    assert.equal((await del(`${MEMBERS}/einladungen/abc`, family.leitung.cookie)).status, 404)

    const revoked = await del(`${MEMBERS}/einladungen/${mine[0].id}`, deputy.cookie)
    assert.equal(revoked.status, 204)
    const row = db.prepare('SELECT revoked_at, code_cipher FROM vouchers WHERE id = ?').get(mine[0].id)
    assert.ok(row.revoked_at)
    assert.equal(row.code_cipher, null)
    assert.equal((await del(`${MEMBERS}/einladungen/${mine[0].id}`, deputy.cookie)).status, 404, 'zweiter Widerruf: 404')
    assert.equal((await get(MEMBERS, deputy.cookie)).data.einladungen.length, config.voucherQuota - 1)

    // Ein widerrufener Gutschein lässt sich nicht einlösen; das Kontingent füllt sich beim nächsten /mine wieder
    assert.equal((await post('/api/vouchers/redeem', { code: mine[0].code, name: 'Zuhause Zu Spät' })).status, 410)
    const refilled = (await get('/api/vouchers/mine', deputy.cookie)).data
    assert.equal(refilled.filter((v) => v.status === 'offen').length, config.voucherQuota)
    assert.equal(refilled.find((v) => v.id === mine[0].id).status, 'widerrufen')
  })

  await t.test('Kommentare in der Familie: eigene löscht jeder, fremde erst die Stellvertretung, Altbestand nur sie; vonMir', async () => {
    const family = await newFamily('Moderation')
    const deputy = await join(family, 'stellvertretung', 'Moderation Vertretung')
    const member = await join(family, 'mitglied', 'Moderation Mitglied')
    const guest = await join(family, 'gast', 'Moderation Gast')
    const { entry } = await familyEntry(family)
    const comment = (cookie, text) => post(`/api/timeline/${entry.id}/comments`, { autorName: 'Jemand', text }, cookie)
    const commentsOf = async (cookie) => (await get(`/api/timeline?dogId=${entry.dog_id}`, cookie)).data[0].comments

    const guestComment = await comment(guest.cookie, 'Vom Gast')
    assert.equal(guestComment.status, 201)
    assert.equal(guestComment.data.vonMir, true)
    assert.equal(guestComment.data.ehemalig, false)
    assert.equal(guestComment.data.author_family_id, undefined, 'die Haushalts-Id geht nie nach außen')
    assert.equal(db.prepare('SELECT author_family_id FROM entry_comments WHERE id = ?').get(guestComment.data.id).author_family_id, guest.id)
    const memberComment = (await comment(member.cookie, 'Vom Mitglied')).data

    const seenByGuest = await commentsOf(guest.cookie)
    assert.deepEqual(
      seenByGuest.map((c) => [c.text, c.vonMir, c.ehemalig]),
      [
        ['Vom Gast', true, false],
        ['Vom Mitglied', false, false]
      ]
    )
    assert.ok(seenByGuest.every((c) => c.author_family_id === undefined))

    assertForbidden(await del(`/api/timeline/${entry.id}/comments/${memberComment.id}`, guest.cookie), 'Gast löscht fremden Kommentar')
    assertForbidden(await del(`/api/timeline/${entry.id}/comments/${guestComment.data.id}`, member.cookie), 'Mitglied löscht fremden Kommentar')
    assert.equal((await del(`/api/timeline/${entry.id}/comments/${guestComment.data.id}`, guest.cookie)).status, 204, 'eigener Kommentar')
    assert.equal((await del(`/api/timeline/${entry.id}/comments/${memberComment.id}`, deputy.cookie)).status, 204, 'Stellvertretung moderiert')

    // Altbestand ohne author_family_id: nur ab Stellvertretung
    const legacyId = db
      .prepare("INSERT INTO entry_comments (entry_id, family_id, autor_name, text) VALUES (?, ?, 'Alt', 'Von früher')")
      .run(entry.id, family.id).lastInsertRowid
    assertForbidden(await del(`/api/timeline/${entry.id}/comments/${legacyId}`, member.cookie), 'Mitglied löscht Altbestand')
    assert.equal((await commentsOf(member.cookie))[0].vonMir, false)
    assert.equal((await del(`/api/timeline/${entry.id}/comments/${legacyId}`, family.leitung.cookie)).status, 204)

    // Außerhalb der Familie ändert sich nichts: im eigenen Zuhause löscht der Bereich jeden seiner Kommentare,
    // und der Eigentümer eines geteilten Tiers moderiert weiterhin die Kommentare der Familie auf seinen Einträgen
    const ownDog = await shareDog(member, family, 'Greta')
    const ownEntry = (await post('/api/timeline', { dogId: ownDog.id, autorName: 'Ich', datum: '2026-04-02', titel: 'Zuhause' }, member.homeCookie)).data
    const fromFamily = (await post(`/api/timeline/${ownEntry.id}/comments`, { autorName: 'Leitung', text: 'Schön!' }, family.leitung.cookie)).data
    const fromGuestAtHome = (await post(`/api/timeline/${ownEntry.id}/comments`, { autorName: 'Ich', text: 'Danke' }, member.homeCookie)).data
    const atHome = (await get(`/api/timeline?dogId=${ownDog.id}`, member.homeCookie)).data[0].comments
    assert.deepEqual(
      atHome.map((c) => [c.text, c.vonMir, c.ehemalig]),
      [
        ['Schön!', false, false],
        ['Danke', true, false]
      ]
    )
    assert.equal((await del(`/api/timeline/${ownEntry.id}/comments/${fromFamily.id}`, member.homeCookie)).status, 204, 'Eigentümer moderiert')
    assert.equal((await del(`/api/timeline/${ownEntry.id}/comments/${fromGuestAtHome.id}`, member.homeCookie)).status, 204)
  })

  await t.test('Pinnwand-Antworten in der Familie: dieselbe Moderationsregel wie bei Kommentaren', async () => {
    const family = await newFamily('Pinnwand')
    const deputy = await join(family, 'stellvertretung', 'Pinnwand Vertretung')
    const member = await join(family, 'mitglied', 'Pinnwand Mitglied')
    const guest = await join(family, 'gast', 'Pinnwand Gast')
    const note = (await post('/api/notes', { autorName: 'Leitung', text: 'Treffen?' }, family.leitung.cookie)).data
    const reply = (cookie, text) => post(`/api/notes/${note.id}/replies`, { autorName: 'Jemand', text }, cookie)

    const guestReply = await reply(guest.cookie, 'Bin dabei')
    assert.equal(guestReply.status, 201)
    assert.equal(guestReply.data.vonMir, true)
    assert.equal(guestReply.data.author_family_id, undefined)
    const memberReply = (await reply(member.cookie, 'Ich auch')).data

    const listed = (await get('/api/notes', guest.cookie)).data.find((n) => n.id === note.id).replies
    assert.deepEqual(
      listed.map((r) => [r.text, r.vonMir, r.ehemalig]),
      [
        ['Bin dabei', true, false],
        ['Ich auch', false, false]
      ]
    )

    assertForbidden(await del(`/api/notes/${note.id}/replies/${memberReply.id}`, guest.cookie), 'Gast löscht fremde Antwort')
    assert.equal((await del(`/api/notes/${note.id}/replies/${guestReply.data.id}`, guest.cookie)).status, 204)
    assert.equal((await del(`/api/notes/${note.id}/replies/${memberReply.id}`, deputy.cookie)).status, 204)

    const legacyId = db
      .prepare("INSERT INTO note_replies (note_id, family_id, autor_name, text) VALUES (?, ?, 'Alt', 'Von früher')")
      .run(note.id, family.id).lastInsertRowid
    assertForbidden(await del(`/api/notes/${note.id}/replies/${legacyId}`, member.cookie), 'Mitglied löscht Altbestand')
    assert.equal((await del(`/api/notes/${note.id}/replies/${legacyId}`, deputy.cookie)).status, 204)

    // Im eigenen Zuhause wie bisher
    const ownNote = (await post('/api/notes', { autorName: 'Ich', text: 'Einkauf' }, member.homeCookie)).data
    const homeReply = (await post(`/api/notes/${ownNote.id}/replies`, { autorName: 'Ich', text: 'Erledigt' }, member.homeCookie)).data
    assert.equal((await del(`/api/notes/${ownNote.id}/replies/${homeReply.id}`, member.homeCookie)).status, 204)
  })

  await t.test('Ehemaliges Mitglied: Kommentare und Antworten tragen ehemalig: true - nur in der Familienansicht', async () => {
    const family = await newFamily('Ehemalig')
    const former = await join(family, 'mitglied', 'Ehemalig Bald')
    const owner = await join(family, 'mitglied', 'Ehemalig Besitzer')
    const { entry } = await familyEntry(family)
    const note = (await post('/api/notes', { autorName: 'Leitung', text: 'Zettel' }, family.leitung.cookie)).data
    await post(`/api/timeline/${entry.id}/comments`, { autorName: 'Bald weg', text: 'Hallo' }, former.cookie)
    await post(`/api/timeline/${entry.id}/comments`, { autorName: 'Leitung', text: 'Hi' }, family.leitung.cookie)
    await post(`/api/notes/${note.id}/replies`, { autorName: 'Bald weg', text: 'Antwort' }, former.cookie)
    // Ein geteiltes Tier eines anderen Haushalts, auf dessen Eintrag das bald ehemalige Mitglied kommentiert
    const sharedDog = await shareDog(owner, family, 'Ida Zwei')
    const sharedEntry = (await post('/api/timeline', { dogId: sharedDog.id, autorName: 'B', datum: '2026-04-03', titel: 'Geteilt' }, owner.homeCookie)).data
    await post(`/api/timeline/${sharedEntry.id}/comments`, { autorName: 'Bald weg', text: 'Aus der Familie' }, former.cookie)

    const before = (await get(`/api/timeline?dogId=${entry.dog_id}`, family.leitung.cookie)).data[0].comments
    assert.deepEqual(before.map((c) => c.ehemalig), [false, false])

    assert.equal((await del(`${MEMBERS}/${former.id}`, family.leitung.cookie)).status, 204)

    const after = (await get(`/api/timeline?dogId=${entry.dog_id}`, family.leitung.cookie)).data[0].comments
    assert.deepEqual(
      after.map((c) => [c.autor_name, c.ehemalig, c.vonMir]),
      [
        ['Bald weg', true, false],
        ['Leitung', false, true]
      ],
      'der eingetippte Name bleibt, dazu das Flag'
    )
    const replies = (await get('/api/notes', family.leitung.cookie)).data.find((n) => n.id === note.id).replies
    assert.deepEqual(replies.map((r) => r.ehemalig), [true])

    // In der Familie: auch auf dem geteilten Eintrag ehemalig; im Zuhause des Besitzers dagegen nie
    const sharedInFamily = (await get(`/api/timeline?dogId=${sharedDog.id}`, family.leitung.cookie)).data[0].comments
    assert.deepEqual(sharedInFamily.map((c) => c.ehemalig), [true])
    const sharedAtHome = (await get(`/api/timeline?dogId=${sharedDog.id}`, owner.homeCookie)).data[0].comments
    assert.deepEqual(sharedAtHome.map((c) => [c.ehemalig, c.vonMir]), [[false, false]], 'außerhalb der Familie kein Flag')
  })

  await t.test('Tier der Familie löschen braucht die Stellvertretung, ändern bleibt beim Mitglied', async () => {
    const family = await newFamily('Tiere')
    const deputy = await join(family, 'stellvertretung', 'Tiere Vertretung')
    const member = await join(family, 'mitglied', 'Tiere Mitglied')
    const { dog } = await familyEntry(family)

    assert.equal((await put(`/api/dogs/${dog.id}`, { beschreibung: 'Lieb' }, member.cookie)).status, 200)
    assertForbidden(await del(`/api/dogs/${dog.id}`, member.cookie), 'Mitglied löscht Tier der Familie')
    assert.ok(db.prepare('SELECT 1 FROM dogs WHERE id = ?').get(dog.id))
    assert.equal((await del(`/api/dogs/${dog.id}`, deputy.cookie)).status, 204)
    assert.equal(db.prepare('SELECT 1 FROM dogs WHERE id = ?').get(dog.id), undefined)

    // Im eigenen Zuhause löscht man weiterhin selbst
    const ownDog = (await post('/api/dogs', { name: 'Eigen', geschlecht: 'ruede' }, member.homeCookie)).data
    assert.equal((await del(`/api/dogs/${ownDog.id}`, member.homeCookie)).status, 204)
  })

  await t.test('Verlassen: die letzte Leitung bekommt 409, nach der Übergabe darf sie gehen', async () => {
    const family = await newFamily('Verlassen')
    const member = await join(family, 'mitglied', 'Verlassen Mitglied')

    const blocked = await del(`/api/memberships/${family.id}`, family.leitung.homeCookie)
    assert.equal(blocked.status, 409)
    assert.equal(blocked.data.error, 'Übergib zuerst die Leitung oder löse die Familie auf.')
    assert.equal(membershipRole(family.leitung.id, family.id), 'leitung')

    assert.equal((await post(`${MEMBERS}/leitung/${member.id}`, undefined, family.leitung.cookie)).status, 200)
    const left = await del(`/api/memberships/${family.id}`, family.leitung.cookie)
    assert.equal(left.status, 200)
    assert.equal(left.data.id, family.leitung.id, 'zurück ins Zuhause')
    assert.equal(membershipRole(family.leitung.id, family.id), undefined)
    assert.equal(membershipRole(member.id, family.id), 'leitung')

    // Die neue, nun einzige Leitung sitzt ebenfalls fest
    assert.equal((await del(`/api/memberships/${family.id}`, member.homeCookie)).status, 409)
  })

  await t.test('Wird der Leitungs-Haushalt gelöscht, rückt sofort das älteste verbleibende Mitglied nach', async () => {
    const family = await newFamily('Nachrücken')
    const older = await join(family, 'mitglied', 'Nachrücken Älter')
    const younger = await join(family, 'gast', 'Nachrücken Jünger')
    db.prepare("UPDATE family_members SET created_at = '2026-01-01 10:00:00' WHERE member_family_id = ? AND group_family_id = ?").run(older.id, family.id)
    db.prepare("UPDATE family_members SET created_at = '2026-02-01 10:00:00' WHERE member_family_id = ? AND group_family_id = ?").run(younger.id, family.id)

    deleteFamily(db, family.leitung.id)

    assert.equal(membershipRole(older.id, family.id), 'leitung')
    assert.equal(membershipRole(younger.id, family.id), 'gast', 'bleibt unverändert')
    assert.equal((await get(MEMBERS, older.cookie)).data.ichBin, 'leitung')
  })

  await t.test('Auflösen: mit eigenen Tieren 409, falsche Bestätigung 400, nur die Leitung; ohne Tiere räumt alles weg', async () => {
    const family = await newFamily('Auflösen')
    const deputy = await join(family, 'stellvertretung', 'Auflösen Vertretung')
    const member = await join(family, 'mitglied', 'Auflösen Mitglied')
    const { dog } = await familyEntry(family)

    const withAnimals = await post(`${MEMBERS}/aufloesen`, { bestaetigung: family.name }, family.leitung.cookie)
    assert.equal(withAnimals.status, 409)
    assert.equal(withAnimals.data.error, 'Die Familie hat eigene Tiere – bitte vorher in eine Chronik übernehmen.')
    assert.equal((await del(`/api/dogs/${dog.id}`, family.leitung.cookie)).status, 204)

    assertForbidden(await post(`${MEMBERS}/aufloesen`, { bestaetigung: family.name }, deputy.cookie), 'Stellvertretung löst auf')
    const wrong = await post(`${MEMBERS}/aufloesen`, { bestaetigung: 'Familie Auflosen' }, family.leitung.cookie)
    assert.equal(wrong.status, 400)
    assert.equal(wrong.data.error, 'Bitte bestätige mit dem genauen Namen der Familie.')
    assert.equal((await post(`${MEMBERS}/aufloesen`, {}, family.leitung.cookie)).status, 400)
    assert.equal((await post(`${MEMBERS}/aufloesen`, { bestaetigung: ` ${family.name}` }, family.leitung.cookie)).status, 400, 'exakt, ohne Trimmen')
    assert.ok(db.prepare('SELECT 1 FROM families WHERE id = ?').get(family.id), 'noch da')

    // Geteiltes Tier, Zettel mit Antwort, offene Einladungen (eigene und eine vom Admin für diese Familie)
    const sharedDog = await shareDog(member, family, 'Motte')
    const note = (await post('/api/notes', { autorName: 'Leitung', text: 'Bald vorbei' }, family.leitung.cookie)).data
    await post(`/api/notes/${note.id}/replies`, { autorName: 'M', text: 'Schade' }, member.cookie)
    await get('/api/vouchers/mine', family.leitung.cookie)
    const { createBatch } = require('../lib/vouchers')
    const { batchId: adminBatchId } = createBatch(db, { label: 'Admin-Einladung', kind: 'admin', size: 1, joinFamilyId: family.id })
    const adminVoucherId = db.prepare('SELECT id FROM vouchers WHERE batch_id = ?').get(adminBatchId).id
    assert.equal((await get(MEMBERS, family.leitung.cookie)).data.einladungen.length, config.voucherQuota + 1)

    const dissolved = await post(`${MEMBERS}/aufloesen`, { bestaetigung: family.name }, family.leitung.cookie)
    assert.equal(dissolved.status, 200, JSON.stringify(dissolved.data))
    assert.equal(dissolved.data.id, family.leitung.id, 'Antwort ist das eigene Zuhause')
    assert.equal(dissolved.data.home.id, family.leitung.id)
    assert.deepEqual(dissolved.data.memberships, [])
    assert.ok(getCookie(dissolved.res), 'neues Cookie für das Zuhause')

    assert.equal(db.prepare('SELECT 1 FROM families WHERE id = ?').get(family.id), undefined)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM family_members WHERE group_family_id = ?').get(family.id).c, 0)
    assert.equal(countShares(sharedDog.id), 0)
    assert.equal(db.prepare('SELECT family_id FROM dogs WHERE id = ?').get(sharedDog.id).family_id, member.id, 'das geteilte Tier bleibt beim Mitglied')
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM notes WHERE family_id = ?').get(family.id).c, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM note_replies WHERE family_id = ?').get(family.id).c, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM vouchers WHERE join_family_id = ?').get(family.id).c, 0, 'keine Einladung zeigt mehr auf die Familie')
    const adminVoucher = db.prepare('SELECT revoked_at, join_family_id FROM vouchers WHERE id = ?').get(adminVoucherId)
    assert.ok(adminVoucher.revoked_at, 'die Admin-Einladung ist widerrufen, nicht zu einem gewöhnlichen Gutschein geworden')
    assert.equal(adminVoucher.join_family_id, null)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM voucher_batches WHERE label = ?').get(`Weitergabe ${family.name}`).c, 0, 'leerer Stapel weg')

    // Alle Sitzungen der bisherigen Mitglieder fallen in ihr Zuhause zurück
    for (const [label, cookie] of [['Leitung', family.leitung.cookie], ['Stellvertretung', deputy.cookie], ['Mitglied', member.cookie]]) {
      const me = await get('/api/me', cookie)
      assert.equal(me.status, 200, label)
      assert.equal(me.data.art, 'zuhause', label)
      assert.deepEqual(me.data.memberships, [], label)
    }
  })

  await t.test('Auflösen mit dem gemeinsamen Schlüssel: die Identität selbst verschwindet, die Sitzung endet (204)', async () => {
    const legacy = await createFamily(base, 'Familie Altbestand', 'altbestand-pw-1')
    const res = await post(`${MEMBERS}/aufloesen`, { bestaetigung: 'Familie Altbestand' }, legacy.cookie)
    assert.equal(res.status, 204)
    assert.match(res.headers.get('set-cookie') || '', /session=;/, 'Cookie wird gelöscht')
    assert.equal(db.prepare('SELECT 1 FROM families WHERE id = ?').get(legacy.data.id), undefined)
    assert.equal((await get('/api/me', legacy.cookie)).status, 401)
  })

  await t.test('Familien-Schlüssel durch ein Leitungs-Mitglied: eigener Nachweis nötig, Stellvertretung 403, alte Familien-Sitzungen enden', async () => {
    const family = await newFamily('Schlüssel')
    const founder = family.leitung
    const deputy = await join(family, 'stellvertretung', 'Schlüssel Vertretung')
    const sharedBefore = getCookie((await post('/api/login', { password: family.password })).res)
    assert.equal((await get('/api/me', sharedBefore)).status, 200)

    assertForbidden(await post(`${MEMBERS}/key`, { currentKey: founder.key }, deputy.cookie), 'Stellvertretung')
    const noProof = await post(`${MEMBERS}/key`, {}, family.leitung.cookie)
    assert.equal(noProof.status, 403)
    assert.equal(noProof.data.error, REAUTH)
    assert.equal((await post(`${MEMBERS}/key`, { currentKey: 'AAAA-BBBB-CCCC' }, family.leitung.cookie)).status, 403)
    assert.equal((await post(`${MEMBERS}/key`, { currentPassword: 'egal' }, family.leitung.cookie)).status, 403, 'Schlüssel-Sitzung: nur currentKey zählt')

    const renewed = await post(`${MEMBERS}/key`, { currentKey: founder.key }, family.leitung.cookie)
    assert.equal(renewed.status, 200, JSON.stringify(renewed.data))
    assert.match(renewed.data.key, /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/)
    assert.equal(renewed.headers.get('set-cookie'), null, 'die eigene Sitzung hängt am Zuhause und bleibt')

    assert.equal((await get('/api/me', sharedBefore)).status, 401, 'die alte Familien-Sitzung ist raus')
    assert.equal((await get('/api/me', family.leitung.cookie)).status, 200)
    const withNewKey = await post('/api/login', { secret: renewed.data.key })
    assert.equal(withNewKey.status, 200)
    assert.equal(withNewKey.data.id, family.id)
    assert.equal(withNewKey.data.role, 'leitung')

    // Mit dem gemeinsamen Schlüssel angemeldet: dafür gibt es POST /family/key (eigener Bereich)
    const asShared = await post(`${MEMBERS}/key`, { currentKey: renewed.data.key }, getCookie(withNewKey.res))
    assert.equal(asShared.status, 400)

    // Alt-Zuhause mit Passwort statt Schlüssel: der Nachweis ist currentPassword
    const legacyHome = await createFamily(base, 'Zuhause Altschlüssel', 'altschluessel-pw-1', { art: 'zuhause' })
    const legacyFamily = await newFamily('Altschlüssel', { id: legacyHome.data.id, homeCookie: legacyHome.cookie })
    assert.equal((await post(`${MEMBERS}/key`, { currentKey: 'AAAA-BBBB-CCCC' }, legacyFamily.leitung.cookie)).status, 403)
    const legacyRenewed = await post(`${MEMBERS}/key`, { currentPassword: 'altschluessel-pw-1' }, legacyFamily.leitung.cookie)
    assert.equal(legacyRenewed.status, 200)
    assert.equal((await post('/api/login', { secret: legacyRenewed.data.key })).data.id, legacyFamily.id)
  })
})
