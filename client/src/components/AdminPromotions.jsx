import { useEffect, useState } from 'react'
import { api } from '../api'
import Icon from './Icon.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import AdminPromotionForm from './AdminPromotionForm.jsx'
import FreigabeChip from './FreigabeChip.jsx'
import { BEREICH_LABELS, formatZeitraum } from '../lib/adminMarketing.js'
import { isAnzeige, kennzeichnungLabel } from '../lib/discover.js'

function clickCount(value) {
  return Number.isInteger(value) ? value : 0
}

// Eine Empfehlung/Anzeige in der Liste: Titel mit derselben Kennzeichnung wie im Reiter "Entdecken"
// (PromotionCard) und der Freigabe (Phase P2), darunter Bereich, aktiv, Zeitraum und die anonymen Klicks
// (server/routes/adminMarketing.js clicks7 = letzte 7 Tage inkl. heute, clicksTotal = gesamt). Beiträge
// eines Partners tragen "von Partner {Name}", abgelehnte zusätzlich den Grund.
function PromotionRow({ promotion, onEdit, onDelete }) {
  const anzeige = isAnzeige(promotion.kennzeichnung)
  const aktiv = Boolean(promotion.aktiv)
  const fromPartner = Boolean(promotion.erstelltVonPartner)

  return (
    <li className="admin-promo-row">
      <div className="admin-entry-main">
        <span className="admin-entry-title">
          <strong>{promotion.titel}</strong>
          <span className={`promotion-badge${anzeige ? ' promotion-badge-anzeige' : ''}`}>
            {kennzeichnungLabel({ kennzeichnung: promotion.kennzeichnung, empfohlenVon: promotion.empfohlen_von })}
          </span>
          <FreigabeChip freigabe={promotion.freigabe} />
          {Boolean(promotion.is_demo) && <span className="pill">Demo</span>}
        </span>
        {fromPartner && (
          <span className="admin-promo-origin">
            von Partner <strong>{promotion.partnerName || 'unbekannt'}</strong>
          </span>
        )}
        {promotion.freigabe === 'abgelehnt' && promotion.ablehnungsgrund && (
          <span className="admin-promo-reason">Abgelehnt: {promotion.ablehnungsgrund}</span>
        )}
        <dl className="admin-entry-meta">
          <div>
            <dt>Bereich</dt>
            <dd>{BEREICH_LABELS[promotion.bereich] || promotion.bereich}</dd>
          </div>
          <div>
            <dt>Aktiv</dt>
            <dd>
              <span className={`pill admin-promo-status-${aktiv ? 'aktiv' : 'inaktiv'}`}>{aktiv ? 'ja' : 'nein'}</span>
            </dd>
          </div>
          <div>
            <dt>Zeitraum</dt>
            <dd>{formatZeitraum(promotion.start, promotion.ende)}</dd>
          </div>
          <div>
            <dt>Klicks 7 Tage / gesamt</dt>
            <dd className="admin-promo-clicks">
              {clickCount(promotion.clicks7)} / {clickCount(promotion.clicksTotal)}
            </dd>
          </div>
        </dl>
      </div>
      <span className="admin-row-actions">
        <button type="button" className="btn btn-ghost" onClick={() => onEdit(promotion)}>
          Bearbeiten
        </button>
        <ConfirmButton onConfirm={() => onDelete(promotion)} label="Löschen" confirmLabel="Wirklich löschen?" ariaLabel={`${promotion.titel} löschen`} />
      </span>
    </li>
  )
}

// Admin-Pflege der Empfehlungen und Anzeigen im Reiter "Entdecken" (Phase 3 Task 5): Liste mit
// Klickzahlen, Formular zum Anlegen/Bearbeiten. partners kommt aus AdminPage (api.admin.partners, von
// AdminPartners synchron gehalten) und füllt die Partner-Auswahl im Formular. version/onChanged (Phase P2):
// mit "Zur Freigabe" (AdminPostApproval) abgestimmt - ändert sich hier etwas, meldet onChanged es (AdminPage
// zählt version hoch und beide laden neu); ohne onChanged lädt die Liste selbst neu.
export default function AdminPromotions({ partners = [], version = 0, onChanged }) {
  const [promotions, setPromotions] = useState(undefined)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null) // null, 'new' oder eine Zeile
  // Eigenes Neuladen ohne onChanged. Nur die Antwort der jüngsten Anfrage zählt (cancelled) - version und
  // reloadKey können kurz hintereinander wechseln.
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    api.admin
      .promotions()
      .then((rows) => {
        if (!cancelled) setPromotions(rows)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [version, reloadKey])

  function changed() {
    if (onChanged) onChanged()
    else setReloadKey((key) => key + 1)
  }

  async function handleDelete(promotion) {
    setError(null)
    try {
      await api.admin.deletePromotion(promotion.id)
      changed()
    } catch (err) {
      setError(err.message)
    }
  }

  function handleSaved() {
    setEditing(null)
    setError(null)
    changed()
  }

  return (
    <section className="admin-promotions card" aria-labelledby="admin-promotions-title">
      <div className="admin-section-head">
        <h2 id="admin-promotions-title">Empfehlungen &amp; Anzeigen</h2>
        {!editing && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            <Icon name="plus" /> Empfehlung anlegen
          </button>
        )}
      </div>
      <p className="admin-section-intro muted">
        Erscheinen im Reiter „Entdecken“. Klicks werden anonym pro Tag gezählt – ohne Cookie, ohne IP.
      </p>

      {error && !editing && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {editing && (
        <AdminPromotionForm
          promotion={editing === 'new' ? null : editing}
          partners={partners}
          onSaved={handleSaved}
          onCancel={() => setEditing(null)}
          onImageUploaded={changed}
        />
      )}

      {!editing && promotions === undefined && !error && <p className="muted">Lade …</p>}
      {!editing && promotions && promotions.length === 0 && <p className="muted">Noch keine Empfehlungen oder Anzeigen angelegt.</p>}
      {!editing && promotions && promotions.length > 0 && (
        <ul className="admin-promo-list">
          {promotions.map((promotion) => (
            <PromotionRow key={promotion.id} promotion={promotion} onEdit={setEditing} onDelete={handleDelete} />
          ))}
        </ul>
      )}
    </section>
  )
}
