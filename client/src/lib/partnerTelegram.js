// Reine Hilfen für die Telegram-Hinweise im Partner-Bereich (Phase V4b, PartnerTelegramSection) - spiegeln
// server/routes/partnerArea/telegram.js (Antwortform, Link https://t.me/<bot>?start=<code>) und den eigenen Bot je
// Partner (server/routes/partnerArea/telegramBot.js, TelegramOwnBot).

// Der offene Verbinden-Dialog fragt so oft nach, ob Telegram die Verbindung bestätigt hat (der Server drosselt selbst).
export const POLL_INTERVAL_MS = 10_000

// Die Schalter je Ereignis - Schlüssel wie im Server (PUT /partner-area/telegram/hinweise).
export const HINWEIS_OPTIONS = Object.freeze([
  { key: 'nachricht', label: 'Neue Nachricht über ‚Schreib uns‘' },
  { key: 'freigabe', label: 'Beitrag freigegeben oder abgelehnt' }
])

// Warum eine Verbindung endete (server/lib/partnerTelegram.js GETRENNT): Telegram meldet den Bot als blockiert, oder der
// Bot hat gewechselt (eigener Bot eingetragen, gewechselt oder entfernt) - dann neu verbinden.
export const GETRENNT = Object.freeze({ blockiert: 'blockiert', botGewechselt: 'bot-gewechselt' })
const GETRENNT_VALUES = Object.values(GETRENNT)

// Welcher Bot schreibt: der eigene des Partners oder der des Teams (server/lib/partnerTelegramBots.js QUELLE).
export const BOT_QUELLE = Object.freeze({ eigener: 'eigener', plattform: 'plattform' })

const NOT_SET_UP = Object.freeze({ eingerichtet: false, verbunden: false, getrennt: null, hinweise: { nachricht: false, freigabe: false }, bot: null })

// Nur genau dieser Link landet in einem href oder QR-Code: t.me, ein Bot-Name, ein Code - nichts sonst.
const TELEGRAM_LINK_RE = /^https:\/\/t\.me\/[A-Za-z][A-Za-z0-9_]{3,31}\?start=[A-Za-z0-9_-]{16,64}$/
// Bot-Namen wie bei Telegram - nur so einer wird als „@name“ angezeigt.
const BOT_USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{3,31}$/
// Das Format eines Bot-Tokens (wie server/lib/telegramFormat.js) - geprüft, bevor das Feld überhaupt abschickt.
const TOKEN_RE = /^\d{1,20}:[A-Za-z0-9_-]{30,100}$/

export function isTelegramLink(url) {
  return typeof url === 'string' && TELEGRAM_LINK_RE.test(url)
}

export function isBotToken(value) {
  return typeof value === 'string' && TOKEN_RE.test(value.trim())
}

// bot aus der Antwort -> { quelle, username } oder null. Der Name nur beim eigenen Bot und nur im Telegram-Format.
function botStatus(bot) {
  if (!bot || typeof bot !== 'object' || !Object.values(BOT_QUELLE).includes(bot.quelle)) return null
  const username = bot.quelle === BOT_QUELLE.eigener && typeof bot.username === 'string' && BOT_USERNAME_RE.test(bot.username) ? bot.username : null
  return { quelle: bot.quelle, username }
}

// Antwort von GET/POST/PUT/DELETE /partner-area/telegram -> immer dieselbe Form mit echten Booleans.
export function telegramStatus(data) {
  if (!data || typeof data !== 'object') return NOT_SET_UP
  const verbunden = data.verbunden === true
  return {
    eingerichtet: data.eingerichtet === true,
    verbunden,
    getrennt: !verbunden && GETRENNT_VALUES.includes(data.getrennt) ? data.getrennt : null,
    hinweise: {
      nachricht: verbunden && data.hinweise?.nachricht === true,
      freigabe: verbunden && data.hinweise?.freigabe === true
    },
    bot: botStatus(data.bot)
  }
}

// Hat der Partner einen eigenen Bot eingetragen?
export function hasOwnBot(status) {
  return status?.bot?.quelle === BOT_QUELLE.eigener
}
