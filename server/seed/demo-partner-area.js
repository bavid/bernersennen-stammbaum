// Demo-Partner-Bereiche und Einblicke (Phase P1 Task 4, docs/superpowers/plans/2026-09-29-phase-p-partnerbereich.md).
// lib/demoPartnerAreas.js legt sie bei jedem Demo-Wechsel neu an (is_demo = 1) - nur fiktive Namen, keine
// echten Tiere oder Personen.
//
// PARTNER_AREA_SLUGS: Demo-Partner (seed/demo-partners.js), die einen eigenen Partner-Bereich (art 'partner')
// bekommen. Das Demo-Tierheim hat seinen Bereich schon (seed/demo-shelter.js) und steht darum nicht hier.
// DEFAULT_DEMO_PARTNER_SLUG: wohin POST /api/demo { as: 'partner' } ohne slug führt (routes/auth.js).
const PARTNER_AREA_SLUGS = ['hundeschule-pfotenglueck', 'hundesalon-wuschelglueck']
const DEFAULT_DEMO_PARTNER_SLUG = 'hundeschule-pfotenglueck'

// EINBLICKE: wie ein echter Einblick (Datum, Text, Foto) - datum/text laufen durch dieselbe Prüfung wie
// POST /api/partner-area/einblicke (lib/einblicke.js validateNewEinblick). partnerSlug zeigt auf einen
// Demo-Partner, foto auf ein Bild in ./images (jeder Einblick bekommt beim Anlegen eine eigene Kopie).
// Feste Daten wie in den übrigen Demo-Seeds; die Samstags-Termine fallen auf echte Samstage.
const EINBLICKE = [
  {
    partnerSlug: 'hundeschule-pfotenglueck',
    datum: '2026-09-26',
    text: 'Welpengruppe am Samstag – heute ging es um Ruhe an der Leine.',
    foto: 'welpen.jpg'
  },
  { partnerSlug: 'hundeschule-pfotenglueck', datum: '2026-09-12', text: 'Rückruftraining am Deich', foto: 'wanderung.jpg' },
  {
    partnerSlug: 'hundeschule-pfotenglueck',
    datum: '2026-08-22',
    text: 'Abschlussprüfung im Begleithundekurs – alle bestanden!',
    foto: 'dante.jpg'
  },
  { partnerSlug: 'hundeschule-pfotenglueck', datum: '2026-07-04', text: 'Neue Trainingsfläche mit Agility-Parcours', foto: 'garten-ida.jpg' },

  { partnerSlug: 'hundesalon-wuschelglueck', datum: '2026-09-24', text: 'Frisch getrimmt: Pudeldame Flocke', foto: 'luna.jpg' },
  { partnerSlug: 'hundesalon-wuschelglueck', datum: '2026-09-10', text: 'Wellness-Bad für einen Golden Retriever', foto: 'see.jpg' },
  { partnerSlug: 'hundesalon-wuschelglueck', datum: '2026-08-27', text: 'Krallenpflege ganz entspannt', foto: 'emma.jpg' },
  { partnerSlug: 'hundesalon-wuschelglueck', datum: '2026-07-16', text: 'Sommerschnitt für die Hitze', foto: 'max.jpg' },
  {
    partnerSlug: 'hundesalon-wuschelglueck',
    datum: '2026-06-20',
    text: 'Welpen-Kennenlerntermin – erste Schritte im Salon',
    foto: 'kira.jpg'
  },

  { partnerSlug: 'tierheim-sonnenhang', datum: '2026-09-05', text: 'Tag der offenen Tür im Tierheim', foto: 'ausstellung.jpg' },
  { partnerSlug: 'tierheim-sonnenhang', datum: '2026-08-08', text: 'Neue Kuschelecke im Katzenhaus', foto: 'minka.jpg' }
]

module.exports = { PARTNER_AREA_SLUGS, DEFAULT_DEMO_PARTNER_SLUG, EINBLICKE }
