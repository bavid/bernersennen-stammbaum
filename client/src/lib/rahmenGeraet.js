// Bilderrahmen auf einem anderen Gerät (/rahmen#TOKEN, ohne Anmeldung): das Token aus der Adresse übernehmen und merken,
// die Fotoliste mit dem Header X-Rahmen-Token holen (server/routes/rahmen.js). Das Token steht nie in Pfad oder Query und
// verlässt die Adressleiste sofort (history.replaceState) - danach lebt es nur noch im localStorage dieses Geräts.
import { readSetting, removeSetting, writeSetting } from './storage.js'
import { t } from './i18n/index.js'

export const RAHMEN_PATH = '/rahmen'
const TOKEN_KEY = 'rahmen.token'
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
// Auch ohne localStorage (privates Fenster) bleibt das Token für diesen Seitenaufruf da - und ein zweites Lesen (StrictMode)
// findet es, obwohl der #Hash schon weg ist.
let memoryToken = null

export class RahmenError extends Error {
  constructor(kind, message) {
    super(message)
    this.kind = kind // 'beendet' | 'offline' | 'fehler'
  }
}

export function rahmenLink(token, origin = window.location.origin) {
  return `${origin}${RAHMEN_PATH}#${token}`
}

export function forgetRahmenToken() {
  memoryToken = null
  removeSetting(TOKEN_KEY)
}

// Einmal beim Öffnen: steht ein Token im #Hash, kommt es in den Speicher und aus der Adresse; sonst das gemerkte.
export function takeRahmenToken(win = window) {
  const fromHash = win.location.hash.slice(1)
  if (fromHash) {
    win.history.replaceState(win.history.state, '', `${win.location.pathname}${win.location.search}`)
    if (TOKEN_RE.test(fromHash)) {
      memoryToken = fromHash
      writeSetting(TOKEN_KEY, fromHash)
      return fromHash
    }
  }
  const stored = readSetting(TOKEN_KEY, null)
  if (typeof stored === 'string' && TOKEN_RE.test(stored)) return stored
  return memoryToken
}

export async function fetchRahmenFotos(token) {
  let res
  try {
    res = await fetch('/api/rahmen/fotos', {
      headers: { 'X-Rahmen-Token': token },
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer'
    })
  } catch {
    throw new RahmenError('offline', t('Keine Verbindung – der Bilderrahmen versucht es gleich noch einmal.'))
  }
  if (res.status === 401) throw new RahmenError('beendet', t('Dieser Bilderrahmen wurde beendet'))
  if (!res.ok) throw new RahmenError('fehler', t('Die Fotos ließen sich gerade nicht holen.'))
  return res.json()
}
