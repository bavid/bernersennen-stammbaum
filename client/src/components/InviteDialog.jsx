import { useEffect, useState } from 'react'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { useIsDemo } from '../lib/demo.js'
import { useToast } from './Toast.jsx'
import Icon from './Icon.jsx'
import { formatDateShort } from '../lib/dates.js'
import { VOUCHER_STATUS_LABEL } from '../lib/voucherCode.js'
import { isPartnerArea } from '../lib/areas.js'

function statusText(voucher) {
  if (voucher.status === 'eingelöst' && voucher.redeemed_at) {
    return `Eingelöst am ${formatDateShort(voucher.redeemed_at)}`
  }
  return VOUCHER_STATUS_LABEL[voucher.status] || voucher.status
}

function voucherLink(code) {
  return `${window.location.origin}/v#${code.replace(/-/g, '')}`
}

function CopyField({ label, value }) {
  const toast = useToast()

  async function handleCopy(event) {
    try {
      await navigator.clipboard.writeText(value)
      toast('Kopiert')
    } catch {
      // Ohne Zwischenablage-Recht: Text markieren, damit man ihn selbst kopieren kann
      event.currentTarget.previousElementSibling?.select()
    }
  }

  return (
    <div className="copy-field">
      <input readOnly value={value} aria-label={label} onFocus={(e) => e.target.select()} />
      <button type="button" className="btn btn-ghost" onClick={handleCopy}>
        <Icon name="copy" />
        Kopieren
      </button>
    </div>
  )
}

const LINK_COPY_FAILED_MESSAGE = 'Kopieren nicht möglich – Link bitte markieren'

function VoucherRow({ voucher }) {
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

  // Der Link ist der Weg, den man am ehesten weitergibt (SMS, Chat) - misslingt das Kopieren hier
  // (fehlendes Zwischenablage-Recht, unsicherer Kontext), bekommt man ihn zusätzlich als Fallback-Feld
  // zum Markieren angezeigt, statt ihn nur stillschweigend nicht zu kopieren.
  async function copyLink() {
    const link = voucherLink(voucher.code)
    try {
      await navigator.clipboard.writeText(link)
      toast('Kopiert')
    } catch {
      setLinkCopyFailed(true)
      toast(LINK_COPY_FAILED_MESSAGE)
    }
  }

  async function share() {
    try {
      await navigator.share({ url: voucherLink(voucher.code) })
    } catch {
      // Abbruch oder Fehler beim Teilen-Dialog selbst ist kein Fehlerfall, den man melden müsste.
    }
  }

  return (
    <li className="voucher-row">
      <div className="voucher-row-main">
        <span className="voucher-code">{voucher.code || `…${voucher.hint}`}</span>
        <span className={`pill ${voucher.status === 'offen' ? '' : 'pill-rust'}`}>{statusText(voucher)}</span>
      </div>
      {voucher.code && (
        <div className="voucher-row-actions">
          <button type="button" className="btn btn-ghost" onClick={() => copy(voucher.code)}>
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
      )}
      {voucher.code && linkCopyFailed && (
        <input
          readOnly
          className="voucher-link-fallback"
          aria-label="Gutschein-Link zum Markieren und Kopieren"
          value={voucherLink(voucher.code)}
          onFocus={(e) => e.target.select()}
        />
      )}
    </li>
  )
}

const PARTNER_EXPLANATION =
  'Gebt diesen Gutschein an eure Kundschaft weiter – damit legen sie ihre eigene Chronik bei Familie auf Pfoten an.'

// Rudel: Mitgliedschaft inklusive; Partner/Tierheime (Phase P): Kunden-Gutscheine für die Kundschaft, nie
// ein Beitritt (der Server rechnet sie dem Partner zu, siehe server/lib/vouchers.js ensureVoucherQuota).
function explanationFor(family) {
  if (isPartnerArea(family)) return PARTNER_EXPLANATION
  if (family.art === 'rudel') {
    return `Wer den Gutschein einlöst, bekommt eine eigene Chronik und ist gleich Mitglied in „${family.name}“.`
  }
  return 'Wer den Gutschein einlöst, bekommt eine eigene Chronik.'
}

// Jemanden einladen bzw. (Partner/Tierheim) Kunden-Gutscheine weitergeben: die eigenen Weitergabe-
// Gutscheine des aktiven Bereichs (myVouchers() füllt das Kontingent bei jedem Aufruf selbst auf). Der
// alte Weg über Adresse+Passwort bleibt als zweiter Abschnitt, aber nur für klassische Rudel mit
// gemeinsamem Passwort - ein Zuhause hat kein Passwort zum Weitergeben.
export default function InviteDialog({ family }) {
  const { words } = useTheme()
  const isDemo = useIsDemo()
  const [vouchers, setVouchers] = useState(undefined)
  const [error, setError] = useState(null)

  useEffect(() => {
    api
      .myVouchers()
      .then(setVouchers)
      .catch((err) => setError(err.message))
  }, [])

  const explanation = explanationFor(family)

  return (
    <div className="invite">
      <section className="invite-vouchers">
        <h3>Gutscheine</h3>
        <p className="muted">{explanation}</p>
        {isDemo && <p className="field-hint">Beispiel – in der Demo werden keine Gutscheine vergeben.</p>}
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        {vouchers === undefined && !error && <p className="muted">Lade …</p>}
        {vouchers && vouchers.length === 0 && <p className="muted">Gerade keine Gutscheine übrig.</p>}
        {vouchers && vouchers.length > 0 && (
          <ul className="voucher-list">
            {vouchers.map((voucher) => (
              <VoucherRow key={voucher.id} voucher={voucher} />
            ))}
          </ul>
        )}
      </section>

      {family.art === 'rudel' && (
        <section className="invite-legacy">
          <h3>Adresse und Passwort weitergeben</h3>
          <p className="muted">
            Schick der Person die Adresse und euer gemeinsames {words.groupPassword}. Dann sieht sie euren Stammbaum und
            kann mitschreiben. Das Passwort schreibst du selbst dazu – es ist aus Sicherheitsgründen nirgends gespeichert.
          </p>
          <CopyField label="Adresse der Chronik" value={window.location.origin} />
        </section>
      )}
    </div>
  )
}
