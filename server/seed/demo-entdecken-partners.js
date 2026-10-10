// Weitere Demo-Partner fürs öffentliche „Entdecken“ (Startseite -> /partner): Tierheime, Hundeschulen, Salons,
// Betreuung und eine Tierphysiotherapie in mehreren Städten - damit Suche, Typ-Filter, Umkreis und der Abschnitt
// „Deutschlandweit“ in der Demo etwas zu zeigen haben. Alle Namen sind erfunden. Keine weitere Hundeschule sortiert vor
// „Hundeschule Pfotenglück“ - sie bleibt die Demo-Hundeschule im Band „Mit dabei“ (lib/community.js demoPartnerStmt). Felder wie seed/demo-partners.js;
// logo: ein Bild aus seed/images, das lib/demoPack.js insertDemoPartners als Logo in partner-media kopiert.
// ueberallSichtbar: Antrag „Überall sichtbar“ gestellt UND vom Team freigegeben (lib/ueberallSichtbar.js).
const DEMO_ENTDECKEN_PARTNERS = [
  {
    slug: 'tierschutznetz-weitblick',
    name: 'Tierschutznetz Weitblick',
    typ: 'tierheim',
    status: 'aktiv',
    plz: '60311',
    farbe: '#2f5d50',
    portalTitel: 'Pflegestellen in ganz Deutschland',
    portalText:
      'Wir vermitteln Hunde und Katzen aus Pflegestellen in ganz Deutschland – mit Vorbesuch, ehrlicher Beratung und ' +
      'Begleitung auch nach dem Einzug.',
    logo: 'tierheim-alltag.jpg',
    ueberallSichtbar: true
  },
  {
    slug: 'tierheim-sonnenwiese',
    name: 'Tierheim Sonnenwiese',
    typ: 'tierheim',
    status: 'aktiv',
    plz: '81667',
    farbe: '#4a6b2f',
    portalText: 'Ein kleines Tierheim mit großem Garten. Wir suchen Menschen mit Zeit – für Gassirunden oder für immer.',
    logo: 'katzenhaus.jpg'
  },
  {
    slug: 'tierheim-am-auenhain',
    name: 'Tierheim am Auenhain',
    typ: 'tierheim',
    status: 'aktiv',
    plz: '04277',
    farbe: '#5b4a2f',
    portalText: 'Hunde, Katzen und Kleintiere warten bei uns auf ein neues Zuhause. Besuche gern nach Absprache.',
    logo: 'tierheim-momo.jpg'
  },
  {
    slug: 'hundeschule-pfotenweg',
    name: 'Hundeschule Pfotenweg',
    typ: 'hundeschule',
    status: 'aktiv',
    plz: '50823',
    farbe: '#1f4f7a',
    portalTitel: 'Alltagstraining mit Herz',
    portalText: 'Kleine Gruppen, viel Geduld: Welpenstunde, Leinenführigkeit und entspannte Begegnungen in der Stadt.',
    logo: 'training.jpg'
  },
  {
    slug: 'trainingsplatz-kieselpfad',
    name: 'Trainingsplatz Kieselpfad',
    typ: 'hundeschule',
    status: 'aktiv',
    plz: '10997',
    farbe: '#3d3f7a',
    portalText: 'Training draußen im Kiez und im Park – für junge Hunde, Second-Hand-Hunde und alle dazwischen.',
    logo: 'agility.jpg'
  },
  {
    slug: 'hundeschule-spuersinn',
    name: 'Hundeschule Spürsinn',
    typ: 'hundeschule',
    status: 'aktiv',
    plz: '70372',
    farbe: '#6b2f4a',
    portalText: 'Nasenarbeit, Mantrailing und Beschäftigung für kluge Köpfe – auch für ältere Hunde.',
    logo: 'training-pruefung.jpg'
  },
  {
    slug: 'welpenschule-elbkiesel',
    name: 'Welpenschule Elbkiesel',
    typ: 'hundeschule',
    status: 'aktiv',
    plz: '22767',
    farbe: '#1f5f6b',
    portalText: 'Welpenkurse am Wasser und Spaziergänge in der Gruppe – damit euer Hund gelassen durch die Stadt kommt.',
    logo: 'welpenkurs.jpg'
  },
  {
    slug: 'hundesalon-wolkenfell',
    name: 'Hundesalon Wolkenfell',
    typ: 'hundesalon',
    status: 'aktiv',
    plz: '80331',
    farbe: '#7a2f5d',
    portalText: 'Baden, Bürsten, Schneiden – in Ruhe und mit Pausen, so oft euer Hund sie braucht.',
    logo: 'salon-pudel.jpg'
  },
  {
    slug: 'hundesalon-buerstenglueck',
    name: 'Hundesalon Bürstenglück',
    typ: 'hundesalon',
    status: 'aktiv',
    plz: '04109',
    farbe: '#8a3b2f',
    portalText: 'Fellpflege für alle Rassen und Mischlinge, mit Kennenlerntermin für Welpen und ängstliche Hunde.',
    logo: 'salon-bad.jpg'
  },
  {
    slug: 'gassi-service-laternenpfote',
    name: 'Gassi-Service Laternenpfote',
    typ: 'betreuung',
    status: 'aktiv',
    plz: '12049',
    farbe: '#2f4a6b',
    portalText: 'Wir gehen mit eurem Hund, wenn ihr arbeitet – in kleinen Gruppen und immer mit denselben Menschen.',
    logo: 'wanderung.jpg'
  },
  {
    slug: 'tierbetreuung-rheinwiese',
    name: 'Tierbetreuung Rheinwiese',
    typ: 'betreuung',
    status: 'aktiv',
    plz: '50667',
    farbe: '#3b5a2f',
    portalText: 'Urlaubsbetreuung bei uns zu Hause und Besuche bei euch – für Hunde, Katzen und Kleintiere.',
    logo: 'see.jpg'
  },
  {
    slug: 'tierphysio-sanftschritt',
    name: 'Tierphysio Sanftschritt',
    typ: 'sonstige',
    status: 'aktiv',
    plz: '70173',
    farbe: '#4f3d7a',
    portalTitel: 'Physiotherapie für Hunde',
    portalText: 'Bewegung, Massage und Unterwasserlaufband – nach Operationen, im Alter oder einfach für mehr Beweglichkeit.',
    logo: 'senior.jpg'
  }
]

module.exports = { DEMO_ENTDECKEN_PARTNERS }
