const express = require('express')
const { denyDemoWrites } = require('../../middleware/auth')
const { requireFreeDisk } = require('../../middleware/abuse')
const { uploadLimiter } = require('../../lib/photoUpload')
const { handlePromotionImageUpload, deletePromotion, PARTNER_IMAGE_TYPES } = require('../../lib/promotionImage')
const {
  NOT_FOUND_MESSAGE,
  validatePartnerPost,
  listOwnPosts,
  findOwnPost,
  insertPost,
  updatePost,
  applyPartnerEdit,
  ownPost,
  ownPostWithVerlauf
} = require('../../lib/partnerPosts')
const { VERLAUF_AKTION, partnerVerlaufById } = require('../../lib/promotionFreigabe')
const { entdeckenAnzeigen, setReihenfolge, setInEntdecken } = require('../../lib/partnerPostOrder')
const { notify, EREIGNIS } = require('../../lib/notify')

// Phase P2 Task 8: Beiträge des eigenen Partners (lib/partnerPosts.js) - immer "Anzeige", öffentlich erst
// nach Freigabe durch den Admin. Läuft hinter middleware/partnerArea.js requirePartnerArea (req.partner ist
// gesetzt). Nur eigene Beiträge (partner_id = eigener Partner UND vom Partner erstellt) - alles andere ist
// 404, auch eine vom Admin mit dem Partner verknüpfte Empfehlung. Demo-Sitzungen lesen nur.

const router = express.Router()

function sendError(res, next, err) {
  if (err.status) return res.status(err.status).json({ error: err.message })
  next(err)
}

// Phase N Task 2: "Beitrag eingereicht" an den Admin (lib/notify.js, Schalter standardmäßig aus) - nie für Demo-
// Sitzungen oder Demo-Partner. Mit "Details mitsenden" samt Partnername und Titel. vertrauenswuerdig (V-Fehler 3):
// stattdessen "geändert (vertrauenswürdig)" - die Änderung ist schon online.
function notifyBeitrag(req, titel, { vertrauenswuerdig = false } = {}) {
  notify(EREIGNIS.beitrag, { partnerName: req.partner.name, titel, vertrauenswuerdig, demo: Boolean(req.isDemo || req.partner.is_demo) })
}

// Nach einer Änderung (lib/promotionFreigabe.js partnerEditOutcome): kommt der Beitrag dadurch NEU zur Prüfung (war
// freigegeben oder abgelehnt), meldet sich "eingereicht"; ging die Änderung eines vertrauenswürdigen Partners sofort
// online, "geändert (vertrauenswürdig)". Liegt er schon zur Prüfung, weiß der Admin davon.
function notifyEdit(req, titel, outcome) {
  if (!outcome) return
  if (outcome.live) notifyBeitrag(req, titel, { vertrauenswuerdig: true })
  else if (outcome.aktion === VERLAUF_AKTION.eingereicht) notifyBeitrag(req, titel)
}

// V-Fehler 3: jeder Beitrag mit seinen letzten Einträgen im Verlauf (lib/promotionFreigabe.js partnerVerlaufById).
router.get('/', (req, res) => {
  const verlauf = partnerVerlaufById(req.partner.id)
  res.json(listOwnPosts(req.partner.id).map((row) => ownPost(row, verlauf.get(row.id))))
})

// Phase V1: die Anzeigen der eigenen Karte in "Entdecken" (lib/partnerPostOrder.js) - freigegebene eigene Beiträge
// und vom Team verknüpfte Empfehlungen des Kartenbereichs, in Karten-Reihenfolge. Reihenfolge und "in Entdecken
// zeigen" sind reine Darstellung: keine neue Freigabe, kein Verlauf. Antwort jeweils { bereich, max, anzeigen }.
router.get('/entdecken', (req, res) => {
  res.json(entdeckenAnzeigen(req.partner))
})

// { ids: [...] } - die genannten in dieser Reihenfolge zuerst, die übrigen danach nach Datum. Vor PUT /:id.
router.put('/reihenfolge', denyDemoWrites, (req, res, next) => {
  try {
    res.json(setReihenfolge(req.partner, req.body))
  } catch (err) {
    sendError(res, next, err)
  }
})

// { inEntdecken: boolean } - aus: nicht auf der Karte, weiter auf dem Portal.
router.put('/:id/entdecken', denyDemoWrites, (req, res, next) => {
  try {
    res.json(setInEntdecken(req.partner, req.params.id, req.body))
  } catch (err) {
    sendError(res, next, err)
  }
})

router.post('/', denyDemoWrites, (req, res, next) => {
  try {
    const clean = validatePartnerPost(req.body, req.partner)
    res.status(201).json(ownPostWithVerlauf(insertPost(req.partner, clean)))
    notifyBeitrag(req, clean.titel)
  } catch (err) {
    sendError(res, next, err)
  }
})

// Gleiche Regeln wie beim Anlegen; eine Änderung reicht wieder ein - außer ein vertrauenswürdiger Partner ändert
// einen freigegebenen Beitrag (lib/partnerPosts.js updatePost). Benachrichtigt wird wie bei notifyEdit beschrieben.
router.put('/:id', denyDemoWrites, (req, res, next) => {
  try {
    const post = findOwnPost(req.partner.id, req.params.id)
    if (!post) return res.status(404).json({ error: NOT_FOUND_MESSAGE })
    const clean = validatePartnerPost(req.body, req.partner)
    const outcome = updatePost(req.partner, post.id, clean)
    if (!outcome) return res.status(404).json({ error: NOT_FOUND_MESSAGE })
    res.json(ownPostWithVerlauf(findOwnPost(req.partner.id, post.id)))
    notifyEdit(req, clean.titel, outcome)
  } catch (err) {
    sendError(res, next, err)
  }
})

// Dieselbe Upload-Strecke wie beim Admin (lib/promotionImage.js), aber nur JPG oder PNG (nur dort werden
// Metadaten entfernt, wie bei den Einblicken); ein neues Bild ist eine Änderung wie PUT (applyPartnerEdit in derselben
// Transaktion wie das Speichern). Antwort: der ganze Beitrag (mit bildUrl, Freigabe und Verlauf). Benachrichtigt wird
// wie bei PUT.
router.post('/:id/image', denyDemoWrites, uploadLimiter, requireFreeDisk, (req, res, next) => {
  const post = findOwnPost(req.partner.id, req.params.id)
  if (!post) return res.status(404).json({ error: NOT_FOUND_MESSAGE })
  handlePromotionImageUpload(req, res, next, post.id, {
    types: PARTNER_IMAGE_TYPES,
    onStored: (id) => applyPartnerEdit(req.partner, id),
    respond: (bildUrl, outcome) => {
      res.status(201).json(ownPostWithVerlauf(findOwnPost(req.partner.id, post.id)))
      notifyEdit(req, post.titel, outcome)
    }
  })
})

router.delete('/:id', denyDemoWrites, (req, res) => {
  const post = findOwnPost(req.partner.id, req.params.id)
  if (!post) return res.status(404).json({ error: NOT_FOUND_MESSAGE })
  deletePromotion(post)
  res.status(204).end()
})

module.exports = router
