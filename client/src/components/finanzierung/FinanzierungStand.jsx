import { formatEuroCents } from '../../lib/discover.js'
import { postenText, saldoText } from '../../lib/finanzierungRuecklage.js'
import { t } from '../../lib/i18n/index.js'

// Der Stand auf /finanzierung (über den Quartalen): Kosten pro Jahr hochgerechnet (mit den laufenden Posten) und der
// Saldo - ehrlich auch im Minus („Zurzeit tragen wir … € selbst“), ohne Alarmfarbe. Nur Darstellung; die Seite zeigt es
// nur, wenn der Admin Zahlen eingetragen hat. data: GET /api/finanzierung.
export default function FinanzierungStand({ data }) {
  if (!data?.kosten) return null
  const posten = data.kosten.posten || []
  return (
    <dl className="finanz-stand">
      <div className="finanz-stand-item">
        <dt>{t('Kosten pro Jahr (hochgerechnet)')}</dt>
        <dd>
          <strong className="finanz-stand-value">{formatEuroCents(data.kosten.proJahrCents)}</strong>
          {posten.length > 0 && <span className="finanz-stand-detail">{posten.map(postenText).join(' · ')}</span>}
        </dd>
      </div>
      <div className="finanz-stand-item">
        <dt>{t('Stand bisher')}</dt>
        <dd>
          <strong className="finanz-stand-value">{saldoText(data.saldoCents)}</strong>
          <span className="finanz-stand-detail">{t('Spenden minus Kosten seit dem Start.')}</span>
        </dd>
      </div>
    </dl>
  )
}
