'use strict'

// Umzug eines Bestandsrudels aus der alten App auf das neue System (scripts/migriere-rudel-instanz.js): Sicherung,
// Bestand zählen, Stammbaum als Start für genau dieses Rudel, optional EIN Hinweis mit Link zur neuen Familie auf
// Pfoten. Idempotent - ein zweiter Lauf ändert nichts und legt nichts doppelt an. Ausgaben nur als Zahlen, nie Namen.

const fs = require('node:fs')
const path = require('node:path')
const db = require('../db')
const { setStammbaumStart, isStammbaumStart } = require('./stammbaumStart')
const { validateHinweis, createHinweis, updateHinweis } = require('./hinweise')
const { parseHttpsUrl } = require('./hinweisLink')
const { zaehleBestand: zaehle } = require('./bestandZaehlen')

const zaehleBestand = () => zaehle(db)

const HINWEIS = Object.freeze({
  titel: 'Neue Familie auf Pfoten',
  text:
    'Wir bauen gerade die neue Familie auf Pfoten – noch in Entwicklung. In etwa einem Monat ziehen wir euch dorthin um. ' +
    'Ihr möchtet schon vorher ein eigenes Zuhause? Schreibt mir über „Feedback“, dann schicke ich euch einen Einladungscode.',
  titelEn: 'New Familie auf Pfoten',
  textEn:
    "We're building the new Familie auf Pfoten – still in development. In about a month we'll move you over. " +
    'Want your own home sooner? Write to me via „Feedback“ and I\'ll send you an invitation code.',
  linkLabel: 'Zur neuen Familie auf Pfoten',
  linkLabelEn: 'To the new Familie auf Pfoten',
  stufe: 'info'
})

function migrationError(message) {
  const err = new Error(message)
  err.migration = true
  return err
}

function pruefeFamilie(familieId) {
  if (!Number.isInteger(familieId) || familieId <= 0) throw migrationError('--familie braucht eine positive Zahl (die id des Rudels).')
  const family = db.prepare('SELECT art, is_demo FROM families WHERE id = ?').get(familieId)
  if (!family) throw migrationError(`Familie ${familieId} gibt es nicht.`)
  if (family.art !== 'rudel') throw migrationError(`Familie ${familieId} ist kein Rudel (art '${family.art}').`)
  if (family.is_demo) throw migrationError(`Familie ${familieId} ist eine Demo-Familie.`)
}

function pruefeHinweisUrl(hinweisUrl) {
  if (hinweisUrl === undefined || hinweisUrl === null) return null
  const href = parseHttpsUrl(hinweisUrl)
  if (!href) throw migrationError('--hinweis-url muss eine gültige https://-Adresse sein.')
  return href
}

function hinweisBody(url) {
  return {
    titel: HINWEIS.titel,
    text: HINWEIS.text,
    titelEn: HINWEIS.titelEn,
    textEn: HINWEIS.textEn,
    stufe: HINWEIS.stufe,
    aktiv: true,
    linkUrl: url,
    linkLabel: HINWEIS.linkLabel,
    linkLabelEn: HINWEIS.linkLabelEn
  }
}

const SAME_FIELDS = ['titel', 'text', 'titel_en', 'text_en', 'stufe', 'aktiv', 'link_url', 'link_label', 'link_label_en']

// Genau ein Hinweis mit diesem Titel (echte, nicht Demo): anlegen, angleichen oder unverändert lassen.
function upsertHinweis(url, { dryRun, now }) {
  const existing = db.prepare('SELECT * FROM hinweise WHERE titel = ? AND is_demo = 0 ORDER BY id LIMIT 1').get(HINWEIS.titel)
  if (!existing) {
    const clean = validateHinweis(hinweisBody(url), { now })
    return { aktion: 'angelegt', id: dryRun ? null : createHinweis(clean).id }
  }
  const clean = validateHinweis({ ...hinweisBody(url), ende: null }, { now, existing })
  if (SAME_FIELDS.every((field) => clean[field] === existing[field]) && !existing.ende) return { aktion: 'unverändert', id: existing.id }
  if (!dryRun) updateHinweis(existing.id, clean)
  return { aktion: 'aktualisiert', id: existing.id }
}

function timestamp(now) {
  return now.toISOString().replace(/[:.]/g, '-')
}

// Konsistente Kopie per SQLite-Backup-API (auch bei laufender App im WAL-Modus).
async function sicherung(backupDir, now) {
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 })
  const ziel = path.join(backupDir, `pre-migration-${timestamp(now)}.db`)
  await db.backup(ziel)
  return ziel
}

async function migriereRudelInstanz({ familieId, hinweisUrl, dryRun = false, backupDir, now = new Date() }) {
  pruefeFamilie(familieId)
  const url = pruefeHinweisUrl(hinweisUrl)
  const vorher = zaehleBestand()
  const backupPfad = dryRun ? null : await sicherung(backupDir, now)
  const stammbaumNeu = !isStammbaumStart(familieId)
  if (!dryRun) setStammbaumStart(familieId, true)
  const hinweis = url ? upsertHinweis(url, { dryRun, now }) : null
  return { dryRun, vorher, nachher: zaehleBestand(), backupPfad, stammbaumNeu, hinweis }
}

module.exports = { HINWEIS, zaehleBestand, migriereRudelInstanz }
