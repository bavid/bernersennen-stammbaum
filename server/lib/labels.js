// Lesbarer Name eines Hundes, wenn er als Freitext weiterlebt (z. B. nach dem Löschen).
function dogLabel(dog) {
  if (!dog.name_unbekannt) return dog.name
  return dog.rasse ? `Unbekannt (${dog.rasse})` : 'Unbekannt'
}

module.exports = { dogLabel }
