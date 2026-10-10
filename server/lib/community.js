'use strict'

// Laufband der Startseite („Dabei sind 10 Familien · 200 Erinnerungen · 500 € Spenden · …“): GET /api/community
// (routes/community.js). Nur Summen, nie etwas Persönliches - gezählt aus echten Daten ohne Demo (is_demo = 0; eine
// eigene Markierung für Test-Bereiche gibt es nicht, die Testumgebung legt ihre nur in dev/staging an). Familien = Bereiche
// der Art rudel, Zuhause = art zuhause (Partner- und Tierheim-Bereiche zählen nicht), Erinnerungen und Fotos aus den
// Chronik-Einträgen echter Bereiche, Partner = öffentlich sichtbare echte Partner, Spenden = Summe aller Quartale
// (finanzierung_quartale.einnahmen_spenden_cents). Dazu bis zu drei vom Admin vorgestellte Partner (lib/partnerVorgestellt.js)
// - nur { slug, name, typ, fotos }; Partner des Monats, Zahlen-Auswahl und eigener Eintrag aus lib/communityBanner.js.
// Demo-Ausnahme (Wunsch des Betreibers): solange kein echter Partner vorgestellt ist, darf die
// Demo-Hundeschule (sonst das Demo-Tierheim) erscheinen - Einstellung community_demo_partner_erlaubt, Vorgabe an in dev und
// staging, aus in Produktion. Im Prozess fünf Minuten zwischengespeichert; Admin-Schalter leeren den Speicher.

const db = require('../db')
const config = require('../config')
const { publicPartnerSql } = require('./partners')
const { COLUMN: VORGESTELLT, MAX_VORGESTELLT } = require('./partnerVorgestellt')
const { readBannerConfig, chosenPartner, partnerFotos } = require('./communityBanner')
// Legt finanzierung_quartale an, falls dieses Modul zuerst geladen wird.
require('./finanzierung')

const CACHE_MS = 5 * 60 * 1000
const KEY_DEMO_PARTNER = 'community_demo_partner_erlaubt'

const familienStmt = db.prepare(`
  SELECT COUNT(CASE WHEN art = 'rudel' THEN 1 END) AS familien, COUNT(CASE WHEN art = 'zuhause' THEN 1 END) AS zuhause
  FROM families WHERE is_demo = 0`)
const erinnerungenStmt = db.prepare(`
  SELECT COUNT(*) AS erinnerungen,
    COALESCE(SUM(CASE WHEN json_valid(te.foto_urls) THEN json_array_length(te.foto_urls) ELSE 0 END), 0) AS fotos
  FROM timeline_entries te JOIN families f ON f.id = te.family_id
  WHERE f.is_demo = 0`)
const partnerStmt = db.prepare(`SELECT COUNT(*) AS n FROM partners WHERE is_demo = 0 AND ${publicPartnerSql()}`)
const spendenStmt = db.prepare('SELECT COALESCE(SUM(einnahmen_spenden_cents), 0) AS cents FROM finanzierung_quartale')
const vorgestelltStmt = db.prepare(`
  SELECT id, slug, name, typ FROM partners
  WHERE ${VORGESTELLT} = 1 AND is_demo = 0 AND ${publicPartnerSql()}
  ORDER BY name COLLATE NOCASE LIMIT ${MAX_VORGESTELLT}`)
const demoPartnerStmt = db.prepare(`
  SELECT id, slug, name, typ FROM partners
  WHERE is_demo = 1 AND typ IN ('hundeschule', 'tierheim') AND ${publicPartnerSql()}
  ORDER BY CASE typ WHEN 'hundeschule' THEN 0 ELSE 1 END, name COLLATE NOCASE LIMIT 1`)
const readSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?')
const upsertSettingStmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')

let cache = null

function clearCommunityCache() {
  cache = null
}

// Gespeichert '1'/'0'; ohne Eintrag die Vorgabe der Umgebung (Produktion aus).
function readDemoPartnerErlaubt() {
  const row = readSettingStmt.get(KEY_DEMO_PARTNER)
  if (row) return row.value === '1'
  return config.appEnv !== 'production'
}

// changed: ob sich der gespeicherte Wert änderte.
function setDemoPartnerErlaubt(erlaubt) {
  const changed = readDemoPartnerErlaubt() !== erlaubt
  upsertSettingStmt.run(KEY_DEMO_PARTNER, erlaubt ? '1' : '0')
  clearCommunityCache()
  return { demoPartnerErlaubt: erlaubt, changed }
}

function partnerVorgestellt() {
  const echte = vorgestelltStmt.all()
  if (echte.length || !readDemoPartnerErlaubt()) return echte
  return demoPartnerStmt.all()
}

// Partner des Monats (ausdrücklich gewählt, lib/communityBanner.js) vorn, danach die übrigen Vorgestellten - höchstens
// MAX_VORGESTELLT. Ein gewählter Demo-Partner erscheint nur mit eingeschalteter Demo-Ausnahme.
function featuredPartners(bannerConfig) {
  const chosen = chosenPartner(bannerConfig)
  const monat = chosen && (!chosen.is_demo || readDemoPartnerErlaubt()) ? chosen : null
  const rest = partnerVorgestellt().filter((p) => !monat || p.id !== monat.id)
  return { monat, list: (monat ? [monat, ...rest] : rest).slice(0, MAX_VORGESTELLT) }
}

function zahlen() {
  const { familien, zuhause } = familienStmt.get()
  const { erinnerungen, fotos } = erinnerungenStmt.get()
  return { familien, zuhause, erinnerungen, fotos, partner: partnerStmt.get().n, spendenCents: spendenStmt.get().cents }
}

// Öffentlich je Partner nur slug, name, typ und bis zu fünf schon öffentliche Foto-Adressen - nie die Id.
function publicFeatured({ id, slug, name, typ }) {
  return { slug, name, typ, fotos: partnerFotos(id) }
}

function buildCommunity() {
  const bannerConfig = readBannerConfig()
  const { monat, list } = featuredPartners(bannerConfig)
  return {
    ...zahlen(),
    partnerVorgestellt: list.map(publicFeatured),
    banner: {
      partnerDesMonats: Boolean(monat),
      chips: bannerConfig.chips,
      hinweis: bannerConfig.text ? { text: bannerConfig.text, link: bannerConfig.link } : null
    }
  }
}

// Für die Vorschau im Admin (routes/adminCommunity.js): die Zahlen und die vorgestellten Partner OHNE Partner des Monats -
// die Wahl im Formular setzt der Client davor (client/src/lib/communityBannerAdmin.js).
function bannerVorschau() {
  return { zahlen: zahlen(), vorgestellt: partnerVorgestellt().map(publicFeatured) }
}

function readCommunity(now = Date.now()) {
  if (!cache || now - cache.at >= CACHE_MS) cache = { at: now, payload: buildCommunity() }
  return cache.payload
}

module.exports = { KEY_DEMO_PARTNER, CACHE_MS, readCommunity, bannerVorschau, clearCommunityCache, readDemoPartnerErlaubt, setDemoPartnerErlaubt }
