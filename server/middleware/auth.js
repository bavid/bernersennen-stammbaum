const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'

function requireAuth(req, res, next) {
  const token = req.cookies?.session
  if (!token) {
    return res.status(401).json({ error: 'Nicht eingeloggt' })
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.familyId = payload.familyId
    next()
  } catch {
    return res.status(401).json({ error: 'Session ungültig oder abgelaufen' })
  }
}

function signSession(familyId) {
  return jwt.sign({ familyId }, JWT_SECRET, { expiresIn: '7d' })
}

module.exports = { requireAuth, signSession, JWT_SECRET }
