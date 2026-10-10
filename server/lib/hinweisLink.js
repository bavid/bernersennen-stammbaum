'use strict'

// Optionaler Link eines globalen Hinweises (lib/hinweise.js): eine https-Adresse plus Beschriftung (deutsch, optional
// englisch), z. B. „Zur neuen Familie auf Pfoten“. Nur https (das Band steht auf jeder Seite, auch vor dem Login) -
// gespeichert wird die normalisierte Form von new URL(). Beschriftungen sind reiner Text wie Titel und Text.
// Die Spalten kommen hier dazu statt in db.js (dort ist kein Platz mehr).

const db = require('../db')
const { stripUnsafeChars } = require('./partners')

const MAX_LINK_URL_LENGTH = 500
const MAX_LINK_LABEL_LENGTH = 60
const HTML_RE = /[<>]/
const LINK_COLUMNS = Object.freeze(['link_url', 'link_label', 'link_label_en'])
const NO_LINK = Object.freeze({ link_url: null, link_label: null, link_label_en: null })

const existing = db.prepare('PRAGMA table_info(hinweise)').all().map((column) => column.name)
for (const column of LINK_COLUMNS) {
  if (!existing.includes(column)) db.exec(`ALTER TABLE hinweise ADD COLUMN ${column} TEXT`)
}

function httpError(message, feld) {
  const err = new Error(message)
  err.status = 400
  err.feld = feld
  return err
}

function cleanLabel(value, feld, label) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw httpError(`${label} muss Text sein.`, feld)
  const text = stripUnsafeChars(value, { allowNewline: false }).trim()
  if (HTML_RE.test(text)) throw httpError(`${label} darf nur reinen Text enthalten (kein HTML).`, feld)
  if (text.length > MAX_LINK_LABEL_LENGTH) throw httpError(`${label} darf höchstens ${MAX_LINK_LABEL_LENGTH} Zeichen haben.`, feld)
  return text || null
}

// Gültige https-Adresse mit Host -> normalisierte Form, sonst null.
function parseHttpsUrl(value) {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw || raw.length > MAX_LINK_URL_LENGTH) return null
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) return null
    return parsed.href
  } catch {
    return null
  }
}

function cleanUrl(value) {
  if (value === null || value === undefined || value === '') return null
  const href = parseHttpsUrl(value)
  if (!href) throw httpError('Der Link muss eine gültige https-Adresse sein.', 'linkUrl')
  return href
}

// { url, label, labelEn } (schon mit den bestehenden Werten zusammengeführt) -> Spalten. Ohne Adresse kein Link -
// dann auch keine Beschriftung; mit Adresse ist die deutsche Beschriftung Pflicht.
function validateHinweisLink({ url, label, labelEn }) {
  const linkUrl = cleanUrl(url)
  const linkLabel = cleanLabel(label, 'linkLabel', 'Die Beschriftung des Links')
  const linkLabelEn = cleanLabel(labelEn, 'linkLabelEn', 'Die englische Beschriftung des Links')
  if (!linkUrl) {
    if (linkLabel || linkLabelEn) throw httpError('Zur Beschriftung gehört auch eine Adresse.', 'linkUrl')
    return { ...NO_LINK }
  }
  if (!linkLabel) throw httpError('Bitte gib eine Beschriftung für den Link an.', 'linkLabel')
  return { link_url: linkUrl, link_label: linkLabel, link_label_en: linkLabelEn }
}

// Öffentliche bzw. Admin-Form: nur, wenn es einen Link gibt.
function linkFields(row) {
  if (!row?.link_url) return {}
  return { linkUrl: row.link_url, linkLabel: row.link_label, linkLabelEn: row.link_label_en || null }
}

module.exports = { MAX_LINK_URL_LENGTH, MAX_LINK_LABEL_LENGTH, NO_LINK, parseHttpsUrl, validateHinweisLink, linkFields }
