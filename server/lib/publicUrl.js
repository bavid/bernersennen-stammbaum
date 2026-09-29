'use strict'

const config = require('../config')

// Absolute Adresse für Links, die die App nach außen gibt (sitemap.xml, Bot-User-Agent, robots.txt).
// Mit gesetzter PUBLIC_URL (config.js readPublicUrl, ohne abschließenden Schrägstrich) wird der Pfad
// angehängt; ohne bleibt der relative Pfad - das bisherige Verhalten für Instanzen ohne Domain.
// Bewusst nicht aus req.protocol/Host gebaut: hinter dem Server-Proxy wären die Werte irreführend, und ein
// Angreifer könnte über den Host-Header fremde Adressen in Links schleusen.
function absoluteUrl(urlPath = '/') {
  const normalizedPath = urlPath.startsWith('/') ? urlPath : `/${urlPath}`
  return config.publicUrl ? `${config.publicUrl}${normalizedPath}` : normalizedPath
}

module.exports = { absoluteUrl }
