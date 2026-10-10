import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { qrSvgMarkup } from '../lib/partnerShare.js'
import { POLL_INTERVAL_MS, isTelegramLink, telegramStatus } from '../lib/partnerTelegram.js'
import Icon from './Icon.jsx'
import Modal from './Modal.jsx'
import { t } from '../lib/i18n/index.js'

const WAITING = 'Warte auf die Bestätigung in Telegram …'
const EXPIRED = 'Der Link ist abgelaufen – bitte schließen und neu verbinden.'
const DEFAULT_VALID_MINUTES = 15
const MINUTE_MS = 60 * 1000

// Dialog "Mit Telegram verbinden" (Phase V4b): der Einmal-Link als Knopf (Handy) und als QR-Code (Computer), dazu
// "Verbindung prüfen". Solange der Dialog offen und der Link gültig ist, fragt er alle POLL_INTERVAL_MS selbst nach;
// sobald der Server verbunden meldet, geht onConnected(status). link: { url, gueltigMinuten } aus
// POST /partner-area/telegram/verbinden. Nach Ablauf hört das Nachfragen auf.
export default function TelegramConnectDialog({ link, onConnected, onClose }) {
  const url = isTelegramLink(link?.url) ? link.url : null
  const validMinutes = Number.isInteger(link?.gueltigMinuten) && link.gueltigMinuten > 0 ? link.gueltigMinuten : DEFAULT_VALID_MINUTES
  const qrImage = useMemo(() => (url ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvgMarkup(url))}` : null), [url])
  const [message, setMessage] = useState(null)
  const [checking, setChecking] = useState(false)
  const [expired, setExpired] = useState(false)
  const busy = useRef(false)

  const check = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setChecking(true)
    try {
      const status = telegramStatus(await api.partnerArea.checkTelegram())
      if (status.verbunden) onConnected(status)
      else setMessage(null)
    } catch (err) {
      setMessage(err.message)
    } finally {
      busy.current = false
      setChecking(false)
    }
  }, [onConnected])

  useEffect(() => {
    if (!url || expired) return undefined
    const timer = setInterval(check, POLL_INTERVAL_MS)
    const expiry = setTimeout(() => setExpired(true), validMinutes * MINUTE_MS)
    return () => {
      clearInterval(timer)
      clearTimeout(expiry)
    }
  }, [url, expired, check, validMinutes])

  return (
    <Modal open title="Mit Telegram verbinden" onClose={onClose}>
      {url ? (
        <div className="telegram-connect">
          <ol className="telegram-connect-steps">
            <li>{t('Auf dem Handy „In Telegram öffnen“ antippen – am Computer den QR-Code mit dem Handy scannen.')}</li>
            <li>{t('In Telegram auf „Starten“ und danach auf „Ja, Hinweise aktivieren“ tippen.')}</li>
            <li>{t('Fertig – diese Seite merkt es von selbst.')}</li>
          </ol>
          <div className="telegram-connect-codes">
            <a className="btn btn-primary" href={url} target="_blank" rel="noopener noreferrer">
              <Icon name="send" />
              {t('In Telegram öffnen')}
            </a>
            <img src={qrImage} alt={t('QR-Code für den Telegram-Link')} className="telegram-connect-qr" width={176} height={176} />
          </div>
          <p className="field-hint">{t('Der Link gilt {n} Minuten und nur einmal.', { n: validMinutes })}</p>
          <p className="telegram-connect-status" role="status">
            {expired ? t(EXPIRED) : message || t(WAITING)}
          </p>
          <button type="button" className="btn btn-ghost" onClick={check} disabled={checking || expired}>
            <Icon name="check" />
            {checking ? t('Prüfe …') : t('Verbindung prüfen')}
          </button>
        </div>
      ) : (
        <p className="error-banner" role="alert">
          {t('Der Link ließ sich nicht erzeugen – bitte noch einmal versuchen.')}
        </p>
      )}
    </Modal>
  )
}
