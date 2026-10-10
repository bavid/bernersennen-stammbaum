// Phase M „Mein Revier“: öffentliche Demo-Profile rund um „Zuhause am Deich“ (PLZ der Demo: Hamburg-Spadenland). Jedes
// ist ein eigenes, nicht anmeldbares Demo-Zuhause (password_hash '!', is_demo = 1) mit öffentlichen Tieren und
// Erinnerungen - so zeigt das Radar alle Entfernungsstufen, Ort an/aus und Follower öffentlich/privat. Rein fiktive
// Namen. lib/demoRevier.js legt sie an (Ids, Fotos als eigene Kopien) - auch das Profil von „Zuhause am Deich“.

const DEICH = {
  plz: '21037',
  name: 'Balu, Mira & Co. am Deich',
  text: 'Am liebsten draußen hinterm Deich – mit Ball, mit Wind und mit allen, die mitlaufen wollen.',
  tiere: ['Balu', 'Mira'],
  eintraege: ['Erster Sommer am Deich', 'Neuer Lieblingsplatz']
}

// tage: die Erinnerung ist so viele Tage alt (relativ, damit der Feed nach jedem Auffrischen frisch aussieht).
const PROFILE = [
  {
    key: 'spadenland',
    familie: 'Zuhause Spadenland (Demo)',
    plz: '21035',
    name: 'Benno vom Spadenland',
    text: 'Benno kennt jeden Graben zwischen Deich und Gewächshaus. Wir sind morgens um sieben unterwegs.',
    ortZeigen: false,
    followerOeffentlich: true,
    bild: 'wanderung.jpg',
    tiere: [{ name: 'Benno', tierart: 'hund', geschlecht: 'ruede', rasse: 'Labrador-Mix', foto: 'max.jpg' }],
    eintraege: [
      { tier: 'Benno', tage: 1, titel: 'Benno und der Ball im Graben', text: 'Der Ball war weg, Benno nicht – nach zehn Minuten kam er stolz und nass zurück.', fotos: ['agility.jpg'] },
      { tier: 'Benno', tage: 9, titel: 'Sonnenaufgang am Deich', text: 'Nebel über den Feldern, Benno mittendrin.', fotos: ['see.jpg'] }
    ]
  },
  {
    key: 'billwerder',
    familie: 'Zuhause Billwerder (Demo)',
    plz: '21033',
    name: 'Lotte & Minka',
    text: 'Eine Hündin, eine Katze, ein Garten – und jeden Tag eine neue Verhandlung über den Sonnenplatz.',
    ortZeigen: true,
    followerOeffentlich: false,
    tiere: [
      { name: 'Lotte', tierart: 'hund', geschlecht: 'huendin', rasse: 'Golden Retriever', foto: 'emma.jpg' },
      { name: 'Minka', tierart: 'katze', geschlecht: 'huendin', rasse: 'Europäisch Kurzhaar', foto: 'minka.jpg' }
    ],
    eintraege: [
      { tier: 'Minka', tage: 2, titel: 'Minka erobert den Gartenstuhl', text: 'Lotte hat es zuerst versucht. Minka hat gewonnen.', fotos: ['garten-ida.jpg'] },
      { tier: 'Lotte', tage: 12, titel: 'Lottes erster Hundekurs', text: 'Sitz, Platz, Leckerli – und ganz viel Schnüffeln dazwischen.', fotos: ['welpenkurs.jpg'] }
    ]
  },
  {
    key: 'bergedorf',
    familie: 'Zuhause Bergedorf (Demo)',
    plz: '21029',
    name: 'Paula aus Bergedorf',
    text: 'Seniorin mit Stil. Langsam, aber immer zuerst am Eiswagen.',
    ortZeigen: true,
    followerOeffentlich: true,
    bild: 'senior.jpg',
    tiere: [{ name: 'Paula', tierart: 'hund', geschlecht: 'huendin', rasse: 'Berner Sennenhund', foto: 'paula.jpg' }],
    eintraege: [{ tier: 'Paula', tage: 4, titel: 'Paula am Schlosspark', text: 'Zwei Runden um den Teich, dann ein langes Nickerchen im Schatten.', fotos: ['luna-aare.jpg'] }]
  },
  {
    key: 'reinbek',
    familie: 'Zuhause Reinbek (Demo)',
    plz: '21465',
    name: 'Gustav und Hoppel',
    text: 'Ein Dackel und ein Kaninchen, die sich erstaunlich gut verstehen.',
    ortZeigen: false,
    followerOeffentlich: false,
    tiere: [
      { name: 'Gustav', tierart: 'hund', geschlecht: 'ruede', rasse: 'Rauhaardackel', foto: 'gustav.jpg' },
      { name: 'Hoppel', tierart: 'anderes', geschlecht: 'unbekannt', rasse: 'Kaninchen', foto: 'hoppel.jpg' }
    ],
    eintraege: [{ tier: 'Gustav', tage: 6, titel: 'Gustav im Laub', text: 'Herbst heißt für Gustav: Blätterhaufen suchen und durchpflügen.', fotos: ['moritz-garten.jpg'] }]
  },
  {
    key: 'barmbek',
    familie: 'Zuhause Barmbek (Demo)',
    plz: '22303',
    name: 'Juna am Stadtpark',
    text: 'Stadthund mit Parkblick. Kennt alle Bänke und die meisten Eichhörnchen.',
    ortZeigen: true,
    followerOeffentlich: false,
    tiere: [{ name: 'Juna', tierart: 'hund', geschlecht: 'huendin', rasse: 'Australian Shepherd', foto: 'juna.jpg' }],
    eintraege: [{ tier: 'Juna', tage: 3, titel: 'Juna beim Training', text: 'Slalom klappt schon, die Wippe noch nicht ganz.', fotos: ['training.jpg'] }]
  }
]

// Folgen: [wer, wem] - 'deich' ist „Zuhause am Deich“.
const FOLGEN = [
  ['deich', 'spadenland'],
  ['deich', 'bergedorf'],
  ['spadenland', 'deich'],
  ['billwerder', 'deich'],
  ['reinbek', 'deich'],
  ['bergedorf', 'spadenland'],
  ['billwerder', 'spadenland']
]

module.exports = { DEICH, PROFILE, FOLGEN }
