const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

// Die Demo zeigt „Ein Start für alles“ (Phase W, Schritt 3): auf Start von „Zuhause am Deich“ Erinnerungen aus dem eigenen
// Zuhause, der Demo-Familie und dem besuchten Möwenweg (Socke ist nicht in die Familie geteilt), Zettel und Termine der
// Familie - und die Fotos daraus laden im eigenen Zuhause.
const dataDir = useTempDataDir('demo-start', { APP_ENV: 'staging' })

test('Demo: Start mischt Zuhause, Familie und befreundetes Zuhause', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { uploadDir } = require('../config')
  const { replaceDemoPack } = require('../lib/demoPack')
  const { relativeDemoDate } = require('../lib/demoDates')

  replaceDemoPack(db, uploadDir)
  const login = await call(base, '/api/demo', { method: 'POST' })
  const demoCookie = getCookie(login.res)
  const res = await call(base, '/api/start', { cookie: demoCookie })

  await t.test('Erinnerungen aus allen drei Bereichen, Socke als Besuch von vorgestern', () => {
    assert.equal(res.status, 200)
    const arts = new Set(res.data.items.map((item) => item.area.art))
    assert.deepEqual([...arts].sort(), ['besuch', 'eigen', 'familie'])
    const socke = res.data.items.find((item) => item.titel === 'Socke erobert den Kratzbaum')
    assert.equal(socke.area.name, 'Zuhause Möwenweg (Demo)')
    assert.equal(socke.area.art, 'besuch')
    assert.equal(socke.datum, relativeDemoDate({ days: -2 }))
    assert.ok(res.data.items.some((item) => item.type === 'zettel' && item.area.art === 'familie'))
    assert.ok(res.data.termine.length >= 1)
  })

  await t.test('Wilma (Möwenweg, in die Familie geteilt) steht mit ihrem Zuhause da, nicht mit der Familie', () => {
    const wilma = res.data.items.find((item) => item.titel === 'Wilma im ersten Schnee')
    assert.equal(wilma.area.art, 'familie', 'sichtbar über die Familie (Zuhause > Familie > Besuch)')
    assert.equal(wilma.dog.zuhause, 'Zuhause Möwenweg (Demo)')
    const socke = res.data.items.find((item) => item.titel === 'Socke erobert den Kratzbaum')
    assert.equal(socke.dog.zuhause, 'Zuhause Möwenweg (Demo)')
    const own = res.data.items.filter((item) => item.type === 'eintrag' && item.area.art === 'eigen')
    assert.ok(own.length > 0)
    assert.ok(own.every((item) => item.dog.zuhause === null), 'eigene Tiere ohne Herkunft')
  })

  await t.test('Fotos der Familie laden im eigenen Zuhause', async () => {
    const familyPhoto = res.data.items.find((item) => item.area.art === 'familie' && item.foto_urls.length > 0).foto_urls[0]
    const photo = await fetch(`${base}${familyPhoto}`, { headers: { Cookie: demoCookie } })
    assert.equal(photo.status, 200)
  })
})
