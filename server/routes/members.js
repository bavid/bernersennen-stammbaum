const express = require('express')
const db = require('../db')
const { uploadDir } = require('../config')
const { requireAuth, refreshSession, clearSessionCookie } = require('../middleware/auth')
const { authLimiter } = require('../middleware/abuse')
const { cleanId } = require('../lib/validate')
const { ART, buildMe, isMember, removeMembership } = require('../lib/context')
const { ROLES, LEITUNG, STELLVERTRETUNG, isRole, rank, roleOf, countLeitung, requireRole, ensureLeitung } = require('../lib/roles')
const { generateCode, hashCode, formatCode } = require('../lib/codes')
const { verifyCurrentCredential, REAUTH_ERROR } = require('../lib/currentCredential')
const { deleteFamily, removeUploads } = require('../lib/families')
const { revokeOpenInvites, inviteRoleOf } = require('../lib/vouchers')

// Phase R Task 2: Mitglieder einer Familie verwalten (/api/family/members). Alles nur, wenn der aktive
// Bereich eine Familie (art 'rudel') ist - im eigenen Zuhause, Tierheim oder Partner-Bereich gibt es keine
// Mitglieder (400). requireAuth sperrt die Demo für alles außer GET; die Rollenprüfung (lib/roles.js
// requireRole) hängt an jeder einzelnen Route. Wer mit dem gemeinsamen Schlüssel der Familie angemeldet ist
// (homeId === familyId), zählt als Leitung ohne Mitgliedschaftszeile - darf also verwalten, taucht in der
// Liste aber nicht auf und kann sich selbst weder herabstufen noch entfernen.
const router = express.Router()

const NOT_IN_FAMILY_MESSAGE = 'Nur in einer Familie möglich'
const NO_SUCH_MEMBER_MESSAGE = 'Dieses Mitglied gibt es nicht'
const NO_SUCH_INVITE_MESSAGE = 'Diese Einladung gibt es nicht'
const LAST_LEITUNG_MESSAGE = 'Es muss immer eine Leitung geben.'
const HAS_ANIMALS_MESSAGE = 'Die Familie hat eigene Tiere – bitte vorher in eine Chronik übernehmen.'
const CONFIRMATION_MESSAGE = 'Bitte bestätige mit dem genauen Namen der Familie.'
const REMOVE_SELF_MESSAGE = 'Dich selbst entfernst du über „Familie verlassen“.'
const ALREADY_LEITUNG_MESSAGE = 'Du bist schon die Leitung.'
const OWN_KEY_MESSAGE = 'Den Schlüssel des eigenen Bereichs erneuerst du in dessen Einstellungen.'

const findFamily = db.prepare('SELECT id, name, art FROM families WHERE id = ?')
const findMembership = db.prepare('SELECT rolle FROM family_members WHERE member_family_id = ? AND group_family_id = ?')
const setRole = db.prepare('UPDATE family_members SET rolle = ? WHERE member_family_id = ? AND group_family_id = ?')
const countOwnDogs = db.prepare('SELECT COUNT(*) AS c FROM dogs WHERE family_id = ?')

// Leitung zuerst, dann nach Rang absteigend, bei gleichem Rang die längste Mitgliedschaft zuerst. ROLES ist
// eine feste Konstante aus lib/roles.js, kein Nutzereingabe-Pfad (wie statusInSql in lib/vermittlung.js).
const ROLE_RANK_SQL = `CASE m.rolle ${ROLES.map((rolle, index) => `WHEN '${rolle}' THEN ${index}`).join(' ')} ELSE -1 END`

// geteilteTiere: wie viele Tiere dieses Haushalts sind in diese Familie geteilt (dog_shares).
const listMembers = db.prepare(
  `SELECT m.member_family_id AS familyId, f.name, m.rolle, m.created_at AS seit,
     (SELECT COUNT(*) FROM dog_shares ds JOIN dogs d ON d.id = ds.dog_id
       WHERE ds.family_id = m.group_family_id AND d.family_id = m.member_family_id) AS geteilteTiere
   FROM family_members m JOIN families f ON f.id = m.member_family_id
   WHERE m.group_family_id = ?
   ORDER BY ${ROLE_RANK_SQL} DESC, m.created_at, m.member_family_id`
)

// Offene Einladungen IN diese Familie (auch vom Admin angelegte): nur der Hinweis auf den Code (die letzten
// vier Zeichen, wie GET /vouchers/mine), nie der Code selbst - Codes im Klartext gibt es allein in /mine.
const listOpenInvites = db.prepare(
  `SELECT id, code_hint AS hinweis, join_rolle, created_at AS erstelltAm, expires_at AS ablauf
   FROM vouchers
   WHERE join_family_id = ? AND dog_id IS NULL AND redeemed_at IS NULL AND revoked_at IS NULL
     AND (expires_at IS NULL OR expires_at > datetime('now'))
   ORDER BY created_at DESC, id DESC`
)

function requireFamilyArea(req, res, next) {
  const family = findFamily.get(req.familyId)
  if (!family || family.art !== ART.rudel) return res.status(400).json({ error: NOT_IN_FAMILY_MESSAGE })
  req.family = family
  next()
}

router.use(requireAuth, requireFamilyArea)

// Rollen liefert die DB als Text; eine unbekannte Rolle (fail closed in roleOf) erscheint hier als null.
function cleanRole(rolle) {
  return isRole(rolle) ? rolle : null
}

function membersPayload(req) {
  const ichBin = roleOf(req.homeId, req.familyId)
  const payload = {
    familyId: req.family.id,
    name: req.family.name,
    ichBin,
    mitglieder: listMembers.all(req.familyId).map((row) => ({ ...row, rolle: cleanRole(row.rolle) }))
  }
  if (rank(ichBin) >= rank(STELLVERTRETUNG)) {
    payload.einladungen = listOpenInvites.all(req.familyId).map(({ join_rolle, ...rest }) => ({ ...rest, rolle: inviteRoleOf({ join_rolle }) }))
  }
  return payload
}

// Eine positive Ganzzahl aus der URL, sonst null (cleanId liefert NaN für Unsinn wie "abc").
function idParam(value) {
  const id = cleanId(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

router.get('/', (req, res) => {
  res.json(membersPayload(req))
})

// Rolle eines Mitglieds ändern. Die Leitung selbst kann sich nur herabstufen, wenn eine zweite Leitung da
// ist - die letzte Leitung bleibt (409). Dieselbe Regel für den gemeinsamen Schlüssel, der die einzige
// Leitungs-Mitgliedschaft herabstufen wollte: erst jemand anderen zur Leitung machen.
router.put('/:homeId', requireRole(LEITUNG), (req, res) => {
  const targetId = idParam(req.params.homeId)
  const { rolle } = req.body || {}
  if (!isRole(rolle)) return res.status(400).json({ error: 'Unbekannte Rolle' })

  const membership = targetId ? findMembership.get(targetId, req.familyId) : null
  if (!membership) return res.status(404).json({ error: NO_SUCH_MEMBER_MESSAGE })
  if (membership.rolle === LEITUNG && rolle !== LEITUNG && countLeitung(req.familyId) <= 1) {
    return res.status(409).json({ error: LAST_LEITUNG_MESSAGE })
  }

  setRole.run(rolle, targetId, req.familyId)
  res.json(membersPayload(req))
})

// Mitglied entfernen: Mitgliedschaft und seine Freigaben in diese Familie (lib/context.js removeMembership) -
// die Tiere bleiben in seinem Zuhause. Nicht sich selbst (dafür: Familie verlassen). War das entfernte
// Mitglied die einzige Leitung (nur der gemeinsame Schlüssel kann das), rückt das älteste Mitglied nach.
const removeMember = db.transaction((homeId, groupId) => {
  const changes = removeMembership(homeId, groupId)
  if (changes) ensureLeitung(db, groupId)
  return changes
})

router.delete('/:homeId', requireRole(LEITUNG), (req, res) => {
  const targetId = idParam(req.params.homeId)
  if (targetId === req.homeId) return res.status(400).json({ error: REMOVE_SELF_MESSAGE })
  if (!targetId || !removeMember(targetId, req.familyId)) return res.status(404).json({ error: NO_SUCH_MEMBER_MESSAGE })
  res.status(204).end()
})

// Leitung übergeben: das Ziel wird Leitung, die übergebende Leitung Stellvertretung. Mit dem gemeinsamen
// Schlüssel (keine eigene Mitgliedschaft) wird nur das Ziel befördert.
const handOverLeitung = db.transaction((targetId, callerId, groupId) => {
  setRole.run(LEITUNG, targetId, groupId)
  setRole.run(STELLVERTRETUNG, callerId, groupId)
})

router.post('/leitung/:homeId', requireRole(LEITUNG), (req, res) => {
  const targetId = idParam(req.params.homeId)
  if (targetId === req.homeId) return res.status(400).json({ error: ALREADY_LEITUNG_MESSAGE })
  if (!targetId || !isMember(targetId, req.familyId)) return res.status(404).json({ error: NO_SUCH_MEMBER_MESSAGE })

  handOverLeitung(targetId, req.homeId, req.familyId)
  res.json(membersPayload(req))
})

// Offene Einladung dieser Familie widerrufen (lib/vouchers.js revokeOpenInvites) - danach füllt GET
// /vouchers/mine das Kontingent beim nächsten Aufruf wieder auf.
router.delete('/einladungen/:voucherId', requireRole(STELLVERTRETUNG), (req, res) => {
  const voucherId = idParam(req.params.voucherId)
  if (!voucherId || !revokeOpenInvites(db, req.familyId, voucherId)) return res.status(404).json({ error: NO_SUCH_INVITE_MESSAGE })
  res.status(204).end()
})

// Familie auflösen - nur ohne eigene Tiere (geteilte Tiere anderer Haushalte bleiben bei ihnen), nur mit dem
// genauen Familiennamen als Bestätigung. Erst alle offenen Einladungen widerrufen (auch vom Admin
// angelegte, die deleteFamily sonst nur von der Familie lösen und damit zu gewöhnlichen Gutscheinen machen
// würde), dann der bestehende Lösch-Pfad (lib/families.js deleteFamily: Mitgliedschaften, Freigaben, Zettel,
// Einträge, Kommentare, eigene Gutscheine, Benutzer, die Familie selbst) - alles in einer Transaktion.
const dissolveFamily = db.transaction((familyId) => {
  revokeOpenInvites(db, familyId)
  return deleteFamily(db, familyId)
})

router.post('/aufloesen', requireRole(LEITUNG), (req, res) => {
  if (countOwnDogs.get(req.familyId).c > 0) return res.status(409).json({ error: HAS_ANIMALS_MESSAGE })
  const { bestaetigung } = req.body || {}
  if (typeof bestaetigung !== 'string' || bestaetigung !== req.family.name) {
    return res.status(400).json({ error: CONFIRMATION_MESSAGE })
  }

  removeUploads(uploadDir, dissolveFamily(req.familyId))

  // Ein Mitglieds-Haushalt fällt in sein Zuhause zurück (wie beim Verlassen). Wer mit dem gemeinsamen
  // Schlüssel der Familie angemeldet war, hat gerade seine Identität aufgelöst - die Sitzung endet.
  if (req.homeId === req.familyId) {
    clearSessionCookie(res)
    return res.status(204).end()
  }
  refreshSession(req, res, req.homeId)
  res.json(buildMe(req.homeId, req.homeId, req.isDemo, req.userId))
})

// Gemeinsamen Schlüssel der Familie erneuern - durch ein Leitungs-Mitglied, mit dem Nachweis seines EIGENEN
// aktuellen Schlüssels bzw. Passworts (lib/currentCredential.js; dieselbe Begründung wie routes/auth.js
// POST /family/key: eine übernommene Sitzung darf sich nicht einfach einen neuen Schlüssel erzeugen).
// auth_epoch + 1 beendet jede Sitzung, die mit dem alten Familien-Schlüssel angemeldet war; die Sitzung des
// Mitglieds selbst hängt an seinem Zuhause und bleibt. Der neue Schlüssel wird genau einmal gezeigt.
// Mit dem gemeinsamen Schlüssel angemeldet (homeId === familyId) ist die Familie der eigene Bereich -
// dafür gibt es POST /family/key, das die eigene Sitzung gleich mit erneuert (hier würde sie enden).
router.post('/key', authLimiter, requireRole(LEITUNG), async (req, res, next) => {
  try {
    if (req.homeId === req.familyId) return res.status(400).json({ error: OWN_KEY_MESSAGE })
    if (!(await verifyCurrentCredential(req))) return res.status(403).json({ error: REAUTH_ERROR })

    const code = generateCode()
    db.prepare('UPDATE families SET access_key_hash = ?, auth_epoch = auth_epoch + 1 WHERE id = ?').run(hashCode(code), req.familyId)
    res.json({ key: formatCode(code) })
  } catch (err) {
    next(err)
  }
})

module.exports = router
