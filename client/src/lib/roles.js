// Rollen in Familien/Rudeln (Phase R, server/lib/roles.js): aufsteigend nach Rang. Was welche Rolle darf,
// entscheidet der Server - der Client blendet nur aus, was die Rolle ohnehin nicht dürfte:
// - gast: ansehen, kommentieren, eigene Kommentare löschen;
// - mitglied: dazu eigene Tiere teilen, Einträge schreiben, Tiere der Familie pflegen, Würfe, Pinnwand;
// - stellvertretung: dazu einladen, Kommentare anderer löschen, Tiere der Familie löschen, fremde
//   Tiere aus der Familie nehmen;
// - leitung: dazu Rollen ändern, Mitglieder entfernen, Name/Aussehen/Schlüssel, Leitung übergeben,
//   Familie auflösen, Tiere der Familie in die eigene Chronik übernehmen.
export const ROLES = ['gast', 'mitglied', 'stellvertretung', 'leitung']

export function isRole(value) {
  return ROLES.includes(value)
}

// -1 für alles, was keine Rolle ist (null, undefined, Unbekanntes) - liegt unter jeder Mindestrolle.
export function rank(rolle) {
  return ROLES.indexOf(rolle)
}

// Rolle der Identität im aktiven Bereich (me = Antwort von /api/me). Maßgeblich ist me.role vom Server
// (server/lib/roles.js roleOf). Fehlt es (ältere Antwort), gilt dieselbe Regel wie dort: eigener Bereich
// bzw. gemeinsamer Schlüssel (home.id === id) ist Leitung; sonst null (fail closed). Außerhalb von Familien
// gibt es keine Mitgliedschaften, dort ist die Identität immer der Bereich selbst.
export function roleOf(me) {
  if (!me) return null
  if (isRole(me.role)) return me.role
  if (me.home && me.home.id === me.id) return 'leitung'
  return me.art !== 'rudel' ? 'leitung' : null
}

export function hasRole(me, min) {
  return rank(roleOf(me)) >= rank(min)
}

// Beschriftung je Aussehen (themes/*.js words): Berner „Rudelführer“, Standard „Familienleitung“ usw.
const ROLE_WORD_KEYS = {
  gast: 'roleGast',
  mitglied: 'roleMitglied',
  stellvertretung: 'roleStellvertretung',
  leitung: 'roleLeitung'
}

export function roleLabel(words, rolle) {
  const key = ROLE_WORD_KEYS[rolle]
  return key ? words[key] : null
}

// Welche Rollen darf wer per Einladung vergeben (server/lib/roles.js mayInviteAs)? Die Leitung jede,
// die Stellvertretung nur gast und mitglied, alle anderen keine.
export function inviteRoleOptions(ownRole) {
  if (ownRole === 'leitung') return ROLES
  if (ownRole === 'stellvertretung') return ROLES.filter((rolle) => rank(rolle) < rank('stellvertretung'))
  return []
}

// Ist dieses Mitglied die einzige Leitung der Liste? Dann darf es weder herabgestuft noch entfernt
// werden und nicht gehen (routes/members.js LAST_LEITUNG_MESSAGE) - erst übergeben oder auflösen.
export function isLastLeitung(member, mitglieder) {
  return member?.rolle === 'leitung' && mitglieder.filter((m) => m.rolle === 'leitung').length <= 1
}
