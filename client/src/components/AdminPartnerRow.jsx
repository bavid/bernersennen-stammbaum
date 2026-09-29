import { useState } from 'react'
import Icon from './Icon.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import AdminPartnerArea from './AdminPartnerArea.jsx'
import AdminPartnerLock from './AdminPartnerLock.jsx'
import AdminPartnerEinblicke from './AdminPartnerEinblicke.jsx'
import { AdminViewLink } from './AdminFamilyList.jsx'
import { STATUS_LABELS } from '../lib/adminPartnerForm.js'
import { TYPE_LABELS } from '../lib/partnerTypes.js'

// Ein Partner in der Admin-Liste: Status-Chip (und "Gesperrt"), Typ, Aktionen (Bearbeiten, Portal
// ansehen, Pausieren/Aktivieren, Löschen nur im Entwurf, Sperren/Entsperren, Einblicke aufklappen, mit
// Bereich "Als Admin ansehen" - Phase 5 Task 5b) und darunter die Verwaltung seines Bereichs. Solange
// gesperrt, lässt er sich nicht aktivieren (der Server würde ihn ohnehin pausiert lassen) - erst entsperren.
export default function AdminPartnerRow({ partner, onEdit, onToggleStatus, onDelete, onKeyIssued, onChanged }) {
  const [showEinblicke, setShowEinblicke] = useState(false)
  const einblickeId = `admin-partner-einblicke-${partner.id}`
  const locked = Boolean(partner.gesperrt)

  return (
    <li className={`admin-partner-row${locked ? ' is-locked' : ''}`}>
      <span className="admin-partner-row-main">
        <strong>{partner.name}</strong>
        <span className={`pill admin-partner-status-${partner.status}`}>{STATUS_LABELS[partner.status] || partner.status}</span>
        {locked && (
          <span className="pill admin-partner-locked">
            <Icon name="lock" />
            Gesperrt
          </span>
        )}
        <span className="muted">{TYPE_LABELS[partner.typ] || partner.typ}</span>
      </span>
      <span className="admin-partner-row-actions">
        <button type="button" className="btn btn-ghost" onClick={() => onEdit(partner)}>
          Bearbeiten
        </button>
        <a className="btn btn-ghost" href={`/p/${partner.slug}`} target="_blank" rel="noopener noreferrer">
          Portal ansehen
        </a>
        {partner.area_family_id && <AdminViewLink familyId={partner.area_family_id} />}
        <button
          type="button"
          className="btn btn-ghost"
          disabled={locked && partner.status !== 'aktiv'}
          title={locked && partner.status !== 'aktiv' ? 'Erst entsperren' : undefined}
          onClick={() => onToggleStatus(partner)}
        >
          {partner.status === 'aktiv' ? 'Pausieren' : 'Aktivieren'}
        </button>
        {partner.status === 'entwurf' && (
          <ConfirmButton className="admin-partner-delete" onConfirm={() => onDelete(partner)} label="Löschen" confirmLabel="Wirklich löschen?" />
        )}
        <AdminPartnerLock partner={partner} onChanged={onChanged} />
        <button type="button" className="btn btn-ghost" aria-expanded={showEinblicke} aria-controls={einblickeId} onClick={() => setShowEinblicke((open) => !open)}>
          <Icon name="image" />
          Einblicke
        </button>
      </span>
      <AdminPartnerArea partner={partner} onKeyIssued={onKeyIssued} onChanged={onChanged} />
      {showEinblicke && <AdminPartnerEinblicke partnerId={partner.id} id={einblickeId} />}
    </li>
  )
}
