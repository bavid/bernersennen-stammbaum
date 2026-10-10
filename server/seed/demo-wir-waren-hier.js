// „Wir waren hier“ in der Demo (docs/superpowers/plans/2026-10-10-wir-waren-hier.md, Aufgabe 5). Ort ist die
// Demo-Hundeschule Pfotenglück (seed/demo-partners.js) - ihr Demo-Partner-Bereich ist der Standard von
// POST /api/demo { as: 'partner' }, dort sieht man die offene Anmeldung im Posteingang.
// - Nele („Zuhause am Deich“, die Besucherin der Demo) ist freigegeben angemeldet und wird „hier gezeigt“;
// - Mira (Deich) ist angemeldet, die Hundeschule hat noch nicht entschieden (offen);
// - Pepper („Zuhause Lindenhof (Demo)“) ist freigegeben, wird gezeigt und hat eine freigegebene angeheftete Erinnerung -
//   die sieht der Deich in der Ortsansicht;
// - Pepper bittet Nele um Kontakt (offen) - erscheint am Deich unter den Kontaktwünschen.
// Rein fiktive Namen. Angelegt von lib/demoWirWarenHier.js (kennt die Ids).

const PLACE_SLUG = 'hundeschule-pfotenglueck'
const DEICH = 'deich'
const OTHER_HOME_NAME = 'Zuhause Lindenhof (Demo)'

// home: DEICH oder der Name eines Demo-Haushalts aus seed/demo-members.js; tier: Schlüssel (Deich) bzw. Tiername.
const CHECKINS = [
  { key: 'nele', home: DEICH, tier: 'nele', status: 'bestaetigt', zeigeMich: true, tageHer: 12 },
  { key: 'mira', home: DEICH, tier: 'mira', status: 'offen', zeigeMich: false, tageHer: 1 },
  { key: 'pepper', home: OTHER_HOME_NAME, tier: 'Pepper', status: 'bestaetigt', zeigeMich: true, tageHer: 20 }
]

// Angeheftete Erinnerungen: Eintrag über seinen Titel (nicht privat, gehört dem angemeldeten Tier).
const PINS = [{ checkin: 'pepper', titel: 'Pepper lernt schwimmen', status: 'bestaetigt', tageHer: 18 }]

const KONTAKTE = [{ von: 'pepper', an: 'nele', status: 'offen', stundenHer: 5 }]

module.exports = { PLACE_SLUG, DEICH, OTHER_HOME_NAME, CHECKINS, PINS, KONTAKTE }
