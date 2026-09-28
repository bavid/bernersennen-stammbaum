const path = require('node:path')
const express = require('express')
const db = require('../db')
const config = require('../config')
const { optionalSession } = require('../middleware/auth')

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

// Nur Tiere mit gesetztem public_slug UND einem Status, der eine Vermittlung noch zulässt - ein
// zurückgezogener oder inzwischen vermittelter Steckbrief liefert 404, auch wenn der Slug technisch
// noch in der DB steht (siehe routes/dogs.js PUT /:id/steckbrief für das Setzen/Löschen selbst).
const findPublishedDog = db.prepare(
  `SELECT * FROM dogs WHERE public_slug = @slug AND vermittlung_status IN ('in_vermittlung', 'reserviert')`
)

const findShelterPartner = db.prepare(
  `SELECT p.name, p.slug, p.website, p.kontakt_email, p.kontakt_telefon, p.vermittlung_url, p.logo_file, p.is_demo
   FROM families f JOIN partners p ON p.id = f.partner_id
   WHERE f.id = @familyId AND f.art = 'tierheim'`
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

// GET /api/public/partners/:slug/animals - Karten-Daten für das Portal: die veröffentlichten,
// noch vermittelbaren Tiere eines Tierheim-Partners.
const findShelterFamily = db.prepare("SELECT id FROM families WHERE partner_id = ? AND art = 'tierheim'")
const findPublishedAnimals = db.prepare(
  `SELECT public_slug, name, tierart, geschlecht, rasse, geburtsdatum, foto_url, vermittlung_status
   FROM dogs
   WHERE family_id = ? AND public_slug IS NOT NULL AND vermittlung_status IN ('in_vermittlung', 'reserviert')
   ORDER BY name`
)

router.get('/partners/:slug/animals', (req, res) => {
  const partner = db.prepare('SELECT * FROM partners WHERE slug = ?').get(req.params.slug)
  if (!partner) return notFound(res, 'Diesen Partner gibt es nicht')
  if (partner.is_demo && !demoAllowed(req)) return notFound(res, 'Diesen Partner gibt es nicht')

  const shelterFamily = findShelterFamily.get(partner.id)
  if (!shelterFamily) return res.json([])

  const animals = findPublishedAnimals.all(shelterFamily.id).map((dog) => ({
    slug: dog.public_slug,
    name: dog.name,
    tierart: dog.tierart,
    geschlecht: dog.geschlecht,
    rasse: dog.rasse,
    geburtsdatum: dog.geburtsdatum,
    fotoUrl: toPublicMediaUrl(dog.foto_url),
    vermittlung_status: dog.vermittlung_status
  }))
  res.json(animals)
})

module.exports = router
