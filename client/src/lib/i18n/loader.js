import { LOADERS } from './languages.js'

// Wörterbücher laden (außer Deutsch, das steckt im Code): im fertigen Build über die API (/api/i18n, server/routes/i18n.js)
// mit Zwischenspeicher im Browser (localStorage `fap-i18n:<sprache>` = { version, savedAt, messages }); im Entwickeln und
// in Tests - oder wenn die API nicht antwortet - aus dem Quelltext (eigener Chunk, nicht im Haupt-Bündel).
export const CACHE_PREFIX = 'fap-i18n:'
export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const API = '/api/i18n'

function isMessages(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function storage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

// { version, savedAt, messages } oder null (nichts da, kaputt oder Speicher gesperrt).
export function readCache(lang) {
  try {
    const entry = JSON.parse(storage()?.getItem(CACHE_PREFIX + lang) || 'null')
    if (!entry || typeof entry.version !== 'string' || !Number.isFinite(entry.savedAt) || !isMessages(entry.messages)) return null
    return entry
  } catch {
    return null
  }
}

export function writeCache(lang, entry) {
  try {
    storage()?.setItem(CACHE_PREFIX + lang, JSON.stringify(entry))
  } catch {
    // Speicher voll oder gesperrt: dann eben beim nächsten Start wieder über das Netz.
  }
}

async function getJson(fetchImpl, url) {
  const res = await fetchImpl(url, { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function fromApi(lang, fetchImpl, now) {
  const manifest = await getJson(fetchImpl, API)
  const version = manifest?.versions?.[lang]
  if (typeof version !== 'string' || !version) throw new Error(`Sprache ${lang} fehlt im Manifest`)
  const cached = readCache(lang)
  if (cached && cached.version === version && now - cached.savedAt < CACHE_MAX_AGE_MS) return cached.messages
  const messages = await getJson(fetchImpl, `${API}/${lang}?v=${encodeURIComponent(version)}`)
  if (!isMessages(messages)) throw new Error(`Wörterbuch ${lang} ist ungültig`)
  writeCache(lang, { version, savedAt: now, messages })
  return messages
}

async function fromSource(lang) {
  const module = await LOADERS[lang]()
  return module.default
}

// Die Texte einer Sprache (Objekt deutscher Text/Schlüssel -> Übersetzung). Wirft nur, wenn auch der Quelltext nicht lädt.
export async function loadMessages(lang, { useApi = import.meta.env.PROD, fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  if (!LOADERS[lang]) throw new Error(`Unbekannte Sprache: ${lang}`)
  if (useApi && fetchImpl) {
    try {
      return await fromApi(lang, fetchImpl, now)
    } catch {
      // API nicht erreichbar oder Build ohne dist/i18n: weiter mit dem Quelltext.
    }
  }
  return fromSource(lang)
}
