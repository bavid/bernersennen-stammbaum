const express = require('express')
const { denyDemoWrites } = require('../../middleware/auth')
const { requireFreeDisk } = require('../../middleware/abuse')
const { uploadLimiter } = require('../../lib/photoUpload')
const { handlePromotionImageUpload } = require('../../lib/promotionImage')
const {
  NOT_FOUND_MESSAGE,
  validatePartnerPost,
  listOwnPosts,
  findOwnPost,
  insertPost,
  updatePost,
  deletePost,
  ownPost
} = require('../../lib/partnerPosts')

// Phase P2 Task 8: Beiträge des eigenen Partners (lib/partnerPosts.js) - immer "Anzeige", öffentlich erst
// nach Freigabe durch den Admin. Läuft hinter middleware/partnerArea.js requirePartnerArea (req.partner ist
// gesetzt). Nur eigene Beiträge (partner_id = eigener Partner UND vom Partner erstellt) - alles andere ist
// 404, auch eine vom Admin mit dem Partner verknüpfte Empfehlung. Demo-Sitzungen lesen nur.

const router = express.Router()

function sendError(res, next, err) {
  if (err.status) return res.status(err.status).json({ error: err.message })
  next(err)
}

router.get('/', (req, res) => {
  res.json(listOwnPosts(req.partner.id).map(ownPost))
})

router.post('/', denyDemoWrites, (req, res, next) => {
  try {
    const clean = validatePartnerPost(req.body, req.partner)
    res.status(201).json(ownPost(insertPost(req.partner, clean)))
  } catch (err) {
    sendError(res, next, err)
  }
})

// Gleiche Regeln wie beim Anlegen; jede Änderung reicht wieder ein (lib/partnerPosts.js updatePost).
router.put('/:id', denyDemoWrites, (req, res, next) => {
  try {
    const post = findOwnPost(req.partner.id, req.params.id)
    if (!post) return res.status(404).json({ error: NOT_FOUND_MESSAGE })
    const clean = validatePartnerPost(req.body, req.partner)
    res.json(ownPost(updatePost(req.partner.id, post.id, clean)))
  } catch (err) {
    sendError(res, next, err)
  }
})

// Dieselbe Upload-Strecke wie beim Admin (lib/promotionImage.js); ein neues Bild reicht wieder ein.
// Antwort: der ganze Beitrag (mit bildUrl und der zurückgesetzten Freigabe).
router.post('/:id/image', denyDemoWrites, uploadLimiter, requireFreeDisk, (req, res, next) => {
  const post = findOwnPost(req.partner.id, req.params.id)
  if (!post) return res.status(404).json({ error: NOT_FOUND_MESSAGE })
  handlePromotionImageUpload(req, res, next, post.id, {
    resubmit: true,
    respond: () => res.status(201).json(ownPost(findOwnPost(req.partner.id, post.id)))
  })
})

router.delete('/:id', denyDemoWrites, (req, res) => {
  const post = findOwnPost(req.partner.id, req.params.id)
  if (!post) return res.status(404).json({ error: NOT_FOUND_MESSAGE })
  deletePost(post)
  res.status(204).end()
})

module.exports = router
