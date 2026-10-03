const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, cleanup } = require('./helpers')

// Phase V4a: lib/partnerTermine.js mit festem "jetzt" (Berliner Ortszeit als { datum, zeit }) - Übersicht, Portal und
// "Nächster Termin" hängen nicht vom Tag ab, an dem der Test läuft. Die API-Tests (test/partnerTermine.test.js) rechnen
// relativ zu heute; hier stehen die genauen Zahlen und Grenzen. t.test() bleibt auf einer Ebene.
const dataDir = useTempDataDir('partner-termine-lib')

// Samstag, 03.10.2026, 12:00 Uhr in Berlin.
const NOW = { datum: '2026-10-03', zeit: '12:00' }

test('Partner-Termine mit festem Datum', async (t) => {
  const db = require('../db')
  t.after(() => cleanup(dataDir))
  const lib = require('../lib/partnerTermine')

  const partnerId = Number(db.prepare("INSERT INTO partners (slug, name, typ, status) VALUES ('fix-schule', 'Fix-Schule', 'hundeschule', 'aktiv')").run().lastInsertRowid)
  const partner = { id: partnerId, is_demo: 0 }
  const create = (input) => lib.insertTermin(partner, lib.validateTermin({ uhrzeit: '10:00', ...input }, { today: NOW.datum }))

  const weekly = create({ titel: 'Welpenspielstunde', datum: '2026-10-03', ende: '11:00', serie: 'woechentlich' })
  const single = create({ titel: 'Erste-Hilfe-Kurs', datum: '2026-10-19', uhrzeit: '18:00', serie: 'keine' })

  await t.test('Serie ohne Ende: genau ein Jahr, einschließlich desselben Tags im Folgejahr', () => {
    assert.equal(weekly.serie_bis, '2027-10-03')
    const list = lib.ownTerminList(partnerId, NOW)
    const own = list.vorkommen.filter((item) => item.terminId === weekly.id)
    // 03.10.2026 bis 02.10.2027 - 53 Samstage; die Übersicht reicht bis einschließlich 03.10.2027.
    assert.equal(own.length, 53)
    assert.deepEqual([own[0].datum, own.at(-1).datum], ['2026-10-03', '2027-10-02'])
    assert.equal(list.heute, '2026-10-03')
  })

  await t.test('validateTermin: Grenzen von Serien-Ende und Vorlauf', () => {
    const base = { titel: 'Kurs', datum: '2026-10-15', uhrzeit: '10:00', serie: 'monatlich_tag' }
    assert.equal(lib.validateTermin({ ...base, serieBis: '2027-10-15' }, { today: NOW.datum }).serie_bis, '2027-10-15')
    assert.throws(() => lib.validateTermin({ ...base, serieBis: '2027-10-16' }, { today: NOW.datum }), /höchstens ein Jahr/)
    assert.equal(lib.validateTermin({ ...base, datum: '2027-10-03', serie: 'keine' }, { today: NOW.datum }).datum, '2027-10-03')
    assert.throws(() => lib.validateTermin({ ...base, datum: '2027-10-04', serie: 'keine' }, { today: NOW.datum }), /ein Jahr im Voraus/)
    // Reiner Text: "z. B.", Uhrzeiten und Preise sind kein Link.
    assert.equal(lib.validateTermin({ ...base, text: 'z. B. Leine mitbringen, ca. 1,5 Std., 10.30 Uhr' }, { today: NOW.datum }).text, 'z. B. Leine mitbringen, ca. 1,5 Std., 10.30 Uhr')
    assert.throws(() => lib.validateTermin({ ...base, datum: '2026-10-02' }, { today: NOW.datum }), /Vergangenheit/)
  })

  await t.test('Portal: der Termin von heute 10–11 Uhr ist um 12 Uhr vorbei, um 10:30 läuft er noch', () => {
    assert.equal(lib.publicTermine(partnerId, NOW)[0].datum, '2026-10-10')
    assert.equal(lib.publicTermine(partnerId, { datum: '2026-10-03', zeit: '10:30' })[0].datum, '2026-10-03')
    assert.equal(lib.publicTermine(partnerId, NOW).length, 52 + 1)
  })

  await t.test('Portal: den Text trägt nur der erste stattfindende Tag eines Termins', () => {
    db.prepare("UPDATE partner_termine SET text = 'Für Welpen bis 16 Wochen.' WHERE id = ?").run(weekly.id)
    const own = lib.publicTermine(partnerId, NOW).filter((item) => item.terminId === weekly.id)
    assert.equal(own[0].text, 'Für Welpen bis 16 Wochen.')
    assert.ok(own.slice(1).every((item) => item.text === null))
  })

  await t.test('keine Obergrenze der Anzahl: ein einzelner Termin nach vier wöchentlichen Serien bleibt sichtbar', () => {
    const other = Number(db.prepare("INSERT INTO partners (slug, name, typ, status) VALUES ('voll-schule', 'Voll-Schule', 'hundeschule', 'aktiv')").run().lastInsertRowid)
    const full = { id: other, is_demo: 0 }
    for (const titel of ['A', 'B', 'C', 'D']) lib.insertTermin(full, lib.validateTermin({ titel, datum: '2026-10-05', uhrzeit: '09:00', serie: 'woechentlich' }, { today: NOW.datum }))
    lib.insertTermin(full, lib.validateTermin({ titel: 'Sommerfest', datum: '2027-09-20', uhrzeit: '14:00' }, { today: NOW.datum }))
    const list = lib.publicTermine(other, NOW)
    assert.ok(list.length > 200)
    assert.ok(list.some((item) => item.titel === 'Sommerfest' && item.datum === '2027-09-20'))
  })

  await t.test('Nächster Termin: abgesagte zählen nicht', () => {
    assert.deepEqual(lib.nextTermine([partnerId], NOW).get(partnerId), { datum: '2026-10-10', uhrzeit: '10:00', ende: '11:00', titel: 'Welpenspielstunde', ort: null })
    lib.addAbsage(weekly, '2026-10-10', NOW.datum)
    lib.addAbsage(weekly, '2026-10-17', NOW.datum)
    assert.equal(lib.nextTermine([partnerId], NOW).get(partnerId).titel, 'Erste-Hilfe-Kurs')
    const cancelled = lib.publicTermine(partnerId, NOW).filter((item) => item.abgesagt).map((item) => item.datum)
    assert.deepEqual(cancelled, ['2026-10-10', '2026-10-17'])
    assert.throws(() => lib.addAbsage(weekly, '2026-09-26', NOW.datum), /Vergangene|nicht statt/)
    assert.throws(() => lib.addAbsage(single, '2026-10-20', NOW.datum), /nicht statt/)
  })

  await t.test('abgelaufen: ein einzelner Termin von gestern - nicht aber einer weit voraus', () => {
    const list = lib.ownTerminList(partnerId, { datum: '2026-10-20', zeit: '08:00' })
    assert.equal(list.termine.find((item) => item.id === single.id).abgelaufen, true)
    assert.equal(list.termine.find((item) => item.id === weekly.id).abgelaufen, false)
    const later = create({ titel: 'Jahresfeier', datum: '2027-10-03', serie: 'keine' })
    const early = lib.ownTerminList(partnerId, NOW)
    assert.equal(early.termine.find((item) => item.id === later.id).abgelaufen, false)
    assert.ok(early.vorkommen.some((item) => item.terminId === later.id), 'auch der Termin genau ein Jahr voraus steht in der Übersicht')
  })
})
