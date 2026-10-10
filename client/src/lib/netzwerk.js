// /netzwerk - „Phase B als Präsentationsseite“ (pages/NetzwerkPage.jsx): wie Partner sich untereinander vernetzen
// könnten. Nur ein Entwurf ohne Backend - die Beispiele (kind 'anfrage', 'boerse', 'gutschein') sind feste Daten
// mit erfundenen Namen und werden als „Entwurf – so könnte es aussehen“ gekennzeichnet. Folien-Mechanik wie
// /vorstellung (components/folien/FolienSteuerung.jsx). Wörter: Kosten „heute kostenlos“, nie „ohne Werbung“.

export const NETZWERK_PATH = '/netzwerk'
export const NETZWERK_DEMO_KEYS = Object.freeze(['tierheim', 'hundeschule', 'hundesalon'])

export const NETZ_ANFRAGE = Object.freeze({
  von: 'Tierheim Lindenhof',
  an: 'Hundeschule Pfotenweg',
  tier: 'Luna, 2 Jahre',
  text: 'Luna zieht an der Leine und ist bei fremden Hunden unsicher. Habt ihr nächste Woche eine Einzelstunde frei?',
  termine: ['Di 10:00', 'Do 16:30']
})

export const NETZ_BOERSE = Object.freeze([
  { id: 1, wer: 'Tierheim Lindenhof', was: 'Sucht: Pflegestelle für zwei Kätzchen', wann: 'ab sofort, ca. 3 Wochen', tone: 'wartet', status: 'Gesucht' },
  { id: 2, wer: 'Hundepension Am Bach', was: 'Bietet: Notfallplatz für einen Hund', wann: 'dieses Wochenende', tone: 'ok', status: 'Frei' },
  { id: 3, wer: 'Tierheim Nordufer', was: 'Bietet: Quarantäneplatz für Kleintiere', wann: 'ab Montag', tone: 'ok', status: 'Frei' }
])

export const NETZ_GUTSCHEIN = Object.freeze({
  sponsor: 'Salon Wuschel',
  fuer: 'Tierheim Lindenhof',
  angebot: 'Erstes Bad und Kämmen geschenkt',
  anzahl: 20,
  eingeloest: 7
})

export const NETZWERK_FOLIEN = Object.freeze([
  {
    id: 'netz',
    eyebrow: 'Ausblick',
    title: 'Ein Netz für Tiere in der Stadt',
    lead: 'Tierheime, Hundeschulen, Salons und Betreuung helfen sich gegenseitig – direkt in Familie auf Pfoten.',
    points: [
      { icon: 'paw', title: 'Tierheime', text: 'Fragen Hilfe an und finden schneller Plätze.' },
      { icon: 'users', title: 'Partner', text: 'Bieten freie Termine, Plätze und kleine Geschenke an.' },
      { icon: 'heart', title: 'Die Tiere', text: 'Bekommen Training, Pflege und ein gutes Zuhause.' }
    ]
  },
  {
    id: 'anfrage',
    kind: 'anfrage',
    eyebrow: 'Tierheim fragt Hundeschule',
    title: 'Ein Trainingsplatz für Luna',
    lead: 'Das Tierheim schickt eine Anfrage, die Hundeschule schlägt freie Termine vor – ohne Telefon-Pingpong.',
    points: []
  },
  {
    id: 'boerse',
    kind: 'boerse',
    eyebrow: 'Notfallplatz-Börse',
    title: 'Freie Plätze auf einen Blick',
    lead: 'Pflegestellen und Notfallplätze zwischen Tierheimen und Partnern – wer sucht, wer hat Platz.',
    points: []
  },
  {
    id: 'gutschein',
    kind: 'gutschein',
    eyebrow: 'Gesponserte Gutscheine',
    title: 'Ein Willkommensgeschenk vom Salon',
    lead: 'Ein Salon spendiert Einladungskarten für Familien, die ein Tier aus dem Tierheim aufnehmen.',
    points: []
  },
  {
    id: 'wer-sieht-was',
    eyebrow: 'Wer sieht was',
    title: 'Nur Partner untereinander',
    lead: 'Das Netz verbindet Tierheime und Partner. Daten der Familien bleiben bei den Familien.',
    points: [
      { icon: 'users', title: 'Nur Partner', text: 'Anfragen, Plätze und Gutscheine sehen nur angemeldete Partner.' },
      { icon: 'lock', title: 'Keine Familiendaten', text: 'Namen, Fotos und Erinnerungen der Familien werden nie geteilt.' },
      { icon: 'eyeOff', title: 'Unser Versprechen', text: 'Keine fremde Werbung, kein Tracking, kein Datenhandel.' }
    ]
  },
  {
    id: 'mitmachen',
    kind: 'mitmachen',
    eyebrow: 'Mitmachen',
    title: 'Macht mit beim Netz',
    lead: 'Euer Portal ist heute kostenlos. Erzählt uns, was euch im Alltag helfen würde – und schaut euch die Demos an.',
    points: []
  }
])
