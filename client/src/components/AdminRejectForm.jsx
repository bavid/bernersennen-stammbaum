import { useEffect, useRef, useState } from 'react'
import { ABLEHNUNG_VORLAGEN, SONSTIGES, composeGrund, maxZusatzLength, rejectionError } from '../lib/adminApproval.js'

// Ablehnen eines Beitrags (V-Fehler 3): ein Grund aus den Vorlagen (lib/adminApproval.js ABLEHNUNG_VORLAGEN) und ein
// optionaler Zusatz - bei "Sonstiges" ist der Text der Grund und damit Pflicht. Darunter, was der Partner liest.
// onSubmit({ vorlage, text }) gibt true zurück, wenn es geklappt hat.
export default function AdminRejectForm({ promotionId, busy, onSubmit, onCancel }) {
  const [vorlage, setVorlage] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState(null)
  const vorlageRef = useRef(null)
  const textRef = useRef(null)
  const ids = { vorlage: `admin-reject-vorlage-${promotionId}`, text: `admin-reject-text-${promotionId}` }
  const isSonstiges = vorlage === SONSTIGES
  const preview = vorlage ? composeGrund(vorlage, text) : ''
  const errorFor = (field) => (error?.field === field ? error.message : null)
  const describedBy = (field, extra) => [extra, errorFor(field) && `${ids[field]}-error`].filter(Boolean).join(' ') || undefined

  // Der Knopf "Ablehnen …" verschwindet beim Öffnen - der Fokus geht gleich auf die Auswahl des Grundes.
  useEffect(() => {
    vorlageRef.current?.focus()
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    const problem = rejectionError(vorlage, text)
    setError(problem)
    if (problem) {
      const target = problem.field === 'vorlage' ? vorlageRef : textRef
      target.current?.focus()
      return
    }
    await onSubmit({ vorlage, text: text.trim() })
  }

  return (
    <form className="admin-approval-reject form-stack" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label className="field-label" htmlFor={ids.vorlage}>
          Grund für die Ablehnung
        </label>
        <select
          ref={vorlageRef}
          id={ids.vorlage}
          value={vorlage}
          onChange={(e) => {
            setVorlage(e.target.value)
            setError(null)
          }}
          aria-invalid={errorFor('vorlage') ? true : undefined}
          aria-describedby={describedBy('vorlage')}
        >
          <option value="">Bitte wählen</option>
          {ABLEHNUNG_VORLAGEN.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        {errorFor('vorlage') && (
          <p className="field-error" id={`${ids.vorlage}-error`} role="alert">
            {errorFor('vorlage')}
          </p>
        )}
      </div>

      <div className="field">
        <label className="field-label" htmlFor={ids.text}>
          {isSonstiges ? 'Grund' : 'Zusatz (optional)'}
        </label>
        <textarea
          ref={textRef}
          id={ids.text}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setError(null)
          }}
          maxLength={maxZusatzLength(vorlage)}
          rows={2}
          aria-invalid={errorFor('text') ? true : undefined}
          aria-describedby={describedBy('text', `${ids.text}-hint`)}
        />
        <p className="field-hint" id={`${ids.text}-hint`}>
          Der Partner sieht den Grund bei seinem Beitrag – kurz und konkret hilft am meisten.
        </p>
        {errorFor('text') && (
          <p className="field-error" id={`${ids.text}-error`} role="alert">
            {errorFor('text')}
          </p>
        )}
      </div>

      {preview && <p className="admin-approval-grund-preview">Der Partner liest: „{preview}“</p>}

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-danger" disabled={busy}>
          Ablehnen
        </button>
      </div>
    </form>
  )
}
