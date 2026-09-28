// Bereiche eines Haushalts: das eigene "Zuhause" (art: 'zuhause') und die Familien/Rudel, denen es beitritt.

// Startseite je aktivem Bereich: Zuhause -> Wegbegleiter, Familie/Rudel -> Stammbaum.
// Gilt auch für klassische Rudel-Logins (kein home.art === 'zuhause'), die landen wie bisher am Stammbaum.
export function startRoute(family) {
  return family?.art === 'zuhause' ? '/wegbegleiter' : '/stammbaum'
}

// Fester Anzeigename für den privaten Bereich eines Haushalts im Bereichswechsler, unabhängig vom
// gespeicherten Namen (den ein Haushalt z. B. in Tests oder künftig beim Umbenennen tragen kann).
export const HOME_LABEL = 'Meine Chronik'
