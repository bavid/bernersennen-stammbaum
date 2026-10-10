import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Icon from './Icon.jsx'
import { readSetting, writeSetting } from '../lib/storage.js'
import { t } from '../lib/i18n/index.js'

// Merkt sich (localStorage, lib/storage.js - fällt ohne Speicher still aus), dass der Hinweis geschlossen wurde.
export const DEMO_GUIDE_SETTING = 'partnerDemoGuideClosed'
// Merkt sich für die laufende Sitzung (sessionStorage), dass der Hinweis schon einmal zu sehen war.
export const DEMO_GUIDE_SEEN_KEY = 'chronik.partnerDemoGuideSeen'
// Die Startseite der Partner- und Tierheim-Bereiche - nur dort steht der Hinweis.
export const DEMO_GUIDE_ROUTE = '/profil'

function readSeen() {
  try {
    return window.sessionStorage.getItem(DEMO_GUIDE_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

function writeSeen() {
  try {
    window.sessionStorage.setItem(DEMO_GUIDE_SEEN_KEY, '1')
  } catch {
    // ohne Speicher erscheint er eben wieder
  }
}

// Kleiner Hinweis oben im Inhalt einer Partner- oder Tierheim-Demo (App.jsx, nur Demo-Sitzungen). Audit: er stand auf
// jeder Seite und wiederholte den Umschalter „Bearbeiten | Kundensicht“ und das Menü (~330 px). Jetzt nur auf der
// Startseite /profil und nur einmal je Sitzung: wer die Seite verlässt, sieht ihn nicht wieder; geschlossen bleibt er
// auch in späteren Demo-Sitzungen zu. Keine eigenen Links - der Umschalter darüber und das Menü sind die Wege.
// Kein <h2>: der Hinweis steht vor der <h1> der Seite und soll deren Gliederung nicht vorwegnehmen.
export default function PartnerDemoGuide() {
  const { pathname } = useLocation()
  const [closed, setClosed] = useState(() => readSetting(DEMO_GUIDE_SETTING, false) === true)
  const [seen, setSeen] = useState(readSeen)
  const shown = useRef(false)
  const ref = useRef(null)
  const onStart = pathname === DEMO_GUIDE_ROUTE
  const visible = onStart && !closed && !seen

  useEffect(() => {
    if (visible) shown.current = true
    else if (shown.current && !onStart && !seen) {
      writeSeen()
      setSeen(true)
    }
  }, [visible, onStart, seen])

  if (!visible) return null

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
        <p>{t('Schaut euch in Ruhe um: Der Umschalter oben zeigt euer Profil so, wie eure Kundschaft es sieht. Alles Weitere steht im Menü.')}</p>
      </div>
      <button type="button" className="icon-btn demo-guide-close" onClick={handleClose} aria-label={t('Hinweis schließen')} title={t('Hinweis schließen')}>
        <Icon name="close" />
      </button>
    </aside>
  )
}
