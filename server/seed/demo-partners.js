// Demo-Partner für die öffentliche Demo und die Testumgebung (is_demo = 1, status = 'aktiv') - siehe
// docs/superpowers/plans/2026-09-28-phase-2-partner.md, Task 4. Fiktive Namen, wie vom Plan verlangt.
// Felder wie bei POST /api/admin/partners (camelCase) - lib/demoPack.js prüft sie mit derselben
// validatePartner()-Funktion wie der Admin, damit Slug/Kontrast/Züchter-Schutz identisch greifen.
const DEMO_PARTNERS = [
  {
    slug: 'tierheim-sonnenhang',
    name: 'Tierheim Sonnenhang',
    typ: 'tierheim',
    status: 'aktiv',
    plz: '10115',
    farbe: '#2f6b3f',
    portalText:
      'Wir kümmern uns um Hunde, Katzen und andere Tiere, die ein neues Zuhause suchen. Bei uns bekommt jedes Tier Zeit, Pflege und ganz viel Zuwendung, bis es bei seiner neuen Familie ankommt.\n\n' +
      'Schau gerne vorbei, wirf einen Blick auf unsere Tiere in Vermittlung oder unterstütze unsere Arbeit mit einer Spende.',
    spendenUrl: 'https://example.org/tierheim-sonnenhang/spenden',
    vermittlungUrl: 'https://example.org/tierheim-sonnenhang/tiere'
  },
  {
    slug: 'hundeschule-pfotenglueck',
    name: 'Hundeschule Pfotenglück',
    typ: 'hundeschule',
    status: 'aktiv',
    plz: '20095',
    farbe: '#1f5f8b',
    portalText:
      'Wir bieten Welpenkurse und Hundetraining für Familien aus der Region an – vom ersten „Sitz" bis zum entspannten Spaziergang im Alltag.',
    website: 'https://example.org/pfotenglueck'
  },
  {
    // Kein ist_partner (0) -> Badge "geprüft" statt "Partner" (siehe lib/partners.js publicPartner);
    // keine Farbe, keine Links - bewusst der "schlichteste" der drei Demo-Partner.
    slug: 'tierschutzverein-deichland',
    name: 'Tierschutzverein Deichland',
    typ: 'vermittlung',
    status: 'aktiv',
    plz: '26122',
    istPartner: false
  }
]

module.exports = { DEMO_PARTNERS }
