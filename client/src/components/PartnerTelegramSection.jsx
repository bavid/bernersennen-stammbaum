import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { GETRENNT, telegramStatus } from '../lib/partnerTelegram.js'
import Icon from './Icon.jsx'
import TelegramConnectDialog from './TelegramConnectDialog.jsx'
import TelegramConnected from './TelegramConnected.jsx'
import TelegramOwnBot from './TelegramOwnBot.jsx'
import { useToast } from './Toast.jsx'
import { t } from '../lib/i18n/index.js'
import { Button } from './ui/index.js'

const TITLE_ID = 'partner-telegram-title'
const PRIVACY_NOTE = 'Die Hinweise enthalten keine Namen, Kontaktdaten oder Nachrichtentexte – nur, dass es etwas Neues gibt.'

// "Benachrichtigungen" auf /zugang (Phase V4b): Hinweise per Telegram, wenn über „Schreib uns“ eine Nachricht kommt oder
// ein Beitrag freigegeben bzw. abgelehnt wurde. Ohne Bot im Admin nur "noch nicht eingerichtet"; sonst "Mit Telegram
// verbinden" (TelegramConnectDialog) bzw. verbunden die Schalter (TelegramConnected). Demo und Admin-Ansicht: alles
// sichtbar, nichts änderbar.
export default function PartnerTelegramSection() {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const toast = useToast()
  const [status, setStatus] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [link, setLink] = useState(null)
  const [error, setError] = useState(null)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.partnerArea
      .telegram()
      .then((data) => {
        if (!cancelled) setStatus(telegramStatus(data))
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function connect() {
    setError(null)
    setConnecting(true)
    try {
      setLink(await api.partnerArea.connectTelegram())
    } catch (err) {
      setError(err.message)
    } finally {
      setConnecting(false)
    }
  }

  const handleConnected = useCallback(
    (next) => {
      setLink(null)
      setStatus(next)
      toast(t('Telegram ist verbunden.'))
    },
    [toast]
  )

  return (
    <section className="card partner-telegram" aria-labelledby={TITLE_ID}>
      <div className="partner-telegram-head">
        <h2 id={TITLE_ID}>{t('Benachrichtigungen')}</h2>
        <p className="partner-telegram-lede">
          {t('Hinweise aufs Handy per Telegram, wenn über „Schreib uns“ eine Nachricht kommt oder ein Beitrag geprüft wurde.')}
        </p>
      </div>
      {loadError && (
        <p className="error-banner" role="alert">
          {loadError}
        </p>
      )}
      {!status && !loadError && <p className="muted">{t('Lade …')}</p>}
      {status && !status.eingerichtet && (
        <p className="telegram-state">
          <Icon name="info" />
          {t('Telegram ist noch nicht eingerichtet. Richtet euren eigenen Bot ein – die Anleitung steht unten.')}
        </p>
      )}
      {status?.eingerichtet && status.verbunden && <TelegramConnected status={status} onStatus={setStatus} />}
      {status?.eingerichtet && !status.verbunden && (
        <div className="telegram-disconnected">
          {status.getrennt === GETRENNT.blockiert && (
            <p className="telegram-state is-blocked" role="status">
              <Icon name="alert" />
              {t('Telegram hat die Verbindung beendet – der Bot wurde blockiert. Ihr könnt jederzeit neu verbinden.')}
            </p>
          )}
          {status.getrennt === GETRENNT.botGewechselt && (
            <p className="telegram-state is-blocked" role="status">
              <Icon name="alert" />
              {t('Der Bot hat gewechselt – bitte einmal neu verbinden, damit die Hinweise über den neuen Bot ankommen.')}
            </p>
          )}
          <Button type="button" disabled={isDemo || connecting} onClick={connect}>
            <Icon name="send" />
            {connecting ? t('Einen Moment …') : t('Mit Telegram verbinden')}
          </Button>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
      {status?.eingerichtet && <p className="field-hint">{t(PRIVACY_NOTE)}</p>}
      {isDemo && status?.eingerichtet && <p className="field-hint">{readOnlyHint}</p>}
      {status && <TelegramOwnBot status={status} onStatus={setStatus} openByDefault={!status.eingerichtet} />}
      {link && <TelegramConnectDialog link={link} onConnected={handleConnected} onClose={() => setLink(null)} />}
    </section>
  )
}
