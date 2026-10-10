import ConfirmButton from '../ConfirmButton.jsx'
import RoleBadge from '../RoleBadge.jsx'
import RoleSelect from '../RoleSelect.jsx'
import VoucherLabel from './VoucherLabel.jsx'
import VoucherShareActions from './VoucherShareActions.jsx'
import { formatDateShort } from '../../lib/dates.js'
import { VOUCHER_STATUS_LABEL } from '../../lib/voucherCode.js'
import { canPrintGift } from '../../lib/geschenkkarte.js'
import { t } from '../../lib/i18n/index.js'

function statusText(voucher) {
  if (voucher.status === 'eingelöst' && voucher.redeemed_at) {
    return t('Eingelöst am {date}', { date: formatDateShort(voucher.redeemed_at) })
  }
  return VOUCHER_STATUS_LABEL[voucher.status] ? t(VOUCHER_STATUS_LABEL[voucher.status]) : voucher.status
}

// Ein Code im Einladen-Dialog. roleOptions (Phase R, nur in einer Familie): welche Rollen die eigene Rolle vergeben
// darf - die Rolle stellt man ein, BEVOR man Code oder Link weitergibt (onRoleChange); eingelöste Einladungen zeigen
// sie nur noch an. Phase V2b: die eigene Notiz (nur bei eigenen Codes, onLabelChange) und - solange nicht
// eingelöst - „Zurückziehen“ (onDelete, nur wenn canDelete). disabled sperrt alles Schreibende (Demo, Admin-Ansicht).
// onGift (Zuhause verschenken): „Als Geschenkkarte drucken“ neben einem offenen Einladungscode - der Code geht als State weiter.
export default function VoucherRow({ voucher, roleOptions = [], onRoleChange, onLabelChange, onDelete, canDelete, disabled, onGift }) {
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
            {t('Besuch')}
            {voucher.status === 'offen' && voucher.expires_at ? ` · ${t('bis {date}', { date: formatDateShort(voucher.expires_at) })}` : ''}
          </span>
        )}
        {voucher.rolle && !canChooseRole && <RoleBadge rolle={voucher.rolle} />}
        {/* Phase V5: steht schon auf gedruckten Karten (Visitenkarten oder Druckseite eines Stapels). */}
        {voucher.gedruckt && voucher.status === 'offen' && <span className="pill pill-gedruckt">{t('gedruckt')}</span>}
      </div>
      {voucher.eigen && onLabelChange && (
        <div className="voucher-row-label">
          <VoucherLabel label={voucher.label} readOnly={disabled} onSave={(label) => onLabelChange(voucher, label)} />
        </div>
      )}
      {canChooseRole && (
        <label className="voucher-row-role">
          <span className="field-hint">{t('Tritt bei als')}</span>
          <RoleSelect
            value={voucher.rolle || 'mitglied'}
            options={roleOptions}
            disabled={disabled}
            onChange={(rolle) => onRoleChange(voucher, rolle)}
          />
        </label>
      )}
      {voucher.code && <VoucherShareActions code={voucher.code} />}
      {onGift && canPrintGift(voucher) && (
        <button type="button" className="btn btn-ghost btn-compact voucher-row-gift" onClick={() => onGift(voucher.code)}>
          {t('Als Geschenkkarte drucken')}
        </button>
      )}
      {/* Ein beschädigter Code (Server: codeFehler) lässt sich nicht weitergeben - nur zurückziehen. */}
      {voucher.codeFehler && <p className="field-error voucher-row-broken">{t('Code nicht lesbar – bitte zurückziehen.')}</p>}
      {deletable && (
        <ConfirmButton
          className="voucher-row-delete"
          label={voucher.status === 'offen' ? 'Zurückziehen' : 'Löschen'}
          confirmLabel={voucher.status === 'offen' ? 'Wirklich zurückziehen und löschen?' : 'Wirklich löschen?'}
          ariaLabel={voucher.status === 'offen' ? t('Code …{hint} zurückziehen und löschen', { hint: voucher.hint }) : t('Code …{hint} löschen', { hint: voucher.hint })}
          disabled={disabled}
          onConfirm={() => onDelete(voucher)}
        />
      )}
    </li>
  )
}
