'use strict'

const db = require('../db')

// Phase 5 Task 5b: Protokoll der Admin-Aktionen (Tabelle admin_log, db.js). Aktionen: 'view' - der Admin hat
// einen Bereich in der Admin-Ansicht geöffnet (routes/admin.js POST /view/:familyId), ziel 'family:<id>';
// 'gutschein-zugewiesen' (Phase N Task 1) - einer Anfrage wurde ein Gutschein zugewiesen
// (routes/adminAnfragen.js), ziel 'anfrage:<id>'; 'telegram-eingerichtet'/'telegram-entfernt' (Phase N Task 2) - Bot-Token
// oder Chat-ID im Admin eingetragen bzw. gelöscht (routes/adminNotify.js), ziel 'telegram';
// 'partner-vertrauenswuerdig'/'partner-nicht-vertrauenswuerdig' (V-Fehler 3) - der Admin hat den Schalter
// "Vertrauenswürdig" eines Partners umgelegt (routes/admin.js), ziel 'partner:<id>'. ziel benennt nur das
// Objekt, nie Namen, Inhalte, Codes oder Zugangsdaten.
const AKTION = Object.freeze({
  view: 'view',
  gutscheinZugewiesen: 'gutschein-zugewiesen',
  telegramEingerichtet: 'telegram-eingerichtet',
  telegramEntfernt: 'telegram-entfernt',
  partnerVertrauenswuerdig: 'partner-vertrauenswuerdig',
  partnerNichtVertrauenswuerdig: 'partner-nicht-vertrauenswuerdig',
  // Phase V4a: ein Termin eines Partners ausgeblendet, wieder eingeblendet oder gelöscht (routes/adminTermine.js),
  // ziel 'termin:<id>'.
  terminAusgeblendet: 'termin-ausgeblendet',
  terminEingeblendet: 'termin-eingeblendet',
  terminGeloescht: 'termin-geloescht',
  // Audit V7a: ein Bannerfoto eines Partners entfernt (routes/adminBanner.js), ziel 'partner:<id>'.
  bannerfotoEntfernt: 'bannerfoto-entfernt',
  // Phase N Task 5: ein globaler Hinweis angelegt, geändert, ein- bzw. ausgeschaltet oder gelöscht
  // (routes/adminHinweise.js), ziel 'hinweis:<id>' - nie Titel oder Text.
  hinweisAngelegt: 'hinweis-angelegt',
  hinweisGeaendert: 'hinweis-geaendert',
  hinweisEingeschaltet: 'hinweis-eingeschaltet',
  hinweisAusgeschaltet: 'hinweis-ausgeschaltet',
  hinweisGeloescht: 'hinweis-geloescht',
  // Einladungskarten: die Admin-Einstellung "Einladungskarte – Rückseite" geändert (routes/adminEinladungskarte.js),
  // ziel 'einstellung:einladungskarte' - nie die Texte selbst.
  einladungskarteGeaendert: 'einladungskarte-geaendert',
  // Phase F: „So finanzieren wir uns“ (routes/adminFinanzierung.js) - Spenden-Hinweis oder Ziel geändert (ziel
  // 'einstellung:finanzierung-spenden-hinweis' bzw. 'einstellung:finanzierung-ziel') und Quartale (ziel 'quartal:<id>') -
  // nie Beträge oder Texte.
  finanzierungGeaendert: 'finanzierung-geaendert',
  finanzierungQuartalAngelegt: 'finanzierung-quartal-angelegt',
  finanzierungQuartalGeaendert: 'finanzierung-quartal-geaendert',
  finanzierungQuartalGeloescht: 'finanzierung-quartal-geloescht',
  // Phase F: das Team hat „Überall sichtbar“ eines Partners ausgeschaltet und gesperrt bzw. wieder erlaubt
  // (routes/adminPartnerSichtbar.js), ziel 'partner:<id>'.
  partnerUeberallGesperrt: 'partner-ueberall-gesperrt',
  partnerUeberallErlaubt: 'partner-ueberall-erlaubt',
  // Antrag „Deutschlandweit sichtbar“ freigegeben bzw. abgelehnt (routes/adminPartnerSichtbar.js), ziel 'partner:<id>' -
  // nie der Grund selbst.
  partnerUeberallFreigegeben: 'partner-ueberall-freigegeben',
  partnerUeberallAbgelehnt: 'partner-ueberall-abgelehnt',
  // „Kosten & Reserve“: ein laufender Kosten-Posten angelegt, geändert oder gelöscht (routes/adminFinanzierung.js), ziel
  // 'kosten:<id>' - nie Beträge oder Titel.
  finanzierungKostenAngelegt: 'finanzierung-kosten-angelegt',
  finanzierungKostenGeaendert: 'finanzierung-kosten-geaendert',
  finanzierungKostenGeloescht: 'finanzierung-kosten-geloescht',
  // „Anschub“: eine Vorleistung angelegt, geändert oder gelöscht (routes/adminFinanzierung.js), ziel 'vorleistung:<id>'.
  finanzierungVorleistungAngelegt: 'finanzierung-vorleistung-angelegt',
  finanzierungVorleistungGeaendert: 'finanzierung-vorleistung-geaendert',
  finanzierungVorleistungGeloescht: 'finanzierung-vorleistung-geloescht',
  // „Spenden live“: eine Spende erfasst, geändert oder gelöscht (routes/adminSpenden.js), ziel 'spende:<id>' - nie Betrag
  // oder Name.
  spendeErfasst: 'spende-erfasst',
  spendeGeaendert: 'spende-geaendert',
  spendeGeloescht: 'spende-geloescht',
  // Startseite: der Admin stellt einen Partner im Laufband vor bzw. nimmt ihn heraus (routes/adminPartnerVorgestellt.js),
  // ziel 'partner:<id>'.
  partnerVorgestellt: 'partner-vorgestellt',
  partnerNichtVorgestellt: 'partner-nicht-vorgestellt',
  // Startseite: die Demo-Ausnahme des Laufbands ein- oder ausgeschaltet (routes/adminCommunity.js), ziel
  // 'einstellung:community-demo-partner'.
  communityDemoPartnerGeaendert: 'community-demo-partner-geaendert',
  // Startseite: Band „Mit dabei“ eingestellt - Partner des Monats, Zahlen, eigener Eintrag (routes/adminCommunity.js),
  // ziel 'einstellung:community-banner'.
  communityBannerGeaendert: 'community-banner-geaendert',
  // Plan 2027 Kap. 6: Landeadressen je Kanal (routes/adminLandeadressen.js), ziel 'landeadresse:<id>'.
  landeadresseAngelegt: 'landeadresse-angelegt',
  landeadresseGeaendert: 'landeadresse-geaendert',
  landeadresseEingeschaltet: 'landeadresse-eingeschaltet',
  landeadresseAusgeschaltet: 'landeadresse-ausgeschaltet'
})

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

const insertStmt = db.prepare('INSERT INTO admin_log (aktion, ziel) VALUES (?, ?)')
const recentStmt = db.prepare('SELECT id, aktion, ziel, created_at FROM admin_log ORDER BY created_at DESC, id DESC LIMIT ?')

function familyZiel(familyId) {
  return `family:${familyId}`
}

function anfrageZiel(anfrageId) {
  return `anfrage:${anfrageId}`
}

function partnerZiel(partnerId) {
  return `partner:${partnerId}`
}

function terminZiel(terminId) {
  return `termin:${terminId}`
}

function hinweisZiel(hinweisId) {
  return `hinweis:${hinweisId}`
}

function quartalZiel(quartalId) {
  return `quartal:${quartalId}`
}

function kostenZiel(kostenId) {
  return `kosten:${kostenId}`
}

function vorleistungZiel(id) {
  return `vorleistung:${id}`
}

function spendeZiel(id) {
  return `spende:${id}`
}

function landeadresseZiel(id) {
  return `landeadresse:${id}`
}

function logAdminAction(aktion, ziel) {
  insertStmt.run(aktion, ziel)
}

// ?limit= aus der Query: nur eine positive Ganzzahl zählt, gedeckelt auf MAX_LIMIT; alles andere (fehlend,
// 0, Text) ergibt DEFAULT_LIMIT.
function cleanLimit(value) {
  const limit = Number(value)
  if (!Number.isInteger(limit) || limit <= 0) return DEFAULT_LIMIT
  return Math.min(limit, MAX_LIMIT)
}

function recentAdminLog(limit) {
  return recentStmt.all(cleanLimit(limit))
}

module.exports = {
  AKTION,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  familyZiel,
  anfrageZiel,
  partnerZiel,
  terminZiel,
  hinweisZiel,
  quartalZiel,
  kostenZiel,
  landeadresseZiel,
  vorleistungZiel,
  spendeZiel,
  logAdminAction,
  cleanLimit,
  recentAdminLog
}
