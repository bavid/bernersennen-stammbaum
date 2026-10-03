import { useState } from 'react'
import { api } from '../api'
import { useIsDemo } from '../lib/demo.js'
import { HINWEIS_OPTIONS, telegramStatus } from '../lib/partnerTelegram.js'
import ConfirmButton from './ConfirmButton.jsx'
import Icon from './Icon.jsx'
import { useToast } from './Toast.jsx'

// Verbunden (Phase V4b, PartnerTelegramSection): die Schalter je Ereignis (speichern sofort), "Testnachricht senden" und
// "Trennen". Jede Antwort des Servers ist der neue Status (onStatus). Demo und Admin-Ansicht: sichtbar, gesperrt.
export default function TelegramConnected({ status, onStatus }) {
  const isDemo = useIsDemo()
  const toast = useToast()
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  async function run(name, action) {
    setBusy(name)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err.message)
      // 409 nach einem Test: Telegram meldet den Bot als blockiert - der Server hat die Verbindung schon beendet.
      if (err.status === 409) onStatus(telegramStatus(await api.partnerArea.telegram().catch(() => status)))
    } finally {
      setBusy(null)
    }
  }

  function toggle(key, value) {
    run(key, async () => onStatus(telegramStatus(await api.partnerArea.updateTelegramHinweise({ [key]: value }))))
  }

  function sendTest() {
    run('test', async () => {
      await api.partnerArea.sendTelegramTest()
      toast('Testnachricht verschickt – schaut in Telegram nach.')
    })
  }

  function disconnect() {
    run('trennen', async () => {
      onStatus(telegramStatus(await api.partnerArea.disconnectTelegram()))
      toast('Telegram ist getrennt.')
    })
  }

  return (
    <div className="telegram-connected">
      <p className="telegram-state is-connected">
        <Icon name="check" />
        Mit Telegram verbunden
      </p>
      <fieldset className="telegram-hinweise">
        <legend>Hinweise schicken bei …</legend>
        {HINWEIS_OPTIONS.map(({ key, label }) => (
          <label className="check" key={key}>
            <input
              type="checkbox"
              checked={status.hinweise[key]}
              disabled={isDemo || busy !== null}
              onChange={(event) => toggle(key, event.target.checked)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="telegram-actions">
        <button type="button" className="btn btn-ghost" disabled={isDemo || busy !== null} onClick={sendTest}>
          <Icon name="send" />
          {busy === 'test' ? 'Sende …' : 'Testnachricht senden'}
        </button>
        <ConfirmButton label="Trennen" confirmLabel="Wirklich trennen?" icon="close" disabled={isDemo || busy !== null} onConfirm={disconnect} />
      </div>
    </div>
  )
}
