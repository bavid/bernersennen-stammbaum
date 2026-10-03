import { useEffect, useState } from 'react'
import { api } from '../api'
import { useToast } from './Toast.jsx'
import Icon from './Icon.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import PasswordField from './PasswordField.jsx'
import KeyReveal from './KeyReveal.jsx'
import { relativeTime } from '../lib/dates.js'
import { formatVoucherCode } from '../lib/voucherCode.js'

const ARM_TIMEOUT_MS = 5000
const USER_PASSWORD_MIN = 8
const EMAIL_MAX_LENGTH = 120

// Welches Feld will der Server als aktuellen Berechtigungsnachweis sehen (verifyCurrentCredential in
// routes/auth.js), abhängig von family.auth.kind ("user"/"key"/"legacy", siehe buildMe)? Fehlt auth
// (ältere Antwort, oder ein Test ohne dieses Feld), gilt "key" als Rückfall - der häufigste Fall.
// { currentPassword } gilt für "user" (gegen das EIGENE Passwort des Benutzers) UND "legacy" (gegen das
// Bereichs-Passwort der Alt-Familie); { password } bleibt dadurch in POST /users ausschließlich das
// Passwort des neu angelegten Benutzers, ohne Kollision mit dem Nachweis-Feld.
const RENEW_WARNING_DEFAULT = 'Alle anderen Geräte müssen sich danach neu anmelden.'
const RENEW_WARNING_LEGACY = 'Danach meldet ihr euch zusätzlich mit dem Schlüssel an – euer bisheriges Passwort funktioniert weiterhin.'

const AUTH_COPY = {
  user: {
    label: 'Zur Bestätigung: dein Passwort',
    field: 'currentPassword',
    mono: false,
    autoComplete: 'current-password',
    renewWarning: RENEW_WARNING_DEFAULT
  },
  legacy: {
    label: 'Zur Bestätigung: euer bisheriges Passwort',
    field: 'currentPassword',
    mono: false,
    autoComplete: 'current-password',
    renewWarning: RENEW_WARNING_LEGACY
  },
  key: {
    label: 'Zur Bestätigung: euer aktueller Schlüssel',
    field: 'currentKey',
    mono: true,
    autoComplete: 'off',
    renewWarning: RENEW_WARNING_DEFAULT
  }
}

// Auch die Mitglieder-Seite (FamilyKeySection) fragt so nach dem eigenen Nachweis, bevor sie den
// Schlüssel der Familie erneuert.
export function authCopyFor(family) {
  const kind = family?.auth?.kind
  return AUTH_COPY[kind] || AUTH_COPY.key
}

// Schlüssel erneuern: zweistufige Bestätigung wie beim Umbenennen/Verlassen (RenameFamilyForm,
// LeaveFamilySection), zusätzlich der gemeinsame Berechtigungsnachweis von oben - der Server lehnt ohne
// ihn mit 403 ab (Schutz gegen Übernahme: eine bloße Sitzung darf keinen neuen Schlüssel erzeugen und
// damit jedes andere Gerät aussperren).
function RenewKeySection({ family, confirmPayload, hasConfirm, onRenewed, onFamilyChange }) {
  const [armed, setArmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [newKey, setNewKey] = useState(null)
  const copy = authCopyFor(family)

  useEffect(() => {
    if (!armed) return undefined
    const timer = setTimeout(() => setArmed(false), ARM_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [armed])

  async function handleClick() {
    if (!armed) {
      setArmed(true)
      return
    }
    setError(null)
    setSaving(true)
    try {
      const { key } = await api.renewKey(confirmPayload)
      setNewKey(key)
      onRenewed?.()
      // Der Server erwartet ab jetzt currentKey statt currentPassword (siehe AUTH_COPY/currentAuthInfo)
      // – family.auth.kind muss also mitziehen, sonst schlägt die nächste Bestätigung (Benutzer
      // anlegen/entfernen, erneut erneuern) mit dem alten Nachweis fehl.
      try {
        const me = await api.me()
        onFamilyChange?.({ ...family, ...me })
      } catch {
        onFamilyChange?.({ ...family, auth: { kind: 'key' } })
      }
    } catch (err) {
      setError(err.message)
      setSaving(false)
      setArmed(false)
    }
  }

  if (newKey) {
    return <KeyReveal value={newKey} continueLabel="Fertig" onContinue={() => setNewKey(null)} showCardHint={false} />
  }

  return (
    <div className="access-key">
      <h4>Schlüssel erneuern</h4>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {armed && (
        <div className="warning-banner" role="note">
          <Icon name="alert" />
          <div>
            <strong>{copy.renewWarning}</strong>
            <p>Nur dieses Gerät bleibt angemeldet. Überall sonst braucht ihr danach den neuen Schlüssel.</p>
          </div>
        </div>
      )}
      <p className="field-hint">
        Benutzer bleiben beim Erneuern bestehen – entfernt sie unten, wenn jemand keinen Zugang mehr haben soll.
      </p>
      <button
        type="button"
        className={`btn ${armed ? 'btn-warning' : 'btn-ghost'}`}
        onClick={handleClick}
        disabled={saving || !hasConfirm}
      >
        <Icon name={armed ? 'check' : 'lock'} />
        {saving ? 'Erneuere …' : armed ? 'Ja, Schlüssel erneuern' : 'Schlüssel erneuern'}
      </button>
    </div>
  )
}

// Ein eigener Benutzer-Login ist ein zusätzlicher, dauerhafter Zugang - auch dafür verlangt der Server
// den aktuellen Berechtigungsnachweis (confirmField/confirmValue, siehe AccessSettings), zusätzlich zum
// eigenen Passwort des NEU angelegten Benutzers (nie derselbe Feldname, siehe AUTH_COPY oben).
function AddUserForm({ confirmField, confirmValue, onAdded, onCancel }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const payload = { username, password, email: email || undefined, [confirmField]: confirmValue }
      const user = await api.createUser(payload)
      onAdded(user)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <div className="field">
        <label className="field-label" htmlFor="access-new-username">
          Benutzername
        </label>
        <input
          id="access-new-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          required
        />
      </div>
      <PasswordField
        id="access-new-password"
        label="Passwort"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        minLength={USER_PASSWORD_MIN}
      />
      <div className="field">
        <label className="field-label" htmlFor="access-new-email">
          E-Mail <span className="muted">(optional)</span>
        </label>
        <input id="access-new-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={EMAIL_MAX_LENGTH} />
        <span className="field-hint">Nur für Rückfragen, keine Werbung.</span>
      </div>
      <div className="form-actions">
        <span className="form-actions-spacer" />
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving || !username || !password}>
          {saving ? 'Lege an …' : 'Benutzer anlegen'}
        </button>
      </div>
    </form>
  )
}

function UsersSection({ confirmField, confirmValue, hasConfirm }) {
  const toast = useToast()
  const [users, setUsers] = useState(undefined)
  const [error, setError] = useState(null)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    api
      .listUsers()
      .then(setUsers)
      .catch((err) => setError(err.message))
  }, [])

  function handleAdded(user) {
    setUsers((list) => [...(list || []), user])
    setShowAdd(false)
    toast(`Benutzer „${user.username}“ angelegt.`)
  }

  async function handleDelete(user) {
    try {
      await api.deleteUser(user.id, { [confirmField]: confirmValue })
      setUsers((list) => list.filter((u) => u.id !== user.id))
      toast(`Benutzer „${user.username}“ entfernt.`)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="access-users">
      <h4>Benutzer</h4>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {users === undefined && !error && <p className="muted">Lade …</p>}
      {users && users.length === 0 && <p className="muted">Noch kein eigener Benutzer angelegt.</p>}
      {users && users.length > 0 && (
        <ul className="access-user-list">
          {users.map((user) => (
            <li key={user.id}>
              <span>
                <strong>{user.username}</strong>
                <span className="muted">
                  {' '}
                  · {user.last_login_at ? `zuletzt angemeldet ${relativeTime(user.last_login_at)}` : 'noch nie angemeldet'}
                </span>
              </span>
              <ConfirmButton
                onConfirm={() => handleDelete(user)}
                label="Entfernen"
                confirmLabel="Wirklich entfernen?"
                ariaLabel={`„${user.username}“ entfernen`}
                disabled={!hasConfirm}
              />
            </li>
          ))}
        </ul>
      )}
      {showAdd ? (
        <AddUserForm confirmField={confirmField} confirmValue={confirmValue} onAdded={handleAdded} onCancel={() => setShowAdd(false)} />
      ) : (
        <button type="button" className="btn btn-ghost" onClick={() => setShowAdd(true)} disabled={!hasConfirm}>
          <Icon name="plus" />
          Benutzer hinzufügen
        </button>
      )}
    </div>
  )
}

// Zugang verwalten: Schlüssel erneuern (Wiederherstellung/PUK, siehe RecoverForm) und eigene
// Benutzer-Logins. Erscheint in FamilySettings nur, wenn die Identität selbst der aktive Bereich ist
// (nicht während man in einem beigetretenen Rudel unterwegs ist) und nie in der Demo. Eine gemeinsame
// Bestätigung (aktuelles Passwort/Schlüssel, je nach family.auth.kind) gilt für alle drei sensiblen
// Aktionen hier - der Server verlangt sie bei jeder einzeln (siehe api.js).
// title (Audit V7a): auf /zugang heißt die Seite selbst schon "Zugang" - dort steht über den Feldern "Schlüssel und Benutzer".
export default function AccessSettings({ family, onFamilyChange, title = 'Zugang' }) {
  const copy = authCopyFor(family)
  const [confirmValue, setConfirmValue] = useState('')

  function handleConfirmChange(value) {
    setConfirmValue(copy.mono ? formatVoucherCode(value) : value)
  }

  const hasConfirm = Boolean(confirmValue)
  const confirmPayload = { [copy.field]: confirmValue }

  return (
    <section className="settings-section access-settings">
      <h3>{title}</h3>
      <div className="field">
        <label className="field-label" htmlFor="access-confirm">
          {copy.label}
        </label>
        <input
          id="access-confirm"
          type={copy.mono ? 'text' : 'password'}
          className={copy.mono ? 'voucher-code-input' : undefined}
          value={confirmValue}
          onChange={(e) => handleConfirmChange(e.target.value)}
          placeholder={copy.mono ? 'XXXX-XXXX-XXXX' : undefined}
          autoComplete={copy.autoComplete}
        />
      </div>
      <RenewKeySection
        family={family}
        confirmPayload={confirmPayload}
        hasConfirm={hasConfirm}
        onRenewed={() => setConfirmValue('')}
        onFamilyChange={onFamilyChange}
      />
      <UsersSection confirmField={copy.field} confirmValue={confirmValue} hasConfirm={hasConfirm} />
    </section>
  )
}
