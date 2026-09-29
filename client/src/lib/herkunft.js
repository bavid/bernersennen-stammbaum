// Herkunft eines Bereichs in der Rudel-Liste des Admins (Phase 5 Task 3, AdminFamilyList) - der Server
// liefert in GET /api/admin/overview je Bereich herkunft (server/lib/herkunft.js):
//   'partner:<Name>' | 'weitergabe:<Bereichsname>' | 'stapel:<Label>' | 'altbestand'
// Daraus wird ein Chip mit Text und Variante. Ohne herkunft (älterer Server, unbekannte Form) bleibt der
// Freitext quelle; bei 'altbestand' wandert ein vorhandener Freitext als Hinweis in den Chip. Ohne beides null.

const ARTEN = {
  partner: (name) => `über Partner ${name}`,
  weitergabe: (name) => `weitergegeben von ${name}`,
  stapel: (name) => `Stapel ${name}`
}

const clean = (value) => (typeof value === 'string' ? value.trim() : '')

export function parseHerkunft(herkunft, quelle) {
  const text = clean(herkunft)
  const freitext = clean(quelle)

  if (text === 'altbestand') {
    return freitext ? { variant: 'altbestand', label: 'Altbestand', hint: freitext } : { variant: 'altbestand', label: 'Altbestand' }
  }

  const separator = text.indexOf(':')
  if (separator > 0) {
    const art = text.slice(0, separator)
    const name = clean(text.slice(separator + 1))
    if (ARTEN[art] && name) return { variant: art, label: ARTEN[art](name) }
  }

  return freitext ? { variant: 'quelle', label: `über: ${freitext}` } : null
}
