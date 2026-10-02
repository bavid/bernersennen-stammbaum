const express = require('express')
const db = require('../db')
const { codeLimiter, rejectHoneypot } = require('../middleware/abuse')
const { requireAuth, setSessionCookie } = require('../middleware/auth')
const { ART, buildMe } = require('../lib/context')
const { normalizeCode, hashCode, formatCode, decryptCode } = require('../lib/codes')
const { cleanId } = require('../lib/validate')
const {
  voucherStatus,
  redeemVoucher,
  claimVoucher,
  ensureVoucherQuota,
  findVoucherByHash,
  inviteRoleOf,
  isDemoVoucher,
  ZWECK,
  DEMO_VOUCHERS
} = require('../lib/vouchers')
const { isPartnerAccessCode, partnerAccessCheckInfo, redeemPartnerAccess } = require('../lib/partnerAccess')
const { requireRole, roleOf, isRole, mayInviteAs, FORBIDDEN_MESSAGE } = require('../lib/roles')
const { notify, EREIGNIS } = require('../lib/notify')

const router = express.Router()

// Phase T Task 3: Name des Tiers und des abgebenden Tierheims zu einem offenen Übergabe-Gutschein -
// für den Hinweis "Mit diesem Gutschein zieht {animalName} aus {shelterName} zu euch" (POST /check).
// shelterName: der admin-gepflegte Partnername (partners.name), nicht der (vom Tierheim selbst frei
// änderbare) Familienname - Fallback auf families.name nur, wenn kein Partner verknüpft ist
// (security-review Phase T Finding 8, wie herkunft_text in lib/transfers.js).
// Phase V2: Name des einladenden Zuhauses zu einer offenen Besuchs-Einladung ("Einladung zu Besuch bei …").
const findVisitHostName = db.prepare("SELECT name FROM families WHERE id = ? AND art = 'zuhause'").pluck()

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
  // Die Schein-Einladung der Demo (Phase R Task 3) ist nach außen unbekannt, wie in assertVoucherOpen.
  if (!voucher || isDemoVoucher(voucher)) return res.json({ status: 'unbekannt' })

  const status = voucherStatus(voucher)
  if (status !== 'offen') return res.json({ status })
  if (voucher.zweck === ZWECK.partnerzugang) return res.json({ status, ...partnerAccessCheckInfo(db, voucher) })
  if (voucher.zweck === ZWECK.besuch) {
    const hostName = findVisitHostName.get(voucher.visit_host_family_id)
    return res.json(hostName ? { status, besuch: { name: hostName } } : { status: 'abgelaufen' })
  }
  const handover = voucher.dog_id ? findHandoverInfo.get(voucher.dog_id) : null
  res.json(handover ? { status, handover } : { status })
})

// Ein Partner-Zugang legt einen Partner samt Bereich an (lib/partnerAccess.js), jeder andere Gutschein
// "Meine Chronik" (lib/vouchers.js). Der Zweck eines Gutscheins ändert sich nach dem Anlegen nie - die
// Weiche darf ihn also vor der eigentlichen Einlöse-Transaktion lesen. art: 'partner' | 'zuhause' (für die
// Benachrichtigung unten).
function redeemAnyVoucher(body) {
  const { code, name, typ, plz, username, password, email, shelterMayRead } = body
  if (isPartnerAccessCode(db, code)) {
    return { ...redeemPartnerAccess(db, { code, name, typ, plz, username, password, email }), art: 'partner' }
  }
  return { ...redeemVoucher(db, { code, name, username, password, email, shelterMayRead }), art: 'zuhause' }
}

const findNewAreaStmt = db.prepare('SELECT name, is_demo FROM families WHERE id = ?')

// Phase N Task 2: "neue Registrierung" an den Admin (lib/notify.js) - ein Partner-Zugang mit eigenem Text; mit
// "Details mitsenden" samt Bereichsnamen. Asynchron, die Antwort ist da schon unterwegs.
// Wirft nie - die Antwort ist schon verschickt, ein Fehler hier darf sie nicht mehr berühren.
function notifyRegistration(familyId, art) {
  try {
    const area = findNewAreaStmt.get(familyId)
    notify(EREIGNIS.registrierung, { art, name: area?.name, demo: Boolean(area?.is_demo) })
  } catch {
    console.warn('Telegram-Benachrichtigung fehlgeschlagen (Bereich nicht lesbar)')
  }
}

router.post('/redeem', codeLimiter, rejectHoneypot, (req, res, next) => {
  try {
    const { familyId, code: normalized, art } = redeemAnyVoucher(req.body || {})
    setSessionCookie(res, familyId)
    res.status(201).json({ ...buildMe(familyId, familyId, false), key: formatCode(normalized), fromOthers: true })
    notifyRegistration(familyId, art)
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
  // Admin-Ansicht (Phase 5 Task 5b): nur lesen - das Kontingent füllt erst der Bereich selbst wieder auf.
  if (!req.isAdminView) ensureVoucherQuota(db, area)

  // security-review Phase T Finding 4: Übergabe-Gutscheine (dog_id gesetzt) sind keine Weitergabe-
  // Einladungen - sie gehören nicht in diese Liste (sonst könnte man einen Übergabe-Code hier als
  // normalen Einladungs-Code verwenden/weitergeben).
  // rolle (Phase R Task 2): welche Rolle eine Einladung beim Einlösen vergibt (nur bei joins: true, sonst
  // null) - änderbar über PUT /:id/rolle unten, solange der Gutschein offen ist.
  const rows = db
    .prepare(
      `SELECT id, code_cipher, code_hint, redeemed_at, revoked_at, expires_at, join_family_id, join_rolle, created_at,
         visit_host_family_id
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
        rolle: row.join_family_id ? inviteRoleOf(row) : null,
        // Phase V2: Besuchs-Einladung ("Jemanden in mein Zuhause einladen", 7 Tage gültig) statt Gutschein
        besuch: Boolean(row.visit_host_family_id),
        expires_at: row.expires_at,
        redeemed_at: row.redeemed_at,
        created_at: row.created_at
      }
    })
  )
})

// Einladungen mit Rolle (Phase R Task 2). Gewählter Ansatz: Einladungs-Gutscheine einer Familie entstehen
// weiterhin vorgeprägt über das Kontingent (ensureVoucherQuota in GET /mine, join_rolle NULL = 'mitglied') -
// es gibt keinen eigenen "Einladung anlegen"-Endpunkt. Die Rolle setzt man deshalb NACHTRÄGLICH an einem
// noch offenen Gutschein, bevor man den Code weitergibt: die Leitung jede Rolle, die Stellvertretung nur gast
// und mitglied (lib/roles.js mayInviteAs; alles andere 403). Gilt für jede offene Einladung IN diese Familie
// (join_family_id = aktiver Bereich, auch eine vom Admin für die Familie angelegte), nie für Übergabe-
// Gutscheine (dog_id) und nie für Gutscheine anderer Bereiche (404). Außerhalb einer Familie gibt es keine
// Einladungen mit join_family_id, also immer 404. Im Demo-Modus sperrt requireAuth jedes Schreiben.
router.put('/:id/rolle', requireAuth, requireRole('stellvertretung'), (req, res) => {
  const id = cleanId(req.params.id)
  const { rolle } = req.body || {}
  if (!isRole(rolle)) return res.status(400).json({ error: 'Unbekannte Rolle' })
  if (!mayInviteAs(roleOf(req.homeId, req.familyId), rolle)) return res.status(403).json({ error: FORBIDDEN_MESSAGE })

  const result = id
    ? db
        .prepare(
          `UPDATE vouchers SET join_rolle = ? WHERE id = ? AND join_family_id = ? AND dog_id IS NULL
             AND redeemed_at IS NULL AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > datetime('now'))`
        )
        .run(rolle, id, req.familyId)
    : { changes: 0 }
  if (!result.changes) return res.status(404).json({ error: 'Diese Einladung gibt es nicht' })
  res.json({ id, rolle })
})

module.exports = router
