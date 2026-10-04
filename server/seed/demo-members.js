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
      // Der zweite Schützling des Demo-Tierheims (nach Nele, seed/demo-household.js): vor gut fünf Monaten aus dem
      // Tierheim Sonnenhang vermittelt. tierheim (lib/demoMembers.js): Übergabe (dog_transfers) und „darf mitlesen“
      // samt Happy-End-Einwilligung (dog_shares mit story_consent), dazu ein Gruß des Tierheims auf eintrag. So zeigt
      // das Tierheim unter „So geht es euren Schützlingen“, wie es Pepper seitdem geht - nie die private Erinnerung.
      // Alle Tage relativ (lib/demoDates.js): nach jedem Auffrischen der Demo ist die Vermittlung gut fünf Monate her.
      {
        key: 'pepper',
        name: 'Pepper',
        rasse: 'Mischling',
        tierart: 'hund',
        geschlecht: 'ruede',
        geburtsdatum: '2022-08-15',
        beiUnsSeitTage: -148,
        herkunftArt: 'tierheim',
        herkunftText: 'Tierheim Sonnenhang',
        foto: 'pepper.jpg',
        beschreibung: 'Aus dem Tierheim Sonnenhang zu uns gekommen. Ein Wasserfreund mit Stock im Maul – wer einen Ball wirft, sieht Pepper erst wieder, wenn der Ball trocken ist.',
        tierheim: {
          storyConsent: true,
          gruss: { autor: 'Team Sonnenhang', text: 'Was für ein Wasserhund! Schön zu sehen, wie gut es Pepper bei euch geht.', hoursAgo: 6 }
        },
        eintrag: {
          relativ: { tage: -76 },
          titel: 'Pepper lernt schwimmen',
          text: 'Erst nur bis zum Bauch, dann ein Stock zu weit draußen – und plötzlich schwimmt er. Die Enten waren wenig begeistert.',
          hoursAgo: 30,
          fotos: ['pepper.jpg']
        },
        // Weitere Erinnerungen: zwei aus der Zeit im Tierheim (herkunftShelter, „aus Tierheim Sonnenhang“ - wie bei Nele),
        // danach drei nicht-private und eine private (die sieht weder die Familie noch das Tierheim).
        chronik: [
          {
            relativ: { tage: -190 },
            autor: 'Team Sonnenhang',
            titel: 'Ankunft im Tierheim',
            text: 'Pepper wurde am Badesee gefunden – nass, hungrig und mit einem Stock im Maul. Niemand hat ihn vermisst gemeldet.',
            kategorie: 'ankunft',
            herkunftShelter: true
          },
          {
            relativ: { tage: -163 },
            autor: 'Team Sonnenhang',
            titel: 'Kennenlernen mit Familie Brandt',
            text: 'Familie Brandt war zum dritten Mal zum Gassigehen da – Pepper wartet schon am Tor, wenn ihr Auto kommt.',
            kategorie: 'gassi',
            herkunftShelter: true
          },
          {
            relativ: { tage: -148 },
            titel: 'Pepper zieht ein',
            text: 'Heute aus dem Tierheim Sonnenhang abgeholt. Die erste Nacht hat er vor der Terrassentür geschlafen – mit Blick auf den Garten.'
          },
          {
            relativ: { tage: -41 },
            titel: 'Impfung und Wurmkur',
            text: 'Alles in Ordnung, nur das Gewicht: zwei Kilo mehr als im Frühjahr. Die Leckerli werden gezählt.',
            privat: true
          },
          {
            relativ: { tage: -12 },
            titel: 'Der Stock muss mit',
            text: 'Ohne Stock geht Pepper nicht aus dem Haus. Heute war es ein halber Ast – er hat ihn trotzdem bis nach Hause getragen.'
          },
          {
            relativ: { tage: -2 },
            titel: 'Fast ein halbes Jahr bei uns',
            text: 'Aus dem schüchternen Fundhund ist unser Wachhund geworden. Er bellt jeden Briefträger an – und wedelt dabei.',
            hoursAgo: 20
          }
        ],
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
