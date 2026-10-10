import { useEffect, useRef } from 'react'
import Icon from '../Icon.jsx'
import { Button } from '../ui/index.js'
import { VisitenkartenDruck } from '../visitenkarte/VisitenkartenBogen.jsx'
import GeschenkBack from './GeschenkBack.jsx'
import GeschenkFront from './GeschenkFront.jsx'
import GeschenkkarteBogen from './GeschenkkarteBogen.jsx'
import { voucherLink } from '../../lib/visits.js'
import { hostLabel } from '../../lib/voucherPrint.js'
import { t } from '../../lib/i18n/index.js'

export const GESCHENK_DRUCK_HINWEIS = 'Einseitig auf A4 drucken, ausschneiden und an der gestrichelten Linie falten – „Für …“ und „Von …“ schreibt ihr von Hand dazu.'
export const GESCHENK_MUSTER_HINWEIS = 'Muster – in der Demo steht hier ein Beispiel-Code, der sich nicht einlösen lässt.'

// „Als Geschenkkarte drucken“ im Einladen-Dialog (invite/HomeInvite.jsx, Zuhause verschenken): Vorschau von Vorder- und
// Rückseite, ein Satz zum Falten und „Drucken“ (window.print). Die Druckfassung hängt VisitenkartenDruck direkt in <body>
// (beim Drucken nur sie, die App ist aus). code kommt aus dem State des Dialogs - nie aus oder in eine Adresse; der
// QR-Code trägt ihn nur hinter der Raute (/v#CODE). muster: Demo mit Beispiel-Code, sichtbar als „Muster“ gekennzeichnet.
export default function GeschenkkartePanel({ code, muster = false, onBack }) {
  const headingRef = useRef(null)
  const qrUrl = voucherLink(code)
  const adresse = hostLabel(window.location.origin)
  const karte = { code, qrUrl, adresse, muster }

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <section className="gk-panel" aria-labelledby="gk-panel-title">
      <button type="button" className="back-link invite-back" onClick={onBack}>
        <Icon name="arrowLeft" /> {t('Zurück zu den Codes')}
      </button>
      <h3 id="gk-panel-title" ref={headingRef} tabIndex={-1}>
        {t('Geschenkkarte')}
      </h3>
      {muster && <p className="field-hint">{t(GESCHENK_MUSTER_HINWEIS)}</p>}
      <div className="gk-vorschau">
        <div className="gk-vorschau-karten">
          <GeschenkFront a6 />
          <GeschenkBack a6 {...karte} />
        </div>
      </div>
      <p className="muted">{t(GESCHENK_DRUCK_HINWEIS)}</p>
      <Button onClick={() => window.print()}>{t('Drucken')}</Button>
      <VisitenkartenDruck>
        <div className="vk-sheets">
          <GeschenkkarteBogen {...karte} />
        </div>
      </VisitenkartenDruck>
    </section>
  )
}
