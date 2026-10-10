import Icon from './Icon.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import { excerpt, formatMessageDate, isoDateTime, senderName } from '../lib/partnerInbox.js'
import { isValidPhone, mailtoHref, telHref } from '../lib/format.js'
import { t } from '../lib/i18n/index.js'
import { Button } from './ui/index.js'

// Eine Nachricht im Postfach (PartnerInboxPage): zugeklappt Absender (ungelesen fett), Bezug, Datum und
// der Anfang der Nachricht; aufgeklappt die ganze Nachricht - immer als Text (Zeilenumbrüche per CSS
// white-space: pre-wrap), nie als HTML -, Antwort-Links per E-Mail/Telefon, "Als gelesen markieren" (falls
// das automatische Markieren beim Öffnen nicht geklappt hat) und "Löschen". demoHintId: in der Demo ist das
// Postfach nur lesbar.
export default function InboxMessage({ message, open, onToggle, onMarkRead, onDelete, demoHintId }) {
  const isDemo = Boolean(demoHintId)
  const unread = !message.gelesen
  const name = senderName(message)
  const panelId = `inbox-message-${message.id}`
  const mailto = mailtoHref(message.email)
  const phone = isValidPhone(message.telefon) ? message.telefon : null

  return (
    <li className={`inbox-item${unread ? ' is-unread' : ''}${open ? ' is-open' : ''}`}>
      <button type="button" className="inbox-item-head" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <span className="inbox-item-top">
          {unread && <span className="inbox-dot" aria-hidden="true" />}
          <span className="inbox-item-sender">
            {name}
            {unread && <span className="visually-hidden">{t(' (ungelesen)')}</span>}
          </span>
          <time className="inbox-item-date" dateTime={isoDateTime(message.createdAt)}>
            {formatMessageDate(message.createdAt)}
          </time>
        </span>
        {message.bezug && <span className="pill inbox-bezug">{message.bezug}</span>}
        {!open && <span className="inbox-item-excerpt">{excerpt(message.nachricht)}</span>}
        <Icon name="chevronDown" className="inbox-item-chevron" />
      </button>

      {open && (
        <div id={panelId} className="inbox-item-detail">
          <p className="inbox-message-text">{message.nachricht}</p>

          {(mailto || phone) && (
            <div className="inbox-reply" aria-label={t('Antworten an {name}', { name })} role="group">
              {mailto && (
                <Button variant="ghost" href={mailto}>
                  <Icon name="mail" />
                  <span>
                    {t('Per E-Mail antworten')}<span className="inbox-reply-value">{message.email}</span>
                  </span>
                </Button>
              )}
              {phone && (
                <Button variant="ghost" href={telHref(phone)}>
                  <Icon name="phone" />
                  <span>
                    {t('Anrufen')}<span className="inbox-reply-value">{phone}</span>
                  </span>
                </Button>
              )}
            </div>
          )}
          {!mailto && !phone && <p className="field-hint">{t('Keine Kontaktdaten angegeben.')}</p>}

          <div className="inbox-actions">
            {unread && !isDemo && (
              <Button type="button" variant="ghost" onClick={onMarkRead}>
                <Icon name="check" />
                {t('Als gelesen markieren')}
              </Button>
            )}
            <ConfirmButton
              onConfirm={onDelete}
              label={t('Löschen')}
              confirmLabel={t('Wirklich löschen?')}
              ariaLabel={t('Nachricht von {name} löschen', { name })}
              disabled={isDemo}
              describedBy={demoHintId}
            />
          </div>
        </div>
      )}
    </li>
  )
}
