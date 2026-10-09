import { useState } from 'react'
import { api } from '../api'
import ConfirmButton from './ConfirmButton.jsx'
import AdminKostenForm from './AdminKostenForm.jsx'
import FinanzierungRegel from './finanzierung/FinanzierungRegel.jsx'
import { formatEuroCents } from '../lib/discover.js'
import { adminSaldoText, postenText, prognoseText } from '../lib/finanzierungRuecklage.js'

// „Kosten & Reserve“ im Reiter „Finanzierung“: die laufenden Kosten als Posten (POST/PUT/DELETE
// /api/admin/finanzierung/kosten), darüber die Rechnung des Servers (GET /api/admin/finanzierung: kosten.proJahrCents,
// prognose, ruecklage) - Kosten pro Jahr hochgerechnet, Spenden bisher, Saldo (rot im Minus) und die Prognose bis
// Jahresende; darunter die Spendenrechnung mit der Rücklage „Server-Zukunft“ (FinanzierungRegel, wie auf der Seite).
// onChanged(): nach jeder Änderung - AdminFinanzierung holt die neue Rechnung vom Server.

function datum(iso) {
  if (!iso) return ''
  const [jahr, monat, tag] = iso.split('-')
  return `${tag}.${monat}.${jahr}`
}

function Zusammenfassung({ kosten, prognose }) {
  const minus = prognose.saldoCents < 0
  return (
    <>
      <dl className="admin-kosten-summary">
        <div>
          <dt>Kosten pro Jahr (hochgerechnet)</dt>
          <dd>{formatEuroCents(kosten.proJahrCents)}</dd>
        </div>
        <div>
          <dt>Spenden bisher</dt>
          <dd>{formatEuroCents(prognose.spendenBisherCents)}</dd>
        </div>
        <div className={minus ? 'is-minus' : undefined}>
          <dt>Saldo (Spenden − Kosten bisher)</dt>
          <dd>
            {formatEuroCents(prognose.saldoCents)}
            <span className="admin-kosten-saldo-text">{adminSaldoText(prognose.saldoCents)}</span>
          </dd>
        </div>
      </dl>
      <p className={`admin-kosten-prognose${prognose.prognoseJahresendeCents < 0 ? ' is-minus' : ''}`}>{prognoseText(prognose.prognoseJahresendeCents)}</p>
    </>
  )
}

function PostenRow({ posten, formOpen, onEdit, onDelete }) {
  return (
    <li className="admin-quartal-row">
      <span className="admin-quartal-main">
        <strong>{postenText(posten)}</strong>
        <span className="muted">
          seit {datum(posten.ab)}
          {posten.bis && <> · bis {datum(posten.bis)}</>}
          {posten.notiz && <> · {posten.notiz}</>}
        </span>
      </span>
      <span className="admin-quartal-actions">
        <button type="button" className="btn btn-ghost" disabled={formOpen} onClick={() => onEdit(posten)}>
          Bearbeiten
          <span className="visually-hidden">: {posten.titel}</span>
        </button>
        <ConfirmButton onConfirm={() => onDelete(posten)} disabled={formOpen} ariaLabel={`${posten.titel} löschen`} />
      </span>
    </li>
  )
}

export default function AdminFinanzierungKosten({ data, onChanged }) {
  const [editing, setEditing] = useState(null) // null = zu, 'neu' = neuer Posten, sonst der Posten
  const [error, setError] = useState(null)
  const posten = data.kosten?.posten || []

  async function handleSave(payload) {
    if (editing === 'neu') await api.admin.createFinanzierungKosten(payload)
    else await api.admin.updateFinanzierungKosten(editing.id, payload)
    setEditing(null)
    onChanged()
  }

  async function handleDelete(item) {
    setError(null)
    try {
      await api.admin.deleteFinanzierungKosten(item.id)
      onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="card admin-finanz-card" aria-labelledby="admin-finanz-kosten-title">
      <div className="admin-section-head">
        <h2 id="admin-finanz-kosten-title">Kosten &amp; Reserve</h2>
        {editing === null && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing('neu')}>
            Posten eintragen
          </button>
        )}
      </div>
      <p className="admin-section-intro muted">
        Laufende Kosten wie Server oder Domain trägst du einmal als Posten ein – einmalige Kosten weiter je Quartal. Daraus rechnet die Seite
        Jahreskosten, Saldo und die Rücklage „Server-Zukunft“.
      </p>
      {data.kosten && data.prognose && <Zusammenfassung kosten={data.kosten} prognose={data.prognose} />}
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {editing !== null && (
        <AdminKostenForm key={editing === 'neu' ? 'neu' : editing.id} posten={editing === 'neu' ? null : editing} onSave={handleSave} onCancel={() => setEditing(null)} />
      )}
      {posten.length > 0 ? (
        <ul className="admin-quartal-list" aria-label="Laufende Kosten">
          {posten.map((item) => (
            <PostenRow key={item.id} posten={item} formOpen={editing !== null} onEdit={setEditing} onDelete={handleDelete} />
          ))}
        </ul>
      ) : (
        <p className="muted">Noch keine laufenden Kosten eingetragen.</p>
      )}
      <figure className="admin-finanz-preview admin-finanz-preview-wide">
        <figcaption className="field-hint">Vorschau – so erklärt die Seite die Spendenrechnung.</figcaption>
        <FinanzierungRegel ruecklage={data.ruecklage || null} />
      </figure>
    </section>
  )
}
