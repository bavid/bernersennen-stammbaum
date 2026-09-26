const crypto = require('node:crypto')
const { promisify } = require('node:util')

const scrypt = promisify(crypto.scrypt)
const KEY_LENGTH = 64

// Format "scrypt:<salt-hex>:<key-hex>" – enthält kein "$", damit es in .env-Dateien
// (Docker-Compose-Interpolation) unverändert bleibt.
async function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const key = await scrypt(String(password), salt, KEY_LENGTH)
  return `scrypt:${salt.toString('hex')}:${key.toString('hex')}`
}

async function verifyPassword(password, stored) {
  const [scheme, saltHex, keyHex] = String(stored || '').split(':')
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false
  const expected = Buffer.from(keyHex, 'hex')
  const actual = await scrypt(String(password ?? ''), Buffer.from(saltHex, 'hex'), expected.length)
  return crypto.timingSafeEqual(actual, expected)
}

function safeEqual(a, b) {
  const hashA = crypto.createHash('sha256').update(String(a ?? '')).digest()
  const hashB = crypto.createHash('sha256').update(String(b ?? '')).digest()
  return crypto.timingSafeEqual(hashA, hashB)
}

module.exports = { hashPassword, verifyPassword, safeEqual }
