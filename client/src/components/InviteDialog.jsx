import { useEffect, useState } from 'react'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { useIsDemo } from '../lib/demo.js'
import { useToast } from './Toast.jsx'
import Icon from './Icon.jsx'
import { formatDateShort } from '../lib/dates.js'

const STATUS_LABEL = {
  offen: 'Offen',
  eingelöst: 'Eingelöst',
  abgelaufen: 'Abgelaufen',
  widerrufen: 'Zurückgezogen'
}

function statusText(voucher) {
  if (voucher.status === 'eingelöst' && voucher.redeemed_at) {
    return `Eingelöst am ${formatDateShort(voucher.redeemed_at)}`
  }
  return STATUS_LABEL[voucher.status] || voucher.status
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

function VoucherRow({ voucher }) {
  const toast = useToast()
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text)
      toast('Kopiert')
    } catch {
      // Ohne Zwischenablage-Recht bleibt nur das Abtippen - nichts weiter zu tun.
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
          <button type="button" className="btn btn-ghost" onClick={() => copy(voucherLink(voucher.code))}>
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
    </li>
  )
}

// Jemanden einladen: die eigenen Weitergabe-Gutscheine des aktiven Bereichs (myVouchers() füllt das
// Kontingent bei jedem Aufruf selbst auf). Der alte Weg über Adresse+Passwort bleibt als zweiter
// Abschnitt, aber nur für klassische Rudel mit gemeinsamem Passwort - ein Zuhause hat kein Passwort
// zum Weitergeben.
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

  const explanation =
    family.art === 'rudel'
      ? `Wer den Gutschein einlöst, bekommt eine eigene Chronik und ist gleich Mitglied in „${family.name}“.`
      : 'Wer den Gutschein einlöst, bekommt eine eigene Chronik.'

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
