import { useEffect, useState } from 'react'
import { api } from '../api'
import AdminPostApprovalItem from './AdminPostApprovalItem.jsx'

// "Zur Freigabe" (Phase P2) - ganz oben im Marketing-Teil des Admins: alle eingereichten Beiträge
// (GET /api/admin/promotions?freigabe=eingereicht), neueste zuerst. Freigeben/Ablehnen nimmt den Beitrag
// aus der Liste; onChanged meldet es an AdminPage, damit die Liste "Empfehlungen & Anzeigen" (Freigabe-Chip)
// neu lädt - und umgekehrt lädt diese Karte neu, wenn sich version ändert (z. B. hat der Admin einen
// Beitrag dort bearbeitet und damit freigegeben). onCountChange: Zähler am Reiter "Freigaben".
export default function AdminPostApproval({ version = 0, onChanged, onCountChange }) {
  const [promotions, setPromotions] = useState(undefined)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const count = promotions?.length ?? 0

  useEffect(() => {
    let cancelled = false
    api.admin
      .promotions({ freigabe: 'eingereicht' })
      .then((rows) => {
        if (cancelled) return
        setPromotions(Array.isArray(rows) ? rows : [])
        setError(null)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [version])

  useEffect(() => {
    if (promotions !== undefined) onCountChange?.(count)
  }, [promotions, count, onCountChange])

  // Gemeinsamer Ablauf für Freigeben und Ablehnen: true, wenn es geklappt hat.
  async function decide(promotion, request) {
    setError(null)
    setBusyId(promotion.id)
    try {
      await request()
      setPromotions((list) => list.filter((item) => item.id !== promotion.id))
      onChanged?.()
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setBusyId(null)
    }
  }

  const approve = (promotion) => decide(promotion, () => api.admin.approvePromotion(promotion.id))
  const reject = (promotion, grund) => decide(promotion, () => api.admin.rejectPromotion(promotion.id, grund))

  return (
    <section className="admin-approval card" aria-labelledby="admin-approval-title">
      <div className="admin-section-head">
        <h2 id="admin-approval-title">
          Zur Freigabe{' '}
          {count > 0 && (
            <span className="pill pill-rust admin-approval-count">
              {count}
              <span className="visually-hidden"> {count === 1 ? 'Beitrag wartet' : 'Beiträge warten'}</span>
            </span>
          )}
        </h2>
      </div>
      <p className="admin-section-intro muted">
        Beiträge der Partner erscheinen erst nach deiner Freigabe – immer als „Anzeige“. Jede Änderung durch den Partner
        landet wieder hier.
      </p>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {promotions === undefined && !error && <p className="muted">Lade …</p>}
      {promotions?.length === 0 && <p className="muted">Nichts zu prüfen – alle Beiträge sind bearbeitet.</p>}
      {count > 0 && (
        <ul className="admin-approval-list">
          {promotions.map((promotion) => (
            <AdminPostApprovalItem
              key={promotion.id}
              promotion={promotion}
              busy={busyId === promotion.id}
              onApprove={approve}
              onReject={reject}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
