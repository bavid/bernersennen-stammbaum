import ConfirmButton from '../ConfirmButton.jsx'
import RoleBadge from '../RoleBadge.jsx'
import RoleSelect from '../RoleSelect.jsx'
import VoucherLabel from './VoucherLabel.jsx'
import VoucherShareActions from './VoucherShareActions.jsx'
import { formatDateShort } from '../../lib/dates.js'
import { VOUCHER_STATUS_LABEL } from '../../lib/voucherCode.js'

function statusText(voucher) {
  if (voucher.status === 'eingelöst' && voucher.redeemed_at) {
    return `Eingelöst am ${formatDateShort(voucher.redeemed_at)}`
  }
  return VOUCHER_STATUS_LABEL[voucher.status] || voucher.status
}

// Ein Code im Einladen-Dialog. roleOptions (Phase R, nur in einer Familie): welche Rollen die eigene Rolle vergeben
// darf - die Rolle stellt man ein, BEVOR man Code oder Link weitergibt (onRoleChange); eingelöste Einladungen zeigen
// sie nur noch an. Phase V2b: die eigene Notiz (nur bei eigenen Codes, onLabelChange) und - solange nicht
// eingelöst - „Zurückziehen“ (onDelete, nur wenn canDelete). disabled sperrt alles Schreibende (Demo, Admin-Ansicht).
export default function VoucherRow({ voucher, roleOptions = [], onRoleChange, onLabelChange, onDelete, canDelete, disabled }) {
  const canChooseRole = voucher.status === 'offen' && voucher.joins && roleOptions.length > 0
  const deletable = canDelete && voucher.status !== 'eingelöst' && onDelete

  return (
    <li className={`voucher-row voucher-row-${voucher.status === 'offen' ? 'open' : 'closed'}`}>
      <div className="voucher-row-main">
        <span className="voucher-code">{voucher.code || `…${voucher.hint}`}</span>
        <span className={`pill ${voucher.status === 'offen' ? '' : 'pill-rust'}`}>{statusText(voucher)}</span>
        {/* Phase V2: Besuchs-Einladung (7 Tage gültig) statt Gutschein für eine eigene Chronik */}
        {voucher.besuch && (
          <span className="pill pill-visit">
            Besuch{voucher.status === 'offen' && voucher.expires_at ? ` · bis ${formatDateShort(voucher.expires_at)}` : ''}
          </span>
        )}
        {voucher.rolle && !canChooseRole && <RoleBadge rolle={voucher.rolle} />}
        {/* Phase V5: steht schon auf gedruckten Karten (Visitenkarten oder Druckseite eines Stapels). */}
        {voucher.gedruckt && voucher.status === 'offen' && <span className="pill pill-gedruckt">gedruckt</span>}
      </div>
      {voucher.eigen && onLabelChange && (
        <div className="voucher-row-label">
          <VoucherLabel label={voucher.label} readOnly={disabled} onSave={(label) => onLabelChange(voucher, label)} />
        </div>
      )}
      {canChooseRole && (
        <label className="voucher-row-role">
          <span className="field-hint">Tritt bei als</span>
          <RoleSelect
            value={voucher.rolle || 'mitglied'}
            options={roleOptions}
            disabled={disabled}
            onChange={(rolle) => onRoleChange(voucher, rolle)}
          />
        </label>
      )}
      {voucher.code && <VoucherShareActions code={voucher.code} />}
      {/* Ein beschädigter Code (Server: codeFehler) lässt sich nicht weitergeben - nur zurückziehen. */}
      {voucher.codeFehler && <p className="field-error voucher-row-broken">Code nicht lesbar – bitte zurückziehen.</p>}
      {deletable && (
        <ConfirmButton
          className="voucher-row-delete"
          label={voucher.status === 'offen' ? 'Zurückziehen' : 'Löschen'}
          confirmLabel={voucher.status === 'offen' ? 'Wirklich zurückziehen und löschen?' : 'Wirklich löschen?'}
          ariaLabel={`Code …${voucher.hint} ${voucher.status === 'offen' ? 'zurückziehen und löschen' : 'löschen'}`}
          disabled={disabled}
          onConfirm={() => onDelete(voucher)}
        />
      )}
    </li>
  )
}
