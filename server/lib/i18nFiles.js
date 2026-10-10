'use strict'

// Wörterbücher des Clients für /api/i18n (routes/i18n.js): beim Bauen schreibt client/scripts/build-i18n.mjs
// <clientDist>/i18n/manifest.json ({ languages, versions }) und je Sprache außer Deutsch <sprache>.json. Gelesen wird
// bei Bedarf; solange sich die Datei nicht ändert (mtime/Größe), aus dem Speicher. Fehlt der Build -> null.

const fs = require('node:fs')
const path = require('node:path')

const LANG_RE = /^[a-z]{2}$/
const VERSION_RE = /^[0-9a-f]{6,64}$/

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

// Nur gültige Einträge übernehmen: Sprachen als Kürzel, Versionen als Hex-Prüfsumme.
function cleanManifest(raw) {
  if (!isPlainObject(raw) || !Array.isArray(raw.languages) || !isPlainObject(raw.versions)) return null
  const languages = raw.languages.filter((lang) => typeof lang === 'string' && LANG_RE.test(lang))
  const versions = {}
  for (const [lang, version] of Object.entries(raw.versions)) {
    if (LANG_RE.test(lang) && typeof version === 'string' && VERSION_RE.test(version)) versions[lang] = version
  }
  return { languages, versions }
}

function createI18nFiles(distDir) {
  const dir = path.join(distDir, 'i18n')
  const cache = new Map()

  // Inhalt einer Datei (Text) oder null; neu gelesen nur, wenn sie sich geändert hat (neuer Build).
  function readText(file) {
    try {
      const stat = fs.statSync(file)
      const hit = cache.get(file)
      if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.text
      const text = fs.readFileSync(file, 'utf8')
      cache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, text })
      return text
    } catch {
      return null
    }
  }

  function manifest() {
    const text = readText(path.join(dir, 'manifest.json'))
    if (text === null) return null
    try {
      return cleanManifest(JSON.parse(text))
    } catch {
      return null
    }
  }

  // { version, body } für eine Sprache aus dem Manifest, sonst null (unbekannt, Deutsch oder Datei fehlt).
  function messages(lang) {
    if (typeof lang !== 'string' || !LANG_RE.test(lang)) return null
    const version = manifest()?.versions[lang]
    if (!version) return null
    const body = readText(path.join(dir, `${lang}.json`))
    return body === null ? null : { version, body }
  }

  return { manifest, messages }
}

module.exports = { createI18nFiles, LANG_RE }
