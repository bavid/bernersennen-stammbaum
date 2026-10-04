import BernerMark from '../components/BernerMark.jsx'

// Berner-Auftritt: Wappen, Dreifarb-Streifen und die Texte, die bestehende Rudel kennen
export default {
  id: 'berner',
  Mark: BernerMark,
  label: 'Berner',
  description: 'Berner-Wappen und Dreifarb-Streifen',
  appName: 'Familienchronik',
  footer: 'Familienchronik · damit wir wissen, wie es den anderen geht',
  // Phase U: "Würfe" bleibt ein eigener Reiter in der unteren Leiste
  littersInNav: true,
  // Phase V3: die Familienbande ist hier direkt der Stammbaum (wie bisher)
  familiesView: false,
  tricolor: true,
  favicon: '/favicon-berner.svg',
  words: {
    group: 'Rudel',
    theGroup: 'das Rudel',
    TheGroup: 'Das Rudel',
    thisGroup: 'dieses Rudel',
    inGroup: 'im Rudel',
    ofGroup: 'des Rudels',
    ofAGroup: 'eines Rudels',
    yourGroup: 'euer Rudel',
    yourGroupDat: 'eurem Rudel',
    ourGroup: 'Unser Rudel',
    ownGroup: 'ein eigenes Rudel',
    newGroup: 'Neues Rudel',
    createGroup: 'Rudel anlegen',
    createOwnGroup: 'Eigenes Rudel anlegen',
    groupName: 'Name des Rudels',
    newGroupName: 'Neuer Rudelname',
    groupNamePlaceholder: 'z. B. Rudel vom Sonnenhang',
    groupPassword: 'Rudel-Passwort',
    groupSettings: 'Rudel einstellen',
    groupsDative: 'Rudeln',
    // Familienbande 2: Überschrift der Gruppe im Bereichswechsler
    groups: 'Rudel',
    noGroupConnected: 'Noch kein Rudel verbunden.',
    leaveGroup: 'Rudel verlassen',
    dissolveGroup: 'Rudel auflösen',
    groupNeverPublic: 'Ein Rudel ist nie öffentlich.',
    // Rollen in einem Rudel (lib/roles.js roleLabel), aufsteigend nach Rang
    roleGast: 'Gast',
    roleMitglied: 'Mitglied',
    roleStellvertretung: 'Stellvertretung',
    roleLeitung: 'Rudelführer',
    newsTitle: 'Neu im Rudel',
    animal: 'Hund',
    animals: 'Hunde',
    thisAnimalDat: 'diesem Hund',
    // Phase U: der Berner-Auftritt behält "Stammbaum", "Würfe" und "Deckakt"
    treeLabel: 'Stammbaum',
    toTree: 'Zum Stammbaum',
    inTree: 'im Stammbaum',
    inTreeArticle: 'im',
    yourTreeAcc: 'euren Stammbaum',
    treeEmpty: 'Euer Stammbaum ist noch leer',
    treeFit: 'Ganzen Stammbaum zeigen',
    treeView: 'Stammbaum-Ansicht',
    littersLabel: 'Würfe',
    litter: 'Wurf',
    litterBirthday: 'Wurf-Geburtstag',
    litterMeeting: 'Wurftreffen',
    young: 'Welpen',
    youngStage: 'Als Welpen',
    mating: 'Deckakt',
    matings: 'Deckakte',
    matingOf: 'des Deckakts',
    // Phase W, Schritt 2 (Betreiber, Richtung „Familienalbum“): Chronik-Einträge heißen „Erinnerung“, Kommentare
    // „Grüße“ - an EINER Stelle, damit ein späterer Wechsel nur diese Wörter ändert. Ganze Sätze (entriesEmpty,
    // greetingsEmpty), wo das Geschlecht des Nomens mitspielt.
    entry: 'Erinnerung',
    entries: 'Erinnerungen',
    entriesDat: 'Erinnerungen',
    newEntry: 'Neue Erinnerung',
    tellAction: 'Erinnerung festhalten',
    tellActionShort: 'Festhalten',
    entriesEmpty: 'Noch keine Erinnerungen – haltet die erste fest.',
    greeting: 'Gruß',
    greetings: 'Grüße',
    greetingAction: 'Gruß schreiben',
    greetingsEmpty: 'Noch keine Grüße',
    addMating: 'Deckakt eintragen',
    matingAdded: 'Deckakt eingetragen',
    breedingBook: 'Zuchtbuch'
  },
  texts: {
    loginKicker: 'Eine Familie · viele Zuhause',
    loginHeadline: ['Wie geht’s', 'den anderen?'],
    loginLede:
      'Geschwister, Eltern und Großeltern leben in verschiedenen Familien. Hier bleibt ihr verbunden: Klickt einen Hund an und schaut nach, was er so treibt.',
    loginFacts: [
      ['Stammbaum', 'wer mit wem verwandt ist'],
      ['Chronik', 'was jeder Hund erlebt'],
      ['Pinnwand', 'Treffen und Notizen für alle']
    ],
    overviewLede:
      'Damit wir wissen, was die anderen treiben: Klick einen Hund an und schau nach, wie es ihm geht – oder erzähl, was er gerade erlebt.',
    // Audit V7a: für alle, die hier nichts eintragen (zu Besuch, Gast im Rudel) - ohne "oder erzähl …"
    overviewLedeReadOnly: 'Damit wir wissen, was die anderen treiben: Klick einen Hund an und schau nach, wie es ihm geht.',
    feedEmpty: 'Klick einen Hund an und erzähl, was er so treibt',
    littersLede:
      'Jeder Wurf mit allen Geschwistern: was sie gerade treiben und wie sie im gleichen Alter aussahen. Entsteht automatisch aus dem Stammbaum – eintragen muss man nichts.',
    littersEmpty:
      'Noch keine Würfe: Sobald im Stammbaum Geschwister mit gleichen Eltern und gleichem Geburtstag stehen, erscheinen sie hier.',
    littersSingles: 'Von diesen Würfen steht bisher nur ein Tier im Stammbaum.',
    plannedDue: 'Die Welpen müssten jetzt da sein – Zeit für neue Karten im Stammbaum!',
    breedingIntro: 'Für die, die züchten: Ein Deckakt erscheint oben als erwarteter Wurf und später bei seinen Welpen.',
    matingNotesPlaceholder: 'Anzahl Welpen, Besonderheiten, Ultraschall …',
    loginDemoHint: 'Ohne Anmeldung, schreibgeschützt – mit Beispiel-Tieren über mehrere Generationen.'
  }
}
