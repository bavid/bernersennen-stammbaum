import PawMark from '../PawMark.jsx'
import VisitenkarteQr from './VisitenkarteQr.jsx'
import { cardStyle } from './VisitenkarteFront.jsx'
import { codeGroups, voucherTarget } from '../../lib/visitenkarte.js'

// Rückseite einer Visitenkarte (Phase V5, 85 × 55 mm): ohne Gutschein der QR-Code zum Portal (/p/:slug) mit der kurzen
// Adresse, mit Gutschein (code) "Dein Gutschein für Familie auf Pfoten" mit QR-Code auf /v#CODE und dem Code in
// Vierergruppen - der Code steht nur hier und im QR-Pfad im DOM. muster: Beispiel-Code (Demo, Admin-Ansicht oder
// Vorschau vor dem Holen) - deutlich als "Muster" gekennzeichnet, lässt sich nie einlösen.

const APP_NAME = 'Familie auf Pfoten'
const MARK_SIZE = 14

// Auch auf der Rückseite der Einladungskarte (EinladungBack.jsx).
export function Brand() {
  return (
    <p className="vk-back-brand">
      <PawMark size={MARK_SIZE} className="vk-back-mark" />
      <span>{APP_NAME}</span>
    </p>
  )
}

// Kurze Portal-Adresse mit Umbruchstelle vor dem Pfad - so bricht sie an "/" statt mitten im Namen.
function PortalLabel({ card }) {
  return (
    <>
      <span className="vk-nowrap">{card.host}</span>
      <wbr />
      {card.portalPfad}
    </>
  )
}

function PortalBack({ card }) {
  return (
    <article
      className={`vk-card vk-back vk-back-portal vk-${card.vorlage}`}
      data-vorlage={card.vorlage}
      style={cardStyle(card)}
      aria-label="Rückseite mit QR-Code zum Portal"
    >
      <span className="vk-stripe" aria-hidden="true" />
      <div className="vk-qr-box">
        <VisitenkarteQr url={card.portalUrl} label={`QR-Code, öffnet ${card.portalLabel}`} />
      </div>
      <div className="vk-back-text">
        <Brand />
        <p className="vk-back-title">Unser Portal</p>
        <p className="vk-back-lead">Neuigkeiten, Termine und Einblicke von {card.name}</p>
        <p className="vk-back-url">
          <PortalLabel card={card} />
        </p>
      </div>
    </article>
  )
}

function GutscheinBack({ card, code, muster }) {
  return (
    <article
      className={`vk-card vk-back vk-back-gutschein vk-${card.vorlage}`}
      data-vorlage={card.vorlage}
      data-muster={muster ? 'true' : undefined}
      style={cardStyle(card)}
      aria-label={muster ? 'Rückseite mit Gutschein (Muster)' : 'Rückseite mit Gutschein'}
    >
      <span className="vk-band-top" aria-hidden="true" />
      <div className="vk-back-text">
        <Brand />
        <p className="vk-back-title">Dein Gutschein für {APP_NAME}</p>
        <p className="vk-back-lead">Eine eigene Chronik für deine Tiere – kostenlos, überreicht von {card.name}.</p>
        <p className="vk-code" aria-label={`Gutschein-Code ${code}`}>
          {codeGroups(code).map((group, index) => (
            <span key={`${index}-${group}`}>{group}</span>
          ))}
        </p>
        <p className="vk-back-hint">
          Scannen oder Code eingeben auf <span className="vk-nowrap">{card.host}/v</span>
        </p>
        <p className="vk-back-hint">
          Mehr von uns: <PortalLabel card={card} />
        </p>
      </div>
      <div className="vk-qr-box">
        <VisitenkarteQr url={voucherTarget(card.baseUrl, code)} label={`QR-Code für den Gutschein, öffnet ${card.host}/v`} />
      </div>
      {muster && (
        <span className="vk-muster">
          Muster<span className="visually-hidden"> – Beispiel-Code, lässt sich nicht einlösen</span>
        </span>
      )}
    </article>
  )
}

export default function VisitenkarteBack({ card, code = null, muster = false }) {
  if (code) return <GutscheinBack card={card} code={code} muster={muster} />
  return <PortalBack card={card} />
}
