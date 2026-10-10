import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import Icon from './Icon.jsx'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { displayName } from '../lib/timeline.js'
import { startpaketRoute } from '../lib/startpaket.js'
import { t } from '../lib/i18n/index.js'

const COPIED_MS = 2000

// Übergabe-Gutschein für ein Tier des Tierheims: erst ein Hinweistext erklärt die Folgen (ein früherer
// Übergabe-Code wird ungültig, das Tier gilt als "reserviert"), erst ein bewusster Klick auf "Übergabe-
// Gutschein erzeugen" ruft den Server - das bloße Öffnen des Dialogs darf nichts anlegen. dog: das Tier,
// für das der Gutschein gilt. onCreated: informiert die Tierseite, dass der Status jetzt "reserviert"
// ist (Server: POST /api/dogs/:id/handover setzt vermittlung_status).
export default function HandoverDialog({ dog, onCreated }) {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState(null)

  useEffect(() => {
    if (!copied) return undefined
    const timer = setTimeout(() => setCopied(null), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  async function handleCreate() {
    setError(null)
    setCreating(true)
    try {
      const data = await api.createHandover(dog.id)
      setResult(data)
      onCreated?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function copy(text, which) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
    } catch {
      // Ohne Zwischenablage-Recht bleiben Code/Link zum Markieren/Abtippen sichtbar.
    }
  }

  const name = displayName(dog)

  if (!result) {
    return (
      <div className="handover-dialog handover-dialog-confirm">
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        <p>
          {t('Es wird ein Übergabe-Code erzeugt, {name} wird als reserviert markiert; ein früherer Übergabe-Code wird ungültig.', { name })}
        </p>
        <button type="button" className="btn btn-primary btn-block" disabled={creating || isDemo} onClick={handleCreate}>
          {creating ? t('Erzeuge …') : t('Übergabe-Code erzeugen')}
        </button>
        {isDemo && <p className="field-hint">{readOnlyHint}</p>}
      </div>
    )
  }

  const fullLink = `${window.location.origin}${result.link}`
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <div className="handover-dialog">
      <p className="handover-code">{result.code}</p>
      <button type="button" className={`btn ${copied === 'code' ? 'btn-ink' : 'btn-ghost'} btn-block`} onClick={() => copy(result.code, 'code')}>
        <Icon name={copied === 'code' ? 'check' : 'copy'} />
        {copied === 'code' ? t('Kopiert') : t('Code kopieren')}
      </button>
      <p className="handover-link">{fullLink}</p>
      <div className="handover-actions">
        <button type="button" className={`btn ${copied === 'link' ? 'btn-ink' : 'btn-ghost'}`} onClick={() => copy(fullLink, 'link')}>
          <Icon name={copied === 'link' ? 'check' : 'copy'} />
          {copied === 'link' ? t('Kopiert') : t('Link kopieren')}
        </button>
        {canShare && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => navigator.share({ title: t('Übergabe – {name}', { name }), text: result.code, url: fullLink })}
          >
            <Icon name="share" />
            {t('Teilen')}
          </button>
        )}
      </div>
      {/* Startpaket: der Code reist nur im Navigations-State mit, nie in der Adresse (pages/StartpaketPage.jsx). */}
      <Link className="btn btn-ghost btn-block" to={startpaketRoute(dog.id)} state={{ handover: result }}>
        <Icon name="printer" />
        {t('Startpaket drucken')}
      </Link>
      <p className="field-hint">
        {t('Gebt den Code den neuen Menschen – beim Einlösen zieht {name} mit der ganzen Chronik zu ihnen.', { name })}
      </p>
    </div>
  )
}
