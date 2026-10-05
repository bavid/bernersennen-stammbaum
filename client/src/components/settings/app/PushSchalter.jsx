import { useEffect, useState } from 'react'
import { api } from '../../../api'
import { useIsDemo } from '../../../lib/demo.js'
import { PUSH_STATUS, PUSH_SUPPORT, pushStatus, pushSupport } from '../../../lib/push.js'
import { pushClient } from '../../../lib/pushClient.js'

const HINT_ID = 'push-hint'

const TEXTE = Object.freeze({
  [PUSH_SUPPORT.iosInstall]:
    'Auf iPhone und iPad geht das erst, wenn die App auf dem Home-Bildschirm liegt (iOS 16.4 oder neuer) – siehe Anleitung oben.',
  [PUSH_SUPPORT.unsupported]: 'Dieser Browser kann keine Benachrichtigungen empfangen.',
  server: 'Auf diesem Server noch nicht eingerichtet.',
  demo: 'In der Demo nicht möglich.',
  prueft: 'Prüft …',
  [PUSH_STATUS.blockiert]: 'Vom Browser blockiert – in den Seiteneinstellungen des Browsers wieder erlauben.',
  [PUSH_STATUS.an]: 'An – bei neuen Grüßen, „Mit dabei“-Anfragen und Gästen.',
  [PUSH_STATUS.aus]: 'Aus'
})

// „Benachrichtigungen aufs Handy“ (Einstellungen › App): ein Schalter. Die Erlaubnis fragt der Browser erst beim
// Einschalten (lib/pushClient.js subscribePush) - nie beim Laden. Zustand: an / aus / vom Browser blockiert; auf dem
// iPhone im Browser der Hinweis, dass es erst installiert geht. support/client sind für Tests von außen setzbar.
export default function PushSchalter({ support = pushSupport(), client = pushClient }) {
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
  const hint = TEXTE[reason || status]

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
      setError(err.message || 'Das hat gerade nicht geklappt.')
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
        Benachrichtigungen aufs Handy
      </label>
      <p id={HINT_ID} className="app-setting-hint muted">
        {hint}
      </p>
      <p className="app-setting-text">
        Nur, was die Glocke auch zeigt – ohne Namen oder Inhalte. Der kurze Hinweis geht verschlüsselt über den Push-Dienst
        eures Browsers.
      </p>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
    </div>
  )
}
