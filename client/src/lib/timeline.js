import { yearOf } from './dates.js'
import { herkunftText } from './companions.js'
import { t } from './i18n/index.js'

const TYPE_ORDER = { birth: 0, arrival: 1, breeding: 2, litter: 3, entry: 4, farewell: 5 }

const SEX_LABELS = {
  hund: { ruede: 'Rüde', huendin: 'Hündin' },
  katze: { ruede: 'Kater', huendin: 'Katze' },
  anderes: { ruede: 'männlich', huendin: 'weiblich' }
}

const SPECIES_LABELS = { hund: 'Hund', katze: 'Katze', anderes: 'Anderes Tier' }

// Geschlecht „weiß ich nicht“ (server/lib/dogsSchema.js SEX.unknown): neue Tiere starten so. Mutter bzw. Vater kann nur
// ein Tier mit bekanntem Geschlecht sein (ParentPicker, Verpaarungen filtern nach 'huendin'/'ruede').
export const UNKNOWN_SEX = 'unbekannt'

// Die Wahl im Formular („Neues Tier“, Tier bearbeiten) - bewusst in denselben Worten für jede Tierart.
export const SEX_CHOICES = Object.freeze([
  { value: 'huendin', label: 'weiblich' },
  { value: 'ruede', label: 'männlich' },
  { value: UNKNOWN_SEX, label: 'weiß ich nicht' }
])

export function isKnownSex(geschlecht) {
  return geschlecht === 'huendin' || geschlecht === 'ruede'
}

// "Rüde"/"Hündin", bei Katzen "Kater"/"Katze", sonst "männlich"/"weiblich" - bei unbekanntem Geschlecht ''.
export function sexLabel(geschlecht, tierart = 'hund') {
  const label = (SEX_LABELS[tierart] || SEX_LABELS.hund)[geschlecht]
  return label ? t(label) : ''
}

export function speciesLabel(tierart = 'hund') {
  return t(SPECIES_LABELS[tierart] || SPECIES_LABELS.hund)
}

// Das Feld „Geschlecht“ (Reiter Infos): ein Wort, das nie wie die Tierart klingt. Bei Katzen ist „Katze“ beides - dort
// „weiblich“ wie im Formular (SEX_CHOICES), sonst sexLabel ("Rüde", "Hündin", "Kater", "männlich"). Unbekannt: ''.
export function sexFactLabel(geschlecht, tierart = 'hund') {
  const sex = sexLabel(geschlecht, tierart)
  if (!sex || sex !== speciesLabel(tierart)) return sex
  return t(SEX_CHOICES.find((choice) => choice.value === geschlecht).label)
}

// Kombinierte Art+Geschlecht-Zeile ohne Dopplung: bei Katzen ist der Geschlechtsbegriff für Weibchen
// identisch mit dem Artnamen ("Katze"/"Katze") – dann reicht ein Wort. Rüde/Hündin bzw. Kater bleiben
// eigenständige Begriffe und werden weiter mit Mittelpunkt kombiniert ("Hund · Hündin", "Katze · Kater"). Bei unbekanntem
// Geschlecht nur die Art ("Hund").
export function speciesSexLabel(tierart = 'hund', geschlecht) {
  const species = speciesLabel(tierart)
  const sex = sexLabel(geschlecht, tierart)
  return !sex || species === sex ? species : `${species} · ${sex}`
}

const SPECIES_NOUNS = { hund: 'Hund', katze: 'Katze', anderes: 'Tier' }

// Für Beschriftungen wie "Katze anlegen" oder "Tier löschen"
export function speciesNoun(tierart = 'hund') {
  return t(SPECIES_NOUNS[tierart] || SPECIES_NOUNS.hund)
}

// Was für ein Tier? Hunde brauchen keinen Zusatz, bei "anderes" steht die Art im Freitext (z. B. "Kaninchen")
export function animalKind(dog) {
  const tierart = dog.tierart || 'hund'
  if (tierart === 'hund') return null
  if (tierart === 'anderes') return dog.rasse || speciesLabel('anderes')
  return speciesLabel(tierart)
}

export function shortName(name = '') {
  return name.split(/\s+(vom|von|aus|zum|zur)\s+/i)[0]
}

// Name für Karten und Überschriften; Hunde mit unbekanntem Namen heißen "Unbekannt"
export function displayName(dog) {
  return dog.name_unbekannt ? t('Unbekannt') : shortName(dog.name)
}

// "lebt mit Hermes", "lebt mit Hermes & Minka" – für Tiere ohne eigene Abstammung, die mit jemandem zusammenleben
export function livesWithLabel(dogs) {
  return t('lebt mit {names}', { names: dogs.map(displayName).join(' & ') })
}

// Wie displayName, aber bei unbekanntem Namen mit Rasse – für Listen, Links und Auswahlfelder
export function dogLabel(dog) {
  if (!dog.name_unbekannt) return shortName(dog.name)
  return dog.rasse ? t('Unbekannt ({rasse})', { rasse: dog.rasse }) : t('Unbekannt')
}

// "Aikos", aber "Hermes’"
export function genitive(name) {
  return /[sxzß]$/i.test(name) ? `${name}’` : `${name}s`
}

function compareItems(a, b) {
  if (a.datum !== b.datum) return a.datum < b.datum ? -1 : 1
  if (TYPE_ORDER[a.type] !== TYPE_ORDER[b.type]) return TYPE_ORDER[a.type] - TYPE_ORDER[b.type]
  return (a.sortId ?? 0) - (b.sortId ?? 0)
}

function litterItems(children = []) {
  const byDate = new Map()
  for (const child of children) {
    if (!child.geburtsdatum) continue
    byDate.set(child.geburtsdatum, [...(byDate.get(child.geburtsdatum) || []), child])
  }
  return [...byDate.entries()].map(([datum, litter]) => ({
    type: 'litter',
    key: `litter-${datum}`,
    datum,
    titel: t('Nachwuchs: {names}', { names: litter.map(dogLabel).join(', ') }),
    children: litter
  }))
}

// matingLabel: "Verpaarung" (Theme-Wort mating - Phase U).
function breedingItems(dog, breedingEvents = [], matingLabel = 'Verpaarung') {
  return breedingEvents
    .filter((event) => event.mutter_dog_id === dog.id || event.vater_dog_id === dog.id)
    .map((event) => {
      const partner =
        event.mutter_dog_id === dog.id ? event.vater_name || event.vater_freitext : event.mutter_name
      return {
        type: 'breeding',
        key: `breeding-${event.id}`,
        sortId: event.id,
        datum: event.datum,
        titel: partner ? t('{mating} mit {name}', { mating: matingLabel, name: shortName(partner) }) : matingLabel,
        text: event.wurf_info,
        foto_urls: event.foto_urls || []
      }
    })
}

// "Abschied von Aiko" (verstorben), "Aiko zieht aus" (abgegeben/umgezogen), sonst "Aiko geht"
function farewellTitel(dog) {
  const name = shortName(dog.name)
  if (dog.abschied_grund === 'verstorben') return t('Abschied von {name}', { name })
  if (dog.abschied_grund === 'abgegeben' || dog.abschied_grund === 'umgezogen') return t('{name} zieht aus', { name })
  return t('{name} geht', { name })
}

// Führt eigene Einträge und automatische Meilensteine (Geburt, Einzug, Deckakt, Nachwuchs, Abschied)
// zu einer chronologisch sortierten Liste zusammen. matingLabel: Wort für den Deckakt je Auftritt (words.mating).
export function buildTimeline({ dog, entries = [], breedingEvents = [], children = [], newestFirst = false, matingLabel }) {
  const items = [
    ...entries.map((entry) => ({ ...entry, type: 'entry', key: `entry-${entry.id}`, sortId: entry.id })),
    ...breedingItems(dog, breedingEvents, matingLabel),
    ...litterItems(children)
  ]
  if (dog.geburtsdatum) {
    items.push({ type: 'birth', key: 'birth', datum: dog.geburtsdatum, titel: t('{name} kommt zur Welt', { name: shortName(dog.name) }) })
  }
  if (dog.bei_uns_seit) {
    items.push({
      type: 'arrival',
      key: 'arrival',
      datum: dog.bei_uns_seit,
      titel: t('{name} zieht ein', { name: shortName(dog.name) }),
      text: herkunftText(dog) || null
    })
  }
  if (dog.bei_uns_bis) {
    items.push({ type: 'farewell', key: 'farewell', datum: dog.bei_uns_bis, titel: farewellTitel(dog) })
  }
  items.sort(compareItems)
  return newestFirst ? items.reverse() : items
}

export function groupByYear(items) {
  const groups = []
  for (const item of items) {
    const year = yearOf(item.datum)
    const last = groups[groups.length - 1]
    if (last && last.year === year) last.items.push(item)
    else groups.push({ year, items: [item] })
  }
  return groups
}
