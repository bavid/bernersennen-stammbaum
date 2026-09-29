import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import { readSetting, writeSetting } from '../lib/storage.js'

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
export default function PartnerDemoGuide({ family }) {
  const [closed, setClosed] = useState(() => readSetting(DEMO_GUIDE_SETTING, false) === true)

  if (closed) return null

  function handleClose() {
    writeSetting(DEMO_GUIDE_SETTING, true)
    setClosed(true)
  }

  return (
    <aside className="demo-guide" aria-labelledby="demo-guide-title">
      <div className="demo-guide-text">
        <h2 id="demo-guide-title">Das ist die Demo eines Partner-Bereichs</h2>
        <p>Schaut euch in Ruhe um – hier geht’s zu den drei wichtigsten Stellen:</p>
      </div>
      <nav className="demo-guide-links" aria-label="Rundgang durch die Demo">
        {demoGuideLinks(family).map((link) => (
          <Link key={link.to} to={link.to} className="btn btn-ghost">
            <Icon name={link.icon} />
            {link.label}
          </Link>
        ))}
      </nav>
      <button type="button" className="icon-btn demo-guide-close" onClick={handleClose} aria-label="Hinweis schließen" title="Hinweis schließen">
        <Icon name="close" />
      </button>
    </aside>
  )
}
