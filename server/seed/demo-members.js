// Phase R Task 3: weitere Demo-Haushalte in der Demo-Familie, damit dort alle vier Rollen besetzt sind -
// "Zuhause am Deich" (seed/demo-household.js) ist die Leitung, hier kommen Stellvertretung, Mitglied und Gast
// dazu. Stellvertretung und Mitglied teilen je ein Tier in die Familie, der Gast keins (er darf nur ansehen
// und kommentieren - und tut genau das einmal). Rein fiktive Namen; jedes geteilte Tier hat ein eigenes Foto
// aus ./images (ein Bild, das in der Familie schon ein anderes Tier zeigt, sähe dort wie ein Duplikat aus,
// siehe seed/demo-household.js zu Nele/Mira).
// Mitgliedschaft, Freigaben, Kommentar und die offene Einladung legt lib/demoMembers.js an (kennt die Ids).
// Jede neue Rollen-Funktion gehört auch hierher, damit die Demo alles zeigt.

const MEMBERS = [
  {
    key: 'moewenweg',
    name: 'Zuhause Möwenweg (Demo)',
    rolle: 'stellvertretung',
    seitTagen: 300,
    autor: 'Familie Jansen',
    tiere: [
      {
        key: 'wilma',
        name: 'Wilma',
        rasse: 'Berner Sennenhund',
        tierart: 'hund',
        geschlecht: 'huendin',
        geburtsdatum: '2020-05-04',
        beiUnsSeit: '2020-07-10',
        herkunftArt: 'zuechter',
        foto: 'wilma.jpg',
        beschreibung: 'Liebt Schnee mehr als jedes Leckerli. Im Sommer der Schatten unter der Bank, im Winter die Erste im Garten.',
        eintrag: {
          datum: '2026-01-12',
          titel: 'Wilma im ersten Schnee',
          text: 'Kaum lag der erste Schnee, war Wilma nicht mehr zu halten – eine halbe Stunde Flocken fangen, dann selig im Flur.',
          hoursAgo: 60
        },
        teilen: true
      },
      // Phase W, Schritt 3 („Ein Start für alles“): ein Tier, das NICHT in die Familie geteilt ist - seine Erinnerung sieht
      // „Zuhause am Deich“ nur als Gast (seed/demo-visits.js), darum steht sie auf Start mit „Zu Besuch: Zuhause Möwenweg“.
      // relativ (statt datum): vorgestern, wie lib/demoPack.js - so steht sie nach jedem Auffrischen oben im Album.
      {
        key: 'socke',
        name: 'Socke',
        rasse: 'Europäisch Kurzhaar',
        tierart: 'katze',
        geschlecht: 'ruede',
        geburtsdatum: '2023-05-02',
        beiUnsSeit: '2023-07-15',
        herkunftArt: 'privat',
        herkunftText: 'Aus der Nachbarschaft',
        beschreibung: 'Schläft am liebsten auf Wilma. Wilma lässt ihn.',
        eintrag: {
          relativ: { tage: -2 },
          titel: 'Socke erobert den Kratzbaum',
          text: 'Drei Anläufe, ein empörtes Maunzen – und jetzt thront Socke ganz oben und schaut auf Wilma hinunter.',
          hoursAgo: 4
        }
      }
    ]
  },
  {
    key: 'lindenhof',
    name: 'Zuhause Lindenhof (Demo)',
    rolle: 'mitglied',
    seitTagen: 120,
    autor: 'Familie Brandt',
    tiere: [
      {
        key: 'pepper',
        name: 'Pepper',
        rasse: 'Mischling',
        tierart: 'hund',
        geschlecht: 'ruede',
        geburtsdatum: '2022-08-15',
        beiUnsSeit: '2023-02-01',
        herkunftArt: 'privat',
        herkunftText: 'Von Freunden übernommen',
        foto: 'pepper.jpg',
        beschreibung: 'Ein Wasserfreund mit Stock im Maul. Wer einen Ball wirft, sieht Pepper erst wieder, wenn der Ball trocken ist.',
        eintrag: {
          datum: '2026-07-20',
          titel: 'Pepper lernt schwimmen',
          text: 'Erst nur bis zum Bauch, dann ein Stock zu weit draußen – und plötzlich schwimmt er. Die Enten waren wenig begeistert.',
          hoursAgo: 30
        },
        teilen: true
      }
    ]
  },
  {
    key: 'heidekamp',
    name: 'Zuhause Heidekamp (Demo)',
    rolle: 'gast',
    seitTagen: 10,
    autor: 'Familie Voss',
    tiere: [],
    // Kommentar in der Familie auf den Eintrag eines geteilten Tiers - das darf ein Gast
    kommentare: [{ tier: 'wilma', text: 'Was für ein Schneehase! Liebe Grüße vom Heidekamp.', hoursAgo: 5 }]
  }
]

// Kommentar der Leitung "Zuhause am Deich" (seed/demo-household.js, Persona "Familie Nissen") in der Familie auf
// den Eintrag eines geteilten Tiers - für die Demo-Besucherin ein Kommentar mit vonMir: true.
const LEITUNG_COMMENT = { tier: 'wilma', autor: 'Familie Nissen', text: 'Willkommen im Schnee-Club, Wilma! Nele lässt grüßen.', hoursAgo: 3 }

// Eine offene Einladung der Demo-Familie mit Rolle - nur zum Anschauen auf der Mitglieder-Seite, nie einlösbar
// (lib/vouchers.js DEMO_BATCH_KIND).
const INVITE = { rolle: 'gast' }

module.exports = { MEMBERS, LEITUNG_COMMENT, INVITE }
