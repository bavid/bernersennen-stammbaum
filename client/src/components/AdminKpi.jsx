import { useEffect, useState } from 'react'
import { api } from '../api'
import { Card, Chip, SectionHeader } from './ui'
import { t } from '../lib/i18n/index.js'
import { formatNumber } from '../lib/adminStats.js'
import { DEFAULT_ZEITRAUM, ZEITRAEUME, eingeloestImZeitraum, formatQuote, zielStand } from '../lib/adminKpi.js'

// Karte „Erfolg messen“ (Plan 2027 Kap. 8) im Reiter „Übersicht“: Aktivierung, Wiederkommen und Einlösungen je
// Serie/Kanal aus GET /api/admin/stats/kpi (server/lib/adminKpi.js) - eigene Tabellen, ohne Demo-Daten, ohne Tracking.
// Die Stapel-Verteilung steht schon in AdminStatsStapel; hier nur Zeitraum und Quote je Kanal.
export default function AdminKpi() {
  const [zeitraum, setZeitraum] = useState(DEFAULT_ZEITRAUM)
  const [kpi, setKpi] = useState(undefined)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setKpi(undefined)
    api.admin
      .kpi(zeitraum)
      .then((data) => {
        if (cancelled) return
        setKpi(data)
        setError(null)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [zeitraum])

  const switcher = (
    <div className="segmented segmented-sm" role="group" aria-label={t('Zeitraum')}>
      {ZEITRAEUME.map(({ key, label }) => (
        <button type="button" key={key} aria-pressed={zeitraum === key} onClick={() => setZeitraum(key)}>
          {t(label)}
        </button>
      ))}
    </div>
  )

  return (
    <Card as="section" className="admin-kpi" aria-labelledby="admin-kpi-title">
      <SectionHeader
        id="admin-kpi-title"
        title={t('Erfolg messen')}
        description={t('Drei Zahlen aus den eigenen Tabellen – ohne Demo-Daten, ohne Tracking.')}
        action={switcher}
      />
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {kpi === undefined && !error && <p className="muted">{t('Lade …')}</p>}
      {kpi && <KpiBody kpi={kpi} />}
    </Card>
  )
}

function KpiBody({ kpi }) {
  const { aktivierung, wiederkommen, einloesungen, ziel } = kpi
  return (
    <>
      <dl className="admin-kpi-list">
        <QuoteRow
          label={t('Aktivierung')}
          wert={aktivierung}
          ziel={ziel?.aktivierung}
          hint={t('{erreicht} von {kohorte} neuen Zuhause mit erster Erinnerung binnen 7 Tagen.', aktivierung)}
        />
        <QuoteRow
          label={t('Wiederkommen')}
          wert={wiederkommen}
          ziel={ziel?.wiederkommen}
          hint={t('{erreicht} von {kohorte} Zuhause in Woche 4 aktiv (Erinnerung, Gruß, Einladung oder „Mit dabei“).', wiederkommen)}
        />
        <div className="admin-kpi-row">
          <dt>{t('Einlösungen')}</dt>
          <dd>
            <span className="admin-kpi-value">{formatNumber(eingeloestImZeitraum(einloesungen?.kanaele))}</span>
            <small className="muted">{t('Eingelöste Einladungscodes im Zeitraum, je Serie (FB-…, ANZ-…) oder Partner.')}</small>
          </dd>
        </div>
      </dl>
      <KanalTable kanaele={einloesungen?.kanaele} />
    </>
  )
}

function QuoteRow({ label, wert, ziel, hint }) {
  const stand = zielStand(wert?.quote, ziel)
  return (
    <div className="admin-kpi-row">
      <dt>{label}</dt>
      <dd>
        <span className="admin-kpi-value">{formatQuote(wert?.quote)}</span>
        {stand === 'leer' ? (
          <Chip>{t('noch keine Daten')}</Chip>
        ) : (
          <Chip tone={stand}>{stand === 'ok' ? t('Ziel erreicht') : t('unter Ziel')}</Chip>
        )}
        <small className="muted">
          {hint} {Number.isFinite(ziel) && t('Ziel: mindestens {ziel} %.', { ziel })}
        </small>
      </dd>
    </div>
  )
}

function KanalTable({ kanaele }) {
  if (!kanaele || kanaele.length === 0) return <p className="muted">{t('Keine Einlösungen in diesem Zeitraum')}</p>
  return (
    <div className="admin-table-scroll">
      <table className="admin-table stat-table">
        <thead>
          <tr>
            <th scope="col">{t('Serie / Kanal')}</th>
            <th scope="col" className="stat-num">{t('Stapel')}</th>
            <th scope="col" className="stat-num">{t('Ausgegeben')}</th>
            <th scope="col" className="stat-num">{t('Eingelöst im Zeitraum')}</th>
            <th scope="col" className="stat-num">{t('Quote gesamt')}</th>
          </tr>
        </thead>
        <tbody>
          {kanaele.map((row) => (
            <tr key={row.kanal ?? '-'}>
              <th scope="row">{row.kanal ?? t('Ohne Serie')}</th>
              <td className="stat-num">{formatNumber(row.stapel)}</td>
              <td className="stat-num">{formatNumber(row.ausgegeben)}</td>
              <td className="stat-num">{formatNumber(row.eingeloest)}</td>
              <td className="stat-num">{formatQuote(row.quote)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
