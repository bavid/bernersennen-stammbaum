// Sticker für die Collage: Fluent Emoji von Microsoft (Stil "Flat", MIT-Lizenz), lokal mitgeliefert unter
// client/public/stickers/<id>.svg (Lizenz und Quellen: client/public/stickers/LICENSE.txt und QUELLEN.md).
// Nur diese Liste gilt - gespeicherte Entwürfe mit anderen Ids werden beim Laden verworfen (sanitize.js).

export const MAX_STICKERS = 30

export const STICKER_GROUPS = [
  { id: 'tiere', label: 'Tiere' },
  { id: 'feiern', label: 'Herzen & Feiern' },
  { id: 'natur', label: 'Natur' },
  { id: 'gesichter', label: 'Gesichter' }
]

const LIST = {
  tiere: [
    ['hundegesicht', 'Hundegesicht'],
    ['hund', 'Hund'],
    ['pudel', 'Pudel'],
    ['katzengesicht', 'Katzengesicht'],
    ['katze', 'Katze'],
    ['pfoten', 'Pfotenabdrücke'],
    ['knochen', 'Knochen'],
    ['hase', 'Hase'],
    ['hamster', 'Hamster'],
    ['vogel', 'Vogel']
  ],
  feiern: [
    ['herz-rot', 'Rotes Herz'],
    ['herz-braun', 'Braunes Herz'],
    ['herz-orange', 'Oranges Herz'],
    ['zwei-herzen', 'Zwei Herzen'],
    ['herz-funkelnd', 'Funkelndes Herz'],
    ['herz-schleife', 'Herz mit Schleife'],
    ['stern', 'Stern'],
    ['stern-leuchtend', 'Leuchtender Stern'],
    ['funkeln', 'Funkeln'],
    ['luftballon', 'Luftballon'],
    ['konfetti', 'Konfetti'],
    ['konfettiball', 'Konfettiball'],
    ['torte', 'Geburtstagstorte'],
    ['geschenk', 'Geschenk'],
    ['krone', 'Krone'],
    ['medaille', 'Goldmedaille'],
    ['pokal', 'Pokal'],
    ['kamera', 'Kamera']
  ],
  natur: [
    ['sonne', 'Sonne'],
    ['regenbogen', 'Regenbogen'],
    ['sonnenblume', 'Sonnenblume'],
    ['tulpe', 'Tulpe'],
    ['kirschbluete', 'Kirschblüte'],
    ['baum', 'Baum'],
    ['schneeflocke', 'Schneeflocke'],
    ['kleeblatt', 'Kleeblatt'],
    ['haus', 'Haus mit Garten']
  ],
  gesichter: [
    ['lachen', 'Lachendes Gesicht'],
    ['herzaugen', 'Herzaugen'],
    ['laecheln-herzen', 'Lächeln mit Herzen'],
    ['sternaugen', 'Sternaugen'],
    ['partygesicht', 'Partygesicht'],
    ['kusshand', 'Kusshand'],
    ['daumen-hoch', 'Daumen hoch'],
    ['applaus', 'Applaus']
  ]
}

export const STICKERS = Object.freeze(
  STICKER_GROUPS.flatMap((group) => LIST[group.id].map(([id, label]) => Object.freeze({ id, label, group: group.id })))
)

const BY_ID = new Map(STICKERS.map((sticker) => [sticker.id, sticker]))

export function isStickerId(id) {
  return typeof id === 'string' && BY_ID.has(id)
}

export function getSticker(id) {
  return BY_ID.get(id) || null
}

export function stickersOfGroup(groupId) {
  return STICKERS.filter((sticker) => sticker.group === groupId)
}

// Immer die lokale Datei (gleiche Herkunft) - kein CDN, keine Aufrufe fremder Server.
export function stickerUrl(id) {
  return `${import.meta.env.BASE_URL}stickers/${id}.svg`
}

export const STICKER_LICENSE_URL = `${import.meta.env.BASE_URL}stickers/LICENSE.txt`

// Namen der Sticker einer Seite - gleiche Motive durchnummeriert ("Stern 1", "Stern 2"), damit Vorleser und
// die Liste in der Seitenleiste sie unterscheiden.
export function stickerLabels(stickers) {
  const totals = new Map()
  stickers.forEach((s) => totals.set(s.sticker, (totals.get(s.sticker) || 0) + 1))
  const seen = new Map()
  return stickers.map((s) => {
    const label = getSticker(s.sticker)?.label || 'Sticker'
    if (totals.get(s.sticker) < 2) return label
    seen.set(s.sticker, (seen.get(s.sticker) || 0) + 1)
    return `${label} ${seen.get(s.sticker)}`
  })
}
