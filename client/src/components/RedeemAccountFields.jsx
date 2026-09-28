import Icon from './Icon.jsx'
import PasswordField from './PasswordField.jsx'

const ACCOUNT_PASSWORD_MIN = 8
const EMAIL_MAX_LENGTH = 120
const PANEL_ID = 'redeem-account-panel'

export const EMPTY_ACCOUNT = { open: false, username: '', password: '', email: '' }

// Felder für api.redeemVoucher: nur ausgefüllte Angaben, und nur solange der Bereich aufgeklappt ist.
export function accountPayload(account) {
  if (!account.open) return {}
  const payload = { username: account.username, password: account.password, email: account.email }
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value))
}

// Aufklappbar "Benutzername und eigenes Passwort (optional)" beim Einlösen eines Gutscheins - geteilt
// zwischen Kunden-Gutschein ("Meine Chronik") und Partner-Zugang (RedeemForm). value/onChange: das
// ganze Objekt { open, username, password, email }, onChange bekommt jeweils eine neue Kopie.
export default function RedeemAccountFields({ value, onChange }) {
  function update(patch) {
    onChange({ ...value, ...patch })
  }

  return (
    <>
      <button
        type="button"
        className="expand-toggle"
        aria-expanded={value.open}
        aria-controls={PANEL_ID}
        onClick={() => update({ open: !value.open })}
      >
        Benutzername und eigenes Passwort (optional)
        <Icon name="chevronDown" className={value.open ? 'is-flipped' : ''} />
      </button>
      {value.open && (
        <div id={PANEL_ID} className="redeem-account form-stack">
          <div className="field">
            <label className="field-label" htmlFor="redeem-username">
              Benutzername
            </label>
            <input
              id="redeem-username"
              value={value.username}
              onChange={(e) => update({ username: e.target.value })}
              autoComplete="username"
            />
          </div>
          <PasswordField
            id="redeem-password"
            label="Passwort"
            value={value.password}
            onChange={(password) => update({ password })}
            autoComplete="new-password"
            minLength={ACCOUNT_PASSWORD_MIN}
            required={false}
          />
          <div className="field">
            <label className="field-label" htmlFor="redeem-email">
              E-Mail <span className="muted">(optional)</span>
            </label>
            <input
              id="redeem-email"
              type="email"
              value={value.email}
              onChange={(e) => update({ email: e.target.value })}
              maxLength={EMAIL_MAX_LENGTH}
            />
            <span className="field-hint">Nur für Rückfragen, keine Werbung.</span>
          </div>
        </div>
      )}
    </>
  )
}
