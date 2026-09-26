const path = require('node:path')

const isProduction = process.env.NODE_ENV === 'production'
const DEV_JWT_SECRET = 'dev-only-secret-never-use-in-production'

function readJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (secret) return secret
  if (isProduction) {
    throw new Error('JWT_SECRET muss in Produktion gesetzt sein (siehe .env.example)')
  }
  return DEV_JWT_SECRET
}

function readCorsOrigin() {
  if (process.env.CORS_ORIGIN) return process.env.CORS_ORIGIN
  return isProduction ? false : 'http://localhost:5173'
}

// "1" -> 1 (Anzahl Proxy-Hops), "true"/"false" -> boolean, sonst IP/Subnetz-Liste für Express
function readTrustProxy() {
  const value = (process.env.TRUST_PROXY || '').trim()
  if (!value || value === 'false') return false
  if (value === 'true') return true
  return /^\d+$/.test(value) ? Number(value) : value
}

const dataDir = process.env.DATA_DIR || __dirname

module.exports = {
  isProduction,
  port: Number(process.env.PORT) || 4000,
  jwtSecret: readJwtSecret(),
  dbPath: process.env.DB_PATH || path.join(dataDir, 'data.db'),
  uploadDir: process.env.UPLOAD_DIR || path.join(dataDir, 'uploads'),
  clientDist: process.env.CLIENT_DIST || path.join(__dirname, '..', 'client', 'dist'),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  inviteCode: process.env.FAMILY_INVITE_CODE || '',
  trustProxy: readTrustProxy(),
  corsOrigin: readCorsOrigin(),
  loginRateLimit: Number(process.env.LOGIN_RATE_LIMIT) || 20,
  uploadRateLimit: Number(process.env.UPLOAD_RATE_LIMIT) || 200,
  // Anfragen pro IP je 5 Minuten (API bzw. Fotos) und Schreibzugriffe pro Rudel je 10 Minuten
  apiRateLimit: Number(process.env.API_RATE_LIMIT) || 900,
  photoRateLimit: Number(process.env.PHOTO_RATE_LIMIT) || 3000,
  writeRateLimit: Number(process.env.WRITE_RATE_LIMIT) || 150,
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  // "scrypt:<salt>:<key>", erzeugt mit `npm run admin:hash -- <passwort>`; leer = kein Admin-Zugang
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || ''
}
