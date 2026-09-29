'use strict'

// Phase 5 Task 1: Druckdaten und CSV-Export eines Gutschein-Stapels für den Admin (routes/adminStats.js).
// Klartext-Codes gibt es ausschließlich über printableCodes - entschlüsselt aus vouchers.code_cipher
// (lib/codes.js), nur für offene Gutscheine, nie im Log, nie in der CSV (dafür gibt es die Druckseite).

const { formatCode, decryptCode } = require('./codes')
const { voucherStatus } = require('./vouchers')

const CSV_BOM = '﻿'
const CSV_SEPARATOR = ';'
const CSV_LINE_END = '\r\n'
const CSV_COLUMNS = ['Hinweis', 'Status', 'Eingelöst am', 'Bereich', 'Partner']
// Zeichen, die eine Tabellenkalkulation als Formel-Anfang liest (=, +, -, @, Tab, CR): Bereichsnamen sind
// Nutzereingaben, ein führendes Hochkomma macht daraus sichtbar reinen Text (OWASP CSV Injection).
const FORMULA_START_RE = /^[=+\-@\t\r]/
const CSV_QUOTE_NEEDED_RE = /[";\r\n]/

// Kopfdaten für die Druckseite: bei kind='partner' oder einem gebundenen Partner-Zugang der Partner mit
// Name, Logo (wie lib/partners.js publicPartner) und Farbe - sonst null.
function printBatch(row) {
  const partner = row.partner_name
    ? {
        name: row.partner_name,
        logoUrl: row.partner_logo_file ? `/partner-media/${row.partner_logo_file}` : null,
        farbe: row.partner_farbe ?? null
      }
    : null
  return { id: row.id, label: row.label, zweck: row.zweck, partnerTyp: row.partnerTyp ?? null, partner }
}

// Klartext eines Gutscheins, formatiert XXXX-XXXX-XXXX - oder null, wenn er nicht (mehr) druckbar ist:
// eingelöst, widerrufen, abgelaufen oder ohne Geheimtext. Ein beschädigter Geheimtext zählt ebenfalls
// als nicht druckbar (mit Warnung, nie mit dem Geheimtext selbst), statt den ganzen Druck abzubrechen.
function printableCode(row) {
  if (voucherStatus(row) !== 'offen' || !row.code_cipher) return null
  try {
    return formatCode(decryptCode(row.code_cipher))
  } catch {
    console.warn(`[admin] Gutschein ${row.id}: Geheimtext nicht lesbar, wird nicht gedruckt`)
    return null
  }
}

function printableCodes(rows) {
  const codes = rows.map(printableCode).filter(Boolean)
  return { codes, nichtDruckbar: rows.length - codes.length }
}

function csvCell(value) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  const guarded = FORMULA_START_RE.test(text) ? `'${text}` : text
  return CSV_QUOTE_NEEDED_RE.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

function csvLine(cells) {
  return cells.map(csvCell).join(CSV_SEPARATOR)
}

// Eine Zeile je Gutschein: Hinweis (die letzten Zeichen des Codes, wie im Admin), Status, eingelöst am,
// der Bereich, der ihn eingelöst hat, und der Partner des Gutscheins. Keine Codes.
function voucherCsv(rows) {
  const lines = [
    csvLine(CSV_COLUMNS),
    ...rows.map((row) => csvLine([row.code_hint, voucherStatus(row), row.redeemed_at, row.redeemed_by_name, row.partner_name]))
  ]
  return `${CSV_BOM}${lines.join(CSV_LINE_END)}${CSV_LINE_END}`
}

module.exports = { printBatch, printableCodes, voucherCsv, CSV_COLUMNS }
