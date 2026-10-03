import VisitenkarteQr from './VisitenkarteQr.jsx'
import { Brand } from './VisitenkarteBack.jsx'
import { codeGroups, voucherTarget } from '../../lib/visitenkarte.js'

// Rückseite einer Einladungskarte (85 × 55 mm): gestaltet von Familie auf Pfoten, nicht vom Partner - Marke, Titel, kurzer
// Text und "So geht's" aus der Admin-Einstellung (rueckseite: lib/einladungskarte.js rueckseiteModel), dazu der eigene Code
// der Karte in Vierergruppen mit QR-Code auf /v#CODE (der Code nur hinter der Raute) und die gezeigte Adresse. Feste
// Farben der Plattform (styles/einladungskarte.css) - nie Farbe, Name oder Texte des Partners; card liefert nur die
// Adresse für den QR-Code (baseUrl). Der Code steht nur hier und im QR-Pfad im DOM. muster: Beispiel-Code (Demo,
// Admin-Ansicht, Vorschau vor dem Druck, Admin-Einstellung) - deutlich als "Muster" gekennzeichnet.

function Schritte({ schritte }) {
  if (schritte.length === 0) return null
  return (
    <div className="vk-einladung-so">
      <p className="vk-einladung-so-titel">So geht’s</p>
      <ol className="vk-einladung-schritte">
        {schritte.map((schritt, index) => (
          <li key={`${index}-${schritt}`}>{schritt}</li>
        ))}
      </ol>
    </div>
  )
}

export default function EinladungBack({ card, rueckseite, code, muster = false }) {
  return (
    <article
      className="vk-card vk-back vk-back-einladung"
      data-muster={muster ? 'true' : undefined}
      aria-label={muster ? 'Rückseite der Einladungskarte (Muster)' : 'Rückseite der Einladungskarte'}
    >
      <span className="vk-einladung-band" aria-hidden="true" />
      <div className="vk-einladung-body">
        <Brand />
        <p className="vk-einladung-titel">{rueckseite.titel}</p>
        <p className="vk-einladung-text">{rueckseite.text}</p>
        <Schritte schritte={rueckseite.schritte} />
      </div>
      <div className="vk-einladung-code-col">
        <div className="vk-qr-box">
          <VisitenkarteQr url={voucherTarget(card.baseUrl, code)} label={`QR-Code mit dem Code der Karte, öffnet ${rueckseite.adresse}`} />
        </div>
        <p className="vk-code" aria-label={`Code ${code}`}>
          {codeGroups(code).map((group, index) => (
            <span key={`${index}-${group}`}>{group}</span>
          ))}
        </p>
        <p className="vk-einladung-adresse">{rueckseite.adresse}</p>
      </div>
      {muster && (
        <span className="vk-muster">
          Muster<span className="visually-hidden"> – Beispiel-Code, lässt sich nicht einlösen</span>
        </span>
      )}
    </article>
  )
}
