const jwt = require('jsonwebtoken')
const db = require('../db')
const { jwtSecret, cookieSecure, sessionCookie } = require('../config')

const SESSION_DAYS = 30

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: cookieSecure,
  path: '/',
  maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000
}

const familyById = db.prepare('SELECT is_demo FROM families WHERE id = ?')

// is_demo kommt aus der DB, nicht aus dem Token: so bleibt eine Demo-Familie schreibgeschützt,
// auch wenn jemand sich mit ihrem echten Passwort ganz normal einloggt.
function requireAuth(req, res, next) {
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
    if (family.is_demo && req.method !== 'GET') {
      return res.status(403).json({ error: 'Demo-Modus: nur zum Ansehen, keine Änderungen möglich.' })
    }
    req.familyId = payload.familyId
    req.isDemo = Boolean(family.is_demo)
    next()
  } catch {
    return res.status(401).json({ error: 'Session ungültig oder abgelaufen' })
  }
}

function signSession(familyId) {
  return jwt.sign({ familyId }, jwtSecret, { expiresIn: `${SESSION_DAYS}d` })
}

function setSessionCookie(res, familyId) {
  res.cookie(sessionCookie, signSession(familyId), COOKIE_OPTIONS)
}

function clearSessionCookie(res) {
  const { maxAge, ...options } = COOKIE_OPTIONS
  res.clearCookie(sessionCookie, options)
}

module.exports = { requireAuth, signSession, setSessionCookie, clearSessionCookie }
