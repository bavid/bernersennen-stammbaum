// Phase V2: Zuhause besuchen und „Erlebt mit“ in der Demo. „Zuhause am Deich“ (seed/demo-household.js, die
// Besucherin der Demo) und „Zuhause Möwenweg (Demo)“ (seed/demo-members.js) besuchen sich gegenseitig - so zeigt die
// Demo „Zu Besuch bei …“ im Bereichswechsler UND „Meine Gäste“ im Einladen-Dialog. Dazu „Erlebt mit“:
// - ein bestätigter Eintrag vom Möwenweg (Wilma) mit Nele: erscheint gespiegelt in Neles Chronik am Deich;
// - ein offener Eintrag vom Möwenweg (Wilma) mit Flocke: steht als Anfrage auf den Wegbegleitern am Deich;
// - ein eigener Eintrag vom Deich (Mira) mit Wilma, bestätigt: zeigt am Deich den Chip „erlebt mit Wilma“. Bewusst
//   nicht bei Nele: ihr neuester Eintrag ist ihr öffentliches Happy End beim Demo-Tierheim (routes/publicAnimals.js).
// Rein fiktive Namen. Fotos nur aus ./images (Unsplash, Inventar in images/QUELLEN.md) - als eigene Kopie je Eintrag.
// Angelegt von lib/demoVisits.js (kennt die Ids); jede neue Besuchs- oder „Erlebt mit“-Funktion gehört auch hierher.

const VISIT_HOST_NAME = 'Zuhause Möwenweg (Demo)'

// Einträge des Möwenwegs (Tier: Wilma), die ein Tier vom Deich markieren.
const HOST_ENTRIES = [
  {
    key: 'schneerunde',
    datum: '2026-01-18',
    autor: 'Familie Jansen',
    titel: 'Schneerunde mit Nele',
    text: 'Nele war zu Besuch, und die beiden sind eine Stunde lang durch den Neuschnee getobt. Danach lagen zwei sehr nasse Hunde vor dem Ofen.',
    fotos: ['wilma.jpg'],
    hoursAgo: 52,
    erlebtMit: { tier: 'nele', status: 'bestaetigt' }
  },
  {
    key: 'flockeBesuch',
    datum: '2026-09-27',
    autor: 'Familie Jansen',
    titel: 'Wilma staunt über Flocke',
    text: 'Beim Gegenbesuch am Deich hat Wilma zum ersten Mal ein Kaninchen aus der Nähe gesehen – ganz vorsichtig, mit wedelndem Schwanz.',
    hoursAgo: 20,
    erlebtMit: { tier: 'flocke', status: 'offen' }
  }
]

// Eigener Eintrag vom Deich (Tier: Mira), der Wilma markiert - schon bestätigt.
const HOME_ENTRIES = [
  {
    key: 'wilmaBesuch',
    dog: 'mira',
    datum: '2026-09-12',
    autor: 'Familie Nissen',
    titel: 'Besuch vom Möwenweg',
    text: 'Wilma war zu Besuch – Mira hat sie den ganzen Nachmittag vom Fensterbrett aus beobachtet. Zum Schluss gab es ein vorsichtiges Nasenstupsen.',
    hoursAgo: 30,
    erlebtMit: { tier: 'wilma', status: 'bestaetigt' }
  }
]

module.exports = { VISIT_HOST_NAME, HOST_ENTRIES, HOME_ENTRIES }
