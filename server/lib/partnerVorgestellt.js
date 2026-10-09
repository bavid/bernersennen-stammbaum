'use strict'

// „Auf der Startseite vorstellen“: der Admin wählt bis zu MAX_VORGESTELLT Partner, die das Laufband der Startseite
// (lib/community.js, später auch ein Teaser) nennt. Eine Spalte partners.vorgestellt (0/1), die dieses Modul selbst anlegt
// (db.js ist an seiner Dateigrenze). Markieren darf der Admin jeden Partner - öffentlich erscheinen nur echte (is_demo = 0)
// und öffentlich sichtbare (status aktiv, nicht gesperrt; lib/partners.js publicPartnerSql). Schalter in
// routes/adminCommunity.js, protokolliert.

const db = require('../db')

const COLUMN = 'vorgestellt'
const MAX_VORGESTELLT = 3
const LIMIT_MESSAGE = `Höchstens drei Partner lassen sich auf der Startseite vorstellen – bitte erst einen herausnehmen.`

if (!db.prepare('PRAGMA table_info(partners)').all().some((column) => column.name === COLUMN)) {
  db.exec(`ALTER TABLE partners ADD COLUMN ${COLUMN} INTEGER NOT NULL DEFAULT 0`)
}

const readStmt = db.prepare(`SELECT ${COLUMN} AS an FROM partners WHERE id = ?`)
const countStmt = db.prepare(`SELECT COUNT(*) AS n FROM partners WHERE ${COLUMN} = 1`)
const setStmt = db.prepare(`UPDATE partners SET ${COLUMN} = ? WHERE id = ?`)

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// { an: true|false } - alles andere 400.
function parseAn(body) {
  const value = body && typeof body === 'object' ? body.an : undefined
  if (typeof value !== 'boolean') throw httpError(400, '„an“ muss true oder false sein')
  return value
}

function countVorgestellt() {
  return countStmt.get().n
}

// { vorgestellt, changed }; ein vierter Partner -> 409. Zählen und Setzen in einer Transaktion.
const setVorgestellt = db.transaction((partnerId, an) => {
  const before = Boolean(readStmt.get(partnerId)?.an)
  if (before === an) return { vorgestellt: an, changed: false }
  if (an && countVorgestellt() >= MAX_VORGESTELLT) throw httpError(409, LIMIT_MESSAGE)
  setStmt.run(an ? 1 : 0, partnerId)
  return { vorgestellt: an, changed: true }
})

module.exports = { COLUMN, MAX_VORGESTELLT, parseAn, countVorgestellt, setVorgestellt }
