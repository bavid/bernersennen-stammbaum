const bcrypt = require('bcryptjs')
const { generateCode, normalizeCode, hashCode, encryptCode } = require('./codes')

const CODE_HINT_LENGTH = 4
const MAX_COLLISION_RETRIES = 5 // 60 Bit Zufall - eine Kollision ist praktisch ausgeschlossen
const BCRYPT_ROUNDS = 10

const MAX_NAME_LENGTH = 80 // wie bei anderen Familiennamen
const USERNAME_RE = /^[A-Za-z0-9._-]{3,40}$/
const MIN_USER_PASSWORD_LENGTH = 8
const MAX_PASSWORD_BYTES = 72 // bcrypt kappt alles danach kommentarlos - lieber vorher ablehnen
const MAX_EMAIL_LENGTH = 120
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// Aktueller Zeitpunkt im selben Format wie sqlite datetime('now') - lexikographisch vergleichbar
function isoNow() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

// Nimmt ISO-Strings (oder ein Date) entgegen und normalisiert sie auf das sqlite-Format
// "YYYY-MM-DD HH:MM:SS" (UTC) - sonst vergleicht expires_at > datetime('now') Text, der nicht
// lexikographisch zu datetime('now') passt (z. B. das "T" und die Millisekunden eines ISO-Strings).
function toSqliteDatetime(value) {
  if (value === null || value === undefined) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw httpError(400, 'Ungültiges Datum')
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

// Gemeinsame Validierung für jedes neue oder geänderte Benutzer-Passwort (Einlösen, POST /users,
// /recover): mindestens MIN_USER_PASSWORD_LENGTH Zeichen, höchstens MAX_PASSWORD_BYTES Byte (UTF-8) -
// bcrypt selbst kappt bei 72 Byte kommentarlos, ein längeres Passwort wäre also teilweise wirkungslos.
function validatePassword(password) {
  if (typeof password !== 'string' || password.length < MIN_USER_PASSWORD_LENGTH) {
    throw httpError(400, `Das Passwort muss mindestens ${MIN_USER_PASSWORD_LENGTH} Zeichen haben`)
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    throw httpError(400, 'Das Passwort ist zu lang')
  }
}

function validateUsername(username) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    throw httpError(400, 'Benutzername: 3-40 Zeichen (Buchstaben, Ziffern, Punkt, Unterstrich, Bindestrich)')
  }
}

// undefined/null/'' -> kein Wunsch nach einer E-Mail, gibt null zurück; sonst geprüft und getrimmt.
function validateEmail(email) {
  if (email === undefined || email === null || email === '') return null
  const trimmed = typeof email === 'string' ? email.trim() : ''
  if (!trimmed || trimmed.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(trimmed)) {
    throw httpError(400, 'Die E-Mail-Adresse ist ungültig')
  }
  return trimmed
}

// Legt einen Stapel mit `size` frischen Codes an (eine Transaktion). Gibt die Klartext-Codes zurück -
// nur für Aufrufer, die sie sofort brauchen (Tests, Seed, Admin); danach ist nur noch code_cipher da.
function createBatch(db, { label, kind, size, issuedByFamilyId = null, joinFamilyId = null, partnerId = null, expiresAt = null }) {
  const sqliteExpiresAt = toSqliteDatetime(expiresAt)
  return db.transaction(() => {
    const batchId = db
      .prepare('INSERT INTO voucher_batches (label, kind, partner_id, size) VALUES (?, ?, ?, ?)')
      .run(label, kind, partnerId, size).lastInsertRowid

    const insertVoucher = db.prepare(
      `INSERT INTO vouchers (batch_id, code_hash, code_cipher, code_hint, partner_id, issued_by_family_id, join_family_id, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )

    const codes = []
    for (let i = 0; i < size; i += 1) {
      for (let attempt = 0; ; attempt += 1) {
        const code = generateCode()
        try {
          insertVoucher.run(
            batchId,
            hashCode(code),
            encryptCode(code),
            code.slice(-CODE_HINT_LENGTH),
            partnerId,
            issuedByFamilyId,
            joinFamilyId,
            sqliteExpiresAt
          )
          codes.push(code)
          break
        } catch (err) {
          if (attempt >= MAX_COLLISION_RETRIES || !String(err.message).includes('UNIQUE')) throw err
        }
      }
    }

    return { batchId, codes }
  })()
}

function voucherStatus(row) {
  if (row.revoked_at) return 'widerrufen'
  if (row.redeemed_at) return 'eingelöst'
  if (row.expires_at && row.expires_at <= isoNow()) return 'abgelaufen'
  return 'offen'
}

// household name required <=80; username/password: both or none; username 3-40 [A-Za-z0-9._-];
// password >=8; email optional <=120, simple format. Throws on any violation.
function validateRedeemInput({ name, username, password, email }) {
  const trimmedName = typeof name === 'string' ? name.trim() : ''
  if (!trimmedName) throw httpError(400, 'Wie heißt euer Zuhause?')
  if (trimmedName.length > MAX_NAME_LENGTH) {
    throw httpError(400, `Der Name darf höchstens ${MAX_NAME_LENGTH} Zeichen haben`)
  }

  const hasUsername = typeof username === 'string' && username !== ''
  const hasPassword = typeof password === 'string' && password !== ''
  if (hasUsername !== hasPassword) {
    throw httpError(400, 'Benutzername und Passwort gehören zusammen - beide angeben oder beide weglassen')
  }
  if (hasUsername) {
    validateUsername(username)
    validatePassword(password)
  }

  const cleanEmail = hasUsername ? validateEmail(email) : null

  return { trimmedName, hasUsername, cleanEmail }
}

// Löst einen Gutschein ein: legt "Meine Chronik" (art='zuhause') an, der Code wird gleich ihr Schlüssel.
// Läuft in EINER Transaktion - die UPDATE ... WHERE redeemed_at IS NULL-Guard macht doppeltes
// Einlösen unmöglich, auch bei zwei gleichzeitigen Anfragen. Gibt { familyId, code } zurück oder wirft
// einen Fehler mit .status (404/409/410/400).
function redeemVoucher(db, { code, name, username, password, email }) {
  const normalized = normalizeCode(code)
  if (!normalized) throw httpError(404, 'Diesen Gutschein kennen wir nicht')

  const { trimmedName, hasUsername, cleanEmail } = validateRedeemInput({ name, username, password, email })
  const codeHash = hashCode(normalized)

  const familyId = db.transaction(() => {
    const claim = db
      .prepare(
        `UPDATE vouchers SET redeemed_at = datetime('now'), code_cipher = NULL
         WHERE code_hash = ? AND redeemed_at IS NULL AND revoked_at IS NULL
           AND (expires_at IS NULL OR expires_at > datetime('now'))`
      )
      .run(codeHash)

    if (claim.changes !== 1) {
      const voucher = db.prepare('SELECT redeemed_at, revoked_at, expires_at FROM vouchers WHERE code_hash = ?').get(codeHash)
      if (!voucher) throw httpError(404, 'Diesen Gutschein kennen wir nicht')
      if (voucher.revoked_at) throw httpError(410, 'Dieser Gutschein wurde zurückgezogen')
      if (voucher.redeemed_at) throw httpError(410, 'Dieser Gutschein wurde schon eingelöst')
      throw httpError(410, 'Dieser Gutschein ist abgelaufen')
    }

    const voucher = db.prepare('SELECT id, join_family_id FROM vouchers WHERE code_hash = ?').get(codeHash)

    const newFamilyId = db
      .prepare(
        `INSERT INTO families (name, password_hash, art, theme, legacy_password, access_key_hash, voucher_id)
         VALUES (?, '!', 'zuhause', 'standard', 0, ?, ?)`
      )
      .run(trimmedName, codeHash, voucher.id).lastInsertRowid

    db.prepare('UPDATE vouchers SET redeemed_by_family_id = ? WHERE id = ?').run(newFamilyId, voucher.id)

    if (voucher.join_family_id) {
      const joinable = db.prepare("SELECT 1 FROM families WHERE id = ? AND art = 'rudel' AND is_demo = 0").get(voucher.join_family_id)
      if (joinable) {
        db.prepare('INSERT OR IGNORE INTO family_members (member_family_id, group_family_id) VALUES (?, ?)').run(
          newFamilyId,
          voucher.join_family_id
        )
      }
    }

    if (hasUsername) {
      const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS)
      try {
        db.prepare('INSERT INTO users (family_id, username, password_hash, email) VALUES (?, ?, ?, ?)').run(
          newFamilyId,
          username,
          passwordHash,
          cleanEmail
        )
      } catch (err) {
        if (String(err.message).includes('UNIQUE')) throw httpError(409, 'Benutzername ist vergeben')
        throw err
      }
    }

    return newFamilyId
  })()

  return { familyId, code: normalized }
}

module.exports = {
  createBatch,
  voucherStatus,
  redeemVoucher,
  validatePassword,
  validateUsername,
  validateEmail,
  USERNAME_RE,
  MIN_USER_PASSWORD_LENGTH,
  MAX_PASSWORD_BYTES
}
