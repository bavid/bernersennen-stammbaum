'use strict'

// Phase P1 Task 4: Demo-Partner-Bereiche (art 'partner') und Demo-Einblicke aus seed/demo-partner-area.js.
// Läuft innerhalb der replaceDemoPack-Transaktion (lib/demoPack.js), und zwar NACH insertDemoPartners (die
// Bereiche und Einblicke brauchen die neuen Partner-Ids) und NACH removeDemoEinblicke (das räumt alle
// Einblicke mit is_demo = 1 weg und träfe sonst auch die neuen). Scheitert etwas, rollt die Transaktion
// alles zurück; die schon kopierten Fotos entfernt replaceDemoPack über copyImage.copiedUrls().

const { ART } = require('./context')
const { areaArtForTyp, findPartnerArea, insertPartnerArea } = require('./partnerAreas')
const { MAX_EINBLICKE, validateNewEinblick } = require('./einblicke')
const { PARTNER_AREA_SLUGS, EINBLICKE } = require('../seed/demo-partner-area')

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

function createDemoPartnerAreas(db, { copyImage }) {
  const areas = insertDemoPartnerAreas(db)
  const einblicke = insertDemoEinblicke(db, copyImage)
  return { areas, einblicke }
}

module.exports = { createDemoPartnerAreas }
