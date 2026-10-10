import { api } from '../api'

// Instanz-Modus (server/lib/instanzModus.js, GET /api/config instanzModus): '' = das normale Produkt, 'rudel' = eine
// Instanz nur für ein Bestandsrudel - Login nur per Familien-Passwort, keine Gutscheine, Demo oder Partner-Einstiege.
// Ohne Antwort (Netz weg) gilt das normale Produkt: der Server sperrt im Rudel-Modus ohnehin alles Weitere.
export const INSTANZ_RUDEL = 'rudel'

let pending = null

export function loadInstanzModus() {
  if (!pending) {
    pending = Promise.resolve()
      .then(() => api.config())
      .then((config) => (typeof config?.instanzModus === 'string' ? config.instanzModus : ''))
      .catch(() => {
        pending = null
        return ''
      })
  }
  return pending
}

export function isRudelInstanz(modus) {
  return modus === INSTANZ_RUDEL
}

// Nur für Tests: den gemerkten Modus vergessen.
export function resetInstanzModus() {
  pending = null
}
