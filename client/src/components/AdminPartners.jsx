import { useEffect, useState } from 'react'
import { api } from '../api'
import Icon from './Icon.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import Modal from './Modal.jsx'
import KeyReveal from './KeyReveal.jsx'
import { isValidHexColor } from '../lib/color.js'
import { contrastRatio, hasEnoughContrast, ON_RUST, MIN_CONTRAST } from '../lib/contrast.js'
import { TYPE_LABELS } from '../lib/partnerTypes.js'

const STATUS_LABELS = { entwurf: 'Entwurf', aktiv: 'Aktiv', pausiert: 'Pausiert' }
const DEFAULT_FARBE = '#2f6b3f'
// Tierheim-Bereich (final-review Phase T Finding 4): nur Partner dieser beiden Typen können einen
// eigenen App-Bereich bekommen (server/routes/admin.js POST /:id/shelter prüft dieselbe Liste).
const SHELTER_TYPES = ['tierheim', 'vermittlung']

// Formularwerte (camelCase) aus einer Server-Zeile (snake_case) bzw. leer beim Neuanlegen.
function initialState(partner) {
  return {
    name: partner?.name || '',
    slug: partner?.slug || '',
    typ: partner?.typ || 'tierheim',
    status: partner?.status || 'entwurf',
    istPartner: partner ? Boolean(partner.ist_partner) : true,
    plz: partner?.plz || '',
    website: partner?.website || '',
    spendenUrl: partner?.spenden_url || '',
    vermittlungUrl: partner?.vermittlung_url || '',
    kontaktEmail: partner?.kontakt_email || '',
    kontaktTelefon: partner?.kontakt_telefon || '',
    portalTitel: partner?.portal_titel || '',
    portalText: partner?.portal_text || '',
    farbe: partner?.farbe || ''
  }
}

function toPayload(form) {
  return {
    name: form.name,
    slug: form.slug || null,
    typ: form.typ,
    status: form.status,
    istPartner: form.istPartner,
    plz: form.plz || null,
    website: form.website || null,
    spendenUrl: form.spendenUrl || null,
    vermittlungUrl: form.vermittlungUrl || null,
    kontaktEmail: form.kontaktEmail || null,
    kontaktTelefon: form.kontaktTelefon || null,
    portalTitel: form.portalTitel || null,
    portalText: form.portalText || null,
    farbe: form.farbe || null
  }
}

// Live-Kontrastanzeige beim Tippen/Wählen der Farbe - dieselbe WCAG-Formel wie der Server
// (lib/contrast.js spiegelt server/lib/partners.js), ersetzt die Server-Prüfung beim Speichern nicht.
function ContrastHint({ farbe }) {
  if (!farbe) return null
  if (!isValidHexColor(farbe)) return <p className="field-hint">Format: #rrggbb</p>

  const ratio = contrastRatio(farbe, ON_RUST)
  const ok = hasEnoughContrast(farbe)
  return (
    <p className={`field-hint admin-partner-contrast ${ok ? 'is-ok' : 'is-warning'}`} role={ok ? undefined : 'alert'}>
      Kontrast gegen die Schrift: {ratio.toFixed(2)}:1 –{' '}
      {ok ? 'gut lesbar.' : `zu niedrig (mind. ${MIN_CONTRAST}:1 nötig) – Schrift wäre schlecht lesbar.`}
    </p>
  )
}

// Logo nur für einen bereits gespeicherten Partner (Server braucht die id) - direkter Upload wie
// PhotoPicker, aber genau eine Datei und ein eigener Endpunkt (lib/partners.js prüft PNG/JPG/WebP).
function LogoUpload({ partnerId, logoUrl, onUploaded }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const { logoUrl: nextUrl } = await api.admin.uploadPartnerLogo(partnerId, file)
      onUploaded(nextUrl)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="field">
      <span className="field-label">Logo</span>
      {logoUrl && <img src={logoUrl} alt="" className="admin-partner-logo-preview" />}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <label className="btn btn-ghost admin-partner-logo-btn">
        <Icon name="camera" />
        {busy ? 'Lädt …' : 'Logo hochladen'}
        {/* Visuell versteckt statt hidden (wie PhotoPicker.jsx .photo-add input): mit hidden verschwindet
            das Feld aus der Tab-Reihenfolge und ist per Tastatur nicht erreichbar. */}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleChange}
          disabled={busy}
          className="admin-partner-logo-input"
        />
      </label>
      <p className="field-hint">PNG, JPG oder WebP, höchstens 512 KB.</p>
    </div>
  )
}

// Anlegen und Bearbeiten eines Partners - alle Felder aus server/lib/partners.js validatePartner.
// Logo-Upload nur, wenn partner schon eine id hat (siehe LogoUpload).
function PartnerForm({ partner, onSaved, onCancel }) {
  const [form, setForm] = useState(() => initialState(partner))
  const [logoUrl, setLogoUrl] = useState(partner?.logo_file ? `/partner-media/${partner.logo_file}` : null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const update = (patch) => setForm((current) => ({ ...current, ...patch }))

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const payload = toPayload(form)
      const saved = partner ? await api.admin.updatePartner(partner.id, payload) : await api.admin.createPartner(payload)
      onSaved(saved)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form className="admin-partner-form form-stack" onSubmit={handleSubmit}>
      <h3>{partner ? `Partner bearbeiten – ${partner.name}` : 'Partner anlegen'}</h3>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <div className="form-grid">
        <div className="field">
          <label className="field-label" htmlFor="admin-partner-name">
            Name
          </label>
          <input id="admin-partner-name" value={form.name} onChange={(e) => update({ name: e.target.value })} maxLength={120} required />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="admin-partner-slug">
            Kurzname (URL, optional)
          </label>
          <input
            id="admin-partner-slug"
            value={form.slug}
            onChange={(e) => update({ slug: e.target.value })}
            placeholder="aus dem Namen erzeugt"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="admin-partner-typ">
            Typ
          </label>
          <select id="admin-partner-typ" value={form.typ} onChange={(e) => update({ typ: e.target.value })}>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="admin-partner-status">
            Status
          </label>
          <select id="admin-partner-status" value={form.status} onChange={(e) => update({ status: e.target.value })}>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="admin-partner-plz">
            Postleitzahl
          </label>
          <input
            id="admin-partner-plz"
            value={form.plz}
            onChange={(e) => update({ plz: e.target.value.replace(/\D/g, '').slice(0, 5) })}
            inputMode="numeric"
            maxLength={5}
          />
        </div>
        <div className="field admin-partner-checkbox-field">
          <label className="check">
            <input type="checkbox" checked={form.istPartner} onChange={(e) => update({ istPartner: e.target.checked })} />
            Partner-Kennzeichnung (sonst „geprüft“)
          </label>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="admin-partner-website">
            Website
          </label>
          <input
            id="admin-partner-website"
            type="url"
            value={form.website}
            onChange={(e) => update({ website: e.target.value })}
            placeholder="https://…"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="admin-partner-spenden-url">
            Spenden-Link
          </label>
          <input
            id="admin-partner-spenden-url"
            type="url"
            value={form.spendenUrl}
            onChange={(e) => update({ spendenUrl: e.target.value })}
            placeholder="https://…"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="admin-partner-vermittlung-url">
            Vermittlungs-Link
          </label>
          <input
            id="admin-partner-vermittlung-url"
            type="url"
            value={form.vermittlungUrl}
            onChange={(e) => update({ vermittlungUrl: e.target.value })}
            placeholder="https://…"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="admin-partner-kontakt-email">
            Kontakt-E-Mail
          </label>
          <input
            id="admin-partner-kontakt-email"
            type="email"
            value={form.kontaktEmail}
            onChange={(e) => update({ kontaktEmail: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="admin-partner-kontakt-telefon">
            Kontakt-Telefon
          </label>
          <input
            id="admin-partner-kontakt-telefon"
            value={form.kontaktTelefon}
            onChange={(e) => update({ kontaktTelefon: e.target.value })}
          />
        </div>
        <div className="field span-2">
          <label className="field-label" htmlFor="admin-partner-portal-titel">
            Portal-Titel
          </label>
          <input
            id="admin-partner-portal-titel"
            value={form.portalTitel}
            onChange={(e) => update({ portalTitel: e.target.value })}
            maxLength={120}
            placeholder={`Willkommen von ${form.name || '…'}`}
          />
        </div>
        <div className="field span-2">
          <label className="field-label" htmlFor="admin-partner-portal-text">
            Portal-Text
          </label>
          <textarea
            id="admin-partner-portal-text"
            value={form.portalText}
            onChange={(e) => update({ portalText: e.target.value })}
            maxLength={2000}
            rows={4}
          />
        </div>
        <div className="field span-2">
          <span className="field-label">Akzentfarbe</span>
          <div className="admin-partner-color">
            <input
              type="color"
              aria-label="Akzentfarbe wählen"
              value={isValidHexColor(form.farbe) ? form.farbe : DEFAULT_FARBE}
              onChange={(e) => update({ farbe: e.target.value })}
            />
            <input
              id="admin-partner-farbe-text"
              value={form.farbe}
              onChange={(e) => update({ farbe: e.target.value })}
              placeholder="#rrggbb"
              maxLength={7}
              aria-label="Akzentfarbe als Hex-Wert"
            />
          </div>
          <ContrastHint farbe={form.farbe} />
        </div>
      </div>

      {partner && <LogoUpload partnerId={partner.id} logoUrl={logoUrl} onUploaded={setLogoUrl} />}

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving || !form.name.trim()}>
          {saving ? 'Speichere …' : 'Speichern'}
        </button>
      </div>
    </form>
  )
}

// Tierheim-Bereich einer Zeile (final-review Phase T Finding 4): ohne shelter_family_id ein einfacher
// "anlegen"-Knopf (server legt Familie + Schlüssel in einem Zug an, kein Bestätigen nötig - anders als
// das Erneuern unten, das eine bestehende Sitzung ungültig macht). Mit shelter_family_id ein zweistufiger
// Bestätigen-Ablauf wie ConfirmButton, aber mit eigenem Erklärtext statt nur einer Label-Änderung.
function ShelterAccessControls({ partner, busy, confirmingRenew, error, onCreate, onStartRenew, onCancelRenew, onConfirmRenew }) {
  if (!SHELTER_TYPES.includes(partner.typ)) return null

  return (
    <span className="admin-partner-shelter">
      {partner.shelter_family_id ? (
        <>
          <span className="pill">Tierheim-Bereich: angelegt</span>
          {confirmingRenew ? (
            <span className="admin-partner-shelter-confirm">
              <span className="field-hint" role="alert">
                Alle Geräte des Tierheims müssen sich neu anmelden.
              </span>
              <button type="button" className="btn btn-ghost" onClick={onCancelRenew}>
                Abbrechen
              </button>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => onConfirmRenew(partner)}>
                {busy ? 'Erneuere …' : 'Wirklich neu ausgeben?'}
              </button>
            </span>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => onStartRenew(partner)}>
              Schlüssel neu ausgeben
            </button>
          )}
        </>
      ) : (
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => onCreate(partner)}>
          {busy ? 'Lege an …' : 'Tierheim-Bereich anlegen'}
        </button>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </span>
  )
}

// Ein Partner in der Liste: Status-Chip, Typ, Aktionen (Bearbeiten/Portal ansehen/Pausieren
// bzw. Aktivieren/Löschen nur im Entwurf), plus Tierheim-Bereich-Verwaltung für tierheim/vermittlung.
function PartnerRow({ partner, onEdit, onToggleStatus, onDelete, shelter }) {
  return (
    <li className="admin-partner-row">
      <span className="admin-partner-row-main">
        <strong>{partner.name}</strong>
        <span className={`pill admin-partner-status-${partner.status}`}>{STATUS_LABELS[partner.status] || partner.status}</span>
        <span className="muted">{TYPE_LABELS[partner.typ] || partner.typ}</span>
      </span>
      <span className="admin-partner-row-actions">
        <button type="button" className="btn btn-ghost" onClick={() => onEdit(partner)}>
          Bearbeiten
        </button>
        <a className="btn btn-ghost" href={`/p/${partner.slug}`} target="_blank" rel="noopener noreferrer">
          Portal ansehen
        </a>
        <button type="button" className="btn btn-ghost" onClick={() => onToggleStatus(partner)}>
          {partner.status === 'aktiv' ? 'Pausieren' : 'Aktivieren'}
        </button>
        {partner.status === 'entwurf' && (
          <ConfirmButton className="admin-partner-delete" onConfirm={() => onDelete(partner)} label="Löschen" confirmLabel="Wirklich löschen?" />
        )}
      </span>
      <ShelterAccessControls
        partner={partner}
        busy={shelter.busyId === partner.id}
        confirmingRenew={shelter.renewConfirmId === partner.id}
        error={shelter.errorId === partner.id ? shelter.error : null}
        onCreate={shelter.onCreate}
        onStartRenew={shelter.onStartRenew}
        onCancelRenew={shelter.onCancelRenew}
        onConfirmRenew={shelter.onConfirmRenew}
      />
    </li>
  )
}

// Admin-Partnerpflege (Task 7): Liste mit Status-Chips + Aktionen, Formular zum Anlegen/Bearbeiten.
// onChange (optional): AdminPage hält daneben eine eigene, schlanke Partnerliste für die
// "Für Partner"-Auswahl in AdminVouchers - onChange hält sie nach jeder Änderung hier synchron.
export default function AdminPartners({ onChange }) {
  const [partners, setPartners] = useState(undefined)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null) // null: keine Liste ausgeblendet; 'new' oder eine Partner-Zeile

  // Tierheim-Bereich (Finding 4): busyId/renewConfirmId/errorId sind jeweils eine Partner-id oder null -
  // pro Zeile wird nur "ihr" Zustand angezeigt (siehe ShelterAccessControls). revealedKey ist der frisch
  // erzeugte/erneuerte Schlüssel, einmalig über KeyReveal gezeigt, bis der Admin ihn gesichert hat.
  const [shelterBusyId, setShelterBusyId] = useState(null)
  const [renewConfirmId, setRenewConfirmId] = useState(null)
  const [shelterErrorId, setShelterErrorId] = useState(null)
  const [shelterError, setShelterError] = useState(null)
  const [revealedKey, setRevealedKey] = useState(null)

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
      await api.admin.updatePartner(partner.id, { ...toPayload(initialState(partner)), status })
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

  async function handleCreateShelter(partner) {
    setShelterErrorId(null)
    setShelterBusyId(partner.id)
    try {
      const { key } = await api.admin.createShelter(partner.id)
      setRevealedKey(key)
      load()
    } catch (err) {
      setShelterErrorId(partner.id)
      setShelterError(err.message)
    } finally {
      setShelterBusyId(null)
    }
  }

  function handleStartRenewShelterKey(partner) {
    setShelterErrorId(null)
    setRenewConfirmId(partner.id)
  }

  function handleCancelRenewShelterKey() {
    setRenewConfirmId(null)
  }

  async function handleConfirmRenewShelterKey(partner) {
    setShelterErrorId(null)
    setShelterBusyId(partner.id)
    try {
      const { key } = await api.admin.renewShelterKey(partner.id)
      setRevealedKey(key)
      setRenewConfirmId(null)
      load()
    } catch (err) {
      setShelterErrorId(partner.id)
      setShelterError(err.message)
    } finally {
      setShelterBusyId(null)
    }
  }

  const shelterRowProps = {
    busyId: shelterBusyId,
    renewConfirmId,
    errorId: shelterErrorId,
    error: shelterError,
    onCreate: handleCreateShelter,
    onStartRenew: handleStartRenewShelterKey,
    onCancelRenew: handleCancelRenewShelterKey,
    onConfirmRenew: handleConfirmRenewShelterKey
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
        <PartnerForm partner={editing === 'new' ? null : editing} onSaved={handleSaved} onCancel={() => setEditing(null)} />
      )}

      {!editing && partners === undefined && !error && <p className="muted">Lade …</p>}
      {!editing && partners && partners.length === 0 && <p className="muted">Noch keine Partner angelegt.</p>}
      {!editing && partners && partners.length > 0 && (
        <ul className="admin-partner-list">
          {partners.map((partner) => (
            <PartnerRow
              key={partner.id}
              partner={partner}
              onEdit={setEditing}
              onToggleStatus={handleToggleStatus}
              onDelete={handleDelete}
              shelter={shelterRowProps}
            />
          ))}
        </ul>
      )}

      <Modal open={Boolean(revealedKey)} title="Tierheim-Zugang" onClose={() => setRevealedKey(null)}>
        {revealedKey && (
          <KeyReveal
            value={revealedKey}
            showCardHint={false}
            note="Diesen Schlüssel dem Tierheim geben – damit meldet es sich an. Weitere Zugänge legt das Tierheim selbst unter „Einstellungen → Zugang“ an."
            continueLabel="Fertig"
            onContinue={() => setRevealedKey(null)}
          />
        )}
      </Modal>
    </section>
  )
}
