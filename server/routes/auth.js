const crypto = require('node:crypto')
const express = require('express')
const bcrypt = require('bcryptjs')
const rateLimit = require('express-rate-limit')
const db = require('../db')
const config = require('../config')
const { requireAuth, setSessionCookie, clearSessionCookie } = require('../middleware/auth')

const router = express.Router()

const MIN_PASSWORD_LENGTH = 6
const MAX_NAME_LENGTH = 80
const BCRYPT_ROUNDS = 10

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.loginRateLimit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Zu viele Versuche. Bitte warte ein paar Minuten und probiere es dann erneut.' }
})

function safeEqual(a, b) {
  const hashA = crypto.createHash('sha256').update(String(a ?? '')).digest()
  const hashB = crypto.createHash('sha256').update(String(b ?? '')).digest()
  return crypto.timingSafeEqual(hashA, hashB)
}

async function findFamilyByPassword(password) {
  const families = db.prepare('SELECT id, name, password_hash FROM families').all()
  for (const family of families) {
    if (await bcrypt.compare(password, family.password_hash)) return family
  }
  return null
}

router.get('/config', (req, res) => {
  res.json({ inviteRequired: Boolean(config.inviteCode) })
})

router.post('/families', authLimiter, async (req, res, next) => {
  try {
    const { name, password, inviteCode } = req.body || {}
    const trimmedName = typeof name === 'string' ? name.trim().slice(0, MAX_NAME_LENGTH) : ''
    if (!trimmedName || typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        error: `Rudelname und ein Passwort mit mindestens ${MIN_PASSWORD_LENGTH} Zeichen sind erforderlich`
      })
    }
    if (config.inviteCode && !safeEqual(inviteCode, config.inviteCode)) {
      return res.status(403).json({ error: 'Der Einladungscode stimmt nicht' })
    }
    if (await findFamilyByPassword(password)) {
      return res.status(409).json({ error: 'Dieses Passwort ist schon vergeben. Bitte wähle ein anderes.' })
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const result = db
      .prepare('INSERT INTO families (name, password_hash) VALUES (?, ?)')
      .run(trimmedName, passwordHash)

    setSessionCookie(res, result.lastInsertRowid)
    res.status(201).json({ id: result.lastInsertRowid, name: trimmedName })
  } catch (err) {
    next(err)
  }
})

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { password } = req.body || {}
    if (typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'Passwort ist erforderlich' })
    }

    const match = await findFamilyByPassword(password)
    if (!match) {
      return res.status(401).json({ error: 'Dieses Passwort kennen wir nicht' })
    }

    setSessionCookie(res, match.id)
    res.json({ id: match.id, name: match.name })
  } catch (err) {
    next(err)
  }
})

router.post('/logout', (req, res) => {
  clearSessionCookie(res)
  res.status(204).end()
})

router.get('/me', requireAuth, (req, res) => {
  const family = db.prepare('SELECT id, name FROM families WHERE id = ?').get(req.familyId)
  res.json(family)
})

module.exports = router
