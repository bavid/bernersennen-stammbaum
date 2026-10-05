import { useEffect, useState } from 'react'
import { api } from '../api'
import Icon from './Icon.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import AdminNotifySetup from './AdminNotifySetup.jsx'
import AdminNotifySwitches from './AdminNotifySwitches.jsx'
import { QUELLE_LABELS, canRemoveTelegram, notifyErrorMessage } from '../lib/adminNotify.js'

function Status({ settings }) {
  if (!settings.eingerichtet) return <p className="admin-notify-status">Noch nicht eingerichtet</p>
  return (
    <p className="admin-notify-status is-on">
      <Icon name="check" />
      Eingerichtet (Quelle: {QUELLE_LABELS[settings.quelle] || settings.quelle})
    </p>
  )
}

// "Benachrichtigungen (Telegram)" im Admin (Phase N, server/routes/adminNotify.js): Status, Einrichtung in fünf
// Schritten (AdminNotifySetup), Schalter je Ereignis (AdminNotifySwitches) und "Telegram entfernen" (löscht Token und
// Chat-ID im Admin; Werte aus der Server-Umgebung bleiben). Der Bot-Token kommt nie vom Server zurück - nur
// tokenHinweis ("…abcd").
export default function AdminNotify() {
  const [settings, setSettings] = useState(undefined)
  const [loadError, setLoadError] = useState(null)
  const [removeError, setRemoveError] = useState(null)

  useEffect(() => {
    let cancelled = false
    api.admin
      .notifySettings()
      .then((result) => {
        if (!cancelled) setSettings(result)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleRemove() {
    setRemoveError(null)
    try {
      setSettings(await api.admin.saveTelegram({ token: '', chatId: '' }))
    } catch (err) {
      setRemoveError(notifyErrorMessage(err))
    }
  }

  return (
    <section className="admin-notify card" aria-labelledby="admin-notify-title">
      <div className="admin-section-head">
        <h2 id="admin-notify-title">Benachrichtigungen (Telegram)</h2>
        {settings && <Status settings={settings} />}
      </div>
      <p className="muted admin-notify-intro">
        Eine kurze Nachricht aufs Handy, wenn etwas Neues ankommt – standardmäßig ohne Namen oder E-Mail-Adressen.
      </p>
      <p className="field-hint">
        Dieser Bot schreibt auch den Partnern. Partner können stattdessen einen eigenen Bot verwenden – im Partner-Bereich unter „Zugang“.
      </p>

      {loadError && (
        <div className="error-banner" role="alert">
          {loadError}
        </div>
      )}
      {settings === undefined && !loadError && <p className="muted">Lade …</p>}
      {settings && (
        <>
          <AdminNotifySetup settings={settings} onChange={setSettings} />
          <AdminNotifySwitches settings={settings} onChange={setSettings} />
          {canRemoveTelegram(settings) && (
            <div className="admin-notify-remove">
              <ConfirmButton onConfirm={handleRemove} label="Telegram entfernen" confirmLabel="Wirklich entfernen?" />
              <p className="field-hint">Löscht Bot-Token und Chat-ID. Die Schalter bleiben, wie sie sind.</p>
              {removeError && (
                <p className="field-error" role="alert">
                  {removeError}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
