'use strict'

// Demo-Profil (lib/profil.js): „Zuhause am Deich“ und die Demo-Familie bekommen ein Bild aus seed/images, die
// Demo-Haushalte einen Namen der Person („Euer Name“). Läuft in replaceDemoPack innerhalb der Transaktion; die Bilder sind
// eigene Kopien (copyImage.copyOwn) - so löscht deleteFamily beim nächsten Auffrischen nie ein Tierfoto mit, und ein
// Rollback räumt sie über copiedUrls weg. Nur frisch angelegte Demo-Bereiche (is_demo = 1) werden beschrieben.
require('./profil') // legt bereich_profil an (CREATE TABLE IF NOT EXISTS beim ersten require)

const DEMO_PERSONEN = Object.freeze({
  'Zuhause am Deich': 'Anke',
  'Zuhause Möwenweg (Demo)': 'Jonas',
  'Zuhause Lindenhof (Demo)': 'Greta',
  'Zuhause Heidekamp (Demo)': 'Henrik'
})
const HOME_BILD = 'see.jpg'
const FAMILY_BILD = 'schnee.jpg'

function upsertProfil(db, familyId, { anzeigename = null, bildFile = null }) {
  db.prepare(
    `INSERT INTO bereich_profil (family_id, anzeigename, bild_file)
     SELECT id, ?, ? FROM families WHERE id = ? AND is_demo = 1
     ON CONFLICT (family_id) DO UPDATE SET anzeigename = excluded.anzeigename, bild_file = excluded.bild_file`
  ).run(anzeigename, bildFile, familyId)
}

const fileOf = (url) => url.split('/').pop()

// households: [{ familyId, name }] - die Demo-Haushalte samt „Zuhause am Deich“.
function createDemoProfil(db, { copyImage, familyId, homeId, households }) {
  upsertProfil(db, familyId, { bildFile: fileOf(copyImage.copyOwn(FAMILY_BILD)) })
  upsertProfil(db, homeId, { anzeigename: DEMO_PERSONEN['Zuhause am Deich'], bildFile: fileOf(copyImage.copyOwn(HOME_BILD)) })
  for (const household of households) {
    if (DEMO_PERSONEN[household.name]) upsertProfil(db, household.familyId, { anzeigename: DEMO_PERSONEN[household.name] })
  }
}

module.exports = { DEMO_PERSONEN, createDemoProfil }
