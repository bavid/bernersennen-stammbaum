const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const testDbPath = path.join(__dirname, 'dogs.test.tmp.db')
process.env.DB_PATH = testDbPath
process.env.JWT_SECRET = 'test-secret'

const express = require('express')
const cookieParser = require('cookie-parser')
const authRoutes = require('../routes/auth')
const dogsRoutes = require('../routes/dogs')
const db = require('../db')

test.after(() => {
  db.close()
  for (const suffix of ['', '-wal', '-shm']) {
    const file = testDbPath + suffix
    if (fs.existsSync(file)) fs.unlinkSync(file)
  }
})

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use('/api', authRoutes)
  app.use('/api/dogs', dogsRoutes)
  return app
}

function getCookie(res) {
  return (res.headers.get('set-cookie') || '').split(';')[0]
}

async function createFamily(base, name, password) {
  const res = await fetch(`${base}/api/families`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, password })
  })
  return getCookie(res)
}

test('dogs API pedigree linking and family isolation', async (t) => {
  const app = buildApp()
  const server = app.listen(0)
  const base = `http://localhost:${server.address().port}`

  const cookieA = await createFamily(base, 'Familie A', 'passwortA')
  const cookieB = await createFamily(base, 'Familie B', 'passwortB')

  let motherId
  await t.test('creates a dog with a freitext father', async () => {
    const res = await fetch(`${base}/api/dogs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({
        name: 'Bella',
        geschlecht: 'huendin',
        fatherFreitext: 'Rex vom Waldrand'
      })
    })
    assert.equal(res.status, 201)
    const dog = await res.json()
    motherId = dog.id
    assert.equal(dog.father_freitext, 'Rex vom Waldrand')
  })

  await t.test('creates a dog with a linked mother', async () => {
    const res = await fetch(`${base}/api/dogs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({
        name: 'Hermes',
        geschlecht: 'ruede',
        motherDogId: motherId
      })
    })
    assert.equal(res.status, 201)
    const dog = await res.json()
    assert.equal(dog.mother_dog_id, motherId)
  })

  await t.test('rejects both dogId and freitext set for the same parent', async () => {
    const res = await fetch(`${base}/api/dogs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({
        name: 'Ungueltig',
        geschlecht: 'ruede',
        motherDogId: motherId,
        motherFreitext: 'Andere Mutter'
      })
    })
    assert.equal(res.status, 400)
  })

  await t.test('family B cannot edit family A\'s dog', async () => {
    const res = await fetch(`${base}/api/dogs/${motherId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookieB },
      body: JSON.stringify({ name: 'Uebernommen' })
    })
    assert.equal(res.status, 403)
  })

  server.close()
})
