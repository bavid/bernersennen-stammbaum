import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import AdminPostApprovalItem from './AdminPostApprovalItem.jsx'
import AdminApprovalToolbar from './AdminApprovalToolbar.jsx'
import { MAX_SAMMEL_FREIGABE, bulkStatus } from '../lib/adminApproval.js'

const loadPending = () => api.admin.promotions({ freigabe: 'eingereicht' })
const loadDecided = () => api.admin.decidedPromotions()

// Lädt eine Liste (load: eine feste Funktion wie loadPending) und gibt [Zeilen oder undefined, setRows, Fehler]
// zurück. enabled = false: nicht laden (der Filter ist gerade nicht zu sehen). Lädt neu, wenn sich reloadKey ändert.
function useRows(load, { enabled = true, reloadKey }) {
  const [rows, setRows] = useState(undefined)
  const [error, setError] = useState(null)
  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    load()
      .then((list) => {
        if (cancelled) return
        setRows(Array.isArray(list) ? list : [])
        setError(null)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [load, enabled, reloadKey])
  return [rows, setRows, error]
}

// "Zur Freigabe" (Phase P2, V-Fehler 3) im Reiter "Freigaben": eingereichte Beiträge (neueste zuerst) mit Vorschau,
// Verlauf und Entscheidung je Beitrag, Auswahl für "Ausgewählte freigeben" (höchstens 50 auf einmal) - oder die
// zuletzt entschiedenen. onChanged meldet jede Entscheidung an AdminPage ("Empfehlungen & Anzeigen" lädt neu), und
// diese Karte lädt neu, wenn sich version ändert. onCountChange: Zähler der eingereichten am Reiter "Freigaben".
// Nach einer Entscheidung verschwindet der Beitrag samt dem fokussierten Knopf - der Fokus geht auf die Überschrift,
// die Statuszeile (immer vorhanden, damit Screenreader sie ansagen) nennt das Ergebnis.
export default function AdminPostApproval({ version = 0, onChanged, onCountChange }) {
  const [filter, setFilter] = useState('eingereicht')
  const [decidedVersion, setDecidedVersion] = useState(0)
  const showDecided = filter === 'entschieden'
  const decidedKey = `${version}-${decidedVersion}`
  const [pending, setPending, pendingError] = useRows(loadPending, { reloadKey: version })
  const [decided, , decidedError] = useRows(loadDecided, { enabled: showDecided, reloadKey: decidedKey })
  const headingRef = useRef(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [error, setError] = useState(null)
  const [status, setStatus] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const count = pending?.length ?? 0
  const rows = showDecided ? decided : pending
  const loadError = showDecided ? decidedError : pendingError
  // Höchstens MAX_SAMMEL_FREIGABE auf einmal (wie der Server) - die ältesten bleiben für die nächste Runde.
  const selectable = (pending ?? []).slice(0, MAX_SAMMEL_FREIGABE).map((promotion) => promotion.id)
  const selected = selectable.filter((id) => selectedIds.includes(id))

  useEffect(() => {
    if (pending !== undefined) onCountChange?.(count)
  }, [pending, count, onCountChange])

  // Nach jeder Entscheidung: aus den eingereichten nehmen, "zuletzt entschieden" frisch laden, AdminPage melden,
  // Ergebnis in die Statuszeile und den Fokus auf die Überschrift.
  function afterDecision(ids, message) {
    setPending((list) => list?.filter((item) => !ids.includes(item.id)))
    setSelectedIds((current) => current.filter((id) => !ids.includes(id)))
    setDecidedVersion((value) => value + 1)
    setStatus(message)
    headingRef.current?.focus()
    onChanged?.()
  }

  // Gemeinsamer Ablauf für Freigeben und Ablehnen: true, wenn es geklappt hat.
  async function decide(promotion, request, message) {
    setError(null)
    setStatus(null)
    setBusyId(promotion.id)
    try {
      await request()
      afterDecision([promotion.id], message)
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setBusyId(null)
    }
  }

  const approve = (promotion) => decide(promotion, () => api.admin.approvePromotion(promotion.id), `„${promotion.titel}“ freigegeben.`)
  const reject = (promotion, reason) =>
    decide(promotion, () => api.admin.rejectPromotion(promotion.id, reason), `„${promotion.titel}“ abgelehnt.`)

  function changeFilter(key) {
    setFilter(key)
    setStatus(null)
  }

  function select(promotion, checked) {
    setSelectedIds((current) => [...current.filter((id) => id !== promotion.id), ...(checked ? [promotion.id] : [])])
  }

  // Freigegebene und übersprungene (nicht mehr eingereicht) verlassen beide die Liste der eingereichten.
  async function approveSelected() {
    setError(null)
    setStatus(null)
    setBulkBusy(true)
    try {
      const result = await api.admin.approvePromotions(selected)
      afterDecision(selected, bulkStatus(result))
    } catch (err) {
      setError(err.message)
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <section className="admin-approval card" aria-labelledby="admin-approval-title">
      <div className="admin-section-head">
        <h2 id="admin-approval-title" ref={headingRef} tabIndex={-1}>
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
        landet wieder hier; nur bei vertrauenswürdigen Partnern gehen Änderungen an freigegebenen Beiträgen sofort online.
      </p>

      <AdminApprovalToolbar
        filter={filter}
        onFilter={changeFilter}
        selectable={!showDecided}
        total={selectable.length}
        selectedCount={selected.length}
        overLimit={(pending?.length ?? 0) > MAX_SAMMEL_FREIGABE}
        bulkBusy={bulkBusy}
        onSelectAll={(checked) => setSelectedIds(checked ? selectable : [])}
        onApproveSelected={approveSelected}
      />

      <p className="admin-approval-status" role="status">
        {status}
      </p>
      {(error || loadError) && (
        <div className="error-banner" role="alert">
          {error || loadError}
        </div>
      )}
      {rows === undefined && !loadError && <p className="muted">Lade …</p>}
      {rows?.length === 0 && <p className="muted">{showDecided ? 'Noch keine Entscheidungen.' : 'Nichts zu prüfen – alle Beiträge sind bearbeitet.'}</p>}
      {rows?.length > 0 && (
        <ul className="admin-approval-list">
          {rows.map((promotion) => (
            <AdminPostApprovalItem
              key={promotion.id}
              promotion={promotion}
              mode={filter}
              busy={busyId === promotion.id || bulkBusy}
              selected={selected.includes(promotion.id)}
              refreshKey={showDecided ? decidedKey : version}
              onSelect={!showDecided && selectable.includes(promotion.id) ? select : undefined}
              onApprove={approve}
              onReject={reject}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
