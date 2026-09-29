const express = require('express')
const db = require('../../db')
const { cleanId } = require('../../lib/validate')
const { distanceKm } = require('../../lib/geo')
const { ART } = require('../../lib/context')
const { buildPortal } = require('../../lib/partnerPortal')
const { newestVisibleFotoUrl } = require('../../lib/einblicke')
const { getShelterAnimalCards, buildSteckbrief } = require('../publicAnimals')
const { listPreviewPosts, MAX_PUBLIC_POSTS, NO_LIMIT } = require('../../lib/partnerPosts')
const { FREIGABE } = require('../../lib/promotions')
const {
  buildDiscover,
  resolveDiscoverCenter,
  partnerCard,
  promotionCard,
  spendenCard,
  discoverLimiter,
  MAX_BEGLEITER_TIERE
} = require('../discover')

// Phase P Task 3c: Vorschau-Daten für die "Kundensicht" - der Partner sieht sein Portal, "Entdecken" und
// die Steckbriefe seiner Tiere so, wie Kundinnen und Kunden sie sehen würden, auch als Entwurf, pausiert
// oder gesperrt. Alles hier ist lesend (auch POST /discover) und bleibt darum für Demo-Sitzungen offen.
// Fotos des eigenen Partners kommen über /uploads (der eigene Bereich sieht sie, lib/uploadAccess.js) -
// über /public-media wären sie bei einem nicht öffentlichen Partner 404.

const router = express.Router()

const VORSCHAU_HINWEIS = 'Euer Profil erscheint in der Partnerliste und auf eurem Portal.'

// In welchem Abschnitt von "Entdecken" die eigene Karte erscheint. futter/sonstige haben dort keinen
// Abschnitt - die Antwort trägt dann vorschauHinweis.
const SECTION_BY_TYP = Object.freeze({
  hundeschule: 'hundeschulen',
  // P2: eigener Abschnitt salon
  hundesalon: 'hundeschulen',
  // P2: eigener Abschnitt salon
  betreuung: 'hundeschulen',
  tierheim: 'begleiter',
  vermittlung: 'begleiter'
})

// Phase P2 Task 8: eigene Beiträge (eingereicht oder freigegeben) in "Entdecken" - je Bereich derselbe
// Abschnitt wie für freigegebene Empfehlungen (routes/discover.js buildDiscover). salon hat dort noch keinen
// Abschnitt (kommt mit Task 9) und erscheint darum hier auch noch nicht.
const POST_BEREICHE = Object.freeze(['hundeschule', 'begleiter', 'futter', 'unterstuetzen'])

// Eigener Beitrag in der Kundensicht: Karte wie in "Entdecken", dazu vorschau und freigabe. Solange der
// Admin nicht freigegeben hat, gibt es keinen clickUrl - /r/promotion/:id wäre dann ohnehin 404.
function previewPostCard(row) {
  const card = promotionCard(row)
  return { ...card, vorschau: true, freigabe: row.freigabe, clickUrl: row.freigabe === FREIGABE.freigegeben ? card.clickUrl : null }
}

// GET /preview/portal - das eigene Portal in der öffentlichen Form (lib/partnerPortal.js buildPortal),
// unabhängig vom Status. tiere: dieselbe Liste wie GET /api/public/partners/:slug/animals (leer für
// Partner ohne Tierheim-Bereich) - die öffentliche Route liefert für einen Entwurf nur 404.
router.get('/portal', (req, res) => {
  res.json({
    ...buildPortal(req.partner, { preview: true }),
    tiere: getShelterAnimalCards(req.partner.id, { includePaused: true, preview: true }),
    // Wie GET /api/public/partners/:slug/posts, dazu die noch eingereichten (lib/partnerPosts.js).
    posts: listPreviewPosts(req.partner.id, MAX_PUBLIC_POSTS).map(previewPostCard),
    vorschau: true,
    status: req.partner.status
  })
})

// Entfernung der eigenen Karte zur PLZ - wie routes/discover.js partnerSection (auf 0,1 km gerundet,
// ausserhalb jenseits des Umkreises). Ohne PLZ oder ohne eigene Koordinaten: keine Angabe.
function ownDistance(partner, center, radiusKm) {
  if (!center || !Number.isFinite(partner.lat) || !Number.isFinite(partner.lon)) return {}
  const dist = distanceKm(center, { lat: partner.lat, lon: partner.lon })
  return { distanceKm: Math.round(dist * 10) / 10, ausserhalb: dist > radiusKm }
}

// Die eigenen GELISTETEN Tiere (wie in "Entdecken", ohne pausierte) vorn, danach die übrigen ohne
// Duplikate - gedeckelt wie in routes/discover.js.
function withOwnAnimalsFirst(partner, tiere, distance) {
  const own = getShelterAnimalCards(partner.id, { preview: true }).map((animal) => ({ ...animal, ...distance }))
  const ownSlugs = new Set(own.map((animal) => animal.slug))
  return [...own, ...tiere.filter((animal) => !ownSlugs.has(animal.slug))].slice(0, MAX_BEGLEITER_TIERE)
}

// Grundlage ist die Antwort einer Demo-Sitzung (buildDiscover mit isDemo: true). Jede Karte des eigenen
// Partners fliegt dort heraus (sonst stünde er doppelt da), dann kommt die eigene Karte - aus der eigenen
// partners-Zeile gebaut, also auch als Entwurf - mit vorschau: true an die erste Stelle ihres Abschnitts.
// Ebenso die eigenen Beiträge (Phase P2 Task 8): raus aus der Grundlage, vorn in ihren Abschnitt - direkt
// hinter der eigenen Karte, falls die im selben Abschnitt steht.
function buildPreviewDiscover(partner, { center, radiusKm }) {
  const base = buildDiscover({ isDemo: true, center, radiusKm })
  const ownPosts = listPreviewPosts(partner.id, NO_LIMIT).map(previewPostCard)
  const ownPostIds = new Set(ownPosts.map((card) => card.id))
  const postsIn = Object.fromEntries(POST_BEREICHE.map((bereich) => [bereich, ownPosts.filter((card) => card.bereich === bereich)]))
  const withoutOwn = (cards) => cards.filter((card) => (card.kind === 'promotion' ? !ownPostIds.has(card.id) : card.id !== partner.id))
  const withOwnPosts = (bereich, cards) => [...postsIn[bereich], ...withoutOwn(cards)]
  const distance = ownDistance(partner, center, radiusKm)
  const ownCard = { ...partnerCard(partner, distance), teaserFoto: newestVisibleFotoUrl(partner.id), vorschau: true }
  const section = SECTION_BY_TYP[partner.typ]

  let hundeschulen = withOwnPosts('hundeschule', base.hundeschulen)
  let begleiterPartner = withoutOwn(base.begleiter.partner)
  let partnerSpenden = withoutOwn(base.unterstuetzen.partnerSpenden)
  let tiere = base.begleiter.tiere

  if (section === 'hundeschulen') hundeschulen = [ownCard, ...hundeschulen]
  if (section === 'begleiter') {
    begleiterPartner = [ownCard, ...begleiterPartner]
    tiere = withOwnAnimalsFirst(partner, tiere, distance)
    // Spendenlinks hängen in "Entdecken" an den Begleiter-Partnern - der eigene also auch hier vorn.
    if (partner.spenden_url) partnerSpenden = [{ ...spendenCard(partner), vorschau: true }, ...partnerSpenden]
  }

  return {
    ...base,
    hundeschulen,
    begleiter: { ...base.begleiter, partner: begleiterPartner, tiere, promotions: withOwnPosts('begleiter', base.begleiter.promotions) },
    futter: withOwnPosts('futter', base.futter),
    unterstuetzen: { ...base.unterstuetzen, partnerSpenden, promotions: withOwnPosts('unterstuetzen', base.unterstuetzen.promotions) },
    ...(section ? {} : { vorschauHinweis: VORSCHAU_HINWEIS })
  }
}

// POST /preview/discover { plz?, radius? } - wie POST /api/discover (dieselbe Prüfung, dasselbe Limit).
router.post('/discover', discoverLimiter, (req, res, next) => {
  try {
    const { center, radiusKm } = resolveDiscoverCenter(req.body || {})
    res.json(buildPreviewDiscover(req.partner, { center, radiusKm }))
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

const findOwnDog = db.prepare('SELECT * FROM dogs WHERE id = ? AND family_id = ?')

// GET /preview/animals/:dogId - Steckbrief-Form (routes/publicAnimals.js buildSteckbrief) für ein eigenes
// Tier des Tierheim-Bereichs, auch unveröffentlicht. Fremde, geteilte oder unbekannte Tiere -> 404.
router.get('/animals/:dogId', (req, res) => {
  const dogId = cleanId(req.params.dogId)
  const dog = req.partnerAreaArt === ART.tierheim && dogId ? findOwnDog.get(dogId, req.familyId) : null
  if (!dog) return res.status(404).json({ error: 'Dieses Tier gibt es nicht' })
  res.json({ ...buildSteckbrief(dog, req.partner, { preview: true }), vorschau: true })
})

module.exports = router
