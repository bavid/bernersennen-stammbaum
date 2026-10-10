import { useState } from 'react'
import { api } from '../api'
import AdminField, { fieldProps } from './AdminField.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import useSpendenForm from '../hooks/useSpendenForm.js'
import { formatEuroCents } from '../lib/discover.js'
import { KATEGORIEN, kategorieLabel, vorleistungForm, vorleistungPayload, vorleistungText } from '../lib/spendenLive.js'
import { Button } from './ui/index.js'

const ID = 'admin-vorleistung-'
const id = (key) => `${ID}${key}`

// „Anschub“ im Reiter „Finanzierung“: einmalige Kosten, die du privat vorgestreckt hast (z. B. Druck & Material) -
// POST/PUT/DELETE /api/admin/finanzierung/vorleistungen. Spenden decken zuerst die laufenden Kosten, dann den Anschub,
// erst danach gibt es einen Überschuss (server/lib/finanzierungVerteilung.js). data: GET /api/admin/finanzierung
// (vorleistungen, vorleistung); onChanged(): danach holt AdminFinanzierung die neue Rechnung.

function VorleistungForm({ vorleistung, onSave, onCancel }) {
  const { form, errors, error, saving, update, handleSubmit, formRef, bannerRef } = useSpendenForm(vorleistungForm(vorleistung), vorleistungPayload, onSave)
  const bind = (key) => fieldProps(id(key), { error: errors[key] })
  const title = vorleistung ? 'Anschub ändern' : 'Anschub eintragen'
  return (
    <form ref={formRef} className="form-stack admin-quartal-form" onSubmit={handleSubmit} noValidate aria-label={title}>
      <h3>{title}</h3>
      {error && (
        <div ref={bannerRef} className="error-banner" role="alert" tabIndex={-1}>
          {error}
        </div>
      )}
      <div className="form-grid">
        <AdminField id={id('titel')} label="Titel" error={errors.titel}>
          <input {...bind('titel')} value={form.titel} maxLength={80} onChange={(e) => update('titel', e.target.value)} />
        </AdminField>
        <AdminField id={id('kategorie')} label="Kategorie" error={errors.kategorie}>
          <select {...bind('kategorie')} value={form.kategorie} onChange={(e) => update('kategorie', e.target.value)}>
            {KATEGORIEN.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </AdminField>
        <AdminField id={id('betrag')} label="Betrag in Euro" error={errors.betrag}>
          <input {...bind('betrag')} inputMode="decimal" placeholder="0,00" value={form.betrag} onChange={(e) => update('betrag', e.target.value)} />
        </AdminField>
        <AdminField id={id('datum')} label="Datum" error={errors.datum}>
          <input {...bind('datum')} type="date" value={form.datum} onChange={(e) => update('datum', e.target.value)} />
        </AdminField>
        <AdminField id={id('notiz')} label="Notiz (optional, nur hier im Admin)" error={errors.notiz} className="span-2">
          <input {...bind('notiz')} value={form.notiz} maxLength={200} onChange={(e) => update('notiz', e.target.value)} />
        </AdminField>
      </div>
      <div className="form-actions">
        <Button type="submit" disabled={saving}>
          {saving ? 'Speichere …' : 'Speichern'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </form>
  )
}

export default function AdminVorleistung({ data, onChanged }) {
  const [editing, setEditing] = useState(null) // null = zu, 'neu' = neu, sonst die Vorleistung
  const [error, setError] = useState(null)
  const liste = data.vorleistungen || []

  async function handleSave(payload) {
    if (editing === 'neu') await api.admin.createVorleistung(payload)
    else await api.admin.updateVorleistung(editing.id, payload)
    setEditing(null)
    onChanged()
  }

  async function handleDelete(item) {
    setError(null)
    try {
      await api.admin.deleteVorleistung(item.id)
      onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="card admin-finanz-card" aria-labelledby="admin-vorleistung-title">
      <div className="admin-section-head">
        <h2 id="admin-vorleistung-title">Anschub (Vorleistung)</h2>
        {editing === null && (
          <Button type="button" onClick={() => setEditing('neu')}>
            Anschub eintragen
          </Button>
        )}
      </div>
      <p className="admin-section-intro muted">
        Was du für den Start vorgestreckt hast, z. B. Druck &amp; Material. Spenden decken zuerst die laufenden Kosten, dann den Anschub – erst
        danach gibt es einen Überschuss für Rücklage und Weitergabe. Öffentlich steht nur Kategorie, Betrag und wie viel schon gedeckt ist.
      </p>
      {data.vorleistung?.gesamtCents > 0 && <p className="admin-kosten-prognose">{vorleistungText(data.vorleistung)}</p>}
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {editing !== null && (
        <VorleistungForm key={editing === 'neu' ? 'neu' : editing.id} vorleistung={editing === 'neu' ? null : editing} onSave={handleSave} onCancel={() => setEditing(null)} />
      )}
      {liste.length > 0 ? (
        <ul className="admin-quartal-list" aria-label="Anschub">
          {liste.map((item) => (
            <li key={item.id} className="admin-quartal-row">
              <span className="admin-quartal-main">
                <strong>
                  {item.titel}: {formatEuroCents(item.betragCents)}
                </strong>
                <span className="muted">
                  {kategorieLabel(item.kategorie, true)} · {item.datum.split('-').reverse().join('.')}
                  {item.notiz && <> · {item.notiz}</>}
                </span>
              </span>
              <span className="admin-quartal-actions">
                <Button type="button" variant="ghost" disabled={editing !== null} onClick={() => setEditing(item)}>
                  Bearbeiten
                  <span className="visually-hidden">: {item.titel}</span>
                </Button>
                <ConfirmButton onConfirm={() => handleDelete(item)} disabled={editing !== null} ariaLabel={`${item.titel} löschen`} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Noch kein Anschub eingetragen.</p>
      )}
    </section>
  )
}
