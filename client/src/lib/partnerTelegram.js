// Reine Hilfen für die Telegram-Hinweise im Partner-Bereich (Phase V4b, PartnerTelegramSection) - spiegeln
// server/routes/partnerArea/telegram.js (Antwortform, Link https://t.me/<bot>?start=<code>).

// Der offene Verbinden-Dialog fragt so oft nach, ob Telegram die Verbindung bestätigt hat (der Server drosselt selbst).
export const POLL_INTERVAL_MS = 10_000

// Die Schalter je Ereignis - Schlüssel wie im Server (PUT /partner-area/telegram/hinweise).
export const HINWEIS_OPTIONS = Object.freeze([
  { key: 'nachricht', label: 'Neue Nachricht über ‚Schreib uns‘' },
  { key: 'freigabe', label: 'Beitrag freigegeben oder abgelehnt' }
])

const NOT_SET_UP = Object.freeze({ eingerichtet: false, verbunden: false, getrennt: null, hinweise: { nachricht: false, freigabe: false } })

// Nur genau dieser Link landet in einem href oder QR-Code: t.me, ein Bot-Name, ein Code - nichts sonst.
const TELEGRAM_LINK_RE = /^https:\/\/t\.me\/[A-Za-z][A-Za-z0-9_]{3,31}\?start=[A-Za-z0-9_-]{16,64}$/

export function isTelegramLink(url) {
  return typeof url === 'string' && TELEGRAM_LINK_RE.test(url)
}

// Antwort von GET/POST/PUT/DELETE /partner-area/telegram -> immer dieselbe Form mit echten Booleans.
export function telegramStatus(data) {
  if (!data || typeof data !== 'object') return NOT_SET_UP
  const verbunden = data.verbunden === true
  return {
    eingerichtet: data.eingerichtet === true,
    verbunden,
    getrennt: !verbunden && data.getrennt === 'blockiert' ? 'blockiert' : null,
    hinweise: {
      nachricht: verbunden && data.hinweise?.nachricht === true,
      freigabe: verbunden && data.hinweise?.freigabe === true
    }
  }
}
