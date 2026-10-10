import { useState } from 'react'
import Icon from '../Icon.jsx'
import { useToast } from '../Toast.jsx'
import { voucherLink } from '../../lib/visits.js'
import { t } from '../../lib/i18n/index.js'

const LINK_COPY_FAILED_MESSAGE = 'Kopieren nicht möglich – Link bitte markieren'

// Code kopieren, Link kopieren, Teilen (falls der Browser es kann) für einen offenen Code. gift: Knopf „Als Geschenkkarte
// drucken“ (zweiter sichtbarer Platz), extra: z. B. „Zurückziehen“ (immer unter „Mehr“). Der Link ist der Weg, den
// man am ehesten weitergibt (SMS, Chat) - misslingt das Kopieren (fehlendes Zwischenablage-Recht, unsicherer Kontext),
// erscheint er zusätzlich als Feld zum Markieren, statt nur stillschweigend nicht kopiert zu werden.
export default function VoucherShareActions({ code, gift = null, extra = null }) {
  const toast = useToast()
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const [linkCopyFailed, setLinkCopyFailed] = useState(false)

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text)
      toast(t('Kopiert'))
    } catch {
      // Ohne Zwischenablage-Recht bleibt nur das Abtippen - nichts weiter zu tun.
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(voucherLink(code))
      toast(t('Kopiert'))
    } catch {
      setLinkCopyFailed(true)
      toast(t(LINK_COPY_FAILED_MESSAGE))
    }
  }

  async function share() {
    try {
      await navigator.share({ url: voucherLink(code) })
    } catch {
      // Abbruch oder Fehler beim Teilen-Dialog selbst ist kein Fehlerfall, den man melden müsste.
    }
  }

  const shareButton = canShare && (
    <button key="share" type="button" className="btn btn-ghost" onClick={share}>
      <Icon name="share" />
      {t('Teilen')}
    </button>
  )
  const linkButton = (
    <button key="link" type="button" className="btn btn-ghost" onClick={copyLink}>
      <Icon name="copy" />
      {t('Link kopieren')}
    </button>
  )
  const codeButton = (
    <button key="code" type="button" className="btn btn-ghost" onClick={() => copy(code)}>
      <Icon name="copy" />
      {t('Code kopieren')}
    </button>
  )
  // Höchstens zwei Knöpfe sichtbar (Audit: fünf Aktionen je Code waren zu viel), der Rest steht unter „Mehr“.
  const primary = shareButton || linkButton
  const second = gift || codeButton
  const more = [shareButton && linkButton, gift && codeButton, extra].filter(Boolean)

  return (
    <>
      <div className="voucher-row-actions">
        {primary}
        {second}
        {more.length > 0 && (
          <details className="voucher-row-more">
            <summary className="btn btn-ghost">{t('Mehr')}</summary>
            <div className="voucher-row-more-list">{more}</div>
          </details>
        )}
      </div>
      {linkCopyFailed && (
        <input
          readOnly
          className="voucher-link-fallback"
          aria-label={t('Einladungslink zum Markieren und Kopieren')}
          value={voucherLink(code)}
          onFocus={(e) => e.target.select()}
        />
      )}
    </>
  )
}
