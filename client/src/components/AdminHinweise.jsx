import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import Icon from './Icon.jsx'
import AdminHinweisForm from './AdminHinweisForm.jsx'
import AdminHinweisRow from './AdminHinweisRow.jsx'
import { useToast } from './Toast.jsx'
import { Button } from './ui/index.js'

const NEW = 'neu'
const NEW_BUTTON_ID = 'admin-hinweis-neu'

function editButtonId(id) {
  return `admin-hinweis-bearbeiten-${id}`
}

// Nach dem Schließen eines Formulars zurück zu dem Knopf, der es geöffnet hat (der Fokus landet sonst im Nichts).
function focusAfterClose(editing) {
  const id = editing === NEW ? NEW_BUTTON_ID : editButtonId(editing)
  requestAnimationFrame(() => document.getElementById(id)?.focus())
}

// Reiter "Hinweise" im Admin (Phase N Task 5, server/routes/adminHinweise.js): globale Hinweise für alle Besucher -
// Liste mit Status (geplant, aktiv, abgelaufen, aus), anlegen und bearbeiten mit Vorschau des Bands, ein-/ausschalten,
// löschen. Immer nur ein Formular offen: das neue oben, ein bearbeiteter Hinweis an seiner Stelle in der Liste.
export default function AdminHinweise() {
  const showToast = useToast()
  const [data, setData] = useState(undefined)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)

  const load = useCallback(() => {
    return api.admin
      .hinweise()
      .then((result) => {
        setData(result)
        setError(null)
      })
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function run(action, message) {
    try {
      await action()
      showToast(message)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  function closeForm() {
    focusAfterClose(editing)
    setEditing(null)
  }

  async function handleSaved() {
    const wasNew = editing === NEW
    closeForm()
    showToast(wasNew ? 'Hinweis angelegt' : 'Hinweis gespeichert')
    await load()
  }

  const handleToggle = (hinweis) =>
    run(() => api.admin.updateHinweis(hinweis.id, { aktiv: !hinweis.aktiv }), hinweis.aktiv ? 'Hinweis ausgeschaltet' : 'Hinweis eingeschaltet')
  const handleDelete = (hinweis) => run(() => api.admin.deleteHinweis(hinweis.id), 'Hinweis gelöscht')

  const list = data?.hinweise || []
  const full = data ? list.length >= data.max : false

  return (
    <section className="admin-hinweise card" aria-labelledby="admin-hinweise-title">
      <div className="admin-section-head">
        <div>
          <h2 id="admin-hinweise-title">Hinweise</h2>
          <p className="muted">
            Ein Band oben auf allen Seiten, z. B. vor Wartungsarbeiten. Besucher sehen Änderungen beim nächsten Laden einer
            Seite.
          </p>
        </div>
        <Button
          type="button"
          id={NEW_BUTTON_ID}
          disabled={!data || full || editing !== null}
          aria-describedby={full ? 'admin-hinweise-full' : undefined}
          onClick={() => setEditing(NEW)}
        >
          <Icon name="plus" />
          Neuer Hinweis
        </Button>
      </div>
      {full && (
        <p className="field-hint" id="admin-hinweise-full">
          Höchstens {data.max} Hinweise – bitte zuerst alte löschen.
        </p>
      )}

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {editing === NEW && <AdminHinweisForm onSaved={handleSaved} onCancel={closeForm} />}
      {data === undefined && !error && <p className="muted">Lade …</p>}
      {data && list.length === 0 && editing !== NEW && <p className="empty-state">Noch keine Hinweise.</p>}
      {list.length > 0 && (
        <ul className="admin-hinweis-list">
          {list.map((hinweis) =>
            editing === hinweis.id ? (
              <li key={hinweis.id} className="admin-hinweis is-editing">
                <AdminHinweisForm hinweis={hinweis} onSaved={handleSaved} onCancel={closeForm} />
              </li>
            ) : (
              <AdminHinweisRow
                key={hinweis.id}
                hinweis={hinweis}
                editButtonId={editButtonId(hinweis.id)}
                editDisabled={editing !== null}
                onEdit={() => setEditing(hinweis.id)}
                onToggle={() => handleToggle(hinweis)}
                onDelete={() => handleDelete(hinweis)}
              />
            )
          )}
        </ul>
      )}
    </section>
  )
}
