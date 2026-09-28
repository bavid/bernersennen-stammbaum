const path = require('node:path')
const express = require('express')
const db = require('../db')
const config = require('../config')
const { optionalSession } = require('../middleware/auth')
const { publicPartnerSql, isPubliclyVisible } = require('../lib/partners')
const { publishableSql, listedSql } = require('../lib/vermittlung')

const router = express.Router()

// Setzt req.isDemo, ohne anonyme Anfragen abzulehnen - dieselbe Demo-Regel wie routes/partners.js
// demoAllowed (bewusst hier noch einmal lokal, statt partners.js zu ändern: Task 2 fasst nur
// dogs.js/timeline.js/app.js an, siehe Plan). Ein Demo-Tierheim/-Tier ist außerhalb von dev/staging
// nur mit ?demo=1 oder einer angemeldeten Demo-Sitzung sichtbar.
router.use(optionalSession)

function demoAllowed(req) {
  if (req.query.demo === '1') return true
  if (config.appEnv === 'dev' || config.appEnv === 'staging') return true
  return Boolean(req.isDemo)
}

function toPublicMediaUrl(url) {
  return url ? `/public-media/${path.basename(url)}` : null
}

function notFound(res, message = 'Diesen Steckbrief gibt es nicht') {
  return res.status(404).json({ error: message })
}

// Nur Tiere mit gesetztem public_slug UND einem veröffentlichbaren Status (lib/vermittlung.js
// PUBLISHABLE_STATUS, inkl. "pausiert") - ein zurückgezogener oder inzwischen vermittelter Steckbrief
// liefert 404, auch wenn der Slug technisch noch in der DB steht (siehe routes/dogs.js PUT
// /:id/steckbrief für das Setzen/Löschen selbst).
const findPublishedDog = db.prepare(`SELECT * FROM dogs WHERE public_slug = @slug AND ${publishableSql()}`)

// security-review Phase T Finding 5: ein pausierter, gesperrter (Phase P Task 1) oder noch als Entwurf
// geführter Partner darf nichts öffentlich zeigen - auch wenn ein Tier seiner Tierheim-Familie technisch
// noch public_slug + veröffentlichbaren Status trägt (siehe auch lib/publicMedia.js für die Fotos).
const findShelterPartner = db.prepare(
  `SELECT p.name, p.slug, p.website, p.kontakt_email, p.kontakt_telefon, p.vermittlung_url, p.logo_file, p.is_demo
   FROM families f JOIN partners p ON p.id = f.partner_id
   WHERE f.id = @familyId AND f.art = 'tierheim' AND ${publicPartnerSql('p')}`
)

// Nur öffentliche (is_public = 1), nie private Einträge - privat = 0 ist hier eine zweite,
// verteidigende Prüfung (readEntryInput in routes/timeline.js lässt beides ohnehin nie gleichzeitig zu).
const findPublicEntries = db.prepare(
  `SELECT titel, datum, text, kategorie, foto_urls FROM timeline_entries
   WHERE dog_id = @dogId AND is_public = 1 AND privat = 0
   ORDER BY datum, id`
)

// GET /api/public/animals/:slug - der öffentliche Steckbrief eines Tiers. Kein Login, apiLimiter greift
// schon global (app.js: app.use('/api', apiLimiter)). noindex: Steckbriefe sollen nie in
// Suchmaschinen landen (Roadmap-Entscheidung 14).
router.get('/animals/:slug', (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex')

  const dog = findPublishedDog.get({ slug: req.params.slug })
  if (!dog) return notFound(res)

  const shelter = findShelterPartner.get({ familyId: dog.family_id })
  if (!shelter) return notFound(res)
  if (shelter.is_demo && !demoAllowed(req)) return notFound(res)

  const entries = findPublicEntries.all({ dogId: dog.id }).map((entry) => ({
    titel: entry.titel,
    datum: entry.datum,
    text: entry.text,
    kategorie: entry.kategorie,
    fotoUrls: JSON.parse(entry.foto_urls).map(toPublicMediaUrl)
  }))

  res.json({
    name: dog.name,
    tierart: dog.tierart,
    geschlecht: dog.geschlecht,
    rasse: dog.rasse,
    geburtsdatum: dog.geburtsdatum,
    beschreibung: dog.beschreibung,
    fotoUrl: toPublicMediaUrl(dog.foto_url),
    // Phase P Task 1: damit der Steckbrief z. B. "pausiert – gerade nicht vermittelbar" anzeigen kann
    // (wie vermittlung_status auf den Portal-Karten, siehe getShelterAnimalCards).
    vermittlung_status: dog.vermittlung_status,
    entries,
    shelter: {
      name: shelter.name,
      slug: shelter.slug,
      website: shelter.website,
      kontakt_email: shelter.kontakt_email,
      kontakt_telefon: shelter.kontakt_telefon,
      vermittlung_url: shelter.vermittlung_url,
      logoUrl: shelter.logo_file ? `/partner-media/${shelter.logo_file}` : null
    }
  })
})

// GET /api/public/partners/:slug/animals - Karten-Daten für das Portal: die veröffentlichten Tiere
// eines Tierheim-Partners.
const findShelterFamily = db.prepare("SELECT id FROM families WHERE partner_id = ? AND art = 'tierheim'")
const PUBLISHED_ANIMAL_COLUMNS = 'public_slug, name, tierart, geschlecht, rasse, geburtsdatum, foto_url, vermittlung_status'
// Zwei Listen (lib/vermittlung.js): "Entdecken" zeigt nur LISTED_STATUS (ohne pausiert), das eigene
// Portal des Tierheims alle veröffentlichbaren Tiere (PUBLISHABLE_STATUS) - pausierte mit ihrem Status,
// damit der Client sie kennzeichnen kann.
const findListedAnimals = db.prepare(
  `SELECT ${PUBLISHED_ANIMAL_COLUMNS} FROM dogs
   WHERE family_id = ? AND public_slug IS NOT NULL AND ${listedSql()}
   ORDER BY name`
)
const findPublishableAnimals = db.prepare(
  `SELECT ${PUBLISHED_ANIMAL_COLUMNS} FROM dogs
   WHERE family_id = ? AND public_slug IS NOT NULL AND ${publishableSql()}
   ORDER BY name`
)

// Karten-Daten der veröffentlichten Tiere eines Partners (nach dessen partners.id, nicht dessen
// families.id) - eigene Funktion, damit routes/discover.js (Phase 3 Task 2, "begleiter.tiere") dieselbe
// Abfrage und dieselbe Kartenform wiederverwenden kann, ohne GET /partners/:slug/animals selbst
// aufzurufen (Sichtbarkeits-/Status-Prüfungen des Partners bleiben dabei Sache des jeweiligen Aufrufers).
// includePaused: true nur fürs eigene Portal (siehe oben) - Standard sind die gelisteten Tiere.
function getShelterAnimalCards(partnerId, { includePaused = false } = {}) {
  const shelterFamily = findShelterFamily.get(partnerId)
  if (!shelterFamily) return []
  const statement = includePaused ? findPublishableAnimals : findListedAnimals
  return statement.all(shelterFamily.id).map((dog) => ({
    slug: dog.public_slug,
    name: dog.name,
    tierart: dog.tierart,
    geschlecht: dog.geschlecht,
    rasse: dog.rasse,
    geburtsdatum: dog.geburtsdatum,
    fotoUrl: toPublicMediaUrl(dog.foto_url),
    vermittlung_status: dog.vermittlung_status
  }))
}

router.get('/partners/:slug/animals', (req, res) => {
  const partner = db.prepare('SELECT * FROM partners WHERE slug = ?').get(req.params.slug)
  if (!partner) return notFound(res, 'Diesen Partner gibt es nicht')
  // security-review Phase T Finding 5: pausiert/Entwurf (und seit Phase P Task 1 gesperrt) ist für die
  // Öffentlichkeit gleichbedeutend mit "gibt es nicht" - wie is_demo hier schon behandelt wurde.
  if (!isPubliclyVisible(partner)) return notFound(res, 'Diesen Partner gibt es nicht')
  if (partner.is_demo && !demoAllowed(req)) return notFound(res, 'Diesen Partner gibt es nicht')

  res.json(getShelterAnimalCards(partner.id, { includePaused: true }))
})

// GET /api/public/partners/:slug/happy-ends - Task 6 ("einfache Sektion", volle Auswahl einzelner
// Einträge bewusst NICHT in dieser Phase, siehe Plan): bis zu sechs Tiere, die dieses Tierheim einmal
// vermittelt hat und deren neue Familie freiwillig zugestimmt hat, eine Geschichte auf dem Portal zu
// zeigen (dog_shares.story_consent = 1, siehe routes/dogs.js PUT /:id/shelter-share). NIE Namen, Ids
// oder sonstige Angaben zur neuen Familie - nur das Tier selbst und sein neuester nicht-privater
// Eintrag, gekürzt. d.family_id != @shelterFamilyId ist eine zusätzliche, verteidigende Prüfung (in
// der Praxis kann eine story_consent-Freigabe laut PUT /:id/shelter-share ohnehin nur für ein Tier
// entstehen, das laut dog_transfers schon aus genau diesem Tierheim weggezogen ist).
const MAX_HAPPY_ENDS = 6
const HAPPY_END_EXCERPT_LENGTH = 280

const findStoryConsentDogs = db.prepare(
  `SELECT d.id, d.name, d.tierart, d.foto_url FROM dog_shares ds
   JOIN dogs d ON d.id = ds.dog_id
   WHERE ds.family_id = @shelterFamilyId AND ds.story_consent = 1 AND d.family_id != @shelterFamilyId
   ORDER BY ds.created_at DESC, d.id DESC`
)

// Derselbe "neueste nicht-private Eintrag" wie lib/publicMedia.js storyConsentEntryPhotoStmt - beide
// müssen exakt dieselbe Zeile wählen, sonst zeigt die Antwort hier ein anderes Foto, als /public-media
// tatsächlich freigibt. Bei einer Änderung an der Sortierung hier also dort mitziehen.
const findNewestNonPrivateEntry = db.prepare(
  `SELECT titel, datum, text, foto_urls FROM timeline_entries
   WHERE dog_id = @dogId AND privat = 0
   ORDER BY datum DESC, id DESC LIMIT 1`
)

// Kürzt auf höchstens 280 Zeichen, an einer Wortgrenze, mit „…“ - nie mitten im Wort abgeschnitten.
function happyEndExcerpt(text) {
  if (!text) return null
  if (text.length <= HAPPY_END_EXCERPT_LENGTH) return text
  const cut = text.slice(0, HAPPY_END_EXCERPT_LENGTH)
  const boundary = cut.lastIndexOf(' ')
  return `${cut.slice(0, boundary > 0 ? boundary : HAPPY_END_EXCERPT_LENGTH)}…`
}

router.get('/partners/:slug/happy-ends', (req, res) => {
  const partner = db.prepare('SELECT * FROM partners WHERE slug = ?').get(req.params.slug)
  if (!partner) return notFound(res, 'Diesen Partner gibt es nicht')
  if (!isPubliclyVisible(partner)) return notFound(res, 'Diesen Partner gibt es nicht')
  if (partner.is_demo && !demoAllowed(req)) return notFound(res, 'Diesen Partner gibt es nicht')

  const shelterFamily = findShelterFamily.get(partner.id)
  if (!shelterFamily) return res.json([])

  const happyEnds = []
  for (const dog of findStoryConsentDogs.all({ shelterFamilyId: shelterFamily.id })) {
    if (happyEnds.length >= MAX_HAPPY_ENDS) break
    const entry = findNewestNonPrivateEntry.get({ dogId: dog.id })
    if (!entry) continue // kein zeigbarer Eintrag (mehr) -> kein Happy End für dieses Tier

    const fotoUrls = JSON.parse(entry.foto_urls)
    happyEnds.push({
      name: dog.name,
      tierart: dog.tierart,
      fotoUrl: toPublicMediaUrl(dog.foto_url),
      entry: {
        titel: entry.titel,
        datum: entry.datum,
        text: happyEndExcerpt(entry.text),
        fotoUrl: fotoUrls.length ? toPublicMediaUrl(fotoUrls[0]) : null
      }
    })
  }

  res.json(happyEnds)
})

module.exports = router
module.exports.getShelterAnimalCards = getShelterAnimalCards
module.exports.toPublicMediaUrl = toPublicMediaUrl
