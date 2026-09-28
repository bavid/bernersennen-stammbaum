import PawMark from '../components/PawMark.jsx'

// „Familie auf Pfoten" – tierneutraler Standard-Auftritt
export default {
  id: 'standard',
  Mark: PawMark,
  label: 'Familie auf Pfoten',
  description: 'Pfoten-Logo, für alle Tierarten',
  appName: 'Familie auf Pfoten',
  footer: 'Familie auf Pfoten · Eine tierisch nette Familie',
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
    newsTitle: 'Neu in der Familie',
    animal: 'Tier',
    animals: 'Tiere',
    thisAnimalDat: 'diesem Tier'
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
    feedEmpty: 'Klick ein Tier an und erzähl, was es so treibt'
  }
}
