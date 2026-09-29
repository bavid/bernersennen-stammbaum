import BernerMark from '../components/BernerMark.jsx'

// Berner-Auftritt: Wappen, Dreifarb-Streifen und die Texte, die bestehende Rudel kennen
export default {
  id: 'berner',
  Mark: BernerMark,
  label: 'Berner',
  description: 'Berner-Wappen und Dreifarb-Streifen',
  appName: 'Familienchronik',
  footer: 'Familienchronik · damit wir wissen, wie es den anderen geht',
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
    thisAnimalDat: 'diesem Hund'
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
    feedEmpty: 'Klick einen Hund an und erzähl, was er so treibt'
  }
}
