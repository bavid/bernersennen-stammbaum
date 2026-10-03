'use strict'

// Phase V4a: mehrere Termine einer Anzeige ("Tag der offenen Tür am 1.1., 1.2., 1.3. und 5.–10.5.") - gespeichert als
// JSON-Liste [{ von, bis }] in promotions.zeitraeume (db.js, dort die Begründung für eine Spalte statt einer Tabelle).
// bis = null: ein einzelner Tag. Geprüft beim Anlegen und Ändern eines Partner-Beitrags (lib/partnerPosts.js
// validatePartnerPost - eine Änderung folgt also derselben Freigabe-Regel wie Titel und Text); öffentlich zeigen Karten
// nur, was heute oder später noch läuft (upcomingZeitraeume, routes/discover.js promotionCard).

const { isIsoDate } = require('./validate')
const { addDays, addYears } = require('./terminSerien')

const MAX_ZEITRAEUME = 12
const MAX_DAUER_TAGE = 60
const MAX_VORLAUF_JAHRE = 2

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

const isEmpty = (value) => value === undefined || value === null || value === ''

function validateEntry(entry, index, today) {
  const label = `Termin ${index + 1}`
  const input = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {}
  if (!isIsoDate(input.von) || (!isEmpty(input.bis) && !isIsoDate(input.bis))) {
    throw httpError(400, `${label}: bitte ein gültiges Datum angeben (JJJJ-MM-TT)`)
  }
  const bis = isEmpty(input.bis) || input.bis === input.von ? null : input.bis
  if (bis && bis < input.von) throw httpError(400, `${label}: das Ende darf nicht vor dem Beginn liegen`)
  if (bis && bis > addDays(input.von, MAX_DAUER_TAGE)) throw httpError(400, `${label}: ein Zeitraum dauert höchstens ${MAX_DAUER_TAGE} Tage`)
  if (input.von > addYears(today, MAX_VORLAUF_JAHRE)) throw httpError(400, `${label}: höchstens zwei Jahre im Voraus`)
  return { von: input.von, bis }
}

function compareZeitraum(a, b) {
  if (a.von !== b.von) return a.von < b.von ? -1 : 1
  const endA = a.bis || a.von
  const endB = b.bis || b.von
  if (endA === endB) return 0
  return endA < endB ? -1 : 1
}

// Eingabe -> saubere, sortierte Liste ohne doppelte, oder null (keine Termine). Vergangene dürfen stehen bleiben:
// ein älterer Beitrag bleibt so bearbeitbar; öffentlich erscheinen sie ohnehin nicht mehr.
function validateZeitraeume(value, { today }) {
  if (value === undefined || value === null) return null
  if (!Array.isArray(value)) throw httpError(400, 'Die Termine müssen eine Liste sein')
  if (value.length > MAX_ZEITRAEUME) throw httpError(400, `Höchstens ${MAX_ZEITRAEUME} Termine je Beitrag`)
  const clean = value.map((entry, index) => validateEntry(entry, index, today)).sort(compareZeitraum)
  const unique = clean.filter((entry, index) => index === 0 || compareZeitraum(entry, clean[index - 1]) !== 0)
  return unique.length ? unique : null
}

function serializeZeitraeume(list) {
  return list && list.length ? JSON.stringify(list) : null
}

// Spalte -> Liste; alles Unlesbare (kaputtes JSON, falsche Form) fällt still weg - es kam nie durch validateZeitraeume.
function parseZeitraeume(text) {
  if (typeof text !== 'string' || !text) return []
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter((entry) => entry && isIsoDate(entry.von) && (entry.bis === null || entry.bis === undefined || isIsoDate(entry.bis)))
    .map((entry) => ({ von: entry.von, bis: entry.bis ?? null }))
}

// Was heute oder später noch läuft (ein Zeitraum, solange sein letzter Tag nicht vorbei ist).
function upcomingZeitraeume(list, today) {
  return list.filter((entry) => (entry.bis || entry.von) >= today)
}

module.exports = { MAX_ZEITRAEUME, MAX_DAUER_TAGE, validateZeitraeume, serializeZeitraeume, parseZeitraeume, upcomingZeitraeume }
