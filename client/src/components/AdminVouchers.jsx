import { useEffect, useState } from 'react'
import { api } from '../api'
import { useToast } from './Toast.jsx'
import Icon from './Icon.jsx'
import { relativeTime } from '../lib/dates.js'
import { VOUCHER_STATUS_LABEL } from '../lib/voucherCode.js'

const MIN_SIZE = 1
const MAX_SIZE = 200
const DEFAULT_SIZE = 10

function CreatedCodes({ codes, onDismiss }) {
  const toast = useToast()

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      toast('Kopiert')
    } catch {
      // Ohne Zwischenablage-Recht bleibt nur die Liste zum Abtippen.
    }
  }

  return (
    <div className="admin-voucher-created">
      <div className="admin-voucher-created-head">
        <span className="field-label">{codes.length} neue Codes</span>
        <span className="admin-voucher-created-actions">
          <button type="button" className="btn btn-ghost" onClick={copyAll}>
            <Icon name="copy" />
            Alle kopieren
          </button>
          <button type="button" className="icon-btn" onClick={onDismiss} aria-label="Schließen">
            <Icon name="close" />
          </button>
        </span>
      </div>
      <ul className="admin-voucher-codes">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
    </div>
  )
}

function BatchDetail({ batchId, onRevoked }) {
  const [detail, setDetail] = useState(undefined)
  const [error, setError] = useState(null)

  function load() {
    api.admin
      .voucherBatch(batchId)
      .then(setDetail)
      .catch((err) => setError(err.message))
  }

  useEffect(load, [batchId])

  async function handleRevoke(voucherId) {
    try {
      await api.admin.revokeVoucher(voucherId)
      load()
      onRevoked?.()
    } catch (err) {
      setError(err.message)
    }
  }

  if (error) return <div className="error-banner" role="alert">{error}</div>
  if (!detail) return <p className="muted">Lade …</p>

  return (
    <ul className="admin-voucher-codes admin-voucher-codes-detail">
      {detail.vouchers.map((voucher) => (
        <li key={voucher.id}>
          <span className="voucher-code">{voucher.code || `…${voucher.hint}`}</span>
          <span className={`pill ${voucher.status === 'offen' ? '' : 'pill-rust'}`}>
            {VOUCHER_STATUS_LABEL[voucher.status] || voucher.status}
          </span>
          {voucher.redeemed_by_name && <span className="muted">{voucher.redeemed_by_name}</span>}
          {voucher.status === 'offen' && (
            <button type="button" className="btn btn-ghost" onClick={() => handleRevoke(voucher.id)}>
              Zurückziehen
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

// Admin-Gutschein-Stapel: anlegen (mit optionalem Beitritts-Rudel), Liste mit Zählern, Details mit
// Zurückziehen. joinableFamilies kommt aus der Familienliste der Übersicht, vorgefiltert auf echte,
// nicht-demo Rudel (nur die sind ein gültiges Ziel, siehe routes/admin.js).
export default function AdminVouchers({ joinableFamilies = [] }) {
  const [batches, setBatches] = useState(undefined)
  const [error, setError] = useState(null)
  const [openId, setOpenId] = useState(null)

  const [label, setLabel] = useState('')
  const [size, setSize] = useState(DEFAULT_SIZE)
  const [joinFamilyId, setJoinFamilyId] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [createdCodes, setCreatedCodes] = useState(null)

  function loadBatches() {
    api.admin
      .voucherBatches()
      .then(setBatches)
      .catch((err) => setError(err.message))
  }

  useEffect(loadBatches, [])

  async function handleCreate(event) {
    event.preventDefault()
    setCreateError(null)
    setCreating(true)
    try {
      const payload = { label, size: Number(size) }
      if (joinFamilyId) payload.joinFamilyId = Number(joinFamilyId)
      const result = await api.admin.createVoucherBatch(payload)
      setCreatedCodes(result.codes)
      setLabel('')
      setSize(DEFAULT_SIZE)
      setJoinFamilyId('')
      loadBatches()
    } catch (err) {
      setCreateError(err.message)
    } finally {
      setCreating(false)
    }
  }

  function toggleBatch(id) {
    setOpenId((current) => (current === id ? null : id))
  }

  return (
    <section className="admin-vouchers card" aria-labelledby="admin-vouchers-title">
      <h2 id="admin-vouchers-title">Gutscheine</h2>

      <form className="form-stack" onSubmit={handleCreate}>
        {createError && (
          <div className="error-banner" role="alert">
            {createError}
          </div>
        )}
        <div className="form-grid">
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
              value={size}
              onChange={(e) => setSize(e.target.value)}
              required
            />
          </div>
          <div className="field span-2">
            <label className="field-label" htmlFor="admin-voucher-join">
              Tritt Familie bei (optional)
            </label>
            <select id="admin-voucher-join" value={joinFamilyId} onChange={(e) => setJoinFamilyId(e.target.value)}>
              <option value="">Keine – eigenständiges Zuhause</option>
              {joinableFamilies.map((family) => (
                <option key={family.id} value={family.id}>
                  {family.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-actions">
          <span className="form-actions-spacer" />
          <button type="submit" className="btn btn-primary" disabled={creating || !label.trim()}>
            {creating ? 'Lege an …' : 'Stapel anlegen'}
          </button>
        </div>
      </form>

      {createdCodes && <CreatedCodes codes={createdCodes} onDismiss={() => setCreatedCodes(null)} />}

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {batches === undefined && !error && <p className="muted">Lade …</p>}
      {batches && batches.length === 0 && <p className="muted">Noch keine Stapel angelegt.</p>}
      {batches && batches.length > 0 && (
        <ul className="admin-voucher-batches">
          {batches.map((batch) => {
            const open = openId === batch.id
            return (
              <li key={batch.id} className={`admin-voucher-batch ${open ? 'is-open' : ''}`}>
                <button type="button" className="admin-voucher-batch-head" aria-expanded={open} onClick={() => toggleBatch(batch.id)}>
                  <span>
                    <strong>{batch.label}</strong>
                    <span className="muted"> · angelegt {relativeTime(batch.created_at)}</span>
                  </span>
                  <span className="admin-voucher-batch-counts">
                    <span className="pill">{batch.open} offen</span>
                    <span className="pill">{batch.redeemed} eingelöst</span>
                    {batch.revoked > 0 && <span className="pill">{batch.revoked} zurückgezogen</span>}
                  </span>
                </button>
                {open && (
                  <div className="admin-voucher-detail">
                    <BatchDetail batchId={batch.id} onRevoked={loadBatches} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
