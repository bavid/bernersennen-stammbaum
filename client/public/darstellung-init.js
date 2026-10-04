// Darstellung vor dem ersten Bild (Einstellungen → Darstellung, Mini-Designer): Farbwelt, Hintergrund, Schrift, Schriftart,
// Handschrift, Ecken und die eigene Akzentfarbe der letzten Sitzung auf diesem Gerät, damit beim Laden nichts in der falschen
// Farbe aufblitzt. Ein klassisches Skript im <head> (die Content-Security-Policy erlaubt nur Skripte von hier, keine
// eingebetteten). Dieselbe Regel wie src/lib/darstellung.js applyDarstellung, die danach mit /api/me übernimmt; unbekannte
// Werte setzen nichts. Die Akzentfarben hat lib/darstellung.js rememberDarstellung schon lesbar gerechnet (farben) - hier
// zählt nur, dass jede eine Farbe #rrggbb ist, sonst bleibt es bei den Farben der Farbwelt.
;(function () {
  var root = document.documentElement
  var saved = {}
  try {
    saved = JSON.parse(window.localStorage.getItem('chronik.darstellung')) || {}
  } catch (e) {
    saved = {}
  }
  if (saved.palette === 'terrakotta') saved.palette = 'familienalbum'
  var known = {
    palette: /^(familienalbum|wald|meer|lavendel|schiefer)$/,
    schrift: /^(normal|gross)$/,
    schriftart: /^(klassisch|modern|lesbar)$/,
    handschrift: /^(an|aus)$/,
    ecken: /^(weich|eckig)$/
  }
  for (var key in known) {
    if (known[key].test(saved[key])) root.setAttribute('data-' + key, saved[key])
  }
  var modus = /^(auto|hell|weiss|dunkel)$/.test(saved.modus) ? saved.modus : 'auto'
  root.setAttribute('data-modus', modus)
  if (modus === 'weiss') root.setAttribute('data-grund', 'weiss')
  var dark = modus === 'dunkel'
  if (modus === 'auto') {
    try {
      dark = window.matchMedia('(prefers-color-scheme: dark)').matches
    } catch (e) {
      dark = false
    }
  }
  root.setAttribute('data-scheme', dark ? 'dunkel' : 'hell')

  var hex = /^#[0-9a-f]{6}$/
  var farben = saved.farben
  var parts = ['farbe', 'tief', 'auf']
  var suffix = { farbe: '', tief: '-tief', auf: '-auf' }
  function valid(scheme) {
    if (!farben || !farben[scheme]) return false
    for (var i = 0; i < parts.length; i++) if (!hex.test(farben[scheme][parts[i]])) return false
    return true
  }
  if (!hex.test(saved.akzent) || !valid('hell') || !valid('dunkel')) return
  var schemes = ['hell', 'dunkel']
  for (var s = 0; s < schemes.length; s++) {
    for (var p = 0; p < parts.length; p++) {
      root.style.setProperty('--akzent-' + schemes[s] + suffix[parts[p]], farben[schemes[s]][parts[p]])
    }
  }
  root.setAttribute('data-akzent', 'eigen')
})()
