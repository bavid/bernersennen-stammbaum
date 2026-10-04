'use strict'

const db = require('../db')
const { SEX, SEXES } = require('./dogsSchema')

// Ist das Tier irgendwo als Mutter bzw. Vater eingetragen - im Stammbaum (mother_dog_id/father_dog_id eines anderen
// Tiers) oder bei einer Verpaarung (breeding_events)?
const parentRole = db.prepare(`
  SELECT
    EXISTS (SELECT 1 FROM dogs WHERE mother_dog_id = @id) OR EXISTS (SELECT 1 FROM breeding_events WHERE mutter_dog_id = @id) AS mutter,
    EXISTS (SELECT 1 FROM dogs WHERE father_dog_id = @id) OR EXISTS (SELECT 1 FROM breeding_events WHERE vater_dog_id = @id) AS vater
`)

// Prüft das Geschlecht beim Anlegen (existing leer) und Ändern eines Tiers (routes/dogs.js validateDogRecord; ohne Angabe
// gilt dort „weiß ich nicht“, SEX.unknown - ein neues Tier braucht nur Name und Tierart): einer der drei Werte, und ein
// Tier, das schon als Mutter oder Vater eingetragen ist, behält sein Geschlecht. Sonst stünde z. B. ein Tier mit „weiß ich
// nicht“ als Mutter im Stammbaum, und seine Verpaarungen ließen sich nicht mehr speichern (routes/breeding.js verlangt eine
// Hündin bzw. einen Rüden). null: in Ordnung, sonst die Meldung.
function sexError(geschlecht, existing = {}) {
  if (!SEXES.includes(geschlecht)) return 'Geschlecht muss ruede, huendin oder unbekannt sein'
  if (!existing.id || existing.geschlecht === geschlecht) return null
  const role = parentRole.get({ id: existing.id })
  if (role.mutter) return 'Dieses Tier ist als Mutter eingetragen – das Geschlecht lässt sich deshalb nicht ändern.'
  if (role.vater) return 'Dieses Tier ist als Vater eingetragen – das Geschlecht lässt sich deshalb nicht ändern.'
  return null
}

module.exports = { SEX, SEXES, sexError }
