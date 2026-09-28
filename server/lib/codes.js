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

const cipherKey = () => crypto.createHash('sha256').update(`${codePepper}:voucher-cipher`).digest()

function encryptCode(code) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', cipherKey(), iv)
  const data = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.')
}

function decryptCode(stored) {
  const [iv, tag, data] = stored.split('.').map((part) => Buffer.from(part, 'base64'))
  const decipher = crypto.createDecipheriv('aes-256-gcm', cipherKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

module.exports = { ALPHABET, CODE_LENGTH, generateCode, formatCode, normalizeCode, hashCode, encryptCode, decryptCode }
