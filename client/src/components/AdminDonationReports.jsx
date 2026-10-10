import { useEffect, useState } from 'react'
import { api } from '../api'
import Icon from './Icon.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import AdminDonationReportForm from './AdminDonationReportForm.jsx'
import { AMOUNT_FIELDS } from '../lib/adminMarketing.js'
import { formatEuroCents } from '../lib/discover.js'
import { isExternalUrl } from '../lib/format.js'
import { Button } from './ui/index.js'

// Ein Bericht in der Liste - Beträge kommen als Cent und werden als Euro (de-DE) gezeigt.
function ReportRow({ report, onEdit, onDelete }) {
  return (
    <li className="admin-report-row">
      <div className="admin-entry-main">
        <span className="admin-entry-title">
          <strong>{report.zeitraum}</strong>
          {Boolean(report.is_demo) && <span className="pill">Demo</span>}
        </span>
        <dl className="admin-entry-meta">
          {AMOUNT_FIELDS.map((field) => (
            <div key={field.key}>
              <dt>{field.label}</dt>
              <dd className="admin-amount">{formatEuroCents(report[field.rowKey]) ?? '–'}</dd>
            </div>
          ))}
          {report.empfaenger && (
            <div>
              <dt>Empfänger</dt>
              <dd>{report.empfaenger}</dd>
            </div>
          )}
          {isExternalUrl(report.nachweis_url) && (
            <div>
              <dt>Nachweis</dt>
              <dd>
                <a href={report.nachweis_url} target="_blank" rel="noopener noreferrer">
                  ansehen<span className="visually-hidden"> (öffnet in neuem Tab)</span>
                </a>
              </dd>
            </div>
          )}
        </dl>
      </div>
      <span className="admin-row-actions">
        <Button type="button" variant="ghost" onClick={() => onEdit(report)}>
          Bearbeiten
        </Button>
        <ConfirmButton onConfirm={() => onDelete(report)} label="Löschen" confirmLabel="Wirklich löschen?" ariaLabel={`Bericht ${report.zeitraum} löschen`} />
      </span>
    </li>
  )
}

// Transparenzberichte für "Unterstützen" (Phase 3 Task 5): Liste, Anlegen, Bearbeiten, Löschen. Der
// Reiter "Entdecken" zeigt davon den neuesten (server/routes/discover.js).
export default function AdminDonationReports() {
  const [reports, setReports] = useState(undefined)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null) // null, 'new' oder eine Zeile

  function load() {
    api.admin
      .donationReports()
      .then(setReports)
      .catch((err) => setError(err.message))
  }

  useEffect(load, [])

  async function handleDelete(report) {
    setError(null)
    try {
      await api.admin.deleteDonationReport(report.id)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  function handleSaved() {
    setEditing(null)
    setError(null)
    load()
  }

  return (
    <div className="admin-support-block">
      <div className="admin-section-head">
        <h3>Spendenberichte</h3>
        {!editing && (
          <Button type="button" onClick={() => setEditing('new')}>
            <Icon name="plus" /> Bericht anlegen
          </Button>
        )}
      </div>

      {error && !editing && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {editing && <AdminDonationReportForm report={editing === 'new' ? null : editing} onSaved={handleSaved} onCancel={() => setEditing(null)} />}

      {!editing && reports === undefined && !error && <p className="muted">Lade …</p>}
      {!editing && reports && reports.length === 0 && <p className="muted">Noch keine Spendenberichte angelegt.</p>}
      {!editing && reports && reports.length > 0 && (
        <ul className="admin-report-list">
          {reports.map((report) => (
            <ReportRow key={report.id} report={report} onEdit={setEditing} onDelete={handleDelete} />
          ))}
        </ul>
      )}
    </div>
  )
}
