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
    feedEmpty: 'Klick einen Hund an und erzähl, was er so treibt',
    littersLede:
      'Jeder Wurf mit allen Geschwistern: was sie gerade treiben und wie sie im gleichen Alter aussahen. Entsteht automatisch aus dem Stammbaum – eintragen muss man nichts.',
    littersEmpty:
      'Noch keine Würfe: Sobald im Stammbaum Geschwister mit gleichen Eltern und gleichem Geburtstag stehen, erscheinen sie hier.',
    littersSingles: 'Von diesen Würfen steht bisher nur ein Tier im Stammbaum.',
    plannedDue: 'Die Welpen müssten jetzt da sein – Zeit für neue Karten im Stammbaum!',
    breedingIntro: 'Für die, die züchten: Ein Deckakt erscheint oben als erwarteter Wurf und später bei seinen Welpen.',
    matingNotesPlaceholder: 'Anzahl Welpen, Besonderheiten, Ultraschall …'
  }
}
