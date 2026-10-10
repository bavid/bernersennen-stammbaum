import { useEffect, useState } from 'react'
import { api } from '../api'
import CopyField from './CopyField.jsx'
import Icon from './Icon.jsx'
import PartnerShareQr from './PartnerShareQr.jsx'
import { useIsAdminView, useIsDemo } from '../lib/demo.js'
import { SNIPPET_LABEL, portalUrl, shareSnippet, snippetStyle, socialText } from '../lib/partnerShare.js'
import { t } from '../lib/i18n/index.js'

// PUBLIC_URL aus /api/config. ready: die Antwort ist da (oder gescheitert - dann gilt der Ursprung dieser
// Seite). Vorher zeigt der Bereich nichts zum Kopieren, sonst landete kurz die falsche Adresse im Link.
function usePublicUrl() {
  const [state, setState] = useState({ publicUrl: null, ready: false })
  useEffect(() => {
    let cancelled = false
    Promise.resolve()
      .then(() => api.config())
      .then((config) => {
        if (!cancelled) setState({ publicUrl: config?.publicUrl || null, ready: true })
      })
      .catch(() => {
        if (!cancelled) setState({ publicUrl: null, ready: true })
      })
    return () => {
      cancelled = true
    }
  }, [])
  return state
}

function isPublic(profile) {
  return profile.status === 'aktiv' && !profile.gesperrt
}

// "Teilen" im Partner-Profil (Phase U): das Portal als eigene kleine Website bekannt machen - Link zum
// Kopieren, QR-Code (SVG/PNG), ein Knopf für die eigene Website und ein Text für Social Media. Solange das
// Profil nicht veröffentlicht ist, steht oben, dass der Link erst danach für alle funktioniert. In der Demo
// trägt der Link ?demo=1, damit er sich tatsächlich öffnen lässt (nicht in der Admin-Ansicht echter Partner).
export default function PartnerShareSection({ profile }) {
  const isDemo = useIsDemo() && !useIsAdminView()
  const { publicUrl, ready } = usePublicUrl()
  const url = portalUrl({ publicUrl, origin: window.location.origin, slug: profile.slug, demo: isDemo })

  return (
    <section className="partner-share" aria-labelledby="partner-share-title">
      <div className="einblicke-head">
        <div>
          <h2 id="partner-share-title">{t('Euer Portal teilen')}</h2>
          <p className="muted">
            {t('Verlinkt euer Portal auf eurer Website, bei Instagram oder auf der Visitenkarte – so finden euch neue Kundinnen und Kunden.')}
          </p>
        </div>
      </div>

      {!isPublic(profile) && (
        <p className="partner-share-note" role="note">
          <Icon name="lock" />
          {t('Erst nach dem Veröffentlichen für alle sichtbar.')}
        </p>
      )}

      {!ready ? (
        <p className="muted" role="status">
          {t('Lädt …')}
        </p>
      ) : (
        <ShareBlocks profile={profile} url={url} />
      )}
    </section>
  )
}

function ShareBlocks({ profile, url }) {
  return (
    <div className="card partner-share-card">
      <div className="partner-share-block">
        <CopyField id="partner-share-url" label={t('Link zu eurem Portal')} value={url} />
        {isPublic(profile) && (
          <a className="partner-share-open" href={url} target="_blank" rel="noopener noreferrer">
            <Icon name="external" />
            {t('Portal öffnen')}
          </a>
        )}
      </div>

      <div className="partner-share-block">
        <h3>{t('QR-Code')}</h3>
        <PartnerShareQr url={url} slug={profile.slug} />
      </div>

      <div className="partner-share-block">
        <h3>{t('Knopf für eure Website')}</h3>
        <p className="partner-share-preview">
          <span className="visually-hidden">{t('Vorschau: ')}</span>
          <span style={snippetStyle(profile.farbe)}>{t(SNIPPET_LABEL)}</span>
        </p>
        <CopyField
          id="partner-share-snippet"
          label={t('HTML-Code')}
          value={shareSnippet(url, { farbe: profile.farbe })}
          hint={t('Einfach in eure Website einfügen – nur ein Link, ohne Skript.')}
          multiline
          code
        />
      </div>

      <div className="partner-share-block">
        <h3>{t('Text für Social Media')}</h3>
        <CopyField id="partner-share-social" label={t('Vorschlag')} value={socialText({ typ: profile.typ, url })} multiline rows={4} />
      </div>
    </div>
  )
}
