'use strict'

const db = require('../db')
const config = require('../config')
const { publicPartnerSql } = require('./partners')
const { absoluteUrl } = require('./publicUrl')

// Phase G Task 2: robots.txt und sitemap.xml (routes/seo.js). Suchmaschinen dürfen die Startseite, die
// Partnerseiten und die Portale /p/:slug sehen - nie die API, den Admin, den Gutschein-Einstieg /v, die
// Steckbriefe /t/ (Roadmap-Entscheidung 14, zusätzlich noindex im Client) oder Foto-Verzeichnisse.
const ROBOTS_RULES = [
  'User-agent: *',
  'Allow: /',
  'Allow: /p/',
  'Disallow: /api/',
  'Disallow: /admin',
  'Disallow: /v',
  'Disallow: /t/',
  'Disallow: /uploads/',
  'Disallow: /public-media/',
  'Disallow: /partner-media/'
]

// Seiten ohne Datenbank-Bezug, immer in der Sitemap - Reihenfolge ist auch die Ausgabereihenfolge. Phase F: dazu
// „So finanzieren wir uns“ (/finanzierung) - öffentlich und bewusst auffindbar.
const STATIC_PATHS = ['/', '/partner', '/partner-werden', '/finanzierung']

const SITEMAP_TTL_MS = 10 * 60 * 1000
const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9'

// Nur eine Sitemap-Zeile, wenn es die Sitemap auch gibt (absolute Adressen brauchen PUBLIC_URL).
function robotsTxt() {
  const lines = config.publicUrl ? [...ROBOTS_RULES, `Sitemap: ${absoluteUrl('/sitemap.xml')}`] : ROBOTS_RULES
  return `${lines.join('\n')}\n`
}

// Dieselbe Sichtbarkeit wie die Partnerliste für einen anonymen Besucher (routes/partners.js demoAllowed):
// Demo-Partner nur auf dev/staging, in Produktion nie - die Sitemap soll genau das nennen, was /partner zeigt.
function portalPaths() {
  const demoClause = config.appEnv === 'production' ? 'AND is_demo = 0' : ''
  return db
    .prepare(`SELECT slug FROM partners WHERE ${publicPartnerSql()} ${demoClause} ORDER BY slug`)
    .all()
    .map((row) => `/p/${row.slug}`)
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Baut das XML aus fertigen (absoluten) Adressen - ohne lastmod/priority, mehr braucht eine so kleine Seite nicht.
function buildSitemapXml(urls) {
  const entries = urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`)
  return ['<?xml version="1.0" encoding="UTF-8"?>', `<urlset xmlns="${SITEMAP_NS}">`, ...entries, '</urlset>', ''].join('\n')
}

// Ein Eintrag { xml, expiresAt }, wird als Ganzes ersetzt statt verändert. Zehn Minuten reichen: ein neuer
// Partner taucht spätestens dann auf, und Crawler holen die Sitemap ohnehin selten.
let cache = null

function sitemapXml(now = Date.now()) {
  if (cache && cache.expiresAt > now) return cache.xml
  const xml = buildSitemapXml([...STATIC_PATHS, ...portalPaths()].map((urlPath) => absoluteUrl(urlPath)))
  cache = { xml, expiresAt: now + SITEMAP_TTL_MS }
  return xml
}

module.exports = { robotsTxt, sitemapXml, buildSitemapXml, ROBOTS_RULES, STATIC_PATHS, SITEMAP_TTL_MS }
