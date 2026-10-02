// Kurzzeile der Ortswahl (LocationPicker collapsible, Phase V1): Entdecken, /partner und /umgebung öffnen mit Inhalt,
// oben steht nur, was gerade gilt - "In der Nähe von 20095 Hamburg", "In der Nähe eures Standorts" oder "Überall" -
// und daneben "ändern" bzw. "Ort wählen". applied: { plz?, ort?, radius?, standort? } aus der letzten erfolgreichen
// Suche. null: es gibt nichts zusammenzufassen (z. B. /umgebung ohne Suche) - dann bleibt die Eingabe offen.
export function locationSummary(applied, { allowEverywhere = false } = {}) {
  const radius = Number.isFinite(applied?.radius) ? applied.radius : null
  if (applied?.plz) {
    return { text: `In der Nähe von ${[applied.plz, applied.ort].filter(Boolean).join(' ')}`, radius, action: 'ändern' }
  }
  if (applied?.standort) return { text: 'In der Nähe eures Standorts', radius, action: 'ändern' }
  if (allowEverywhere) return { text: 'Überall', radius: null, action: 'Ort wählen' }
  return null
}
