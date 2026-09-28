// Demo-Tierheim "Tierheim Sonnenhang" (Phase T Task 6): eigener Tierheim-Bereich mit vier Tieren in
// Vermittlung/reserviert, ihrer Chronik (Kategorien, teils öffentlich) und veröffentlichten
// Steckbriefen. Angelegt von lib/demoPack.js (art='tierheim', partner_id = der Demo-Partner mit slug
// 'tierheim-sonnenhang', siehe seed/demo-partners.js).
//
// Bilder liegen in ./images, wiederverwendet: die vier Portraits kommen bewusst aus den Bildern, die
// sonst NIRGENDS als Portrait eines Tiers im Rudel/Zuhause dienen (ausstellung/garten-ida/schnee/see/
// welpen, siehe seed/demo-data.js und seed/demo-household.js) - anders als z. B. finn.jpg oder
// wanderung.jpg, die dort schon "vergeben" sind. Für Sunny (Katze) und Momo (Kaninchen) gibt es im
// ganzen Bildersatz nur je ein passendes Motiv (minka.jpg/hoppel.jpg), das eigentlich Minka (Rudel)
// bzw. Flocke (Zuhause am Deich) "gehört" - unbedenklich, weil der Tierheim-Bereich nie in derselben
// Ansicht wie Rudel/Zuhause auftaucht (komplett eigener Bereich, siehe lib/context.js ART.tierheim).
const SHELTER_NAME = 'Tierheim Sonnenhang'

const DOGS = [
  {
    key: 'pepper',
    name: 'Pepper',
    tierart: 'hund',
    rasse: 'Mischling',
    geschlecht: 'huendin',
    geburtsdatum: '2021-04-02',
    foto: 'garten-ida.jpg',
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
    foto: 'minka.jpg',
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
    foto: 'schnee.jpg',
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
    foto: 'hoppel.jpg',
    beschreibung:
      'Neugieriges Kaninchen, sucht Gesellschaft von Artgenossen. Noch ohne Steckbrief, da wir gerade nach einer passenden Partnerin für ihn suchen.',
    vermittlungStatus: 'in_vermittlung',
    published: false
  }
]

// isPublic gilt nur für Pepper/Sunny/Oskar, deren Steckbrief veröffentlicht ist (published: true oben) -
// bei Momo (kein Steckbrief) bleibt es überall false, rein kosmetisch ohne Wirkung nach außen.
const TIMELINE = [
  {
    dog: 'pepper',
    datum: '2026-06-02',
    autor: 'Team Sonnenhang',
    titel: 'Ankunft im Tierheim',
    text: 'Pepper kam über das Ordnungsamt zu uns – abgemagert, aber neugierig. Erste Untersuchung unauffällig.',
    kategorie: 'ankunft',
    isPublic: true
  },
  {
    dog: 'pepper',
    datum: '2026-06-05',
    autor: 'Team Sonnenhang',
    titel: 'Tierarzt-Check',
    text: 'Geimpft, gechippt und entwurmt. Gesundheitlich alles in Ordnung.',
    kategorie: 'tierarzt',
    isPublic: true
  },
  {
    dog: 'pepper',
    datum: '2026-06-20',
    autor: 'Team Sonnenhang',
    titel: 'Verhaltensbeobachtung',
    text: 'Anfangs sehr schreckhaft bei lauten Geräuschen, wird von Tag zu Tag entspannter. Verträgt sich gut mit anderen Hunden im Zwinger.',
    kategorie: 'verhalten',
    isPublic: false
  },
  {
    dog: 'pepper',
    datum: '2026-08-14',
    autor: 'Team Sonnenhang',
    titel: 'Gassi am Fluss',
    text: 'Erster großer Spaziergang außerhalb des Geländes – Pepper war ruhig an der Leine und hat sich über jede Ente gefreut.',
    kategorie: 'gassi',
    isPublic: true,
    fotos: ['see.jpg'],
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
  }
]

module.exports = { SHELTER_NAME, DOGS, TIMELINE }
