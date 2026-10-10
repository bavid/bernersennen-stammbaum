import { useState } from 'react'
import { Link } from 'react-router-dom'
import InstallHint from '../InstallHint.jsx'
import PushSchalter from './app/PushSchalter.jsx'
import StandortSchalter from './app/StandortSchalter.jsx'
import EinstellungenZuruecksetzen from './app/EinstellungenZuruecksetzen.jsx'
import TourRestart from '../tour/TourRestart.jsx'
import { useT } from '../../lib/i18n/index.js'
import '../../styles/app-settings.css'

// Einstellungen › App: alles, was die App auf diesem Gerät betrifft - „Als App aufs Handy“ (Install-Hinweis in der
// bleibenden Fassung, Link zur Anleitung /app), Benachrichtigungen aufs Handy (Web Push), „Standort für ‚In der Nähe‘
// merken“ und „Unsere Einstellungen zurücksetzen“. Nach dem Zurücksetzen mounten die Schalter neu (key), damit sie ihren
// Zustand frisch lesen.
export default function AppSection() {
  const t = useT()
  const [generation, setGeneration] = useState(0)

  return (
    <section className="settings-block app-section" aria-labelledby="app-title">
      <h2 id="app-title" className="visually-hidden">
        {t('settings.tab.app')}
      </h2>
      <InstallHint variant="settings" headingLevel="h3">
        <Link to="/app" className="install-hint-link">
          {t('login.installGuide')}
        </Link>
      </InstallHint>

      <TourRestart />

      <div className="app-section-group" aria-labelledby="app-berechtigungen-title">
        <h3 id="app-berechtigungen-title">{t('settings.app.permissions')}</h3>
        <PushSchalter key={`push-${generation}`} />
        <StandortSchalter key={`standort-${generation}`} />
        <EinstellungenZuruecksetzen onDone={() => setGeneration((value) => value + 1)} />
      </div>
    </section>
  )
}
