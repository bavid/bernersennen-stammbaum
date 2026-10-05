import { useState } from 'react'
import { api } from '../api'
import ConfirmButton from './ConfirmButton.jsx'
import AdminQuartalForm from './AdminQuartalForm.jsx'
import FinanzierungQuartale from './finanzierung/FinanzierungQuartale.jsx'
import { formatEuroCents } from '../lib/discover.js'
import { quartalLabel } from '../lib/finanzierung.js'

// Phase F: die Quartale im Reiter „Finanzierung“ - Liste mit Bearbeiten/Löschen, ein Formular zum Eintragen oder Ändern
// (AdminQuartalForm) und darunter die Vorschau der Balken, genau wie auf der Seite (FinanzierungQuartale). Löschen ist
// zweistufig (ConfirmButton). onChanged bekommt die neue Liste (neueste zuerst, wie der Server sortiert).
function sortQuartale(quartale) {
  return quartale.slice().sort((a, b) => b.jahr - a.jahr || b.quartal - a.quartal)
}

function QuartalRow({ quartal, onEdit, onDelete }) {
  return (
    <li className="admin-quartal-row">
      <span className="admin-quartal-main">
        <strong>{quartalLabel(quartal.jahr, quartal.quartal)}</strong>
        <span className="muted">
          Einnahmen {formatEuroCents(quartal.einnahmenSpendenCents + quartal.einnahmenPartnerCents)} · Kosten {formatEuroCents(quartal.kostenCents)} ·
          weitergegeben {formatEuroCents(quartal.spendenWeitergegebenCents)}
        </span>
      </span>
      <span className="admin-quartal-actions">
        <button type="button" className="btn btn-ghost" onClick={() => onEdit(quartal)}>
          Bearbeiten
          <span className="visually-hidden">: {quartalLabel(quartal.jahr, quartal.quartal)}</span>
        </button>
        <ConfirmButton onConfirm={() => onDelete(quartal)} ariaLabel={`${quartalLabel(quartal.jahr, quartal.quartal)} löschen`} />
      </span>
    </li>
  )
}

export default function AdminFinanzierungQuartale({ quartale, onChanged }) {
  const [editing, setEditing] = useState(null) // null = zu, 'neu' = neues Quartal, sonst die Zeile
  const [error, setError] = useState(null)

  async function handleSave(payload) {
    const saved = editing === 'neu' ? await api.admin.createFinanzierungQuartal(payload) : await api.admin.updateFinanzierungQuartal(editing.id, payload)
    onChanged(sortQuartale([...quartale.filter((q) => q.id !== saved.id), saved]))
    setEditing(null)
  }

  async function handleDelete(quartal) {
    setError(null)
    try {
      await api.admin.deleteFinanzierungQuartal(quartal.id)
      onChanged(quartale.filter((q) => q.id !== quartal.id))
      if (editing?.id === quartal.id) setEditing(null)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="card admin-finanz-card" aria-labelledby="admin-finanz-quartale-title">
      <div className="admin-section-head">
        <h2 id="admin-finanz-quartale-title">Zahlen je Quartal</h2>
        {editing === null && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing('neu')}>
            Quartal eintragen
          </button>
        )}
      </div>
      <p className="admin-section-intro muted">
        Einnahmen aus Spenden und von Partnern, Kosten des Betriebs und weitergegebene Spenden – je Quartal in Euro. Veröffentlicht wird genau,
        was hier steht.
      </p>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {editing !== null && <AdminQuartalForm quartal={editing === 'neu' ? null : editing} onSave={handleSave} onCancel={() => setEditing(null)} />}
      {quartale.length > 0 ? (
        <ul className="admin-quartal-list">
          {quartale.map((quartal) => (
            <QuartalRow key={quartal.id} quartal={quartal} onEdit={setEditing} onDelete={handleDelete} />
          ))}
        </ul>
      ) : (
        <p className="muted">Noch kein Quartal eingetragen – die Seite zeigt dann: „Die ersten Zahlen veröffentlichen wir nach dem ersten Quartal.“</p>
      )}
      <figure className="admin-finanz-preview admin-finanz-preview-wide">
        <figcaption className="field-hint">Vorschau – so stehen die Zahlen auf der Seite.</figcaption>
        <FinanzierungQuartale quartale={quartale} />
      </figure>
    </section>
  )
}
