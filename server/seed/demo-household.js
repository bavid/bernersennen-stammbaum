// Demo-Zuhause "Zuhause am Deich": ein privater Chronik-Bereich (art='zuhause') für Vorführungen und
// Tests. Zeigt Einzug/Abschied/Herkunft, private Chronik-Einträge und "lebt zusammen mit" außerhalb
// einer Abstammungslinie. Bilder liegen in ../seed/images (wiederverwendet, keine eigenen Bilder).
// Mitgliedschaft im Demo-Rudel, geteilte Tiere, der fremde Kommentar sowie (Phase T Task 6) die
// Verknüpfung von Neles frühen Tierheim-Einträgen mit dem Demo-Tierheim (dog_transfers, dog_shares mit
// story_consent) werden von lib/demoPack.js hergestellt (die kennt die jeweiligen Ids) - hier stehen
// nur die Rohdaten des Haushalts selbst.
// Jede neue Funktion der Chronik gehört auch hierher, damit die Demo alles zeigt.

const HOUSEHOLD_NAME = 'Zuhause am Deich'

const COMPANIONS = [
  {
    key: 'balu',
    name: 'Balu',
    geschlecht: 'ruede',
    tierart: 'hund',
    geburtsdatum: '2006-05-01',
    beiUnsSeit: '2008-03-15',
    beiUnsBis: '2019-11-02',
    abschiedGrund: 'verstorben',
    herkunftArt: 'privat',
    herkunftText: 'Von Nachbarn übernommen',
    foto: 'max.jpg',
    beschreibung:
      'Kam als erwachsener Rüde zu uns, als unsere Nachbarn nicht mehr für ihn sorgen konnten. Ruhig, treu und unser erster Wegbegleiter am Deich.'
  },
  {
    key: 'mira',
    name: 'Mira',
    geschlecht: 'huendin',
    tierart: 'katze',
    geburtsdatum: '2012-05-20',
    beiUnsSeit: '2012-08-01',
    herkunftArt: 'privat',
    herkunftText: 'Bauernhof der Cousine',
    // Kein Foto: Minka (Rudel) ist im Bildersatz die einzige Katze - Mira wird nach Rudel geteilt,
    // ein zweites Tier mit demselben Bild sähe dort wie ein Duplikat aus. Der Client zeigt statt
    // eines Fotos die Initialen.
    beschreibung: 'Vom Bauernhof der Cousine, mit acht Wochen zu uns geholt. Schläft am liebsten auf dem Fensterbrett.'
  },
  {
    key: 'nele',
    name: 'Nele',
    geschlecht: 'huendin',
    tierart: 'hund',
    rasse: 'Mischling',
    geburtsdatum: '2019-03-10',
    beiUnsSeit: '2021-06-12',
    herkunftArt: 'tierheim',
    herkunftText: 'Tierheim Sonnenhang',
    // Bewusst NICHT finn.jpg: Nele wird nach Rudel geteilt, wo Finn selbst mit genau diesem Bild
    // auftritt - dasselbe Foto für zwei Tiere sähe dort wie ein Duplikat aus. wanderung.jpg ist im
    // Rudel nur als Eintragsfoto bei Aiko/Gustav zu sehen (nie als deren Profilbild) und zeigt keine
    // Nähe zu Finn.
    foto: 'wanderung.jpg',
    beschreibung: 'Aus dem Tierheim Sonnenhang zu uns gezogen. Anfangs schüchtern, heute die Chefin am Deich.'
  },
  {
    key: 'flocke',
    name: 'Flocke',
    geschlecht: 'huendin',
    tierart: 'anderes',
    rasse: 'Kaninchen',
    geburtsdatum: '2023-04-01',
    beiUnsSeit: '2023-06-01',
    herkunftArt: 'anderes',
    herkunftText: 'Aus einer Tierschutz-Pflegestelle',
    foto: 'hoppel.jpg',
    beschreibung: 'Aus einer Pflegestelle für Kleintiere übernommen. Hoppelt am liebsten über die Terrasse.'
  }
]

// "Lebt zusammen mit": Nele und Mira teilen sich Haus und Garten
const HOUSEMATES = [['nele', 'mira']]

// key markiert Einträge, deren Id lib/demoPack.js später braucht (z. B. für den fremden Kommentar
// im Rudel). hoursAgo sorgt dafür, dass ein Teil der Einträge frisch im Aktivitäts-Feed erscheint.
const TIMELINE = [
  {
    dog: 'balu',
    key: 'baluEinzug',
    datum: '2008-03-15',
    autor: 'Familie Nissen',
    titel: 'Balu zieht ein',
    text: 'Von den Nachbarn übernommen – am ersten Abend hat er sich direkt aufs Sofa gelegt, als wäre er nie woanders gewesen.'
  },
  {
    dog: 'balu',
    datum: '2019-11-02',
    autor: 'Familie Nissen',
    titel: 'Erinnerungen an Balu',
    text: 'Heute mussten wir Abschied nehmen. Über elf Jahre hat er uns begleitet - wir vermissen ihn sehr.',
    privat: true
  },
  {
    dog: 'mira',
    key: 'miraEinzug',
    datum: '2012-08-01',
    autor: 'Familie Nissen',
    titel: 'Mira zieht ein',
    text: 'Acht Wochen alt und schon mutiger als jeder Hund im Haus.'
  },
  {
    dog: 'mira',
    datum: '2026-08-20',
    autor: 'Familie Nissen',
    titel: 'Neuer Lieblingsplatz',
    text: 'Mira hat das Fensterbrett im Wohnzimmer für sich entdeckt - Sonnenplatz reserviert.',
    hoursAgo: 40
  },
  // Zwei frühe Einträge aus Neles Zeit im Tierheim Sonnenhang (Phase T Task 6): lib/demoPack.js
  // verknüpft sie beim Anlegen mit herkunft_family_id = dem Demo-Tierheim (dieselbe Spalte, die auch
  // lib/transfers.js transferDog beim echten Umzug setzt) - die Timeline zeigt dann "aus Tierheim
  // Sonnenhang". Beide vor beiUnsSeit (2021-06-12) datiert, wie bei einem echten Umzug: die Chronik
  // zieht mit dem Tier um, diese beiden Einträge existierten schon, bevor Nele zu uns kam.
  {
    dog: 'nele',
    datum: '2021-05-02',
    autor: 'Team Sonnenhang',
    titel: 'Ankunft im Tierheim',
    text: 'Nele kam als Fundtier zu uns – verängstigt, aber neugierig auf jeden, der stehen blieb.',
    kategorie: 'ankunft',
    herkunftShelter: true
  },
  {
    dog: 'nele',
    datum: '2021-05-20',
    autor: 'Team Sonnenhang',
    titel: 'Erster Spaziergang',
    text: 'Der erste Spaziergang außerhalb des Zwingers – anfangs an der Leine sehr unsicher, am Ende schon mit Schwanzwedeln.',
    kategorie: 'gassi',
    herkunftShelter: true
  },
  {
    dog: 'nele',
    key: 'neleEinzug',
    datum: '2021-06-12',
    autor: 'Familie Nissen',
    titel: 'Nele zieht ein – die ersten Tage',
    text: 'Aus dem Tierheim Sonnenhang zu uns geholt. Die ersten Tage war sie schüchtern, jetzt traut sie sich schon aufs Sofa.'
  },
  {
    dog: 'nele',
    datum: '2026-09-05',
    autor: 'Familie Nissen',
    titel: 'Tierarzt-Termin',
    text: 'Jährliche Kontrolle - alles bestens, nur eine Zahnsteinentfernung steht noch an.',
    privat: true,
    hoursAgo: 16
  },
  {
    dog: 'flocke',
    key: 'flockeEinzug',
    datum: '2023-06-01',
    autor: 'Familie Nissen',
    titel: 'Flocke zieht ein',
    text: 'Aus einer Pflegestelle für Kleintiere übernommen. Erkundet seitdem jeden Winkel der Terrasse.'
  },
  {
    dog: 'flocke',
    datum: '2026-09-20',
    autor: 'Familie Nissen',
    titel: 'Neues Gehege',
    text: 'Ein größeres Freigehege für den Garten ist fertig - Flocke testet es ausgiebig.',
    hoursAgo: 8
  }
]

module.exports = { HOUSEHOLD_NAME, COMPANIONS, HOUSEMATES, TIMELINE }
