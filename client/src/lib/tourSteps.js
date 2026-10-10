// Inhalt des Rundgangs (lib/tour.js, components/tour): Kapitel mit Schritten, je Bereichsart. Reihenfolge überall:
// das Wichtigste (3–4 Schritte) → Entdecken bzw. Kundensicht → Werkzeuge → Verwaltung. Nach jedem Kapitel fragt die
// Karte „Wie geht’s weiter?“ (TourChoice). Ein Kapitel: key, hint (Zeile unter seinem Knopf auf der Karte), steps.
// Ein Schritt:
// - target: CSS-Selektoren, der erste sichtbare Treffer bekommt den Lichtkegel; fehlt er, wird der Schritt übersprungen.
//   Ohne target ist der Schritt ein Hinweis ohne Lichtkegel (Mitte bzw. Blatt).
// - optional: das Ziel nur kurz suchen (z. B. ein Reiter, den es noch nicht überall gibt).
// - route: dorthin wechselt der Rundgang vorher (ROUTE_FIRST_ANIMAL: die Seite des ersten Tiers aus dem Raster).
// - when(family): nur für passende Bereiche. ask: Rückfrage, wenn askWhen nicht zu finden ist (z. B. noch kein Tier).
// Die Texte beantworten: wann ist was sichtbar, wie sehe ich es selbst, welche Tiere teile ich mit wem.
import { isHouseholdIdentity } from './areas.js'

export const ROUTE_FIRST_ANIMAL = 'erstesTier'
const PAGE_TITLE = ['.app-main h1']
const MENU = ['.account-menu-trigger', '.app-nav-menu']
// Einstieg „Wer sieht was“ auf der Tierseite - setzt die Sichtbarkeits-Übersicht (data-tour="sichtbarkeit").
const SICHTBARKEIT = ['[data-tour="sichtbarkeit"]']

const HOUSEHOLD_ESSENTIALS = [
  {
    key: 'start',
    route: '/start',
    target: ['#start-news', '.start-greeting'],
    title: 'Start: eure Neuigkeiten',
    text: 'Hier seht ihr, was zuletzt bei euren Tieren und in euren Familien passiert ist – das Neueste zuerst.'
  },
  {
    key: 'composer',
    route: '/start',
    target: ['.start-composer', '.first-memory'],
    title: 'Erinnerung festhalten',
    text: 'Ein Foto, ein Satz – mehr braucht eine Erinnerung nicht. Sehen können sie alle, mit denen ihr das Tier teilt.'
  },
  {
    key: 'animals',
    route: '/tiere',
    target: ['.animal-grid', '.animals-page .empty-state', '.animals-page'],
    title: 'Eure Tiere',
    text: 'Alle eure Tiere auf einen Blick. Ein Tipp auf ein Tier öffnet seine Seite mit der Chronik.',
    ask: {
      askWhen: '.animal-tile',
      title: 'Habt ihr schon ein Tier angelegt?',
      text: 'Noch steht hier keines. Legt euer erstes Tier an – den Rundgang startet ihr später in den Einstellungen neu.',
      action: 'Jetzt anlegen',
      actionTarget: '.animals-page .empty-state .btn'
    }
  },
  {
    key: 'families',
    route: '/familien',
    when: isHouseholdIdentity,
    target: ['.families-page-grid'],
    title: 'Familien & „Mit dabei“',
    text: 'Hier stehen eure Familien und befreundeten Zuhause. Teilt ihr ein Tier mit einer Familie, sieht sie seine Erinnerungen. Mit „Mit dabei“ nennt ihr die Tiere von Freunden bei einer Erinnerung – sagen sie „Passt“, steht sie auch bei ihnen.'
  }
]

const HOUSEHOLD_DISCOVER = [
  {
    key: 'discover',
    target: ['.app-nav a[href="/entdecken"]'],
    title: 'Entdecken',
    text: 'Hundeschulen, Salons und Tierheime in eurer Nähe – und was es Neues bei ihnen gibt.'
  },
  {
    key: 'revier',
    route: '/entdecken',
    target: ['[data-tour="revier"]'],
    optional: true,
    title: 'Mein Revier',
    text: 'Euer Revier: was rund um euch los ist – Orte, Neuigkeiten und Tiere aus der Nachbarschaft.'
  },
  {
    key: 'bell',
    target: ['.hinweis-glocke-knopf'],
    title: 'Die Glocke: eure Hinweise',
    text: 'Neue Grüße, Anfragen und Gäste meldet die Glocke. Eine Zahl daran heißt: Es gibt etwas Neues.'
  }
]

const HOUSEHOLD_TOOLS = [
  {
    key: 'bilderrahmen',
    route: '/bilderrahmen',
    target: PAGE_TITLE,
    title: 'Bilderrahmen',
    text: 'Ein altes Tablet oder ein Bildschirm zeigt eure Erinnerungen als Diashow. Der Rahmen sieht nur, was ihr dafür auswählt.'
  },
  {
    key: 'collage',
    route: '/collage',
    target: PAGE_TITLE,
    title: 'Fotocollage',
    text: 'Mehrere Fotos auf einem Bild – zum Teilen, Drucken oder als Erinnerung an ein besonderes Jahr.'
  },
  {
    key: 'grusskarte',
    title: 'Grüße-Karte',
    text: 'Aus einer Erinnerung wird eine Karte zum Verschicken – als Bild fürs Handy oder zum Drucken. Ihr findet sie bei der Erinnerung in der Chronik.'
  },
  {
    key: 'geschenkkarte',
    title: 'Geschenkkarte',
    text: 'Beim Einladen druckt ihr den Code als Geschenkkarte – schön zum Verschenken an Familie und Freunde.'
  }
]

const HOUSEHOLD_ADMIN = [
  {
    key: 'sichtbarkeit',
    title: 'Wer sieht was – und wann?',
    text: 'Eure Tiere und Erinnerungen seht zuerst nur ihr. Teilt ihr ein Tier mit einer Familie, sieht sie ab dann seine Erinnerungen; nehmt ihr es heraus, nicht mehr. Nach außen geht nur, was ihr ausdrücklich freigebt.'
  },
  {
    key: 'sichtbarkeitPruefen',
    route: ROUTE_FIRST_ANIMAL,
    target: SICHTBARKEIT,
    title: 'So prüft ihr es',
    text: 'Hier seht ihr, wer dieses Tier sieht und mit welchen Familien ihr es teilt – so, wie es eure Familie sieht. Ändern geht mit einem Tipp.'
  },
  {
    key: 'rollen',
    title: 'Rollen in einer Familie',
    text: 'Familienleitung: alles, auch Name, Bild und Rollen (Einstellungen › Familien). Stellvertretung: dazu einladen und aufräumen. Mitglied: Tiere teilen und Erinnerungen schreiben. Gast: ansehen und Grüße schicken.'
  },
  {
    key: 'einladen',
    target: MENU,
    title: 'Zugang teilen & Einladen',
    text: 'Im Menü ladet ihr Familie und Freunde ein und findet die Einstellungen. Dort startet ihr den Rundgang jederzeit neu.'
  }
]

const PARTNER_PROFILE = {
  key: 'profil',
  route: '/profil',
  target: PAGE_TITLE,
  title: 'Euer Profil',
  text: 'So stellt ihr euch vor: Angebot, Fotos, Kontakt. Was hier steht, sehen Kunden in eurem öffentlichen Auftritt.'
}

const PARTNER_INBOX = {
  key: 'nachrichten',
  route: '/nachrichten',
  target: PAGE_TITLE,
  title: 'Nachrichten & „Wir waren hier“',
  text: 'Anfragen von Kunden landen hier. Mit „Wir waren hier“ melden Kunden ihren Besuch – bestätigt ihr ihn, erscheint er bei ihnen.'
}

const PARTNER_NAV = {
  key: 'leiste',
  target: ['.app-nav'],
  title: 'Alles in der Leiste',
  text: 'Profil, Beiträge, Kalender, Nachrichten und Zugang – jeder Bereich hat seinen Platz in der Leiste.'
}

const PARTNER_CUSTOMER_VIEW = [
  {
    key: 'kundensicht',
    route: '/kundensicht',
    target: PAGE_TITLE,
    title: 'Kundensicht',
    text: 'Genau so sehen Kunden euch. Prüft hier, was öffentlich ist, bevor ihr den Link weitergebt.'
  },
  {
    key: 'entdeckenKunden',
    title: 'So finden Kunden euch',
    text: 'Bei „Entdecken“ sehen Familien in der Nähe euer Profil und eure freigegebenen Beiträge und Termine.'
  }
]

const PARTNER_CARDS = {
  key: 'visitenkarten',
  route: '/visitenkarten',
  target: PAGE_TITLE,
  title: 'Visitenkarten & Karten-Designer',
  text: 'Gestaltet Visitenkarten und Karten mit eurem Logo – zum Drucken oder als Bild.'
}

const PARTNER_ADMIN = [
  {
    key: 'zugang',
    route: '/zugang',
    target: PAGE_TITLE,
    title: 'Zugang',
    text: 'Schlüssel erneuern, eigene Logins fürs Team und Benachrichtigungen. Den Rundgang startet ihr hier jederzeit neu.'
  },
  {
    key: 'einladungscodes',
    title: 'Einladungscodes für Kunden',
    text: 'Mit einem Einladungscode legen Kunden ihr eigenes Zuhause an. Ihr gebt ihn weiter oder druckt ihn als Karte – zu finden im Profil.'
  }
]

const ADMIN_HINT = 'Zugang, Team, Einladungscodes'

const PARTNER_CHAPTERS = [
  { key: 'wichtig', steps: [PARTNER_PROFILE, PARTNER_INBOX, PARTNER_NAV] },
  { key: 'kundensicht', hint: 'So sehen und finden Kunden euch', steps: PARTNER_CUSTOMER_VIEW },
  {
    key: 'werkzeuge',
    hint: 'Visitenkarten, Beiträge, Kalender',
    steps: [
      PARTNER_CARDS,
      {
        key: 'beitraege',
        route: '/beitraege',
        target: PAGE_TITLE,
        title: 'Beiträge & Freigabe',
        text: 'Angebote und Neuigkeiten schreibt ihr als Beitrag. Nach der Freigabe sehen Kunden sie bei „Entdecken“ – im Zeitraum, den ihr wählt.'
      },
      {
        key: 'kalender',
        route: '/kalender',
        target: PAGE_TITLE,
        title: 'Kalender',
        text: 'Termine und Kurse – einzeln oder als Serie. Kunden sehen sie in eurem Profil.'
      }
    ]
  },
  { key: 'verwaltung', hint: ADMIN_HINT, steps: PARTNER_ADMIN }
]

const SHELTER_CHAPTERS = [
  {
    key: 'wichtig',
    steps: [
      PARTNER_PROFILE,
      {
        key: 'schuetzlinge',
        route: '/tiere',
        target: PAGE_TITLE,
        title: 'Eure Tiere & Vermittlung',
        text: 'Hier pflegt ihr eure Schützlinge. Den Stand der Vermittlung setzt ihr je Tier; öffentlich zeigt ihn erst der Steckbrief, den ihr freigebt.'
      },
      PARTNER_INBOX
    ]
  },
  { key: 'kundensicht', hint: 'So sehen und finden Interessierte euch', steps: PARTNER_CUSTOMER_VIEW },
  {
    key: 'werkzeuge',
    hint: 'Beiträge, Collage, Karten, Startpaket',
    steps: [
      {
        key: 'beitraegeTierheim',
        title: 'Beiträge & Kalender',
        text: 'Im Profil schreibt ihr Beiträge und tragt Termine ein. Nach der Freigabe sehen Interessierte sie bei „Entdecken“.'
      },
      {
        key: 'collageTierheim',
        route: '/collage',
        target: PAGE_TITLE,
        title: 'Fotocollage',
        text: 'Mehrere Fotos auf einem Bild – zum Teilen oder für den Aushang.'
      },
      PARTNER_CARDS,
      {
        key: 'startpaket',
        title: 'Startpaket',
        text: 'Für jedes vermittelte Tier ein Startpaket zum Drucken – mit Einladung, damit die neue Familie seine Chronik weiterführt.'
      }
    ]
  },
  { key: 'verwaltung', hint: ADMIN_HINT, steps: PARTNER_ADMIN }
]

const HOUSEHOLD_CHAPTERS = [
  { key: 'wichtig', steps: HOUSEHOLD_ESSENTIALS },
  { key: 'entdecken', hint: 'Schulen, Salons und Tierheime in der Nähe', steps: HOUSEHOLD_DISCOVER },
  { key: 'werkzeuge', hint: 'Bilderrahmen, Collage, Karten', steps: HOUSEHOLD_TOOLS },
  { key: 'verwaltung', hint: 'Rollen, Wer sieht was, Zugang teilen', steps: HOUSEHOLD_ADMIN }
]

export const CHAPTER_TITLES = Object.freeze({
  wichtig: 'Das Wichtigste',
  entdecken: 'Entdecken',
  kundensicht: 'Kundensicht & Entdecken',
  werkzeuge: 'Werkzeuge',
  verwaltung: 'Verwaltung'
})

export const CHAPTERS_BY_ART = Object.freeze({
  partner: PARTNER_CHAPTERS,
  tierheim: SHELTER_CHAPTERS,
  household: HOUSEHOLD_CHAPTERS
})
