const express = require('express')
const bcrypt = require('bcryptjs')
const db = require('../db')
const { signSession, requireAuth } = require('../middleware/auth')

const router = express.Router()

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000
}

router.post('/families', (req, res) => {
  const { name, password } = req.body || {}
  if (!name?.trim() || !password?.trim()) {
    return res.status(400).json({ error: 'Familienname und Passwort sind erforderlich' })
  }

  const passwordHash = bcrypt.hashSync(password, 10)
  const result = db
    .prepare('INSERT INTO families (name, password_hash) VALUES (?, ?)')
    .run(name.trim(), passwordHash)

  const token = signSession(result.lastInsertRowid)
  res.cookie('session', token, COOKIE_OPTIONS)
  res.status(201).json({ id: result.lastInsertRowid, name: name.trim() })
})

router.post('/login', (req, res) => {
  const { password } = req.body || {}
  if (!password) {
    return res.status(400).json({ error: 'Passwort ist erforderlich' })
  }

  const families = db.prepare('SELECT id, name, password_hash FROM families').all()
  const match = families.find((f) => bcrypt.compareSync(password, f.password_hash))

  if (!match) {
    return res.status(401).json({ error: 'Falsches Passwort' })
  }

  const token = signSession(match.id)
  res.cookie('session', token, COOKIE_OPTIONS)
  res.json({ id: match.id, name: match.name })
})

router.post('/logout', (req, res) => {
  res.clearCookie('session')
  res.status(204).end()
})

router.get('/me', requireAuth, (req, res) => {
  const family = db.prepare('SELECT id, name FROM families WHERE id = ?').get(req.familyId)
  res.json(family)
})

module.exports = router
