import { useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Icon from './Icon.jsx'
import { readSetting, writeSetting } from '../lib/storage.js'
import { t } from '../lib/i18n/index.js'

// Merkt sich (localStorage, lib/storage.js - fällt ohne Speicher still aus), dass der Hinweis geschlossen wurde.
export const DEMO_GUIDE_SETTING = 'partnerDemoGuideClosed'

// Die drei Wege durch einen Partner-Bereich: Profil, Kundensicht und - je nach Art - Beiträge (Partner) oder
// die eigenen Tiere (Tierheim).
const GUIDE_PROFILE = { to: '/profil', label: 'Profil bearbeiten', icon: 'edit' }
const GUIDE_CUSTOMER_VIEW = { to: '/kundensicht', label: 'Kundensicht', icon: 'eye' }
const GUIDE_POSTS = { to: '/beitraege', label: 'Beiträge', icon: 'megaphone' }
const GUIDE_ANIMALS = { to: '/tiere', label: 'Tiere', icon: 'paw' }

export function demoGuideLinks(family) {
  return [GUIDE_PROFILE, GUIDE_CUSTOMER_VIEW, family?.art === 'tierheim' ? GUIDE_ANIMALS : GUIDE_POSTS]
}

// Kleiner Rundgang oben im Inhalt einer Partner- oder Tierheim-Demo (App.jsx, nur Demo-Sitzungen): was man hier
// sieht und wohin es geht. Einmal geschlossen, bleibt er zu - auch in späteren Demo-Sitzungen.
// Kein <h2>: der Hinweis steht vor der <h1> der Seite und soll deren Gliederung nicht vorwegnehmen.
// Audit V7a: der Weg zur Seite, auf der man gerade ist, trägt aria-current und steht leiser da - "Kundensicht" auf der
// Kundensicht (der Umschalter "Bearbeiten | Kundensicht" darüber zeigt sie schon) ist dann kein Ziel mehr.
export default function PartnerDemoGuide({ family }) {
  const { pathname } = useLocation()
  const [closed, setClosed] = useState(() => readSetting(DEMO_GUIDE_SETTING, false) === true)
  const ref = useRef(null)

  if (closed) return null

  // Der Knopf verschwindet mit dem Hinweis - damit der Fokus nicht an den Anfang des Dokuments springt, geht er
  // zur Überschrift der Seite darunter (im selben <main>).
  function handleClose() {
    const heading = ref.current?.parentElement?.querySelector('h1')
    writeSetting(DEMO_GUIDE_SETTING, true)
    setClosed(true)
    if (heading) {
      if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
      heading.focus({ preventScroll: true })
    }
  }

  return (
    <aside className="demo-guide" aria-labelledby="demo-guide-title" ref={ref}>
      <div className="demo-guide-text">
        <p className="demo-guide-title" id="demo-guide-title">
          {t('Das ist die Demo eines Partner-Bereichs')}
        </p>
        <p>{t('Schaut euch in Ruhe um – hier geht’s zu den drei wichtigsten Stellen:')}</p>
      </div>
      <nav className="demo-guide-links" aria-label={t('Rundgang durch die Demo')}>
        {demoGuideLinks(family).map((link) => (
          <Link key={link.to} to={link.to} className="btn btn-ghost" aria-current={pathname === link.to ? 'page' : undefined}>
            <Icon name={link.icon} />
            {t(link.label)}
          </Link>
        ))}
      </nav>
      <button type="button" className="icon-btn demo-guide-close" onClick={handleClose} aria-label={t('Hinweis schließen')} title={t('Hinweis schließen')}>
        <Icon name="close" />
      </button>
    </aside>
  )
}
