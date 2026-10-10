import Icon from '../Icon.jsx'
import { t } from '../../lib/i18n/index.js'

// Phase V2b: „Neuen Code erstellen“ mit der Obergrenze offener Codes (limit aus GET /api/vouchers/grenze:
// { offen, max, frei }; ohne Grenze max null). Bei vollem Kontingent gesperrt, mit Erklärung.
export default function VoucherCreateBar({ limit, onCreate, busy, disabled }) {
  const full = Boolean(limit && limit.max !== null && limit.frei === 0)
  return (
    <div className="voucher-create">
      <button type="button" className="btn btn-primary" disabled={disabled || busy || full || !limit} onClick={onCreate}>
        <Icon name="plus" />
        {busy ? t('Erstelle …') : t('Neuen Code erstellen')}
      </button>
      {limit && limit.max !== null && (
        <p className="field-hint" role="status">
          {full
            ? t('Du hast {n} von {max} offenen Codes. Ein neuer geht erst, wenn einer eingelöst, zurückgezogen oder abgelaufen ist.', { n: limit.offen, max: limit.max })
            : t('{n} von {max} offenen Codes – Familien-Einladungen, Besuche und Einladungscodes zusammen.', { n: limit.offen, max: limit.max })}
        </p>
      )}
    </div>
  )
}
