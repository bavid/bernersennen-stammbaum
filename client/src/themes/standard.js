import PawMark from '../components/PawMark.jsx'
import { getLang } from '../lib/i18n/index.js'
import { textsEn, wordsEn } from './standard.en.js'

// „Familie auf Pfoten" – der eine Auftritt für alle (B+ Familienalbum, 04.10.: der Berner-Auftritt ist entfernt). Die Wörter
// stehen weiter an EINER Stelle (useTheme().words), damit ein späterer Wechsel nur sie ändert.
const theme = {
  id: 'standard',
  Mark: PawMark,
  appName: 'Familie auf Pfoten',
  footer: 'Familie auf Pfoten · Eine tierisch nette Familie',
  wordsDe: {
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
    groupSettings: 'Familie verwalten',
    groupsDative: 'Familien',
    // Familienbande 2: Überschrift der Gruppe im Bereichswechsler
    groups: 'Familien',
    noGroupConnected: 'Noch keine Familie verbunden.',
    leaveGroup: 'Familie verlassen',
    dissolveGroup: 'Familie auflösen',
    // Phase W, Schritt 2: „… sieht die ganze Familie“ (Freigaben) und „Mitglieder dieser Familie“
    wholeGroup: 'die ganze Familie',
    ofThisGroup: 'dieser Familie',
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
    // Phase U: "Würfe" klingt nach Zucht - hier "Nachwuchs". Audit W: der Baum heißt wie der Reiter in „Tiere“
    // (components/animals/AnimalsTabs.jsx) „Stammbaum“ - nicht mehr „Familienbande“.
    treeLabel: 'Stammbaum',
    toTree: 'Zu den Tieren',
    inTree: 'im Stammbaum',
    inTreeArticle: 'im',
    yourTreeAcc: 'euren Stammbaum',
    treeEmpty: 'Euer Stammbaum ist noch leer',
    treeFit: 'Ganzen Stammbaum zeigen',
    treeView: 'Ansicht des Stammbaums',
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
  textsDe: {
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
      'Geschwister mit gleichen Eltern und gleichem Geburtstag: was sie gerade treiben und wie sie im gleichen Alter aussahen. Entsteht automatisch aus dem Stammbaum – eintragen muss man nichts.',
    littersEmpty:
      'Noch kein Nachwuchs: Sobald im Stammbaum Geschwister mit gleichen Eltern und gleichem Geburtstag stehen, erscheinen sie hier.',
    littersSingles: 'Diese Tiere haben bisher keine Geschwister im Stammbaum.',
    plannedDue: 'Der Nachwuchs müsste jetzt da sein – Zeit für neue Karten im Stammbaum!',
    breedingIntro: 'Für die, die Nachwuchs planen: Eine Verpaarung erscheint oben als erwarteter Nachwuchs und später bei den Jungtieren.',
    matingNotesPlaceholder: 'Anzahl Jungtiere, Besonderheiten, Ultraschall …',
    loginDemoHint: 'Ohne Anmeldung, schreibgeschützt – mit Beispiel-Tieren, Familien und Erinnerungen.'
  }
}

// words/texts folgen der gewählten Sprache; fehlt ein englischer Schlüssel, gilt der deutsche.
Object.defineProperty(theme, 'words', {
  enumerable: true,
  get() {
    return getLang() === 'en' ? { ...theme.wordsDe, ...wordsEn } : theme.wordsDe
  }
})
Object.defineProperty(theme, 'texts', {
  enumerable: true,
  get() {
    return getLang() === 'en' ? { ...theme.textsDe, ...textsEn } : theme.textsDe
  }
})

export default theme
