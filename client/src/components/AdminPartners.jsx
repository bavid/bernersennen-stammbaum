import { useEffect, useState } from 'react'
import { api } from '../api'
import Icon from './Icon.jsx'
import Modal from './Modal.jsx'
import KeyReveal from './KeyReveal.jsx'
import AdminPartnerForm from './AdminPartnerForm.jsx'
import AdminPartnerRow from './AdminPartnerRow.jsx'
import { rowPayload } from '../lib/adminPartnerForm.js'

// Admin-Partnerpflege (Task 7): Liste mit Status-Chips + Aktionen, Formular zum Anlegen/Bearbeiten.
// onChange (optional): AdminPage hält daneben eine eigene, schlanke Partnerliste für die
// "Für Partner"-Auswahl in AdminVouchers - onChange hält sie nach jeder Änderung hier synchron.
export default function AdminPartners({ onChange }) {
  const [partners, setPartners] = useState(undefined)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null) // null: keine Liste ausgeblendet; 'new' oder eine Partner-Zeile

  // Frisch erzeugter/erneuerter Zugangsschlüssel eines Bereichs (AdminPartnerArea) - einmalig über
  // KeyReveal gezeigt, bis der Admin ihn gesichert hat.
  const [revealed, setRevealed] = useState(null)

  function load() {
    api.admin
      .partners()
      .then((data) => {
        setPartners(data)
        onChange?.(data)
      })
      .catch((err) => setError(err.message))
  }

  useEffect(load, [])

  async function handleToggleStatus(partner) {
    setError(null)
    const status = partner.status === 'aktiv' ? 'pausiert' : 'aktiv'
    try {
      // PUT /api/admin/partners/:id validiert den vollen Datensatz (lib/partners.js validatePartner,
      // z. B. ist der Name Pflicht) - ein Payload mit nur { status } scheitert deshalb mit 400. Also den
      // kompletten, aus der Server-Zeile abgeleiteten Formular-Stand senden, nur status überschrieben.
      await api.admin.updatePartner(partner.id, rowPayload(partner, { status }))
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(partner) {
    setError(null)
    try {
      await api.admin.deletePartner(partner.id)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  function handleSaved() {
    setEditing(null)
    load()
  }

  function handleKeyIssued(key, partner) {
    setRevealed({ key, partnerName: partner.name })
  }

  return (
    <section className="admin-partners card" aria-labelledby="admin-partners-title">
      <div className="admin-partners-head">
        <h2 id="admin-partners-title">Partner</h2>
        {!editing && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            <Icon name="plus" /> Partner anlegen
          </button>
        )}
      </div>

      {error && !editing && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {editing && (
        <AdminPartnerForm partner={editing === 'new' ? null : editing} onSaved={handleSaved} onCancel={() => setEditing(null)} />
      )}

      {!editing && partners === undefined && !error && <p className="muted">Lade …</p>}
      {!editing && partners && partners.length === 0 && <p className="muted">Noch keine Partner angelegt.</p>}
      {!editing && partners && partners.length > 0 && (
        <ul className="admin-partner-list">
          {partners.map((partner) => (
            <AdminPartnerRow
              key={partner.id}
              partner={partner}
              onEdit={setEditing}
              onToggleStatus={handleToggleStatus}
              onDelete={handleDelete}
              onKeyIssued={handleKeyIssued}
              onChanged={load}
            />
          ))}
        </ul>
      )}

      <Modal open={Boolean(revealed)} title={revealed ? `Zugang für ${revealed.partnerName}` : ''} onClose={() => setRevealed(null)}>
        {revealed && (
          <KeyReveal
            value={revealed.key}
            showCardHint={false}
            note="Diesen Schlüssel dem Partner geben – damit meldet sich das Team an. Weitere Zugänge legt es selbst unter „Zugang“ an."
            continueLabel="Fertig"
            onContinue={() => setRevealed(null)}
          />
        )}
      </Modal>
    </section>
  )
}
