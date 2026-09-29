// Demo-Partner-Bereiche und Einblicke (Phase P1 Task 4, docs/superpowers/plans/2026-09-29-phase-p-partnerbereich.md).
// lib/demoPartnerAreas.js legt sie bei jedem Demo-Wechsel neu an (is_demo = 1) - nur fiktive Namen, keine
// echten Tiere oder Personen. Seit Phase P2 Task 9 auch Beiträge (POSTS) und Posteingänge (MESSAGES).
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

// POSTS (Phase P2 Task 9): Beiträge der Demo-Partner - Felder wie bei POST /api/partner-area/posts, geprüft
// mit derselben Prüfung (lib/partnerPosts.js validatePartnerPost: Bereich passend zum Partner-Typ, immer
// "Anzeige", Züchter-Schutz, Link). freigabe: 'freigegeben' oder 'eingereicht' (ein abgelehnter Beitrag
// bräuchte einen Grund und ist darum hier nicht vorgesehen). Nur example.org-Links.
const POSTS = [
  {
    partnerSlug: 'hundeschule-pfotenglueck',
    freigabe: 'freigegeben',
    bereich: 'hundeschule',
    titel: 'Welpenkurs ab Oktober',
    text: 'Sechs Samstage für Welpen bis 16 Wochen: Leinenführigkeit, Rückruf und viel Spiel in kleiner Gruppe.',
    url: 'https://example.org/pfotenglueck-welpenkurs-oktober',
    tierart: 'hund'
  },
  {
    partnerSlug: 'hundeschule-pfotenglueck',
    freigabe: 'eingereicht',
    bereich: 'hundeschule',
    titel: 'Tag der offenen Tür',
    text: 'Schaut euch unseren Trainingsplatz an, lernt das Team kennen und probiert eine Schnupperstunde aus.',
    url: 'https://example.org/pfotenglueck-offene-tuer'
  },
  {
    partnerSlug: 'hundesalon-wuschelglueck',
    freigabe: 'freigegeben',
    bereich: 'salon',
    titel: 'Herbst-Pflegetag',
    text: 'Bad, Bürsten und Krallenpflege zum Herbstanfang – mit Termin und ohne Wartezeit.',
    url: 'https://example.org/wuschelglueck-pflegetag'
  }
]

// MESSAGES (Phase P2 Task 9): Nachrichten im Posteingang der Demo-Partner - Felder wie beim Kontaktformular
// (POST /api/public/partners/:slug/contact), geprüft mit derselben Prüfung (lib/partnerMessages.js
// validateContactMessage). Fiktive Absender mit @example.org-Adressen. bezugTier: Name eines veröffentlichten
// Tiers im Tierheim-Bereich des Partners (seed/demo-shelter.js) - daraus wird "Anfrage zu …". stundenAlt: wie
// lange die Nachricht zurückliegt; gelesen: schon geöffnet.
const MESSAGES = [
  {
    partnerSlug: 'hundeschule-pfotenglueck',
    name: 'Jana Beispiel',
    email: 'jana.beispiel@example.org',
    nachricht: 'Hallo, unser Welpe ist jetzt zwölf Wochen alt. Gibt es im Welpenkurs ab Oktober noch einen freien Platz?',
    stundenAlt: 5,
    gelesen: false
  },
  {
    partnerSlug: 'hundeschule-pfotenglueck',
    name: 'Timo Muster',
    email: 'timo.muster@example.org',
    telefon: '040 1234567',
    nachricht: 'Guten Tag, bietet ihr auch Einzeltraining für einen ängstlichen Junghund an? Am liebsten abends.',
    stundenAlt: 30,
    gelesen: true
  },
  {
    partnerSlug: 'tierheim-sonnenhang',
    bezugTier: 'Pepper',
    name: 'Lea Probe',
    email: 'lea.probe@example.org',
    nachricht: 'Hallo, wir interessieren uns sehr für Pepper. Wann könnten wir sie einmal kennenlernen?',
    stundenAlt: 12,
    gelesen: false
  }
]

// KUNDEN_GUTSCHEINE (Phase 5 Task 4): je Demo-Partner-Bereich ein Stapel Weitergabe-Gutscheine für den Reiter
// "Kunden-Gutscheine" (GET /api/partner-area/vouchers) - Stapel-Art 'demo' (lib/vouchers.js DEMO_BATCH_KIND):
// einlösen geht nie, die Karten lassen sich in der Demo trotzdem drucken. eingeloest/widerrufen: so viele der
// size Codes gelten als verbraucht bzw. zurückgezogen (Beispielzahlen wie bei einem Partner nach ein paar Wochen).
const KUNDEN_GUTSCHEINE = [
  { partnerSlug: 'hundeschule-pfotenglueck', size: 10, eingeloest: 4, widerrufen: 1 },
  { partnerSlug: 'hundesalon-wuschelglueck', size: 8, eingeloest: 2, widerrufen: 0 }
]

module.exports = { PARTNER_AREA_SLUGS, DEFAULT_DEMO_PARTNER_SLUG, EINBLICKE, POSTS, MESSAGES, KUNDEN_GUTSCHEINE }
