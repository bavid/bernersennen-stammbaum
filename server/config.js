const path = require('node:path')

const isProduction = process.env.NODE_ENV === 'production'
const DEV_JWT_SECRET = 'dev-only-secret-never-use-in-production'
const DEV_CODE_PEPPER = 'dev-code-pepper'
const MIN_CODE_PEPPER_LENGTH = 32

const APP_ENVS = ['production', 'staging', 'dev']

// Umgebung für Hinweis-Band und Schutzschalter: production | staging (Vorschau) | dev (lokal).
// Ohne gültige Angabe entscheidet NODE_ENV. `value` bekommt hier bewusst keinen Default auf
// process.env.APP_ENV: explizites `undefined` (z. B. in Tests) soll den Fallback greifen lassen,
// statt einen zur Laufzeit bereits gesetzten APP_ENV wiederzuverwenden.
function readAppEnv(value, production = isProduction) {
  const env = (value || '').trim()
  if (APP_ENVS.includes(env)) return env
  return production ? 'production' : 'dev'
}

function readJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (secret) return secret
  if (isProduction) {
    throw new Error('JWT_SECRET muss in Produktion gesetzt sein (siehe .env.example)')
  }
  return DEV_JWT_SECRET
}

// Wie readJwtSecret: in Produktion Pflicht, sonst throw beim Start (siehe .env.example). Anders als
// beim JWT-Secret prüfen wir hier zusätzlich eine Mindestlänge, weil CODE_PEPPER sowohl den Such-HMAC
// als auch den AES-256-GCM-Schlüssel der Gutschein-Codes ableitet.
function readCodePepper() {
  const pepper = process.env.CODE_PEPPER
  if (!pepper) {
    if (isProduction) {
      throw new Error('CODE_PEPPER muss in Produktion gesetzt sein (siehe .env.example)')
    }
    return DEV_CODE_PEPPER
  }
  if (isProduction && pepper.length < MIN_CODE_PEPPER_LENGTH) {
    throw new Error(`CODE_PEPPER muss in Produktion mindestens ${MIN_CODE_PEPPER_LENGTH} Zeichen haben`)
  }
  return pepper
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

const appEnv = readAppEnv(process.env.APP_ENV)
// Prod und Vorschau laufen auf derselben IP (nur der Port unterscheidet sich) – Browser scopen Cookies
// aber nicht nach Port. Ohne Präfix würde ein Login auf der Vorschau die Prod-Sitzung überschreiben.
// Prod behält bewusst die unpräfixierten Namen, damit ein Rollout niemanden ausloggt.
const cookiePrefix = appEnv === 'production' ? '' : `${appEnv}_`

module.exports = {
  isProduction,
  appEnv,
  readAppEnv,
  cookiePrefix,
  sessionCookie: `${cookiePrefix}session`,
  adminCookie: `${cookiePrefix}admin_session`,
  port: Number(process.env.PORT) || 4000,
  jwtSecret: readJwtSecret(),
  codePepper: readCodePepper(),
  // Gutscheine je Bereich, die zum Weitergeben nachgelegt werden (Task 4)
  voucherQuota: Number(process.env.RUDEL_VOUCHER_QUOTA) || 3,
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
