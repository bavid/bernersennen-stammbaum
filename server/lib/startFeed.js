'use strict'

// Start (GET /api/start, routes/start.js): ein Feed über alle Bereiche, die ein Haushalt im eigenen Zuhause sieht
// (lib/searchAreas.js homeAreasOf: das eigene Zuhause, jede Familie mit Mitgliedschaft, jedes besuchte Zuhause) - je
// Bereich genau mit dessen eigenen Regeln, keine neuen:
// - Erinnerungen: die Regeln des Bereichs (lib/searchAreas.js visibleEntrySql: entrySql und nur Tiere, die dort sichtbar
//   sind); private nur aus dem eigenen Zuhause - in Familien und bei Besuchen nie (auch nicht die einer Familie selbst);
// - Grüße (Kommentare): gezählt mit den Regeln DIESES Bereichs (commentSql) - ein Gruß aus einer anderen Familie, in die
//   dasselbe Tier geteilt ist, zählt nicht und rückt die Erinnerung auch nicht nach oben;
// - Zettel (mit Zahl der Antworten) und Termine nur aus dem Zuhause und den Familien, nie von Besuchen - nur auf der ersten
//   Seite und höchstens MAX_NOTES (der Client zeigt sie als kurze Liste „Neu an der Pinnwand“, nicht im Album).
// Ist eine Erinnerung in mehreren Bereichen sichtbar, erscheint sie genau einmal - im ersten Bereich der Reihenfolge
// Zuhause > Familien > Besuche: jede Abfrage schließt aus, was ein früherer Bereich schon zeigt (dieselben Regeln, eigene
// Parameter @p0, @p1, …). So bleibt das auch beim Weiterblättern so.
// Reihenfolge: letzte Aktivität (activity_at = späteres von Festhalten und letztem sichtbaren Gruß bzw. letzter Antwort),
// bei Gleichstand die höhere Id. Je Bereich höchstens limit + 1 Erinnerungen, danach gemischt; die Seite hat genau bis zu
// limit Erinnerungen. Weiterblättern mit vor (parseCursor): ISO-Zeit, optional mit Gleichstand-Angabe „~e12“ - next trägt
// sie immer. Nach außen nur, was die Karte braucht: keine Ids von Bereichen der Autorinnen, Grüße oder Antworten; Text als
// Anriss, nur Upload-Adressen als Fotos. dog.zuhause: wo das Tier wohnt (Name, nie das eigene Zuhause) - der Client nennt
// das auf der Karte („aus Zuhause Möwenweg“), nicht den Bereich, über den die Erinnerung sichtbar ist (area, für den Link).

const db = require('../db')
const { isUploadUrl } = require('./validate')
const { relativeDemoDate } = require('./demoDates')
const { areaRef, visibleEntrySql, AREA_ART } = require('./searchAreas')

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 20
const MAX_TEXT = 300
const MAX_PHOTOS = 4
const MAX_NOTES = 5
const MAX_TERMINE = 5
const TERMIN_TEXT = 140

// Ohne Gleichstand-Angabe: alles strikt vor dieser Sekunde (Ids beginnen bei 1) bzw. mit Bruchteilen die Sekunde selbst noch.
const BELOW_ALL = 0
const ABOVE_ALL = Number.MAX_SAFE_INTEGER
const NO_CURSOR = { at: '9999-12-31 23:59:59', id: ABOVE_ALL }

const CURSOR_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?Z?(?:~e([1-9]\d{0,14}))?$/
const DB_TIME_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/

// '2026-09-20T10:00:00Z~e12' -> { at: '2026-09-20 10:00:00', id: 12 }; alles andere -> null.
function parseCursor(value) {
  const match = typeof value === 'string' ? CURSOR_RE.exec(value) : null
  if (!match) return null
  const [, day, time, fraction, id] = match
  const at = `${day} ${time}`
  if (id) return { at, id: Number(id) }
  return { at, id: fraction && /[1-9]/.test(fraction) ? ABOVE_ALL : BELOW_ALL }
}

function cursorOf(entry) {
  const match = DB_TIME_RE.exec(entry.activity_at || '')
  return match ? `${match[1]}T${match[2]}Z~e${entry.id}` : null
}

const ACTIVITY_SQL = 'MAX(x.created_at, COALESCE(x.last_comment_at, x.created_at)) AS activity_at'

// Wo das Tier wohnt (sein Zuhause bzw. die Familie, der es selbst gehört) - nur der Name und nur, wenn es nicht das eigene
// Zuhause ist (@homeId). Sichtbar ist das Tier ohnehin nur, wenn es im Bereich gezeigt wird (visibleEntrySql: dogsSql) - in
// einer Familie gehört es einem Mitglied (dessen Name steht auch in der Familienbande), beim Besuch dem Gastgeber.
const DOG_HOME_SQL = '(SELECT f.name FROM families f WHERE f.id = d.family_id AND d.family_id != @homeId)'

function entrySql(areas, index) {
  const area = areas[index]
  const earlier = areas.slice(0, index).map((other, j) => ` AND NOT ${visibleEntrySql(other, `p${j}`)}`).join('')
  const comments = `FROM entry_comments c WHERE c.entry_id = t.id AND ${area.commentSql}`
  return `SELECT * FROM (SELECT x.*, ${ACTIVITY_SQL} FROM (
      SELECT t.id, t.dog_id, t.titel, t.text, t.foto_urls, t.datum, t.autor_name, t.created_at, t.privat,
        d.name AS dog_name, d.name_unbekannt AS dog_name_unbekannt, d.rasse AS dog_rasse, d.foto_url AS dog_foto_url,
        ${DOG_HOME_SQL} AS dog_zuhause,
        (SELECT COUNT(*) ${comments}) AS comment_count, (SELECT MAX(c.created_at) ${comments}) AS last_comment_at
      FROM timeline_entries t JOIN dogs d ON d.id = t.dog_id
      WHERE ${visibleEntrySql(area)}${earlier}
    ) x) y
    WHERE (y.activity_at, y.id) < (@vorAt, @vorId)
    ORDER BY y.activity_at DESC, y.id DESC LIMIT @limit`
}

// Antworten liegen immer im Bereich des Zettels (routes/notes.js) - trotzdem nur die von dort gezählt.
const replies = 'FROM note_replies r WHERE r.note_id = n.id AND r.family_id = n.family_id'
const NOTE_SQL = `SELECT x.*, ${ACTIVITY_SQL} FROM (
    SELECT n.id, n.text, n.termin_datum, n.termin_zeit, n.autor_name, n.created_at,
      (SELECT COUNT(*) ${replies}) AS comment_count, (SELECT MAX(r.created_at) ${replies}) AS last_comment_at
    FROM notes n WHERE n.family_id = @familyId
  ) x
  ORDER BY activity_at DESC, x.id DESC LIMIT ${MAX_NOTES}`

const TERMIN_SQL = `SELECT n.id, n.text, n.termin_datum, n.termin_zeit FROM notes n
  WHERE n.family_id = @familyId AND n.termin_datum >= @heute
  ORDER BY n.termin_datum, COALESCE(n.termin_zeit, ''), n.id LIMIT ${MAX_TERMINE}`
const COUNT_NOTES_SQL = 'SELECT COUNT(*) AS anzahl FROM notes WHERE family_id = @familyId'

// Je Folge von Bereichsarten (die Reihenfolge ist fest: Zuhause, Familien, Besuche - höchstens MAX_AREAS) eine vorbereitete
// Abfrage; so bleiben es wenige hundert Formen.
const statements = new Map()
function prepared(key, buildSql) {
  if (!statements.has(key)) statements.set(key, db.prepare(buildSql()))
  return statements.get(key)
}

// Anriss: höchstens max Zeichen (Unicode-Zeichen, kein halbes Emoji), an einer Wortgrenze, mit „…“. Leer bleibt null.
function excerpt(text, max = MAX_TEXT) {
  const chars = Array.from(String(text ?? '').trim())
  if (chars.length === 0) return null
  if (chars.length <= max) return chars.join('')
  const cut = chars.slice(0, max - 1).join('')
  const space = cut.lastIndexOf(' ')
  return `${(space > cut.length * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

function photoList(raw) {
  try {
    const list = JSON.parse(raw || '[]')
    return Array.isArray(list) ? list.filter(isUploadUrl) : []
  } catch {
    return []
  }
}

function toEntryItem(row, area) {
  const photos = photoList(row.foto_urls)
  return {
    type: 'eintrag',
    id: row.id,
    area: areaRef(area),
    dog: {
      id: row.dog_id,
      name: row.dog_name,
      name_unbekannt: Boolean(row.dog_name_unbekannt),
      rasse: row.dog_rasse ?? null,
      foto_url: isUploadUrl(row.dog_foto_url) ? row.dog_foto_url : null,
      zuhause: row.dog_zuhause ?? null
    },
    titel: row.titel,
    text: excerpt(row.text),
    foto_urls: photos.slice(0, MAX_PHOTOS),
    foto_anzahl: photos.length,
    datum: row.datum,
    autor_name: row.autor_name,
    created_at: row.created_at,
    activity_at: row.activity_at,
    comment_count: row.comment_count,
    privat: Boolean(row.privat)
  }
}

function toNoteItem(row, area) {
  return {
    type: 'zettel',
    id: row.id,
    area: areaRef(area),
    titel: null,
    text: excerpt(row.text),
    foto_urls: [],
    foto_anzahl: 0,
    datum: null,
    termin_datum: row.termin_datum ?? null,
    termin_zeit: row.termin_zeit ?? null,
    autor_name: row.autor_name,
    created_at: row.created_at,
    activity_at: row.activity_at,
    comment_count: row.comment_count,
    privat: false
  }
}

const artsUpTo = (areas, index) => areas.slice(0, index + 1).map((area) => area.art).join(',')

function areaEntries(areas, index, page) {
  const area = areas[index]
  const earlier = Object.fromEntries(areas.slice(0, index).map((other, j) => [`p${j}`, other.id]))
  return prepared(`eintrag:${artsUpTo(areas, index)}`, () => entrySql(areas, index))
    .all({ ...page, ...earlier, familyId: area.id })
    .map((row) => toEntryItem(row, area))
}

// Neueste Aktivität zuerst, bei Gleichstand Erinnerungen vor Zetteln, dann die höhere Id.
function newestFirst(a, b) {
  if (a.activity_at !== b.activity_at) return a.activity_at < b.activity_at ? 1 : -1
  if (a.type !== b.type) return a.type === 'eintrag' ? -1 : 1
  return b.id - a.id
}

function notesOf(areas) {
  return areas
    .filter((area) => area.notes)
    .flatMap((area) => prepared('zettel', () => NOTE_SQL).all({ familyId: area.id }).map((row) => toNoteItem(row, area)))
    .sort(newestFirst)
    .slice(0, MAX_NOTES)
}

function termineOf(areas) {
  const heute = relativeDemoDate() // heute in Europe/Berlin, wie die Uhr der Familien
  return areas
    .filter((area) => area.notes)
    .flatMap((area) =>
      prepared('termine', () => TERMIN_SQL)
        .all({ familyId: area.id, heute })
        .map((row) => ({ ...row, text: excerpt(row.text, TERMIN_TEXT), area: areaRef(area) }))
    )
    .sort((a, b) =>
      a.termin_datum !== b.termin_datum
        ? (a.termin_datum < b.termin_datum ? -1 : 1)
        : (a.termin_zeit || '').localeCompare(b.termin_zeit || '') || a.id - b.id
    )
    .slice(0, MAX_TERMINE)
}

// { areas (lib/searchAreas.js homeAreasOf, areas[0] = das eigene Zuhause), homeId, limit, cursor (parseCursor) }
// -> { items (Erinnerungen dieser Seite, auf der ersten dazu die neuesten Zettel), termine, notizen (Zettel an der eigenen
// Pinnwand), next (Cursor der nächsten Seite oder null) }. Zettel, Termine und notizen nur auf der ersten Seite.
function startFeed({ areas, homeId, limit = DEFAULT_LIMIT, cursor = null }) {
  const vor = cursor || NO_CURSOR
  const page = { homeId, vorAt: vor.at, vorId: vor.id, limit: limit + 1 }
  const all = areas.flatMap((_, index) => areaEntries(areas, index, page)).sort(newestFirst)
  const entries = all.slice(0, limit)
  const next = all.length > limit ? cursorOf(entries[entries.length - 1]) : null
  if (cursor) return { items: entries, termine: [], notizen: 0, next }
  const home = areas.find((area) => area.art === AREA_ART.home)
  return {
    items: [...entries, ...notesOf(areas)].sort(newestFirst),
    termine: termineOf(areas),
    notizen: home?.notes ? prepared('notizen', () => COUNT_NOTES_SQL).get({ familyId: home.id }).anzahl : 0,
    next
  }
}

module.exports = { startFeed, parseCursor, excerpt, DEFAULT_LIMIT, MAX_LIMIT, MAX_NOTES }
