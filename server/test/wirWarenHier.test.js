const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { useTempDataDir } = require('./helpers')

const dataDir = useTempDataDir('wirwarenhier')
const db = require('../db')
const wwh = require('../lib/wirWarenHier')

test.after(() => {
  db.close()
  fs.rmSync(dataDir, { recursive: true, force: true })
})

let counter = 0
function addFamily(art = 'zuhause', isDemo = 0) {
  counter += 1
  return Number(
    db.prepare('INSERT INTO families (name, password_hash, art, is_demo) VALUES (?, ?, ?, ?)').run(`Zuhause ${counter}`, 'x', art, isDemo).lastInsertRowid
  )
}
function addDog(familyId, name = 'Wilma') {
  return Number(db.prepare("INSERT INTO dogs (family_id, name, geschlecht) VALUES (?, ?, 'huendin')").run(familyId, name).lastInsertRowid)
}
function addPartner({ status = 'aktiv', gesperrt = 0, isDemo = 0 } = {}) {
  counter += 1
  return Number(
    db
      .prepare("INSERT INTO partners (slug, name, typ, status, gesperrt, is_demo) VALUES (?, ?, 'hundeschule', ?, ?, ?)")
      .run(`ort-${counter}`, `Hundeschule ${counter}`, status, gesperrt, isDemo).lastInsertRowid
  )
}
const rejectsWith = (fn, status) => assert.throws(fn, (err) => err.status === status)

test('Tabellen entstehen idempotent beim require', () => {
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'wwh_%' ORDER BY name").all().map((r) => r.name)
  assert.deepEqual(names, ['wwh_checkins', 'wwh_kontakt', 'wwh_pins', 'wwh_rueckzug_log'])
  delete require.cache[require.resolve('../lib/wirWarenHier')]
  assert.doesNotThrow(() => require('../lib/wirWarenHier'))
})

test('Anmeldung: eigenes Tier, sichtbarer Partner, Status offen, Zeige-mich aus', () => {
  const home = addFamily()
  const dog = addDog(home)
  const partner = addPartner()
  const created = wwh.createCheckin(home, { partnerId: partner, dogId: dog })
  assert.equal(created.status, 'offen')
  assert.equal(created.zeigeMich, false)
  const list = wwh.checkinsOfHome(home)
  assert.equal(list.length, 1)
  assert.equal(list[0].tierName, 'Wilma')
  assert.equal(list[0].zeigeMich, false)
})

test('Anmeldung: doppelt 409, fremdes oder unbekanntes Tier 404, kein Zuhause 400', () => {
  const home = addFamily()
  const other = addFamily()
  const dog = addDog(home)
  const foreignDog = addDog(other)
  const partner = addPartner()
  wwh.createCheckin(home, { partnerId: partner, dogId: dog })
  rejectsWith(() => wwh.createCheckin(home, { partnerId: partner, dogId: dog }), 409)
  rejectsWith(() => wwh.createCheckin(home, { partnerId: partner, dogId: foreignDog }), 404)
  rejectsWith(() => wwh.createCheckin(home, { partnerId: partner, dogId: 999999 }), 404)
  rejectsWith(() => wwh.createCheckin(home, { partnerId: partner, dogId: '1' }), 404)
  const rudel = addFamily('rudel')
  rejectsWith(() => wwh.createCheckin(rudel, { partnerId: partner, dogId: addDog(rudel) }), 400)
})

test('Anmeldung: unsichtbarer Partner (Entwurf, gesperrt, unbekannt) und Demo-Grenze liefern 404', () => {
  const home = addFamily()
  const demoHome = addFamily('zuhause', 1)
  const dog = addDog(home)
  const demoDog = addDog(demoHome)
  rejectsWith(() => wwh.createCheckin(home, { partnerId: addPartner({ status: 'entwurf' }), dogId: dog }), 404)
  rejectsWith(() => wwh.createCheckin(home, { partnerId: addPartner({ gesperrt: 1 }), dogId: dog }), 404)
  rejectsWith(() => wwh.createCheckin(home, { partnerId: 999999, dogId: dog }), 404)
  rejectsWith(() => wwh.createCheckin(home, { partnerId: addPartner({ isDemo: 1 }), dogId: dog }), 404)
  rejectsWith(() => wwh.createCheckin(demoHome, { partnerId: addPartner(), dogId: demoDog }), 404)
  assert.equal(wwh.createCheckin(demoHome, { partnerId: addPartner({ isDemo: 1 }), dogId: demoDog }).status, 'offen')
})

test('Obergrenze: höchstens 20 Anmeldungen je Zuhause', () => {
  const home = addFamily()
  const dog = addDog(home)
  for (let i = 0; i < wwh.MAX_CHECKINS_PER_HOME; i += 1) wwh.createCheckin(home, { partnerId: addPartner(), dogId: dog })
  rejectsWith(() => wwh.createCheckin(home, { partnerId: addPartner(), dogId: dog }), 409)
})

test('zeigeMich: nur Boolean, nur eigene Anmeldung; aus lehnt offene Wünsche ab', () => {
  const home = addFamily()
  const other = addFamily()
  const dog = addDog(home)
  const otherDog = addDog(other)
  const partner = addPartner()
  const { id } = wwh.createCheckin(home, { partnerId: partner, dogId: dog })
  rejectsWith(() => wwh.setZeigeMich(home, id, 'ja'), 400)
  rejectsWith(() => wwh.setZeigeMich(home, id, 1), 400)
  rejectsWith(() => wwh.setZeigeMich(other, id, true), 404)
  assert.equal(wwh.setZeigeMich(home, id, true).zeigeMich, true)
  assert.equal(wwh.checkinsOfHome(home)[0].zeigeMich, true)
  const wish = db
    .prepare('INSERT INTO wwh_kontakt (partner_id, von_family_id, von_dog_id, an_family_id, an_dog_id) VALUES (?, ?, ?, ?, ?)')
    .run(partner, other, otherDog, home, dog).lastInsertRowid
  wwh.setZeigeMich(home, id, false)
  assert.equal(db.prepare('SELECT status FROM wwh_kontakt WHERE id = ?').get(wish).status, 'abgelehnt')
})

test('Rückzug: löscht Anmeldung, Anheftungen und offene Wünsche; fremde Anmeldung 404', () => {
  const home = addFamily()
  const other = addFamily()
  const dog = addDog(home)
  const otherDog = addDog(other)
  const partner = addPartner()
  const { id } = wwh.createCheckin(home, { partnerId: partner, dogId: dog })
  const entry = Number(
    db
      .prepare("INSERT INTO timeline_entries (dog_id, family_id, autor_name, datum, titel) VALUES (?, ?, 'A', '2026-05-01', 'Strand')")
      .run(dog, home).lastInsertRowid
  )
  db.prepare('INSERT INTO wwh_pins (checkin_id, entry_id) VALUES (?, ?)').run(id, entry)
  db.prepare('INSERT INTO wwh_kontakt (partner_id, von_family_id, von_dog_id, an_family_id, an_dog_id) VALUES (?, ?, ?, ?, ?)').run(
    partner,
    other,
    otherDog,
    home,
    dog
  )
  rejectsWith(() => wwh.withdrawCheckin(other, id), 404)
  wwh.withdrawCheckin(home, id)
  assert.equal(wwh.checkinsOfHome(home).length, 0)
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM wwh_pins WHERE checkin_id = ?').get(id).c, 0)
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM wwh_kontakt WHERE an_dog_id = ?').get(dog).c, 0)
  rejectsWith(() => wwh.withdrawCheckin(home, id), 404)
})

test('Ausgeblendete Orte (gesperrt/pausiert) fehlen in der Liste', () => {
  const home = addFamily()
  const dog = addDog(home)
  const partner = addPartner()
  wwh.createCheckin(home, { partnerId: partner, dogId: dog })
  db.prepare("UPDATE partners SET status = 'pausiert' WHERE id = ?").run(partner)
  assert.equal(wwh.checkinsOfHome(home).length, 0)
})

test('Löschen von Tier oder Familie räumt per CASCADE auf', () => {
  const home = addFamily()
  const dog = addDog(home)
  const { id } = wwh.createCheckin(home, { partnerId: addPartner(), dogId: dog })
  db.prepare('DELETE FROM dogs WHERE id = ?').run(dog)
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM wwh_checkins WHERE id = ?').get(id).c, 0)
})

test('removeDemoWirWarenHier: nur Demo-Zeilen und die der früheren Partner, echte bleiben', () => {
  const home = addFamily()
  const demoHome = addFamily('zuhause', 1)
  const real = wwh.createCheckin(home, { partnerId: addPartner(), dogId: addDog(home) })
  const demoPartner = addPartner({ isDemo: 1 })
  wwh.createCheckin(demoHome, { partnerId: demoPartner, dogId: addDog(demoHome) })
  wwh.removeDemoWirWarenHier([])
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM wwh_checkins WHERE is_demo = 1').get().c, 0)
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM wwh_checkins WHERE id = ?').get(real.id).c, 1)
  const oldPartner = addPartner()
  wwh.createCheckin(home, { partnerId: oldPartner, dogId: addDog(home) })
  wwh.removeDemoWirWarenHier([oldPartner])
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM wwh_checkins WHERE partner_id = ?').get(oldPartner).c, 0)
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM wwh_checkins WHERE id = ?').get(real.id).c, 1)
})
