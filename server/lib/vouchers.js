const bcrypt = require('bcryptjs')
const { generateCode, normalizeCode, hashCode, encryptCode } = require('./codes')
const { voucherQuota } = require('../config')
const { transferDog } = require('./transfers')
const { PARTNER_AREA_ARTS } = require('./context')
const { isRole, DEFAULT_ROLE } = require('./roles')

const CODE_HINT_LENGTH = 4
const MAX_COLLISION_RETRIES = 5 // 60 Bit Zufall - eine Kollision ist praktisch ausgeschlossen
const BCRYPT_ROUNDS = 10

const MAX_NAME_LENGTH = 80 // wie bei anderen Familiennamen
const USERNAME_RE = /^[A-Za-z0-9._-]{3,40}$/
const MIN_USER_PASSWORD_LENGTH = 8
const MAX_PASSWORD_BYTES = 72 // bcrypt kappt alles danach kommentarlos - lieber vorher ablehnen
const MAX_EMAIL_LENGTH = 120
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const MAX_BATCH_LABEL_LENGTH = 80
const MIN_BATCH_SIZE = 1
const MAX_BATCH_SIZE = 200

// Wofür ein Gutschein-Stapel da ist (voucher_batches.zweck, Phase P Task 2): 'chronik' legt beim
// Einlösen "Meine Chronik" an (bisheriges Verhalten), 'partnerzugang' lässt einen Partner sein Profil
// und seinen Bereich selbst einrichten (siehe lib/partnerAccess.js).
const ZWECK = { chronik: 'chronik', partnerzugang: 'partnerzugang' }
const ZWECK_VALUES = Object.values(ZWECK)

// Phase R Task 3: Stapel-Art der Schein-Einladung der Demo-Familie (lib/demoMembers.js). Ein Gutschein aus
// so einem Stapel gilt in /check als unbekannt und lässt sich nie einlösen (assertVoucherOpen) - er ist nur
// da, damit die Mitglieder-Seite der Demo eine offene Einladung mit Rolle zeigen kann.
const DEMO_BATCH_KIND = 'demo'
const PARTNER_ACCESS_NO_CHRONIK_MESSAGE = 'Dieser Gutschein ist ein Partner-Zugang – er legt keine Chronik an'
const PARTNER_ACCESS_CLAIM_MESSAGE = 'Dieser Gutschein ist ein Partner-Zugang – bitte über „Gutschein einlösen“ einrichten.'

// Feste Schein-Liste für GET /vouchers/mine in der Demo: sieht aus wie echte Gutscheine, lässt sich
// aber nicht einlösen. Jeder Klartext-Code enthält ein "U" - das kommt im Crockford-Alphabet nicht vor
// (siehe lib/codes.js), normalizeCode lehnt die Codes also zuverlässig ab (siehe test/vouchersMine.test.js).
const DEMO_VOUCHERS = [
  { id: 'demo-1', code: 'DEMU-0000-000A', hint: '000A', status: 'offen', joins: true, redeemed_at: null, created_at: '2026-01-03 10:00:00' },
  {
    id: 'demo-2',
    code: null,
    hint: '000B',
    status: 'eingelöst',
    joins: true,
    redeemed_at: '2026-01-02 09:00:00',
    created_at: '2026-01-02 08:00:00'
  },
  { id: 'demo-3', code: null, hint: '000C', status: 'widerrufen', joins: false, redeemed_at: null, created_at: '2026-01-01 08:00:00' }
]

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// security-review Phase T Finding 7: shelterMayRead (redeem/claim) und storyConsent (routes/dogs.js
// PUT /:id/shelter-share) müssen echte Booleans sein - sonst würde z. B. der String "false" (truthy!)
// stillschweigend eine Mitlese-Freigabe erteilen. Fehlt der Wert ganz, gilt "nicht gewünscht" (false).
function cleanBooleanFlag(value, label) {
  if (value === undefined || value === null) return false
  if (typeof value !== 'boolean') throw httpError(400, `„${label}“ muss true oder false sein`)
  return value
}

const HANDOVER_GONE_MESSAGE = 'Dieser Übergabe-Gutschein gilt nicht mehr'

// security-review Phase T Finding 3: ein Übergabe-Gutschein (vouchers.dog_id gesetzt) darf sich nur
// einlösen lassen, solange die Übergabe, für die er ausgestellt wurde, noch genauso ansteht: das Tier
// existiert noch, gehört noch demselben Tierheim, das ihn ausgestellt hat (issued_by_family_id), dieses
// Tierheim ist noch ein echter (nicht-Demo) Tierheim-Bereich, und das Tier steht noch auf "reserviert"
// (nicht z. B. per DELETE /:id/handover storniert oder anderweitig verändert). Sonst 410, OHNE den
// Gutschein zu verbrauchen - der Aufruf passiert bewusst VOR der verbrauchenden UPDATE weiter unten.
function assertHandoverStillRedeemable(db, voucher) {
  if (!voucher.dog_id) return
  const dog = db.prepare('SELECT family_id, vermittlung_status FROM dogs WHERE id = ?').get(voucher.dog_id)
  if (!dog || dog.family_id !== voucher.issued_by_family_id) throw httpError(410, HANDOVER_GONE_MESSAGE)
  const owner = db.prepare('SELECT art, is_demo FROM families WHERE id = ?').get(dog.family_id)
  if (!owner || owner.art !== 'tierheim' || owner.is_demo) throw httpError(410, HANDOVER_GONE_MESSAGE)
  if (dog.vermittlung_status !== 'reserviert') throw httpError(410, HANDOVER_GONE_MESSAGE)
}

// Aktueller Zeitpunkt im selben Format wie sqlite datetime('now') - lexikographisch vergleichbar
function isoNow() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

// Heutiges Datum im Format YYYY-MM-DD (wie dogs.bei_uns_seit) - für lib/transfers.js transferDog.
function isoToday() {
  return new Date().toISOString().slice(0, 10)
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

// Ein Partner-Zugang ist nie zugleich Einladung (join_family_id), Übergabe (dog_id) oder Weitergabe-
// Gutschein eines Bereichs (issued_by_family_id) - so zählt er auch nie zum Kontingent in
// ensureVoucherQuota. Programmierfehler statt Nutzereingabe: routes/admin.js prüft das vorher mit 400.
function assertBatchPurpose({ zweck, issuedByFamilyId, joinFamilyId, dogId }) {
  if (!ZWECK_VALUES.includes(zweck)) throw new Error(`Unbekannter Gutschein-Zweck: ${zweck}`)
  if (zweck === ZWECK.partnerzugang && (issuedByFamilyId || joinFamilyId || dogId)) {
    throw new Error('Ein Partner-Zugang trägt weder Rudel, Übergabe noch ausgebenden Bereich')
  }
}

// Legt einen Stapel mit `size` frischen Codes an (eine Transaktion). Gibt die Klartext-Codes zurück -
// nur für Aufrufer, die sie sofort brauchen (Tests, Seed, Admin); danach ist nur noch code_cipher da.
// dogId (Phase T Task 3): macht daraus einen Übergabe-Gutschein (siehe routes/dogs.js POST
// /:id/handover) - nur für size=1 sinnvoll, aber hier nicht extra geprüft (der Aufrufer entscheidet).
// zweck/partnerTyp (Phase P Task 2): siehe ZWECK; partnerTyp ist die optionale Typ-Vorgabe eines
// Partner-Zugangs, partnerId bindet einen Partner-Zugang an einen bestehenden Partner.
// joinRolle (Phase R Task 2): Rolle, die eine Einladung (joinFamilyId) beim Einlösen vergibt - null heißt
// 'mitglied'. Eine unbekannte Rolle ist ein Programmierfehler (die Routen prüfen Nutzereingaben vorher).
function createBatch(
  db,
  {
    label,
    kind,
    size,
    issuedByFamilyId = null,
    joinFamilyId = null,
    joinRolle = null,
    partnerId = null,
    expiresAt = null,
    dogId = null,
    zweck = ZWECK.chronik,
    partnerTyp = null
  }
) {
  assertBatchPurpose({ zweck, issuedByFamilyId, joinFamilyId, dogId })
  if (joinRolle !== null && !isRole(joinRolle)) throw new Error(`Unbekannte Einladungs-Rolle: ${joinRolle}`)
  const sqliteExpiresAt = toSqliteDatetime(expiresAt)
  return db.transaction(() => {
    const batchId = db
      .prepare('INSERT INTO voucher_batches (label, kind, partner_id, size, zweck, partner_typ) VALUES (?, ?, ?, ?, ?, ?)')
      .run(label, kind, partnerId, size, zweck, partnerTyp).lastInsertRowid

    const insertVoucher = db.prepare(
      `INSERT INTO vouchers (batch_id, code_hash, code_cipher, code_hint, partner_id, issued_by_family_id, join_family_id, join_rolle, expires_at, dog_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
            joinRolle,
            sqliteExpiresAt,
            dogId
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

// Höchstens ein offener Übergabe-Gutschein pro Tier (routes/dogs.js POST /:id/handover): zieht alle
// noch offenen (weder eingelöst noch schon widerrufen) Übergabe-Gutscheine dieses Tiers zurück, bevor
// ein neuer entsteht - wie routes/admin.js POST /vouchers/:id/revoke, nur gleich für alle passenden.
function revokeOpenHandoverVouchers(db, dogId) {
  db.prepare(
    `UPDATE vouchers SET revoked_at = datetime('now'), code_cipher = NULL
     WHERE dog_id = ? AND redeemed_at IS NULL AND revoked_at IS NULL`
  ).run(dogId)
}

// Phase R Task 2: Einladungen einer Familie (join_family_id) zurückziehen - eine bestimmte (voucherId, routes/
// members.js DELETE /einladungen/:voucherId) oder alle noch offenen (ohne voucherId, beim Auflösen). Zählt
// auch abgelaufene, aber noch nicht widerrufene mit (schadet nicht, räumt auf). Gibt die Anzahl zurück.
function revokeOpenInvites(db, familyId, voucherId = null) {
  return db
    .prepare(
      `UPDATE vouchers SET revoked_at = datetime('now'), code_cipher = NULL
       WHERE join_family_id = @familyId AND dog_id IS NULL AND redeemed_at IS NULL AND revoked_at IS NULL
         AND (@voucherId IS NULL OR id = @voucherId)`
    )
    .run({ familyId, voucherId }).changes
}

// Rolle, die eine Einladung vergibt: join_rolle, sonst (NULL oder ein unbekannter Wert) 'mitglied'.
function inviteRoleOf(row) {
  return isRole(row.join_rolle) ? row.join_rolle : DEFAULT_ROLE
}

// Eingaben für einen Admin-Gutschein-Stapel (POST /admin/voucher-batches): Bezeichnung Pflicht
// (<=80 Zeichen), Anzahl ein echter Integer zwischen MIN_BATCH_SIZE und MAX_BATCH_SIZE (kein
// Number(...)-Koerzieren einer Zahl-als-Text, siehe die strikte Prüfung in routes/auth.js /view).
function validateBatchInput({ label, size }) {
  const trimmedLabel = typeof label === 'string' ? label.trim() : ''
  if (!trimmedLabel || trimmedLabel.length > MAX_BATCH_LABEL_LENGTH) {
    throw httpError(400, `Die Bezeichnung ist Pflicht (höchstens ${MAX_BATCH_LABEL_LENGTH} Zeichen)`)
  }
  if (!Number.isInteger(size) || size < MIN_BATCH_SIZE || size > MAX_BATCH_SIZE) {
    throw httpError(400, `Die Anzahl muss zwischen ${MIN_BATCH_SIZE} und ${MAX_BATCH_SIZE} liegen`)
  }
  return trimmedLabel
}

// Fehlt zweck, bleibt es beim bisherigen Chronik-Stapel.
function validateZweck(value) {
  if (value === undefined || value === null || value === '') return ZWECK.chronik
  if (!ZWECK_VALUES.includes(value)) throw httpError(400, `Zweck muss einer von ${ZWECK_VALUES.join(', ')} sein`)
  return value
}

function voucherStatus(row) {
  if (row.revoked_at) return 'widerrufen'
  if (row.redeemed_at) return 'eingelöst'
  if (row.expires_at && row.expires_at <= isoNow()) return 'abgelaufen'
  return 'offen'
}

// Optionaler eigener Benutzer-Login beim Einlösen (Chronik wie Partner-Zugang): username/password
// beide oder keins; username 3-40 [A-Za-z0-9._-]; password >=8; email optional <=120, einfaches Format.
function validateLoginInput({ username, password, email }) {
  const hasUsername = typeof username === 'string' && username !== ''
  const hasPassword = typeof password === 'string' && password !== ''
  if (hasUsername !== hasPassword) {
    throw httpError(400, 'Benutzername und Passwort gehören zusammen - beide angeben oder beide weglassen')
  }
  if (hasUsername) {
    validateUsername(username)
    validatePassword(password)
  }
  return { hasUsername, cleanEmail: hasUsername ? validateEmail(email) : null }
}

// household name required <=80, dazu validateLoginInput. Throws on any violation.
function validateRedeemInput({ name, username, password, email }) {
  const trimmedName = typeof name === 'string' ? name.trim() : ''
  if (!trimmedName) throw httpError(400, 'Wie heißt euer Zuhause?')
  if (trimmedName.length > MAX_NAME_LENGTH) {
    throw httpError(400, `Der Name darf höchstens ${MAX_NAME_LENGTH} Zeichen haben`)
  }
  return { trimmedName, ...validateLoginInput({ username, password, email }) }
}

// Gutschein samt Zweck/Typ-Vorgabe/Art seines Stapels - für /check, /redeem und /claim.
function findVoucherByHash(db, codeHash) {
  return db
    .prepare(
      `SELECT v.id, v.join_family_id, v.join_rolle, v.partner_id, v.dog_id, v.issued_by_family_id, v.redeemed_at, v.revoked_at,
         v.expires_at, b.zweck, b.partner_typ, b.kind
       FROM vouchers v JOIN voucher_batches b ON b.id = v.batch_id WHERE v.code_hash = ?`
    )
    .get(codeHash)
}

// Die Schein-Einladung der Demo (DEMO_BATCH_KIND) ist nach außen ein unbekannter Gutschein.
function isDemoVoucher(voucher) {
  return voucher?.kind === DEMO_BATCH_KIND
}

// 404/410 für unbekannte (auch Demo-), zurückgezogene, schon eingelöste oder abgelaufene Gutscheine.
function assertVoucherOpen(voucher) {
  if (!voucher || isDemoVoucher(voucher)) throw httpError(404, 'Diesen Gutschein kennen wir nicht')
  if (voucher.revoked_at) throw httpError(410, 'Dieser Gutschein wurde zurückgezogen')
  if (voucher.redeemed_at) throw httpError(410, 'Dieser Gutschein wurde schon eingelöst')
  if (voucher.expires_at && voucher.expires_at <= isoNow()) throw httpError(410, 'Dieser Gutschein ist abgelaufen')
}

// Verbraucht den Gutschein atomar (UPDATE ... WHERE redeemed_at IS NULL) - nur innerhalb der
// Einlöse-Transaktion aufrufen, nachdem die Eingaben geprüft sind. Scheitert danach noch etwas (z. B. ein
// vergebener Benutzername), rollt die Transaktion das Verbrauchen mit zurück.
function claimOpenVoucher(db, codeHash) {
  const claim = db
    .prepare(
      `UPDATE vouchers SET redeemed_at = datetime('now'), code_cipher = NULL
       WHERE code_hash = ? AND redeemed_at IS NULL AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > datetime('now'))`
    )
    .run(codeHash)
  // Nur als Verteidigungslinie gegen eine gleichzeitige zweite Anfrage zwischen der Prüfung und
  // dieser UPDATE - der Normalfall (kein Wettlauf) hat claim.changes immer schon 1.
  if (claim.changes !== 1) throw httpError(410, 'Dieser Gutschein wurde inzwischen verändert')
}

function markRedeemedBy(db, voucherId, familyId) {
  db.prepare('UPDATE vouchers SET redeemed_by_family_id = ? WHERE id = ?').run(familyId, voucherId)
}

// Legt den optionalen Benutzer-Login für einen frisch eingelösten Bereich an (409 bei vergebenem Namen).
function insertAreaUser(db, familyId, { username, password, cleanEmail }) {
  const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS)
  try {
    db.prepare('INSERT INTO users (family_id, username, password_hash, email) VALUES (?, ?, ?, ?)').run(
      familyId,
      username,
      passwordHash,
      cleanEmail
    )
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) throw httpError(409, 'Benutzername ist vergeben')
    throw err
  }
}

// Löst einen Gutschein ein: legt "Meine Chronik" (art='zuhause') an, der Code wird gleich ihr Schlüssel.
// Läuft in EINER Transaktion - die UPDATE ... WHERE redeemed_at IS NULL-Guard macht doppeltes
// Einlösen unmöglich, auch bei zwei gleichzeitigen Anfragen. Gibt { familyId, code } zurück oder wirft
// einen Fehler mit .status (404/409/410/400). shelterMayRead (Phase T Task 3, optional): trägt der
// Gutschein eine dog_id (Übergabe-Gutschein), zieht das Tier nach dem Anlegen des Zuhauses gleich mit
// um (lib/transfers.js transferDog); mit shelterMayRead=true darf das abgebende Tierheim direkt
// mitlesen (dog_shares mit story_consent=0 - die Einwilligung selbst kommt separat, siehe
// routes/dogs.js PUT /:id/shelter-share).
function redeemVoucher(db, { code, name, username, password, email, shelterMayRead }) {
  const normalized = normalizeCode(code)
  if (!normalized) throw httpError(404, 'Diesen Gutschein kennen wir nicht')

  const { trimmedName, hasUsername, cleanEmail } = validateRedeemInput({ name, username, password, email })
  const cleanShelterMayRead = cleanBooleanFlag(shelterMayRead, 'shelterMayRead')
  const codeHash = hashCode(normalized)

  const familyId = db.transaction(() => {
    // security-review Phase T Finding 3: erst prüfen (Gutschein selbst UND - bei einem Übergabe-
    // Gutschein - die Übergabe dahinter), dann verbrauchen. So bleibt ein Gutschein unangetastet
    // (redeemed_at weiterhin NULL), wenn die Übergabe inzwischen nicht mehr passt.
    const voucher = findVoucherByHash(db, codeHash)
    assertVoucherOpen(voucher)
    // Phase P Task 2: ein Partner-Zugang läuft über lib/partnerAccess.js (routes/vouchers.js verzweigt
    // dorthin) - hier entsteht daraus nie ein Zuhause.
    if (voucher.zweck !== ZWECK.chronik) throw httpError(400, PARTNER_ACCESS_NO_CHRONIK_MESSAGE)
    assertHandoverStillRedeemable(db, voucher)

    claimOpenVoucher(db, codeHash)

    const newFamilyId = db
      .prepare(
        `INSERT INTO families (name, password_hash, art, theme, legacy_password, access_key_hash, voucher_id, partner_id)
         VALUES (?, '!', 'zuhause', 'standard', 0, ?, ?, ?)`
      )
      .run(trimmedName, codeHash, voucher.id, voucher.partner_id).lastInsertRowid

    markRedeemedBy(db, voucher.id, newFamilyId)

    if (voucher.dog_id) {
      // assertHandoverStillRedeemable hat die Existenz des Tiers bereits bestätigt.
      const dog = db.prepare('SELECT family_id FROM dogs WHERE id = ?').get(voucher.dog_id)
      transferDog(db, {
        dogId: voucher.dog_id,
        fromFamilyId: dog.family_id,
        toFamilyId: newFamilyId,
        voucherId: voucher.id,
        today: isoToday()
      })
      if (cleanShelterMayRead) {
        db.prepare('INSERT INTO dog_shares (dog_id, family_id, story_consent) VALUES (?, ?, 0)').run(voucher.dog_id, dog.family_id)
      }
    }

    // Phase R Task 2: die Einladung bringt ihre Rolle mit (join_rolle, gesetzt über routes/vouchers.js
    // PUT /:id/rolle) - ohne Angabe wird das neue Zuhause 'mitglied'.
    if (voucher.join_family_id) {
      const joinable = db.prepare("SELECT 1 FROM families WHERE id = ? AND art = 'rudel' AND is_demo = 0").get(voucher.join_family_id)
      if (joinable) {
        db.prepare('INSERT OR IGNORE INTO family_members (member_family_id, group_family_id, rolle) VALUES (?, ?, ?)').run(
          newFamilyId,
          voucher.join_family_id,
          inviteRoleOf(voucher)
        )
      }
    }

    if (hasUsername) insertAreaUser(db, newFamilyId, { username, password, cleanEmail })

    return newFamilyId
  })()

  return { familyId, code: normalized }
}

// Löst einen Übergabe-Gutschein OHNE ein neues Zuhause anzulegen ein: POST /vouchers/claim, nur aus
// dem eigenen Zuhause heraus (siehe routes/vouchers.js). Atomar wie redeemVoucher (dieselbe
// UPDATE ... WHERE redeemed_at IS NULL-Guard). dog_id wird VOR dem atomaren Einlösen gelesen (ein
// unbedenklicher, separater Read: dog_id ändert sich nie nach dem Anlegen eines Gutscheins, siehe
// createBatch) - ein Gutschein ohne dog_id ist kein Übergabe-Gutschein und bleibt dabei unangetastet
// (kein verbrannter Weitergabe-/Partner-Gutschein durch einen falschen claim-Versuch).
function claimVoucher(db, { code, familyId, shelterMayRead }) {
  const normalized = normalizeCode(code)
  if (!normalized) throw httpError(404, 'Diesen Gutschein kennen wir nicht')
  const cleanShelterMayRead = cleanBooleanFlag(shelterMayRead, 'shelterMayRead')
  const codeHash = hashCode(normalized)

  return db.transaction(() => {
    // security-review Phase T Finding 3: dieselbe Prüfen-vor-Verbrauchen-Reihenfolge wie redeemVoucher,
    // und derselbe Fix für den 500er: assertHandoverStillRedeemable bestätigt vorher, dass das Tier noch
    // existiert - db.prepare(...).get(voucher.dog_id) unten kann also nicht mehr undefined liefern.
    // Erst "geschlossen?" (zurückgezogen, eingelöst, abgelaufen - wie assertVoucherOpen), dann die Art:
    // ein geschlossener Code verrät so nicht, ob er ein Partner-Zugang war (security-review Phase P Task 2).
    const voucherRow = findVoucherByHash(db, codeHash)
    assertVoucherOpen(voucherRow)
    // Phase P Task 2: ein Partner-Zugang wird nie "nebenbei" aus einem Zuhause heraus verbraucht.
    if (voucherRow.zweck === ZWECK.partnerzugang) throw httpError(400, PARTNER_ACCESS_CLAIM_MESSAGE)
    if (!voucherRow.dog_id) throw httpError(400, 'Das ist kein Übergabe-Gutschein – zum Einlösen bitte abmelden.')
    assertHandoverStillRedeemable(db, voucherRow)

    const claim = db
      .prepare(
        `UPDATE vouchers SET redeemed_at = datetime('now'), code_cipher = NULL, redeemed_by_family_id = @familyId
         WHERE code_hash = @codeHash AND redeemed_at IS NULL AND revoked_at IS NULL
           AND (expires_at IS NULL OR expires_at > datetime('now'))`
      )
      .run({ familyId, codeHash })
    if (claim.changes !== 1) throw httpError(410, 'Dieser Gutschein wurde inzwischen verändert')

    const voucher = voucherRow
    const dog = db.prepare('SELECT family_id FROM dogs WHERE id = ?').get(voucher.dog_id)

    transferDog(db, {
      dogId: voucher.dog_id,
      fromFamilyId: dog.family_id,
      toFamilyId: familyId,
      voucherId: voucher.id,
      today: isoToday()
    })
    if (cleanShelterMayRead) {
      db.prepare('INSERT INTO dog_shares (dog_id, family_id, story_consent) VALUES (?, ?, 0)').run(voucher.dog_id, dog.family_id)
    }

    return { dogId: voucher.dog_id }
  })()
}

// Partner, dem die Weitergabe-Gutscheine eines Bereichs zugerechnet werden (Phase P): nur ein Partner-
// oder Tierheim-Bereich (PARTNER_AREA_ARTS) gehört zu einem Partner - ein Zuhause trägt families.partner_id
// bloß als Herkunft ("kam über Partner X") und gibt sie NICHT an seine eigenen Gutscheine weiter.
function issuingPartnerId(db, area) {
  if (!PARTNER_AREA_ARTS.includes(area.art)) return null
  const row = db.prepare('SELECT partner_id FROM families WHERE id = ?').get(area.id)
  return row?.partner_id ?? null
}

// Legt für einen Bereich (Rudel, Zuhause, Tierheim oder Partner) so viele Weitergabe-Gutscheine an, wie
// zum Kontingent (config.voucherQuota) fehlen - GET /vouchers/mine ruft das bei jedem Aufruf auf. Offene
// UND schon eingelöste eigene Gutscheine zählen mit, nur zurückgezogene/abgelaufene nicht - sonst würde
// sich das Kontingent bei jedem Aufruf immer weiter auffüllen, obwohl längst genug im Umlauf sind.
// Partner geben so Kunden-Gutscheine an ihre Kundschaft weiter: die Gutscheine eines Partner-/Tierheim-
// Bereichs tragen dessen partner_id, das eingelöste Zuhause damit (wie bei Admin-Partner-Stapeln, siehe
// redeemVoucher) families.partner_id als Herkunft.
function ensureVoucherQuota(db, area) {
  // security-review Phase T Finding 4: Übergabe-Gutscheine (dog_id gesetzt) sind keine Weitergabe-
  // Einladungen und dürfen weder mitgezählt noch als solche aufgefüllt werden. Partner-Zugänge (Phase P
  // Task 2) tragen nie issued_by_family_id (assertBatchPurpose) und zählen damit ebenfalls nie mit.
  const { c: counted } = db
    .prepare(
      `SELECT COUNT(*) AS c FROM vouchers
       WHERE issued_by_family_id = ? AND revoked_at IS NULL AND dog_id IS NULL
         AND (redeemed_at IS NOT NULL OR expires_at IS NULL OR expires_at > datetime('now'))`
    )
    .get(area.id)
  const missing = voucherQuota - counted
  if (missing <= 0) return
  createBatch(db, {
    label: `Weitergabe ${area.name}`,
    kind: 'rudel',
    size: missing,
    issuedByFamilyId: area.id,
    joinFamilyId: area.art === 'rudel' ? area.id : null,
    partnerId: issuingPartnerId(db, area)
  })
}

module.exports = {
  createBatch,
  revokeOpenHandoverVouchers,
  revokeOpenInvites,
  inviteRoleOf,
  isDemoVoucher,
  DEMO_BATCH_KIND,
  voucherStatus,
  redeemVoucher,
  claimVoucher,
  ensureVoucherQuota,
  validateBatchInput,
  validateZweck,
  validateLoginInput,
  findVoucherByHash,
  assertVoucherOpen,
  claimOpenVoucher,
  markRedeemedBy,
  insertAreaUser,
  ZWECK,
  cleanBooleanFlag,
  HANDOVER_GONE_MESSAGE,
  DEMO_VOUCHERS,
  validatePassword,
  validateUsername,
  validateEmail,
  USERNAME_RE,
  MIN_USER_PASSWORD_LENGTH,
  MAX_PASSWORD_BYTES,
  MAX_BATCH_LABEL_LENGTH,
  MIN_BATCH_SIZE,
  MAX_BATCH_SIZE
}
