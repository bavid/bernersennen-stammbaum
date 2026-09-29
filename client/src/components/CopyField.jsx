import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'

const COPIED_MS = 2000

// Ein Wert zum Kopieren (Teilen-Bereich im Partner-Profil): Beschriftung oben, der Wert in einem nur lesbaren
// Feld (einzeilig oder mehrzeilig), rechts bzw. darunter "Kopieren". Ohne Zwischenablage-Recht wird der Text
// markiert, damit er sich von Hand kopieren lässt - der Hinweis dazu steht in der Live-Region. code: in
// Festbreitenschrift (HTML-Schnipsel).
export default function CopyField({ id, label, value, hint, multiline = false, code = false, rows = 3 }) {
  const fieldRef = useRef(null)
  const [state, setState] = useState(null) // null | 'copied' | 'manual'

  useEffect(() => {
    if (state !== 'copied') return undefined
    const timer = setTimeout(() => setState(null), COPIED_MS)
    return () => clearTimeout(timer)
  }, [state])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setState('copied')
    } catch {
      fieldRef.current?.focus()
      fieldRef.current?.select()
      setState('manual')
    }
  }

  const Field = multiline ? 'textarea' : 'input'
  const hintId = hint ? `${id}-hint` : undefined

  return (
    <div className={`copy-field${multiline ? ' is-multiline' : ''}${code ? ' is-code' : ''}`}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="copy-field-row">
        <Field
          id={id}
          ref={fieldRef}
          value={value}
          readOnly
          rows={multiline ? rows : undefined}
          aria-describedby={hintId}
          onFocus={(event) => event.target.select()}
        />
        <button type="button" className={`btn ${state === 'copied' ? 'btn-ink' : 'btn-ghost'}`} onClick={handleCopy}>
          <Icon name={state === 'copied' ? 'check' : 'copy'} />
          {state === 'copied' ? 'Kopiert' : 'Kopieren'}
          <span className="visually-hidden">: {label}</span>
        </button>
      </div>
      {hint && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      <p className={state === 'manual' ? 'field-hint' : 'visually-hidden'} role="status">
        {state === 'copied' && `${label} kopiert.`}
        {state === 'manual' && 'Kopieren ging nicht automatisch – der Text ist markiert, bitte mit Strg+C kopieren.'}
      </p>
    </div>
  )
}
