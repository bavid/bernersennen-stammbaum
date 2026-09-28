const path = require('node:path')
const jwt = require('jsonwebtoken')
const { jwtSecret, cookieSecure, adminCookie: ADMIN_COOKIE } = require('../config')
const { requireSession } = require('./auth')
const { canSeeUpload } = require('../lib/uploadAccess')

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

// Fotos: Admin sieht alles; sonst nur wer laut canSeeUpload Zugriff auf genau diese Datei hat.
// requireSession statt requireAuth: die Demo darf lesen (express.static bedient ohnehin nur GET/HEAD,
// requireAuths Schreibsperre für's Demo-Modus wäre hier also wirkungslos) und antwortet bei fehlender/
// ungültiger Session selbst mit 401 (heutiges Verhalten bleibt so).
// 404 statt 403 bei fehlendem Zugriff: eine fremde Foto-URL soll nicht einmal verraten, dass es sie gibt.
function requireUploadAccess(req, res, next) {
  if (isAdmin(req)) return next()
  requireSession(req, res, () => {
    const filename = path.basename(req.path)
    if (!canSeeUpload({ familyId: req.familyId, homeId: req.homeId }, filename)) {
      return res.status(404).json({ error: 'Nicht gefunden' })
    }
    next()
  })
}

function setAdminCookie(res) {
  const token = jwt.sign({ role: 'admin' }, jwtSecret, { expiresIn: `${ADMIN_SESSION_HOURS}h` })
  res.cookie(ADMIN_COOKIE, token, ADMIN_COOKIE_OPTIONS)
}

function clearAdminCookie(res) {
  const { maxAge, ...options } = ADMIN_COOKIE_OPTIONS
  res.clearCookie(ADMIN_COOKIE, options)
}

module.exports = { requireAdmin, requireUploadAccess, setAdminCookie, clearAdminCookie }
