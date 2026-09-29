import { useEffect, useState } from 'react'
import { api } from '../api'
import AdminAnfrageCode from './AdminAnfrageCode.jsx'
import { ANFRAGE_TYP, assignableBatches, freeCodes } from '../lib/anfragen.js'

const SELECT_ID = 'admin-anfrage-batch'

function NoBatch({ partner }) {
  return (
    <p className="muted">
      Kein passender Stapel mit freien Codes. Lege unter „Gutscheine“ einen Stapel mit{' '}
      {partner ? 'Partner-Zugängen' : 'Kunden-Gutscheinen'} an.
    </p>
  )
}

// Inhalt des Dialogs "Gutschein zuweisen" (AdminAnfragen): erst einen Stapel wählen - nur eigene Admin-Stapel mit
// passendem Zweck und freien Codes (lib/anfragen.js assignableBatches), mit der Zahl der freien -, dann zeigt
// AdminAnfrageCode den Code einmal. onAssigned(anfrage) meldet die geänderte Anfrage (jetzt erledigt) nach oben;
// der Code bleibt nur hier im State und ist mit dem Schließen des Dialogs (onClose, Modal hängt den Inhalt aus) weg.
export default function AdminAnfrageAssign({ anfrage, onAssigned, onClose }) {
  const [batches, setBatches] = useState(undefined)
  const [batchId, setBatchId] = useState('')
  const [error, setError] = useState(null)
  const [assigning, setAssigning] = useState(false)
  const [code, setCode] = useState(null)
  const partner = anfrage.typ === ANFRAGE_TYP.partner

  useEffect(() => {
    let cancelled = false
    api.admin
      .voucherBatches()
      .then((all) => {
        if (cancelled) return
        const options = assignableBatches(all, anfrage)
        setBatches(options)
        setBatchId(options[0] ? String(options[0].id) : '')
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [anfrage])

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setAssigning(true)
    try {
      const result = await api.admin.assignAnfrageGutschein(anfrage.id, Number(batchId))
      setCode(result.code)
      onAssigned(result.anfrage)
    } catch (err) {
      setError(err.message)
    } finally {
      setAssigning(false)
    }
  }

  if (code) return <AdminAnfrageCode anfrage={anfrage} code={code} onClose={onClose} />

  return (
    <form className="admin-anfrage-assign form-stack" onSubmit={handleSubmit}>
      <p>
        Für <strong>{anfrage.email}</strong>: ein freier {partner ? 'Partner-Zugang' : 'Kunden-Gutschein'} aus einem deiner
        Stapel. Danach ist die Anfrage erledigt.
      </p>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {batches === undefined && !error && <p className="muted">Lade Stapel …</p>}
      {batches && batches.length === 0 && <NoBatch partner={partner} />}
      {batches && batches.length > 0 && (
        <>
          <div className="field">
            <label className="field-label" htmlFor={SELECT_ID}>
              Stapel
            </label>
            <select id={SELECT_ID} value={batchId} onChange={(e) => setBatchId(e.target.value)}>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.label} · frei: {freeCodes(batch)}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={assigning || !batchId}>
            {assigning ? 'Weise zu …' : 'Code zuweisen'}
          </button>
        </>
      )}
    </form>
  )
}
