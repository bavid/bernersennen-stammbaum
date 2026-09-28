import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import Icon from './Icon.jsx'
import { displayName } from '../lib/timeline.js'

const COPIED_MS = 2000

// Übergabe-Gutschein für ein Tier des Tierheims: wird beim Öffnen sofort erzeugt (wie KeyReveal einen
// Schlüssel sofort zeigt, ohne eigenen "Erzeugen"-Knopf) und zeigt Code und Link groß zum Kopieren/
// Teilen. dog: das Tier, für das der Gutschein gilt. onCreated: informiert die Tierseite, dass der
// Status jetzt "reserviert" ist (Server: POST /api/dogs/:id/handover setzt vermittlung_status).
export default function HandoverDialog({ dog, onCreated }) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    api
      .createHandover(dog.id)
      .then((data) => {
        setResult(data)
        onCreated?.()
      })
      .catch((err) => setError(err.message))
  }, [dog.id, onCreated])

  useEffect(() => {
    if (!copied) return undefined
    const timer = setTimeout(() => setCopied(null), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy(text, which) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
    } catch {
      // Ohne Zwischenablage-Recht bleiben Code/Link zum Markieren/Abtippen sichtbar.
    }
  }

  if (error) {
    return (
      <div className="error-banner" role="alert">
        {error}
      </div>
    )
  }

  if (!result) return <div className="handover-dialog is-loading" aria-busy="true" />

  const fullLink = `${window.location.origin}${result.link}`
  const name = displayName(dog)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <div className="handover-dialog">
      <p className="handover-code">{result.code}</p>
      <button type="button" className={`btn ${copied === 'code' ? 'btn-ink' : 'btn-ghost'} btn-block`} onClick={() => copy(result.code, 'code')}>
        <Icon name={copied === 'code' ? 'check' : 'copy'} />
        {copied === 'code' ? 'Kopiert' : 'Code kopieren'}
      </button>
      <p className="handover-link">{fullLink}</p>
      <div className="handover-actions">
        <button type="button" className={`btn ${copied === 'link' ? 'btn-ink' : 'btn-ghost'}`} onClick={() => copy(fullLink, 'link')}>
          <Icon name={copied === 'link' ? 'check' : 'copy'} />
          {copied === 'link' ? 'Kopiert' : 'Link kopieren'}
        </button>
        {canShare && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => navigator.share({ title: `Übergabe – ${name}`, text: result.code, url: fullLink })}
          >
            <Icon name="share" />
            Teilen
          </button>
        )}
      </div>
      <p className="field-hint">
        Gebt den Code den neuen Menschen – beim Einlösen zieht {name} mit der ganzen Chronik zu ihnen.
      </p>
    </div>
  )
}
