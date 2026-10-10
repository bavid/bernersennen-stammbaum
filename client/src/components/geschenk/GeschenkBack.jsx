import VisitenkarteQr from '../visitenkarte/VisitenkarteQr.jsx'
import { codeGroups } from '../../lib/visitenkarte.js'
import { GESCHENK_FUSS, GESCHENK_SCHRITTE } from '../../lib/geschenkkarte.js'
import { t } from '../../lib/i18n/index.js'

// Rückseite der Geschenkkarte (lib/geschenkkarte.js): drei kurze Schritte, der Satz zu Kosten und Daten, rechts QR-Code
// (öffnet /v#CODE - der Code nur hinter der Raute), der Code in Gruppen und die kurze Adresse. qrUrl/adresse kommen vom
// Aufrufer (Familie: eigene Adresse, Partner: öffentliche Adresse der Plattform). muster: Beispiel-Code, deutlich als
// „Muster“ gekennzeichnet (Demo, Vorschau vor dem Druck). Der Code steht nur hier und im QR-Code im DOM.

export default function GeschenkBack({ code, qrUrl, adresse, muster = false, a6 = false }) {
  return (
    <article
      className={`vk-card gk-card gk-back${a6 ? ' gk-a6' : ''}`}
      data-muster={muster ? 'true' : undefined}
      aria-label={muster ? t('Rückseite der Geschenkkarte (Muster)') : t('Rückseite der Geschenkkarte')}
    >
      <div className="gk-back-body">
        <p className="gk-back-titel">{t('So löst ihr das Geschenk ein')}</p>
        <ol className="gk-schritte">
          {GESCHENK_SCHRITTE.map((schritt) => (
            <li key={schritt}>{t(schritt)}</li>
          ))}
        </ol>
        <p className="gk-fuss">{t(GESCHENK_FUSS)}</p>
      </div>
      <div className="gk-code-col">
        <div className="vk-qr-box">
          <VisitenkarteQr url={qrUrl} label={t('QR-Code mit dem Code der Karte, öffnet {url}', { url: adresse })} />
        </div>
        <p className="vk-code gk-code" aria-label={t('Einladungscode {code}', { code })}>
          {codeGroups(code).map((group, index) => (
            <span key={`${index}-${group}`}>{group}</span>
          ))}
        </p>
        <p className="gk-adresse">{adresse}</p>
      </div>
      {muster && (
        <span className="vk-muster">
          {t('Muster')}
          <span className="visually-hidden">{t(' – Beispiel-Code, lässt sich nicht einlösen')}</span>
        </span>
      )}
    </article>
  )
}
