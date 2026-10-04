import Icon from '../Icon.jsx'

// Vorderseite einer Visitenkarte (Phase V5, 85 × 55 mm) in einer der drei Vorlagen - card kommt aus lib/visitenkarte.js
// cardModel (Foto ohne Bannerfoto ist dort schon Klassisch). Maße und Schrift in styles/visitenkarten.css (alles in
// --mm, damit Vorschau und Druck dieselben Proportionen haben). Feste Druckfarben, kein Theme: Papier kennt keinen
// Dunkelmodus. Die Vorderseite trägt keinen QR-Code - der steht auf der Rückseite (Portal, Einladungscode oder beides).
// card.widmung: die persönliche Zeile über dem Namen (Feedback-Runde: auf jeder Kombination).

const VORLAGE_LABELS = { klassisch: 'Klassisch', foto: 'Foto', schlicht: 'Schlicht' }
const MONOGRAM_LETTERS = 2

export function cardStyle(card) {
  return { '--vk-farbe': card.farbe, '--vk-on': card.textOn, '--vk-akzent-text': card.accentText }
}

function monogram(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MONOGRAM_LETTERS)
    .map((word) => word[0].toUpperCase())
    .join('')
}

export function Kontakte({ kontakte, className = '' }) {
  if (kontakte.length === 0) return null
  return (
    <ul className={`vk-kontakte ${className}`.trim()}>
      {kontakte.map((kontakt) => (
        <li key={kontakt.key}>
          <Icon name={kontakt.icon} className="vk-kontakt-icon" />
          <span>{kontakt.text}</span>
        </li>
      ))}
    </ul>
  )
}

function Widmung({ card }) {
  if (!card.widmung) return null
  return <p className="vk-widmung">{card.widmung}</p>
}

function Logo({ card }) {
  if (card.logoUrl) return <img className="vk-logo" src={card.logoUrl} alt="" />
  return (
    <span className="vk-monogram" aria-hidden="true">
      {monogram(card.name)}
    </span>
  )
}

function KlassischFront({ card }) {
  return (
    <>
      <div className="vk-klassisch-logo">
        <Logo card={card} />
      </div>
      <div className="vk-klassisch-text">
        <Widmung card={card} />
        <p className="vk-name">{card.name}</p>
        {card.kurztext && <p className="vk-kurztext">{card.kurztext}</p>}
        <div className="vk-foot">
          {card.ansprechperson && <p className="vk-person">{card.ansprechperson}</p>}
          <Kontakte kontakte={card.kontakte} />
        </div>
      </div>
      <span className="vk-rule" aria-hidden="true" />
    </>
  )
}

function FotoFront({ card }) {
  return (
    <>
      <img className="vk-foto-bild" src={card.fotoUrl} alt="" />
      <span className="vk-scrim" aria-hidden="true" />
      {card.logoUrl && (
        <span className="vk-foto-logo">
          <img src={card.logoUrl} alt="" />
        </span>
      )}
      <div className="vk-foto-text">
        <span className="vk-foto-bar" aria-hidden="true" />
        <Widmung card={card} />
        <p className="vk-name">{card.name}</p>
        {card.kurztext && <p className="vk-kurztext">{card.kurztext}</p>}
        {card.ansprechperson && <p className="vk-person">{card.ansprechperson}</p>}
        <Kontakte kontakte={card.kontakte} className="vk-kontakte-zeile" />
      </div>
    </>
  )
}

function SchlichtFront({ card }) {
  return (
    <>
      <header className="vk-band">
        <Widmung card={card} />
        <p className="vk-name">{card.name}</p>
      </header>
      <div className="vk-schlicht-body">
        {card.kurztext && <p className="vk-kurztext">{card.kurztext}</p>}
        <div className="vk-foot">
          {card.ansprechperson && <p className="vk-person">{card.ansprechperson}</p>}
          <Kontakte kontakte={card.kontakte} />
        </div>
      </div>
    </>
  )
}

const FRONTS = { klassisch: KlassischFront, foto: FotoFront, schlicht: SchlichtFront }

export default function VisitenkarteFront({ card }) {
  const Front = FRONTS[card.vorlage] || KlassischFront
  return (
    <article
      className={`vk-card vk-front vk-${card.vorlage}${card.widmung ? ' has-widmung' : ''}`}
      data-vorlage={card.vorlage}
      style={cardStyle(card)}
      aria-label={`Vorderseite (${VORLAGE_LABELS[card.vorlage] || card.vorlage})`}
    >
      <Front card={card} />
    </article>
  )
}
