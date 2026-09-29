import { formatNumber, plural } from '../lib/adminStats.js'

// Partner-Status in der Übersicht: vier Chips mit Zählern (Farben wie die Status-Pills in AdminPartners),
// dann Einblicke, Beiträge je Freigabe und ungelesene Nachrichten. Eingereichte Beiträge springen zur Karte
// „Zur Freigabe“ (Anker wie der Zähler im Admin-Kopf). Nachrichten nur als Zahl - ihr Inhalt bleibt beim Partner.
const STATUS = [
  { key: 'entwurf', label: 'Entwurf', className: 'admin-partner-status-entwurf' },
  { key: 'aktiv', label: 'Aktiv', className: 'admin-partner-status-aktiv' },
  { key: 'pausiert', label: 'Pausiert', className: 'admin-partner-status-pausiert' },
  { key: 'gesperrt', label: 'Gesperrt', className: 'stat-chip-gesperrt' }
]

export default function AdminStatsPartnerStatus({ partner }) {
  const { status = {}, einblicke = 0, beitraege = {}, ungeleseneNachrichten = 0 } = partner ?? {}
  const eingereicht = beitraege.eingereicht ?? 0

  return (
    <div className="stat-partner">
      <ul className="stat-chips" aria-label="Partner nach Status">
        {STATUS.map((item) => (
          <li key={item.key} className={`pill ${item.className}`}>
            {formatNumber(status[item.key])} {item.label}
          </li>
        ))}
      </ul>
      <dl className="stat-facts">
        <div>
          <dt>Einblicke</dt>
          <dd>{formatNumber(einblicke)}</dd>
        </div>
        <div>
          <dt>Beiträge der Partner</dt>
          <dd className="stat-beitraege">
            {eingereicht > 0 ? (
              <a href="#admin-approval-title" className="pill freigabe-chip freigabe-chip-eingereicht stat-beitraege-link">
                {formatNumber(eingereicht)} eingereicht
              </a>
            ) : (
              <span>0 eingereicht</span>
            )}
            <span>{formatNumber(beitraege.freigegeben)} freigegeben</span>
            <span>{formatNumber(beitraege.abgelehnt)} abgelehnt</span>
          </dd>
        </div>
        <div>
          <dt>Ungelesene Nachrichten</dt>
          <dd>{plural(ungeleseneNachrichten, 'Nachricht', 'Nachrichten')}</dd>
        </div>
      </dl>
    </div>
  )
}
