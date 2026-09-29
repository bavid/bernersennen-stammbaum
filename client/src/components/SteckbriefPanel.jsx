import { useEffect, useState } from 'react'
import { api } from '../api'
import Icon from './Icon.jsx'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { STECKBRIEF_PUBLISHABLE_STATUS, vermittlungStatusLabel } from '../lib/vermittlung.js'

const COPIED_MS = 2000

// „Verfügbar“, „Reserviert“ oder „Pausiert (on hold)“ - aus den gemeinsamen Beschriftungen.
const PUBLISHABLE_STATUS_TEXT = (() => {
  const quoted = STECKBRIEF_PUBLISHABLE_STATUS.map((status) => `„${vermittlungStatusLabel(status)}“`)
  return `${quoted.slice(0, -1).join(', ')} oder ${quoted[quoted.length - 1]}`
})()

// Steckbrief-Verwaltung auf der Tierseite im Tierheim: veröffentlichen erzeugt einen öffentlichen
// Link /t/:slug (server: PUT /api/dogs/:id/steckbrief { published }), zurückziehen löscht ihn wieder.
// onDogChange bekommt die rohe, aktualisierte Hund-Zeile vom Server - DogDetailPage mischt sie in den
// bestehenden (angereicherten) dog-State (siehe handleSteckbriefChange dort).
export default function SteckbriefPanel({ dog, onDogChange }) {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return undefined
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const canPublish = STECKBRIEF_PUBLISHABLE_STATUS.includes(dog.vermittlung_status)
  const link = dog.public_slug ? `${window.location.origin}/t/${dog.public_slug}` : null

  async function setPublished(published) {
    setError(null)
    setSaving(true)
    try {
      const updated = await api.setSteckbrief(dog.id, published)
      onDogChange(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      // Ohne Zwischenablage-Recht bleibt der Link zum Markieren/Abtippen sichtbar.
    }
  }

  return (
    <section className="steckbrief-panel" aria-labelledby="steckbrief-panel-title">
      <h2 id="steckbrief-panel-title">Steckbrief</h2>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {dog.public_slug ? (
        <>
          <p className="steckbrief-status is-public">
            <Icon name="globe" /> Öffentlich
          </p>
          <p className="steckbrief-link">{link}</p>
          <div className="steckbrief-actions">
            <button type="button" className={`btn ${copied ? 'btn-ink' : 'btn-ghost'}`} onClick={copyLink}>
              <Icon name={copied ? 'check' : 'copy'} />
              {copied ? 'Kopiert' : 'Link kopieren'}
            </button>
            <a className="btn btn-ghost" href={link} target="_blank" rel="noreferrer">
              <Icon name="external" />
              Öffnen
            </a>
            <button type="button" className="btn btn-ghost" disabled={saving || isDemo} onClick={() => setPublished(false)}>
              Zurückziehen
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="steckbrief-status">
            <Icon name="lock" /> Privat – noch nicht veröffentlicht
          </p>
          <button type="button" className="btn btn-primary" disabled={saving || !canPublish || isDemo} onClick={() => setPublished(true)}>
            Steckbrief veröffentlichen
          </button>
          {!canPublish && (
            <p className="field-hint">Veröffentlichen geht nur mit Status {PUBLISHABLE_STATUS_TEXT}.</p>
          )}
        </>
      )}
      {isDemo && <p className="field-hint">{readOnlyHint}</p>}
    </section>
  )
}
