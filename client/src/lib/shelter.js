// Texte und Werte rund um die Tierheim-Chronik (Phase T) – geteilt zwischen TimelineEntryForm,
// Timeline, SteckbriefPage und PartnerPortalPage. Werte spiegeln die Enums des
// Servers (server/routes/timeline.js KATEGORIEN). Der Vermittlungsstatus (Werte, Beschriftungen,
// veröffentlichbare Status) steht in lib/vermittlung.js.

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
