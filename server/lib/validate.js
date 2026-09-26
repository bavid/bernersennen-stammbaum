const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_PHOTOS = 20

function isIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

function cleanText(value, maxLength) {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text ? text.slice(0, maxLength) : null
}

// null = nicht gesetzt, NaN = ungültig, sonst positive Ganzzahl
function cleanId(value) {
  if (value === null || value === undefined || value === '') return null
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : NaN
}

function isUploadUrl(value) {
  return typeof value === 'string' && /^\/uploads\/[\w-]+\.(jpg|png|webp|gif)$/.test(value)
}

function cleanPhotoList(value) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > MAX_PHOTOS || !value.every(isUploadUrl)) return null
  return value
}

module.exports = { isIsoDate, cleanText, cleanId, isUploadUrl, cleanPhotoList }
