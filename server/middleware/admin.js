const jwt = require('jsonwebtoken')
const { jwtSecret, cookieSecure, adminCookie: ADMIN_COOKIE } = require('../config')
const { requireAuth } = require('./auth')

const ADMIN_SESSION_HOURS = 12

const ADMIN_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict',
  secure: cookieSecure,
  path: '/',
  maxAge: ADMIN_SESSION_HOURS * 60 * 60 * 1000
}

function isAdmin(req) {
  const token = req.cookies?.[ADMIN_COOKIE]
  if (!token) return false
  try {
    return jwt.verify(token, jwtSecret).role === 'admin'
  } catch {
    return false
  }
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Nur für Admins' })
  next()
}

// Fotos: Rudel-Mitglieder oder Admin
function requireFamilyOrAdmin(req, res, next) {
  if (isAdmin(req)) return next()
  return requireAuth(req, res, next)
}

function setAdminCookie(res) {
  const token = jwt.sign({ role: 'admin' }, jwtSecret, { expiresIn: `${ADMIN_SESSION_HOURS}h` })
  res.cookie(ADMIN_COOKIE, token, ADMIN_COOKIE_OPTIONS)
}

function clearAdminCookie(res) {
  const { maxAge, ...options } = ADMIN_COOKIE_OPTIONS
  res.clearCookie(ADMIN_COOKIE, options)
}

module.exports = { requireAdmin, requireFamilyOrAdmin, setAdminCookie, clearAdminCookie }
