'use strict'

// Partner-Zugang per Gutschein (Phase P Task 2): der Betreiber gibt Partner-Zugang-Gutscheine
// (voucher_batches.zweck = 'partnerzugang') von Hand aus. Wer einen unter /v#CODE einlöst, richtet sein
// Partnerprofil selbst ein (Name, Typ, PLZ): es entsteht ein Partner im Status 'entwurf' (öffentlich
// wird er erst, wenn der Admin ihn aktiviert) und sein Bereich, dessen Schlüssel der Code wird - wie bei
// "Meine Chronik". Ein an einen bestehenden Partner gebundener Zugang (vouchers.partner_id) legt nur
// noch dessen Bereich an. Codes landen nie in Logs.

const { normalizeCode, hashCode } = require('./codes')
const { validatePartner, validateTyp, SLUG_MAX_LENGTH } = require('./partners')
const { cleanId } = require('./validate')
const { findPartnerArea, insertPartnerArea, areaLabel } = require('./partnerAreas')
const {
  ZWECK,
  validateLoginInput,
  findVoucherByHash,
  assertVoucherOpen,
  claimOpenVoucher,
  markRedeemedBy,
  insertAreaUser
} = require('./vouchers')

const MAX_SLUG_SUFFIX = 99
const BLOCKED_PARTNER_MESSAGE = 'Dieser Partner-Zugang kann gerade nicht eingelöst werden – bitte meldet euch beim Betreiber.'

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

function isGiven(value) {
  return value !== undefined && value !== null && value !== ''
}

// --- Admin: Partner-Zugang-Stapel (routes/admin.js POST /voucher-batches) ------------------------

// Ein bindbarer Partner ist echt (keine Demo) und hat noch keinen Bereich (404 bzw. 409).
function findBindablePartner(db, partnerId) {
  const id = cleanId(partnerId)
  const partner = id ? db.prepare('SELECT id, typ FROM partners WHERE id = ? AND is_demo = 0').get(id) : null
  if (!partner) throw httpError(404, 'Diesen Partner gibt es nicht')
  const area = findPartnerArea(db, partner.id)
  if (area) throw httpError(409, `Für diesen Partner gibt es schon einen ${areaLabel(area.art)}`)
  return partner
}

// createBatch-Optionen für einen Partner-Zugang-Stapel; kind bleibt 'admin'. partnerTyp: optionale
// Typ-Vorgabe für den neuen Partner. partnerId: bindet den (einzigen) Gutschein an einen bestehenden
// Partner - dessen Typ gilt dann, eine abweichende Vorgabe ist ein Widerspruch (400).
function partnerAccessBatchOptions(db, { size, partnerTyp, partnerId, joinFamilyId }) {
  if (isGiven(joinFamilyId)) throw httpError(400, 'Ein Partner-Zugang tritt keinem Rudel bei')
  const cleanTyp = isGiven(partnerTyp) ? validateTyp(partnerTyp) : null
  const options = { kind: 'admin', zweck: ZWECK.partnerzugang, partnerTyp: cleanTyp, partnerId: null }
  if (!isGiven(partnerId)) return options

  if (size !== 1) throw httpError(400, 'Einen Partner-Zugang für einen bestehenden Partner gibt es nur einzeln (Anzahl 1)')
  const partner = findBindablePartner(db, partnerId)
  if (cleanTyp && cleanTyp !== partner.typ) throw httpError(400, `Der Typ passt nicht zu diesem Partner („${partner.typ}“)`)
  return { ...options, partnerId: partner.id }
}

// --- POST /vouchers/check ------------------------------------------------------------------------

function isPartnerAccessCode(db, code) {
  const normalized = normalizeCode(code)
  if (!normalized) return false
  return findVoucherByHash(db, hashCode(normalized))?.zweck === ZWECK.partnerzugang
}

// Zusatz-Infos zu einem offenen Partner-Zugang - nie Codes oder IDs: bei einem gebundenen Zugang Name
// und Typ des Partners, sonst die Typ-Vorgabe des Stapels (falls gesetzt).
function partnerAccessCheckInfo(db, voucher) {
  const info = { zweck: ZWECK.partnerzugang }
  if (voucher.partner_id) {
    const partner = db.prepare('SELECT name, typ FROM partners WHERE id = ?').get(voucher.partner_id)
    return partner ? { ...info, partnerTyp: partner.typ, partnerName: partner.name } : info
  }
  return voucher.partner_typ ? { ...info, partnerTyp: voucher.partner_typ } : info
}

// --- POST /vouchers/redeem -----------------------------------------------------------------------

// Verteidigungslinie für Rohdaten: createBatch lässt einen Partner-Zugang nie mit Rudel, Übergabe oder
// ausgebendem Bereich entstehen - kommt so einer trotzdem vor, wird er nicht eingelöst.
function assertPartnerAccessVoucher(voucher) {
  if (voucher.zweck !== ZWECK.partnerzugang) throw httpError(400, 'Das ist kein Partner-Zugang')
  if (voucher.dog_id || voucher.join_family_id || voucher.issued_by_family_id) {
    throw httpError(410, 'Dieser Partner-Zugang gilt nicht')
  }
}

// Gebundener Zugang, in der Einlöse-Transaktion erneut geprüft (security-review Phase P Task 2): der
// Partner muss noch da sein, darf weder gesperrt noch (inzwischen) ein Demo-Partner sein und keinen
// Bereich bekommen haben. Der Status selbst (entwurf, aktiv, pausiert) spielt keine Rolle.
function boundPartnerForRedeem(db, partnerId) {
  const partner = db.prepare('SELECT * FROM partners WHERE id = ?').get(partnerId)
  if (!partner) throw httpError(410, 'Dieser Partner-Zugang gilt nicht mehr')
  if (partner.is_demo || partner.gesperrt) throw httpError(409, BLOCKED_PARTNER_MESSAGE)
  const area = findPartnerArea(db, partner.id)
  if (area) throw httpError(409, `Für diesen Partner gibt es schon einen ${areaLabel(area.art)}`)
  return partner
}

// Neuer Partner aus Name/Typ/PLZ - dieselben Regeln wie beim Anlegen durch den Admin (lib/partners.js
// validatePartner: Namenslänge, Kurzname, Züchter-Sperre, PLZ-Nachschlag samt ort/lat/lon), aber nur
// mit diesen drei Feldern: Status, Sichtbarkeit, Links usw. setzt weiterhin nur der Admin. Die PLZ ist
// hier Pflicht.
function validateNewPartner({ name, typ, plz }) {
  if (typeof plz !== 'string' || !plz.trim()) throw httpError(400, 'Die Postleitzahl ist Pflicht')
  const clean = validatePartner({ name, typ, plz })
  return { ...clean, status: 'entwurf', ist_partner: 1, gesperrt: 0, is_demo: 0 }
}

// Kurzname aus dem Namen (validatePartner), bei Kollision mit -2, -3, ... eindeutig gemacht. Läuft in
// der Einlöse-Transaktion - der UNIQUE-Index auf partners.slug bleibt die letzte Absicherung.
function freePartnerSlug(db, slug) {
  const taken = db.prepare('SELECT 1 FROM partners WHERE slug = ?')
  if (!taken.get(slug)) return slug
  for (let n = 2; n <= MAX_SLUG_SUFFIX; n += 1) {
    const suffix = `-${n}`
    const candidate = `${slug.slice(0, SLUG_MAX_LENGTH - suffix.length).replace(/-+$/, '')}${suffix}`
    if (!taken.get(candidate)) return candidate
  }
  throw httpError(409, 'Diesen Namen gibt es schon zu oft – bitte einen unterscheidbaren Namen wählen')
}

function insertNewPartner(db, clean) {
  const row = { ...clean, slug: freePartnerSlug(db, clean.slug) }
  const columns = Object.keys(row)
  const id = db
    .prepare(`INSERT INTO partners (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
    .run(...columns.map((column) => row[column])).lastInsertRowid
  return db.prepare('SELECT * FROM partners WHERE id = ?').get(id)
}

// Löst einen Partner-Zugang ein - in EINER Transaktion mit derselben Prüfen-vor-Verbrauchen-Reihenfolge
// und derselben UPDATE ... WHERE redeemed_at IS NULL-Guard wie lib/vouchers.js redeemVoucher: scheitert
// irgendetwas (Name, Typ, PLZ, Benutzername, Bereich schon vorhanden), bleibt der Gutschein offen und
// nichts ist angelegt. name/typ/plz zählen nur bei einem ungebundenen Zugang, und die Typ-Vorgabe des
// Stapels schlägt typ. Gibt { familyId, code } zurück wie redeemVoucher.
function redeemPartnerAccess(db, { code, name, typ, plz, username, password, email }) {
  const normalized = normalizeCode(code)
  if (!normalized) throw httpError(404, 'Diesen Gutschein kennen wir nicht')
  const login = validateLoginInput({ username, password, email })
  const codeHash = hashCode(normalized)

  const familyId = db.transaction(() => {
    const voucher = findVoucherByHash(db, codeHash)
    assertVoucherOpen(voucher)
    assertPartnerAccessVoucher(voucher)
    const boundPartner = voucher.partner_id ? boundPartnerForRedeem(db, voucher.partner_id) : null
    const newPartner = boundPartner ? null : validateNewPartner({ name, typ: voucher.partner_typ || typ, plz })

    claimOpenVoucher(db, codeHash)

    const partner = boundPartner || insertNewPartner(db, newPartner)
    const area = insertPartnerArea(db, { partner, accessKeyHash: codeHash, voucherId: voucher.id })
    markRedeemedBy(db, voucher.id, area.familyId)
    if (login.hasUsername) insertAreaUser(db, area.familyId, { username, password, cleanEmail: login.cleanEmail })
    return area.familyId
  })()

  return { familyId, code: normalized }
}

module.exports = { partnerAccessBatchOptions, isPartnerAccessCode, partnerAccessCheckInfo, redeemPartnerAccess }
