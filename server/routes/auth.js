const crypto = require('node:crypto')
const express = require('express')
const bcrypt = require('bcryptjs')
const rateLimit = require('express-rate-limit')
const db = require('../db')
const config = require('../config')
const { requireAuth, requireSession, setSessionCookie, clearSessionCookie } = require('../middleware/auth')
const { rejectHoneypot } = require('../middleware/abuse')
const { cleanText, cleanId } = require('../lib/validate')
const { isTheme } = require('../lib/themes')
const { ART, canEnter, buildMe } = require('../lib/context')
const { normalizeCode, hashCode } = require('../lib/codes')

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

// onlyJoinable: für /families/join – nur echte Rudel, keine Demo (kein Zuhause anderer, keine Demo-Familie)
// legacy_password = 1 immer Pflicht: Gutschein-Zuhause haben password_hash = '!' (Schlüssel statt
// Passwort) - die Schleife läuft nie über sie, damit '!' nie versehentlich zu irgendetwas "passt".
async function findFamilyByPassword(password, { onlyJoinable = false } = {}) {
  const conditions = ['legacy_password = 1']
  if (onlyJoinable) conditions.push("art = 'rudel'", 'is_demo = 0')
  const families = db
    .prepare(`SELECT id, name, theme, is_demo, password_hash FROM families WHERE ${conditions.join(' AND ')}`)
    .all()
  for (const family of families) {
    if (await bcrypt.compare(password, family.password_hash)) return family
  }
  return null
}

function homeIdentity(homeId) {
  return db.prepare('SELECT art FROM families WHERE id = ?').get(homeId)
}

// join/group dürfen nur aus dem eigenen privaten Bereich heraus aufgerufen werden, nicht aus einem Rudel
function requireHomeIdentity(req, res) {
  const identity = homeIdentity(req.homeId)
  if (!identity || identity.art !== ART.zuhause) {
    res.status(400).json({ error: 'Nur aus „Meine Chronik“ heraus möglich' })
    return false
  }
  return true
}

router.get('/config', (req, res) => {
  res.json({ inviteRequired: Boolean(config.inviteCode), appEnv: config.appEnv })
})

router.post('/families', authLimiter, rejectHoneypot, async (req, res, next) => {
  try {
    const { name, password, inviteCode, quelle, art: artInput } = req.body || {}
    const trimmedName = typeof name === 'string' ? name.trim().slice(0, MAX_NAME_LENGTH) : ''
    if (!trimmedName || typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        error: `Rudelname und ein Passwort mit mindestens ${MIN_PASSWORD_LENGTH} Zeichen sind erforderlich`
      })
    }
    // Alte Clients senden keine art mit – die bekommen weiterhin ein gewöhnliches Rudel
    const art = artInput === undefined ? ART.rudel : artInput
    if (art !== ART.zuhause && art !== ART.rudel) {
      return res.status(400).json({ error: 'Unbekannte Art' })
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
      .prepare('INSERT INTO families (name, password_hash, quelle, art) VALUES (?, ?, ?, ?)')
      .run(trimmedName, passwordHash, cleanText(quelle, MAX_QUELLE_LENGTH), art)

    setSessionCookie(res, result.lastInsertRowid)
    res.status(201).json(buildMe(result.lastInsertRowid, result.lastInsertRowid, false))
  } catch (err) {
    next(err)
  }
})

// Kein Honeypot beim Login: Passwort-Manager füllen das versteckte Feld mit dem gespeicherten
// Benutzernamen und sperren sonst echte Menschen aus. Schutz hier: authLimiter.
// { secret } ist das neue Feld (Schlüssel ODER altes Passwort); { password } bleibt als Alias für
// alte Clients. Sieht secret wie ein Gutschein-Code aus, wird zuerst dort nachgeschaut - erst wenn
// weder ein Schlüssel noch ein offener Gutschein passt, läuft die alte Passwort-Schleife (ein altes
// Passwort könnte zufällig codeförmig sein).
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { secret, password } = req.body || {}
    const rawSecret = typeof secret === 'string' && secret ? secret : password
    if (typeof rawSecret !== 'string' || !rawSecret) {
      return res.status(400).json({ error: 'Schlüssel oder Passwort ist erforderlich' })
    }

    const normalized = normalizeCode(rawSecret)
    if (normalized) {
      const codeHash = hashCode(normalized)
      const family = db.prepare('SELECT id, name, theme, is_demo FROM families WHERE access_key_hash = ?').get(codeHash)
      if (family) {
        setSessionCookie(res, family.id)
        return res.json(buildMe(family.id, family.id, Boolean(family.is_demo)))
      }
      const voucher = db
        .prepare(
          `SELECT 1 FROM vouchers WHERE code_hash = ? AND redeemed_at IS NULL AND revoked_at IS NULL
             AND (expires_at IS NULL OR expires_at > datetime('now'))`
        )
        .get(codeHash)
      if (voucher) {
        return res.status(409).json({ redeem: true })
      }
    }

    const match = await findFamilyByPassword(rawSecret)
    if (!match) {
      return res.status(401).json({ error: 'Dieses Passwort kennen wir nicht' })
    }

    setSessionCookie(res, match.id)
    res.json(buildMe(match.id, match.id, Boolean(match.is_demo)))
  } catch (err) {
    next(err)
  }
})

// Öffentlicher Einstieg ohne Passwort: loggt ins schreibgeschützte Demo-Rudel ein (falls vorhanden).
// Bevorzugt einen Demo-Haushalt ("Meine Chronik"); heute gibt es nur ein Demo-Rudel, Verhalten bleibt gleich.
router.post('/demo', authLimiter, (req, res) => {
  const demoFamily = db
    .prepare("SELECT id, name, theme FROM families WHERE is_demo = 1 ORDER BY (art = 'zuhause') DESC, id DESC LIMIT 1")
    .get()
  if (!demoFamily) return res.status(404).json({ error: 'Keine Demo verfügbar' })
  setSessionCookie(res, demoFamily.id)
  res.json(buildMe(demoFamily.id, demoFamily.id, true))
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
  res.json(buildMe(req.homeId, req.familyId, req.isDemo))
})

// Bereich wechseln: eigenes Zuhause oder ein Rudel, dem der Haushalt beigetreten ist.
// requireSession statt requireAuth: auch die Demo darf in ihren eigenen Bereich "wechseln".
router.post('/view', requireSession, (req, res) => {
  // Strikt: nur ein echter JS-Integer > 0, kein Number(...)-Koerzierung (z. B. "3.0", [3], true, "abc")
  const rawId = req.body?.familyId
  const id = Number.isInteger(rawId) && rawId > 0 ? rawId : null
  if (!id || !canEnter(req.homeId, id)) {
    return res.status(404).json({ error: 'Diesen Bereich gibt es nicht' })
  }
  setSessionCookie(res, req.homeId, id)
  res.json(buildMe(req.homeId, id, req.isDemo))
})

// Einem bestehenden Rudel mit dessen Passwort beitreten – nur aus "Meine Chronik" heraus
router.post('/families/join', authLimiter, requireAuth, async (req, res, next) => {
  try {
    if (!requireHomeIdentity(req, res)) return

    const { password } = req.body || {}
    const match = typeof password === 'string' && password ? await findFamilyByPassword(password, { onlyJoinable: true }) : null
    if (!match) {
      return res.status(401).json({ error: 'Dieses Passwort kennen wir nicht' })
    }

    db.prepare('INSERT OR IGNORE INTO family_members (member_family_id, group_family_id) VALUES (?, ?)').run(req.homeId, match.id)
    res.json(buildMe(req.homeId, req.familyId, false))
  } catch (err) {
    next(err)
  }
})

// Ein neues Rudel gründen und ihm gleich beitreten – nur aus "Meine Chronik" heraus
router.post('/families/group', authLimiter, requireAuth, async (req, res, next) => {
  try {
    if (!requireHomeIdentity(req, res)) return

    const { name, password } = req.body || {}
    const trimmedName = typeof name === 'string' ? name.trim().slice(0, MAX_NAME_LENGTH) : ''
    if (!trimmedName || typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        error: `Rudelname und ein Passwort mit mindestens ${MIN_PASSWORD_LENGTH} Zeichen sind erforderlich`
      })
    }
    if (await findFamilyByPassword(password)) {
      return res.status(409).json({
        error: 'Passwort belegt – dieses Passwort nutzt schon ein anderes Rudel. Bitte wähle ein anderes.',
        field: 'password'
      })
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    // Rudel anlegen und Mitgliedschaft eintragen atomar: ein Absturz dazwischen darf kein Rudel
    // ohne Mitglied (oder ein Mitglied ohne Rudel) hinterlassen.
    db.transaction(() => {
      const result = db
        .prepare("INSERT INTO families (name, password_hash, art, theme) VALUES (?, ?, 'rudel', 'standard')")
        .run(trimmedName, passwordHash)
      db.prepare('INSERT OR IGNORE INTO family_members (member_family_id, group_family_id) VALUES (?, ?)').run(req.homeId, result.lastInsertRowid)
    })()

    res.status(201).json(buildMe(req.homeId, req.familyId, false))
  } catch (err) {
    next(err)
  }
})

// Mitgliedschaft und die eigenen Freigaben in dieses Rudel gemeinsam entfernen: ein Absturz
// dazwischen darf keine verwaisten dog_shares hinterlassen, die auf eine tote Mitgliedschaft zeigen.
const leaveGroup = db.transaction((homeId, groupId) => {
  const result = db
    .prepare('DELETE FROM family_members WHERE member_family_id = ? AND group_family_id = ?')
    .run(homeId, groupId)
  if (result.changes > 0) {
    db.prepare('DELETE FROM dog_shares WHERE family_id = ? AND dog_id IN (SELECT id FROM dogs WHERE family_id = ?)').run(
      groupId,
      homeId
    )
  }
  return result.changes
})

// Mitgliedschaft in einem Rudel beenden. War es gerade der aktive Bereich, geht es zurück nach Hause.
router.delete('/memberships/:groupId', requireAuth, (req, res) => {
  const groupId = cleanId(req.params.groupId)
  if (!groupId) return res.status(404).json({ error: 'Diese Mitgliedschaft gibt es nicht' })

  const changes = leaveGroup(req.homeId, groupId)
  if (changes === 0) {
    return res.status(404).json({ error: 'Diese Mitgliedschaft gibt es nicht' })
  }

  if (req.familyId === groupId) {
    setSessionCookie(res, req.homeId)
    return res.json(buildMe(req.homeId, req.homeId, req.isDemo))
  }
  res.json(buildMe(req.homeId, req.familyId, req.isDemo))
})

module.exports = router
