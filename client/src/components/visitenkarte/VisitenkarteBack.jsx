import PawMark from '../PawMark.jsx'
import VisitenkarteQr from './VisitenkarteQr.jsx'
import { cardStyle } from './VisitenkarteFront.jsx'
import { t } from '../../lib/i18n/index.js'

// Rückseite der Visitenkarte (Phase V5, 85 × 55 mm): der QR-Code zum Portal (/p/:slug) mit der kurzen Adresse, in der
// Farbe und Vorlage des Partners. Die Rückseiten mit Code (Einladungskarte, Kombi) stehen in EinladungBack.jsx und
// KombiBack.jsx - sie teilen sich Marke und Portal-Adresse von hier.

const APP_NAME = 'Familie auf Pfoten'
const MARK_SIZE = 14

export function Brand() {
  return (
    <p className="vk-back-brand">
      <PawMark size={MARK_SIZE} className="vk-back-mark" />
      <span>{APP_NAME}</span>
    </p>
  )
}

// Kurze Portal-Adresse mit Umbruchstelle vor dem Pfad - so bricht sie an "/" statt mitten im Namen.
export function PortalLabel({ card }) {
  return (
    <>
      <span className="vk-nowrap">{card.host}</span>
      <wbr />
      {card.portalPfad}
    </>
  )
}

export default function VisitenkarteBack({ card }) {
  return (
    <article
      className={`vk-card vk-back vk-back-portal vk-${card.vorlage}`}
      data-vorlage={card.vorlage}
      style={cardStyle(card)}
      aria-label={t('Rückseite mit QR-Code zum Portal')}
    >
      <span className="vk-stripe" aria-hidden="true" />
      <div className="vk-qr-box">
        <VisitenkarteQr url={card.portalUrl} label={t('QR-Code, öffnet {url}', { url: card.portalLabel })} />
      </div>
      <div className="vk-back-text">
        <Brand />
        <p className="vk-back-title">{t('Unser Portal')}</p>
        <p className="vk-back-lead">{t('Neuigkeiten, Termine und Einblicke von {name}', { name: card.name })}</p>
        <p className="vk-back-url">
          <PortalLabel card={card} />
        </p>
      </div>
    </article>
  )
}
