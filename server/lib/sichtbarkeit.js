'use strict'

// „Wer sieht was“ (Einstellungen): eine Zusammenfassung je EIGENEM Tier des eigenen Zuhauses - wie viele seiner
// Erinnerungen privat bzw. geteilt sind und ob ein abgebendes Tierheim mitliest. Nur lesen; geändert wird über die
// bekannten Wege (PUT /api/dogs/:id/shares, /shelter-share, PUT /api/timeline/:id). Eigentum steckt im JOIN:
// nur Tiere mit dogs.family_id = Zuhause und nur Erinnerungen, die dieses Zuhause selbst geschrieben hat.

const db = require('../db')

// Das abgebende Tierheim ist das des NEUESTEN Umzugs (wie routes/dogs.js shelterShareFor) - Name: der
// admin-gepflegte Partnername, sonst der Familienname. liest_mit: es gibt einen dog_shares-Eintrag dafür.
const uebersichtStmt = db.prepare(`
  WITH letzter_umzug AS (
    SELECT tr.dog_id, tr.from_family_id
    FROM dog_transfers tr
    WHERE tr.id = (SELECT MAX(t2.id) FROM dog_transfers t2 WHERE t2.dog_id = tr.dog_id)
  )
  SELECT d.id,
         (SELECT COUNT(*) FROM timeline_entries t WHERE t.dog_id = d.id AND t.family_id = d.family_id AND t.privat = 1) AS privat,
         (SELECT COUNT(*) FROM timeline_entries t WHERE t.dog_id = d.id AND t.family_id = d.family_id AND t.privat = 0) AS geteilt,
         sf.id AS tierheim_id,
         COALESCE(sp.name, sf.name) AS tierheim_name,
         EXISTS (SELECT 1 FROM dog_shares s WHERE s.dog_id = d.id AND s.family_id = sf.id) AS liest_mit
  FROM dogs d
  LEFT JOIN letzter_umzug lu ON lu.dog_id = d.id
  LEFT JOIN families sf ON sf.id = lu.from_family_id AND sf.art = 'tierheim'
  LEFT JOIN partners sp ON sp.id = sf.partner_id
  WHERE d.family_id = ?
  ORDER BY d.id
`)

function toTier(row) {
  return {
    id: row.id,
    privat: row.privat,
    geteilt: row.geteilt,
    tierheim: row.tierheim_id ? { name: row.tierheim_name, liestMit: Boolean(row.liest_mit) } : null
  }
}

function sichtbarkeitUebersicht(homeId) {
  return { tiere: uebersichtStmt.all(homeId).map(toTier) }
}

module.exports = { sichtbarkeitUebersicht }
