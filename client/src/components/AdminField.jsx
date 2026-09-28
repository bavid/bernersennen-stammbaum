// Ein Formularfeld im Admin (Empfehlungen, Spendenberichte): Label, Eingabe (children), optionaler
// Hinweis und Feldfehler direkt am Feld. Die Eingabe selbst bekommt id/aria-* über fieldProps, damit
// Screenreader Hinweis und Fehler mit vorlesen.

export function fieldProps(id, { error, hint } = {}) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ')
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy || undefined
  }
}

export default function AdminField({ id, label, error, hint, hintClassName = 'field-hint', className = '', children }) {
  return (
    <div className={`field ${className}`.trim()}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && (
        <p className={hintClassName} id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
