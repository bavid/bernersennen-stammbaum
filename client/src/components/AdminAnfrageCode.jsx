import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { assignmentMail, mailtoHref } from '../lib/anfragen.js'
import { printBaseUrl, voucherUrl } from '../lib/voucherPrint.js'

const COPIED_MS = 2000
const MAIL_BODY_ID = 'admin-anfrage-mail-body'
const MAIL_SUBJECT_ID = 'admin-anfrage-mail-subject'

// Der zugewiesene Code - genau einmal, solange der Dialog offen ist (AdminAnfrageAssign hält ihn nur im State; mit
// dem Schließen ist er weg). Dazu eine vorformulierte E-Mail zum Kopieren und ein mailto:-Link mit Betreff und Text -
// wir versenden selbst keine E-Mails. Der Link im Text führt auf {origin}/v#CODE (lib/voucherPrint.js voucherUrl).
export default function AdminAnfrageCode({ anfrage, code, onClose }) {
  const { theme } = useTheme()
  const [copied, setCopied] = useState(null)
  const headingRef = useRef(null)
  const link = voucherUrl(printBaseUrl(null, window.location.origin), code)
  const mail = assignmentMail({ anfrage, code, link, appName: theme.appName })

  // Fokus auf die Überschrift, sobald der Code erscheint - der Knopf "Zuweisen" ist dann schon weg.
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!copied) return undefined
    const timer = setTimeout(() => setCopied(null), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy(what, text) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
    } catch {
      // Ohne Zwischenablage-Recht bleiben Code und Text zum Markieren sichtbar.
    }
  }

  return (
    <div className="admin-anfrage-code">
      <div role="status">
        <p className="field-label" ref={headingRef} tabIndex={-1}>
          Code für {anfrage.email}
        </p>
        <p className="key-reveal-value">{code}</p>
      </div>
      <button type="button" className={`btn ${copied === 'code' ? 'btn-ink' : 'btn-ghost'}`} onClick={() => copy('code', code)}>
        <Icon name={copied === 'code' ? 'check' : 'copy'} />
        {copied === 'code' ? 'Kopiert' : 'Code kopieren'}
      </button>
      <p className="field-hint">
        Nur jetzt sichtbar – danach steht der Code, solange er offen ist, nur noch in den Stapel-Details. Die Anfrage ist
        jetzt erledigt.
      </p>

      <div className="admin-anfrage-mail">
        <div className="field">
          <label className="field-label" htmlFor={MAIL_SUBJECT_ID}>
            Betreff
          </label>
          <input id={MAIL_SUBJECT_ID} value={mail.subject} readOnly />
        </div>
        <div className="field">
          <label className="field-label" htmlFor={MAIL_BODY_ID}>
            E-Mail-Text
          </label>
          <textarea id={MAIL_BODY_ID} value={mail.body} readOnly rows={8} />
        </div>
        <div className="admin-row-actions">
          <button type="button" className={`btn ${copied === 'text' ? 'btn-ink' : 'btn-ghost'}`} onClick={() => copy('text', mail.body)}>
            <Icon name={copied === 'text' ? 'check' : 'copy'} />
            {copied === 'text' ? 'Kopiert' : 'Text kopieren'}
          </button>
          <a href={mailtoHref(anfrage.email, mail)} className="btn btn-ghost">
            <Icon name="mail" /> Im E-Mail-Programm öffnen
          </a>
        </div>
      </div>

      <button type="button" className="btn btn-primary btn-block" onClick={onClose}>
        Fertig
      </button>
    </div>
  )
}
