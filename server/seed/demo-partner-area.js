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
// Demo-Partner, foto auf ein Bild in ./images (jeder Einblick bekommt beim Anlegen eine eigene Kopie) -
// eigene Motive je Partner (Training, Salon, Tierheim), keine Porträts aus dem Demo-Rudel.
// Feste Daten wie in den übrigen Demo-Seeds; die Samstags-Termine fallen auf echte Samstage.
// angepinnt (Phase V1, lib/einblickPins.js): 'partner' oder 'admin' - angepinnte stehen auf der Karte in "Entdecken"
// statt der neuesten drei. Pfotenglück pinnt seine Abschlussprüfung, bei Wuschelglück hat zusätzlich das Team einen
// Einblick angepinnt (steht zuerst).
const EINBLICKE = [
  {
    partnerSlug: 'hundeschule-pfotenglueck',
    datum: '2026-09-26',
    text: 'Welpengruppe am Samstag – heute ging es um Ruhe an der Leine.',
    foto: 'training-welpen.jpg'
  },
  { partnerSlug: 'hundeschule-pfotenglueck', datum: '2026-09-12', text: 'Rückruftraining am Deich', foto: 'training.jpg' },
  {
    partnerSlug: 'hundeschule-pfotenglueck',
    datum: '2026-08-22',
    text: 'Abschlussprüfung im Begleithundekurs – alle bestanden!',
    foto: 'training-pruefung.jpg',
    angepinnt: 'partner'
  },
  { partnerSlug: 'hundeschule-pfotenglueck', datum: '2026-07-04', text: 'Neue Trainingsfläche mit Agility-Parcours', foto: 'agility.jpg' },

  { partnerSlug: 'hundesalon-wuschelglueck', datum: '2026-09-24', text: 'Frisch getrimmt: Pudeldame Flocke', foto: 'salon-pudel.jpg' },
  { partnerSlug: 'hundesalon-wuschelglueck', datum: '2026-09-10', text: 'Wellness-Bad für einen Golden Retriever', foto: 'salon-bad.jpg' },
  { partnerSlug: 'hundesalon-wuschelglueck', datum: '2026-08-27', text: 'Krallenpflege ganz entspannt', foto: 'salon-pflege.jpg', angepinnt: 'admin' },
  { partnerSlug: 'hundesalon-wuschelglueck', datum: '2026-07-16', text: 'Sommerschnitt für die Hitze', foto: 'salon-sommerschnitt.jpg' },
  {
    partnerSlug: 'hundesalon-wuschelglueck',
    datum: '2026-06-20',
    text: 'Welpen-Kennenlerntermin – erste Schritte im Salon',
    foto: 'salon-welpe.jpg',
    angepinnt: 'partner'
  },

  { partnerSlug: 'tierheim-sonnenhang', datum: '2026-09-05', text: 'Tag der offenen Tür im Tierheim', foto: 'tierheim-alltag.jpg' },
  { partnerSlug: 'tierheim-sonnenhang', datum: '2026-08-08', text: 'Neue Kuschelecke im Katzenhaus', foto: 'katzenhaus.jpg' }
]

// BANNER (Phase V4b, lib/partnerBanner.js): Bannerfotos für den Kopf des Portals, in dieser Reihenfolge (Position 1-3) -
// höchstens drei je Partner, alt läuft durch dieselbe Prüfung wie im Partner-Bereich. Jedes Foto bekommt beim Anlegen
// eine eigene Kopie (öffentlich über /public-media wie die Einblicke). BANNER_LAYOUTS (Feedback-Runde): das gewählte
// Layout je Partner, genau so viele Fotos, wie es zeigt - Pfotenglück zwei halb/halb, das Tierheim drei, Wuschelglück
// eins; der Tierschutzverein hat keine (so zeigt die Demo jeden Kopf).
const BANNER = [
  { partnerSlug: 'hundeschule-pfotenglueck', foto: 'welpenkurs.jpg', alt: 'Welpen toben über die Trainingswiese' },
  { partnerSlug: 'hundeschule-pfotenglueck', foto: 'see.jpg', alt: 'Berner Sennenhund beim Wassertraining am See' },
  { partnerSlug: 'hundesalon-wuschelglueck', foto: 'salon-sommerschnitt.jpg', alt: 'Frisch geschnittenes Sommerfell im Salon' },
  { partnerSlug: 'tierheim-sonnenhang', foto: 'tierheim-alltag.jpg', alt: 'Golden Retriever schaut neugierig durchs Tor' },
  { partnerSlug: 'tierheim-sonnenhang', foto: 'katzenhaus.jpg', alt: 'Katzen dösen im Katzenhaus' },
  { partnerSlug: 'tierheim-sonnenhang', foto: 'tierheim-pepper-gassi.jpg', alt: 'Gassirunde mit einem Ehrenamtlichen' }
]
const BANNER_LAYOUTS = Object.freeze({
  'hundeschule-pfotenglueck': 'halb',
  'hundesalon-wuschelglueck': 'eins',
  'tierheim-sonnenhang': 'drei'
})

// POSTS (Phase P2 Task 9): Beiträge der Demo-Partner - Felder wie bei POST /api/partner-area/posts, geprüft
// mit derselben Prüfung (lib/partnerPosts.js validatePartnerPost: Bereich passend zum Partner-Typ, immer
// "Anzeige", Züchter-Schutz, Link). freigabe: 'freigegeben', 'eingereicht' oder (V-Fehler 3) 'abgelehnt' - dann
// mit ablehnungsgrund (dieselbe Prüfung wie beim Admin). verlauf (V-Fehler 3): der Verlauf des Beitrags,
// älteste zuerst - aktion wie in lib/promotionFreigabe.js, tageAlt = vor wie vielen Tagen; er muss mit
// "eingereicht" beginnen und bei der angegebenen Freigabe enden (beim abgelehnten Eintrag steht der Grund).
// Nur example.org-Links. Hundesalon Wuschelglück ist vertrauenswürdig (seed/demo-partners.js) - sein
// freigegebener Beitrag zeigt darum eine Änderung, die ohne neue Prüfung online blieb.
const POSTS = [
  {
    partnerSlug: 'hundeschule-pfotenglueck',
    freigabe: 'freigegeben',
    verlauf: [
      { aktion: 'eingereicht', tageAlt: 12 },
      { aktion: 'freigegeben', tageAlt: 11 }
    ],
    bereich: 'hundeschule',
    titel: 'Welpenkurs ab Oktober',
    text: 'Sechs Samstage für Welpen bis 16 Wochen: Leinenführigkeit, Rückruf und viel Spiel in kleiner Gruppe.',
    url: 'https://example.org/pfotenglueck-welpenkurs-oktober',
    tierart: 'hund'
  },
  {
    partnerSlug: 'hundeschule-pfotenglueck',
    freigabe: 'eingereicht',
    verlauf: [{ aktion: 'eingereicht', tageAlt: 1 }],
    bereich: 'hundeschule',
    titel: 'Tag der offenen Tür',
    text: 'Schaut euch unseren Trainingsplatz an, lernt das Team kennen und probiert eine Schnupperstunde aus.',
    url: 'https://example.org/pfotenglueck-offene-tuer',
    // Phase V4a: zwei Termine, relativ zu heute (siehe zeitraeumeInTagen unten bei POSTS).
    zeitraeumeInTagen: [{ von: 15 }, { von: 43 }]
  },
  {
    partnerSlug: 'hundeschule-pfotenglueck',
    freigabe: 'abgelehnt',
    ablehnungsgrund: 'Link führt ins Leere – die Seite zur Schnupperstunde ist nicht erreichbar.',
    verlauf: [
      { aktion: 'eingereicht', tageAlt: 5 },
      { aktion: 'geaendert', tageAlt: 4 },
      { aktion: 'abgelehnt', tageAlt: 3 }
    ],
    bereich: 'hundeschule',
    titel: 'Agility-Schnupperstunde',
    text: 'Eine Stunde Parcours für Einsteiger – Tunnel, Steg und Slalom in ruhigem Tempo.',
    url: 'https://example.org/pfotenglueck-agility'
  },
  {
    // Phase V1: ein zweiter freigegebener Beitrag - auf der Karte steht er bewusst hinter dem Welpenkurs (KARTEN).
    partnerSlug: 'hundeschule-pfotenglueck',
    freigabe: 'freigegeben',
    verlauf: [
      { aktion: 'eingereicht', tageAlt: 7 },
      { aktion: 'freigegeben', tageAlt: 6 }
    ],
    bereich: 'hundeschule',
    titel: 'Einzeltraining am Abend',
    text: 'Für ängstliche oder stürmische Junghunde: eine Stunde nur für euch, werktags ab 18 Uhr.',
    url: 'https://example.org/pfotenglueck-einzeltraining',
    tierart: 'hund'
  },
  {
    partnerSlug: 'hundesalon-wuschelglueck',
    freigabe: 'freigegeben',
    verlauf: [
      { aktion: 'eingereicht', tageAlt: 9 },
      { aktion: 'freigegeben', tageAlt: 8 },
      { aktion: 'geaendert', tageAlt: 2 }
    ],
    bereich: 'salon',
    titel: 'Herbst-Pflegetag',
    text: 'Bad, Bürsten und Krallenpflege zum Herbstanfang – mit Termin und ohne Wartezeit.',
    url: 'https://example.org/wuschelglueck-pflegetag'
  },
  {
    partnerSlug: 'hundesalon-wuschelglueck',
    freigabe: 'freigegeben',
    verlauf: [
      { aktion: 'eingereicht', tageAlt: 6 },
      { aktion: 'freigegeben', tageAlt: 5 }
    ],
    bereich: 'salon',
    titel: 'Welpen-Kennenlerntermin',
    text: 'Eine halbe Stunde schnuppern, ohne Schere und Föhn: so wird der erste richtige Termin ganz entspannt.',
    url: 'https://example.org/wuschelglueck-welpen'
  },
  {
    // Phase V4a: eine Anzeige mit mehreren Terminen - drei einzelne Tage und ein Zeitraum über mehrere Tage.
    partnerSlug: 'tierheim-sonnenhang',
    freigabe: 'freigegeben',
    verlauf: [
      { aktion: 'eingereicht', tageAlt: 4 },
      { aktion: 'freigegeben', tageAlt: 3 }
    ],
    bereich: 'unterstuetzen',
    titel: 'Pfoten-Flohmarkt',
    text: 'Leinen, Decken, Näpfe und Spielzeug aus zweiter Hand – der Erlös geht in unsere Tierarztkasse.',
    url: 'https://example.org/tierheim-sonnenhang/flohmarkt',
    zeitraeumeInTagen: [{ von: 9 }, { von: 37 }, { von: 65 }, { von: 120, bis: 124 }]
  }
]

// zeitraeumeInTagen (Phase V4a): die Termine einer Anzeige relativ zum Tag des Demo-Aufbaus - { von, bis? } in Tagen ab
// heute (bis fehlt: ein einzelner Tag). lib/demoPartnerAreas.js macht daraus zeitraeume (JJJJ-MM-TT) und prüft sie wie
// beim Partner (lib/promotionZeitraeume.js), damit die Demo nie veraltet aussieht.

// KARTEN (Phase V1): wie die Demo-Partner ihre Karte in "Entdecken" geordnet haben - dieselben Schritte wie im
// Partner-Bereich (lib/partnerPostOrder.js setReihenfolge/setInEntdecken). reihenfolge: Titel freigegebener Anzeigen
// der Karte (eigene Beiträge und vom Team verknüpfte Empfehlungen, seed/demo-discover.js) in der gewünschten
// Reihenfolge - bewusst anders als "neueste zuerst"; nurPortal: Titel, die nicht auf der Karte, nur auf dem Portal
// stehen sollen.
const KARTEN = [
  { partnerSlug: 'hundeschule-pfotenglueck', reihenfolge: ['Welpenkurs ab Oktober', 'Einzeltraining am Abend'], nurPortal: ['Welpenkurs im Frühjahr'] },
  { partnerSlug: 'hundesalon-wuschelglueck', reihenfolge: ['Herbst-Pflegetag', 'Welpen-Kennenlerntermin'], nurPortal: [] }
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
    bezugTier: 'Frieda',
    name: 'Lea Probe',
    email: 'lea.probe@example.org',
    nachricht: 'Hallo, wir interessieren uns sehr für Frieda. Wann könnten wir sie einmal kennenlernen?',
    stundenAlt: 12,
    gelesen: false
  }
]

// KUNDEN_GUTSCHEINE (Phase 5 Task 4): je Demo-Partner-Bereich ein Stapel Weitergabe-Gutscheine für den Reiter
// "Kunden-Gutscheine" (GET /api/partner-area/vouchers) - Stapel-Art 'demo' (lib/vouchers.js DEMO_BATCH_KIND):
// einlösen geht nie, die Karten lassen sich in der Demo trotzdem drucken. eingeloest/widerrufen: so viele der
// size Codes gelten als verbraucht bzw. zurückgezogen (Beispielzahlen wie bei einem Partner nach ein paar Wochen).
// gedruckt (Phase V5, optional): so viele der offenen Codes standen schon auf gedruckten Karten (vouchers.gedruckt_at) -
// die Druckseite des Stapels nennt sie dann.
const KUNDEN_GUTSCHEINE = [
  { partnerSlug: 'hundeschule-pfotenglueck', size: 10, eingeloest: 4, widerrufen: 1, gedruckt: 2 },
  { partnerSlug: 'hundesalon-wuschelglueck', size: 8, eingeloest: 2, widerrufen: 0 }
]

// TERMINE (Phase V4a): der Kalender der Demo-Partner - Felder wie bei POST /api/partner-area/termine, geprüft mit
// derselben Prüfung (lib/partnerTermine.js validateTermin). Der erste Termin liegt relativ zum Tag des Demo-Aufbaus,
// damit die Demo nie veraltet aussieht - start ist eines von:
// { inTagen: n } (heute + n Tage), { wochentag: w } (der nächste Wochentag w ab heute, 0 = Sonntag … 6 = Samstag),
// { wochentag: w, nter: n } (der nächste n. Wochentag w im Monat, z. B. der 2. Sonntag) oder { tagImMonat: d } (der
// nächste d. eines Monats). abgesagt: die wievielten kommenden Termine der Serie ausfallen (0 = der erste).
const TERMINE = [
  {
    partnerSlug: 'hundeschule-pfotenglueck',
    titel: 'Welpenspielstunde',
    text: 'Freies Spiel in kleiner Gruppe für Welpen bis 16 Wochen – mit Pausen, Ruhe-Übungen und Zeit für eure Fragen.',
    ort: 'Trainingsplatz am Deich',
    start: { wochentag: 6 },
    uhrzeit: '10:00',
    ende: '11:00',
    serie: 'woechentlich',
    abgesagt: [1]
  },
  {
    partnerSlug: 'hundeschule-pfotenglueck',
    titel: 'Social Walk',
    text: 'Gemeinsamer Spaziergang an der Leine – ideal für Hunde, die Begegnungen entspannter erleben sollen.',
    ort: 'Treffpunkt Parkplatz am Stadtpark',
    start: { wochentag: 0, nter: 2 },
    uhrzeit: '11:00',
    ende: '12:30',
    serie: 'monatlich_wochentag'
  },
  {
    partnerSlug: 'hundeschule-pfotenglueck',
    titel: 'Erste-Hilfe-Kurs am Hund',
    text: 'Verbände, Zecken, Hitzschlag: ein Abend mit einer Tierärztin, mit Übungen am eigenen Hund.',
    ort: 'Seminarraum der Hundeschule',
    start: { inTagen: 16 },
    uhrzeit: '18:00',
    ende: '21:00',
    serie: 'keine'
  },
  {
    partnerSlug: 'tierheim-sonnenhang',
    titel: 'Tag der offenen Tür',
    text: 'Führungen durchs Tierheim, Kaffee und Kuchen – und ganz viel Zeit, unsere Tiere kennenzulernen.',
    ort: 'Tierheim Sonnenhang',
    start: { wochentag: 0, nter: 1 },
    uhrzeit: '14:00',
    ende: '17:00',
    serie: 'monatlich_wochentag'
  },
  {
    partnerSlug: 'hundesalon-wuschelglueck',
    titel: 'Krallen-Sprechstunde',
    text: 'Ohne Termin: Krallen schneiden und Pfoten pflegen, in Ruhe und mit Leckerli.',
    ort: 'Hundesalon Wuschelglück',
    start: { tagImMonat: 12 },
    uhrzeit: '15:00',
    ende: '17:00',
    serie: 'monatlich_tag'
  }
]

// VISITENKARTEN (Phase V5, Feedback-Runde): gespeicherte Karten-Gestaltungen - Felder wie PUT
// /api/partner-area/visitenkarte, geprüft mit derselben Prüfung (lib/visitenkarteDesign.js validateDesign). Pfotenglück
// zeigt die Kombi (hinten Portal und Einladungscode, in der Demo mit Muster-Codes "DEMO-…") auf der Vorlage "Foto" mit
// persönlicher Zeile, das Demo-Tierheim die Visitenkarte "Klassisch" (hinten das Portal). Die Einladungskarte lässt sich
// in der Demo per Klick ansehen.
const VISITENKARTEN = [
  {
    partnerSlug: 'hundeschule-pfotenglueck',
    design: {
      karte: 'kombi',
      vorlage: 'foto',
      farbe: '#1f5f8b',
      kurztext: 'Welpenkurse und Hundetraining für Familien aus der Region',
      widmung: 'Für unsere Welpenkurs-Familien',
      zeigeAnsprechperson: true,
      zeigeWebsite: true,
      zeigeTelefon: true,
      zeigeEmail: true
    }
  },
  {
    partnerSlug: 'tierheim-sonnenhang',
    design: {
      karte: 'visitenkarte',
      vorlage: 'klassisch',
      farbe: '#2f6b3f',
      kurztext: 'Hunde, Katzen und andere Tiere suchen bei uns ein neues Zuhause',
      widmung: '',
      zeigeAnsprechperson: true,
      zeigeWebsite: true,
      zeigeTelefon: true,
      zeigeEmail: true
    }
  }
]

module.exports = {
  PARTNER_AREA_SLUGS,
  DEFAULT_DEMO_PARTNER_SLUG,
  EINBLICKE,
  BANNER,
  BANNER_LAYOUTS,
  POSTS,
  KARTEN,
  MESSAGES,
  KUNDEN_GUTSCHEINE,
  TERMINE,
  VISITENKARTEN
}
