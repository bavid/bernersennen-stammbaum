// Phase W: Beiträge im Feed von Start (components/feed/FeedItem.jsx) - reine Hilfen über die Einträge aus
// GET /api/timeline/recent (t.* samt dog_name, dog_foto_url, comment_count, foto_urls).
import { getTheme } from '../themes/index.js'

export const EXCERPT_LENGTH = 180
export const MAX_THUMBS = 3

// Das Tier eines Beitrags in der Form, die Avatar und dogLabel erwarten.
export function feedDog(entry) {
  return { name: entry.dog_name, name_unbekannt: entry.dog_name_unbekannt, rasse: entry.dog_rasse, foto_url: entry.dog_foto_url }
}

// Anriss des Texts: höchstens EXCERPT_LENGTH Zeichen, an einer Wortgrenze gekürzt, mit "…" - leerer Text bleibt leer.
export function excerpt(text, length = EXCERPT_LENGTH) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= length) return clean
  const cut = clean.slice(0, length)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > length * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.–-]+$/, '')} …`
}

// Vorschaubilder: die ersten MAX_THUMBS Fotos und wie viele darüber hinaus ("+2").
export function thumbnails(urls, max = MAX_THUMBS) {
  const list = Array.isArray(urls) ? urls.filter((url) => typeof url === 'string' && url) : []
  return { shown: list.slice(0, max), more: Math.max(0, list.length - max) }
}

// "3 Grüße" - die Kommentare heißen wie im Auftritt (words.greeting/greetings, Phase W Schritt 2).
export function commentsLabel(count, words = getTheme('standard').words) {
  if (!Number.isInteger(count) || count <= 0) return null
  return count === 1 ? `1 ${words.greeting}` : `${count} ${words.greetings}`
}

// Ziel eines Beitrags: die Tierseite, dort direkt am Eintrag (Timeline.jsx setzt id="entry-…").
export function entryLink(entry) {
  return `/tier/${entry.dog_id}#entry-${entry.id}`
}
