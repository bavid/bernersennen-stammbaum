const path = require('node:path')
const { isValidToken, isValidChatId } = require('./lib/telegramFormat')

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

// Umkreissuche (Task 3): welche(r) Anbieter liefert Treffer neben den Partnern - 'overpass' (OSM, echte
// Anfragen) oder 'fixture' (fiktive Testdaten, nie externe Anfragen). Komma-getrennt für später mehrere
// Anbieter, heute wird nur der erste tatsächlich abgefragt (siehe lib/places/index.js).
function readPlacesProviders(env) {
  const raw = (process.env.PLACES_PROVIDERS || '').trim()
  if (raw) return raw.split(',').map((s) => s.trim()).filter(Boolean)
  return [env === 'production' ? 'overpass' : 'fixture']
}

// Impressum/Datenschutz (Task 7): IMPRESSUM_NAME/-ADRESSE/-EMAIL/-TELEFON aus der Umgebung, fehlende
// Angaben bleiben leere Strings (nie erfundene Betreiberdaten). In der .env kann kein echter
// Zeilenumbruch stehen - IMPRESSUM_ADRESSE nutzt darum das literale Zeichenpaar \n, das hier zu einem
// echten Zeilenumbruch wird. env-Parameter (statt process.env direkt) macht die Funktion ohne
// Umgebungs-Zauberei testbar.
function readLegal(env = process.env) {
  return {
    name: (env.IMPRESSUM_NAME || '').trim(),
    address: (env.IMPRESSUM_ADRESSE || '').trim().replace(/\\n/g, '\n'),
    email: (env.IMPRESSUM_EMAIL || '').trim(),
    phone: (env.IMPRESSUM_TELEFON || '').trim()
  }
}

// Öffentliche Adresse der App (Phase G Task 2): Ziel der QR-Codes, Basis der sitemap.xml und des
// Bot-User-Agents (lib/publicUrl.js absoluteUrl). Nur eine echte http(s)-Adresse mit Host zählt - ein Tippfehler
// wie "https://" darf nicht halb greifen (Sitemap an, HSTS aus). Query/Fragment und abschließende Schrägstriche
// fallen weg, damit Pfade einfach angehängt werden können; ohne (gültige) Angabe null, Links bleiben dann relativ.
function readPublicUrl(value) {
  const raw = (value || '').trim()
  if (!raw) return null
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  if (!/^https?:$/.test(parsed.protocol) || !parsed.host) return null
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`
}

// Telegram-Benachrichtigungen (Phase N Task 2): Bot-Token und Chat-ID trägt der Admin im Admin ein
// (lib/telegramConfig.js, verschlüsselt in settings). TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID aus der Umgebung sind nur
// der Rückfall, solange dort nichts eingetragen ist. Beide nötig und im erwarteten Format (lib/telegramFormat.js),
// sonst null (aus). Der Hinweis im Log nennt nie die Werte selbst.
function readTelegram(env = process.env, logger = console) {
  const botToken = (env.TELEGRAM_BOT_TOKEN || '').trim()
  const chatId = (env.TELEGRAM_CHAT_ID || '').trim()
  if (!botToken && !chatId) return null
  if (!isValidToken(botToken) || !isValidChatId(chatId)) {
    logger.warn('TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID fehlen oder haben ein unerwartetes Format – der Rückfall aus der Umgebung bleibt aus.')
    return null
  }
  return { botToken, chatId }
}

function isHttpsUrl(url) {
  return /^https:\/\//i.test(url || '')
}

// Admin-Reiter „Server“ (Phase G Task 6): Stand der App. deploy/remote.sh baut das Image mit APP_COMMIT=<git rev-parse
// HEAD> (Dockerfile ARG). Es zählt nur ein Commit-SHA (7 bis 64 Hex-Zeichen, auch SHA-256), sonst null - der Admin zeigt
// dann „unbekannt“.
const COMMIT_RE = /^[0-9a-f]{7,64}$/

function readAppCommit(value) {
  const commit = (value || '').trim().toLowerCase()
  return COMMIT_RE.test(commit) ? commit : null
}

// Tägliche Datenbank-Sicherung (lib/autoBackup.js): AUTO_BACKUP=true|false. Ohne Angabe an in Prod und Vorschau, aus
// lokal (dev, also auch in der Testumgebung). Tests starten den Zeitplan ohnehin nie - das macht nur index.js.
function readAutoBackup(value, env) {
  const raw = (value || '').trim().toLowerCase()
  if (['1', 'true', 'on'].includes(raw)) return true
  if (['0', 'false', 'off'].includes(raw)) return false
  return env !== 'dev'
}

const dataDir = process.env.DATA_DIR || __dirname

const appEnv = readAppEnv(process.env.APP_ENV)
const publicUrl = readPublicUrl(process.env.PUBLIC_URL)
// Läuft die App laut PUBLIC_URL per https, gelten HSTS (app.js) und Secure-Cookies automatisch - COOKIE_SECURE
// bleibt für Instanzen ohne Domain (https://IP:PORT hinter dem Server-Proxy) weiterhin der Schalter.
const httpsPublicUrl = isHttpsUrl(publicUrl)
// Prod und Vorschau laufen auf derselben IP (nur der Port unterscheidet sich) – Browser scopen Cookies
// aber nicht nach Port. Ohne Präfix würde ein Login auf der Vorschau die Prod-Sitzung überschreiben.
// Prod behält bewusst die unpräfixierten Namen, damit ein Rollout niemanden ausloggt.
const cookiePrefix = appEnv === 'production' ? '' : `${appEnv}_`

module.exports = {
  isProduction,
  appEnv,
  readAppEnv,
  readLegal,
  readPublicUrl,
  readTelegram,
  readAppCommit,
  readAutoBackup,
  isHttpsUrl,
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
  // Partner-Logos (öffentlich, anders als /uploads) - siehe routes/partners.js und lib/partners.js
  partnerMediaDir: process.env.PARTNER_MEDIA_DIR || path.join(dataDir, 'partner-media'),
  // Admin-Reiter „Server“ (Phase G Task 6): Laufwerk der Daten (fs.statfs) und die täglichen Sicherungen samt
  // Markierungsdatei last-backup.json (lib/autoBackup.js; deploy/remote.sh backup schreibt sie ebenfalls).
  dataDir,
  backupDir: path.join(dataDir, 'backups'),
  appCommit: readAppCommit(process.env.APP_COMMIT),
  autoBackup: readAutoBackup(process.env.AUTO_BACKUP, appEnv),
  clientDist: process.env.CLIENT_DIST || path.join(__dirname, '..', 'client', 'dist'),
  cookieSecure: process.env.COOKIE_SECURE === 'true' || httpsPublicUrl,
  trustProxy: readTrustProxy(),
  corsOrigin: readCorsOrigin(),
  loginRateLimit: Number(process.env.LOGIN_RATE_LIMIT) || 20,
  // Gutschein prüfen/einlösen: eigenes Limit, weil beides öffentlich ohne Login erreichbar ist
  codeRateLimit: Number(process.env.CODE_RATE_LIMIT) || 20,
  uploadRateLimit: Number(process.env.UPLOAD_RATE_LIMIT) || 200,
  // Kontaktformular der Partner-Portale (Phase P2 Task 9): Anfragen pro IP je Stunde - öffentlich ohne Login
  contactRateLimit: Number(process.env.CONTACT_RATE_LIMIT) || 5,
  // Gutschein-/Partner-Anfragen (Phase N Task 1): Anfragen pro IP je Stunde - öffentlich ohne Login
  anfrageRateLimit: Number(process.env.ANFRAGE_RATE_LIMIT) || 3,
  // Digitaler Bilderrahmen auf einem anderen Gerät (routes/rahmen.js): Fotolisten pro IP je 15 Minuten - öffentlich ohne Login
  rahmenRateLimit: Number(process.env.RAHMEN_RATE_LIMIT) || 60,
  // Diashow im eigenen Zuhause (routes/bilderrahmen.js GET /fotos): Fotolisten je Bereich alle 5 Minuten - die Seite holt
  // sie nur beim Öffnen, bei einer neuen Auswahl und alle 30 Minuten
  bilderrahmenRateLimit: Number(process.env.BILDERRAHMEN_RATE_LIMIT) || 30,
  // Anfragen pro IP je 5 Minuten (API bzw. Fotos) und Schreibzugriffe pro Rudel je 10 Minuten
  apiRateLimit: Number(process.env.API_RATE_LIMIT) || 900,
  photoRateLimit: Number(process.env.PHOTO_RATE_LIMIT) || 3000,
  writeRateLimit: Number(process.env.WRITE_RATE_LIMIT) || 150,
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  // "scrypt:<salt>:<key>", erzeugt mit `npm run admin:hash -- <passwort>`; leer = kein Admin-Zugang
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || '',
  // Umkreissuche (Task 3, siehe lib/places/) - Anbieter, Tages-Obergrenze für echte Overpass-Anfragen,
  // optionale eigene Adresse für den Bot-User-Agent (siehe lib/http.js)
  placesProviders: readPlacesProviders(appEnv),
  placesDailyLimit: Number(process.env.PLACES_DAILY_LIMIT) || 500,
  publicUrl,
  httpsPublicUrl,
  // Impressum/Datenschutz (Task 7, siehe routes/auth.js GET /config und lib/geo.js-Nachbarn)
  legal: readLegal(),
  // Rückfall für die Telegram-Benachrichtigungen (siehe readTelegram) - nie loggen, nie an einen Client geben.
  telegram: readTelegram()
}
