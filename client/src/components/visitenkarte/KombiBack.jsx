import VisitenkarteQr from './VisitenkarteQr.jsx'
import { Brand, PortalLabel } from './VisitenkarteBack.jsx'
import { codeGroups, voucherTarget } from '../../lib/visitenkarte.js'
import { t } from '../../lib/i18n/index.js'

// Rückseite der Kombi (Feedback-Runde, 85 × 55 mm): Portal und Einladungscode nebeneinander - oben Marke, Titel und der
// kurze Text von Familie auf Pfoten (rueckseite: lib/einladungskarte.js rueckseiteModel, Admin-Einstellung), darunter zwei
// kleine QR-Codes: "Unser Portal" (/p/:slug) und "Euer Einladungscode" (/v#CODE, der Code nur hinter der Raute) mit dem
// Code in Vierergruppen. Feste Farben der Plattform wie die Einladungskarte (styles/einladungskarte.css); card liefert
// Name, Portal und die Adresse der QR-Codes. muster: Beispiel-Code (Demo, Admin-Ansicht, Vorschau vor dem Druck).
export default function KombiBack({ card, rueckseite, code, muster = false }) {
  return (
    <article
      className="vk-card vk-back vk-back-einladung vk-back-kombi"
      data-muster={muster ? 'true' : undefined}
      aria-label={muster ? t('Rückseite mit Portal und Einladungscode (Muster)') : t('Rückseite mit Portal und Einladungscode')}
    >
      <span className="vk-einladung-band" aria-hidden="true" />
      <div className="vk-kombi-head">
        <Brand />
        <p className="vk-einladung-titel">{rueckseite.titel}</p>
        <p className="vk-kombi-text">{rueckseite.text}</p>
      </div>
      <div className="vk-kombi-col">
        <div className="vk-qr-box">
          <VisitenkarteQr url={card.portalUrl} label={t('QR-Code, öffnet {url}', { url: card.portalLabel })} />
        </div>
        <p className="vk-kombi-label">{t('Unser Portal')}</p>
        <p className="vk-kombi-sub">
          <PortalLabel card={card} />
        </p>
      </div>
      <div className="vk-kombi-col">
        <div className="vk-qr-box">
          <VisitenkarteQr url={voucherTarget(card.baseUrl, code)} label={t('QR-Code mit dem Einladungscode, öffnet {url}', { url: rueckseite.adresse })} />
        </div>
        <p className="vk-kombi-label">{t('Euer Einladungscode')}</p>
        <p className="vk-code" aria-label={t('Einladungscode {code}', { code })}>
          {codeGroups(code).map((group, index) => (
            <span key={`${index}-${group}`}>{group}</span>
          ))}
        </p>
      </div>
      {muster && (
        <span className="vk-muster">
          {t('Muster')}<span className="visually-hidden">{t(' – Beispiel-Code, lässt sich nicht einlösen')}</span>
        </span>
      )}
    </article>
  )
}
