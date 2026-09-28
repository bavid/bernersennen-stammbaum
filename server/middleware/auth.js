const jwt = require('jsonwebtoken')
const db = require('../db')
const { jwtSecret, cookieSecure, sessionCookie } = require('../config')
const { canEnter } = require('../lib/context')

const SESSION_DAYS = 30

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: cookieSecure,
  path: '/',
  maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000
}

const familyById = db.prepare('SELECT is_demo FROM families WHERE id = ?')

// Prüft die Session, ohne Schreibzugriffe im Demo-Modus zu sperren (das übernimmt requireAuth).
// req.homeId ist die Identität (Zuhause oder klassisches Rudel-Login), req.familyId der aktive Bereich.
function requireSession(req, res, next) {
  const token = req.cookies?.[sessionCookie]
  if (!token) {
    return res.status(401).json({ error: 'Nicht eingeloggt' })
  }
  try {
    const payload = jwt.verify(token, jwtSecret)
    const family = familyById.get(payload.familyId)
    if (!family) {
      return res.status(401).json({ error: 'Rudel existiert nicht mehr' })
    }
    let active = payload.activeFamilyId ?? payload.familyId
    if (active !== payload.familyId && !canEnter(payload.familyId, active)) {
      // Mitgliedschaft beendet oder Familie gelöscht: zurück in den eigenen Bereich
      active = payload.familyId
    }
    // Identität ODER aktiver Bereich demo -> als Demo behandeln (Verteidigungslinie neben canEnter,
    // das ein Auseinanderlaufen von Identität und Bereich im Normalbetrieb schon verhindert)
    const activeIsDemo = active === payload.familyId ? family.is_demo : familyById.get(active)?.is_demo
    req.homeId = payload.familyId
    req.familyId = active
    req.isDemo = Boolean(family.is_demo) || Boolean(activeIsDemo)
    next()
  } catch {
    return res.status(401).json({ error: 'Session ungültig oder abgelaufen' })
  }
}

// is_demo kommt aus der DB, nicht aus dem Token: so bleibt eine Demo-Familie schreibgeschützt,
// auch wenn jemand sich mit ihrem echten Passwort ganz normal einloggt.
function requireAuth(req, res, next) {
  requireSession(req, res, (err) => {
    if (err) return next(err)
    if (req.isDemo && req.method !== 'GET') {
      return res.status(403).json({ error: 'Demo-Modus: nur zum Ansehen, keine Änderungen möglich.' })
    }
    next()
  })
}

function signSession(familyId, activeFamilyId = familyId) {
  return jwt.sign({ familyId, activeFamilyId }, jwtSecret, { expiresIn: `${SESSION_DAYS}d` })
}

function setSessionCookie(res, familyId, activeFamilyId = familyId) {
  res.cookie(sessionCookie, signSession(familyId, activeFamilyId), COOKIE_OPTIONS)
}

function clearSessionCookie(res) {
  const { maxAge, ...options } = COOKIE_OPTIONS
  res.clearCookie(sessionCookie, options)
}

module.exports = { requireAuth, requireSession, signSession, setSessionCookie, clearSessionCookie }
