import { mundpropagandaText, plural } from '../lib/adminStats.js'

// Mundpropaganda in der Übersicht: Zahl der Ketten (Bereiche, die Gutscheine weitergaben, aus denen neue
// Bereiche entstanden) und ihre größte Tiefe, darunter die Wurzeln mit den meisten Nachkommen als eingerückte
// Liste. Nur Bereichsnamen, nie Personen.
export default function AdminStatsMundpropaganda({ mundpropaganda }) {
  const { ketten = 0, top = [] } = mundpropaganda ?? {}

  return (
    <>
      <p className="stat-lead">{mundpropagandaText(mundpropaganda)}</p>
      {ketten > 0 && top.length > 0 && (
        <ol className="stat-chains">
          {top.map((kette) => (
            <li key={kette.startFamilyId}>
              <span className="stat-chains-name">{kette.name}</span>
              <span className="muted"> · {plural(kette.nachkommen, 'Nachkomme', 'Nachkommen')}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  )
}
