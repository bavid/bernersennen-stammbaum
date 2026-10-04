import { useMemo } from 'react'
import PawMark from './PawMark.jsx'
import { qrSvgPath } from '../lib/qr.js'
import { DESIGN, cardDesign, hostLabel, voucherUrl } from '../lib/voucherPrint.js'

// Druckkarte 85 × 55 mm für einen Gutschein (AdminPrintPage, Phase 5 Task 2). Drei Motive, gewählt über
// lib/voucherPrint.js cardDesign: Kunden-Karte, Partner-Stapel-Karte (dazu Partner-Logo, Farbstreifen und
// "überreicht von") und Partner-Zugangs-Karte. Maße, Schrift und Farben stehen in styles/print.css - die
// Karte nutzt bewusst feste Druckfarben statt der Theme-Tokens, damit sie in hell wie dunkel gleich druckt.
// Sicherheit: der Code steht nur hier im DOM und im Pfad des QR-Codes - nirgends sonst.

const APP_NAME = 'Familie auf Pfoten'
const VOUCHER_PATH = '/v'
const PRIVACY_PATH = '/datenschutz'
const CLAIM_CUSTOMER = 'Deine Chronik für deine Tiere'
const CLAIM_ACCESS = 'Euer kostenloses Partner-Profil'
const ACCESS_BULLETS = ['Profil & Einblicke', 'Schreib uns', 'Kundensicht']
const MARK_SIZE = 26
const BACK_MARK_SIZE = 18

function QrCode({ url, host }) {
  const { size, path } = useMemo(() => qrSvgPath(url), [url])
  return (
    <svg
      className="voucher-qr"
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`QR-Code für den Einladungscode, öffnet ${host}${VOUCHER_PATH}`}
    >
      <path d={path} fill="#000" />
    </svg>
  )
}

function AccessText({ partner }) {
  return (
    <>
      <h3 className="voucher-card-claim">{CLAIM_ACCESS}</h3>
      <ul className="voucher-card-bullets">
        {ACCESS_BULLETS.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
      {partner && <p className="voucher-card-by">für {partner.name}</p>}
    </>
  )
}

function CustomerText({ partner }) {
  return (
    <>
      <h3 className="voucher-card-claim">{CLAIM_CUSTOMER}</h3>
      {partner && <p className="voucher-card-by">überreicht von {partner.name}</p>}
    </>
  )
}

export default function VoucherCard({ code, batch, baseUrl }) {
  const design = cardDesign(batch)
  const partner = batch.partner
  const host = hostLabel(baseUrl)
  const isPartnerStack = design === DESIGN.partner
  const style = isPartnerStack && partner.farbe ? { '--partner-farbe': partner.farbe } : undefined

  return (
    <article className={`voucher-card voucher-card-${design}`} data-design={design} style={style}>
      {isPartnerStack && <span className="voucher-card-stripe" aria-hidden="true" />}
      <header className="voucher-card-head">
        <PawMark size={MARK_SIZE} className="voucher-card-mark" />
        <span className="voucher-card-brand">{APP_NAME}</span>
        {isPartnerStack && partner.logoUrl && <img className="voucher-card-partner-logo" src={partner.logoUrl} alt="" />}
      </header>
      <div className="voucher-card-body">
        <div className="voucher-card-text">
          {design === DESIGN.access ? <AccessText partner={partner} /> : <CustomerText partner={partner} />}
        </div>
        <QrCode url={voucherUrl(baseUrl, code)} host={host} />
      </div>
      <footer className="voucher-card-foot">
        <span className="voucher-card-code" aria-label="Einladungscode">
          {code}
        </span>
        <span className="voucher-card-hint">
          Scannen oder Code eingeben auf {host}
          {VOUCHER_PATH}
        </span>
      </footer>
    </article>
  )
}

// Rückseite (Option "Vorder- und Rückseite"): kurze Anleitung und Datenschutz in zwei Sätzen - ohne Code,
// damit die Rückseite für jede Karte eines Bogens gleich ist (print.css spiegelt den Bogen für den
// beidseitigen Druck).
export function VoucherCardBack({ batch, baseUrl }) {
  const design = cardDesign(batch)
  const host = hostLabel(baseUrl)
  const lastStep = design === DESIGN.access ? 'Profil einrichten und veröffentlichen – fertig' : 'Name fürs Zuhause wählen – fertig'

  return (
    <article className="voucher-card voucher-card-back" data-design={design}>
      <header className="voucher-card-head">
        <PawMark size={BACK_MARK_SIZE} className="voucher-card-mark" />
        <h3 className="voucher-card-back-title">So geht’s</h3>
      </header>
      <ol className="voucher-card-steps">
        <li>
          QR-Code scannen oder <strong>{host}{VOUCHER_PATH}</strong> im Browser öffnen
        </li>
        <li>Einladungscode eingeben</li>
        <li>{lastStep}</li>
      </ol>
      <p className="voucher-card-privacy">
        Kostenlos. Keine Tracker, keine fremden Dienste – eure Daten bleiben bei uns. Alles dazu unter {host}
        {PRIVACY_PATH}
      </p>
    </article>
  )
}
