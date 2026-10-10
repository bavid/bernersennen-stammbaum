import { useEffect, useMemo, useRef } from 'react'
import CopyField from '../CopyField.jsx'
import { qrSvgMarkup } from '../../lib/partnerShare.js'
import { rahmenLink } from '../../lib/rahmenGeraet.js'
import { t } from '../../lib/i18n/index.js'

// Der Link zu einem neuen Bilderrahmen - genau einmal, gleich nach dem Anlegen (der Server kennt nur noch einen Hash):
// zum Kopieren und als QR-Code für die Kamera des Tablets. Das Token steht nur hinter dem # (nie an den Server geschickt).
export default function RahmenLinkReveal({ geraet, token, onDone }) {
  const headingRef = useRef(null)
  const link = rahmenLink(token)
  const qr = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvgMarkup(link))}`, [link])

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <div className="rahmen-reveal">
      <p className="rahmen-reveal-title" ref={headingRef} tabIndex={-1}>
        {t('„{name}“ ist bereit', { name: geraet.name })}
      </p>
      <div className="rahmen-reveal-body">
        <img src={qr} alt={t('QR-Code mit dem Link zum Bilderrahmen')} className="rahmen-reveal-qr" width={152} height={152} />
        <div className="rahmen-reveal-text">
          <CopyField
            id={`rahmen-link-${geraet.id}`}
            label={t('Link zum Bilderrahmen')}
            value={link}
            hint={t('Öffnet den Link auf dem Gerät, das zum Bilderrahmen werden soll – oder scannt den QR-Code mit seiner Kamera.')}
          />
          <p className="field-hint">
            <strong>{t('Diesen Link seht ihr nur jetzt.')}</strong>{' '}
            {t('Wer ihn hat, sieht die gewählten Fotos – gebt ihn nur auf das Gerät weiter. Verloren? Einfach beenden und einen neuen erstellen.')}
          </p>
        </div>
      </div>
      <div className="settings-actions">
        <button type="button" className="btn btn-primary" onClick={onDone}>
          {t('Fertig')}
        </button>
      </div>
    </div>
  )
}
