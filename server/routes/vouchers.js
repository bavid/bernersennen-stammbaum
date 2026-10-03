const express = require('express')
const db = require('../db')
const { codeLimiter, rejectHoneypot, limitWrites } = require('../middleware/abuse')
const { requireAuth, setSessionCookie } = require('../middleware/auth')
const { ART, buildMe } = require('../lib/context')
const { normalizeCode, hashCode, formatCode } = require('../lib/codes')
const { cleanId } = require('../lib/validate')
const {
  voucherStatus,
  redeemVoucher,
  claimVoucher,
  ensureVoucherQuota,
  findVoucherByHash,
  isDemoVoucher,
  ZWECK,
  DEMO_VOUCHERS,
  DEMO_VOUCHER_ARCHIVE
} = require('../lib/vouchers')
const { MAX_OPEN_CODES, openSlotsFor, limitInfo, listVouchers, createPassOnCode, setLabel, deleteCode } = require('../lib/voucherManage')
const { isPartnerAccessCode, partnerAccessCheckInfo, redeemPartnerAccess } = require('../lib/partnerAccess')
const { requireRole, roleOf, hasRole, isRole, mayInviteAs, FORBIDDEN_MESSAGE } = require('../lib/roles')
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
    const { familyId, code: normalized, art, keyIsCode } = redeemAnyVoucher(req.body || {})
    setSessionCookie(res, familyId)
    // fromOthers: der Schlüssel ist der Code der Karte (Admin- und Partner-Karten, Partner-Zugang) - den kennt auch, wer
    // sie weitergegeben hat. Ein persönlicher Code bekommt einen frischen Schlüssel (lib/vouchers.js redeemVoucher).
    res.status(201).json({ ...buildMe(familyId, familyId, false), key: formatCode(normalized), fromOthers: keyIsCode !== false })
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
// security-review Phase T Finding 4: Übergabe-Gutscheine (dog_id gesetzt) sind keine Weitergabe-Einladungen - sie
// gehören nicht in diese Liste. rolle (Phase R Task 2): welche Rolle eine Einladung beim Einlösen vergibt.
// Phase V2b (lib/voucherManage.js): ohne Parameter alles noch nicht Eingelöste (offen, abgelaufen, zurückgezogen),
// mit ?archiv=1 die eingelösten (neueChronik: dabei entstand eine neue Chronik). Vom Ersteller gelöschte Codes
// fehlen. label/eigen: die Beschriftung sieht nur, wer den Code angelegt hat (in der Admin-Ansicht niemand). Die
// Start-Codes einer Familie gehören der Familie selbst - sie zählen für niemandes Obergrenze (security-review Phase
// V2, Punkt 10); im eigenen Zuhause gehören sie dem Zuhause und zählen für dessen Obergrenze.
router.get('/mine', requireAuth, requireRole('stellvertretung'), (req, res) => {
  const archiv = req.query.archiv === '1'
  if (req.isDemo) return res.json(archiv ? DEMO_VOUCHER_ARCHIVE : DEMO_VOUCHERS)

  const area = db.prepare('SELECT id, name, art FROM families WHERE id = ?').get(req.familyId)
  // Admin-Ansicht (Phase 5 Task 5b): nur lesen - das Kontingent füllt erst der Bereich selbst wieder auf.
  if (!req.isAdminView) {
    const isFamily = area.art === ART.rudel
    ensureVoucherQuota(db, area, {
      createdByFamilyId: isFamily ? area.id : req.homeId,
      maxNew: isFamily ? Infinity : openSlotsFor(db, req.homeId)
    })
  }
  res.json(listVouchers(db, { areaId: area.id, viewerId: req.isAdminView ? null : req.homeId, archiv }))
})

// Phase V2b: wie viele offene Codes die Identität hat und noch anlegen darf ({ offen, max, frei }; ohne Grenze
// max/frei null). Die Demo bekommt die Zahlen ihrer Schein-Liste.
router.get('/grenze', requireAuth, (req, res) => {
  if (req.isDemo) return res.json({ offen: DEMO_VOUCHERS.length, max: MAX_OPEN_CODES, frei: MAX_OPEN_CODES - DEMO_VOUCHERS.length })
  res.json(limitInfo(db, req.homeId))
})

function sendError(err, res, next) {
  if (err.status) return res.status(err.status).json({ error: err.message })
  next(err)
}

// Phase V2b: einen neuen Gutschein zum Weitergeben anlegen - im eigenen Zuhause (wer ihn einlöst, bekommt eine
// eigene Chronik) oder in einer Familie ab Stellvertretung (dazu der Beitritt). Höchstens MAX_OPEN_CODES offene je
// Identität (409). Antwort: der neue Code in der Form von GET /mine.
// limitWrites (security-review Phase V2, LOW-4): Anlegen/Löschen im Wechsel ließe sonst beliebig viele Zeilen wachsen.
router.post('/', limitWrites, requireRole('stellvertretung'), (req, res, next) => {
  try {
    const area = db.prepare('SELECT id, name, art FROM families WHERE id = ?').get(req.familyId)
    if (area.art === ART.zuhause && req.familyId !== req.homeId) return res.status(400).json({ error: 'Nur im eigenen Zuhause möglich' })
    res.status(201).json(createPassOnCode(db, area, req.homeId))
  } catch (err) {
    sendError(err, res, next)
  }
})

// Phase V2b: eigene Beschriftung eines Codes (höchstens 60 Zeichen, leer = keine) - nur, wer ihn angelegt hat.
router.put('/:id/label', limitWrites, (req, res, next) => {
  try {
    res.json(setLabel(db, { id: cleanId(req.params.id), homeId: req.homeId, label: req.body?.label }))
  } catch (err) {
    sendError(err, res, next)
  }
})

// Phase V2b: einen noch nicht eingelösten Code zurückziehen und löschen (ausblenden). Den eigenen immer, einen
// anderen des aktiven Bereichs im eigenen Zuhause bzw. ab Stellvertretung in einer Familie.
router.delete('/:id', limitWrites, (req, res, next) => {
  try {
    deleteCode(db, {
      id: cleanId(req.params.id),
      homeId: req.homeId,
      areaId: req.familyId,
      mayModerate: hasRole(req.homeId, req.familyId, 'stellvertretung')
    })
    res.status(204).end()
  } catch (err) {
    sendError(err, res, next)
  }
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
