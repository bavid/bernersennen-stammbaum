const express = require('express')
const rateLimit = require('express-rate-limit')
const db = require('../db')
const config = require('../config')
const { requireSession } = require('../middleware/auth')
const { ipKeyGenerator } = require('../lib/rateLimitKey')
const { lookupPlz, distanceKm } = require('../lib/geo')
const { publicPartner, publicPartnerSql } = require('../lib/partners')
const { promotionPublicSql, promotionActiveSql, promotionImageUrl } = require('../lib/promotions')
const { getShelterAnimalCards } = require('./publicAnimals')
const { teaserFotoSql, teaserFoto } = require('../lib/einblicke')
const { cardEinblicke } = require('../lib/einblickPins')
const { groupCardAnzeigen, CARD_BEREICH_BY_TYP } = require('../lib/partnerPostOrder')
const { nextTermine } = require('../lib/partnerTermine')
const { parseZeitraeume, upcomingZeitraeume } = require('../lib/promotionZeitraeume')
const { berlinNow } = require('../lib/terminSerien')
const { MIN_IN_RADIUS, sortByName, roundKm, withDistances, splitByRadius, radiusSection } = require('../lib/nearby')

// Phase 3 Task 2: Reiter "Entdecken" - eine Antwort bündelt alle Abschnitte (seit Phase P2 Task 9 auch salon)
// (docs/superpowers/plans/2026-09-29-phase-3-entdecken.md). requireSession statt requireAuth: die Demo
// darf mitlesen (wie bei places.js), Schreibzugriffe gibt es hier ohnehin nicht.

const router = express.Router()

const TEN_MINUTES = 10 * 60 * 1000
const RADIUS_VALUES = [5, 10, 25, 50, 100]
const MAX_BEGLEITER_TIERE = 12
// Partner-Typen je Abschnitt. Umkreis-Fallback (weniger als 5 im Radius -> die nächsten außerhalb) für alle
// Partner-Abschnitte gleich: lib/nearby.js radiusSection. Phase P2 Task 9: Hundesalons und Betreuung haben
// einen eigenen Abschnitt salon (vorher standen sie bei den Hundeschulen).
// Phase V1: aus derselben Zuordnung wie die Karten-Bereiche (lib/partnerPostOrder.js CARD_BEREICH_BY_TYP) - Abschnitt,
// Partner-Typen und der Bereich der Anzeigen auf der Karte können so nicht auseinanderlaufen.
const typsForBereich = (bereich) => Object.keys(CARD_BEREICH_BY_TYP).filter((typ) => CARD_BEREICH_BY_TYP[typ] === bereich)
const HUNDESCHULEN_TYPS = typsForBereich('hundeschule')
const SALON_TYPS = typsForBereich('salon')
const BEGLEITER_TYPS = typsForBereich('begleiter')

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

// Partner (Tierheime, Vermittlungsstellen, Hundeschulen): eine Demo-Sitzung sieht NUR Demo-Partner, eine
// echte NUR echte - außer in appEnv dev/staging, wo eine echte Test-Sitzung zusätzlich die Demo-Partner
// sieht (wie partners.js demoAllowed). Anders als bei Empfehlungen/Spendenberichten/Einstellungen gibt es
// hier also einen dev/staging-Bonus (siehe Aufgabenstellung Task 2).
function partnerDemoValues(isDemo) {
  if (isDemo) return [1]
  if (config.appEnv === 'dev' || config.appEnv === 'staging') return [0, 1]
  return [0]
}

// Empfehlungen/Anzeigen und Spendenberichte bleiben STRIKT nach is_demo getrennt, ohne dev/staging-Bonus
// (Aufgabenstellung: "promotions/reports/settings stay separated by is_demo").
function contentDemoValue(isDemo) {
  return isDemo ? 1 : 0
}

// settings-Schlüssel: Demo-Sitzungen lesen die demo_*-Schlüssel, echte die echten (siehe
// routes/adminMarketing.js SETTINGS_KEYS, das genau diese Paare pflegt).
function settingsKey(isDemo, base) {
  return isDemo ? `demo_${base}` : base
}

// Aktiv und nicht gesperrt (Phase P Task 1) - ein gesperrter Partner verschwindet samt seiner Tiere
// (begleiter.tiere hängt an diesen Zeilen) und seiner Spendenkarte aus "Entdecken". teaser_foto_url
// (Phase P Task 3b, lib/einblicke.js teaserFotoSql) kommt in derselben Abfrage mit - keine Abfrage je Karte.
function activePartnerRows(typs, isDemo) {
  const demoValues = partnerDemoValues(isDemo)
  const typPlaceholders = typs.map(() => '?').join(', ')
  const demoPlaceholders = demoValues.map(() => '?').join(', ')
  return db
    .prepare(
      `SELECT *, ${teaserFotoSql()} FROM partners
       WHERE ${publicPartnerSql()} AND typ IN (${typPlaceholders}) AND is_demo IN (${demoPlaceholders})`
    )
    .all(...typs, ...demoValues)
}

// Aktive Empfehlungen/Anzeigen eines Bereichs im Zeitfenster (NULL = offen), nach sort/Titel sortiert.
// Nur freigegebene (Phase P2 Task 8: Beiträge der Partner warten auf den Admin), und hängt eine Empfehlung
// an einem Partner, muss der öffentlich sichtbar sein (lib/promotions.js promotionPublicSql).
function activePromotionRows(bereich, isDemo) {
  return db
    .prepare(
      `SELECT m.* FROM promotions m
       LEFT JOIN partners p ON p.id = m.partner_id
       WHERE m.bereich = ? AND m.is_demo = ?
         AND ${promotionActiveSql('m')}
         AND ${promotionPublicSql('m', 'p')}
       ORDER BY m.sort, m.titel`
    )
    .all(bereich, contentDemoValue(isDemo))
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
        tiere.push(dist === undefined ? animal : { ...animal, distanceKm: roundKm(dist), ausserhalb })
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

// Phase V1: Kurzbeschreibung im Kopf der Partner-Karte - der Portal-Titel, sonst der erste Satz des Portal-Texts,
// höchstens KURZTEXT_MAX Zeichen (an einer Wortgrenze gekürzt). Reiner Text wie beide Quellen; ohne beides null.
const KURZTEXT_MAX = 140

function kurztext(row) {
  const titel = typeof row.portal_titel === 'string' ? row.portal_titel.trim() : ''
  if (titel) return titel
  const text = typeof row.portal_text === 'string' ? row.portal_text.trim() : ''
  if (!text) return null
  const [firstSentence] = text.split(/\n/)[0].split(/(?<=[.!?])\s/)
  if (firstSentence.length <= KURZTEXT_MAX) return firstSentence
  const cut = firstSentence.slice(0, KURZTEXT_MAX)
  const space = cut.lastIndexOf(' ')
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:–-]+$/, '')} …`
}

// Partner-Karte: wie lib/partners.js publicPartner, aber die Website läuft über die Klickzählung
// (clickUrl + rohe url zur Anzeige) statt roh im Feld "website" zu stehen (Aufgabenstellung: "Every
// external link is delivered as clickUrl ... plus the raw url for display").
function partnerCard(row, { distanceKm: distanceKmValue, ausserhalb } = {}) {
  const { website, ...pub } = publicPartner(row)
  return {
    ...pub,
    kind: 'partner',
    kurztext: kurztext(row),
    teaserFoto: teaserFoto(row),
    url: website || null,
    clickUrl: website ? `/r/partner-website/${row.id}` : null,
    ...(distanceKmValue !== undefined ? { distanceKm: distanceKmValue } : {}),
    ...(ausserhalb !== undefined ? { ausserhalb } : {})
  }
}

// Empfehlungs-Karte - auch für die Beiträge auf dem Portal (routes/partners.js) und in der Kundensicht
// (routes/partnerArea/preview.js). Phase V4a: zeitraeume - nur die Termine, die heute oder später noch laufen.
function promotionCard(row) {
  return {
    id: row.id,
    kind: 'promotion',
    bereich: row.bereich,
    kennzeichnung: row.kennzeichnung,
    empfohlenVon: row.empfohlen_von,
    titel: row.titel,
    text: row.text,
    bildUrl: promotionImageUrl(row.bild_file),
    tierart: row.tierart,
    zeitraeume: upcomingZeitraeume(parseZeitraeume(row.zeitraeume), berlinNow().datum),
    url: row.url,
    clickUrl: row.url ? `/r/promotion/${row.id}` : null
  }
}

// Karten eines Empfehlungs-Bereichs (futter, hundeschule, salon, begleiter, unterstuetzen - lib/promotions.js
// BEREICH_VALUES): dieselbe Abfrage (aktiv, Zeitfenster, Demo-Trennung, sichtbarer Partner), dieselbe
// Sortierung nach Partner-Entfernung und dieselbe Kartenform für jeden Abschnitt.
function promotionCards(bereich, isDemo, distanceMap) {
  return sortPromotionsByPartnerDistance(activePromotionRows(bereich, isDemo), distanceMap).map(promotionCard)
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

function newestDonationReport(isDemo) {
  const row = db
    .prepare('SELECT * FROM donation_reports WHERE is_demo = ? ORDER BY created_at DESC, id DESC LIMIT 1')
    .get(contentDemoValue(isDemo))
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

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// { plz?, radius? } aus dem Body -> { center, radiusKm } (beides null ohne PLZ) - oder 400. Exportiert für
// die Kundensicht der Partner (routes/partnerArea/preview.js POST /preview/discover).
function resolveDiscoverCenter({ plz, radius } = {}) {
  if (plz === undefined || plz === null || plz === '') return { center: null, radiusKm: null }
  const radiusKm = Number(radius)
  if (!RADIUS_VALUES.includes(radiusKm)) throw httpError(400, 'Der Umkreis muss 5, 10, 25, 50 oder 100 km sein')
  const hit = lookupPlz(typeof plz === 'string' ? plz.trim() : '')
  if (!hit) throw httpError(400, 'Diese Postleitzahl kennen wir nicht')
  return { center: { lat: hit.lat, lon: hit.lon, ort: hit.ort }, radiusKm }
}

function partnerCardFromItem({ row, distanceKm: d, ausserhalb }) {
  return partnerCard(row, { distanceKm: d, ausserhalb })
}

// Phase V1: eine Karte je Partner - der Kopf (partnerCard), darunter anzeigen (bis zu drei Empfehlungen des Partners
// aus dem Bereich des Abschnitts, in seiner Reihenfolge, lib/partnerPostOrder.js) und einblicke (angepinnte, sonst die
// neuesten drei, lib/einblickPins.js), seit Phase V4a dazu naechsterTermin (lib/partnerTermine.js, null ohne kommenden
// Termin). Alles für alle Karten mit je EINER Abfrage, nicht je Karte.
function withCardContent(card, { anzeigen, einblicke, termine }) {
  return {
    ...card,
    anzeigen: (anzeigen.get(card.id) || []).map(promotionCard),
    einblicke: einblicke.get(card.id) || [],
    naechsterTermin: termine.get(card.id) || null
  }
}

// Ein Partner-Abschnitt (hundeschulen, salon, begleiter): Partner-Karten im Umkreis mit Fallback (lib/nearby.js),
// samt ihren Anzeigen und Einblicken. promotions: die Empfehlungen des Bereichs, die als eigene Karte bleiben - ohne
// Partner oder mit einem Partner, der nicht in diesen Abschnitt gehört (sortiert nach dessen Entfernung). Die eines
// Partners aus diesem Abschnitt, dessen Karte nicht gezeigt wird (außerhalb des Umkreises), fallen mit ihr weg.
// rows/items: alle passenden bzw. die gezeigten Partner (für die Tiere und Spendenlinks der Begleiter).
function partnerSection(typs, bereich, { isDemo, center, radiusKm, distanceMap }) {
  const partnerRows = activePartnerRows(typs, isDemo)
  const section = radiusSection(partnerRows, center, radiusKm)
  const shownIds = section.items.map(({ row }) => row.id)
  const sectionPartnerIds = new Set(partnerRows.map((row) => row.id))
  const promotionRows = activePromotionRows(bereich, isDemo)
  const anzeigen = groupCardAnzeigen(promotionRows, shownIds)
  const einblicke = cardEinblicke(shownIds)
  const termine = nextTermine(shownIds)
  const separate = promotionRows.filter((row) => row.partner_id === null || !sectionPartnerIds.has(row.partner_id))
  return {
    rows: partnerRows,
    items: section.items,
    cards: section.items.map((item) => withCardContent(partnerCardFromItem(item), { anzeigen, einblicke, termine })),
    promotions: sortPromotionsByPartnerDistance(separate, distanceMap).map(promotionCard),
    fallback: section.fallback
  }
}

// Die ganze "Entdecken"-Antwort - ohne req/res, damit die Kundensicht der Partner (routes/partnerArea/
// preview.js) genau die Antwort einer Demo-Sitzung als Grundlage nehmen kann. isDemo: Demo- oder echte
// Sicht (Partner, Empfehlungen, Berichte, Einstellungen); center/radiusKm aus resolveDiscoverCenter.
function buildDiscover({ isDemo, center, radiusKm }) {
  const distanceMap = partnerDistanceMap(center)

  // --- Hundeschule gesucht? / Hundesalon oder Betreuung gesucht? / Neuer Begleiter gesucht? ---------
  const sectionOptions = { isDemo, center, radiusKm, distanceMap }
  const hundeschulen = partnerSection(HUNDESCHULEN_TYPS, 'hundeschule', sectionOptions)
  const salon = partnerSection(SALON_TYPS, 'salon', sectionOptions)
  const begleiter = partnerSection(BEGLEITER_TYPS, 'begleiter', sectionOptions)
  const begleiterTiereSectionResult = begleiterTiereSection(begleiter.rows, center, radiusKm)

  // --- Futter-Empfehlungen --------------------------------------------------------------------------
  const futter = promotionCards('futter', isDemo, distanceMap)

  // --- Unterstützen -----------------------------------------------------------------------------------
  const gofundmeUrl = readSettingValue(settingsKey(isDemo, 'gofundme_url'))
  // Spendenlinks laufen über dieselbe Partner-Liste wie begleiter.partner (inkl. eines etwaigen
  // Umkreis-Fallbacks) - eigene Ausserhalb-Kennzeichnung gibt es dafür nicht (nicht Teil des Auftrags).
  const partnerSpenden = begleiter.items
    .map(({ row }) => row)
    .filter((row) => row.spenden_url)
    .map(spendenCard)
  const unterstuetzenPromotions = promotionCards('unterstuetzen', isDemo, distanceMap)

  return {
    ...(center ? { center } : {}),
    fallback: {
      hundeschulen: hundeschulen.fallback,
      salon: salon.fallback,
      begleiter: begleiter.fallback || begleiterTiereSectionResult.fallback
    },
    hundeschulen: [...hundeschulen.cards, ...hundeschulen.promotions],
    salon: [...salon.cards, ...salon.promotions],
    begleiter: { partner: begleiter.cards, tiere: begleiterTiereSectionResult.items, promotions: begleiter.promotions },
    futter,
    unterstuetzen: {
      gofundmeUrl,
      gofundmeClickUrl: gofundmeUrl ? `/r/gofundme/${isDemo ? 1 : 0}` : null,
      text: readSettingValue(settingsKey(isDemo, 'unterstuetzen_text')),
      bericht: newestDonationReport(isDemo),
      partnerSpenden,
      promotions: unterstuetzenPromotions
    }
  }
}

// POST /api/discover { plz?, radius? } - die PLZ steht bewusst im Body statt in der URL (wie POST
// /api/public/partners/near, siehe dort für die Begründung: Server-/Proxy-Zugriffslogs).
router.post('/', discoverLimiter, requireSession, (req, res, next) => {
  try {
    const { center, radiusKm } = resolveDiscoverCenter(req.body || {})
    res.json(buildDiscover({ isDemo: Boolean(req.isDemo), center, radiusKm }))
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

module.exports = router
module.exports.buildDiscover = buildDiscover
module.exports.resolveDiscoverCenter = resolveDiscoverCenter
module.exports.partnerCard = partnerCard
module.exports.promotionCard = promotionCard
module.exports.spendenCard = spendenCard
module.exports.discoverLimiter = discoverLimiter
module.exports.MAX_BEGLEITER_TIERE = MAX_BEGLEITER_TIERE
