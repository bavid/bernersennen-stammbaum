import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import Icon from './Icon.jsx'
import StackedBar from './StackedBar.jsx'
import { SEGMENTE, formatNumber } from '../lib/adminStats.js'
import { formatDateShort } from '../lib/dates.js'

// Reiter "Kunden-Gutscheine" im Partner-Profil (Phase 5 Task 4): die Stapel, die der Betreiber für den Partner
// angelegt hat, und die Weitergabe-Gutscheine des Bereichs (GET /api/partner-area/vouchers) - je Stapel
// Bezeichnung, Quelle, Verteilungsbalken (wie in der Admin-Übersicht) und die drei Zahlen. "Karten drucken" führt
// zur Druckseite (PartnerPrintPage), solange noch offene Karten da sind. Keine Codes hier - die gibt es nur dort.

export const STACKS_HINT = 'Jede Karte legt für eure Kundschaft eine eigene Chronik an – und zeigt, dass sie von euch kommt.'
export const EMPTY_HINT = 'Noch keine Kunden-Gutscheine. Über „Kunden-Gutschein weitergeben“ unten entstehen eure ersten Karten – oder der Betreiber legt euch einen Stapel an.'

const QUELLE_LABELS = { admin: 'vom Betreiber', weitergabe: 'weitergegeben' }

export function printRoute(batchId) {
  return `/partner-drucken/${encodeURIComponent(batchId)}`
}

function pluralize(count, singular, plural) {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`
}

function StackRow({ row }) {
  const created = formatDateShort(row.erstelltAm)
  return (
    <li className="partner-stack card">
      <div className="partner-stack-head">
        <h3>{row.label}</h3>
        <span className={`pill partner-stack-quelle is-${row.quelle}`}>{QUELLE_LABELS[row.quelle] || row.quelle}</span>
        <span className="muted partner-stack-meta">
          {pluralize(row.size, 'Karte', 'Karten')}
          {created ? ` · seit ${created}` : ''}
        </span>
      </div>
      <StackedBar row={row} />
      <dl className="partner-stack-counts">
        {SEGMENTE.map((segment) => (
          <div key={segment.key}>
            <dt>
              <span className={`stat-dot is-${segment.key}`} aria-hidden="true" />
              {segment.label}
            </dt>
            <dd>{formatNumber(row[segment.key])}</dd>
          </div>
        ))}
      </dl>
      {row.offen > 0 ? (
        <Link to={printRoute(row.id)} className="btn btn-ghost partner-stack-print">
          <Icon name="printer" /> Karten drucken
        </Link>
      ) : (
        <p className="field-hint">Keine offenen Karten mehr in diesem Stapel.</p>
      )}
    </li>
  )
}

export default function PartnerVoucherStacks() {
  const [stacks, setStacks] = useState(undefined)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    api.partnerArea
      .vouchers()
      .then((data) => {
        if (!cancelled) setStacks(Array.isArray(data?.stapel) ? data.stapel : [])
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="partner-voucher-stacks" aria-labelledby="partner-vouchers-title">
      <div className="einblicke-head">
        <div>
          <h2 id="partner-vouchers-title">Kunden-Gutscheine</h2>
          <p className="muted">{STACKS_HINT}</p>
        </div>
        {stacks && stacks.length > 0 && <span className="muted einblicke-count">{pluralize(stacks.length, 'Stapel', 'Stapel')}</span>}
      </div>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {stacks === undefined && !error && <p className="muted">Lade …</p>}
      {stacks && stacks.length === 0 && (
        <div className="empty-state">
          <Icon name="printer" />
          <p>{EMPTY_HINT}</p>
        </div>
      )}
      {stacks && stacks.length > 0 && (
        <ul className="partner-stack-list">
          {stacks.map((row) => (
            <StackRow key={row.id} row={row} />
          ))}
        </ul>
      )}
    </section>
  )
}
