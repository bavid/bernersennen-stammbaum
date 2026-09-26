// Demo-Rudel für Tests und Vorführungen. Bilder liegen in ./images.
// Hunde referenzieren Eltern über ihren `key`; Timeline-Einträge sind absichtlich
// nicht chronologisch sortiert, damit die automatische Einordnung sichtbar wird.

const FAMILY_NAME = 'Rudel vom Sonnenhang'

const DOGS = [
  {
    key: 'aiko',
    name: 'Aiko vom Sonnenhang',
    geschlecht: 'ruede',
    geburtsdatum: '2014-05-12',
    farbe: 'Klassisch dreifarbig, symmetrische Blesse',
    foto: 'aiko.jpg',
    beschreibung:
      'Der Stammvater unseres Rudels. Ruhig, gutmütig und der geduldigste Kinderhüter, den man sich wünschen kann. Liebt lange Runden durchs Emmental und schläft am liebsten quer im Flur.',
    fatherFreitext: 'Bruno vom Gurnigel'
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
    name: 'Gustav vom Sonnenhang',
    geschlecht: 'ruede',
    geburtsdatum: '2020-11-03',
    farbe: 'Dreifarbig, kräftige rote Abzeichen',
    foto: 'gustav.jpg',
    beschreibung: 'Dantes Sohn und ein richtiger Brummbär. Begleitet uns auf jeder Alpwanderung.',
    father: 'dante',
    motherFreitext: 'Luna von der Aare'
  },
  {
    key: 'hermes',
    name: 'Hermes vom Sonnenhang',
    geschlecht: 'ruede',
    geburtsdatum: '2023-02-14',
    farbe: 'Dreifarbig, breite Blesse',
    foto: 'hermes.jpg',
    beschreibung: 'Unser Jüngster. Frech, tollpatschig und überzeugt, dass das Sofa ihm gehört.',
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
  }
]

const TIMELINE = [
  { dog: 'aiko', datum: '2024-05-12', autor: 'Anna', titel: '10. Geburtstag', text: 'Zehn Jahre alt! Es gab Rinderherz und einen neuen Ball, den er sofort vergraben hat.' },
  { dog: 'aiko', datum: '2014-07-20', autor: 'David', titel: 'Einzug bei uns', text: 'Aiko ist eingezogen. Die erste Nacht hat er komplett verschlafen – im Schuhregal.' },
  { dog: 'aiko', datum: '2019-09-01', autor: 'David', titel: 'Wanderung zum Niesen', text: 'Sechs Stunden unterwegs und am Ende noch der Fitteste von uns allen.', fotos: ['wanderung.jpg'] },
  { dog: 'aiko', datum: '2016-02-10', autor: 'Anna', titel: 'Erster richtiger Schnee', text: 'Er hat eine halbe Stunde lang Schneeflocken gefangen.', fotos: ['schnee.jpg'] },
  { dog: 'bella', datum: '2017-06-18', autor: 'Anna', titel: 'Sechs Welpen!', text: 'Drei Rüden, drei Hündinnen. Mutter und Welpen sind wohlauf.', fotos: ['welpen.jpg'] },
  { dog: 'bella', datum: '2015-05-10', autor: 'David', titel: 'Ankunft aus dem Emmental', text: 'Abgeholt beim Züchter, zwei Stunden Autofahrt auf dem Schoß.' },
  { dog: 'bella', datum: '2016-08-14', autor: 'Anna', titel: 'Ausstellung in Bern', text: 'Formwert „Vorzüglich“ und eine Rosette für die Wand.', fotos: ['ausstellung.jpg'] },
  { dog: 'cora', datum: '2020-04-09', autor: 'Anna', titel: 'Cora ist Mama', text: 'Fünf gesunde Welpen, darunter Emma und Finn.' },
  { dog: 'cora', datum: '2018-07-02', autor: 'David', titel: 'Erstes Mal schwimmen', text: 'Vom Steg gesprungen, als hätte sie nie etwas anderes gemacht.', fotos: ['see.jpg'] },
  { dog: 'cora', datum: '2017-08-20', autor: 'Anna', titel: 'Die Geschwister ziehen aus', text: 'Cora bleibt bei uns, Dante auch – die anderen vier haben tolle Familien gefunden.' },
  { dog: 'dante', datum: '2019-05-05', autor: 'David', titel: 'HD/ED-Auswertung', text: 'Beide Ergebnisse frei. Große Erleichterung!' },
  { dog: 'dante', datum: '2018-10-12', autor: 'Anna', titel: 'Begleithundeprüfung bestanden' },
  { dog: 'emma', datum: '2021-01-10', autor: 'Anna', titel: 'Schneetag im Garten', fotos: ['schnee.jpg'] },
  { dog: 'emma', datum: '2023-02-14', autor: 'Anna', titel: 'Emmas erster Wurf', text: 'Vier Welpen am Valentinstag – Hermes und Ida bleiben bei uns.', fotos: ['welpen.jpg'] },
  { dog: 'emma', datum: '2020-06-05', autor: 'David', titel: 'Einzug ins große Körbchen' },
  { dog: 'finn', datum: '2022-01-22', autor: 'Familie Keller', titel: 'Grüße vom Thunersee', text: 'Finn lässt ausrichten: Schnee ist das Beste.', fotos: ['schnee.jpg'] },
  { dog: 'gustav', datum: '2022-07-30', autor: 'David', titel: 'Alpwanderung Gantrisch', fotos: ['wanderung.jpg'] },
  { dog: 'hermes', datum: '2024-03-03', autor: 'Anna', titel: 'Welpenschule bestanden', text: 'Sitz und Platz klappen. Bleib… arbeiten wir noch dran.' },
  { dog: 'hermes', datum: '2023-04-15', autor: 'David', titel: 'Erster Ausflug an den See', fotos: ['see.jpg'] },
  { dog: 'hermes', datum: '2023-12-24', autor: 'Anna', titel: 'Erstes Weihnachten', text: 'Hat das Geschenkpapier mehr geliebt als die Geschenke.' },
  { dog: 'ida', datum: '2024-05-20', autor: 'Anna', titel: 'Ida entdeckt die Tulpen', text: 'Das Beet ist jetzt ein Hundebett.' }
]

const BREEDING = [
  { mutter: 'bella', vater: 'aiko', datum: '2017-04-16', wurfInfo: '6 Welpen (3 Rüden, 3 Hündinnen), geboren am 18.06.2017.', fotos: ['welpen.jpg'] },
  { mutter: 'cora', vaterFreitext: 'Balu vom Schwarzwaldhof', datum: '2020-02-06', wurfInfo: '5 Welpen, geboren am 09.04.2020. Emma bleibt bei uns.' },
  { mutter: 'emma', vaterFreitext: 'Oskar vom Thunersee', datum: '2022-12-13', wurfInfo: '4 Welpen, geboren am 14.02.2023.' }
]

// hoursAgo steuert, wann der Zettel "geschrieben" wurde (für die Reihenfolge auf der Pinnwand)
const NOTES = [
  { autor: 'Anna', hoursAgo: 3, text: 'Geschwistertreffen am Thunersee! Wer bringt den großen Wassernapf mit?', terminDatum: '2026-10-18', terminZeit: '14:00' },
  { autor: 'Familie Keller', hoursAgo: 20, text: 'Finn hat eine neue Lieblingswiese entdeckt – hinter dem Bahnhof, perfekt zum Toben.' },
  { autor: 'David', hoursAgo: 50, text: 'Hermes braucht bald die Auffrischimpfung. Kennt jemand eine gute Tierärztin in der Nähe?' },
  { autor: 'Anna', hoursAgo: 900, text: 'Sommerfest war großartig – danke an alle fürs Mitbringen!', terminDatum: '2026-08-15', terminZeit: '16:00' }
]

module.exports = { FAMILY_NAME, DOGS, TIMELINE, BREEDING, NOTES }
