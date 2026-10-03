// Darstellung vor dem ersten Bild (Einstellungen → Darstellung): Farbpalette, Hell/Dunkel und Schrift der letzten
// Sitzung auf diesem Gerät, damit beim Laden nichts in der falschen Farbe aufblitzt. Ein klassisches Skript im <head>
// (die Content-Security-Policy erlaubt nur Skripte von hier, keine eingebetteten). Dieselbe Regel wie
// src/lib/darstellung.js applyDarstellung, die danach mit /api/me übernimmt; unbekannte Werte setzen nichts.
;(function () {
  var root = document.documentElement
  var saved = {}
  try {
    saved = JSON.parse(window.localStorage.getItem('chronik.darstellung')) || {}
  } catch (e) {
    saved = {}
  }
  var known = { palette: /^(terrakotta|wald|meer|lavendel|schiefer)$/, schrift: /^(normal|gross)$/, modus: /^(auto|hell|dunkel)$/ }
  var modus = known.modus.test(saved.modus) ? saved.modus : 'auto'
  if (known.palette.test(saved.palette)) root.setAttribute('data-palette', saved.palette)
  if (known.schrift.test(saved.schrift)) root.setAttribute('data-schrift', saved.schrift)
  root.setAttribute('data-modus', modus)
  var dark = modus === 'dunkel'
  if (modus === 'auto') {
    try {
      dark = window.matchMedia('(prefers-color-scheme: dark)').matches
    } catch (e) {
      dark = false
    }
  }
  root.setAttribute('data-scheme', dark ? 'dunkel' : 'hell')
})()
