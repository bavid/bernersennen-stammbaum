import { useState } from 'react'
import Icon from './Icon.jsx'

// Passwort-/Schlüsselfeld mit Anzeigen/Verbergen-Knopf. Wird auf der Login-Seite (Anmelden, Gutschein
// einlösen, Wiederherstellung) und künftig im Zugang-Bereich der Einstellungen mehrfach gebraucht.
export default function PasswordField({ id, label, value, onChange, autoFocus, autoComplete, minLength, error, required = true }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="password-input">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          minLength={minLength}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          required={required}
        />
        <button
          type="button"
          className="icon-btn"
          onClick={() => setVisible(!visible)}
          aria-label={visible ? 'Passwort verbergen' : 'Passwort anzeigen'}
        >
          <Icon name={visible ? 'eyeOff' : 'eye'} />
        </button>
      </div>
      {error && (
        <p className="field-error" id={`${id}-error`} role="alert">
          <Icon name="alert" /> {error}
        </p>
      )}
    </div>
  )
}
