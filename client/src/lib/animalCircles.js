// „Eure Tiere“ als Kreise oben auf Start (B+ Familienalbum): die eigenen Tiere des Bereichs - erst die, die bei euch leben,
// dann die verstorbenen „In Erinnerung“ (sanft grau). Nicht dabei: hierher geteilte Tiere anderer Zuhause, Platzhalter
// für unbekannte Eltern und Tiere, die ausgezogen oder abgegeben sind (die gehören jetzt woanders hin).
import { isEditable } from './areas.js'
import { displayName } from './timeline.js'

export function isInMemory(dog) {
  return Boolean(dog.bei_uns_bis) && dog.abschied_grund === 'verstorben'
}

const byName = (a, b) => displayName(a).localeCompare(displayName(b), 'de')

export function circleAnimals(dogs = []) {
  const own = dogs.filter((dog) => isEditable(dog) && !dog.shared_from && !dog.name_unbekannt)
  const living = own.filter((dog) => !dog.bei_uns_bis).sort(byName)
  const remembered = own.filter(isInMemory).sort(byName)
  return [...living, ...remembered]
}
