'use strict'

const db = require('../db')

// Phase R Task 1: Rollen in Familien (families.art 'rudel'), aufsteigend nach Rang. Die Rolle steht an der
// Mitgliedschaft (family_members.rolle, siehe db.js). Was welche Rolle darf:
// - gast: ansehen, kommentieren (auch auf der Pinnwand antworten);
// - mitglied: dazu eigene Tiere teilen, Einträge schreiben, Tiere der Familie pflegen, Würfe, Stammbaum,
//   Pinnwand-Zettel, Fotos hochladen;
// - stellvertretung: dazu einladen (Weitergabe-Gutscheine der Familie, routes/vouchers.js GET /mine);
// - leitung: dazu Name/Aussehen/Schlüssel/Benutzer (routes/auth.js).
const ROLES = ['gast', 'mitglied', 'stellvertretung', 'leitung']
const LEITUNG = 'leitung'
const FORBIDDEN_MESSAGE = 'Dafür fehlt dir die Berechtigung in dieser Familie.'

function isRole(value) {
  return ROLES.includes(value)
}

// -1 für alles, was keine Rolle ist (null, unbekannte Werte) - liegt damit unter jeder Mindestrolle.
function rank(rolle) {
  return ROLES.indexOf(rolle)
}

const findMembershipRole = db.prepare('SELECT rolle FROM family_members WHERE member_family_id = ? AND group_family_id = ?')

// Rolle der Identität homeId im Bereich familyId:
// - homeId === familyId: 'leitung' - der eigene Bereich (Zuhause, Tierheim, Partner) oder eine Familie,
//   die mit ihrem gemeinsamen Schlüssel angemeldet ist (alte Rudel-Logins, wie bisher);
// - sonst die Rolle der Mitgliedschaft (ein unbekannter Wert aus der DB zählt als null: fail closed);
// - sonst null (kein Mitglied).
function roleOf(homeId, familyId) {
  if (homeId === familyId) return LEITUNG
  const row = findMembershipRole.get(homeId, familyId)
  return row && isRole(row.rolle) ? row.rolle : null
}

function hasRole(homeId, familyId, min) {
  return rank(roleOf(homeId, familyId)) >= rank(min)
}

// Middleware NACH requireAuth (braucht req.homeId/req.familyId): 403, wenn die Rolle im aktiven Bereich
// unter min liegt. Außerhalb von Familien (Zuhause, Tierheim, Partner) ist homeId === familyId, dort
// ändert sich also nichts. Eine unbekannte Mindestrolle ist ein Programmierfehler (beim Laden der Route).
function requireRole(min) {
  if (!isRole(min)) throw new Error(`Unbekannte Rolle: ${min}`)
  return function checkRole(req, res, next) {
    if (!hasRole(req.homeId, req.familyId, min)) return res.status(403).json({ error: FORBIDDEN_MESSAGE })
    next()
  }
}

module.exports = { ROLES, FORBIDDEN_MESSAGE, isRole, rank, roleOf, hasRole, requireRole }
