const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const Database = require('better-sqlite3')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

// Phase R Task 1 (docs/superpowers/plans/2026-09-29-phase-r-familienverwaltung.md): Rollen in Familien
// (family_members.rolle), lib/roles.js und die Rollenprüfung an allen Schreibwegen einer Familie.
// t.test() bleibt auf einer Ebene.
const dataDir = useTempDataDir('roles', { LOGIN_RATE_LIMIT: '400', CODE_RATE_LIMIT: '200' })
const SERVER_DIR = path.join(__dirname, '..')
const FORBIDDEN = 'Dafür fehlt dir die Berechtigung in dieser Familie.'

// --- Migration ------------------------------------------------------------------------------------

// family_members VOR Phase R (ohne rolle), dazu die nötigsten families-Spalten - den Rest ergänzt db.js.
const OLD_SCHEMA_SQL = `
  CREATE TABLE families (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    art TEXT NOT NULL DEFAULT 'rudel'
  );
  CREATE TABLE family_members (
    member_family_id INTEGER NOT NULL REFERENCES families(id),
    group_family_id INTEGER NOT NULL REFERENCES families(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (member_family_id, group_family_id)
  );
`

function seedOldDatabase(dbFile) {
  const seedDb = new Database(dbFile)
  seedDb.exec(OLD_SCHEMA_SQL)
  const insertFamily = seedDb.prepare("INSERT INTO families (id, name, password_hash, art) VALUES (?, ?, '!', ?)")
  insertFamily.run(1, 'Familie Talblick', 'rudel')
  insertFamily.run(2, 'Zuhause Birke', 'zuhause')
  insertFamily.run(3, 'Zuhause Linde', 'zuhause')
  insertFamily.run(4, 'Zuhause Ahorn', 'zuhause')
  insertFamily.run(5, 'Familie Seeufer', 'rudel')
  insertFamily.run(6, 'Familie Leerlauf', 'rudel')
  const insertMember = seedDb.prepare('INSERT INTO family_members (member_family_id, group_family_id, created_at) VALUES (?, ?, ?)')
  // Talblick: Birke ist am längsten dabei, auch wenn sie nicht als Erste eingefügt wurde
  insertMember.run(3, 1, '2026-01-02 10:00:00')
  insertMember.run(2, 1, '2026-01-01 09:00:00')
  insertMember.run(4, 1, '2026-01-03 08:00:00')
  // Seeufer: Gleichstand beim Beitritt -> die kleinste member_family_id (Linde, 3) wird Leitung
  insertMember.run(4, 5, '2026-02-01 12:00:00')
  insertMember.run(3, 5, '2026-02-01 12:00:00')
  seedDb.close()
}

// db.js in einem eigenen Prozess laden (wie test/partnerSchema.test.js), damit die Migration auf der alten
// Datei läuft.
function runMigration(dir, dbFile) {
  const script = "const db = require('./db'); db.close()"
  execFileSync(process.execPath, ['-e', script], {
    cwd: SERVER_DIR,
    env: { ...process.env, DATA_DIR: dir, DB_PATH: dbFile, JWT_SECRET: 'test-secret' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
}

function readMembers(dbFile) {
  const checkDb = new Database(dbFile, { readonly: true })
  const rows = checkDb
    .prepare('SELECT member_family_id, group_family_id, created_at, rolle FROM family_members ORDER BY group_family_id, member_family_id')
    .all()
  checkDb.close()
  return rows
}

test('Migration: rolle kommt dazu, das älteste Mitglied jeder Familie wird Leitung, ein zweiter Start ändert nichts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-roles-migration-'))
  const dbFile = path.join(dir, 'old.db')
  try {
    seedOldDatabase(dbFile)
    runMigration(dir, dbFile)

    const checkDb = new Database(dbFile, { readonly: true })
    const column = checkDb.prepare('PRAGMA table_info(family_members)').all().find((c) => c.name === 'rolle')
    checkDb.close()
    assert.ok(column, 'Spalte rolle existiert')
    assert.equal(column.notnull, 1)
    assert.equal(column.dflt_value, "'mitglied'")

    const roles = readMembers(dbFile).map((row) => [row.group_family_id, row.member_family_id, row.rolle])
    assert.deepEqual(roles, [
      [1, 2, 'leitung'],
      [1, 3, 'mitglied'],
      [1, 4, 'mitglied'],
      [5, 3, 'leitung'],
      [5, 4, 'mitglied']
    ])

    // Zweiter Start: nichts ändert sich
    const afterFirst = readMembers(dbFile)
    runMigration(dir, dbFile)
    assert.deepEqual(readMembers(dbFile), afterFirst)

    // Eine Familie, die schon eine Leitung hat, bleibt unangetastet - auch wenn die Leitung nicht das
    // älteste Mitglied ist
    const editDb = new Database(dbFile)
    editDb.prepare("UPDATE family_members SET rolle = 'mitglied' WHERE group_family_id = 1 AND member_family_id = 2").run()
    editDb.prepare("UPDATE family_members SET rolle = 'leitung' WHERE group_family_id = 1 AND member_family_id = 4").run()
    editDb.close()
    const handedOver = readMembers(dbFile)
    runMigration(dir, dbFile)
    assert.deepEqual(readMembers(dbFile), handedOver)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// --- lib/roles.js und die Rollenprüfung an den Endpunkten ---------------------------------------

test('Rollen in Familien: Leitung, Stellvertretung, Mitglied, Gast', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { ROLES, rank, roleOf } = require('../lib/roles')

  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const del = (urlPath, cookie) => call(base, urlPath, { method: 'DELETE', cookie })
  const membershipRole = (homeId, groupId) =>
    db.prepare('SELECT rolle FROM family_members WHERE member_family_id = ? AND group_family_id = ?').get(homeId, groupId)?.rolle

  async function upload(cookie) {
    const form = new FormData()
    form.append('file', new Blob(['PNG'], { type: 'image/png' }), 'foto.png')
    const res = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Cookie: cookie }, body: form })
    return { status: res.status, data: await res.json() }
  }

  // Die Familie selbst, angemeldet mit ihrem gemeinsamen Schlüssel (homeId === familyId)
  const RUDEL_PW = 'rollen-rudel-pw-1'
  const rudel = await createFamily(base, 'Familie Rollenberg', RUDEL_PW)
  const rudelId = rudel.data.id
  const familyDog = (await post('/api/dogs', { name: 'Frieda', geschlecht: 'huendin' }, rudel.cookie)).data
  const familyEntry = (
    await post('/api/timeline', { dogId: familyDog.id, autorName: 'Leitung', datum: '2026-03-01', titel: 'Erster Ausflug' }, rudel.cookie)
  ).data
  const familyNote = (await post('/api/notes', { autorName: 'Leitung', text: 'Treffen am Samstag' }, rudel.cookie)).data
  const entryOnFamilyDog = (titel, datum) => ({ dogId: familyDog.id, autorName: 'Test', datum, titel })

  let counter = 0
  const setRole = (homeId, rolle) =>
    db.prepare('UPDATE family_members SET rolle = ? WHERE member_family_id = ? AND group_family_id = ?').run(rolle, homeId, rudelId)

  // Ein Zuhause tritt der Familie bei, bekommt direkt in der DB seine Rolle (die API dafür folgt in Task 2)
  // und wechselt hinein. homeCookie: aktiver Bereich ist das eigene Zuhause; cookie: aktiv in der Familie.
  async function joinAs(rolle) {
    counter += 1
    const home = await createFamily(base, `Zuhause Rolle ${counter}`, `rollen-zuhause-pw-${counter}`, { art: 'zuhause' })
    const join = await post('/api/families/join', { password: RUDEL_PW }, home.cookie)
    assert.equal(join.status, 200)
    setRole(home.data.id, rolle)
    const view = await post('/api/view', { familyId: rudelId }, home.cookie)
    assert.equal(view.status, 200)
    return { homeId: home.data.id, homeCookie: home.cookie, cookie: getCookie(view.res), view: view.data }
  }

  const assertForbidden = (res, label) => {
    assert.equal(res.status, 403, `${label}: ${JSON.stringify(res.data)}`)
    assert.equal(res.data.error, FORBIDDEN, label)
  }

  await t.test('ROLES, rank und roleOf', async () => {
    assert.deepEqual(ROLES, ['gast', 'mitglied', 'stellvertretung', 'leitung'])
    assert.ok(rank('gast') < rank('mitglied'))
    assert.ok(rank('mitglied') < rank('stellvertretung'))
    assert.ok(rank('stellvertretung') < rank('leitung'))
    assert.equal(rank(null), -1)
    assert.equal(rank('chef'), -1)

    assert.equal(roleOf(rudelId, rudelId), 'leitung', 'gemeinsamer Schlüssel')
    const member = await joinAs('stellvertretung')
    assert.equal(roleOf(member.homeId, rudelId), 'stellvertretung')
    assert.equal(roleOf(member.homeId, member.homeId), 'leitung', 'eigener Bereich')
    const outsider = await createFamily(base, 'Zuhause Draußen', 'rollen-draussen-pw-1', { art: 'zuhause' })
    assert.equal(roleOf(outsider.data.id, rudelId), null, 'kein Mitglied')
  })

  await t.test('Gründen: die gründende Identität wird Leitung', async () => {
    const home = await createFamily(base, 'Zuhause Gründer', 'rollen-gruender-pw-1', { art: 'zuhause' })
    const group = await post('/api/families/group', { name: 'Familie Neugrund', password: 'rollen-neugrund-pw-1' }, home.cookie)
    assert.equal(group.status, 201)
    const created = group.data.memberships.find((m) => m.name === 'Familie Neugrund')
    assert.ok(created)
    assert.equal(membershipRole(home.data.id, created.id), 'leitung')

    const view = await post('/api/view', { familyId: created.id }, home.cookie)
    assert.equal(view.data.role, 'leitung')
  })

  await t.test('Beitreten per Passwort: Standardrolle mitglied', async () => {
    const home = await createFamily(base, 'Zuhause Beitritt', 'rollen-beitritt-pw-1', { art: 'zuhause' })
    await post('/api/families/join', { password: RUDEL_PW }, home.cookie)
    assert.equal(membershipRole(home.data.id, rudelId), 'mitglied')
  })

  await t.test('Gast: darf ansehen und kommentieren, sonst nichts schreiben', async () => {
    const guest = await joinAs('gast')
    assert.equal(guest.view.role, 'gast')
    assert.equal((await get('/api/me', guest.cookie)).data.role, 'gast')

    // ansehen
    assert.equal((await get('/api/dogs', guest.cookie)).status, 200)
    assert.equal((await get('/api/timeline', guest.cookie)).status, 200)
    // kommentieren und auf der Pinnwand antworten
    const comment = await post(`/api/timeline/${familyEntry.id}/comments`, { autorName: 'Gast', text: 'Schön!' }, guest.cookie)
    assert.equal(comment.status, 201)
    const reply = await post(`/api/notes/${familyNote.id}/replies`, { autorName: 'Gast', text: 'Bin dabei' }, guest.cookie)
    assert.equal(reply.status, 201)

    assertForbidden(await post('/api/timeline', entryOnFamilyDog('Nein', '2026-03-02'), guest.cookie), 'Eintrag anlegen')
    assertForbidden(await put(`/api/timeline/${familyEntry.id}`, entryOnFamilyDog('Nein', '2026-03-02'), guest.cookie), 'Eintrag ändern')
    assertForbidden(await del(`/api/timeline/${familyEntry.id}`, guest.cookie), 'Eintrag löschen')
    assertForbidden(await put(`/api/dogs/${familyDog.id}`, { name: 'Frieda II' }, guest.cookie), 'Tier der Familie ändern')
    assertForbidden(await post('/api/dogs', { name: 'Oskar', geschlecht: 'ruede' }, guest.cookie), 'Tier anlegen')
    assertForbidden(await del(`/api/dogs/${familyDog.id}`, guest.cookie), 'Tier löschen')
    assertForbidden(await post('/api/notes', { autorName: 'Gast', text: 'Zettel' }, guest.cookie), 'Pinnwand-Zettel')
    assertForbidden(await post('/api/breeding', { mutterDogId: familyDog.id, datum: '2026-03-03' }, guest.cookie), 'Wurf')
    assertForbidden(await upload(guest.cookie), 'Foto hochladen')

    // eigenes Tier aus "Meine Chronik" in die Familie teilen
    const ownDog = (await post('/api/dogs', { name: 'Greta', geschlecht: 'huendin' }, guest.homeCookie)).data
    assertForbidden(await put(`/api/dogs/${ownDog.id}/shares`, { familyIds: [rudelId] }, guest.homeCookie), 'Teilen')
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM dog_shares WHERE dog_id = ?').get(ownDog.id).c, 0)

    // Nichts wurde verändert
    assert.equal(db.prepare('SELECT name FROM dogs WHERE id = ?').get(familyDog.id).name, 'Frieda')
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM dogs WHERE family_id = ?').get(rudelId).c, 1)
  })

  await t.test('Mitglied: darf schreiben, pflegen und teilen, aber nicht einladen und nicht verwalten', async () => {
    const member = await joinAs('mitglied')
    assert.equal(member.view.role, 'mitglied')

    assert.equal((await post('/api/timeline', entryOnFamilyDog('Spaziergang', '2026-03-04'), member.cookie)).status, 201)
    const edited = await put(`/api/dogs/${familyDog.id}`, { beschreibung: 'Liebt den See' }, member.cookie)
    assert.equal(edited.status, 200)
    const newDog = await post('/api/dogs', { name: 'Oskar', geschlecht: 'ruede' }, member.cookie)
    assert.equal(newDog.status, 201)
    assert.equal(newDog.data.family_id, rudelId)
    assert.equal((await post('/api/notes', { autorName: 'Mitglied', text: 'Futter kaufen' }, member.cookie)).status, 201)
    assert.equal((await post('/api/breeding', { mutterDogId: familyDog.id, datum: '2026-03-05' }, member.cookie)).status, 201)
    assert.equal((await upload(member.cookie)).status, 201)

    const ownDog = (await post('/api/dogs', { name: 'Paul', geschlecht: 'ruede' }, member.homeCookie)).data
    const share = await put(`/api/dogs/${ownDog.id}/shares`, { familyIds: [rudelId] }, member.homeCookie)
    assert.equal(share.status, 200)
    assert.deepEqual(share.data.shares, [rudelId])

    assertForbidden(await get('/api/vouchers/mine', member.cookie), 'einladen')
    const issued = db.prepare('SELECT COUNT(*) AS c FROM vouchers WHERE issued_by_family_id = ?').get(rudelId).c
    assert.equal(issued, 0, 'kein Kontingent aufgefüllt')
    assertForbidden(await put('/api/family', { name: 'Umbenannt' }, member.cookie), 'PUT /family')
    assertForbidden(await post('/api/family/key', { currentKey: 'egal' }, member.cookie), 'POST /family/key')
    assertForbidden(await get('/api/users', member.cookie), 'GET /users')
    assert.equal(db.prepare('SELECT name FROM families WHERE id = ?').get(rudelId).name, 'Familie Rollenberg')
  })

  await t.test('Teilen: neue Freigabe braucht Mitglied, bestehende darf bleiben, Entfernen geht immer', async () => {
    const member = await joinAs('mitglied')
    const ownDog = (await post('/api/dogs', { name: 'Ida', geschlecht: 'huendin' }, member.homeCookie)).data
    assert.equal((await put(`/api/dogs/${ownDog.id}/shares`, { familyIds: [rudelId] }, member.homeCookie)).status, 200)

    setRole(member.homeId, 'gast')
    const keep = await put(`/api/dogs/${ownDog.id}/shares`, { familyIds: [rudelId] }, member.homeCookie)
    assert.equal(keep.status, 200)
    assert.deepEqual(keep.data.shares, [rudelId])
    const remove = await put(`/api/dogs/${ownDog.id}/shares`, { familyIds: [] }, member.homeCookie)
    assert.equal(remove.status, 200)
    assert.deepEqual(remove.data.shares, [])
    assertForbidden(await put(`/api/dogs/${ownDog.id}/shares`, { familyIds: [rudelId] }, member.homeCookie), 'erneut teilen als Gast')
  })

  await t.test('Stellvertretung: darf einladen, aber Name, Schlüssel und Benutzer nicht', async () => {
    const deputy = await joinAs('stellvertretung')
    assert.equal(deputy.view.role, 'stellvertretung')

    const mine = await get('/api/vouchers/mine', deputy.cookie)
    assert.equal(mine.status, 200)
    assert.ok(mine.data.length > 0)
    assert.ok(mine.data.every((voucher) => voucher.joins === true && voucher.code))

    assertForbidden(await put('/api/family', { theme: 'berner' }, deputy.cookie), 'PUT /family')
    assertForbidden(await post('/api/family/key', { currentKey: 'egal' }, deputy.cookie), 'POST /family/key')
    assertForbidden(await get('/api/users', deputy.cookie), 'GET /users')
    assertForbidden(await post('/api/users', { username: 'vertretung', password: 'geheim-12345' }, deputy.cookie), 'POST /users')
    assertForbidden(await del('/api/users/1', deputy.cookie), 'DELETE /users/:id')
  })

  await t.test('Leitung per Mitgliedschaft: darf schreiben, einladen und den Namen ändern (ein altes theme wird ignoriert)', async () => {
    const lead = await joinAs('leitung')
    assert.equal(lead.view.role, 'leitung')

    assert.equal((await post('/api/timeline', entryOnFamilyDog('Tierarzt', '2026-03-06'), lead.cookie)).status, 201)
    assert.equal((await get('/api/vouchers/mine', lead.cookie)).status, 200)
    const renamed = await put('/api/family', { name: 'Familie Rollenberg Neu', theme: 'berner' }, lead.cookie)
    assert.equal(renamed.status, 200)
    assert.equal(renamed.data.name, 'Familie Rollenberg Neu')
    assert.equal((await get('/api/users', lead.cookie)).status, 200)
    // Die Rollenprüfung lässt durch; den Schlüssel erneuert man aber weiterhin nur im eigenen Bereich
    const key = await post('/api/family/key', { currentKey: 'egal' }, lead.cookie)
    assert.equal(key.status, 400)
    assert.equal(key.data.error, 'Nur im eigenen Bereich möglich')
    await put('/api/family', { name: 'Familie Rollenberg' }, lead.cookie)
  })

  await t.test('Gemeinsamer Schlüssel (homeId === familyId) zählt als Leitung', async () => {
    const me = await get('/api/me', rudel.cookie)
    assert.equal(me.data.role, 'leitung')
    assert.equal((await put('/api/family', { theme: 'standard' }, rudel.cookie)).status, 200)
    assert.equal((await get('/api/vouchers/mine', rudel.cookie)).status, 200)
    assert.equal((await get('/api/users', rudel.cookie)).status, 200)
    const key = await post('/api/family/key', { currentPassword: RUDEL_PW }, rudel.cookie)
    assert.equal(key.status, 200)
    assert.match(key.data.key, /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/)
    assert.ok(getCookie(key.res), 'neues Cookie für die eigene Sitzung')
  })

  await t.test('buildMe.role: eigener Bereich (Zuhause, Tierheim, Partner) ist immer Leitung', async () => {
    for (const art of ['zuhause', 'tierheim', 'partner']) {
      const area = await createFamily(base, `Bereich ${art}`, `rollen-bereich-${art}-pw`, { art })
      assert.equal(area.data.role, 'leitung', `Login ${art}`)
      assert.equal((await get('/api/me', area.cookie)).data.role, 'leitung', `/me ${art}`)
    }
  })

  await t.test('Unbekannte Rolle in der DB zählt als keine Berechtigung (fail closed)', async () => {
    const odd = await joinAs('chef')
    assert.equal(odd.view.role, null)
    assertForbidden(await post('/api/timeline', entryOnFamilyDog('X', '2026-03-07'), odd.cookie), 'Eintrag')
    assertForbidden(await post(`/api/timeline/${familyEntry.id}/comments`, { autorName: 'X', text: 'X' }, odd.cookie), 'Kommentar')
  })
})
