import { useState } from 'react'
import Icon from './Icon.jsx'
import { Button } from './ui/index.js'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { MAX_BESTAETIGUNG_NOTIZ_LENGTH, artLabel, bestaetigungsMail, terminLabel } from '../lib/geschaeftAnfrage.js'

const COPIED_MS = 2000

function Fakten({ geschaeft }) {
  const fakten = [
    artLabel(geschaeft.art),
    geschaeft.ort,
    geschaeft.bundesweit && 'deutschlandweit tätig',
    geschaeft.telefon && `Tel. ${geschaeft.telefon}`
  ].filter(Boolean)
  return (
    <p className="admin-anfrage-meta">
      {fakten.join(' · ')}
      {geschaeft.webseite && (
        <>
          {' · '}
          <a href={geschaeft.webseite} target="_blank" rel="noopener noreferrer nofollow">
            Webseite
          </a>
        </>
      )}
    </p>
  )
}

// Bestätigung zum Kopieren - die App verschickt keine E-Mails an Anfragende.
function MailKopieren({ anfrage }) {
  const { theme } = useTheme()
  const [copied, setCopied] = useState(false)
  const mail = bestaetigungsMail({ anfrage, appName: theme.appName })
  if (!mail) return null

  async function copy() {
    try {
      await navigator.clipboard.writeText(`Betreff: ${mail.subject}\n\n${mail.body}`)
      setCopied(true)
      setTimeout(() => setCopied(false), COPIED_MS)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Button type="button" variant="ink" size="sm" onClick={copy}>
      <Icon name={copied ? 'check' : 'copy'} />
      {copied ? 'Kopiert' : 'E-Mail-Text kopieren'}
    </Button>
  )
}

// Geschäftsanfrage im Admin (AdminAnfrageRow): Betriebsangaben, Terminvorschläge, einen davon bestätigen (optional mit
// kurzer Notiz für die Bestätigung) und den vorbereiteten E-Mail-Text kopieren. onConfirm(index|null, notiz) ->
// Promise<boolean>.
export default function AdminAnfrageGeschaeft({ anfrage, onConfirm }) {
  const { geschaeft } = anfrage
  const bestaetigt = geschaeft.bestaetigt
  const [notiz, setNotiz] = useState(bestaetigt?.notiz || '')
  const [busy, setBusy] = useState(false)
  const notizId = `admin-anfrage-termin-notiz-${anfrage.id}`

  async function confirm(index) {
    setBusy(true)
    await onConfirm(index, index === null ? null : notiz.trim())
    setBusy(false)
  }

  return (
    <div className="admin-anfrage-geschaeft">
      <Fakten geschaeft={geschaeft} />
      <ol className="admin-anfrage-termine">
        {geschaeft.termine.map((termin, index) => {
          const isConfirmed = bestaetigt?.index === index
          return (
            <li key={`${termin.datum}-${termin.zeitfenster}`} className={isConfirmed ? 'is-bestaetigt' : ''}>
              <span>{terminLabel(termin)}</span>
              {isConfirmed ? (
                <span className="pill is-access">
                  <Icon name="check" />
                  bestätigt
                </span>
              ) : (
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => confirm(index)}>
                  Bestätigen
                </Button>
              )}
            </li>
          )
        })}
      </ol>
      <label className="field-label" htmlFor={notizId}>
        Kurze Notiz zur Bestätigung (freiwillig)
      </label>
      <input
        id={notizId}
        value={notiz}
        maxLength={MAX_BESTAETIGUNG_NOTIZ_LENGTH}
        onChange={(e) => setNotiz(e.target.value)}
        placeholder="z. B. Wir rufen unter eurer Nummer an."
      />
      {bestaetigt && (
        <span className="admin-row-actions">
          <MailKopieren anfrage={anfrage} />
          {notiz.trim() !== (bestaetigt.notiz || '') && (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => confirm(bestaetigt.index)}>
              Notiz speichern
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => confirm(null)}>
            Bestätigung zurücknehmen
          </Button>
        </span>
      )}
    </div>
  )
}
