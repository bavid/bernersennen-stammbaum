'use strict'

const bcrypt = require('bcryptjs')
const db = require('../db')
const { normalizeCode, hashCode } = require('./codes')

const REAUTH_ERROR = 'Bitte bestätige mit deinem aktuellen Schlüssel bzw. Passwort.'

// Nachweis mit einem AKTUELLEN Berechtigungsnachweis für sensible Aktionen (Schlüssel erneuern - eigener
// Bereich in routes/auth.js POST /family/key, Familie in routes/members.js POST /key -, Benutzer
// anlegen/löschen): eine bloße Sitzung darf dafür nicht genügen (Session-Übernahme z. B. über ein
// unbeaufsichtigtes Gerät oder XSS). Zwei Felder, der Server entscheidet anhand der Sitzungsart, gegen
// welchen Hash geprüft wird: { currentKey } für eine Schlüssel-Sitzung (Identität hat schon einen
// access_key_hash); { currentPassword } sowohl für eine Benutzer-Sitzung (req.userId gesetzt - geprüft
// gegen DEREN EIGENEN password_hash) als auch für eine Alt-Familie ohne Schlüssel (access_key_hash NULL,
// legacy_password = 1 - geprüft gegen families.password_hash). So bleibt { password } in POST /users
// ausschließlich das Passwort des NEU angelegten Benutzers, ohne Kollision mit dem Nachweis-Feld.
// Geprüft wird IMMER die eigene Identität (req.homeId) - auch wenn der aktive Bereich eine Familie ist:
// wer deren Schlüssel erneuert, weist nach, dass er selbst der ist, für den ihn die Sitzung hält.
async function verifyCurrentCredential(req) {
  const body = req.body || {}

  if (req.userId) {
    if (typeof body.currentPassword !== 'string' || !body.currentPassword) return false
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.userId)
    if (!user) return false
    return bcrypt.compare(body.currentPassword, user.password_hash)
  }

  const family = db.prepare('SELECT access_key_hash, legacy_password, password_hash FROM families WHERE id = ?').get(req.homeId)
  if (!family) return false

  if (family.access_key_hash) {
    const normalized = typeof body.currentKey === 'string' ? normalizeCode(body.currentKey) : null
    if (!normalized) return false
    return hashCode(normalized) === family.access_key_hash
  }

  if (family.legacy_password) {
    if (typeof body.currentPassword !== 'string' || !body.currentPassword) return false
    return bcrypt.compare(body.currentPassword, family.password_hash)
  }

  return false
}

module.exports = { verifyCurrentCredential, REAUTH_ERROR }
