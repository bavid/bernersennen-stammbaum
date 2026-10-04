import { sexLabel } from './timeline.js'

// „Neues Tier“ (components/QuickAnimalForm.jsx): nötig sind nur Tierart und Name, alles andere steht unter „Mehr
// Angaben“. Der Server kennt die Tierarten hund, katze und anderes (server/routes/dogs.js) - Kaninchen, Vogel und Pferd
// sind „anderes“ mit der Art als Rasse, wie bisher „Welches Tier?“. Keine neuen Pflichtfelder: das Geschlecht braucht der
// Server weiter, es steht vorbelegt in „Mehr Angaben“ (und in deren Zusammenfassung).

export const TIERART_CHOICES = Object.freeze([
  { key: 'hund', label: 'Hund', tierart: 'hund' },
  { key: 'katze', label: 'Katze', tierart: 'katze' },
  { key: 'kaninchen', label: 'Kaninchen', tierart: 'anderes', rasse: 'Kaninchen' },
  { key: 'vogel', label: 'Vogel', tierart: 'anderes', rasse: 'Vogel' },
  { key: 'pferd', label: 'Pferd', tierart: 'anderes', rasse: 'Pferd' },
  { key: 'anderes', label: 'Anderes', tierart: 'anderes', rasse: '' }
])

const BY_KEY = Object.fromEntries(TIERART_CHOICES.map((choice) => [choice.key, choice]))
const ART_ERROR = 'Bitte wähle eine Tierart.'
const NAME_ERROR = 'Bitte gib einen Namen an – oder wähle „Name unbekannt“.'

export function choiceTierart(key) {
  return BY_KEY[key]?.tierart || 'anderes'
}

export function emptyAnimal() {
  return {
    art: '',
    artText: '',
    name: '',
    nameUnbekannt: false,
    fotos: [],
    rasse: '',
    geschlecht: 'huendin',
    geburtsdatum: '',
    beiUnsSeit: '',
    beschreibung: '',
    mother: { dogId: '', freitext: '' },
    father: { dogId: '', freitext: '' },
    housemateId: ''
  }
}

export function newAnimalErrors(form) {
  const errors = {}
  if (!BY_KEY[form.art]) errors.art = ART_ERROR
  if (!form.nameUnbekannt && !form.name.trim()) errors.name = NAME_ERROR
  return errors
}

const orNull = (value) => (typeof value === 'string' ? value.trim() || null : value || null)

function rasseFor(form) {
  const choice = BY_KEY[form.art]
  if (choice?.tierart !== 'anderes') return orNull(form.rasse)
  return choice.rasse || orNull(form.artText)
}

// livesWith: fest vorgegebener Mitbewohner (Stammbaum, Tierseite); shelter: Tierheim (startet „in Vermittlung“).
export function newAnimalPayload(form, { livesWith = null, shelter = false } = {}) {
  return {
    name: form.nameUnbekannt ? '' : form.name.trim(),
    nameUnbekannt: form.nameUnbekannt,
    tierart: choiceTierart(form.art),
    rasse: rasseFor(form),
    geschlecht: form.geschlecht,
    geburtsdatum: orNull(form.geburtsdatum),
    beiUnsSeit: orNull(form.beiUnsSeit),
    beschreibung: orNull(form.beschreibung),
    fotoUrl: form.fotos[0] || null,
    motherDogId: form.mother.dogId || null,
    motherFreitext: orNull(form.mother.freitext),
    fatherDogId: form.father.dogId || null,
    fatherFreitext: orNull(form.father.freitext),
    housemateId: (livesWith ? livesWith.id : form.housemateId) || null,
    ...(shelter ? { vermittlungStatus: 'in_vermittlung' } : {})
  }
}

// Leise Zeile neben „Mehr Angaben“: was darin steht - zuerst das vorbelegte Geschlecht.
export function moreSummary(form) {
  const tierart = choiceTierart(form.art)
  const rest = tierart === 'anderes' ? 'Geburtstag, Eltern …' : 'Rasse, Geburtstag, Eltern …'
  return `${sexLabel(form.geschlecht, tierart)} · ${rest}`
}
