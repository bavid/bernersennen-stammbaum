import { useEffect, useState } from 'react'
import { api } from '../../../api'
import { useIsDemo } from '../../../lib/demo.js'
import { PUSH_STATUS, PUSH_SUPPORT, pushStatus, pushSupport } from '../../../lib/push.js'
import { pushClient } from '../../../lib/pushClient.js'
import { useT } from '../../../lib/i18n/index.js'

const HINT_ID = 'push-hint'

// Schlüssel der Hinweise (lib/i18n/settings.js) je Zustand.
const TEXTE = Object.freeze({
  [PUSH_SUPPORT.iosInstall]: 'settings.push.iosInstall',
  [PUSH_SUPPORT.unsupported]: 'settings.push.unsupported',
  server: 'settings.push.server',
  demo: 'settings.push.demo',
  prueft: 'settings.push.checking',
  [PUSH_STATUS.blockiert]: 'settings.push.blocked',
  [PUSH_STATUS.an]: 'settings.push.on',
  [PUSH_STATUS.aus]: 'settings.push.off'
})

// „Benachrichtigungen aufs Handy“ (Einstellungen › App): ein Schalter. Die Erlaubnis fragt der Browser erst beim
// Einschalten (lib/pushClient.js subscribePush) - nie beim Laden. Zustand: an / aus / vom Browser blockiert; auf dem
// iPhone im Browser der Hinweis, dass es erst installiert geht. support/client sind für Tests von außen setzbar.
export default function PushSchalter({ support = pushSupport(), client = pushClient }) {
  const t = useT()
  const demo = useIsDemo()
  const [server, setServer] = useState(null)
  const [permission, setPermission] = useState(() => client.currentPermission())
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    if (support === PUSH_SUPPORT.ok) {
      client
        .currentSubscription()
        .then((subscription) => active && setSubscribed(Boolean(subscription)))
        .catch(() => {})
    }
    async function loadKey() {
      try {
        const data = await api.pushKey()
        if (active) setServer(data)
      } catch {
        if (active) setServer({ enabled: false, publicKey: null })
      }
    }
    loadKey()
    return () => {
      active = false
    }
  }, [support, client])

  const status = pushStatus({ permission, subscribed })
  const reason =
    support !== PUSH_SUPPORT.ok ? support : demo ? 'demo' : server === null ? 'prueft' : !server.enabled ? 'server' : status === PUSH_STATUS.blockiert ? status : null
  const hint = t(TEXTE[reason || status])

  async function toggle() {
    setBusy(true)
    setError(null)
    try {
      if (status === PUSH_STATUS.an) {
        const endpoint = await client.unsubscribePush()
        if (endpoint) await api.pushUnsubscribe(endpoint)
        setSubscribed(false)
      } else {
        const result = await client.subscribePush(server.publicKey)
        setPermission(result.permission)
        if (result.subscription) {
          await api.pushSubscribe(result.subscription.toJSON())
          setSubscribed(true)
        }
      }
    } catch (err) {
      setError(err.message || t('settings.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-setting">
      <label className="check app-setting-switch">
        <input
          type="checkbox"
          role="switch"
          checked={status === PUSH_STATUS.an}
          disabled={busy || reason !== null}
          aria-describedby={HINT_ID}
          onChange={toggle}
        />
        {t('settings.push.label')}
      </label>
      <p id={HINT_ID} className="app-setting-hint muted">
        {hint}
      </p>
      <p className="app-setting-text">
        {t('settings.push.text')}
      </p>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
    </div>
  )
}
