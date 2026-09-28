const express = require('express')
const db = require('../db')
const { codeLimiter, rejectHoneypot } = require('../middleware/abuse')
const { requireAuth, setSessionCookie } = require('../middleware/auth')
const { ART, buildMe } = require('../lib/context')
const { normalizeCode, hashCode, formatCode, decryptCode } = require('../lib/codes')
const { voucherStatus, redeemVoucher, claimVoucher, ensureVoucherQuota, DEMO_VOUCHERS } = require('../lib/vouchers')

const router = express.Router()

// Phase T Task 3: Name des Tiers und des abgebenden Tierheims zu einem offenen Übergabe-Gutschein -
// für den Hinweis "Mit diesem Gutschein zieht {animalName} aus {shelterName} zu euch" (POST /check).
const findHandoverInfo = db.prepare(
  `SELECT d.name AS animalName, f.name AS shelterName FROM dogs d JOIN families f ON f.id = d.family_id WHERE d.id = ?`
)

// Codes nie in Logs oder URLs: beide Endpunkte sind POST, auch das reine Nachschauen.
router.post('/check', codeLimiter, (req, res) => {
  const normalized = normalizeCode(req.body?.code)
  if (!normalized) return res.json({ status: 'unbekannt' })
  const voucher = db
    .prepare('SELECT redeemed_at, revoked_at, expires_at, dog_id FROM vouchers WHERE code_hash = ?')
    .get(hashCode(normalized))
  if (!voucher) return res.json({ status: 'unbekannt' })

  const status = voucherStatus(voucher)
  const response = { status }
  if (status === 'offen' && voucher.dog_id) {
    const handover = findHandoverInfo.get(voucher.dog_id)
    if (handover) response.handover = handover
  }
  res.json(response)
})

router.post('/redeem', codeLimiter, rejectHoneypot, (req, res, next) => {
  try {
    const { code, name, username, password, email, shelterMayRead } = req.body || {}
    const { familyId, code: normalized } = redeemVoucher(db, { code, name, username, password, email, shelterMayRead })
    setSessionCookie(res, familyId)
    res.status(201).json({ ...buildMe(familyId, familyId, false), key: formatCode(normalized), fromOthers: true })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

// Übergabe-Gutschein OHNE ein neues Zuhause anzulegen einlösen (Phase T Task 3): nur eingeloggt und
// nur aus dem eigenen Zuhause heraus - "aktiver Bereich" muss die Identität selbst sein (nicht ein
// beigetretenes Rudel, in dem man gerade zu Besuch ist) UND deren art muss 'zuhause' sein. Codes nie
// in Logs: codeLimiter zusätzlich zum globalen apiLimiter, wie bei /check und /redeem.
router.post('/claim', requireAuth, codeLimiter, (req, res, next) => {
  try {
    if (req.familyId !== req.homeId) {
      return res.status(400).json({ error: 'Nur aus dem eigenen Zuhause heraus möglich' })
    }
    const identity = db.prepare('SELECT art FROM families WHERE id = ?').get(req.homeId)
    if (!identity || identity.art !== ART.zuhause) {
      return res.status(400).json({ error: 'Nur aus „Meine Chronik“ heraus möglich' })
    }

    const { code, shelterMayRead } = req.body || {}
    const { dogId } = claimVoucher(db, { code, familyId: req.familyId, shelterMayRead })
    res.json({ dogId })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

// Eigene Weitergabe-Gutscheine des aktiven Bereichs (nicht der Identität - im beigetretenen Rudel
// unterwegs sieht man dessen Gutscheine, siehe InviteDialog). Füllt das Kontingent bei jedem Aufruf
// auf; die Demo bekommt eine feste Schein-Liste und legt nie echte Gutscheine an.
router.get('/mine', requireAuth, (req, res) => {
  if (req.isDemo) return res.json(DEMO_VOUCHERS)

  const area = db.prepare('SELECT id, name, art FROM families WHERE id = ?').get(req.familyId)
  ensureVoucherQuota(db, area)

  const rows = db
    .prepare(
      `SELECT id, code_cipher, code_hint, redeemed_at, revoked_at, expires_at, join_family_id, created_at
       FROM vouchers WHERE issued_by_family_id = ? ORDER BY created_at DESC, id DESC`
    )
    .all(area.id)

  res.json(
    rows.map((row) => {
      const status = voucherStatus(row)
      return {
        id: row.id,
        code: status === 'offen' ? formatCode(decryptCode(row.code_cipher)) : null,
        hint: row.code_hint,
        status,
        joins: Boolean(row.join_family_id),
        redeemed_at: row.redeemed_at,
        created_at: row.created_at
      }
    })
  )
})

module.exports = router
