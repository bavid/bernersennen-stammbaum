const fs = require('node:fs')
const path = require('node:path')
const express = require('express')
const rateLimit = require('express-rate-limit')
const db = require('../db')
const config = require('../config')
const { verifyPassword, safeEqual } = require('../lib/adminAuth')
const { requireAdmin, setAdminCookie, clearAdminCookie } = require('../middleware/admin')
const { setSessionCookie } = require('../middleware/auth')
const { AKTION, familyZiel, partnerZiel, logAdminAction, recentAdminLog } = require('../lib/adminLog')
const { ipKeyGenerator } = require('../lib/rateLimitKey')
const { cleanId } = require('../lib/validate')
const { createBatch, voucherStatus, isPersonalVoucher, validateBatchInput, validateZweck, ZWECK } = require('../lib/vouchers')
const { formatCode, decryptCode, generateCode, hashCode } = require('../lib/codes')
const { validatePartner, SHELTER_TYP_VALUES } = require('../lib/partners')
const { handlePartnerLogoUpload } = require('../lib/partnerLogo')
const { ART, PARTNER_AREA_ARTS, buildMe } = require('../lib/context')
const { PARTNER_AREA_ARTS_SQL, areaArtForTyp, areaLabel, findPartnerArea, insertPartnerArea } = require('../lib/partnerAreas')
const { partnerAccessBatchOptions } = require('../lib/partnerAccess')
const { findEinblick, ownEinblick, setAusgeblendet } = require('../lib/einblicke')
const { setAdminPin } = require('../lib/einblickPins')
const { HERKUNFT_JOINS_SQL, HERKUNFT_COLUMNS_SQL, withHerkunft } = require('../lib/herkunft')

const router = express.Router()

const ADMIN_LOGIN_LIMIT = 10
const RECENT_ENTRIES = 50

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: ADMIN_LOGIN_LIMIT,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: { error: 'Zu viele Versuche. Bitte warte ein paar Minuten.' }
})

// Ohne hinterlegten Passwort-Hash gibt es keinen Admin-Zugang
router.use((req, res, next) => {
  if (!config.adminPasswordHash) return res.status(404).json({ error: 'Nicht gefunden' })
  next()
})

router.post('/login', adminLoginLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body || {}
    const userOk = safeEqual(username, config.adminUsername)
    const passwordOk = await verifyPassword(password, config.adminPasswordHash)
    if (!userOk || !passwordOk) return res.status(401).json({ error: 'Benutzername oder Passwort falsch' })
    setAdminCookie(res)
    res.json({ username: config.adminUsername })
  } catch (err) {
    next(err)
  }
})

router.post('/logout', (req, res) => {
  clearAdminCookie(res)
  res.status(204).end()
})

router.get('/me', requireAdmin, (req, res) => {
  res.json({ username: config.adminUsername })
})

function uploadStats() {
  if (!fs.existsSync(config.uploadDir)) return { files: 0, bytes: 0 }
  const files = fs.readdirSync(config.uploadDir).filter((name) => name !== '.gitkeep')
  const bytes = files.reduce((sum, name) => sum + fs.statSync(path.join(config.uploadDir, name)).size, 0)
  return { files: files.length, bytes }
}

const count = (table) => db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c

// Nachrichten aus "Schreib dem Admin" – offene zuerst, darin die neuesten oben
router.get('/messages', requireAdmin, (req, res) => {
  const where = []
  const params = []
  if (['feedback', 'problem'].includes(req.query.type)) {
    where.push('m.type = ?')
    params.push(req.query.type)
  }
  if (['offen', 'erledigt'].includes(req.query.status)) {
    where.push('m.status = ?')
    params.push(req.query.status)
  }
  const messages = db
    .prepare(
      `SELECT m.*, f.name AS family_name
       FROM admin_messages m JOIN families f ON f.id = m.family_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY m.status = 'erledigt', m.created_at DESC, m.id DESC`
    )
    .all(...params)
  res.json(messages)
})

router.patch('/messages/:id', requireAdmin, (req, res) => {
  const { status } = req.body || {}
  if (!['offen', 'erledigt'].includes(status)) return res.status(400).json({ error: 'Status muss offen oder erledigt sein' })
  const resolvedAt = status === 'erledigt' ? "datetime('now')" : 'NULL'
  const result = db.prepare(`UPDATE admin_messages SET status = ?, resolved_at = ${resolvedAt} WHERE id = ?`).run(status, req.params.id)
  if (!result.changes) return res.status(404).json({ error: 'Nachricht nicht gefunden' })
  res.json(db.prepare('SELECT * FROM admin_messages WHERE id = ?').get(req.params.id))
})

router.delete('/messages/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM admin_messages WHERE id = ?').run(req.params.id)
  if (!result.changes) return res.status(404).json({ error: 'Nachricht nicht gefunden' })
  res.status(204).end()
})

// herkunft (Phase 5 Task 1, lib/herkunft.js): 'partner:<Name>' | 'weitergabe:<Bereichsname>' |
// 'stapel:<Label>' | 'altbestand' - aus dem Gutschein, mit dem der Bereich entstand. quelle bleibt als Freitext.
router.get('/overview', requireAdmin, (req, res) => {
  const families = db
    .prepare(
      `SELECT f.id, f.name, f.art, f.is_demo, f.created_at, f.quelle, ${HERKUNFT_COLUMNS_SQL},
         (SELECT COUNT(*) FROM dogs d WHERE d.family_id = f.id) AS dogs,
         (SELECT COUNT(*) FROM timeline_entries t WHERE t.family_id = f.id) AS entries,
         (SELECT COUNT(*) FROM notes n WHERE n.family_id = f.id) AS notes,
         (SELECT COUNT(*) FROM note_replies r WHERE r.family_id = f.id) AS replies,
         (SELECT MAX(x) FROM (
            SELECT MAX(created_at) AS x FROM dogs WHERE family_id = f.id
            UNION ALL SELECT MAX(created_at) FROM timeline_entries WHERE family_id = f.id
            UNION ALL SELECT MAX(created_at) FROM notes WHERE family_id = f.id
            UNION ALL SELECT MAX(created_at) FROM note_replies WHERE family_id = f.id
         )) AS last_activity
       FROM families f ${HERKUNFT_JOINS_SQL}
       ORDER BY f.created_at`
    )
    .all()
    .map(withHerkunft)

  res.json({
    stats: {
      families: count('families'),
      dogs: count('dogs'),
      entries: count('timeline_entries'),
      notes: count('notes'),
      replies: count('note_replies'),
      breeding: count('breeding_events'),
      openMessages: db.prepare("SELECT COUNT(*) AS c FROM admin_messages WHERE status = 'offen'").get().c,
      uploads: uploadStats()
    },
    families
  })
})

router.get('/families/:id', requireAdmin, (req, res) => {
  const family = db.prepare('SELECT id, name, created_at, quelle FROM families WHERE id = ?').get(req.params.id)
  if (!family) return res.status(404).json({ error: 'Rudel nicht gefunden' })

  const dogs = db
    .prepare(
      `SELECT d.id, d.name, d.name_unbekannt, d.rasse, d.tierart, d.geschlecht, d.geburtsdatum, d.foto_url, d.created_at,
              d.mother_freitext, d.father_freitext,
              m.name AS mother_name, m.name_unbekannt AS mother_unbekannt, m.rasse AS mother_rasse,
              v.name AS father_name, v.name_unbekannt AS father_unbekannt, v.rasse AS father_rasse,
              (SELECT COUNT(*) FROM timeline_entries t WHERE t.dog_id = d.id) AS entries
       FROM dogs d
       LEFT JOIN dogs m ON m.id = d.mother_dog_id
       LEFT JOIN dogs v ON v.id = d.father_dog_id
       WHERE d.family_id = ?
       ORDER BY d.geburtsdatum IS NULL, d.geburtsdatum, d.name`
    )
    .all(family.id)

  const entries = db
    .prepare(
      `SELECT t.id, t.datum, t.titel, t.text, t.autor_name, t.foto_urls, t.created_at,
              d.name AS dog_name, d.name_unbekannt AS dog_unbekannt, d.rasse AS dog_rasse
       FROM timeline_entries t JOIN dogs d ON d.id = t.dog_id
       WHERE t.family_id = ? ORDER BY t.created_at DESC, t.id DESC LIMIT ?`
    )
    .all(family.id, RECENT_ENTRIES)
    .map((entry) => ({ ...entry, foto_urls: JSON.parse(entry.foto_urls) }))

  const notes = db.prepare('SELECT * FROM notes WHERE family_id = ? ORDER BY created_at DESC, id DESC').all(family.id)
  const replies = db.prepare('SELECT * FROM note_replies WHERE family_id = ? ORDER BY created_at, id').all(family.id)
  const byNote = new Map(notes.map((note) => [note.id, []]))
  for (const reply of replies) byNote.get(reply.note_id)?.push(reply)

  res.json({ family, dogs, entries, notes: notes.map((note) => ({ ...note, replies: byNote.get(note.id) })) })
})

// --- Admin-Ansicht (Phase 5 Task 5b) ------------------------------------------------------------------

// Öffnet einen beliebigen Bereich (Zuhause, Familie, Tierheim, Partner) als NUR-LESEN-Sitzung des Admins: das
// normale Sitzungs-Cookie mit Identität = aktiver Bereich = dieser Bereich und der Markierung adminView
// (middleware/auth.js signSession) - ohne Schlüssel, ohne Demo-Parität, der Admin ist vertrauenswürdig.
// Jede Schreib-Anfrage dieser Sitzung lehnt denyAdminViewWrites (app.js) ab. Jeder Aufruf steht im
// Protokoll (lib/adminLog.js) - Bereich und Zeitpunkt, keine Inhalte. Antwort wie /api/me, damit der Client
// (AdminViewStartPage) direkt in den Bereich wechseln kann.
router.post('/view/:familyId', requireAdmin, (req, res) => {
  const id = cleanId(req.params.familyId)
  const family = id ? db.prepare('SELECT id, is_demo FROM families WHERE id = ?').get(id) : null
  if (!family) return res.status(404).json({ error: 'Diesen Bereich gibt es nicht' })

  setSessionCookie(res, family.id, family.id, { adminView: true })
  logAdminAction(AKTION.view, familyZiel(family.id))
  res.json(buildMe(family.id, family.id, Boolean(family.is_demo), null, { adminView: true }))
})

// Die letzten Einträge des Protokolls, neueste zuerst. ?limit= (Standard 50, höchstens 200, lib/adminLog.js).
router.get('/log', requireAdmin, (req, res) => {
  res.json(recentAdminLog(req.query.limit))
})

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

function isGiven(value) {
  return value !== undefined && value !== null && value !== ''
}

// createBatch-Optionen für einen Chronik-Stapel (bisheriges Verhalten). Optional joinFamilyId - wer den
// Gutschein einlöst, tritt diesem Rudel gleich bei; nur ein bestehendes, echtes Rudel (kein Zuhause,
// keine Demo) ist ein gültiges Ziel. Optional partnerId (Task 2) - ein aktiver oder Entwurfs-Partner
// macht den Stapel zu kind='partner', partner_id landet auf Stapel UND jedem Gutschein (siehe
// lib/vouchers.js createBatch), redeemVoucher überträgt es dann auf families. Eine Typ-Vorgabe gibt es
// nur für Partner-Zugänge.
function chronikBatchOptions({ joinFamilyId, partnerId, partnerTyp }) {
  if (isGiven(partnerTyp)) throw httpError(400, 'Eine Typ-Vorgabe gibt es nur für Partner-Zugänge')

  let cleanJoinFamilyId = null
  if (isGiven(joinFamilyId)) {
    const id = cleanId(joinFamilyId)
    const joinable = id && db.prepare("SELECT 1 FROM families WHERE id = ? AND art = 'rudel' AND is_demo = 0").get(id)
    if (!joinable) throw httpError(400, 'Dieses Rudel gibt es nicht')
    cleanJoinFamilyId = id
  }

  let cleanPartnerId = null
  if (isGiven(partnerId)) {
    const id = cleanId(partnerId)
    const partner = id && db.prepare("SELECT 1 FROM partners WHERE id = ? AND status IN ('entwurf', 'aktiv')").get(id)
    if (!partner) throw httpError(400, 'Diesen Partner gibt es nicht')
    cleanPartnerId = id
  }

  return { kind: cleanPartnerId ? 'partner' : 'admin', zweck: ZWECK.chronik, joinFamilyId: cleanJoinFamilyId, partnerId: cleanPartnerId }
}

// Gutschein-Stapel für den Admin: Bezeichnung Pflicht (<=80 Zeichen), Anzahl 1-200. zweck (Phase P
// Task 2): 'chronik' (Standard, siehe chronikBatchOptions) oder 'partnerzugang' (lib/partnerAccess.js
// partnerAccessBatchOptions: optionale Typ-Vorgabe partnerTyp, optional an einen bestehenden Partner
// gebunden per partnerId).
router.post('/voucher-batches', requireAdmin, (req, res, next) => {
  try {
    const body = req.body || {}
    const trimmedLabel = validateBatchInput({ label: body.label, size: body.size })
    const zweck = validateZweck(body.zweck)
    const options = zweck === ZWECK.partnerzugang ? partnerAccessBatchOptions(db, body) : chronikBatchOptions(body)

    const { batchId, codes } = createBatch(db, { label: trimmedLabel, size: body.size, ...options })
    const batch = db
      .prepare('SELECT id, label, size, zweck, partner_typ AS partnerTyp, created_at FROM voucher_batches WHERE id = ?')
      .get(batchId)
    res.status(201).json({ batch, codes: codes.map(formatCode) })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

// Zähler je Stapel - "abgelaufen" zählt bewusst in keiner der drei Spalten mit (die Liste dient nur
// dem Überblick, nicht der Kontingent-Logik). partner_name: bei kind='partner' und bei einem
// gebundenen Partner-Zugang gesetzt. zweck/partnerTyp: siehe POST /voucher-batches. assigned (Phase N
// Task 1): wie viele der offenen schon einer Anfrage zugewiesen sind (routes/adminAnfragen.js) - frei für eine
// Zuweisung sind höchstens open - assigned.
router.get('/voucher-batches', requireAdmin, (req, res) => {
  const batches = db
    .prepare(
      `SELECT b.id, b.label, b.kind, b.zweck, b.partner_typ AS partnerTyp, b.size, b.created_at, p.name AS partner_name,
         SUM(CASE WHEN v.revoked_at IS NULL AND v.redeemed_at IS NULL AND (v.expires_at IS NULL OR v.expires_at > datetime('now')) THEN 1 ELSE 0 END) AS open,
         SUM(CASE WHEN v.revoked_at IS NULL AND v.redeemed_at IS NOT NULL THEN 1 ELSE 0 END) AS redeemed,
         SUM(CASE WHEN v.revoked_at IS NOT NULL THEN 1 ELSE 0 END) AS revoked,
         SUM(CASE WHEN v.zugewiesen_an_anfrage_id IS NOT NULL AND v.revoked_at IS NULL AND v.redeemed_at IS NULL
                   AND (v.expires_at IS NULL OR v.expires_at > datetime('now')) THEN 1 ELSE 0 END) AS assigned
       FROM voucher_batches b
       LEFT JOIN vouchers v ON v.batch_id = b.id
       LEFT JOIN partners p ON p.id = b.partner_id
       GROUP BY b.id ORDER BY b.created_at DESC, b.id DESC`
    )
    .all()
  res.json(batches)
})

router.get('/voucher-batches/:id', requireAdmin, (req, res) => {
  const id = cleanId(req.params.id)
  const batch = id
    ? db.prepare('SELECT id, label, kind, zweck, partner_typ AS partnerTyp, size, created_at FROM voucher_batches WHERE id = ?').get(id)
    : null
  if (!batch) return res.status(404).json({ error: 'Diesen Stapel gibt es nicht' })

  const rows = db
    .prepare(
      `SELECT v.id, v.code_cipher, v.code_hint, v.redeemed_at, v.revoked_at, v.expires_at, v.zugewiesen_an_anfrage_id,
         v.issued_by_family_id, v.created_by_family_id, v.visit_host_family_id, v.dog_id,
         f.name AS redeemed_by_name
       FROM vouchers v LEFT JOIN families f ON f.id = v.redeemed_by_family_id
       WHERE v.batch_id = ? ORDER BY v.id`
    )
    .all(id)

  // security-review Phase V2 (L-5): persönliche Codes (Einladungen, Weitergabe- und Übergabe-Gutscheine der Bereiche,
  // lib/vouchers.js isPersonalVoucher) zeigt auch der Admin nur als Hinweis - im Klartext kennt sie allein, wer sie
  // ausgegeben hat. Ein beschädigter Geheimtext bricht die Liste nicht ab.
  const plainCode = (row) => {
    if (isPersonalVoucher(row) || !row.code_cipher) return null
    try {
      return formatCode(decryptCode(row.code_cipher))
    } catch {
      return null
    }
  }

  const vouchers = rows.map((row) => {
    const status = voucherStatus(row)
    return {
      id: row.id,
      code: status === 'offen' ? plainCode(row) : null,
      ...(isPersonalVoucher(row) ? { persoenlich: true } : {}),
      hint: row.code_hint,
      status,
      redeemed_at: row.redeemed_at,
      redeemed_by_name: row.redeemed_by_name,
      // Phase N Task 1: einer Anfrage zugewiesen - bleibt offen und druckbar, wird aber nicht noch einmal vergeben.
      zugewiesen: row.zugewiesen_an_anfrage_id !== null
    }
  })

  res.json({ batch, vouchers })
})

// Zieht einen einzelnen Gutschein zurück (nicht den ganzen Stapel) - schon eingelöste bleiben
// unangetastet (409), sonst wird revoked_at gesetzt und der Klartext gelöscht. Erneutes Zurückziehen
// eines schon widerrufenen Gutscheins bleibt folgenlos (idempotent), statt einen Fehler zu werfen.
router.post('/vouchers/:id/revoke', requireAdmin, (req, res) => {
  const id = cleanId(req.params.id)
  const voucher = id ? db.prepare('SELECT redeemed_at, revoked_at, expires_at FROM vouchers WHERE id = ?').get(id) : null
  if (!voucher) return res.status(404).json({ error: 'Diesen Gutschein gibt es nicht' })
  if (voucher.redeemed_at) return res.status(409).json({ error: 'Dieser Gutschein wurde schon eingelöst' })

  if (!voucher.revoked_at) {
    db.prepare("UPDATE vouchers SET revoked_at = datetime('now'), code_cipher = NULL WHERE id = ?").run(id)
  }
  const updated = db.prepare('SELECT redeemed_at, revoked_at, expires_at FROM vouchers WHERE id = ?').get(id)
  res.json({ status: voucherStatus(updated) })
})

// --- Partner (Task 2) ---------------------------------------------------------------------------

function findPartner(id) {
  return id ? db.prepare('SELECT * FROM partners WHERE id = ?').get(id) : null
}

function uniqueConstraintViolation(err) {
  return typeof err.message === 'string' && err.message.includes('UNIQUE')
}

// V-Fehler 3: den Schalter "Vertrauenswürdig" protokollieren (lib/adminLog.js) - nur, wenn er sich wirklich ändert.
function logTrustChange(partnerId, before, after) {
  if (Boolean(before) === Boolean(after)) return
  logAdminAction(after ? AKTION.partnerVertrauenswuerdig : AKTION.partnerNichtVertrauenswuerdig, partnerZiel(partnerId))
}

// Phase P Task 1: der Bereich eines Partners - art 'tierheim' (Typ tierheim/vermittlung) oder 'partner'
// (alle anderen Typen), höchstens einer pro Partner. Die Helfer dazu (areaArtForTyp, findPartnerArea,
// insertPartnerArea, ...) liegen in lib/partnerAreas.js - der Partner-Zugang per Gutschein nutzt sie auch.

// shelter_family_id: die Tierheim-Familie (falls vorhanden) - bleibt für den bisherigen Admin-Client.
// area_family_id/area_art (Phase P Task 1): der Bereich des Partners, egal welcher Art - der Client zeigt
// damit z. B. einen "Schlüssel erneuern"-statt-"Anlegen"-Knopf. gesperrt kommt über p.* mit. telegram_verbunden (Phase
// V4b): 1, wenn der Partner Telegram-Hinweise verbunden hat, sonst 0 oder null - nie die Chat-ID.
router.get('/partners', requireAdmin, (req, res) => {
  const areaSubquery = (column) =>
    `(SELECT f.${column} FROM families f WHERE f.partner_id = p.id AND f.art IN (${PARTNER_AREA_ARTS_SQL}) ORDER BY f.id LIMIT 1)`
  res.json(
    db
      .prepare(
        `SELECT p.*,
           (SELECT f.id FROM families f WHERE f.partner_id = p.id AND f.art = 'tierheim') AS shelter_family_id,
           ${areaSubquery('id')} AS area_family_id,
           ${areaSubquery('art')} AS area_art,
           (SELECT CASE WHEN t.chat_cipher IS NULL THEN 0 ELSE 1 END FROM partner_telegram t WHERE t.partner_id = p.id) AS telegram_verbunden
         FROM partners p ORDER BY p.name COLLATE NOCASE`
      )
      .all()
  )
})

router.post('/partners', requireAdmin, (req, res, next) => {
  try {
    const clean = validatePartner(req.body || {})
    const columns = Object.keys(clean)
    const id = db
      .prepare(`INSERT INTO partners (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
      .run(...columns.map((col) => clean[col])).lastInsertRowid
    logTrustChange(id, 0, clean.vertrauenswuerdig)
    res.status(201).json(findPartner(id))
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    if (uniqueConstraintViolation(err)) return res.status(409).json({ error: 'Diesen Kurznamen gibt es schon' })
    next(err)
  }
})

router.put('/partners/:id', requireAdmin, (req, res, next) => {
  try {
    const id = cleanId(req.params.id)
    const existing = findPartner(id)
    if (!existing) return res.status(404).json({ error: 'Diesen Partner gibt es nicht' })

    const clean = validatePartner(req.body || {}, { existing })
    // Ein bestehender Bereich hat seine Art beim Anlegen vom Typ bekommen (areaArtForTyp) - ein Typwechsel
    // über die Grenze Tierheim/Vermittlung <-> übrige Partner würde nicht mehr dazu passen (z. B. Tiere
    // in einem Bereich, der laut Typ keine haben darf). Innerhalb der jeweiligen Gruppe geht der Wechsel.
    const area = findPartnerArea(db, id)
    if (area && areaArtForTyp(clean.typ) !== area.art) {
      return res.status(409).json({ error: `Für diesen Partner gibt es einen ${areaLabel(area.art)} – dazu passt der Typ „${clean.typ}“ nicht` })
    }
    const columns = Object.keys(clean)
    db.prepare(`UPDATE partners SET ${columns.map((col) => `${col} = ?`).join(', ')} WHERE id = ?`).run(
      ...columns.map((col) => clean[col]),
      id
    )
    logTrustChange(id, existing.vertrauenswuerdig, clean.vertrauenswuerdig)
    res.json(findPartner(id))
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    if (uniqueConstraintViolation(err)) return res.status(409).json({ error: 'Diesen Kurznamen gibt es schon' })
    next(err)
  }
})

// Logo: dieselbe Funktion wie beim Partner selbst (lib/partnerLogo.js - Magic-Bytes, Größe,
// Metadaten-Entfernung, server-vergebener Dateiname).
router.post('/partners/:id/logo', requireAdmin, (req, res, next) => {
  const id = cleanId(req.params.id)
  const partner = findPartner(id)
  if (!partner) return res.status(404).json({ error: 'Diesen Partner gibt es nicht' })
  handlePartnerLogoUpload(req, res, next, partner.id)
})

// Legt für einen Partner seinen eigenen Bereich an, über den das Team selbst die App nutzt - Phase T
// Task 1 für Tierheime (art='tierheim': Chronik je Tier, Steckbrief, Übergabe), seit Phase P Task 1 für
// jeden Partner-Typ (art='partner' für alle, die keine Tierheime/Vermittlungen sind). Der
// Zugangsschlüssel funktioniert wie ein Gutschein-Code (siehe lib/vouchers.js redeemVoucher/
// lib/codes.js): einmalig im Klartext zurückgegeben, danach nur noch der Hash in
// families.access_key_hash. Höchstens ein Bereich pro Partner, egal welcher Art.
// onlyShelter: der alte Pfad /shelter bleibt Tierheimen/Vermittlungen vorbehalten (400 für andere Typen).
function createPartnerArea(req, res, { onlyShelter }) {
  const id = cleanId(req.params.id)
  const partner = findPartner(id)
  if (!partner) return res.status(404).json({ error: 'Diesen Partner gibt es nicht' })
  if (onlyShelter && !SHELTER_TYP_VALUES.includes(partner.typ)) {
    return res.status(400).json({ error: 'Nur für Partner vom Typ Tierheim oder Vermittlung' })
  }

  const existing = findPartnerArea(db, id)
  if (existing) return res.status(409).json({ error: `Für diesen Partner gibt es schon einen ${areaLabel(existing.art)}` })

  const code = generateCode()
  const { familyId, art } = insertPartnerArea(db, { partner, accessKeyHash: hashCode(code) })
  res.status(201).json({ familyId, key: formatCode(code), art })
}

router.post('/partners/:id/area', requireAdmin, (req, res) => createPartnerArea(req, res, { onlyShelter: false }))
router.post('/partners/:id/shelter', requireAdmin, (req, res) => createPartnerArea(req, res, { onlyShelter: true }))

// Schlüssel erneuern (security-review Phase T Finding 13): wie routes/auth.js POST /family/key, nur
// vom Admin für ein Partner-Team ausgelöst (z. B. Schlüssel verloren/kompromittiert). auth_epoch+1
// beendet jede laufende Sitzung dieses Bereichs, der neue Schlüssel kommt einmalig im Klartext zurück.
// arts: welche Bereichsarten der Pfad erneuern darf - /area/key beide, der alte Pfad /shelter/key nur
// Tierheim-Bereiche (wie bisher).
function reissueAreaKey(req, res, { arts }) {
  const id = cleanId(req.params.id)
  const partner = findPartner(id)
  if (!partner) return res.status(404).json({ error: 'Diesen Partner gibt es nicht' })

  const area = findPartnerArea(db, id)
  if (!area || !arts.includes(area.art)) {
    const label = arts.length === 1 ? areaLabel(arts[0]) : 'Bereich'
    return res.status(404).json({ error: `Für diesen Partner gibt es keinen ${label}` })
  }

  const code = generateCode()
  db.prepare('UPDATE families SET access_key_hash = ?, auth_epoch = auth_epoch + 1 WHERE id = ?').run(hashCode(code), area.id)
  res.json({ key: formatCode(code) })
}

router.post('/partners/:id/area/key', requireAdmin, (req, res) => reissueAreaKey(req, res, { arts: PARTNER_AREA_ARTS }))
router.post('/partners/:id/shelter/key', requireAdmin, (req, res) => reissueAreaKey(req, res, { arts: [ART.tierheim] }))

// Löschen nur im Entwurf - ein schon veröffentlichter Partner wird stattdessen pausiert (PUT status).
// Zusätzlich: referenziert irgendein Gutschein-Stapel (auch längst eingelöste Gutscheine) diesen
// Partner, bleibt er ebenfalls erhalten - ein Löschen würde sonst die partner_id-Fremdreferenz in
// voucher_batches/vouchers verwaisen lassen (security-review Phase 2 Finding 7). Ebenso bleibt ein
// Partner erhalten, für den schon ein Bereich angelegt wurde (Tierheim- oder Partner-Bereich,
// security-review Phase T Finding 13) - der Bereich referenziert den Partner über families.partner_id,
// ein Löschen würde diese Referenz verwaisen lassen (und POST /:id/area erlaubt das Anlegen bewusst
// unabhängig vom Status).
router.delete('/partners/:id', requireAdmin, (req, res) => {
  const id = cleanId(req.params.id)
  const partner = findPartner(id)
  if (!partner) return res.status(404).json({ error: 'Diesen Partner gibt es nicht' })
  if (partner.status !== 'entwurf') {
    return res.status(409).json({ error: 'Nur Entwürfe lassen sich löschen – diesen Partner stattdessen pausieren' })
  }
  const area = findPartnerArea(db, id)
  if (area) {
    return res.status(409).json({ error: `Für diesen Partner gibt es einen ${areaLabel(area.art)} – er lässt sich nicht mehr löschen` })
  }
  const hasVoucherBatches = db.prepare('SELECT 1 FROM voucher_batches WHERE partner_id = ? LIMIT 1').get(id)
  if (hasVoucherBatches) {
    return res.status(409).json({ error: 'Für diesen Partner gibt es schon Gutschein-Stapel – er lässt sich nicht mehr löschen' })
  }
  if (partner.logo_file) {
    fs.rmSync(path.join(config.partnerMediaDir, partner.logo_file), { force: true })
  }
  db.prepare('DELETE FROM partners WHERE id = ?').run(id)
  res.status(204).end()
})

// --- Einblicke (Phase P Task 3b) ------------------------------------------------------------------

const ADMIN_EINBLICKE_LIMIT = 500

// Alle Einblicke eines Partners (?partnerId=) oder die neuesten aller Partner - inkl. ausgeblendeter, mit
// Partner-Namen. Fotos über /uploads (der Admin sieht jede Datei, middleware/admin.js requireUploadAccess).
router.get('/einblicke', requireAdmin, (req, res) => {
  const partnerId = cleanId(req.query.partnerId)
  if (Number.isNaN(partnerId)) return res.status(400).json({ error: 'Ungültige Partner-Id' })
  const rows = db
    .prepare(
      `SELECT e.*, p.name AS partner_name FROM partner_einblicke e LEFT JOIN partners p ON p.id = e.partner_id
       ${partnerId ? 'WHERE e.partner_id = @partnerId' : ''}
       ORDER BY e.datum DESC, e.id DESC LIMIT ${ADMIN_EINBLICKE_LIMIT}`
    )
    .all(partnerId ? { partnerId } : {})
  res.json(rows.map((row) => ({ ...ownEinblick(row), partnerId: row.partner_id, partnerName: row.partner_name, isDemo: Boolean(row.is_demo) })))
})

// Ausblenden/Einblenden: ein ausgeblendeter Einblick verschwindet aus Portal, Teaser und /public-media,
// der Partner sieht ihn weiter (mit ausgeblendet: true) und kann ihn nicht selbst wieder einblenden.
router.post('/einblicke/:id/ausblenden', requireAdmin, (req, res) => {
  const einblick = findEinblick(req.params.id)
  if (!einblick) return res.status(404).json({ error: 'Diesen Einblick gibt es nicht' })
  const { ausgeblendet } = req.body || {}
  if (typeof ausgeblendet !== 'boolean') return res.status(400).json({ error: '„ausgeblendet“ muss true oder false sein' })
  res.json(ownEinblick(setAusgeblendet(einblick.id, ausgeblendet)))
})

// Phase V1: Anpinnen für die Karte in "Entdecken" (lib/einblickPins.js) - Team-Pins stehen vor denen des Partners,
// höchstens drei je Partner; angepinnt false löst jeden Pin (auch den des Partners).
router.post('/einblicke/:id/anpinnen', requireAdmin, (req, res, next) => {
  try {
    const einblick = findEinblick(req.params.id)
    if (!einblick) return res.status(404).json({ error: 'Diesen Einblick gibt es nicht' })
    const { angepinnt } = req.body || {}
    if (typeof angepinnt !== 'boolean') return res.status(400).json({ error: '„angepinnt“ muss true oder false sein' })
    res.json(ownEinblick(setAdminPin(einblick.id, angepinnt)))
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

module.exports = router
