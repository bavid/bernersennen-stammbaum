import { useState } from 'react'
import Icon from '../Icon.jsx'
import { useToast } from '../Toast.jsx'
import { voucherLink } from '../../lib/visits.js'

const LINK_COPY_FAILED_MESSAGE = 'Kopieren nicht möglich – Link bitte markieren'

// Code kopieren, Link kopieren, Teilen (falls der Browser es kann) für einen offenen Code. Der Link ist der Weg, den
// man am ehesten weitergibt (SMS, Chat) - misslingt das Kopieren (fehlendes Zwischenablage-Recht, unsicherer Kontext),
// erscheint er zusätzlich als Feld zum Markieren, statt nur stillschweigend nicht kopiert zu werden.
export default function VoucherShareActions({ code }) {
  const toast = useToast()
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const [linkCopyFailed, setLinkCopyFailed] = useState(false)

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text)
      toast('Kopiert')
    } catch {
      // Ohne Zwischenablage-Recht bleibt nur das Abtippen - nichts weiter zu tun.
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(voucherLink(code))
      toast('Kopiert')
    } catch {
      setLinkCopyFailed(true)
      toast(LINK_COPY_FAILED_MESSAGE)
    }
  }

  async function share() {
    try {
      await navigator.share({ url: voucherLink(code) })
    } catch {
      // Abbruch oder Fehler beim Teilen-Dialog selbst ist kein Fehlerfall, den man melden müsste.
    }
  }

  return (
    <>
      <div className="voucher-row-actions">
        <button type="button" className="btn btn-ghost" onClick={() => copy(code)}>
          <Icon name="copy" />
          Code kopieren
        </button>
        <button type="button" className="btn btn-ghost" onClick={copyLink}>
          <Icon name="copy" />
          Link kopieren
        </button>
        {canShare && (
          <button type="button" className="btn btn-ghost" onClick={share}>
            <Icon name="share" />
            Teilen
          </button>
        )}
      </div>
      {linkCopyFailed && (
        <input
          readOnly
          className="voucher-link-fallback"
          aria-label="Gutschein-Link zum Markieren und Kopieren"
          value={voucherLink(code)}
          onFocus={(e) => e.target.select()}
        />
      )}
    </>
  )
}
