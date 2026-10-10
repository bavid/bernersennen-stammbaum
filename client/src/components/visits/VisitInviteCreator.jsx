import { useState } from 'react'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import { api } from '../../api'
import CopyField from '../CopyField.jsx'
import Icon from '../Icon.jsx'
import { useIsDemo, useReadOnlyHint } from '../../lib/demo.js'
import { formatDateShort } from '../../lib/dates.js'
import { voucherLink } from '../../lib/visits.js'
import { t } from '../../lib/i18n/index.js'

// "Zu Besuch einladen" (Phase V2; Phase W Schritt 2 ein eigener Weg im Einladen-Dialog): ein neuer Besuchs-Code, 7 Tage
// gültig und einmal einlösbar (server/routes/besuche.js POST /einladungen). Code und Link stehen nur hier und - solange
// offen - in der Liste der offenen Besuchs-Codes darunter. onCreated: die Liste dort neu laden; headingRef: Fokus nach
// dem Wechsel in diesen Weg.
export default function VisitInviteCreator({ onCreated, headingRef }) {
  const { words } = useTheme()
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint(t('In der Demo werden keine Einladungen vergeben.'))
  const [invite, setInvite] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleCreate() {
    setBusy(true)
    setError(null)
    try {
      const created = await api.createVisitInvite()
      setInvite(created)
      onCreated?.(created)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="visit-panel" aria-labelledby="visit-invite-title">
      <h3 id="visit-invite-title" ref={headingRef} tabIndex={-1}>
        {t('Zu Besuch einladen')}
      </h3>
      <p className="muted">
        {t('Wer den Code einlöst, sieht eure Tiere und alle {entries}, die nicht privat sind, und darf {greetings} schreiben – ändern kann er nichts. Der Code gilt 7 Tage und nur einmal; beenden könnt ihr den Besuch jederzeit in den Einstellungen unter „Mein Zuhause“.', {
          entries: words.entries,
          greetings: words.greetings
        })}
      </p>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {invite ? (
        <div className="visit-invite-result">
          <CopyField
            id="visit-invite-code"
            label={t('Einladungs-Code')}
            value={invite.code}
            hint={t('Gültig bis {date} – danach verfällt er.', { date: formatDateShort(invite.expires_at) })}
          />
          <CopyField id="visit-invite-link" label={t('Link zum Weitergeben')} value={voucherLink(invite.code)} />
        </div>
      ) : (
        <div className="visit-actions">
          <button type="button" className="btn btn-primary" onClick={handleCreate} disabled={busy || isDemo}>
            <Icon name="plus" />
            {busy ? t('Erstelle …') : t('Besuchs-Einladung erstellen')}
          </button>
        </div>
      )}
      {isDemo && <p className="field-hint">{readOnlyHint}</p>}
    </section>
  )
}
