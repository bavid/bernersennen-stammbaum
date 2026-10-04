const express = require('express')
const bcrypt = require('bcryptjs')
const crypto = require('node:crypto')
const db = require('../db')
const config = require('../config')
const { requireAuth, requireSession, setSessionCookie, clearSessionCookie, refreshSession } = require('../middleware/auth')
const { codeLimiter, authLimiter } = require('../middleware/abuse')
const { cleanId } = require('../lib/validate')
const { ART, canEnter, buildMe, removeMembership } = require('../lib/context')
const { isVisiting } = require('../lib/visits')
const { requireRole, isLastLeitung } = require('../lib/roles')
const { generateCode, normalizeCode, hashCode, formatCode } = require('../lib/codes')
const { validatePassword, validateUsername, validateEmail, DEMO_BATCH_KIND } = require('../lib/vouchers')
const { verifyCurrentCredential, REAUTH_ERROR } = require('../lib/currentCredential')
const { SLUG_MAX_LENGTH } = require('../lib/partners')
const { findDemoPartnerArea } = require('../lib/partnerAreas')
const { DEFAULT_DEMO_PARTNER_SLUG } = require('../seed/demo-partner-area')
const { loadDarstellung, saveDarstellung } = require('../lib/darstellung')

const router = express.Router()

const MIN_PASSWORD_LENGTH = 6
const MAX_NAME_LENGTH = 80
const BCRYPT_ROUNDS = 10
const USER_LOGIN_ERROR = 'Benutzername oder Passwort falsch'
const RECOVER_MISMATCH = 'Schlüssel oder Benutzername stimmen nicht'
const LAST_LEITUNG_LEAVE_MESSAGE = 'Übergib zuerst die Leitung oder löse die Familie auf.'

// M1: fester Vergleichs-Hash, einmal beim Modul-Laden erzeugt (gleiche Kosten wie echte Passwort-Hashes).
// Ohne unbekannten Benutzernamen läuft sonst kein bcrypt.compare, was einen Timing-Unterschied zwischen
// "Benutzername existiert nicht" und "Benutzername existiert, Passwort falsch" offenlegt.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS)

// Benutzer-Login (POST /login mit username/password statt secret): dieselbe 401 für falschen Namen
// und falsches Passwort, damit sich beides von außen nicht unterscheiden lässt. bcrypt.compare läuft
// IMMER (mit DUMMY_PASSWORD_HASH, falls kein Benutzer existiert) - sonst wäre ein unbekannter
// Benutzername an der fehlenden bcrypt-Wartezeit erkennbar (M1: Timing-Orakel).
async function findUserByCredentials(username, password) {
  if (typeof username !== 'string' || !username || typeof password !== 'string' || !password) return null
  const user = db.prepare('SELECT id, family_id, password_hash FROM users WHERE username = ?').get(username)
  const valid = await bcrypt.compare(password, user?.password_hash ?? DUMMY_PASSWORD_HASH)
  return valid && user ? user : null
}

// Der aktuelle Berechtigungsnachweis für sensible Aktionen (Schlüssel erneuern, Benutzer anlegen/löschen)
// liegt seit Phase R Task 2 in lib/currentCredential.js (verifyCurrentCredential, REAUTH_ERROR) - auch
// routes/members.js POST /key (Schlüssel der Familie durch ein Leitungs-Mitglied) braucht ihn.

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
    res.status(400).json({ error: 'Nur aus „Mein Zuhause“ heraus möglich' })
    return false
  }
  return true
}

router.get('/config', (req, res) => {
  res.json({ appEnv: config.appEnv, legal: config.legal, publicUrl: config.publicUrl })
})

// Kein Honeypot beim Login: Passwort-Manager füllen das versteckte Feld mit dem gespeicherten
// Benutzernamen und sperren sonst echte Menschen aus. Schutz hier: authLimiter.
// { username, password } ist der Benutzer-Login (Phase 1, unabhängig vom Bereichs-Schlüssel).
// { secret } ist das Feld für den Bereich selbst (Schlüssel ODER altes Passwort); { password } bleibt
// als Alias für alte Clients. Sieht secret wie ein Gutschein-Code aus, wird zuerst dort nachgeschaut -
// erst wenn weder ein Schlüssel noch ein offener Gutschein passt, läuft die alte Passwort-Schleife
// (ein altes Passwort könnte zufällig codeförmig sein).
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { username, password, secret } = req.body || {}

    if (typeof username === 'string' && username) {
      const user = await findUserByCredentials(username, password)
      if (!user) return res.status(401).json({ error: USER_LOGIN_ERROR })
      db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id)
      const family = db.prepare('SELECT is_demo FROM families WHERE id = ?').get(user.family_id)
      setSessionCookie(res, user.family_id, user.family_id, { userId: user.id })
      return res.json(buildMe(user.family_id, user.family_id, Boolean(family?.is_demo), user.id))
    }

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
      // Ein Schein-Gutschein der Demo (Stapel-Art DEMO_BATCH_KIND, seit Phase 5 Task 4 auch druckbar) ist nach
      // außen unbekannt (lib/vouchers.js assertVoucherOpen) - er darf hier nicht in den Einlöse-Modus führen.
      const voucher = db
        .prepare(
          `SELECT 1 FROM vouchers v JOIN voucher_batches b ON b.id = v.batch_id
           WHERE v.code_hash = ? AND v.redeemed_at IS NULL AND v.revoked_at IS NULL
             AND (v.expires_at IS NULL OR v.expires_at > datetime('now')) AND b.kind != ?`
        )
        .get(codeHash, DEMO_BATCH_KIND)
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

// Öffentlicher Einstieg ohne Passwort: loggt standardmäßig ins schreibgeschützte Demo-Zuhause ein
// (bevorzugt "Meine Chronik"; ohne Demo-Haushalt das Demo-Rudel). Mit { as: 'tierheim' } (Phase T
// Task 6) loggt es stattdessen ins Demo-Tierheim ein - z. B. über den Knopf "Demo als Tierheim
// ansehen" auf dem Portal eines Demo-Partners (PartnerPortalPage.jsx). Mit { as: 'partner', slug? }
// (Phase P1 Task 4) in einen Demo-Partner-Bereich: ohne slug der von Pfotenglück (seed/demo-partner-area.js),
// mit slug der dieses Demo-Partners - nur Demo-Partner-Bereiche (lib/partnerAreas.js findDemoPartnerArea),
// alles andere 404. Mit { as: 'rudel' } (Phase 5 Task 5, Präsentationsmodus "Als Rudel ansehen") in die
// Demo-Familie (art 'rudel') statt ins Demo-Zuhause. Jeder andere Wert von "as", ein slug ohne as: 'partner'
// oder ein slug, der kein Text ist, sind Client-Fehler (400), kein stillschweigendes Ignorieren.
const DEMO_AS_VALUES = ['tierheim', 'partner', 'rudel']

function isValidDemoSlug(as, slug) {
  if (slug === undefined) return true
  return as === 'partner' && typeof slug === 'string' && slug.length > 0 && slug.length <= SLUG_MAX_LENGTH
}

function findDemoFamily(as, slug) {
  if (as === 'tierheim') {
    return db.prepare("SELECT id FROM families WHERE is_demo = 1 AND art = 'tierheim' ORDER BY id DESC LIMIT 1").get()
  }
  if (as === 'partner') return findDemoPartnerArea(db, slug ?? DEFAULT_DEMO_PARTNER_SLUG)
  if (as === 'rudel') {
    return db.prepare("SELECT id FROM families WHERE is_demo = 1 AND art = 'rudel' ORDER BY id DESC LIMIT 1").get()
  }
  // Nur Zuhause oder Rudel - Demo-Partner-Bereiche und das Demo-Tierheim sind ebenfalls Demo-Familien.
  return db
    .prepare("SELECT id FROM families WHERE is_demo = 1 AND art IN ('zuhause', 'rudel') ORDER BY (art = 'zuhause') DESC, id DESC LIMIT 1")
    .get()
}

router.post('/demo', authLimiter, (req, res) => {
  const { as, slug } = req.body || {}
  if (as !== undefined && !DEMO_AS_VALUES.includes(as)) {
    return res.status(400).json({ error: 'Ungültiger Wert für „as“' })
  }
  if (!isValidDemoSlug(as, slug)) return res.status(400).json({ error: 'Ungültiger Wert für „slug“' })

  const demoFamily = findDemoFamily(as, slug)
  if (!demoFamily) return res.status(404).json({ error: 'Keine Demo verfügbar' })
  setSessionCookie(res, demoFamily.id)
  res.json(buildMe(demoFamily.id, demoFamily.id, true))
})

router.post('/logout', (req, res) => {
  clearSessionCookie(res)
  res.status(204).end()
})

// Den Namen der Familie ändern – betrifft alle, die das gemeinsame Passwort nutzen. In einer Familie nur für die Leitung
// (Phase R Task 1, lib/roles.js). B+ Familienalbum (04.10.): ein Auftritt für alle - ein mitgeschicktes "theme" (alte
// Clients) wird angenommen und ignoriert; die Spalte families.theme bleibt nur für ältere Datenbanken stehen.
router.put('/family', requireAuth, requireRole('leitung'), (req, res) => {
  const { name, theme } = req.body || {}
  if (name === undefined && theme === undefined) {
    return res.status(400).json({ error: 'Nichts zu ändern' })
  }
  if (name !== undefined) {
    const trimmedName = typeof name === 'string' ? name.trim() : ''
    if (!trimmedName) return res.status(400).json({ error: 'Der Name darf nicht leer sein' })
    if (trimmedName.length > MAX_NAME_LENGTH) {
      return res.status(400).json({ error: `Der Name darf höchstens ${MAX_NAME_LENGTH} Zeichen haben` })
    }
    db.prepare('UPDATE families SET name = ? WHERE id = ?').run(trimmedName, req.familyId)
  }
  res.json(db.prepare('SELECT id, name FROM families WHERE id = ?').get(req.familyId))
})

// adminView (Phase 5 Task 5b): eine vom Admin geöffnete Nur-Lesen-Sitzung meldet sich als solche, damit der
// Client das Band zeigt und Schreib-Knöpfe sperrt.
router.get('/me', requireAuth, (req, res) => {
  res.json(buildMe(req.homeId, req.familyId, req.isDemo, req.userId, { adminView: req.isAdminView }))
})

// Einstellungen „Darstellung“ (lib/darstellung.js, seit B+ Familienalbum der Mini-Designer) der Identität
// (req.homeId) - auch aus einer Familie heraus gilt und ändert man die eigene Wahl. Demo und Admin-Ansicht schreiben nie
// (requireAuth, denyAdminViewWrites in app.js; der Client wendet sie dort nur lokal an), Besuchs-Sitzungen sperrt
// lib/guestAccess.js. Nur Zuhause und klassische Rudel-Logins - Partner- und Tierheim-Bereiche haben keine Einstellungen-Seite.
const DARSTELLUNG_ARTS = [ART.zuhause, ART.rudel]

router.get('/me/darstellung', requireAuth, (req, res) => {
  res.json(loadDarstellung(req.homeId))
})

router.put('/me/darstellung', requireAuth, (req, res, next) => {
  if (!DARSTELLUNG_ARTS.includes(homeIdentity(req.homeId)?.art)) {
    return res.status(400).json({ error: 'Die Darstellung gibt es nur für Zuhause und Familien' })
  }
  try {
    res.json(saveDarstellung(req.homeId, req.body))
  } catch (err) {
    next(err)
  }
})

// Bereich wechseln: eigenes Zuhause oder ein Rudel, dem der Haushalt beigetreten ist.
// requireSession statt requireAuth: auch die Demo darf in ihren eigenen Bereich "wechseln". Die Admin-Ansicht
// wechselt über jede Mitgliedschaft der Identität (canEnter mit adminView) und bleibt dabei eine Admin-Ansicht
// (refreshSession trägt die Markierung weiter).
// Phase V2: auch in ein Zuhause, das die Identität besucht (lib/visits.js) - dort gilt die Sitzung als Besuch
// (middleware/auth.js req.isGuest: nur ansehen und kommentieren).
router.post('/view', requireSession, (req, res) => {
  // Strikt: nur ein echter JS-Integer > 0, kein Number(...)-Koerzierung (z. B. "3.0", [3], true, "abc")
  const rawId = req.body?.familyId
  const id = Number.isInteger(rawId) && rawId > 0 ? rawId : null
  if (!id || !(canEnter(req.homeId, id, { adminView: req.isAdminView }) || isVisiting(req.homeId, id))) {
    return res.status(404).json({ error: 'Diesen Bereich gibt es nicht' })
  }
  refreshSession(req, res, id)
  res.json(buildMe(req.homeId, id, req.isDemo, req.userId, { adminView: req.isAdminView }))
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
    res.json(buildMe(req.homeId, req.familyId, false, req.userId))
  } catch (err) {
    next(err)
  }
})

// Ein neues Rudel gründen und ihm gleich beitreten – nur aus "Meine Chronik" heraus. Die gründende
// Identität wird Leitung (Phase R Task 1); wer später beitritt, bekommt die Standardrolle 'mitglied'.
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
      db.prepare("INSERT INTO family_members (member_family_id, group_family_id, rolle) VALUES (?, ?, 'leitung')").run(
        req.homeId,
        result.lastInsertRowid
      )
    })()

    res.status(201).json(buildMe(req.homeId, req.familyId, false, req.userId))
  } catch (err) {
    next(err)
  }
})

// Mitgliedschaft in einem Rudel beenden (lib/context.js removeMembership: Mitgliedschaft und eigene
// Freigaben zusammen). War es gerade der aktive Bereich, geht es zurück nach Hause. Phase R Task 2: die
// einzige Leitung kann nicht einfach gehen - erst übergeben (routes/members.js POST /leitung/:homeId)
// oder die Familie auflösen (POST /aufloesen), sonst bliebe eine Familie ohne Leitung zurück.
router.delete('/memberships/:groupId', requireAuth, (req, res) => {
  const groupId = cleanId(req.params.groupId)
  if (!groupId) return res.status(404).json({ error: 'Diese Mitgliedschaft gibt es nicht' })
  if (isLastLeitung(req.homeId, groupId)) return res.status(409).json({ error: LAST_LEITUNG_LEAVE_MESSAGE })

  const changes = removeMembership(req.homeId, groupId)
  if (changes === 0) {
    return res.status(404).json({ error: 'Diese Mitgliedschaft gibt es nicht' })
  }

  if (req.familyId === groupId) {
    refreshSession(req, res, req.homeId)
    return res.json(buildMe(req.homeId, req.homeId, req.isDemo, req.userId))
  }
  res.json(buildMe(req.homeId, req.familyId, req.isDemo, req.userId))
})

// Nur im eigenen Bereich (Identität == aktiver Bereich) - sonst könnte man z. B. während man in einem
// beigetretenen Rudel unterwegs ist, versehentlich dessen Schlüssel/Benutzer meinen.
function requireOwnIdentity(req, res) {
  if (req.familyId !== req.homeId) {
    res.status(400).json({ error: 'Nur im eigenen Bereich möglich' })
    return false
  }
  return true
}

// Neuen Schlüssel erzeugen: auth_epoch steigt, jede andere Sitzung dieser Identität fällt raus
// (siehe requireSession). Die eigene, gerade genutzte Sitzung bekommt sofort ein neues Cookie
// (refreshSession), sonst wäre man mit der nächsten Anfrage selbst ausgesperrt. Wichtig: ein aktueller
// Berechtigungsnachweis ist Pflicht (verifyCurrentCredential) - sonst könnte eine übernommene Sitzung
// (z. B. ein Benutzer-Login ohne Kenntnis des Schlüssels) die ganze Identität an sich reißen, indem sie
// einfach einen neuen Schlüssel erzeugt und damit jede andere Sitzung aussperrt.
// requireRole('leitung') (Phase R Task 1) vor requireOwnIdentity: in einer Familie bekommt jede andere
// Rolle 403; die Leitung selbst erneuert hier weiterhin nur den Schlüssel ihres eigenen Bereichs - den
// gemeinsamen Schlüssel der Familie erneuert ein Leitungs-Mitglied über routes/members.js POST /key.
router.post('/family/key', authLimiter, requireAuth, requireRole('leitung'), async (req, res, next) => {
  try {
    if (!requireOwnIdentity(req, res)) return
    if (!(await verifyCurrentCredential(req))) {
      return res.status(403).json({ error: REAUTH_ERROR })
    }

    const code = generateCode()
    db.prepare('UPDATE families SET access_key_hash = ?, auth_epoch = auth_epoch + 1 WHERE id = ?').run(hashCode(code), req.homeId)
    refreshSession(req, res, req.homeId)
    res.json({ key: formatCode(code) })
  } catch (err) {
    next(err)
  }
})

// Eigene Benutzer-Logins der Identität (req.homeId) - gelten bereichsübergreifend, unabhängig vom
// gerade aktiven Bereich (Zuhause oder ein beigetretenes Rudel). Ist der aktive Bereich eine Familie,
// braucht jeder /users-Endpunkt die Leitung (Phase R Task 1) - im eigenen Bereich ist man das immer.
router.get('/users', requireAuth, requireRole('leitung'), (req, res) => {
  res.json(
    db.prepare('SELECT id, username, email, last_login_at FROM users WHERE family_id = ? ORDER BY created_at, id').all(req.homeId)
  )
})

// Ein neuer Benutzer-Login ist ein zusätzlicher, bereichsübergreifend gültiger Zugang zur Identität -
// genau wie beim Schlüssel erneuern (siehe oben) braucht das einen aktuellen Berechtigungsnachweis,
// sonst könnte eine übernommene Sitzung sich unbemerkt einen dauerhaften eigenen Zugang anlegen.
router.post('/users', authLimiter, requireAuth, requireRole('leitung'), async (req, res, next) => {
  try {
    if (!(await verifyCurrentCredential(req))) {
      return res.status(403).json({ error: REAUTH_ERROR })
    }

    const { username, password, email } = req.body || {}
    validateUsername(username)
    validatePassword(password)
    const cleanEmail = validateEmail(email)
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

    try {
      const result = db
        .prepare('INSERT INTO users (family_id, username, password_hash, email) VALUES (?, ?, ?, ?)')
        .run(req.homeId, username, passwordHash, cleanEmail)
      res.status(201).json(db.prepare('SELECT id, username, email, last_login_at FROM users WHERE id = ?').get(result.lastInsertRowid))
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Benutzername ist vergeben' })
      throw err
    }
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

// Wie beim Anlegen: einen Benutzer-Login zu entfernen braucht einen aktuellen Berechtigungsnachweis.
router.delete('/users/:id', authLimiter, requireAuth, requireRole('leitung'), async (req, res, next) => {
  try {
    const id = cleanId(req.params.id)
    if (!id) return res.status(404).json({ error: 'Diesen Benutzer gibt es nicht' })

    if (!(await verifyCurrentCredential(req))) {
      return res.status(403).json({ error: REAUTH_ERROR })
    }

    const result = db.prepare('DELETE FROM users WHERE id = ? AND family_id = ?').run(id, req.homeId)
    if (!result.changes) return res.status(404).json({ error: 'Diesen Benutzer gibt es nicht' })
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

// Wiederherstellung: der Schlüssel dient als PUK für den eigenen Benutzer-Login. Jede Unstimmigkeit
// (Code, Benutzername oder beides falsch) ergibt dieselbe Meldung, damit sich von außen nicht
// unterscheiden lässt, welcher Teil falsch war. session_epoch + 1 beendet alle bisherigen Sitzungen
// dieses Benutzers (siehe requireSession).
router.post('/recover', codeLimiter, async (req, res, next) => {
  try {
    const { code, username, newPassword } = req.body || {}
    validatePassword(newPassword)

    const normalized = normalizeCode(code)
    const user =
      typeof username === 'string' && username ? db.prepare('SELECT id, family_id FROM users WHERE username = ?').get(username) : null
    const family = normalized && user ? db.prepare('SELECT access_key_hash FROM families WHERE id = ?').get(user.family_id) : null
    if (!normalized || !user || !family || family.access_key_hash !== hashCode(normalized)) {
      return res.status(400).json({ error: RECOVER_MISMATCH })
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
    db.prepare('UPDATE users SET password_hash = ?, session_epoch = session_epoch + 1 WHERE id = ?').run(passwordHash, user.id)
    res.status(204).end()
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

module.exports = router
