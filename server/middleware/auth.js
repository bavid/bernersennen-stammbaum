const jwt = require('jsonwebtoken')
const db = require('../db')
const { jwtSecret, cookieSecure } = require('../config')

const SESSION_DAYS = 30

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: cookieSecure,
  path: '/',
  maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000
}

const familyExists = db.prepare('SELECT 1 FROM families WHERE id = ?')

function requireAuth(req, res, next) {
  const token = req.cookies?.session
  if (!token) {
    return res.status(401).json({ error: 'Nicht eingeloggt' })
  }
  try {
    const payload = jwt.verify(token, jwtSecret)
    if (!familyExists.get(payload.familyId)) {
      return res.status(401).json({ error: 'Rudel existiert nicht mehr' })
    }
    req.familyId = payload.familyId
    next()
  } catch {
    return res.status(401).json({ error: 'Session ungültig oder abgelaufen' })
  }
}

function signSession(familyId) {
  return jwt.sign({ familyId }, jwtSecret, { expiresIn: `${SESSION_DAYS}d` })
}

function setSessionCookie(res, familyId) {
  res.cookie('session', signSession(familyId), COOKIE_OPTIONS)
}

function clearSessionCookie(res) {
  const { maxAge, ...options } = COOKIE_OPTIONS
  res.clearCookie('session', options)
}

module.exports = { requireAuth, signSession, setSessionCookie, clearSessionCookie }
