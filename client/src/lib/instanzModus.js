import { api } from '../api'

// Instanz-Modus (server/lib/instanzModus.js, GET /api/config instanzModus): '' = das normale Produkt, 'rudel' = eine
// Instanz nur für ein Bestandsrudel - Login nur per Familien-Passwort, keine Gutscheine, Demo oder Partner-Einstiege.
// Ohne Antwort (Netz weg) gilt das normale Produkt: der Server sperrt im Rudel-Modus ohnehin alles Weitere.
export const INSTANZ_RUDEL = 'rudel'

let pending = null

// GET /api/config einmal je Seitenaufruf; ohne Antwort (Netz weg) ein leeres Objekt = das normale Produkt.
function loadConfig() {
  if (!pending) {
    pending = Promise.resolve()
      .then(() => api.config())
      .catch(() => {
        pending = null
        return {}
      })
  }
  return pending
}

export function loadInstanzModus() {
  return loadConfig().then((config) => (typeof config?.instanzModus === 'string' ? config.instanzModus : ''))
}

// Link „Es gibt eine neue Version“ (server/lib/rudelNeueVersion.js) - nur in der Rudel-Instanz, sonst null.
export function loadNeueVersionUrl() {
  return loadConfig().then((config) => (typeof config?.neueVersionUrl === 'string' && config.neueVersionUrl ? config.neueVersionUrl : null))
}

export function isRudelInstanz(modus) {
  return modus === INSTANZ_RUDEL
}

// Nur für Tests: den gemerkten Modus vergessen.
export function resetInstanzModus() {
  pending = null
}
