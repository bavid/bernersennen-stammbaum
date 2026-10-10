import { useRef, useState } from 'react'
import Icon from './Icon.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import ExpandableText from './ExpandableText.jsx'
import { relativeTime } from '../lib/dates.js'
import { TYPE_LABELS } from '../lib/partnerTypes.js'
import { VOUCHER_STATUS_LABEL } from '../lib/voucherCode.js'
import { ANFRAGE_STATUS, ANFRAGE_TYP, MAX_NOTIZ_LENGTH, canAssign, mailtoHref } from '../lib/anfragen.js'
import { Button } from './ui/index.js'

const MESSAGE_LINES = 2

function isPartner(anfrage) {
  return anfrage.typ === ANFRAGE_TYP.partner
}

// Wer fragt an: bei Partner-Anfragen die Hundeschule/das Tierheim, sonst der (freiwillige) Name.
function Title({ anfrage }) {
  const title = isPartner(anfrage) ? anfrage.firma : anfrage.name
  return title ? <strong>{title}</strong> : <em className="muted">ohne Namen</em>
}

// Nur bei Partner-Anfragen: Art, PLZ/Ort und Ansprechperson.
function PartnerMeta({ anfrage }) {
  const ort = [anfrage.plz, anfrage.ort].filter(Boolean).join(' ')
  const parts = [TYPE_LABELS[anfrage.partnerTyp] || anfrage.partnerTyp, ort, anfrage.name && `Ansprechperson: ${anfrage.name}`]
  return <p className="admin-anfrage-meta">{parts.filter(Boolean).join(' · ')}</p>
}

// Notiz des Admins, direkt in der Zeile bearbeitet. onSave(text) gibt true zurück, wenn gespeichert; onDone schließt.
function NotizEditor({ anfrage, onSave, onDone }) {
  const [text, setText] = useState(anfrage.notiz || '')
  const [saving, setSaving] = useState(false)
  const id = `admin-anfrage-notiz-${anfrage.id}`

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    const saved = await onSave(text.trim())
    setSaving(false)
    if (saved) onDone()
  }

  return (
    <form className="admin-anfrage-notiz" onSubmit={handleSubmit}>
      <label className="field-label" htmlFor={id}>
        Notiz (nur für dich)
      </label>
      <textarea id={id} value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_NOTIZ_LENGTH} rows={2} autoFocus />
      <span className="admin-row-actions">
        <Button type="submit" variant="ink" disabled={saving}>
          {saving ? 'Speichere …' : 'Speichern'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Abbrechen
        </Button>
      </span>
    </form>
  )
}

function StatusActions({ anfrage, onStatus }) {
  if (anfrage.status !== ANFRAGE_STATUS.offen) {
    return (
      <Button type="button" variant="ghost" onClick={() => onStatus(ANFRAGE_STATUS.offen)}>
        <Icon name="arrowLeft" />
        Wieder öffnen
      </Button>
    )
  }
  return (
    <>
      <Button type="button" variant="ghost" onClick={() => onStatus(ANFRAGE_STATUS.erledigt)}>
        <Icon name="check" />
        Erledigt
      </Button>
      <Button type="button" variant="ghost" onClick={() => onStatus(ANFRAGE_STATUS.abgelehnt)}>
        <Icon name="close" />
        Ablehnen
      </Button>
    </>
  )
}

// Eine Anfrage in der Admin-Liste (AdminAnfragen): Typ, wer, E-Mail (mailto), wann, Nachricht (nach zwei Zeilen
// eingeklappt), zugewiesener Gutschein (nur Hinweis und Status), Notiz und Aktionen. Die Aktionen melden nach oben:
// onAssign() öffnet den Zuweisen-Dialog, onStatus(status), onNotiz(text) -> Promise<boolean>, onDelete().
export default function AdminAnfrageRow({ anfrage, onAssign, onStatus, onNotiz, onDelete }) {
  const partner = isPartner(anfrage)
  const closed = anfrage.status !== ANFRAGE_STATUS.offen
  const [editingNotiz, setEditingNotiz] = useState(false)
  const notizButtonRef = useRef(null)

  // Nach dem Speichern oder Abbrechen zurück zum Knopf "Notiz" - der Fokus landet sonst im Nichts.
  function closeNotiz() {
    setEditingNotiz(false)
    requestAnimationFrame(() => notizButtonRef.current?.focus())
  }

  return (
    <li className={`admin-anfrage is-${anfrage.status}`}>
      <div className="admin-anfrage-head">
        <span className={`pill admin-anfrage-typ ${partner ? 'is-access' : ''}`.trim()}>{partner ? 'Partner-Zugang' : 'Einladungscode'}</span>
        <Title anfrage={anfrage} />
        <a href={mailtoHref(anfrage.email)} className="admin-anfrage-email">
          {anfrage.email}
        </a>
        <span className="muted">
          <time dateTime={anfrage.createdAt}>{relativeTime(anfrage.createdAt)}</time>
          {closed && anfrage.erledigtAt && ` · abgeschlossen ${relativeTime(anfrage.erledigtAt)}`}
        </span>
      </div>

      {partner && <PartnerMeta anfrage={anfrage} />}
      {anfrage.nachricht && <ExpandableText text={anfrage.nachricht} className="admin-anfrage-text" lines={MESSAGE_LINES} />}
      {anfrage.gutschein && (
        <p className="admin-anfrage-gutschein">
          <Icon name="check" />
          Einladungscode <span className="voucher-code">…{anfrage.gutschein.hint}</span> zugewiesen ·{' '}
          {VOUCHER_STATUS_LABEL[anfrage.gutschein.status] || anfrage.gutschein.status}
        </p>
      )}

      {editingNotiz ? (
        <NotizEditor anfrage={anfrage} onSave={onNotiz} onDone={closeNotiz} />
      ) : (
        anfrage.notiz && <p className="admin-anfrage-notiz-text">{anfrage.notiz}</p>
      )}

      <div className="admin-row-actions admin-anfrage-actions">
        {canAssign(anfrage) && (
          <Button type="button" variant="ink" onClick={onAssign}>
            <Icon name="mail" />
            {partner ? 'Partner-Zugang zuweisen' : 'Einladungscode zuweisen'}
          </Button>
        )}
        <StatusActions anfrage={anfrage} onStatus={onStatus} />
        {!editingNotiz && (
          <button type="button" className="btn btn-ghost" ref={notizButtonRef} onClick={() => setEditingNotiz(true)}>
            <Icon name="edit" />
            {anfrage.notiz ? 'Notiz bearbeiten' : 'Notiz'}
          </button>
        )}
        <ConfirmButton onConfirm={onDelete} label="Löschen" confirmLabel="Wirklich löschen?" />
      </div>
    </li>
  )
}
