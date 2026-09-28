// Texte und Werte rund um die Tierheim-Vermittlung (Phase T) – geteilt zwischen ShelterAnimalsPage,
// DogDetailPage, SteckbriefPanel, TimelineEntryForm und Timeline. Werte spiegeln die Enums des Servers
// (server/routes/dogs.js VERMITTLUNG_STATUS_VALUES/PUBLISHABLE_STATUS, server/routes/timeline.js KATEGORIEN).

export const VERMITTLUNG_STATUS_VALUES = ['in_vermittlung', 'reserviert', 'vermittelt']

const VERMITTLUNG_STATUS_LABELS = {
  in_vermittlung: 'In Vermittlung',
  reserviert: 'Reserviert',
  vermittelt: 'Vermittelt'
}

export function vermittlungStatusLabel(status) {
  return VERMITTLUNG_STATUS_LABELS[status] || null
}

// Ein Steckbrief lässt sich nur veröffentlichen, solange das Tier noch vermittelbar ist.
export const STECKBRIEF_PUBLISHABLE_STATUS = ['in_vermittlung', 'reserviert']

export const KATEGORIE_VALUES = ['ankunft', 'tierarzt', 'verhalten', 'training', 'gassi', 'sonstiges']

const KATEGORIE_LABELS = {
  ankunft: 'Ankunft',
  tierarzt: 'Tierarzt',
  verhalten: 'Verhalten',
  training: 'Training',
  gassi: 'Gassi',
  sonstiges: 'Sonstiges'
}

export function kategorieLabel(kategorie) {
  return KATEGORIE_LABELS[kategorie] || null
}

// Überschrift der Vermittlungs-Sektion auf dem Partner-Portal (Task 5): "Fellnasen" nur, wenn WIRKLICH
// nur Hunde/Katzen darunter sind - bei jeder Mischung oder anderen Tieren bleibt es neutral "Tiere".
export function adoptionSectionTitle(animals) {
  const allFurry = animals.length > 0 && animals.every((animal) => animal.tierart === 'hund' || animal.tierart === 'katze')
  return allFurry ? 'Fellnasen suchen ein Zuhause' : 'Tiere suchen ein Zuhause'
}
