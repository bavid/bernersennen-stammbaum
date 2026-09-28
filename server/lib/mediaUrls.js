'use strict'

const path = require('node:path')

// Öffentliche Adresse eines Fotos: /uploads/<datei> (nur mit Sitzung, lib/uploadAccess.js) wird zu
// /public-media/<datei> (ohne Login, aber nur freigegebene Dateien - lib/publicMedia.js). Ohne db-Zugriff,
// damit lib/partners.js/lib/einblicke.js es ohne Kreis-Abhängigkeit nutzen können.
function toPublicMediaUrl(url) {
  return url ? `/public-media/${path.basename(url)}` : null
}

module.exports = { toPublicMediaUrl }
