'use strict'

// Phase M „Mein Revier“ (docs/superpowers/plans/2026-10-11-phase-m-revier.md) - ein Eingang für Routen und Tests:
// Kern und Regeln (lib/revierKern.js), Einstellungen des Inhabers (lib/revierEinstellungen.js), Radar/Profil/Feed/Fotos
// (lib/revierLesen.js), Folgen/Ausblenden/Follower und Admin-Sperre (lib/revierFolgen.js).

module.exports = {
  ...require('./revierKern'),
  ...require('./revierEinstellungen'),
  ...require('./revierLesen'),
  ...require('./revierFolgen')
}
