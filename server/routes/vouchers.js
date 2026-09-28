const express = require('express')
const db = require('../db')
const { codeLimiter, rejectHoneypot } = require('../middleware/abuse')
const { setSessionCookie } = require('../middleware/auth')
const { buildMe } = require('../lib/context')
const { normalizeCode, hashCode, formatCode } = require('../lib/codes')
const { voucherStatus, redeemVoucher } = require('../lib/vouchers')

const router = express.Router()

// Codes nie in Logs oder URLs: beide Endpunkte sind POST, auch das reine Nachschauen.
router.post('/check', codeLimiter, (req, res) => {
  const normalized = normalizeCode(req.body?.code)
  if (!normalized) return res.json({ status: 'unbekannt' })
  const voucher = db.prepare('SELECT redeemed_at, revoked_at, expires_at FROM vouchers WHERE code_hash = ?').get(hashCode(normalized))
  res.json({ status: voucher ? voucherStatus(voucher) : 'unbekannt' })
})

router.post('/redeem', codeLimiter, rejectHoneypot, (req, res, next) => {
  try {
    const { code, name, username, password, email } = req.body || {}
    const { familyId, code: normalized } = redeemVoucher(db, { code, name, username, password, email })
    setSessionCookie(res, familyId)
    res.status(201).json({ ...buildMe(familyId, familyId, false), key: formatCode(normalized), fromOthers: true })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

module.exports = router
