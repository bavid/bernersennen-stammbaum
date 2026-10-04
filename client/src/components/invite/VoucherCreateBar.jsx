import Icon from '../Icon.jsx'

// Phase V2b: „Neuen Code erstellen“ mit der Obergrenze offener Codes (limit aus GET /api/vouchers/grenze:
// { offen, max, frei }; ohne Grenze max null). Bei vollem Kontingent gesperrt, mit Erklärung.
export default function VoucherCreateBar({ limit, onCreate, busy, disabled }) {
  const full = Boolean(limit && limit.max !== null && limit.frei === 0)
  return (
    <div className="voucher-create">
      <button type="button" className="btn btn-primary" disabled={disabled || busy || full || !limit} onClick={onCreate}>
        <Icon name="plus" />
        {busy ? 'Erstelle …' : 'Neuen Code erstellen'}
      </button>
      {limit && limit.max !== null && (
        <p className="field-hint" role="status">
          {full
            ? `Du hast ${limit.offen} von ${limit.max} offenen Codes. Ein neuer geht erst, wenn einer eingelöst, zurückgezogen oder abgelaufen ist.`
            : `${limit.offen} von ${limit.max} offenen Codes – Familien-Einladungen, Besuche und Einladungscodes zusammen.`}
        </p>
      )}
    </div>
  )
}
