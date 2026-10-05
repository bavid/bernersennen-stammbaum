// Abschnitte des Datenschutz-Textes (LegalPage, /datenschutz) in der Reihenfolge der Seite - EINE Liste für die
// Überschriften (components/legal/LegalSection.jsx) und das Inhaltsverzeichnis oben (Audit W, N7). Die Ids sind die
// Sprungmarken (#tierheime); ein Hash in der Adresse öffnet seinen Abschnitt.
export const DATENSCHUTZ_SECTIONS = [
  { id: 'anmeldung', title: 'Anmeldung' },
  { id: 'inhalte', title: 'Gespeicherte Inhalte' },
  { id: 'standort', title: 'Standort und Umkreissuche' },
  { id: 'tracker', title: 'Keine Tracker, keine fremden Dienste' },
  { id: 'entdecken', title: 'Entdecken und Empfehlungen' },
  { id: 'tierheime', title: 'Tierheime' },
  { id: 'partner-profile', title: 'Partner-Profile und Einblicke' },
  { id: 'nachrichten', title: 'Nachrichten an Partner' },
  { id: 'anfragen', title: 'Anfragen' },
  { id: 'benachrichtigungen', title: 'Benachrichtigungen des Betreibers' },
  { id: 'push', title: 'Benachrichtigungen aufs Handy' },
  { id: 'besuche', title: 'Zuhause besuchen' },
  { id: 'mit-dabei', title: '„Mit dabei“' },
  { id: 'telegram-partner', title: 'Telegram-Hinweise für Partner' },
  { id: 'hinweise', title: 'Hinweise oben auf der Seite' },
  { id: 'sicherungen', title: 'Sicherungen' },
  { id: 'bilderrahmen', title: 'Digitaler Bilderrahmen' },
  { id: 'suche', title: 'Suche' },
  { id: 'rechte', title: 'Rechte und Kontakt' }
]

export function sectionTitle(id) {
  const section = DATENSCHUTZ_SECTIONS.find((entry) => entry.id === id)
  if (!section) throw new Error(`Unbekannter Datenschutz-Abschnitt: ${id}`)
  return section.title
}

// ?alles=1 (alle Abschnitte offen) - der Parameter der Adresse.
export const EXPAND_ALL_PARAM = 'alles'

// Ist der Abschnitt von außen aufgeklappt: alle (?alles=1) oder genau er per Sprungmarke (#id)?
export function isForcedOpen(id, { expandAll, hash }) {
  return Boolean(expandAll) || hash === `#${id}`
}
