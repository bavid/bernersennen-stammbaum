import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import ConfirmButton from './ConfirmButton.jsx'
import AdminSpendeForm from './AdminSpendeForm.jsx'
import { formatEuroCents } from '../lib/discover.js'
import { quelleLabel } from '../lib/spendenLive.js'
import { Button, Chip } from './ui/index.js'

// „Spenden erfassen“ (Reiter „Werbung & Messen“ › „Spenden“): eingegangene Spenden eintragen, sobald sie ankommen
// (GET/POST/PUT/DELETE /api/admin/spenden, server/routes/adminSpenden.js). Oben das schnelle Formular, darunter die Liste
// (neueste zuerst) mit Bearbeiten und Löschen. Jede Änderung erscheint sofort im Block „Spenden live“ auf /finanzierung.
// Demo-Spenden (is_demo) stehen gekennzeichnet in der Liste - sie zählen nie in echte Summen.

function datum(iso) {
  const [jahr, monat, tag] = iso.split('-')
  return `${tag}.${monat}.${jahr}`
}

function SpendeRow({ spende, formOpen, onEdit, onDelete }) {
  const name = spende.anzeigename || 'Anonym'
  return (
    <li className="admin-quartal-row">
      <span className="admin-quartal-main">
        <strong>
          {formatEuroCents(spende.betragCents)} · {name}
        </strong>
        <span className="muted">
          {datum(spende.datum)} · {quelleLabel(spende.quelle)}
          {!spende.oeffentlich && ' · nicht öffentlich'}
          {spende.nachricht && <> · „{spende.nachricht}“</>}
        </span>
      </span>
      <span className="admin-quartal-actions">
        {spende.isDemo && <Chip tone="neu">Demo</Chip>}
        <Button type="button" variant="ghost" disabled={formOpen} onClick={() => onEdit(spende)}>
          Bearbeiten
          <span className="visually-hidden">: Spende vom {datum(spende.datum)}</span>
        </Button>
        <ConfirmButton onConfirm={() => onDelete(spende)} disabled={formOpen} ariaLabel={`Spende vom ${datum(spende.datum)} löschen`} />
      </span>
    </li>
  )
}

export default function AdminSpenden() {
  const [spenden, setSpenden] = useState(null)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState('')

  function load() {
    return Promise.resolve()
      .then(() => api.admin.spenden())
      .then((result) => setSpenden(result.spenden))
      .catch((err) => setError(err.message))
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCreate(payload) {
    await api.admin.createSpende(payload)
    setSaved(`${formatEuroCents(payload.betragCents)} erfasst.`)
    await load()
  }

  async function handleUpdate(payload) {
    await api.admin.updateSpende(editing.id, payload)
    setEditing(null)
    setSaved('Gespeichert.')
    await load()
  }

  async function handleDelete(spende) {
    setError(null)
    try {
      await api.admin.deleteSpende(spende.id)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="card admin-finanz-card admin-spenden" aria-labelledby="admin-spenden-title">
      <div className="admin-section-head">
        <h2 id="admin-spenden-title">Spenden erfassen</h2>
        <Button to="/finanzierung" as={Link} variant="ghost" target="_blank" rel="noopener noreferrer">
          „Spenden live“ ansehen
        </Button>
      </div>
      <p className="admin-section-intro muted">
        Trag jede Spende ein, sobald sie ankommt – die Seite „So finanzieren wir uns“ zeigt sie sofort. Für Quartale mit erfassten Spenden zählt
        deren Summe statt des Handwerts.
      </p>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {editing ? (
        <AdminSpendeForm key={editing.id} spende={editing} onSave={handleUpdate} onCancel={() => setEditing(null)} />
      ) : (
        <AdminSpendeForm onSave={handleCreate} />
      )}
      <p className="field-hint field-hint-success" role="status">
        {saved}
      </p>
      {spenden === null && !error && <p className="muted">Lade …</p>}
      {spenden?.length === 0 && <p className="muted">Noch keine Spenden erfasst.</p>}
      {spenden?.length > 0 && (
        <ul className="admin-quartal-list" aria-label="Erfasste Spenden">
          {spenden.map((spende) => (
            <SpendeRow key={spende.id} spende={spende} formOpen={editing !== null} onEdit={setEditing} onDelete={handleDelete} />
          ))}
        </ul>
      )}
    </section>
  )
}
