import { useState } from 'react'
import Icon from './Icon.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import AdminPartnerArea from './AdminPartnerArea.jsx'
import AdminPartnerLock from './AdminPartnerLock.jsx'
import AdminPartnerTrust from './AdminPartnerTrust.jsx'
import AdminPartnerUeberall from './AdminPartnerUeberall.jsx'
import AdminPartnerBanner from './AdminPartnerBanner.jsx'
import AdminPartnerEinblicke from './AdminPartnerEinblicke.jsx'
import AdminPartnerTermine from './AdminPartnerTermine.jsx'
import { AdminViewLink } from './AdminFamilyList.jsx'
import { STATUS_LABELS } from '../lib/adminPartnerForm.js'
import { TYPE_LABELS } from '../lib/partnerTypes.js'

// Ein Partner in der Admin-Liste: Status-Chip (und "Gesperrt"), Typ, Aktionen (Bearbeiten, Portal
// ansehen, Pausieren/Aktivieren, Löschen nur im Entwurf, Sperren/Entsperren, "Fotos" aufklappen - Bannerfotos (Audit V7a)
// und Einblicke -, mit
// Bereich "Als Admin ansehen" - Phase 5 Task 5b, Termine aufklappen - Phase V4a), der Schalter "Vertrauenswürdig"
// (V-Fehler 3) und darunter die
// Verwaltung seines Bereichs. Solange gesperrt, lässt er sich nicht aktivieren (der Server würde ihn ohnehin
// pausiert lassen) - erst entsperren.
export default function AdminPartnerRow({ partner, onEdit, onToggleStatus, onDelete, onKeyIssued, onChanged }) {
  const [showEinblicke, setShowEinblicke] = useState(false)
  const [showTermine, setShowTermine] = useState(false)
  const einblickeId = `admin-partner-einblicke-${partner.id}`
  const termineId = `admin-partner-termine-${partner.id}`
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
        {/* Phase V4b: ob der Partner Telegram-Hinweise verbunden hat - nie die Chat-ID. */}
        <span className="muted admin-partner-telegram">Telegram verbunden: {partner.telegram_verbunden ? 'ja' : 'nein'}</span>
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
          Fotos
        </button>
        <button type="button" className="btn btn-ghost" aria-expanded={showTermine} aria-controls={termineId} onClick={() => setShowTermine((open) => !open)}>
          <Icon name="calendar" />
          Termine
        </button>
      </span>
      <AdminPartnerTrust partner={partner} onChanged={onChanged} />
      {/* Phase F: „Überall sichtbar“ - nur sichtbar, wenn der Partner es eingeschaltet hat; der Admin kann es ausschalten. */}
      <AdminPartnerUeberall partner={partner} onChanged={onChanged} />
      <AdminPartnerArea partner={partner} onKeyIssued={onKeyIssued} onChanged={onChanged} />
      {showEinblicke && (
        <div className="admin-partner-photos" id={einblickeId}>
          <AdminPartnerBanner partnerId={partner.id} />
          <AdminPartnerEinblicke partnerId={partner.id} />
        </div>
      )}
      {showTermine && <AdminPartnerTermine partnerId={partner.id} id={termineId} />}
    </li>
  )
}
