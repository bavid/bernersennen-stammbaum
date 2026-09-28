const express = require('express')
const rateLimit = require('express-rate-limit')
const db = require('../db')
const config = require('../config')
const { requireSession } = require('../middleware/auth')
const { ipKeyGenerator } = require('../lib/rateLimitKey')
const { lookupPlz, distanceKm } = require('../lib/geo')
const { publicPartner, publicPartnerSql } = require('../lib/partners')
const { promotionPartnerVisibleSql } = require('../lib/promotions')
const { getShelterAnimalCards } = require('./publicAnimals')

// Phase 3 Task 2: Reiter "Entdecken" - eine Antwort bündelt alle vier Abschnitte
// (docs/superpowers/plans/2026-09-29-phase-3-entdecken.md). requireSession statt requireAuth: die Demo
// darf mitlesen (wie bei places.js), Schreibzugriffe gibt es hier ohnehin nicht.

const router = express.Router()

const TEN_MINUTES = 10 * 60 * 1000
const RADIUS_VALUES = [5, 10, 25, 50, 100]
const MAX_BEGLEITER_TIERE = 12
// Umkreis-Fallback (Koordinator-Folgeauftrag): zeigt ein dünn besiedelter Umkreis weniger als 5
// Einträge, werden die nächsten Treffer AUSSERHALB des Radius ergänzt (ausserhalb: true), damit die
// Seite nie fast leer wirkt. Ab 5 echten Treffern im Radius bleibt es beim harten Ausschluss wie bisher.
const MIN_IN_RADIUS = 5
// review finding (Important): ein dünn besiedelter Umkreis mit sehr vielen Partnern insgesamt sollte
// nicht ALLE davon außerhalb anhängen (unbegrenzte Antwortgröße) - nur die nächsten 20.
const MAX_FALLBACK = 20

// Eigenes, knappes Limit pro IP zusätzlich zum globalen apiLimiter (app.js: app.use('/api', apiLimiter))
// - wie places.js placesLimiter, gleiche Werte und derselbe IPv6-maskierende Schlüssel.
const discoverLimiter = rateLimit({
  windowMs: TEN_MINUTES,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: { error: 'Zu viele Anfragen in kurzer Zeit – bitte einen Moment warten.' }
})

function sortByName(rows) {
  return rows.slice().sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

// Partner (Tierheime, Vermittlungsstellen, Hundeschulen): eine Demo-Sitzung sieht NUR Demo-Partner, eine
// echte NUR echte - außer in appEnv dev/staging, wo eine echte Test-Sitzung zusätzlich die Demo-Partner
// sieht (wie partners.js demoAllowed). Anders als bei Empfehlungen/Spendenberichten/Einstellungen gibt es
// hier also einen dev/staging-Bonus (siehe Aufgabenstellung Task 2).
function partnerDemoValues(req) {
  if (req.isDemo) return [1]
  if (config.appEnv === 'dev' || config.appEnv === 'staging') return [0, 1]
  return [0]
}

// Empfehlungen/Anzeigen und Spendenberichte bleiben STRIKT nach is_demo getrennt, ohne dev/staging-Bonus
// (Aufgabenstellung: "promotions/reports/settings stay separated by is_demo").
function contentDemoValue(req) {
  return req.isDemo ? 1 : 0
}

// settings-Schlüssel: Demo-Sitzungen lesen die demo_*-Schlüssel, echte die echten (siehe
// routes/adminMarketing.js SETTINGS_KEYS, das genau diese Paare pflegt).
function settingsKey(req, base) {
  return req.isDemo ? `demo_${base}` : base
}

// Aktiv und nicht gesperrt (Phase P Task 1) - ein gesperrter Partner verschwindet samt seiner Tiere
// (begleiter.tiere hängt an diesen Zeilen) und seiner Spendenkarte aus "Entdecken".
function activePartnerRows(typs, req) {
  const demoValues = partnerDemoValues(req)
  const typPlaceholders = typs.map(() => '?').join(', ')
  const demoPlaceholders = demoValues.map(() => '?').join(', ')
  return db
    .prepare(`SELECT * FROM partners WHERE ${publicPartnerSql()} AND typ IN (${typPlaceholders}) AND is_demo IN (${demoPlaceholders})`)
    .all(...typs, ...demoValues)
}

// Aktive Empfehlungen/Anzeigen eines Bereichs im Zeitfenster (NULL = offen), nach sort/Titel sortiert.
// Hängt eine Empfehlung an einem Partner, muss der öffentlich sichtbar sein (promotionPartnerVisibleSql).
function activePromotionRows(bereich, req) {
  return db
    .prepare(
      `SELECT m.* FROM promotions m
       LEFT JOIN partners p ON p.id = m.partner_id
       WHERE m.bereich = ? AND m.aktiv = 1 AND m.is_demo = ?
         AND (m.start IS NULL OR m.start <= date('now'))
         AND (m.ende IS NULL OR m.ende >= date('now'))
         AND ${promotionPartnerVisibleSql('m', 'p')}
       ORDER BY m.sort, m.titel`
    )
    .all(bereich, contentDemoValue(req))
}

// Hängt an jede Zeile mit gültigem lat/lon die Entfernung zu center - ohne Koordinaten fliegt eine Zeile
// bei einer Umkreissuche ganz raus (wie bisher: keine Koordinaten -> keine Entfernung -> kein Auftritt).
function withDistances(rows, center) {
  return rows
    .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lon))
    .map((row) => ({ row, dist: distanceKm(center, { lat: row.lat, lon: row.lon }) }))
}

// Teilt Zeilen-mit-Entfernung in "im Radius" (aufsteigend sortiert) und "außerhalb" (ebenfalls
// aufsteigend, also die nächstgelegenen zuerst) - Grundlage sowohl für Partner-Listen als auch für
// begleiter.tiere, das unabhängig von der Partner-Schwelle eine eigene Tier-Schwelle hat.
function splitByRadius(rowsWithDistance, radiusKm) {
  const inRadius = rowsWithDistance.filter(({ dist }) => dist <= radiusKm).sort((a, b) => a.dist - b.dist)
  const outside = rowsWithDistance.filter(({ dist }) => dist > radiusKm).sort((a, b) => a.dist - b.dist)
  return { inRadius, outside }
}

// Partner-Abschnitt (hundeschulen-Partner, begleiter.partner) mit Umkreis-Fallback: ohne PLZ alle nach
// Name; mit PLZ die Treffer im Radius (distanceKm, ausserhalb: false) - und, wenn das WENIGER als
// MIN_IN_RADIUS sind, zusätzlich die nächsten bis zu MAX_FALLBACK Treffer außerhalb (ausserhalb: true),
// nach Entfernung sortiert, damit die Seite nie fast leer wirkt (Koordinator-Folgeauftrag). Ab
// MIN_IN_RADIUS Treffern im Radius bleibt es beim harten Ausschluss wie bisher (fallback bleibt false).
function partnerSection(rows, center, radiusKm) {
  if (!center) return { items: sortByName(rows).map((row) => ({ row })), fallback: false }

  const { inRadius, outside } = splitByRadius(withDistances(rows, center), radiusKm)
  const toCardInput = (ausserhalb) => ({ row, dist }) => ({ row, distanceKm: Math.round(dist * 10) / 10, ausserhalb })

  let items = inRadius.map(toCardInput(false))
  let fallback = false
  if (inRadius.length < MIN_IN_RADIUS && outside.length) {
    fallback = true
    // outside ist bereits aufsteigend nach Entfernung sortiert (splitByRadius) - slice(0, MAX_FALLBACK)
    // sind also automatisch die MAX_FALLBACK nächstgelegenen, nicht irgendwelche.
    items = items.concat(outside.slice(0, MAX_FALLBACK).map(toCardInput(true)))
  }
  return { items, fallback }
}

// begleiter.tiere: eigene Schwelle auf Tier-Ebene (nicht auf Partner-Ebene) - selbst wenn schon genug
// Partner im Radius liegen, können deren Steckbriefe zusammen trotzdem unter MIN_IN_RADIUS bleiben, dann
// ergänzt der Fallback Tiere weiterer, weiter entfernter Tierheime/Vermittlungsstellen.
//
// review finding (Important, N+1): getShelterAnimalCards() ist eine eigene DB-Abfrage je Partner - ein
// einfaches flatMap über ALLE Zeilen würde sie auch dann für jeden einzelnen Partner ausführen, wenn
// MAX_BEGLEITER_TIERE längst erreicht ist. collectTiere() bricht die Schleife (Partner UND das
// Aufsammeln selbst) ab, sobald genug Tiere gesammelt sind - ruft getShelterAnimalCards also nie öfter
// auf als nötig, um bis zu MAX_BEGLEITER_TIERE Karten zu füllen.
function begleiterTiereSection(partnerRows, center, radiusKm) {
  function collectTiere(entries, ausserhalb, tiere) {
    for (const { row, dist } of entries) {
      if (tiere.length >= MAX_BEGLEITER_TIERE) break
      for (const animal of getShelterAnimalCards(row.id)) {
        if (tiere.length >= MAX_BEGLEITER_TIERE) break
        tiere.push(dist === undefined ? animal : { ...animal, distanceKm: Math.round(dist * 10) / 10, ausserhalb })
      }
    }
  }

  if (!center) {
    const tiere = []
    collectTiere(
      sortByName(partnerRows).map((row) => ({ row, dist: undefined })),
      false,
      tiere
    )
    return { items: tiere, fallback: false }
  }

  const { inRadius, outside } = splitByRadius(withDistances(partnerRows, center), radiusKm)
  const tiere = []
  collectTiere(inRadius, false, tiere)

  let fallback = false
  if (tiere.length < MIN_IN_RADIUS && outside.length) {
    fallback = true
    collectTiere(outside, true, tiere)
  }
  return { items: tiere, fallback }
}

// Alle Partner-Koordinaten auf einmal (unabhängig von Typ/Status/Demo - reine Anzeige-Sortierhilfe für
// Empfehlungen, siehe sortPromotionsByPartnerDistance) - eine Abfrage pro Anfrage statt einer je Zeile.
function partnerDistanceMap(center) {
  if (!center) return null
  const map = new Map()
  for (const row of db.prepare('SELECT id, lat, lon FROM partners').all()) {
    if (Number.isFinite(row.lat) && Number.isFinite(row.lon)) map.set(row.id, distanceKm(center, { lat: row.lat, lon: row.lon }))
  }
  return map
}

// Empfehlungen mit gesetztem partner_id zuerst, nach der Entfernung DIESES Partners sortiert; Empfehlungen
// ohne (auffindbaren) Partner danach, in ihrer bisherigen Reihenfolge (sort/Titel aus der SQL-Abfrage) -
// wie vom Koordinator präzisiert. Ohne PLZ bleibt die Reihenfolge unverändert.
function sortPromotionsByPartnerDistance(rows, distanceMap) {
  if (!distanceMap) return rows
  const withPartnerDistance = []
  const rest = []
  for (const row of rows) {
    const dist = row.partner_id !== null ? distanceMap.get(row.partner_id) : undefined
    if (dist !== undefined) withPartnerDistance.push({ row, dist })
    else rest.push(row)
  }
  withPartnerDistance.sort((a, b) => a.dist - b.dist)
  return [...withPartnerDistance.map(({ row }) => row), ...rest]
}

// Partner-Karte: wie lib/partners.js publicPartner, aber die Website läuft über die Klickzählung
// (clickUrl + rohe url zur Anzeige) statt roh im Feld "website" zu stehen (Aufgabenstellung: "Every
// external link is delivered as clickUrl ... plus the raw url for display").
function partnerCard(row, { distanceKm: distanceKmValue, ausserhalb } = {}) {
  const { website, ...pub } = publicPartner(row)
  return {
    ...pub,
    kind: 'partner',
    url: website || null,
    clickUrl: website ? `/r/partner-website/${row.id}` : null,
    ...(distanceKmValue !== undefined ? { distanceKm: distanceKmValue } : {}),
    ...(ausserhalb !== undefined ? { ausserhalb } : {})
  }
}

function promotionCard(row) {
  return {
    id: row.id,
    kind: 'promotion',
    bereich: row.bereich,
    kennzeichnung: row.kennzeichnung,
    empfohlenVon: row.empfohlen_von,
    titel: row.titel,
    text: row.text,
    bildUrl: row.bild_file ? `/partner-media/${row.bild_file}` : null,
    tierart: row.tierart,
    url: row.url,
    clickUrl: row.url ? `/r/promotion/${row.id}` : null
  }
}

// Karten eines Empfehlungs-Bereichs (futter, hundeschule, begleiter, unterstuetzen - lib/promotions.js
// BEREICH_VALUES): dieselbe Abfrage (aktiv, Zeitfenster, Demo-Trennung, sichtbarer Partner), dieselbe
// Sortierung nach Partner-Entfernung und dieselbe Kartenform für jeden Abschnitt.
function promotionCards(bereich, req, distanceMap) {
  return sortPromotionsByPartnerDistance(activePromotionRows(bereich, req), distanceMap).map(promotionCard)
}

function spendenCard(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    logoUrl: row.logo_file ? `/partner-media/${row.logo_file}` : null,
    url: row.spenden_url,
    clickUrl: `/r/partner-spende/${row.id}`
  }
}

function newestDonationReport(req) {
  const row = db
    .prepare('SELECT * FROM donation_reports WHERE is_demo = ? ORDER BY created_at DESC, id DESC LIMIT 1')
    .get(contentDemoValue(req))
  if (!row) return null
  return {
    zeitraum: row.zeitraum,
    eingangCents: row.eingang_cents,
    kostenCents: row.kosten_cents,
    weitergeleitetCents: row.weitergeleitet_cents,
    empfaenger: row.empfaenger,
    nachweisUrl: row.nachweis_url
  }
}

function readSettingValue(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return row?.value ? row.value : null
}

// POST /api/discover { plz?, radius? } - die PLZ steht bewusst im Body statt in der URL (wie POST
// /api/public/partners/near, siehe dort für die Begründung: Server-/Proxy-Zugriffslogs).
router.post('/', discoverLimiter, requireSession, (req, res) => {
  const { plz, radius } = req.body || {}

  let center = null
  let radiusKm = null
  if (plz !== undefined && plz !== null && plz !== '') {
    radiusKm = Number(radius)
    if (!RADIUS_VALUES.includes(radiusKm)) {
      return res.status(400).json({ error: 'Der Umkreis muss 5, 10, 25, 50 oder 100 km sein' })
    }
    const hit = lookupPlz(typeof plz === 'string' ? plz.trim() : '')
    if (!hit) return res.status(400).json({ error: 'Diese Postleitzahl kennen wir nicht' })
    center = { lat: hit.lat, lon: hit.lon, ort: hit.ort }
  }

  const distanceMap = partnerDistanceMap(center)

  // --- Hundeschule gesucht? ------------------------------------------------------------------------
  const hundeschulPartnerSection = partnerSection(activePartnerRows(['hundeschule'], req), center, radiusKm)
  const hundeschulPartner = hundeschulPartnerSection.items.map(({ row, distanceKm: d, ausserhalb }) => partnerCard(row, { distanceKm: d, ausserhalb }))
  const hundeschulPromotions = promotionCards('hundeschule', req, distanceMap)
  const hundeschulen = [...hundeschulPartner, ...hundeschulPromotions]

  // --- Neuer Begleiter gesucht? --------------------------------------------------------------------
  const begleiterPartnerRows = activePartnerRows(['tierheim', 'vermittlung'], req)
  const begleiterPartnerSection = partnerSection(begleiterPartnerRows, center, radiusKm)
  const begleiterPartner = begleiterPartnerSection.items.map(({ row, distanceKm: d, ausserhalb }) => partnerCard(row, { distanceKm: d, ausserhalb }))
  const begleiterTiereSectionResult = begleiterTiereSection(begleiterPartnerRows, center, radiusKm)
  const begleiterPromotions = promotionCards('begleiter', req, distanceMap)

  // --- Futter-Empfehlungen --------------------------------------------------------------------------
  const futter = promotionCards('futter', req, distanceMap)

  // --- Unterstützen -----------------------------------------------------------------------------------
  const gofundmeUrl = readSettingValue(settingsKey(req, 'gofundme_url'))
  // Spendenlinks laufen über dieselbe Partner-Liste wie begleiter.partner (inkl. eines etwaigen
  // Umkreis-Fallbacks) - eigene Ausserhalb-Kennzeichnung gibt es dafür nicht (nicht Teil des Auftrags).
  const partnerSpenden = begleiterPartnerSection.items
    .map(({ row }) => row)
    .filter((row) => row.spenden_url)
    .map(spendenCard)
  const unterstuetzenPromotions = promotionCards('unterstuetzen', req, distanceMap)

  res.json({
    ...(center ? { center } : {}),
    fallback: {
      hundeschulen: hundeschulPartnerSection.fallback,
      begleiter: begleiterPartnerSection.fallback || begleiterTiereSectionResult.fallback
    },
    hundeschulen,
    begleiter: { partner: begleiterPartner, tiere: begleiterTiereSectionResult.items, promotions: begleiterPromotions },
    futter,
    unterstuetzen: {
      gofundmeUrl,
      gofundmeClickUrl: gofundmeUrl ? `/r/gofundme/${req.isDemo ? 1 : 0}` : null,
      text: readSettingValue(settingsKey(req, 'unterstuetzen_text')),
      bericht: newestDonationReport(req),
      partnerSpenden,
      promotions: unterstuetzenPromotions
    }
  })
})

module.exports = router
