const crypto = require('node:crypto')
const { codePepper } = require('../config')

// Crockford-Base32 ohne I, L, O, U – gut vorlesbar, keine Verwechslungen
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_LENGTH = 12 // 60 Bit Zufall

function generateCode() {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i += 1) code += ALPHABET[crypto.randomInt(ALPHABET.length)]
  return code
}

function formatCode(code) {
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`
}

// Nachsichtig beim Eintippen: Groß/klein, Leerzeichen, Bindestriche egal; O→0, I/L→1
function normalizeCode(input) {
  if (typeof input !== 'string') return null
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  if (cleaned.length !== CODE_LENGTH) return null
  for (const ch of cleaned) if (!ALPHABET.includes(ch)) return null
  return cleaned
}

function hashCode(code) {
  return crypto.createHmac('sha256', codePepper).update(code).digest('hex')
}

// Schlüssel aus CODE_PEPPER, je Zweck ein eigener (Domänen-Trennung): ein Gutschein-Geheimtext lässt sich nicht
// als gespeichertes Geheimnis entschlüsseln und umgekehrt.
const deriveKey = (purpose) => crypto.createHash('sha256').update(`${codePepper}:${purpose}`).digest()
const cipherKey = () => deriveKey('voucher-cipher')
const secretKey = () => deriveKey('settings-secret')

function encryptWithKey(key, plaintext) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.')
}

function encryptCode(code) {
  return encryptWithKey(cipherKey(), code)
}

const IV_BYTES = 12
const TAG_BYTES = 16

// Lehnt verstümmelten/manipulierten Geheimtext ab, bevor überhaupt entschlüsselt wird: genau drei
// Base64-Teile (iv.tag.data), IV und Tag mit der erwarteten Länge. authTagLength wird explizit an
// createDecipheriv übergeben, damit Node den Tag mit der garantiert richtigen Länge prüft statt sich
// auf die (überschreibbare) Default-Länge zu verlassen.
function decryptWithKey(key, stored, label) {
  if (typeof stored !== 'string') throw new Error(`Ungültiger ${label}`)
  const parts = stored.split('.')
  if (parts.length !== 3) throw new Error(`Ungültiger ${label}`)

  const [iv, tag, data] = parts.map((part) => Buffer.from(part, 'base64'))
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error(`Ungültiger ${label}`)

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES })
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

function decryptCode(stored) {
  return decryptWithKey(cipherKey(), stored, 'Gutschein-Geheimtext')
}

// Phase N Task 2: gespeicherte Geheimnisse in der Tabelle settings (Telegram-Bot-Token, lib/telegramConfig.js) -
// dasselbe AES-256-GCM-Verfahren wie bei den Gutschein-Codes, aber mit eigenem Schlüssel. Fehlermeldungen nennen
// nie den Inhalt.
function encryptSecret(plaintext) {
  return encryptWithKey(secretKey(), plaintext)
}

function decryptSecret(stored) {
  return decryptWithKey(secretKey(), stored, 'gespeicherter Geheimtext')
}

module.exports = {
  ALPHABET,
  CODE_LENGTH,
  generateCode,
  formatCode,
  normalizeCode,
  hashCode,
  encryptCode,
  decryptCode,
  encryptSecret,
  decryptSecret
}
