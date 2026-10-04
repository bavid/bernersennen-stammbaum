import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useToast } from './Toast.jsx'
import Icon from './Icon.jsx'
import AdminVoucherForm from './AdminVoucherForm.jsx'
// Zweck-Badge (Phase 5 Task 3 ausgelagert): dieselbe Anzeige in der Statistik-Karte „Übersicht“.
import ZweckBadge from './ZweckBadge.jsx'
import { formatDateShort, relativeTime } from '../lib/dates.js'
import { VOUCHER_STATUS_LABEL } from '../lib/voucherCode.js'
import { freeCodes } from '../lib/anfragen.js'

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

// Phase 5 Task 2: Karten drucken (AdminPrintPage, /admin/gutscheine/:id/druck) und CSV ohne Codes - nur
// solange der Stapel offene Gutscheine hat, sonst gäbe es nichts zu drucken. Außerhalb des Kopf-Knopfs,
// damit kein Link in einem Button steckt.
function BatchActions({ batch }) {
  if (!(batch.open > 0)) return null
  return (
    <div className="admin-voucher-batch-actions">
      <Link to={`/admin/gutscheine/${batch.id}/druck`} className="btn btn-ghost">
        <Icon name="printer" /> Karten drucken
      </Link>
      <a href={api.admin.voucherCsvUrl(batch.id)} download className="btn btn-ghost">
        <Icon name="download" /> CSV
      </a>
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
          {/* Phase N: einer Anfrage zugewiesen - bleibt offen und druckbar, wird aber nicht noch einmal vergeben. */}
          {voucher.zugewiesen && voucher.status === 'offen' && <span className="pill admin-voucher-assigned">zugewiesen</span>}
          {/* Eingelöste Gutscheine bleiben sichtbar: wann und welcher Bereich daraus entstand */}
          {voucher.redeemed_at ? (
            <span className="muted">
              eingelöst am {formatDateShort(voucher.redeemed_at.slice(0, 10))}
              {voucher.redeemed_by_name ? ` · ${voucher.redeemed_by_name}` : ''}
            </span>
          ) : (
            voucher.redeemed_by_name && <span className="muted">{voucher.redeemed_by_name}</span>
          )}
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

// Admin-Gutschein-Stapel: anlegen (AdminVoucherForm - Kunden-Gutscheine mit optionalem Beitritts-Rudel
// oder Partner, oder Partner-Zugänge), Liste mit Zweck und Zählern, Details mit Zurückziehen.
// joinableFamilies kommt aus der Familienliste der Übersicht, vorgefiltert auf echte, nicht-demo Rudel
// (nur die sind ein gültiges Ziel, siehe routes/admin.js). partners kommt aus AdminPartners (Task 7),
// vorgefiltert auf Entwurf/Aktiv (die einzigen gültigen Ziele) - ein Stapel "für Partner" macht
// kind='partner', der Partner erscheint dann bei jedem Gutschein und, wer ihn einlöst, in
// families.partner_id (siehe lib/vouchers.js createBatch, routes/vouchers.js redeemVoucher).
// accessPartners: Partner, an die sich ein Partner-Zugang binden lässt (keine Demo, noch kein Bereich).
export default function AdminVouchers({ joinableFamilies = [], partners = [], accessPartners = [] }) {
  const [batches, setBatches] = useState(undefined)
  const [error, setError] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [createdCodes, setCreatedCodes] = useState(null)

  function loadBatches() {
    api.admin
      .voucherBatches()
      .then(setBatches)
      .catch((err) => setError(err.message))
  }

  useEffect(loadBatches, [])

  function handleCreated(codes) {
    setCreatedCodes(codes)
    loadBatches()
  }

  function toggleBatch(id) {
    setOpenId((current) => (current === id ? null : id))
  }

  return (
    <section className="admin-vouchers card" aria-labelledby="admin-vouchers-title">
      <h2 id="admin-vouchers-title">Einladungscodes</h2>

      <AdminVoucherForm
        joinableFamilies={joinableFamilies}
        partners={partners}
        accessPartners={accessPartners}
        onCreated={handleCreated}
      />

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
                    <ZweckBadge batch={batch} />
                    {batch.partner_name && <span className="pill pill-rust">für {batch.partner_name}</span>}
                    <span className="pill">{batch.open} offen</span>
                    {/* Phase N: sind Codes an Anfragen vergeben, zählt "frei" die noch zuweisbaren. */}
                    {batch.assigned > 0 && <span className="pill">frei: {freeCodes(batch)}</span>}
                    <span className="pill">{batch.redeemed} eingelöst</span>
                    {batch.revoked > 0 && <span className="pill">{batch.revoked} zurückgezogen</span>}
                  </span>
                </button>
                <BatchActions batch={batch} />
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
