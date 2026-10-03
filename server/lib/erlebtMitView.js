'use strict'

// Phase V2: "Erlebt mit" an den Chronik-Routen (routes/timeline.js) - Eingabe lesen, beim Speichern anwenden und die
// Antworten ergänzen. Markieren und die Markierungen sehen gibt es nur im eigenen Zuhause (aktiver Bereich = Identität,
// art 'zuhause', kein Besuch); gespiegelte Einträge erscheinen ebenfalls nur dort, in der Chronik des markierten Tiers.

const db = require('../db')
const { ART } = require('./areaArt')
const {
  ONLY_HOME_MESSAGE,
  cleanTagList,
  assertTaggable,
  syncTags,
  clearTags,
  reopenConfirmedTags,
  tagsForEntries,
  mirroredEntries
} = require('./erlebtMit')

const findArt = db.prepare('SELECT art FROM families WHERE id = ?')

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

function isOwnHomeView(req) {
  return !req.isGuest && req.familyId === req.homeId && findArt.get(req.familyId)?.art === ART.zuhause
}

// body.erlebtMit -> null (Feld fehlt: Markierungen bleiben, wie sie sind) oder die geprüfte Liste der Tier-Ids.
// privat: der Eintrag ist nach dem Speichern privat. Wirft 400 bei allem, was nicht markiert werden darf.
function readTagInput(body, req, privat) {
  if (!Object.prototype.hasOwnProperty.call(body, 'erlebtMit')) return null
  const dogIds = cleanTagList(body.erlebtMit)
  if (dogIds.length > 0 && !isOwnHomeView(req)) throw httpError(400, ONLY_HOME_MESSAGE)
  assertTaggable(req.homeId, dogIds, { privat: Boolean(privat) })
  return dogIds
}

// Innerhalb der Speicher-Transaktion: ein privater Eintrag verliert jede Markierung, sonst gilt die neue Liste
// (null = unverändert). contentChanged (PUT): Titel, Text, Datum oder Fotos haben sich geändert - schon bestätigte
// Markierungen werden wieder zur Anfrage (reopenConfirmedTags).
function applyTags(entryId, dogIds, privat, { contentChanged = false } = {}) {
  if (privat) {
    clearTags(entryId)
    return
  }
  if (dogIds !== null) syncTags(entryId, dogIds)
  if (contentChanged) reopenConfirmedTags(entryId)
}

// Hat sich am Inhalt etwas geändert, das die markierte Seite in ihrer Chronik sieht?
function entryContentChanged(existing, values) {
  // autor_name (security-review V2, L-2): auch ein anderer Name unter dem Eintrag braucht eine neue Zustimmung.
  return ['titel', 'text', 'datum', 'foto_urls', 'autor_name'].some((key) => (existing[key] ?? null) !== (values[key] ?? null))
}

// Ergänzt Einträge des eigenen Zuhauses um erlebt_mit ([{ id, dogId, name, zuhause, status }]) - nur in der Ansicht
// der Autorin; jede andere Ansicht (Familie, Gast) bekommt das Feld nicht.
function withTags(req, entries) {
  if (!isOwnHomeView(req)) return entries
  const own = entries.filter((entry) => entry.family_id === req.familyId).map((entry) => entry.id)
  const tags = tagsForEntries(own, req.homeId)
  return entries.map((entry) => (entry.family_id === req.familyId ? { ...entry, erlebt_mit: tags.get(entry.id) || [] } : entry))
}

// Gespiegelte Einträge für die Chronik des eigenen Tiers dogId: Verweise auf bestätigte Einträge verbundener
// Zuhause, ohne Kommentare und ohne Bearbeiten (gespiegelt trägt, woher sie kommen).
function mirroredForDog(req, dogId) {
  if (!dogId || !isOwnHomeView(req)) return []
  return mirroredEntries(req.homeId, dogId).map(({ requestId, tierId, tier, tierNameUnbekannt, zuhauseId, zuhause, dogId: _d, dogName: _n, ...entry }) => ({
    ...entry,
    privat: 0,
    comments: [],
    gespiegelt: { requestId, tierId, tier, tierNameUnbekannt, zuhauseId, zuhause }
  }))
}

module.exports = { isOwnHomeView, readTagInput, applyTags, entryContentChanged, withTags, mirroredForDog }
