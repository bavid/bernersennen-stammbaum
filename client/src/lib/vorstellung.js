// Präsentation zum Durchklicken (/vorstellung, pages/VorstellungPage.jsx): die Folien als Daten und die Hilfen für
// ?folie=N (1-basiert, ungültige Werte werden begrenzt). Reine Funktionen ohne DOM. Die Folien „Transparent finanziert“
// (kind 'finanz') und „Ausprobieren“ (kind 'demo') bekommen ihre Inhalte von der Seite (FinanzierungRegel,
// lib/present.js); die Folie „Als App“ (kind 'app') verlinkt auf /app. Wörter: „Erinnerung“, „Grüße“, „Mit dabei“;
// Kosten „heute kostenlos“ - nie „für immer“/„vorerst“, nie „ohne Werbung“.

export const FOLIE_PARAM = 'folie'
export const VORSTELLUNG_PATH = '/vorstellung'

export const FOLIEN = Object.freeze([
  {
    id: 'start',
    eyebrow: 'Willkommen',
    title: 'Familie auf Pfoten',
    lead: 'Das Familienalbum für eure Tiere – Erinnerungen, Grüße und Stammbaum an einem ruhigen Ort.',
    points: []
  },
  {
    id: 'fuer-wen',
    eyebrow: 'Für wen ist das?',
    title: 'Für alle, die Tiere lieben',
    points: [
      { icon: 'home', title: 'Familien', text: 'Alle Erinnerungen an Hund und Katze an einem Platz – mit der ganzen Familie.' },
      { icon: 'users', title: 'Züchter und Rudel', text: 'Würfe, Linien und Stammbaum – und die neuen Familien bleiben Mit dabei.' },
      { icon: 'paw', title: 'Tierheime', text: 'Tiere in Vermittlung zeigen und nach der Übergabe in Kontakt bleiben.' },
      { icon: 'globe', title: 'Hundeschulen und Salons', text: 'Ein eigenes Portal mit Terminen, Angeboten und Grüßen an die Kundschaft.' }
    ]
  },
  {
    id: 'warum',
    eyebrow: 'Warum das?',
    title: 'Weil vieles heute verloren geht',
    points: [
      { icon: 'image', title: 'Fotos sind verstreut', text: 'In WhatsApp-Gruppen und auf Facebook – und kaum jemand findet sie später wieder.' },
      { icon: 'book', title: 'Wissen geht verloren', text: 'Wer war die Mutter, wann war die Impfung, was mochte er am liebsten?' },
      { icon: 'heart', title: 'Kontakt reißt ab', text: 'Tierheime verlieren nach der Vermittlung den Kontakt und erfahren nie vom Happy End.' }
    ]
  },
  {
    id: 'funktionen',
    eyebrow: 'Was es kann',
    title: 'Fünf Dinge, die den Alltag leichter machen',
    points: [
      { icon: 'camera', title: 'Erinnerungen', text: 'Fotos, Geschichten und Meilensteine – schön sortiert in einer Chronik.' },
      { icon: 'users', title: 'Familien', text: 'Teilt ein Tier mit Mit-Besitzern, Oma und Nachbarn – jede Person mit eigener Rolle.' },
      { icon: 'tree', title: 'Stammbaum', text: 'Eltern, Geschwister und Nachkommen auf einen Blick.' },
      { icon: 'frame', title: 'Bilderrahmen', text: 'Eure Erinnerungen als digitaler Bilderrahmen auf einem anderen Gerät.' },
      { icon: 'bell', title: 'Hinweise', text: 'Sanfte Erinnerungen an Termine und neue Grüße – aufs Handy, wenn ihr wollt.' }
    ]
  },
  {
    id: 'tierheime',
    eyebrow: 'Für Tierheime',
    title: 'Vom Tierheim in ein neues Zuhause – und danach Mit dabei',
    points: [
      { icon: 'paw', title: 'Tiere in Vermittlung', text: 'Steckbriefe mit Fotos, öffentlich im eigenen Portal.' },
      { icon: 'send', title: 'Übergabe-Code', text: 'Die neue Familie übernimmt die Erinnerungen des Tieres mit einem Code.' },
      { icon: 'heart', title: 'Happy Ends', text: 'Grüße aus dem neuen Zuhause kommen zurück – das Tierheim bleibt Mit dabei.' }
    ]
  },
  {
    id: 'partner',
    eyebrow: 'Für Partner',
    title: 'Hundeschulen, Salons und Betreuung',
    points: [
      { icon: 'globe', title: 'Eigenes Portal', text: 'Angebote, Termine und Kontakt in eigener Farbe, öffentlich sichtbar.' },
      { icon: 'calendar', title: 'Termine und Beiträge', text: 'Kurse und Neuigkeiten erscheinen bei den Familien in „Entdecken“.' },
      { icon: 'mail', title: 'Postfach und Einladungen', text: 'Kundschaft einladen und Nachrichten an einem Ort beantworten. Heute kostenlos.' }
    ]
  },
  {
    id: 'werbung',
    eyebrow: 'Unser Versprechen',
    title: 'Keine fremde Werbung, kein Tracking, kein Datenhandel',
    lead: 'Eure Erinnerungen gehören euch. Partner-Angebote gibt es – klar gekennzeichnet.',
    points: [
      { icon: 'lock', title: 'Keine fremde Werbung', text: 'Nichts, was sich zwischen eure Fotos drängt.' },
      { icon: 'eyeOff', title: 'Kein Tracking', text: 'Niemand verfolgt, wohin ihr klickt.' },
      { icon: 'check', title: 'Kein Datenhandel', text: 'Eure Daten werden nicht verkauft.' }
    ]
  },
  {
    id: 'finanzierung',
    kind: 'finanz',
    eyebrow: 'Transparenz',
    title: 'Transparent finanziert',
    lead: 'Heute kostenlos für alle Tierhalterinnen und Tierhalter. Getragen von Spenden und lokalen Partnern – so rechnen wir offen:',
    points: []
  },
  {
    id: 'app',
    kind: 'app',
    eyebrow: 'Ohne App Store',
    title: 'Als App aufs Handy',
    lead: 'Familie auf Pfoten lässt sich wie eine App auf den Startbildschirm legen – in wenigen Schritten, je Gerät erklärt.',
    points: []
  },
  {
    id: 'ausprobieren',
    kind: 'demo',
    eyebrow: 'Jetzt ansehen',
    title: 'Ausprobieren',
    lead: 'Jede Kachel öffnet eine schreibgeschützte Demo in einem neuen Tab.',
    points: []
  }
])

// Wert aus der Adresse (Text oder Zahl) -> 1..anzahl; alles Ungültige ergibt die erste Folie.
export function clampFolie(value, anzahl = FOLIEN.length) {
  const n = Number.parseInt(value, 10)
  if (!Number.isInteger(n) || n < 1) return 1
  return Math.min(n, anzahl)
}

// ?folie=N einer Adresse (location.search) -> Foliennummer, 1-basiert.
export function folieAusSuche(search) {
  return clampFolie(new URLSearchParams(search || '').get(FOLIE_PARAM))
}
