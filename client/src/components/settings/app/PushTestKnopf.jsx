import { useState } from 'react'
import { api } from '../../../api'
import { useLang, useT } from '../../../lib/i18n/index.js'

const STATUS_ID = 'push-test-status'
const SERVICE_UNAVAILABLE = 503

// „Test-Benachrichtigung senden“ (unter dem Push-Schalter, nur wenn er an ist): eine feste Nachricht nur an dieses
// Gerät (sein endpoint, routes/push.js POST /test). Der Stand steht in einer aria-live-Zeile.
export default function PushTestKnopf({ endpoint }) {
  const t = useT()
  const lang = useLang()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  async function senden() {
    setBusy(true)
    setStatus(t('settings.push.test.sending'))
    try {
      await api.pushTest(endpoint, lang === 'en' ? 'en' : 'de')
      setStatus(t('settings.push.test.sent'))
    } catch (err) {
      setStatus(err?.status === SERVICE_UNAVAILABLE ? t('settings.push.server') : err?.message || t('settings.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-setting-row">
      <button type="button" className="btn btn-ghost" onClick={senden} disabled={busy} aria-describedby={STATUS_ID}>
        {t('settings.push.test.button')}
      </button>
      <p id={STATUS_ID} className="app-setting-hint muted" aria-live="polite">
        {status}
      </p>
    </div>
  )
}
