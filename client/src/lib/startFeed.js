// Phase W, Schritt 3 („Ein Start für alles“): der Feed von Start aus GET /api/start (server/lib/startFeed.js) - Erinnerungen
// und Zettel aus dem eigenen Zuhause, den Familien und den befreundeten Zuhause, je mit ihrem Bereich (area: { id, name,
// art: 'eigen' | 'familie' | 'besuch' }). Reine Hilfen ohne React.
import { groupRoute } from './areas.js'
import { isPastTermin } from './notes.js'

// Ids kommen als Zahlen vom Server - trotzdem kodiert, damit nie ein fremdes Zeichen in die Adresse gerät.
const seg = (value) => encodeURIComponent(String(value))

// Eine Zeile des Servers in der Form, die die Karten kennen (FeedItem: flache dog_*-Felder wie /api/timeline/recent).
export function toFeedItem(item) {
  if (item?.type !== 'eintrag') return item
  const dog = item.dog || {}
  return {
    ...item,
    dog_id: dog.id,
    dog_name: dog.name,
    dog_name_unbekannt: dog.name_unbekannt,
    dog_rasse: dog.rasse,
    dog_foto_url: dog.foto_url,
    dog_zuhause: dog.zuhause ?? null
  }
}

// Schlüssel einer Karte - Erinnerungen und Zettel haben eigene Ids.
export function feedKey(item) {
  return `${item.type || 'eintrag'}-${item.id}`
}

// Der kleine Bereichs-Hinweis an Zetteln und Terminen: „Familie Sonnenhang“, „Zu Besuch: Zuhause Möwenweg“ - im eigenen
// Zuhause keiner. Erinnerungen nennen stattdessen, wo das Tier wohnt (lib/tierZuhause.js, components/feed/OriginChip.jsx).
export function areaChipLabel(area) {
  if (!area?.name) return null
  if (area.art === 'familie') return area.name
  if (area.art === 'besuch') return `Zu Besuch: ${area.name}`
  return null
}

// Wohin eine Erinnerung führt: die Tierseite im Bereich der Karte (das AreaGate wechselt dorthin), direkt an der Erinnerung.
// Ohne Bereich (z. B. gerade erst im Zuhause festgehalten) im aktiven Bereich.
export function feedEntryLink(entry) {
  const anchor = `#entry-${seg(entry.id)}`
  if (!entry.area?.id) return `/tier/${seg(entry.dog_id)}${anchor}`
  return `/tier/${seg(entry.dog_id)}?in=${seg(entry.area.id)}${anchor}`
}

// Ein Zettel führt zur Pinnwand seines Bereichs: im eigenen Zuhause /pinnwand?in=home, in einer Familie deren Reiter.
export function feedNoteLink(note) {
  return note.area?.art === 'familie' ? groupRoute(seg(note.area.id), 'pinnwand') : '/pinnwand?in=home'
}

// Weitere Seite anhängen - was schon da ist (z. B. eben festgehalten), nicht noch einmal. Neue Liste.
export function appendPage(items, more) {
  const seen = new Set(items.map(feedKey))
  return [...items, ...more.filter((item) => !seen.has(feedKey(item)))]
}

// So viele kommende Termine stehen unter „Bald“, so viele neue Zettel unter „Neu an der Pinnwand“.
export const SOON_TERMINE_VISIBLE = 3
export const PINBOARD_NOTES_VISIBLE = 2

// Die nächsten Termine (GET /api/start termine) ohne die, die nach der Uhr des Geräts schon vorbei sind.
export function upcomingTermine(termine, today) {
  const list = Array.isArray(termine) ? termine : []
  return list.filter((termin) => termin.termin_datum && !isPastTermin(termin, today)).slice(0, SOON_TERMINE_VISIBLE)
}

// Die neuesten Zettel (nur auf der ersten Seite, höchstens fünf, nach letzter Aktivität - server/lib/startFeed.js) - ohne
// die, die schon als Termin unter „Bald“ stehen (eine Stelle je Sache).
export function pinboardNews(items, shownTermine = []) {
  const inSoon = new Set(shownTermine.map((termin) => `${termin.area?.id}:${termin.id}`))
  return (items || [])
    .filter((item) => item.type === 'zettel' && !inSoon.has(`${item.area?.id}:${item.id}`))
    .slice(0, PINBOARD_NOTES_VISIBLE)
}

// Nur Erinnerungen (die Zettel stehen in einer eigenen kleinen Liste).
export function feedEntries(items) {
  return (items || []).filter((item) => item.type !== 'zettel')
}

// Nur Erinnerungen aus dem eigenen Zuhause (z. B. für die Bilderrahmen-Karte) - Zettel und andere Bereiche nicht.
export function homeEntries(items) {
  return (items || []).filter((item) => item.type === 'eintrag' && (!item.area || item.area.art === 'eigen'))
}
