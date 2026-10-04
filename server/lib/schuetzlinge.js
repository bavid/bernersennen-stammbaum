'use strict'

// „So geht es euren Schützlingen“ (GET /api/schuetzlinge, routes/schuetzlinge.js): die neuesten Erinnerungen der Tiere, die
// ein Tierheim vermittelt hat und bei denen es mitlesen darf. Keine neuen Regeln - genau das, was das Tierheim über diese
// Tiere ohnehin liest (Reiter „Vermittelt“ und die Tierseite, lib/context.js VISIBLE_DOGS_SQL/VISIBLE_ENTRY_SQL):
// - Tiere: ins Tierheim geteilt (dog_shares - die Einwilligung „darf mitlesen“ des neuen Zuhauses, beim Einlösen der
//   Übergabe oder später über routes/dogs.js PUT /:id/shelter-share), gehören einem Zuhause (nicht dem Tierheim selbst),
//   sind laut ihrem NEUESTEN Umzug (dog_transfers, wie routes/dogs.js findShelterForDog) aus genau diesem Tierheim
//   weggezogen, und das Zuhause liegt auf derselben Seite der Demo-Grenze. Nimmt das Zuhause die Einwilligung zurück,
//   fehlt die Zeile in dog_shares - und das Tier sofort auch hier. story_consent (Happy End öffentlich auf dem Portal,
//   routes/publicAnimals.js) braucht es dafür nicht: das hier sieht nur das Tierheim selbst.
// - Erinnerungen: wie das Tierheim sie liest (VISIBLE_ENTRY_SQL: geteilte nur nicht-private) - private nie, auch nicht die
//   eigenen frühen Einträge des Tierheims (herkunft_family_id, lib/transfers.js): hier steht, wie es dem Tier SEITDEM geht.
// - Grüße: gezählt mit VISIBLE_COMMENT_SQL des Tierheims (die eigenen und die des Zuhauses) - wie auf der Tierseite; erst
//   für die höchstens MAX_ITEMS gezeigten Erinnerungen.
// - Ein vom Admin gesperrtes Tierheim (partners.gesperrt) bekommt hier nichts.
// Reihenfolge: zuletzt geschrieben zuerst (wie latest_entry_* in GET /api/dogs), höchstens MAX_ITEMS.
// Nach außen nur, was die Karte braucht: Erinnerung (Id, Titel, Anriss, Tag, erstes Foto, Zahl der Grüße) und Tier (Id für
// den Link, Name, Art, Porträt) - keine Autorin, kein Zuhause und keine Ids außer Erinnerung und Tier. (Wo das Tier jetzt
// lebt, kennt das Tierheim ohnehin: es hat die Übergabe gemacht, „Vermittelt“ nennt das Zuhause - shared_from in GET /api/dogs.)

const db = require('../db')
const { VISIBLE_ENTRY_SQL, VISIBLE_COMMENT_SQL } = require('./context')
const { isUploadUrl } = require('./validate')
const { excerpt } = require('./startFeed')

const MAX_ITEMS = 5
const MAX_TEXT = 160

const NEWS_SQL = `
  SELECT n.*,
    (SELECT COUNT(*) FROM entry_comments c JOIN timeline_entries t ON t.id = c.entry_id
     WHERE c.entry_id = n.id AND ${VISIBLE_COMMENT_SQL}) AS comment_count
  FROM (
    SELECT t.id, t.titel, t.text, t.datum, t.foto_urls, t.created_at,
      d.id AS dog_id, d.name AS dog_name, d.name_unbekannt AS dog_name_unbekannt, d.tierart AS dog_tierart,
      d.foto_url AS dog_foto_url
    FROM timeline_entries t
    JOIN dogs d ON d.id = t.dog_id AND d.family_id != @familyId
    JOIN dog_shares ds ON ds.dog_id = d.id AND ds.family_id = @familyId
    JOIN families home ON home.id = d.family_id AND home.art = 'zuhause'
    JOIN families shelter ON shelter.id = @familyId AND shelter.art = 'tierheim' AND shelter.is_demo = home.is_demo
    LEFT JOIN partners p ON p.id = shelter.partner_id
    WHERE COALESCE(p.gesperrt, 0) = 0
      AND (SELECT tr.from_family_id FROM dog_transfers tr WHERE tr.dog_id = d.id ORDER BY tr.id DESC LIMIT 1) = @familyId
      AND ${VISIBLE_ENTRY_SQL} AND t.privat = 0
      AND COALESCE(t.herkunft_family_id, 0) != @familyId
    ORDER BY t.created_at DESC, t.id DESC
    LIMIT ${MAX_ITEMS}
  ) n
  ORDER BY n.created_at DESC, n.id DESC`

const newsStmt = db.prepare(NEWS_SQL)

function firstPhoto(raw) {
  try {
    const list = JSON.parse(raw || '[]')
    return Array.isArray(list) ? list.find(isUploadUrl) || null : null
  } catch {
    return null
  }
}

function toItem(row) {
  return {
    id: row.id,
    dog: {
      id: row.dog_id,
      name: row.dog_name,
      name_unbekannt: Boolean(row.dog_name_unbekannt),
      tierart: row.dog_tierart || 'hund',
      foto_url: isUploadUrl(row.dog_foto_url) ? row.dog_foto_url : null
    },
    titel: row.titel,
    text: excerpt(row.text, MAX_TEXT),
    datum: row.datum,
    foto_url: firstPhoto(row.foto_urls),
    comment_count: row.comment_count
  }
}

// shelterId: der Tierheim-Bereich (Identität = aktiver Bereich, routes/schuetzlinge.js prüft das) -> Karten, neueste zuerst.
function wardNews(shelterId) {
  return newsStmt.all({ familyId: shelterId }).map(toItem)
}

module.exports = { wardNews, MAX_ITEMS }
