// Bereiche eines Haushalts: das eigene "Zuhause" (art: 'zuhause') und die Familien/Rudel, denen es beitritt.

// Startseite je aktivem Bereich: Zuhause -> Wegbegleiter, Familie/Rudel -> Stammbaum.
// Gilt auch für klassische Rudel-Logins (kein home.art === 'zuhause'), die landen wie bisher am Stammbaum.
export function startRoute(family) {
  return family?.art === 'zuhause' ? '/wegbegleiter' : '/stammbaum'
}

// Fester Anzeigename für den privaten Bereich eines Haushalts im Bereichswechsler, unabhängig vom
// gespeicherten Namen (den ein Haushalt z. B. in Tests oder künftig beim Umbenennen tragen kann).
export const HOME_LABEL = 'Meine Chronik'

// Ist ein Tier im aktiven Bereich bearbeitbar? Die Listen-Endpunkte liefern can_edit (1/0) für jedes
// Tier – eigene und hierher geteilte gemischt. can_edit fehlt in manchen Listen (z. B. der eigenen
// Chronik, die ohnehin nur eigene Tiere zurückgibt) – dann gilt es als bearbeitbar (Rückwärtskompatibilität
// mit Altdaten/Listen ohne das Feld). Geteilte Tiere anderer Bereiche dürfen nicht als Schreibziel
// (Mitbewohner, Eltern, Zuchtpartner …) angeboten werden, auch wenn sie hier sichtbar sind.
export function isEditable(dog) {
  return dog.can_edit === undefined || Boolean(dog.can_edit)
}
