// Demo-Rudel für Vorführungen und Tests: vier Generationen, bekannte und unbekannte Vorfahren,
// Mitbewohner (Hund, Katze, Kaninchen), Chronik mit Kommentaren, Zuchtbuch und Pinnwand.
// Bilder liegen in ./images. Tiere referenzieren Eltern über ihren `key`; Timeline-Einträge sind
// absichtlich nicht chronologisch sortiert, damit die automatische Einordnung sichtbar wird.
// Jede neue Funktion der Chronik gehört auch hierher, damit die Demo alles zeigt.

const FAMILY_NAME = 'Rudel vom Sonnenhang'

const DOGS = [
  // Generation I: bekannte Stammeltern und ein Paar ohne bekannte Namen
  {
    key: 'aiko',
    name: 'Aiko vom Sonnenhang',
    geschlecht: 'ruede',
    geburtsdatum: '2014-05-12',
    farbe: 'Klassisch dreifarbig, symmetrische Blesse',
    foto: 'aiko.jpg',
    beschreibung:
      'Der Stammvater unseres Rudels. Ruhig, gutmütig und der geduldigste Kinderhüter, den man sich wünschen kann. Liebt lange Runden durchs Emmental und schläft am liebsten quer im Flur.',
    fatherFreitext: 'Arco vom Gurnigel'
  },
  {
    key: 'bella',
    name: 'Bella vom Emmental',
    geschlecht: 'huendin',
    geburtsdatum: '2015-03-02',
    farbe: 'Dreifarbig, breite weiße Brust',
    foto: 'bella.jpg',
    beschreibung:
      'Kam mit zehn Wochen aus dem Emmental zu uns. Temperamentvoll, verfressen und unglaublich verschmust – die Seele des Rudels.',
    motherFreitext: 'Anka vom Emmental'
  },
  {
    key: 'ahnAppenzeller',
    nameUnbekannt: true,
    rasse: 'Appenzeller Sennenhund',
    geschlecht: 'huendin',
    foto: 'ahn-appenzeller.jpg',
    beschreibung: 'Lunas Mutter. Vom Bauernhof im Appenzellerland – ihren Namen kennt heute niemand mehr.'
  },
  {
    key: 'ahnBerner',
    nameUnbekannt: true,
    geschlecht: 'ruede',
    foto: 'ahn-berner.jpg',
    beschreibung: 'Lunas Vater, ein Berner vom Nachbarhof. Mehr wissen wir leider nicht.'
  },

  // Generation II
  {
    key: 'cora',
    name: 'Cora vom Sonnenhang',
    geschlecht: 'huendin',
    geburtsdatum: '2017-06-18',
    farbe: 'Dreifarbig, schmale Blesse',
    foto: 'cora.jpg',
    beschreibung: 'Die Chefin im Garten. Wasserratte durch und durch, kein See ist vor ihr sicher.',
    mother: 'bella',
    father: 'aiko'
  },
  {
    key: 'dante',
    name: 'Dante vom Sonnenhang',
    geschlecht: 'ruede',
    geburtsdatum: '2017-06-18',
    farbe: 'Dreifarbig, Schweizer Kreuz auf der Brust',
    foto: 'dante.jpg',
    beschreibung: 'Der größte Welpe aus Bellas erstem Wurf. Stark, sanft und ein echter Bergfreund.',
    mother: 'bella',
    father: 'aiko'
  },
  {
    key: 'luna',
    name: 'Luna von der Aare',
    rasse: 'Berner × Appenzeller',
    geschlecht: 'huendin',
    geburtsdatum: '2016-09-02',
    farbe: 'Dreifarbig, zierlich, Appenzeller-Ringelrute',
    foto: 'luna.jpg',
    beschreibung: 'Flink wie eine Appenzellerin, gemütlich wie eine Bernerin. Hütet am liebsten die Enten an der Aare.',
    mother: 'ahnAppenzeller',
    father: 'ahnBerner'
  },

  // Generation III
  {
    key: 'emma',
    name: 'Emma vom Sonnenhang',
    geschlecht: 'huendin',
    geburtsdatum: '2020-04-09',
    farbe: 'Dreifarbig, weiße Rutenspitze',
    foto: 'emma.jpg',
    beschreibung: 'Neugierig, verspielt und immer die Erste an der Tür. Liebt Laubhaufen über alles.',
    mother: 'cora',
    fatherFreitext: 'Balu vom Schwarzwaldhof'
  },
  {
    key: 'finn',
    name: 'Finn vom Sonnenhang',
    geschlecht: 'ruede',
    geburtsdatum: '2020-04-09',
    farbe: 'Dreifarbig, asymmetrische Blesse',
    foto: 'finn.jpg',
    beschreibung: 'Emmas Wurfbruder. Lebt bei Familie Keller am Thunersee und ist ein begeisterter Schneehund.',
    mother: 'cora',
    fatherFreitext: 'Balu vom Schwarzwaldhof'
  },
  {
    key: 'gustav',
    name: 'Gustav von der Aare',
    geschlecht: 'ruede',
    rasse: 'Berner × Appenzeller',
    geburtsdatum: '2020-11-03',
    farbe: 'Dreifarbig, kräftige rote Abzeichen',
    foto: 'gustav.jpg',
    beschreibung: 'Dantes und Lunas Sohn, ein richtiger Brummbär. Wohnt mit seiner Schwester Juna bei Familie Brunner.',
    mother: 'luna',
    father: 'dante'
  },
  {
    key: 'juna',
    name: 'Juna von der Aare',
    geschlecht: 'huendin',
    rasse: 'Berner × Appenzeller',
    geburtsdatum: '2020-11-03',
    farbe: 'Dreifarbig, feine Blesse',
    foto: 'juna.jpg',
    beschreibung: 'Gustavs Wurfschwester und das Gegenteil von ihm: schnell, wach und immer einen Schritt voraus.',
    mother: 'luna',
    father: 'dante'
  },

  // Generation IV
  {
    key: 'hermes',
    name: 'Hermes vom Sonnenhang',
    geschlecht: 'ruede',
    geburtsdatum: '2023-02-14',
    farbe: 'Dreifarbig, breite Blesse',
    foto: 'hermes.jpg',
    beschreibung: 'Frech, tollpatschig und überzeugt, dass das Sofa ihm gehört. Wohnt mit Labrador Max und Katze Minka.',
    mother: 'emma',
    fatherFreitext: 'Oskar vom Thunersee'
  },
  {
    key: 'ida',
    name: 'Ida vom Sonnenhang',
    geschlecht: 'huendin',
    geburtsdatum: '2023-02-14',
    farbe: 'Dreifarbig, weiße Pfoten',
    foto: 'ida.jpg',
    beschreibung: 'Hermes’ Schwester. Die Ruhigere der beiden – bis jemand Blumen im Garten pflanzt.',
    mother: 'emma',
    fatherFreitext: 'Oskar vom Thunersee'
  },
  {
    key: 'kira',
    name: 'Kira vom Sonnenhang',
    geschlecht: 'huendin',
    geburtsdatum: '2023-02-14',
    farbe: 'Dreifarbig, Herz auf der Brust',
    foto: 'kira.jpg',
    beschreibung: 'Die Dritte aus Emmas Wurf. Lebt bei Lea in Bern und macht dort den Wochenmarkt unsicher.',
    mother: 'emma',
    fatherFreitext: 'Oskar vom Thunersee'
  },
  {
    key: 'paula',
    name: 'Paula von der Aare',
    geschlecht: 'huendin',
    rasse: 'Berner-Mix',
    geburtsdatum: '2025-03-21',
    farbe: 'Dreifarbig, rosa Nasenfleck',
    foto: 'paula.jpg',
    beschreibung: 'Junas Tochter. Teilt ihr Körbchen mit Kaninchen Hoppel – freiwillig.',
    mother: 'juna',
    fatherFreitext: 'Theo vom Gurten'
  },
  {
    key: 'moritz',
    name: 'Moritz von der Aare',
    geschlecht: 'ruede',
    rasse: 'Berner-Mix',
    geburtsdatum: '2025-03-21',
    farbe: 'Dreifarbig, dunkle Maske',
    foto: 'moritz.jpg',
    beschreibung: 'Paulas Bruder. Findet jeden Schneehaufen und legt sich hinein.',
    mother: 'juna',
    fatherFreitext: 'Theo vom Gurten'
  },

  // Mitbewohner ohne eigene Abstammung
  {
    key: 'max',
    name: 'Max',
    rasse: 'Labrador-Mix',
    geschlecht: 'ruede',
    geburtsdatum: '2021-06-01',
    farbe: 'Schokobraun',
    foto: 'max.jpg',
    beschreibung: 'Aus dem Tierheim adoptiert und seitdem Hermes’ großer Bruder. Bringt jeden Ball zurück – außer seinen eigenen.'
  },
  {
    key: 'minka',
    name: 'Minka',
    tierart: 'katze',
    rasse: 'Europäisch Kurzhaar',
    geschlecht: 'huendin',
    geburtsdatum: '2019-08-10',
    farbe: 'Grau getigert',
    foto: 'minka.jpg',
    beschreibung: 'Die eigentliche Chefin im Haus. Duldet Hermes, liebt Max.'
  },
  {
    key: 'hoppel',
    name: 'Hoppel',
    tierart: 'anderes',
    rasse: 'Kaninchen',
    geschlecht: 'ruede',
    geburtsdatum: '2024-04-01',
    farbe: 'Hellbraun, weißer Bauch',
    foto: 'hoppel.jpg',
    beschreibung: 'Zwergkaninchen mit großem Selbstbewusstsein. Paulas bester Freund.'
  }
]

// "Lebt zusammen mit": [Tier, Mitbewohner]
const HOUSEMATES = [
  ['max', 'hermes'],
  ['minka', 'hermes'],
  ['hoppel', 'paula'],
  ['gustav', 'juna']
]

const TIMELINE = [
  { dog: 'aiko', datum: '2024-05-12', autor: 'Anna', titel: '10. Geburtstag', text: 'Zehn Jahre alt! Es gab Rinderherz und einen neuen Ball, den er sofort vergraben hat.',
    comments: [{ autor: 'Familie Brunner', hoursAgo: 60, text: 'Alles Gute, alter Mann! Gustav schickt ein Wuff.' }] },
  { dog: 'aiko', datum: '2014-07-20', autor: 'David', titel: 'Einzug bei uns', text: 'Aiko ist eingezogen. Die erste Nacht hat er komplett verschlafen – im Schuhregal.' },
  { dog: 'aiko', datum: '2019-09-01', autor: 'David', titel: 'Wanderung zum Niesen', text: 'Sechs Stunden unterwegs und am Ende noch der Fitteste von uns allen.', fotos: ['wanderung.jpg'] },
  { dog: 'aiko', datum: '2016-02-10', autor: 'Anna', titel: 'Erster richtiger Schnee', text: 'Er hat eine halbe Stunde lang Schneeflocken gefangen.', fotos: ['schnee.jpg'] },
  { dog: 'bella', datum: '2017-06-18', autor: 'Anna', titel: 'Sechs Welpen!', text: 'Drei Rüden, drei Hündinnen. Mutter und Welpen sind wohlauf.', fotos: ['welpen.jpg'] },
  { dog: 'bella', datum: '2015-05-10', autor: 'David', titel: 'Ankunft aus dem Emmental', text: 'Abgeholt beim Züchter, zwei Stunden Autofahrt auf dem Schoß.' },
  { dog: 'bella', datum: '2016-08-14', autor: 'Anna', titel: 'Ausstellung in Bern', text: 'Formwert „Vorzüglich“ und eine Rosette für die Wand.', fotos: ['ausstellung.jpg'] },
  { dog: 'cora', datum: '2020-04-09', autor: 'Anna', titel: 'Cora ist Mama', text: 'Fünf gesunde Welpen, darunter Emma und Finn.', fotos: ['welpen.jpg'] },
  { dog: 'cora', datum: '2018-07-02', autor: 'David', titel: 'Erstes Mal schwimmen', text: 'Vom Steg gesprungen, als hätte sie nie etwas anderes gemacht.', fotos: ['see.jpg'] },
  { dog: 'cora', datum: '2017-08-20', autor: 'Anna', titel: 'Die Geschwister ziehen aus', text: 'Cora bleibt bei uns, Dante auch – die anderen vier haben tolle Familien gefunden.' },
  { dog: 'dante', datum: '2019-05-05', autor: 'David', titel: 'HD/ED-Auswertung', text: 'Beide Ergebnisse frei. Große Erleichterung!' },
  { dog: 'dante', datum: '2018-10-12', autor: 'Anna', titel: 'Begleithundeprüfung bestanden' },
  { dog: 'luna', datum: '2016-11-20', autor: 'Familie Brunner', titel: 'Luna zieht an die Aare', text: 'Vom Bauernhof zu uns in die Stadt. Die Enten am Fluss haben keine ruhige Minute mehr.', fotos: ['see.jpg'] },
  { dog: 'luna', datum: '2020-11-03', autor: 'Familie Brunner', titel: 'Zwei Welpen: Gustav und Juna', text: 'Ein Brummbär und ein Wirbelwind. Beide bleiben bei uns.', fotos: ['welpen.jpg'] },
  { dog: 'emma', datum: '2021-01-10', autor: 'Anna', titel: 'Schneetag im Garten', fotos: ['schnee.jpg'] },
  { dog: 'emma', datum: '2023-02-14', autor: 'Anna', titel: 'Emmas erster Wurf', hoursAgo: 70, text: 'Vier Welpen am Valentinstag – Hermes und Ida bleiben bei uns, Kira zieht zu Lea nach Bern.', fotos: ['welpen.jpg'],
    comments: [
      { autor: 'Familie Keller', hoursAgo: 40, text: 'Herzlichen Glückwunsch, Emma! Die sind ja winzig.' },
      { autor: 'Lea', hoursAgo: 30, text: 'Ich zähle schon die Tage, bis Kira bei mir einzieht 🥰' }
    ] },
  { dog: 'emma', datum: '2020-06-05', autor: 'David', titel: 'Einzug ins große Körbchen' },
  { dog: 'finn', datum: '2022-01-22', autor: 'Familie Keller', titel: 'Grüße vom Thunersee', text: 'Finn lässt ausrichten: Schnee ist das Beste.', fotos: ['schnee.jpg'] },
  { dog: 'finn', datum: '2025-07-12', autor: 'Familie Keller', titel: 'Stand-up-Paddling', hoursAgo: 14, text: 'Finn fährt jetzt Brett. Na ja – er sitzt drauf, wir paddeln.', fotos: ['see.jpg'],
    comments: [{ autor: 'Anna', hoursAgo: 10, text: 'Cora hätte das Brett schon längst versenkt 😂' }] },
  { dog: 'gustav', datum: '2022-07-30', autor: 'Familie Brunner', titel: 'Alpwanderung Gantrisch', fotos: ['wanderung.jpg'] },
  { dog: 'juna', datum: '2023-09-16', autor: 'Familie Brunner', titel: 'Agility-Schnupperkurs', text: 'Juna: 12 Hürden in Bestzeit. Gustav: hat sich unter die Wippe gelegt.' },
  { dog: 'juna', datum: '2025-03-21', autor: 'Familie Brunner', titel: 'Junas Wurf ist da', text: 'Fünf Welpen, alle gesund. Paula und Moritz bleiben bei uns.', fotos: ['welpen.jpg'] },
  { dog: 'hermes', datum: '2024-03-03', autor: 'Anna', titel: 'Welpenschule bestanden', hoursAgo: 26, text: 'Sitz und Platz klappen. Bleib… arbeiten wir noch dran.',
    comments: [
      { autor: 'Familie Keller', hoursAgo: 8, text: 'Bravo Hermes! Finn hat „Bleib“ bis heute nicht verstanden.' },
      { autor: 'Lea', hoursAgo: 5, text: 'Kira auch nicht. Liegt wohl in der Familie 😄' }
    ] },
  { dog: 'hermes', datum: '2023-04-15', autor: 'David', titel: 'Erster Ausflug an den See', fotos: ['see.jpg'] },
  { dog: 'hermes', datum: '2023-12-24', autor: 'Anna', titel: 'Erstes Weihnachten', text: 'Hat das Geschenkpapier mehr geliebt als die Geschenke.' },
  { dog: 'hermes', datum: '2024-06-02', autor: 'David', titel: 'Max zieht ein', text: 'Aus dem Tierheim zu uns: Labrador Max. Hermes hat ihm sofort sein Lieblingsspielzeug gezeigt – und wieder weggenommen.', fotos: ['max.jpg'] },
  { dog: 'ida', datum: '2024-05-20', autor: 'Anna', titel: 'Ida entdeckt die Tulpen', text: 'Das Beet ist jetzt ein Hundebett.' },
  { dog: 'kira', datum: '2024-10-05', autor: 'Lea', titel: 'Herbst in der Elfenau', text: 'Kira im Laub – man sieht nur noch die Rute.', fotos: ['kira.jpg'] },
  { dog: 'paula', datum: '2025-06-14', autor: 'Jonas', titel: 'Paula trifft Hoppel', hoursAgo: 34, text: 'Erst misstrauisch beschnuppert, jetzt unzertrennlich.', fotos: ['hoppel.jpg'],
    comments: [{ autor: 'David', hoursAgo: 20, text: 'Hermes und Minka haben ein Jahr gebraucht – Respekt!' }] },
  { dog: 'moritz', datum: '2026-01-18', autor: 'Familie Brunner', titel: 'Moritz’ erster Schnee', hoursAgo: 52, fotos: ['moritz.jpg'] },
  { dog: 'max', datum: '2025-08-30', autor: 'David', titel: 'Max’ Adoptionstag', text: 'Ein Jahr bei uns. Es gab Kuchen – natürlich hundegeeignet.' },
  { dog: 'minka', datum: '2024-11-11', autor: 'Anna', titel: 'Minka erobert das Hundekörbchen', hoursAgo: 96, text: 'Hermes schläft jetzt daneben. Diskussion zwecklos.', fotos: ['minka.jpg'] }
]

const BREEDING = [
  { mutter: 'bella', vater: 'aiko', datum: '2017-04-16', wurfInfo: '6 Welpen (3 Rüden, 3 Hündinnen), geboren am 18.06.2017.', fotos: ['welpen.jpg'] },
  { mutter: 'luna', vater: 'dante', datum: '2020-09-01', wurfInfo: '2 Welpen, geboren am 03.11.2020: Gustav und Juna.' },
  { mutter: 'cora', vaterFreitext: 'Balu vom Schwarzwaldhof', datum: '2020-02-06', wurfInfo: '5 Welpen, geboren am 09.04.2020. Emma bleibt bei uns.' },
  { mutter: 'emma', vaterFreitext: 'Oskar vom Thunersee', datum: '2022-12-13', wurfInfo: '4 Welpen, geboren am 14.02.2023.' },
  { mutter: 'juna', vaterFreitext: 'Theo vom Gurten', datum: '2025-01-18', wurfInfo: '5 Welpen, geboren am 21.03.2025. Paula und Moritz bleiben im Rudel.', fotos: ['welpen.jpg'] },
  { mutter: 'ida', vaterFreitext: 'Arco vom Belpberg', datum: '2026-11-05', wurfInfo: 'Geplant – Welpen wären Anfang Januar 2027 zu erwarten.' }
]

// hoursAgo steuert, wann Zettel, Einträge und Kommentare "geschrieben" wurden (Reihenfolge auf der
// Pinnwand und in "Neu im Rudel"). Einträge ohne hoursAgo gelten als am Tag des Ereignisses geschrieben.
const NOTES = [
  {
    autor: 'Anna',
    hoursAgo: 3,
    text: 'Geschwistertreffen am Thunersee! Wer bringt den großen Wassernapf mit?',
    terminDatum: '2026-10-18',
    terminZeit: '14:00',
    replies: [
      { autor: 'Familie Keller', hoursAgo: 2, text: 'Wir sind dabei – Finn freut sich schon! Napf bringen wir mit.' },
      { autor: 'David', hoursAgo: 1, text: 'Hermes und Max kommen auch. Treffpunkt wieder am Parkplatz?' }
    ]
  },
  {
    autor: 'Familie Brunner',
    hoursAgo: 12,
    text: 'Welpenspieltag für Paula und Moritz – alle jungen Hunde willkommen, Hoppel bleibt zu Hause 😉',
    terminDatum: '2026-11-08',
    terminZeit: '10:30',
    replies: [{ autor: 'Lea', hoursAgo: 6, text: 'Kira ist zwar kein Welpe mehr, benimmt sich aber so. Dürfen wir?' }]
  },
  { autor: 'Familie Keller', hoursAgo: 20, text: 'Finn hat eine neue Lieblingswiese entdeckt – hinter dem Bahnhof, perfekt zum Toben.' },
  {
    autor: 'David',
    hoursAgo: 50,
    text: 'Hermes braucht bald die Auffrischimpfung. Kennt jemand eine gute Tierärztin in der Nähe?',
    replies: [{ autor: 'Anna', hoursAgo: 30, text: 'Dr. Aebi in Thun – sehr geduldig mit großen Hunden.' }]
  },
  { autor: 'Jonas', hoursAgo: 120, text: 'Hat jemand noch eine Hundebox in Größe L übrig? Paula ist aus ihrer rausgewachsen.' },
  { autor: 'Anna', hoursAgo: 900, text: 'Sommerfest war großartig – danke an alle fürs Mitbringen!', terminDatum: '2026-08-15', terminZeit: '16:00' }
]

module.exports = { FAMILY_NAME, DOGS, HOUSEMATES, TIMELINE, BREEDING, NOTES }
