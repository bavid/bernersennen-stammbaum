import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import Icon from './Icon.jsx'
import StackedBar from './StackedBar.jsx'
import { SEGMENTE, formatNumber } from '../lib/adminStats.js'
import { formatDateShort } from '../lib/dates.js'
import { EINLADUNGSKARTEN_ROUTE } from './visitenkarte/VisitenkartenTeaser.jsx'
import { t, tOr } from '../lib/i18n/index.js'

// Reiter "Kunden-Gutscheine" im Partner-Profil (Phase 5 Task 4): die Stapel, die der Betreiber für den Partner
// angelegt hat, und die Weitergabe-Gutscheine des Bereichs (GET /api/partner-area/vouchers) - je Stapel
// Bezeichnung, Quelle, Verteilungsbalken (wie in der Admin-Übersicht) und die drei Zahlen. "Karten drucken" führt
// zur Druckseite (PartnerPrintPage), solange noch offene Karten da sind. Keine Codes hier - die gibt es nur dort.
// Die Visitenkarten (Phase V5, je Karte ein Code) erreicht man über die Karte "Visitenkarten" direkt darüber
// (VisitenkartenTeaser) - Audit V7a: ein zweiter Knopf mit fast gleichem Text hier fiel weg. Sind noch offene Codes da,
// führt "Als Einladungskarten drucken" direkt zu den Einladungskarten (vorne ihr, hinten Familie auf Pfoten mit je
// einem dieser Codes).

export const STACKS_HINT = 'Jede Karte legt für eure Kundschaft eine eigene Chronik an – und zeigt, dass sie von euch kommt.'
export const EMPTY_HINT = 'Noch keine Einladungscodes für Kunden. Über „Einladungscode weitergeben“ unten entstehen eure ersten Karten – oder der Betreiber legt euch einen Stapel an.'

const QUELLE_LABELS = { admin: 'vom Betreiber', weitergabe: 'weitergegeben' }

export function printRoute(batchId) {
  return `/partner-drucken/${encodeURIComponent(batchId)}`
}

// singular/plural: Wörterbuch-Schlüssel mit {n}; beim Stapel ist der deutsche Text gleich, daher eigener Schlüssel (tOr).
function pluralize(count, singular, plural) {
  const n = formatNumber(count)
  if (count !== 1) return t(plural, { n })
  return tOr(singular, t(plural, { n }), { n })
}

function StackRow({ row }) {
  const created = formatDateShort(row.erstelltAm)
  return (
    <li className="partner-stack card">
      <div className="partner-stack-head">
        <h3>{row.label}</h3>
        <span className={`pill partner-stack-quelle is-${row.quelle}`}>{QUELLE_LABELS[row.quelle] ? t(QUELLE_LABELS[row.quelle]) : row.quelle}</span>
        <span className="muted partner-stack-meta">
          {pluralize(row.size, '{n} Karte', '{n} Karten')}
          {created ? t(' · seit {date}', { date: created }) : ''}
        </span>
      </div>
      <StackedBar row={row} />
      <dl className="partner-stack-counts">
        {SEGMENTE.map((segment) => (
          <div key={segment.key}>
            <dt>
              <span className={`stat-dot is-${segment.key}`} aria-hidden="true" />
              {t(segment.label)}
            </dt>
            <dd>{formatNumber(row[segment.key])}</dd>
          </div>
        ))}
      </dl>
      {row.offen > 0 ? (
        <Link to={printRoute(row.id)} className="btn btn-ghost partner-stack-print">
          <Icon name="printer" /> {t('Karten drucken')}
        </Link>
      ) : (
        <p className="field-hint">{t('Keine offenen Karten mehr in diesem Stapel.')}</p>
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
          <h2 id="partner-vouchers-title">{t('Einladungscodes für Kunden')}</h2>
          <p className="muted">{t(STACKS_HINT)}</p>
        </div>
        {stacks && stacks.length > 0 && <span className="muted einblicke-count">{pluralize(stacks.length, 'partner.stacks.one', '{n} Stapel')}</span>}
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {stacks === undefined && !error && <p className="muted">{t('Lade …')}</p>}
      {stacks && stacks.length === 0 && (
        <div className="empty-state">
          <Icon name="printer" />
          <p>{t(EMPTY_HINT)}</p>
        </div>
      )}
      {stacks && stacks.some((row) => row.offen > 0) && (
        <p className="partner-stacks-einladung">
          <Link to={EINLADUNGSKARTEN_ROUTE} className="btn btn-ghost">
            <Icon name="printer" /> {t('Als Einladungskarten drucken')}
          </Link>
          <span className="field-hint">{t('Je Karte ein eigener Code – vorne ihr, hinten Familie auf Pfoten.')}</span>
        </p>
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
