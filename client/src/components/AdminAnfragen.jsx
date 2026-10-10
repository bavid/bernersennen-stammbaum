import { useEffect, useState } from 'react'
import { api } from '../api'
import Modal from './Modal.jsx'
import AdminAnfrageRow from './AdminAnfrageRow.jsx'
import AdminAnfrageAssign from './AdminAnfrageAssign.jsx'
import { ANFRAGE_STATUS, ANFRAGE_TYP } from '../lib/anfragen.js'
import { Button } from './ui/index.js'

const FILTERS = [
  [ANFRAGE_STATUS.offen, 'Offen'],
  [ANFRAGE_STATUS.erledigt, 'Erledigt'],
  [ANFRAGE_STATUS.abgelehnt, 'Abgelehnt']
]
const EMPTY_TEXT = {
  [ANFRAGE_STATUS.offen]: 'Keine offenen Anfragen.',
  [ANFRAGE_STATUS.erledigt]: 'Keine erledigten Anfragen.',
  [ANFRAGE_STATUS.abgelehnt]: 'Keine abgelehnten Anfragen.'
}

function Pager({ page, onPage }) {
  if (!page || page.seiten <= 1) return null
  return (
    <nav className="admin-anfragen-pager" aria-label="Seiten der Anfragen">
      <Button type="button" variant="ghost" disabled={page.seite <= 1} onClick={() => onPage(page.seite - 1)}>
        Zurück
      </Button>
      <span className="muted">
        Seite {page.seite} von {page.seiten}
      </span>
      <Button type="button" variant="ghost" disabled={page.seite >= page.seiten} onClick={() => onPage(page.seite + 1)}>
        Weiter
      </Button>
    </nav>
  )
}

// "Anfragen" im Admin (Phase N, server/routes/adminAnfragen.js): Gutschein- und Partner-Anfragen, je Status gefiltert
// und seitenweise (100 je Seite, "Zurück/Weiter"). Die Zähler an den Filtern kommen aus gesamt; "Offen" wird immer
// mitgeführt (auch in den anderen Filtern) und über onCountChange nach oben gemeldet (Zähler am Reiter "Anfragen"). Nach
// jeder Änderung lädt die Seite neu - die Anfrage wandert dabei womöglich in einen anderen Filter.
export default function AdminAnfragen({ onCountChange }) {
  const [status, setStatus] = useState(ANFRAGE_STATUS.offen)
  const [seite, setSeite] = useState(1)
  const [page, setPage] = useState(undefined)
  const [counts, setCounts] = useState({})
  const [error, setError] = useState(null)
  const [version, setVersion] = useState(0)
  const [assigning, setAssigning] = useState(null)

  useEffect(() => {
    let cancelled = false
    api.admin
      .anfragen({ status, seite })
      .then((result) => {
        if (cancelled) return
        // Hinter der letzten Seite (z. B. nach dem Löschen der letzten Anfrage einer Seite): zur letzten zurück.
        if (result.anfragen.length === 0 && seite > 1) return setSeite(Math.min(seite - 1, result.seiten))
        setPage(result)
        setCounts((current) => ({ ...current, [status]: result.gesamt }))
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [status, seite, version])

  // Der Zähler "Offen" gilt auch in den anderen Filtern - dafür eine eigene Abfrage (nur gesamt zählt). Scheitert
  // sie, fehlt nur die Zahl; den Fehler zeigt schon die Liste selbst.
  useEffect(() => {
    if (status === ANFRAGE_STATUS.offen) return undefined
    let cancelled = false
    api.admin
      .anfragen({ status: ANFRAGE_STATUS.offen })
      .then((result) => {
        if (!cancelled) setCounts((current) => ({ ...current, [ANFRAGE_STATUS.offen]: result.gesamt }))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [status, version])

  useEffect(() => {
    if (counts.offen !== undefined) onCountChange?.(counts.offen)
  }, [counts.offen, onCountChange])

  // Neu laden; Zähler anderer Filter sind danach womöglich veraltet und bleiben weg, bis man sie wieder öffnet.
  function refresh() {
    setError(null)
    setCounts((current) => ({ [ANFRAGE_STATUS.offen]: current.offen, [status]: current[status] }))
    setVersion((current) => current + 1)
  }

  function chooseStatus(next) {
    if (next === status) return
    setStatus(next)
    setSeite(1)
    setPage(undefined)
    setError(null)
  }

  async function run(action) {
    try {
      await action()
      refresh()
      return true
    } catch (err) {
      setError(err.message)
      return false
    }
  }

  const handleStatus = (anfrage, next) => run(() => api.admin.updateAnfrage(anfrage.id, { status: next }))
  const handleNotiz = (anfrage, notiz) => run(() => api.admin.updateAnfrage(anfrage.id, { notiz }))
  const handleDelete = (anfrage) => run(() => api.admin.deleteAnfrage(anfrage.id))
  const handleConfirm = (anfrage, index, notiz) => run(() => api.admin.confirmAnfrageTermin(anfrage.id, { index, notiz }))

  return (
    <section className="admin-anfragen card" aria-labelledby="admin-anfragen-title">
      <div className="admin-section-head">
        <h2 id="admin-anfragen-title">Anfragen</h2>
        <div className="segmented segmented-sm" role="group" aria-label="Status">
          {FILTERS.map(([key, label]) => (
            <button type="button" key={key} aria-pressed={status === key} onClick={() => chooseStatus(key)}>
              {counts[key] !== undefined ? `${label} (${counts[key]})` : label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {page === undefined && !error && <p className="muted">Lade …</p>}
      {page && page.anfragen.length === 0 && <p className="muted">{EMPTY_TEXT[status]}</p>}
      {page && page.anfragen.length > 0 && (
        <ul className="admin-anfragen-list">
          {page.anfragen.map((anfrage) => (
            <AdminAnfrageRow
              key={anfrage.id}
              anfrage={anfrage}
              onAssign={() => setAssigning(anfrage)}
              onStatus={(next) => handleStatus(anfrage, next)}
              onNotiz={(notiz) => handleNotiz(anfrage, notiz)}
              onDelete={() => handleDelete(anfrage)}
              onConfirm={(index, notiz) => handleConfirm(anfrage, index, notiz)}
            />
          ))}
        </ul>
      )}
      <Pager page={page} onPage={setSeite} />

      <Modal
        open={assigning !== null}
        title={assigning?.typ === ANFRAGE_TYP.partner ? 'Partner-Zugang zuweisen' : 'Einladungscode zuweisen'}
        onClose={() => setAssigning(null)}
      >
        {assigning && <AdminAnfrageAssign anfrage={assigning} onAssigned={refresh} onClose={() => setAssigning(null)} />}
      </Modal>
    </section>
  )
}
