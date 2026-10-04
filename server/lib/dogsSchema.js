'use strict'

const { rebuildTableIfOutdated } = require('./tableRebuild')

// Geschlecht eines Tiers: 'huendin' (weiblich), 'ruede' (männlich) oder - seit "Neues Tier" nur Name und Tierart braucht -
// 'unbekannt' ("weiß ich nicht"). Als Mutter bzw. Vater taugt nur ein bekanntes Geschlecht (routes/dogs.js PARENTS,
// routes/breeding.js). Muss zum CHECK unten passen.
const SEX = Object.freeze({ female: 'huendin', male: 'ruede', unknown: 'unbekannt' })
const SEXES = Object.freeze([SEX.male, SEX.female, SEX.unknown])

// Die EINE Spalten-Definition der Tabelle dogs - für neue Datenbanken (db.js) UND den einmaligen Umbau alter Datenbanken
// (rebuildDogsIfOutdated): deren CHECK auf geschlecht kannte nur 'ruede' und 'huendin'. Enthält alle Spalten, die alte
// Datenbanken per ALTER bekommen haben (db.js addColumnIfMissing) - sonst bricht der Umbau ab, statt Daten zu verlieren.
const DOGS_COLUMNS_SQL = `
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL REFERENCES families(id),
    name TEXT NOT NULL,
    geschlecht TEXT CHECK(geschlecht IN ('ruede','huendin','unbekannt')) NOT NULL,
    geburtsdatum TEXT,
    farbe_markings TEXT,
    mother_dog_id INTEGER REFERENCES dogs(id),
    father_dog_id INTEGER REFERENCES dogs(id),
    mother_freitext TEXT,
    father_freitext TEXT,
    foto_url TEXT,
    beschreibung TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    rasse TEXT,
    name_unbekannt INTEGER NOT NULL DEFAULT 0,
    tierart TEXT NOT NULL DEFAULT 'hund',
    bei_uns_seit TEXT,
    bei_uns_bis TEXT,
    abschied_grund TEXT,
    herkunft_art TEXT,
    herkunft_text TEXT,
    vermittlung_status TEXT,
    public_slug TEXT
`

const DOGS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_dogs_family ON dogs(family_id);
  CREATE INDEX IF NOT EXISTS idx_dogs_mother ON dogs(mother_dog_id);
  CREATE INDEX IF NOT EXISTS idx_dogs_father ON dogs(father_dog_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_dogs_public_slug ON dogs(public_slug) WHERE public_slug IS NOT NULL;
`

// Einmalig beim Start (db.js, nachdem alle dogs-Spalten da sind): alte Datenbanken bekommen den CHECK mit 'unbekannt'.
// Zeilen, Ids, der AUTOINCREMENT-Zähler und alle Verweise (Chronik, Würfe, Mitbewohner, Freigaben, Eltern) bleiben -
// lib/tableRebuild.js; ein zweiter Start findet das neue Schema und tut nichts.
function rebuildDogsIfOutdated(db) {
  return rebuildTableIfOutdated(db, 'dogs', {
    columnsSql: DOGS_COLUMNS_SQL,
    indexesSql: DOGS_INDEXES_SQL,
    isCurrent: (sql) => sql.includes("'unbekannt'")
  })
}

module.exports = { SEX, SEXES, DOGS_COLUMNS_SQL, DOGS_INDEXES_SQL, rebuildDogsIfOutdated }
