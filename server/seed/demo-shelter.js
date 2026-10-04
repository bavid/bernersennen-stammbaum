// Demo-Tierheim "Tierheim Sonnenhang" (Phase T Task 6): eigener Tierheim-Bereich mit Tieren in
// Vermittlung/reserviert/pausiert, ihrer Chronik (Kategorien, teils öffentlich) und veröffentlichten
// Steckbriefen. Phase P2 Task 9: Lotte ist pausiert - ihr Steckbrief und das Portal zeigen sie mit dem Status,
// "Entdecken" nicht (lib/vermittlung.js PUBLISHABLE_STATUS/LISTED_STATUS). Angelegt von lib/demoPack.js
// (art='tierheim', partner_id = der Demo-Partner mit slug 'tierheim-sonnenhang', siehe seed/demo-partners.js).
//
// Bilder liegen in ./images (Quellen in images/QUELLEN.md): jedes Tierheim-Tier hat ein eigenes Foto
// (tierheim-*.jpg), keines davon zeigt ein Tier aus Rudel oder Zuhause. Friedas Porträt und ihr
// Gassi-Eintrag zeigen denselben Hund (gleiche Fotoserie; die Dateien heißen noch tierheim-pepper*.jpg).
// Frieda hieß bis zum 04.10. Pepper - der Name gehört jetzt dem Rüden aus „Zuhause Lindenhof“, den das Tierheim
// vermittelt hat (seed/demo-members.js) - zwei Peppers im selben Tierheim wären verwirrend.
const SHELTER_NAME = 'Tierheim Sonnenhang'

const DOGS = [
  {
    key: 'frieda',
    name: 'Frieda',
    tierart: 'hund',
    rasse: 'Mischling',
    geschlecht: 'huendin',
    geburtsdatum: '2021-04-02',
    foto: 'tierheim-pepper.jpg',
    beschreibung:
      'Freundliche Mischlingshündin, anfangs schüchtern, inzwischen aufgeschlossen. Verträgt sich gut mit anderen Hunden und liebt lange Spaziergänge.',
    vermittlungStatus: 'in_vermittlung',
    published: true
  },
  {
    key: 'sunny',
    name: 'Sunny',
    tierart: 'katze',
    geschlecht: 'huendin',
    geburtsdatum: '2022-06-10',
    foto: 'tierheim-sunny.jpg',
    beschreibung:
      'Verschmuste Katze, die am liebsten auf dem Fensterbrett in der Sonne liegt. Sucht ein ruhiges Zuhause, gern mit Freigang.',
    vermittlungStatus: 'in_vermittlung',
    published: true
  },
  {
    key: 'oskar',
    name: 'Oskar',
    tierart: 'hund',
    geschlecht: 'ruede',
    geburtsdatum: '2019-11-20',
    foto: 'tierheim-oskar.jpg',
    beschreibung:
      'Ruhiger, erwachsener Rüde. Gut erzogen, hört auf die Grundkommandos und würde sich über ein Zuhause mit Garten freuen.',
    vermittlungStatus: 'reserviert',
    published: true
  },
  {
    key: 'momo',
    name: 'Momo',
    tierart: 'anderes',
    rasse: 'Kaninchen',
    geschlecht: 'ruede',
    geburtsdatum: '2023-02-14',
    foto: 'tierheim-momo.jpg',
    beschreibung:
      'Neugieriges Kaninchen, sucht Gesellschaft von Artgenossen. Noch ohne Steckbrief, da wir gerade nach einer passenden Partnerin für ihn suchen.',
    vermittlungStatus: 'in_vermittlung',
    published: false
  },
  {
    key: 'lotte',
    name: 'Lotte',
    tierart: 'hund',
    rasse: 'Mischling',
    geschlecht: 'huendin',
    geburtsdatum: '2020-03-15',
    foto: 'tierheim-lotte.jpg',
    beschreibung:
      'Ruhige, verschmuste Hündin. Gerade in tierärztlicher Behandlung, bald wieder vermittelbar – bis dahin ist ihre Vermittlung pausiert.',
    vermittlungStatus: 'pausiert',
    published: true
  }
]

// isPublic gilt nur für Frieda/Sunny/Oskar/Lotte, deren Steckbrief veröffentlicht ist (published: true oben) -
// bei Momo (kein Steckbrief) bleibt es überall false, rein kosmetisch ohne Wirkung nach außen.
const TIMELINE = [
  {
    dog: 'frieda',
    datum: '2026-06-02',
    autor: 'Team Sonnenhang',
    titel: 'Ankunft im Tierheim',
    text: 'Frieda kam über das Ordnungsamt zu uns – abgemagert, aber neugierig. Erste Untersuchung unauffällig.',
    kategorie: 'ankunft',
    isPublic: true
  },
  {
    dog: 'frieda',
    datum: '2026-06-05',
    autor: 'Team Sonnenhang',
    titel: 'Tierarzt-Check',
    text: 'Geimpft, gechippt und entwurmt. Gesundheitlich alles in Ordnung.',
    kategorie: 'tierarzt',
    isPublic: true
  },
  {
    dog: 'frieda',
    datum: '2026-06-20',
    autor: 'Team Sonnenhang',
    titel: 'Verhaltensbeobachtung',
    text: 'Anfangs sehr schreckhaft bei lauten Geräuschen, wird von Tag zu Tag entspannter. Verträgt sich gut mit anderen Hunden im Zwinger.',
    kategorie: 'verhalten',
    isPublic: false
  },
  {
    dog: 'frieda',
    datum: '2026-08-14',
    autor: 'Team Sonnenhang',
    titel: 'Gassi am Fluss',
    text: 'Erster großer Spaziergang außerhalb des Geländes – Frieda war ruhig an der Leine und hat sich über jede Ente gefreut.',
    kategorie: 'gassi',
    isPublic: true,
    fotos: ['tierheim-pepper-gassi.jpg'],
    hoursAgo: 60
  },
  {
    dog: 'sunny',
    datum: '2026-07-10',
    autor: 'Team Sonnenhang',
    titel: 'Ankunft im Tierheim',
    text: 'Sunny wurde als Fundtier zu uns gebracht. Zunächst zurückhaltend, taut aber schnell auf.',
    kategorie: 'ankunft',
    isPublic: true
  },
  {
    dog: 'sunny',
    datum: '2026-07-18',
    autor: 'Team Sonnenhang',
    titel: 'Tierarzt-Check',
    text: 'Kastriert, gechippt, gesund. Kein Vorbesitzer über den Chip auffindbar.',
    kategorie: 'tierarzt',
    isPublic: false
  },
  {
    dog: 'oskar',
    datum: '2025-12-01',
    autor: 'Team Sonnenhang',
    titel: 'Ankunft im Tierheim',
    text: 'Oskar wurde von seiner bisherigen Familie abgegeben, da sie umziehen musste.',
    kategorie: 'ankunft',
    isPublic: true
  },
  {
    dog: 'oskar',
    datum: '2026-09-10',
    autor: 'Team Sonnenhang',
    titel: 'Anfrage aus der Nachbarschaft',
    text: 'Eine interessierte Familie hat sich vorgestellt – Oskar wird für sie reserviert.',
    kategorie: 'sonstiges',
    isPublic: false,
    hoursAgo: 90
  },
  {
    dog: 'momo',
    datum: '2026-09-01',
    autor: 'Team Sonnenhang',
    titel: 'Ankunft im Tierheim',
    text: 'Momo kam zusammen mit zwei Geschwistern zu uns, die schon vermittelt sind. Sucht noch eine passende Partnerin.',
    kategorie: 'ankunft',
    isPublic: false
  },
  {
    dog: 'lotte',
    datum: '2026-09-15',
    autor: 'Team Sonnenhang',
    titel: 'Vermittlung kurz pausiert',
    text: 'Lotte ist gerade in tierärztlicher Behandlung. Sobald sie wieder fit ist, ist sie bald wieder vermittelbar.',
    kategorie: 'tierarzt',
    isPublic: true
  }
]

module.exports = { SHELTER_NAME, DOGS, TIMELINE }
