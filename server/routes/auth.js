const crypto = require('node:crypto')
const express = require('express')
const bcrypt = require('bcryptjs')
const rateLimit = require('express-rate-limit')
const db = require('../db')
const config = require('../config')
const { requireAuth, setSessionCookie, clearSessionCookie } = require('../middleware/auth')
const { rejectHoneypot } = require('../middleware/abuse')
const { cleanText } = require('../lib/validate')
const { isTheme } = require('../lib/themes')

const router = express.Router()

const MIN_PASSWORD_LENGTH = 6
const MAX_NAME_LENGTH = 80
const MAX_QUELLE_LENGTH = 200
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
  const families = db.prepare('SELECT id, name, theme, password_hash FROM families').all()
  for (const family of families) {
    if (await bcrypt.compare(password, family.password_hash)) return family
  }
  return null
}

router.get('/config', (req, res) => {
  res.json({ inviteRequired: Boolean(config.inviteCode), appEnv: config.appEnv })
})

router.post('/families', authLimiter, rejectHoneypot, async (req, res, next) => {
  try {
    const { name, password, inviteCode, quelle } = req.body || {}
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
      return res.status(409).json({
        error: 'Passwort belegt – dieses Passwort nutzt schon ein anderes Rudel. Bitte wähle ein anderes.',
        field: 'password'
      })
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const result = db
      .prepare('INSERT INTO families (name, password_hash, quelle) VALUES (?, ?, ?)')
      .run(trimmedName, passwordHash, cleanText(quelle, MAX_QUELLE_LENGTH))

    setSessionCookie(res, result.lastInsertRowid)
    res.status(201).json({ id: result.lastInsertRowid, name: trimmedName, theme: 'standard' })
  } catch (err) {
    next(err)
  }
})

// Kein Honeypot beim Login: Passwort-Manager füllen das versteckte Feld mit dem gespeicherten
// Benutzernamen und sperren sonst echte Menschen aus. Schutz hier: authLimiter.
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
    res.json({ id: match.id, name: match.name, theme: match.theme })
  } catch (err) {
    next(err)
  }
})

// Öffentlicher Einstieg ohne Passwort: loggt ins schreibgeschützte Demo-Rudel ein (falls vorhanden)
router.post('/demo', authLimiter, (req, res) => {
  const demoFamily = db.prepare('SELECT id, name, theme FROM families WHERE is_demo = 1 ORDER BY id DESC LIMIT 1').get()
  if (!demoFamily) return res.status(404).json({ error: 'Keine Demo verfügbar' })
  setSessionCookie(res, demoFamily.id)
  res.json({ id: demoFamily.id, name: demoFamily.name, theme: demoFamily.theme, isDemo: true })
})

router.post('/logout', (req, res) => {
  clearSessionCookie(res)
  res.status(204).end()
})

// Name und/oder Aussehen der Familie ändern – betrifft alle, die das gemeinsame Passwort nutzen
router.put('/family', requireAuth, (req, res) => {
  const { name, theme } = req.body || {}
  if (name === undefined && theme === undefined) {
    return res.status(400).json({ error: 'Nichts zu ändern' })
  }
  const updates = {}
  if (name !== undefined) {
    const trimmedName = typeof name === 'string' ? name.trim() : ''
    if (!trimmedName) return res.status(400).json({ error: 'Der Name darf nicht leer sein' })
    if (trimmedName.length > MAX_NAME_LENGTH) {
      return res.status(400).json({ error: `Der Name darf höchstens ${MAX_NAME_LENGTH} Zeichen haben` })
    }
    updates.name = trimmedName
  }
  if (theme !== undefined) {
    if (!isTheme(theme)) return res.status(400).json({ error: 'Dieses Aussehen gibt es nicht' })
    updates.theme = theme
  }
  if (updates.name) db.prepare('UPDATE families SET name = ? WHERE id = ?').run(updates.name, req.familyId)
  if (updates.theme) db.prepare('UPDATE families SET theme = ? WHERE id = ?').run(updates.theme, req.familyId)
  res.json(db.prepare('SELECT id, name, theme FROM families WHERE id = ?').get(req.familyId))
})

// Einladungscode für eingeloggte Mitglieder – damit sie ihn an Bekannte weitergeben können
router.get('/invite', requireAuth, (req, res) => {
  // Demo-Rudel ist öffentlich erreichbar – der echte Einladungscode bleibt echten Mitgliedern vorbehalten
  res.json({ inviteCode: req.isDemo ? null : config.inviteCode || null })
})

router.get('/me', requireAuth, (req, res) => {
  const family = db.prepare('SELECT id, name, theme FROM families WHERE id = ?').get(req.familyId)
  res.json({ ...family, isDemo: req.isDemo })
})

module.exports = router
