'use strict'

// Phase P1 Task 4: Demo-Partner-Bereiche (art 'partner') und Demo-Einblicke aus seed/demo-partner-area.js.
// Läuft innerhalb der replaceDemoPack-Transaktion (lib/demoPack.js), und zwar NACH insertDemoPartners (die
// Bereiche und Einblicke brauchen die neuen Partner-Ids) und NACH removeDemoEinblicke (das räumt alle
// Einblicke mit is_demo = 1 weg und träfe sonst auch die neuen). Scheitert etwas, rollt die Transaktion
// alles zurück; die schon kopierten Fotos entfernt replaceDemoPack über copyImage.copiedUrls().

const { ART } = require('./context')
const { areaArtForTyp, findPartnerArea, insertPartnerArea } = require('./partnerAreas')
const { MAX_EINBLICKE, validateNewEinblick } = require('./einblicke')
const { validatePartnerPost, insertPost } = require('./partnerPosts')
const { FREIGABE, validateAblehnungsgrund } = require('./promotions')
const { VERLAUF_AKTION, recordPromotionEvent } = require('./promotionFreigabe')
const { validateContactMessage, insertMessage } = require('./partnerMessages')
const { createBatch, DEMO_BATCH_KIND } = require('./vouchers')
const { PARTNER_AREA_SLUGS, EINBLICKE, POSTS, MESSAGES, KUNDEN_GUTSCHEINE } = require('../seed/demo-partner-area')

// Nur Demo-Partner (is_demo = 1): ein Seed-Eintrag darf nie an einem echten Partner landen.
function findDemoPartner(db, slug, purpose) {
  const partner = db.prepare('SELECT * FROM partners WHERE slug = ? AND is_demo = 1').get(slug)
  if (!partner) throw new Error(`Demo-Partner "${slug}" fehlt für ${purpose}`)
  return partner
}

// Ein Bereich je Demo-Partner aus PARTNER_AREA_SLUGS, angelegt wie jeder andere Partner-Bereich
// (lib/partnerAreas.js insertPartnerArea, is_demo folgt dem Partner). Ohne Zugangsschlüssel - hinein geht
// es nur über POST /api/demo { as: 'partner' } (routes/auth.js), wie beim Demo-Tierheim.
function insertDemoPartnerAreas(db) {
  return PARTNER_AREA_SLUGS.map((slug) => {
    const partner = findDemoPartner(db, slug, 'einen Demo-Partner-Bereich')
    if (areaArtForTyp(partner.typ) !== ART.partner) throw new Error(`Demo-Partner "${slug}" bekäme keinen Partner-Bereich (Typ ${partner.typ})`)
    if (findPartnerArea(db, partner.id)) throw new Error(`Demo-Partner "${slug}" hat schon einen Bereich`)
    const { familyId } = insertPartnerArea(db, { partner, accessKeyHash: null })
    return { slug, partnerId: partner.id, familyId }
  })
}

// Dieselbe Prüfung wie POST /api/partner-area/einblicke (Einwilligung, Datum nicht in der Zukunft, reiner
// Text bis 300 Zeichen, Züchter-Schutz) - mit dem Seed-Eintrag in der Meldung, damit ein Fehler auffindbar ist.
function validateDemoEinblick({ partnerSlug, datum, text }) {
  try {
    return validateNewEinblick({ einwilligung: true, datum, text })
  } catch (err) {
    throw new Error(`Demo-Einblick für "${partnerSlug}" ist ungültig: ${err.message}`)
  }
}

// Erst ALLE Einblicke prüfen, dann der Reihe nach Foto kopieren und einfügen. Jeder Einblick bekommt eine
// eigene Datei (copyImage.copyOwn): Einblick-Fotos sind öffentlich (/public-media, lib/publicMedia.js) und
// sollen sich keine Datei mit einem Tier oder Chronik-Eintrag teilen. Gibt die Anzahl je Partner-Slug zurück.
function insertDemoEinblicke(db, copyImage) {
  const prepared = EINBLICKE.map((einblick) => {
    const partner = findDemoPartner(db, einblick.partnerSlug, `den Demo-Einblick "${einblick.text}"`)
    return { partnerId: partner.id, partnerSlug: einblick.partnerSlug, foto: einblick.foto, ...validateDemoEinblick(einblick) }
  })

  const counts = {}
  for (const { partnerSlug } of prepared) counts[partnerSlug] = (counts[partnerSlug] || 0) + 1
  const overLimit = Object.keys(counts).find((slug) => counts[slug] > MAX_EINBLICKE)
  if (overLimit) throw new Error(`Demo-Partner "${overLimit}" hätte mehr als ${MAX_EINBLICKE} Einblicke`)

  const insert = db.prepare(
    `INSERT INTO partner_einblicke (partner_id, foto_url, datum, text, einwilligung, is_demo, created_at)
     VALUES (?, ?, ?, ?, 1, 1, datetime(?, '+18 hours'))`
  )
  for (const { partnerId, foto, datum, text } of prepared) insert.run(partnerId, copyImage.copyOwn(foto), datum, text, datum)
  return counts
}

// --- Phase 5 Task 4: Kunden-Gutschein-Stapel der Demo-Partner -------------------------------------------

// Die Demo-Stapel des letzten Laufs (Stapel-Art DEMO_BATCH_KIND ohne Einladung und ohne Übergabe) samt Gutscheinen
// wegräumen - VOR dem Anlegen der neuen. deleteFamily (am Ende von replaceDemoPack) nähme nur die offenen mit
// und ließe die als "eingelöst" markierten als verwaiste Zeilen zurück. Die Schein-Einladung der Demo-Familie
// (join_family_id gesetzt, lib/demoMembers.js) bleibt hier unberührt: sie räumt deleteFamily selbst weg.
function removeDemoVoucherStacks(db) {
  db.prepare(
    `DELETE FROM vouchers WHERE join_family_id IS NULL AND dog_id IS NULL
       AND batch_id IN (SELECT id FROM voucher_batches WHERE kind = ?)`
  ).run(DEMO_BATCH_KIND)
  db.prepare(
    `DELETE FROM voucher_batches WHERE kind = ? AND NOT EXISTS (SELECT 1 FROM vouchers WHERE batch_id = voucher_batches.id)`
  ).run(DEMO_BATCH_KIND)
}

// Ein Weitergabe-Stapel je Eintrag in KUNDEN_GUTSCHEINE, angelegt wie ensureVoucherQuota (Bezeichnung, ausgebender
// Bereich, partner_id) - nur mit Stapel-Art DEMO_BATCH_KIND, damit sich kein Code je einlösen lässt (lib/vouchers.js
// assertVoucherOpen). Die ersten Codes gelten als eingelöst (redeemed_at über die letzten Wochen verteilt, Geheimtext
// weg wie beim echten Einlösen), die nächsten als zurückgezogen. Gibt die Anzahl der Codes je Partner-Slug zurück.
function insertDemoVoucherStacks(db, areas) {
  const markRedeemed = db.prepare("UPDATE vouchers SET redeemed_at = datetime('now', ?), code_cipher = NULL WHERE id = ?")
  const markRevoked = db.prepare("UPDATE vouchers SET revoked_at = datetime('now', ?), code_cipher = NULL WHERE id = ?")
  const voucherIds = db.prepare('SELECT id FROM vouchers WHERE batch_id = ? ORDER BY id')

  const counts = {}
  for (const { partnerSlug, size, eingeloest, widerrufen } of KUNDEN_GUTSCHEINE) {
    const area = areas.find((entry) => entry.slug === partnerSlug)
    if (!area) throw new Error(`Demo-Partner "${partnerSlug}" hat keinen Bereich für seine Kunden-Gutscheine`)
    if (eingeloest + widerrufen > size) throw new Error(`Demo-Kunden-Gutscheine für "${partnerSlug}": mehr eingelöst/zurückgezogen als Codes`)
    const { name } = db.prepare('SELECT name FROM partners WHERE id = ?').get(area.partnerId)
    const { batchId } = createBatch(db, {
      label: `Weitergabe ${name}`,
      kind: DEMO_BATCH_KIND,
      size,
      issuedByFamilyId: area.familyId,
      partnerId: area.partnerId
    })
    const ids = voucherIds.all(batchId).map((row) => row.id)
    ids.slice(0, eingeloest).forEach((id, index) => markRedeemed.run(`-${(index + 1) * 5} days`, id))
    ids.slice(eingeloest, eingeloest + widerrufen).forEach((id) => markRevoked.run('-2 days', id))
    counts[partnerSlug] = size
  }
  return counts
}

function createDemoPartnerAreas(db, { copyImage }) {
  const areas = insertDemoPartnerAreas(db)
  const einblicke = insertDemoEinblicke(db, copyImage)
  removeDemoVoucherStacks(db)
  const kundenGutscheine = insertDemoVoucherStacks(db, areas)
  return { areas, einblicke, kundenGutscheine }
}

// --- Phase P2 Task 9: Beiträge und Posteingänge der Demo-Partner -----------------------------------------

// V-Fehler 3: auch abgelehnt - dann mit einem Grund, der die Prüfung des Admins besteht.
const DEMO_POST_FREIGABEN = [FREIGABE.eingereicht, FREIGABE.freigegeben, FREIGABE.abgelehnt]
// Welche Freigabe ein Eintrag im Verlauf hinterlässt - geaendert lässt sie, wie sie war (null = unverändert).
const VERLAUF_FREIGABE = Object.freeze({
  [VERLAUF_AKTION.eingereicht]: FREIGABE.eingereicht,
  [VERLAUF_AKTION.geaendert]: null,
  [VERLAUF_AKTION.freigegeben]: FREIGABE.freigegeben,
  [VERLAUF_AKTION.abgelehnt]: FREIGABE.abgelehnt
})

// Fehler einer echten Prüfung mit dem Seed-Eintrag in der Meldung, damit er auffindbar ist.
function validateSeedEntry(label, validate) {
  try {
    return validate()
  } catch (err) {
    throw new Error(`${label} ist ungültig: ${err.message}`)
  }
}

// V-Fehler 3: der Verlauf eines Seed-Beitrags - beginnt mit "eingereicht", nur bekannte Aktionen, tageAlt als ganze
// Zahl ≥ 0 und nie jünger als der Eintrag danach, und er endet bei der angegebenen Freigabe. Ohne verlauf: nur
// "eingereicht" (und die Entscheidung) von heute.
function validateDemoVerlauf(label, verlauf, freigabe) {
  const entries = verlauf ?? [{ aktion: VERLAUF_AKTION.eingereicht, tageAlt: 0 }, ...(freigabe === FREIGABE.eingereicht ? [] : [{ aktion: freigabe, tageAlt: 0 }])]
  if (!Array.isArray(entries) || entries[0]?.aktion !== VERLAUF_AKTION.eingereicht) throw new Error(`${label}: Verlauf muss mit "eingereicht" beginnen`)
  let state = null
  entries.forEach(({ aktion, tageAlt }, index) => {
    if (!Object.hasOwn(VERLAUF_FREIGABE, aktion)) throw new Error(`${label}: unbekannte Aktion im Verlauf: ${aktion}`)
    const older = entries[index - 1]
    if (!Number.isInteger(tageAlt) || tageAlt < 0 || (older && tageAlt > older.tageAlt)) throw new Error(`${label}: Verlauf braucht tageAlt ≥ 0, älteste zuerst`)
    state = VERLAUF_FREIGABE[aktion] ?? state
  })
  if (state !== freigabe) throw new Error(`${label}: Verlauf endet bei "${state}", die Freigabe ist "${freigabe}"`)
  return entries
}

// Dieselbe Prüfung wie POST /api/partner-area/posts (Bereich zum Partner-Typ, immer "Anzeige", Züchter-Schutz,
// Link, Datum) und dasselbe Einfügen (lib/partnerPosts.js insertPost: erstellt_von_partner = 1, is_demo vom
// Partner, Limit). Erst ALLE prüfen, dann einfügen; Freigabe, Ablehnungsgrund und Verlauf setzt danach der Seed
// (wie der Admin) - der von insertPost angelegte "eingereicht"-Eintrag von heute weicht dem Verlauf aus dem Seed.
function insertDemoPartnerPosts(db) {
  const prepared = POSTS.map(({ partnerSlug, freigabe, ablehnungsgrund, verlauf, ...input }) => {
    const label = `Demo-Beitrag "${input.titel}" für "${partnerSlug}"`
    const partner = findDemoPartner(db, partnerSlug, label)
    if (!DEMO_POST_FREIGABEN.includes(freigabe)) throw new Error(`${label}: Freigabe muss einer von ${DEMO_POST_FREIGABEN.join(', ')} sein`)
    if ((freigabe === FREIGABE.abgelehnt) !== (ablehnungsgrund !== undefined)) {
      throw new Error(`${label}: einen Ablehnungsgrund gibt es genau bei der Freigabe "${FREIGABE.abgelehnt}"`)
    }
    const grund = ablehnungsgrund === undefined ? null : validateSeedEntry(label, () => validateAblehnungsgrund(ablehnungsgrund))
    const clean = validateSeedEntry(label, () => validatePartnerPost(input, partner))
    return { partner, freigabe, grund, verlauf: validateDemoVerlauf(label, verlauf, freigabe), clean }
  })
  const setFreigabe = db.prepare('UPDATE promotions SET freigabe = ?, ablehnungsgrund = ? WHERE id = ?')
  const clearVerlauf = db.prepare('DELETE FROM promotion_events WHERE promotion_id = ?')
  const timeAgo = db.prepare("SELECT datetime('now', ?) AS t")
  return prepared.map(({ partner, freigabe, grund, verlauf, clean }) => {
    const { id } = insertPost(partner, clean)
    setFreigabe.run(freigabe, grund, id)
    clearVerlauf.run(id)
    for (const { aktion, tageAlt } of verlauf) {
      const createdAt = timeAgo.get(`-${tageAlt} days`).t
      recordPromotionEvent(id, aktion, { grund: aktion === VERLAUF_AKTION.abgelehnt ? grund : null, createdAt })
    }
    return id
  })
}

// Steckbrief-Slug eines veröffentlichten Tiers aus dem Tierheim-Bereich des Partners (für bezugTier) - die
// eigentliche Prüfung macht danach validateContactMessage wie beim Kontaktformular.
function findShelterAnimalSlug(db, partner, name) {
  const row = db
    .prepare(
      `SELECT d.public_slug FROM dogs d JOIN families f ON f.id = d.family_id
       WHERE f.partner_id = ? AND f.art = ? AND d.name = ? AND d.public_slug IS NOT NULL`
    )
    .get(partner.id, ART.tierheim, name)
  if (!row) throw new Error(`Demo-Tier "${name}" fehlt im Tierheim-Bereich von "${partner.slug}"`)
  return row.public_slug
}

// Dieselbe Prüfung wie das Kontaktformular (lib/partnerMessages.js validateContactMessage) und dasselbe
// Speichern (insertMessage, is_demo vom Partner). stundenAlt/gelesen setzen Eingangs- und Lesezeitpunkt.
function insertDemoMessages(db) {
  const prepared = MESSAGES.map(({ partnerSlug, bezugTier, stundenAlt = 1, gelesen = false, ...input }) => {
    const label = `Demo-Nachricht von "${input.name}" an "${partnerSlug}"`
    const partner = findDemoPartner(db, partnerSlug, label)
    const bezugSlug = bezugTier ? findShelterAnimalSlug(db, partner, bezugTier) : undefined
    return { partner, stundenAlt, gelesen, clean: validateSeedEntry(label, () => validateContactMessage({ ...input, bezugSlug }, partner)) }
  })
  const timeAgo = db.prepare("SELECT datetime('now', ?) AS t")
  const counts = {}
  for (const { partner, stundenAlt, gelesen, clean } of prepared) {
    const createdAt = timeAgo.get(`-${stundenAlt} hours`).t
    const gelesenAt = gelesen ? timeAgo.get(`-${Math.max(stundenAlt - 1, 0)} hours`).t : null
    insertMessage(partner, clean, { createdAt, gelesenAt })
    counts[partner.slug] = (counts[partner.slug] || 0) + 1
  }
  return counts
}

// Läuft innerhalb der replaceDemoPack-Transaktion NACH replaceDemoDiscoverContent (lib/demoPack.js) - das räumt
// alle Demo-Empfehlungen (is_demo = 1, also auch die alten Beiträge der Demo-Partner) samt Klicks weg und
// träfe sonst auch die neuen. Die alten Demo-Nachrichten (is_demo = 1 oder an einen alten Demo-Partner) räumt
// diese Funktion selbst weg. Gibt die neuen Beitrags-Ids und die Nachrichten je Partner-Slug zurück.
function createDemoPartnerContent(db, { previousPartnerIds = [] } = {}) {
  const placeholders = previousPartnerIds.map(() => '?').join(', ')
  const where = previousPartnerIds.length ? `is_demo = 1 OR partner_id IN (${placeholders})` : 'is_demo = 1'
  db.prepare(`DELETE FROM partner_messages WHERE ${where}`).run(...previousPartnerIds)
  return { postIds: insertDemoPartnerPosts(db), messages: insertDemoMessages(db) }
}

module.exports = { createDemoPartnerAreas, createDemoPartnerContent }
