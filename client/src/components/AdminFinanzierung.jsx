import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import AdminFinanzierungHinweis from './AdminFinanzierungHinweis.jsx'
import AdminFinanzierungQuartale from './AdminFinanzierungQuartale.jsx'
import AdminFinanzierungKosten from './AdminFinanzierungKosten.jsx'
import { Button } from './ui/index.js'

// Phase F: Reiter „Finanzierung“ im Admin (GET /api/admin/finanzierung, server/routes/adminFinanzierung.js) - was die
// öffentliche Seite „So finanzieren wir uns“ (/finanzierung) zeigt: oben der Spenden-Hinweis und das aktuelle Ziel
// (AdminFinanzierungHinweis, mit Vorschau der Karte „Mithelfen“), darunter die Quartale (AdminFinanzierungQuartale, mit
// Vorschau der Balken) und „Kosten & Reserve“ (AdminFinanzierungKosten: laufende Posten, Saldo, Prognose, Rücklage).
// Beträge tippt man in Euro, gespeichert werden Cent. Die Rechnung (Jahreskosten, Saldo, Rücklage, Verteilung) macht der
// Server - nach jeder Änderung an Quartalen oder Posten holt refresh sie neu.
const RECHNUNG_KEYS = ['kosten', 'prognose', 'ruecklage', 'verteilung']
export default function AdminFinanzierung() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    api.admin
      .finanzierung()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const patch = (changes) => setData((current) => ({ ...current, ...changes }))

  // Nur die berechneten Teile übernehmen - Listen und Formulare bleiben, wie sie gerade sind.
  function refresh() {
    api.admin
      .finanzierung()
      .then((fresh) => patch(Object.fromEntries(RECHNUNG_KEYS.filter((key) => fresh && key in fresh).map((key) => [key, fresh[key]]))))
      .catch((err) => setError(err.message))
  }

  return (
    <div className="admin-panel-stack admin-finanzierung">
      <div className="admin-section-head">
        <h2>So finanzieren wir uns</h2>
        <Button to="/finanzierung" as={Link} variant="ghost" target="_blank" rel="noopener noreferrer">
          Seite ansehen
        </Button>
      </div>
      <p className="admin-section-intro muted">
        Die Seite zeigt immer den Grundsatz – Zahlen, Ziel und Spenden-Hinweis nur, wenn du sie hier einträgst. Fremde Werbung,
        Tracking und Datenhandel gibt es nicht; Partner-Angebote bleiben gekennzeichnet.
      </p>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {!data && !error && <p className="muted">Lade …</p>}
      {data && (
        <>
          <AdminFinanzierungHinweis
            hinweis={data.spendenHinweis}
            ziel={data.ziel}
            onHinweisSaved={(spendenHinweis) => patch({ spendenHinweis })}
            onZielSaved={(ziel) => patch({ ziel })}
          />
          <AdminFinanzierungQuartale
            quartale={data.quartale}
            verteilung={data.verteilung}
            onChanged={(quartale) => {
              patch({ quartale })
              refresh()
            }}
          />
          <AdminFinanzierungKosten data={data} onChanged={refresh} />
        </>
      )}
    </div>
  )
}
