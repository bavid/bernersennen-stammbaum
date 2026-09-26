import { useEffect, useState } from 'react'
import { api } from '../api'
import Icon from './Icon.jsx'

const COPIED_MS = 2000

function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return undefined
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  async function handleCopy(event) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      // Ohne Zwischenablage-Recht: Text markieren, damit man ihn selbst kopieren kann
      event.currentTarget.previousElementSibling?.select()
    }
  }

  return (
    <div className="copy-field">
      <input readOnly value={value} aria-label={label} onFocus={(e) => e.target.select()} />
      <button type="button" className={`btn ${copied ? 'btn-ink' : 'btn-ghost'}`} onClick={handleCopy}>
        <Icon name={copied ? 'check' : 'copy'} />
        {copied ? 'Kopiert' : 'Kopieren'}
      </button>
    </div>
  )
}

// Wie man jemanden dazuholt: ins eigene Rudel (Adresse + Passwort) oder als neues Rudel (Code)
export default function InviteDialog({ family }) {
  const [inviteCode, setInviteCode] = useState(undefined)
  const [error, setError] = useState(null)
  const address = window.location.origin

  useEffect(() => {
    api
      .invite()
      .then((data) => setInviteCode(data.inviteCode))
      .catch((err) => setError(err.message))
  }, [])

  return (
    <div className="invite">
      <section className="invite-option">
        <span className="invite-step">1</span>
        <div>
          <h3>In „{family.name}“ einladen</h3>
          <p className="muted">
            Schick der Person die Adresse und euer gemeinsames Rudel-Passwort. Dann sieht sie euren Stammbaum und kann
            mitschreiben. Das Passwort schreibst du selbst dazu – es ist aus Sicherheitsgründen nirgends gespeichert.
          </p>
          <CopyField label="Adresse der Chronik" value={address} />
        </div>
      </section>

      <section className="invite-option">
        <span className="invite-step">2</span>
        <div>
          <h3>Ein eigenes Rudel anlegen lassen</h3>
          <p className="muted">
            Wer einen ganz eigenen Stammbaum starten möchte, wählt auf der Startseite „Neues Rudel“ und braucht dafür
            diesen Einladungscode:
          </p>
          {error && <div className="error-banner">{error}</div>}
          {inviteCode === undefined && !error && <p className="muted">Lade …</p>}
          {inviteCode === null && <p className="field-hint">Auf diesem Server braucht man gerade keinen Code.</p>}
          {inviteCode && <CopyField label="Einladungscode" value={inviteCode} />}
        </div>
      </section>
    </div>
  )
}
