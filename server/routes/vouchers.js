const express = require('express')
const db = require('../db')
const { codeLimiter, rejectHoneypot } = require('../middleware/abuse')
const { requireAuth, setSessionCookie } = require('../middleware/auth')
const { ART, buildMe } = require('../lib/context')
const { normalizeCode, hashCode, formatCode, decryptCode } = require('../lib/codes')
const { voucherStatus, redeemVoucher, claimVoucher, ensureVoucherQuota, findVoucherByHash, ZWECK, DEMO_VOUCHERS } = require('../lib/vouchers')
const { isPartnerAccessCode, partnerAccessCheckInfo, redeemPartnerAccess } = require('../lib/partnerAccess')
const { requireRole } = require('../lib/roles')

const router = express.Router()

// Phase T Task 3: Name des Tiers und des abgebenden Tierheims zu einem offenen Übergabe-Gutschein -
// für den Hinweis "Mit diesem Gutschein zieht {animalName} aus {shelterName} zu euch" (POST /check).
// shelterName: der admin-gepflegte Partnername (partners.name), nicht der (vom Tierheim selbst frei
// änderbare) Familienname - Fallback auf families.name nur, wenn kein Partner verknüpft ist
// (security-review Phase T Finding 8, wie herkunft_text in lib/transfers.js).
const findHandoverInfo = db.prepare(
  `SELECT d.name AS animalName, COALESCE(p.name, f.name) AS shelterName
   FROM dogs d JOIN families f ON f.id = d.family_id LEFT JOIN partners p ON p.id = f.partner_id
   WHERE d.id = ?`
)

// Codes nie in Logs oder URLs: beide Endpunkte sind POST, auch das reine Nachschauen. Ein offener
// Partner-Zugang (Phase P Task 2) meldet zusätzlich zweck und - falls bekannt - partnerTyp/partnerName
// (lib/partnerAccess.js); ein Kunden-Gutschein bleibt bei { status } (plus handover bei einer Übergabe).
router.post('/check', codeLimiter, (req, res) => {
  const normalized = normalizeCode(req.body?.code)
  if (!normalized) return res.json({ status: 'unbekannt' })
  const voucher = findVoucherByHash(db, hashCode(normalized))
  if (!voucher) return res.json({ status: 'unbekannt' })

  const status = voucherStatus(voucher)
  if (status !== 'offen') return res.json({ status })
  if (voucher.zweck === ZWECK.partnerzugang) return res.json({ status, ...partnerAccessCheckInfo(db, voucher) })
  const handover = voucher.dog_id ? findHandoverInfo.get(voucher.dog_id) : null
  res.json(handover ? { status, handover } : { status })
})

// Ein Partner-Zugang legt einen Partner samt Bereich an (lib/partnerAccess.js), jeder andere Gutschein
// "Meine Chronik" (lib/vouchers.js). Der Zweck eines Gutscheins ändert sich nach dem Anlegen nie - die
// Weiche darf ihn also vor der eigentlichen Einlöse-Transaktion lesen.
function redeemAnyVoucher(body) {
  const { code, name, typ, plz, username, password, email, shelterMayRead } = body
  if (isPartnerAccessCode(db, code)) return redeemPartnerAccess(db, { code, name, typ, plz, username, password, email })
  return redeemVoucher(db, { code, name, username, password, email, shelterMayRead })
}

router.post('/redeem', codeLimiter, rejectHoneypot, (req, res, next) => {
  try {
    const { familyId, code: normalized } = redeemAnyVoucher(req.body || {})
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
// Phase R Task 1: in einer Familie erst ab 'stellvertretung' (lib/roles.js). Gast und Mitglied bekommen
// 403 - bewusst auch für die bloße Liste, nicht nur fürs Auffüllen: sie enthält die offenen Codes im
// Klartext, und wer einen offenen Einladungs-Code weitergeben kann, lädt ein. Im eigenen Bereich
// (Zuhause, Tierheim, Partner) ist man immer Leitung - dort bleibt alles wie bisher.
router.get('/mine', requireAuth, requireRole('stellvertretung'), (req, res) => {
  if (req.isDemo) return res.json(DEMO_VOUCHERS)

  const area = db.prepare('SELECT id, name, art FROM families WHERE id = ?').get(req.familyId)
  ensureVoucherQuota(db, area)

  // security-review Phase T Finding 4: Übergabe-Gutscheine (dog_id gesetzt) sind keine Weitergabe-
  // Einladungen - sie gehören nicht in diese Liste (sonst könnte man einen Übergabe-Code hier als
  // normalen Einladungs-Code verwenden/weitergeben).
  const rows = db
    .prepare(
      `SELECT id, code_cipher, code_hint, redeemed_at, revoked_at, expires_at, join_family_id, created_at
       FROM vouchers WHERE issued_by_family_id = ? AND dog_id IS NULL ORDER BY created_at DESC, id DESC`
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
