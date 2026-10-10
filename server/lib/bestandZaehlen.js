'use strict'

// Bestand einer Datenbank zählen (nur Zahlen, nie Namen) - für den Umzug eines Bestandsrudels (lib/rudelMigration.js)
// und den Test gegen das alte Schema (test/migrationAltschema.test.js). Ohne require('../db'): die Datenbank kommt als
// Parameter, so lässt sich auch eine Datenbank der alten App zählen, ohne die neuen Migrationen auszulösen.
// Fehlende Tabellen zählen 0.

function tableExists(database, table) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table))
}

function count(database, table, sql = `SELECT COUNT(*) AS n FROM ${table}`) {
  return tableExists(database, table) ? database.prepare(sql).get().n : 0
}

function countPhotos(database) {
  const listen = (table) => count(database, table, `SELECT COALESCE(SUM(json_array_length(foto_urls)), 0) AS n FROM ${table}`)
  const tierFotos = count(database, 'dogs', "SELECT COUNT(*) AS n FROM dogs WHERE foto_url IS NOT NULL AND foto_url != ''")
  return listen('timeline_entries') + listen('breeding_events') + tierFotos
}

function zaehleBestand(database) {
  return {
    families: count(database, 'families'),
    dogs: count(database, 'dogs'),
    timelineEntries: count(database, 'timeline_entries'),
    photos: countPhotos(database),
    notes: count(database, 'notes'),
    noteReplies: count(database, 'note_replies'),
    comments: count(database, 'entry_comments'),
    litters: count(database, 'breeding_events'),
    housemates: count(database, 'dog_links'),
    adminMessages: count(database, 'admin_messages'),
    users: count(database, 'users')
  }
}

module.exports = { zaehleBestand }
