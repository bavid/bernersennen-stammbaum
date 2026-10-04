import PawMark from '../components/PawMark.jsx'

// „Familie auf Pfoten" – tierneutraler Standard-Auftritt
export default {
  id: 'standard',
  Mark: PawMark,
  label: 'Familie auf Pfoten',
  description: 'Pfoten-Logo, für alle Tierarten',
  appName: 'Familie auf Pfoten',
  footer: 'Familie auf Pfoten · Eine tierisch nette Familie',
  // Phase U: "Nachwuchs" steht nicht in der unteren Leiste, sondern als Abschnitt auf der Familienbande
  littersInNav: false,
  // Phase V3: die Familienbande zeigt zuerst Familien (Zuhause, Familien, befreundete Zuhause) - der Stammbaum mit
  // Generationen ist ein Zusatz, sobald eine Verpaarung oder Eltern eingetragen sind ("Stammbaum öffnen").
  familiesView: true,
  tricolor: false,
  favicon: '/favicon.svg',
  words: {
    group: 'Familie',
    theGroup: 'die Familie',
    TheGroup: 'Die Familie',
    thisGroup: 'diese Familie',
    inGroup: 'in der Familie',
    ofGroup: 'der Familie',
    ofAGroup: 'einer Familie',
    yourGroup: 'eure Familie',
    yourGroupDat: 'eurer Familie',
    ourGroup: 'Unsere Familie',
    ownGroup: 'eine eigene Familie',
    newGroup: 'Neue Familie',
    createGroup: 'Familie anlegen',
    createOwnGroup: 'Eigene Familie anlegen',
    groupName: 'Name der Familie',
    newGroupName: 'Neuer Name',
    groupNamePlaceholder: 'z. B. Familie Sonnenhang',
    groupPassword: 'Familien-Passwort',
    groupSettings: 'Familie einstellen',
    groupsDative: 'Familien',
    // Familienbande 2: Überschrift der Gruppe im Bereichswechsler
    groups: 'Familien',
    noGroupConnected: 'Noch keine Familie verbunden.',
    leaveGroup: 'Familie verlassen',
    dissolveGroup: 'Familie auflösen',
    groupNeverPublic: 'Eine Familie ist nie öffentlich.',
    // Rollen in einer Familie (lib/roles.js roleLabel), aufsteigend nach Rang
    roleGast: 'Gast',
    roleMitglied: 'Mitglied',
    roleStellvertretung: 'Stellvertretung',
    roleLeitung: 'Familienleitung',
    newsTitle: 'Neu in der Familie',
    animal: 'Tier',
    animals: 'Tiere',
    thisAnimalDat: 'diesem Tier',
    // Phase U: "Stammbaum" und "Würfe" klingen nach Zucht - im Standard-Auftritt "Familienbande" und "Nachwuchs"
    treeLabel: 'Familienbande',
    toTree: 'Zur Familienbande',
    inTree: 'in der Familienbande',
    inTreeArticle: 'in der',
    yourTreeAcc: 'eure Familienbande',
    treeEmpty: 'Eure Familienbande ist noch leer',
    treeFit: 'Ganze Familienbande zeigen',
    treeView: 'Ansicht der Familienbande',
    littersLabel: 'Nachwuchs',
    litter: 'Nachwuchs',
    litterBirthday: 'Geburtstag der Geschwister',
    litterMeeting: 'Geschwistertreffen',
    young: 'Nachwuchs',
    youngStage: 'Ganz klein',
    mating: 'Verpaarung',
    matings: 'Verpaarungen',
    matingOf: 'der Verpaarung',
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
    addMating: 'Verpaarung eintragen',
    matingAdded: 'Verpaarung eingetragen',
    breedingBook: 'Verpaarungen'
  },
  texts: {
    loginKicker: 'Eine Familie · viele Zuhause',
    loginHeadline: ['Wie geht’s den anderen', 'Fellnasen?'],
    loginLede:
      'Tiere, die zusammengehören, leben oft in verschiedenen Zuhause. Hier bleibt ihr verbunden: Klickt ein Tier an und schaut nach, was es so treibt.',
    loginFacts: [
      ['Familie', 'wer zu wem gehört'],
      ['Chronik', 'was jedes Tier erlebt'],
      ['Pinnwand', 'Treffen und Notizen für alle']
    ],
    overviewLede:
      'Damit wir wissen, was die anderen treiben: Klick ein Tier an und schau nach, wie es ihm geht – oder erzähl, was es gerade erlebt.',
    // Audit V7a: für alle, die hier nichts eintragen (zu Besuch, Gast in einer Familie) - ohne "oder erzähl …"
    overviewLedeReadOnly: 'Damit wir wissen, was die anderen treiben: Klick ein Tier an und schau nach, wie es ihm geht.',
    feedEmpty: 'Klick ein Tier an und erzähl, was es so treibt',
    littersLede:
      'Geschwister mit gleichen Eltern und gleichem Geburtstag: was sie gerade treiben und wie sie im gleichen Alter aussahen. Entsteht automatisch aus der Familienbande – eintragen muss man nichts.',
    littersEmpty:
      'Noch kein Nachwuchs: Sobald in der Familienbande Geschwister mit gleichen Eltern und gleichem Geburtstag stehen, erscheinen sie hier.',
    littersSingles: 'Diese Tiere haben bisher keine Geschwister in der Familienbande.',
    plannedDue: 'Der Nachwuchs müsste jetzt da sein – Zeit für neue Karten in der Familienbande!',
    breedingIntro: 'Für die, die Nachwuchs planen: Eine Verpaarung erscheint oben als erwarteter Nachwuchs und später bei den Jungtieren.',
    matingNotesPlaceholder: 'Anzahl Jungtiere, Besonderheiten, Ultraschall …',
    loginDemoHint: 'Ohne Anmeldung, schreibgeschützt – mit Beispiel-Tieren, Familien und Erinnerungen.'
  }
}
