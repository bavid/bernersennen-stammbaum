// Gutschein-Codes: Anzeige/Eingabe immer als XXXX-XXXX-XXXX. Der Server normalisiert beim Absenden
// großzügig (Klein/Groß, O/I/L, Trennzeichen) – hier geht es nur um ein angenehmes Tippgefühl im Feld.
const CODE_CHAR_COUNT = 12
const GROUP_SIZE = 4
const GROUP_PATTERN = new RegExp(`.{1,${GROUP_SIZE}}`, 'g')

export function formatVoucherCode(value) {
  const clean = (value || '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, CODE_CHAR_COUNT)
  return clean.match(GROUP_PATTERN)?.join('-') ?? ''
}

export function isCompleteVoucherCode(formatted) {
  return formatted.replace(/-/g, '').length === CODE_CHAR_COUNT
}
