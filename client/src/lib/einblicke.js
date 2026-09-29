// Reine Hilfen für die Einblicke eines Partners (EinblickeEditor) - spiegeln server/lib/einblicke.js
// (MAX_EINBLICKE, MAX_TEXT_LENGTH, Sortierung) und routes/partnerArea/einblicke.js (nur JPG/PNG).

export const MAX_EINBLICKE = 60
export const MAX_EINBLICK_TEXT = 300
export const LIMIT_MESSAGE = `Höchstens ${MAX_EINBLICKE} Einblicke – bitte ältere löschen.`
export const TYPE_MESSAGE = 'Bitte als JPG oder PNG hochladen.'
export const EINBLICK_ACCEPT = 'image/jpeg,image/png'

const EINBLICK_MIME_TYPES = EINBLICK_ACCEPT.split(',')

export function isEinblickFileType(file) {
  return Boolean(file) && EINBLICK_MIME_TYPES.includes(file.type)
}

// Neueste zuerst (Datum absteigend, bei gleichem Datum die jüngere id vorn) - wie der Server.
export function sortEinblicke(list) {
  return [...list].sort((a, b) => {
    if (a.datum !== b.datum) return a.datum < b.datum ? 1 : -1
    return b.id - a.id
  })
}

// Das eigene Foto kommt über /uploads (server ownEinblick) - nur solche Adressen landen in einem src.
export function isUploadUrl(url) {
  return typeof url === 'string' && url.startsWith('/uploads/')
}

// Änderung eines Einblicks: nur datum/text, und nur was sich wirklich geändert hat. Ein geleerter Text
// geht als null (der Server speichert dann keinen Text).
export function einblickChanges(draft, einblick) {
  const changes = {}
  if (draft.datum !== einblick.datum) changes.datum = draft.datum
  const text = draft.text.trim()
  if (text !== (einblick.text ?? '')) changes.text = text || null
  return changes
}
