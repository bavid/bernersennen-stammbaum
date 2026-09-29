import { useState } from 'react'
import { api } from '../api'
import { TYPE_LABELS } from '../lib/partnerTypes.js'

const MIN_SIZE = 1
const MAX_SIZE = 200
const DEFAULT_SIZE = 10

// Zweck eines Stapels (server/lib/vouchers.js ZWECK): Kunden-Gutscheine ("chronik", Standard - ohne Angabe
// nimmt der Server ihn an) oder Partner-Zugänge (Phase P, "partnerzugang").
export const ZWECK_CHRONIK = 'chronik'
export const ZWECK_PARTNERZUGANG = 'partnerzugang'
const ZWECK_OPTIONS = [
  { value: ZWECK_CHRONIK, label: 'Kunden-Gutscheine' },
  { value: ZWECK_PARTNERZUGANG, label: 'Partner-Zugang' }
]

function ZweckSwitch({ value, onChange }) {
  return (
    <div className="field span-2">
      <span className="field-label" id="admin-voucher-zweck-label">
        Zweck
      </span>
      <div className="segmented segmented-sm admin-voucher-zweck" role="group" aria-labelledby="admin-voucher-zweck-label">
        {ZWECK_OPTIONS.map((option) => (
          <button type="button" key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function SelectField({ id, label, value, onChange, disabled, hint, children }) {
  return (
    <div className="field span-2">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {children}
      </select>
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  )
}

// Kunden-Gutscheine: optional Beitritt zu einem Rudel und/oder "für Partner" (kind='partner').
function ChronikFields({ joinableFamilies, partners, joinFamilyId, partnerId, onJoinFamily, onPartner }) {
  return (
    <>
      <SelectField id="admin-voucher-join" label="Tritt Familie bei (optional)" value={joinFamilyId} onChange={onJoinFamily}>
        <option value="">Keine – eigenständiges Zuhause</option>
        {joinableFamilies.map((family) => (
          <option key={family.id} value={family.id}>
            {family.name}
          </option>
        ))}
      </SelectField>
      <SelectField id="admin-voucher-partner" label="Für Partner (optional)" value={partnerId} onChange={onPartner}>
        <option value="">Kein Partner</option>
        {partners.map((partner) => (
          <option key={partner.id} value={partner.id}>
            {partner.name}
          </option>
        ))}
      </SelectField>
    </>
  )
}

// Partner-Zugang: optional eine Typ-Vorgabe für das neue Profil ODER die Bindung an einen bestehenden
// Partner ohne Bereich - dann gilt dessen Typ, und es gibt genau einen Gutschein (server/lib/
// partnerAccess.js partnerAccessBatchOptions).
function AccessFields({ accessPartners, partnerTyp, bindPartnerId, onTyp, onBind }) {
  const isBound = Boolean(bindPartnerId)
  return (
    <>
      <SelectField
        id="admin-voucher-typ"
        label="Typ (optional)"
        value={isBound ? '' : partnerTyp}
        onChange={onTyp}
        disabled={isBound}
        hint={isBound ? 'Es gilt der Typ des gewählten Partners.' : 'Ohne Vorgabe wählt der Partner beim Einlösen selbst.'}
      >
        <option value="">Keine Vorgabe</option>
        {Object.entries(TYPE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </SelectField>
      <SelectField
        id="admin-voucher-bind"
        label="An Partner binden (optional)"
        value={bindPartnerId}
        onChange={onBind}
        hint={isBound ? 'Ein gebundener Zugang gilt genau einmal – die Anzahl ist fest 1.' : 'Nur Partner ohne eigenen Bereich.'}
      >
        <option value="">Neuer Partner</option>
        {accessPartners.map((partner) => (
          <option key={partner.id} value={partner.id}>
            {partner.name} ({TYPE_LABELS[partner.typ] || partner.typ})
          </option>
        ))}
      </SelectField>
    </>
  )
}

// Neuer Gutschein-Stapel (AdminVouchers). partners: gültige Ziele für "Für Partner" (Entwurf/Aktiv),
// accessPartners: bindbare Partner für einen Partner-Zugang (keine Demo, noch kein Bereich) - beide
// filtert AdminPage vor. onCreated bekommt die neuen Codes (einmalig im Klartext).
export default function AdminVoucherForm({ joinableFamilies = [], partners = [], accessPartners = [], onCreated }) {
  const [zweck, setZweck] = useState(ZWECK_CHRONIK)
  const [label, setLabel] = useState('')
  const [size, setSize] = useState(DEFAULT_SIZE)
  const [joinFamilyId, setJoinFamilyId] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [partnerTyp, setPartnerTyp] = useState('')
  const [bindPartnerId, setBindPartnerId] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

  const isAccess = zweck === ZWECK_PARTNERZUGANG
  const isBound = isAccess && Boolean(bindPartnerId)

  // Kunden-Gutscheine ohne zweck (wie bisher, Server-Standard), Partner-Zugang nur mit seinen Feldern.
  function buildPayload() {
    const payload = { label, size: isBound ? 1 : Number(size) }
    if (isAccess) {
      payload.zweck = ZWECK_PARTNERZUGANG
      if (bindPartnerId) payload.partnerId = Number(bindPartnerId)
      else if (partnerTyp) payload.partnerTyp = partnerTyp
      return payload
    }
    if (joinFamilyId) payload.joinFamilyId = Number(joinFamilyId)
    if (partnerId) payload.partnerId = Number(partnerId)
    return payload
  }

  function reset() {
    setLabel('')
    setSize(DEFAULT_SIZE)
    setJoinFamilyId('')
    setPartnerId('')
    setPartnerTyp('')
    setBindPartnerId('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setCreating(true)
    try {
      const result = await api.admin.createVoucherBatch(buildPayload())
      reset()
      onCreated(result.codes)
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <div className="form-grid">
        <ZweckSwitch value={zweck} onChange={setZweck} />
        <div className="field">
          <label className="field-label" htmlFor="admin-voucher-label">
            Bezeichnung
          </label>
          <input id="admin-voucher-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} required />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="admin-voucher-size">
            Anzahl
          </label>
          <input
            id="admin-voucher-size"
            type="number"
            min={MIN_SIZE}
            max={MAX_SIZE}
            value={isBound ? 1 : size}
            onChange={(e) => setSize(e.target.value)}
            disabled={isBound}
            required
          />
        </div>
        {isAccess ? (
          <AccessFields
            accessPartners={accessPartners}
            partnerTyp={partnerTyp}
            bindPartnerId={bindPartnerId}
            onTyp={setPartnerTyp}
            onBind={setBindPartnerId}
          />
        ) : (
          <ChronikFields
            joinableFamilies={joinableFamilies}
            partners={partners}
            joinFamilyId={joinFamilyId}
            partnerId={partnerId}
            onJoinFamily={setJoinFamilyId}
            onPartner={setPartnerId}
          />
        )}
      </div>
      <div className="form-actions">
        <span className="form-actions-spacer" />
        <button type="submit" className="btn btn-primary" disabled={creating || !label.trim()}>
          {creating ? 'Lege an …' : 'Stapel anlegen'}
        </button>
      </div>
    </form>
  )
}
