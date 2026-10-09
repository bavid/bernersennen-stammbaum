import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { useT } from '../lib/i18n/index.js'

// Passwort-/Schlüsselfeld mit Anzeigen/Verbergen-Knopf. Wird auf der Login-Seite (Anmelden, Gutschein
// einlösen, Wiederherstellung) und künftig im Zugang-Bereich der Einstellungen mehrfach gebraucht.
// autoFocus fokussiert ohne zu scrollen (Audit V7a): am Handy stünde die Login-Seite sonst schon beim Laden unter
// dem Willkommens-Teil - Tastatur und Screenreader landen trotzdem im Feld.
export default function PasswordField({ id, label, value, onChange, autoFocus, autoComplete, minLength, error, required = true }) {
  const t = useT()
  const [visible, setVisible] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true })
  }, [autoFocus])
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="password-input">
        <input
          ref={inputRef}
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
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
          aria-label={visible ? t('login.password.hide') : t('login.password.show')}
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
