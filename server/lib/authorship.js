'use strict'

const db = require('../db')
const { ART } = require('./areaArt')
const { rank, roleOf, STELLVERTRETUNG } = require('./roles')

// Phase R Task 2: Autorenschaft von Kommentaren (entry_comments) und Pinnwand-Antworten (note_replies).
// author_family_id (db.js) ist die Identität, die den Beitrag geschrieben hat (req.homeId); family_id bleibt
// der Bereich, in dem er steht. Daraus entstehen für den Client zwei Flags und die Moderationsregel:
// - vonMir: der Beitrag stammt von der eigenen Identität (dann darf man ihn in einer Familie löschen);
// - ehemalig: in einer Familie geschrieben von einem Haushalt, der heute nicht mehr Mitglied ist (der
//   Client zeigt "ehemaliges Mitglied" neben dem frei eingetippten Namen). Außerhalb von Familien (Zuhause,
//   Tierheim, Partner) immer false - dort gibt es keine Mitglieder, das Flag wäre irreführend;
// - löschen in einer Familie: die Autorin selbst oder ab Stellvertretung; Altbestand ohne author_family_id
//   nur ab Stellvertretung. Außerhalb von Familien gilt weiterhin allein die bisherige Bereichsregel.
// author_family_id selbst geht nie nach außen (wie herkunft_family_id, routes/timeline.js) - es ist die Id
// eines fremden Haushalts.
const findFamilyArt = db.prepare('SELECT art FROM families WHERE id = ?')
const listMemberIds = db.prepare('SELECT member_family_id FROM family_members WHERE group_family_id = ?').pluck()

// Einmal je Anfrage: aktiver Bereich, eigene Identität, ist es eine Familie, wer ist heute Mitglied.
function authorContext(req) {
  const inRudel = findFamilyArt.get(req.familyId)?.art === ART.rudel
  return {
    homeId: req.homeId,
    familyId: req.familyId,
    inRudel,
    role: roleOf(req.homeId, req.familyId),
    members: inRudel ? new Set(listMemberIds.all(req.familyId)) : null
  }
}

function isFormerMember(row, ctx) {
  if (!ctx.inRudel || row.author_family_id === null || row.author_family_id === undefined) return false
  if (row.author_family_id === ctx.familyId) return false // die Familie selbst (gemeinsamer Schlüssel)
  return !ctx.members.has(row.author_family_id)
}

// Zeile aus entry_comments/note_replies -> Antwortobjekt ohne author_family_id, mit vonMir/ehemalig.
function withAuthorFlags(row, ctx) {
  const { author_family_id, ...rest } = row
  return { ...rest, vonMir: author_family_id === ctx.homeId, ehemalig: isFormerMember(row, ctx) }
}

// Darf die Identität diesen (im Bereich sichtbaren, vom Aufrufer schon gefundenen) Beitrag löschen?
function mayDeleteInArea(row, ctx) {
  if (!ctx.inRudel) return true
  if (row.author_family_id !== null && row.author_family_id === ctx.homeId) return true
  return rank(ctx.role) >= rank(STELLVERTRETUNG)
}

module.exports = { authorContext, withAuthorFlags, mayDeleteInArea }
