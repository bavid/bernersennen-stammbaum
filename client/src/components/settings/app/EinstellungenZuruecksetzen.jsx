import { useState } from 'react'
import { api } from '../../../api'
import ConfirmButton from '../../ConfirmButton.jsx'
import { detectPlatform } from '../../../lib/install.js'
import { pushClient } from '../../../lib/pushClient.js'
import { anleitungFuer, forgetOurSettings } from '../../../lib/zuruecksetzen.js'
import { useT } from '../../../lib/i18n/index.js'

// „Unsere Einstellungen zurücksetzen“ (Einstellungen › App). Ehrlich: Berechtigungen des Browsers kann eine Website
// nicht selbst zurücknehmen. Der Knopf (1) kündigt das Benachrichtigungs-Abo dieses Geräts im Browser und auf dem Server,
// (2) vergisst die gemerkte Postleitzahl und weggeklickte Hinweise auf diesem Gerät (lib/zuruecksetzen.js) und (3) zeigt,
// wo die Berechtigungen selbst sitzen - je Gerät. onDone: der Bereich darüber lädt seinen Zustand neu.
export default function EinstellungenZuruecksetzen({ platform = detectPlatform(), client = pushClient, onDone }) {
  const t = useT()
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  async function reset() {
    setError(null)
    try {
      // nur dieses Gerät - die anderen Geräte des Zuhauses behalten ihre Benachrichtigungen (Demo: 403, dort gibt es keine)
      const endpoint = await client.unsubscribePush().catch(() => null)
      if (endpoint) await api.pushUnsubscribe(endpoint).catch(() => null)
      forgetOurSettings()
      setDone(true)
      onDone?.()
    } catch (err) {
      setError(err.message || t('settings.failed'))
    }
  }

  return (
    <div className="app-setting app-reset">
      <p className="app-setting-label">{t('settings.reset.title')}</p>
      <p className="app-setting-text">{t('settings.reset.text')}</p>
      <ConfirmButton
        label={t('settings.reset.title')}
        confirmLabel={t('settings.reset.confirm')}
        icon="rotate"
        className="btn btn-ghost"
        onConfirm={reset}
      />
      {done && (
        <p className="app-setting-hint" role="status">
          {t('settings.reset.done')}
        </p>
      )}
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <div className="app-reset-anleitung">
        <p className="app-setting-hint muted">{t('settings.reset.guideIntro')}</p>
        <ul>
          {anleitungFuer(platform).map((zeile) => (
            <li key={zeile}>{zeile}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
