import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PublicHeader from '../components/PublicHeader.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import TabBar from '../components/TabBar.jsx'
import Icon from '../components/Icon.jsx'
import { detectPlatform, isStandalone, promptInstall, subscribeInstallPrompt } from '../lib/install.js'
import { PLATFORMS, STORES_LINE, guideFor } from '../lib/appGuide.js'
import { isHouseholdIdentity } from '../lib/areas.js'
import '../styles/app-guide.css'

export const APP_PATH = '/app'
const SETTINGS_APP_PATH = '/einstellungen?bereich=app'

// Schritte eines Geräts: nummerierte Liste, je Schritt ein kleines Symbol (kein Bildschirmfoto fremder Oberflächen).
function Steps({ guide }) {
  return (
    <>
      <ol className="app-guide-steps">
        {guide.steps.map((step, index) => (
          <li key={step.text}>
            <span className="app-guide-step-icon" aria-hidden="true">
              <Icon name={step.icon} />
            </span>
            <span>
              <span className="visually-hidden">Schritt {index + 1}: </span>
              {step.text}
            </span>
          </li>
        ))}
      </ol>
      {guide.notes.map((note) => (
        <p key={note} className="app-guide-note muted">
          {note}
        </p>
      ))}
    </>
  )
}

// /app - „Als App aufs Handy“: die ausführliche Anleitung je Gerät (lib/appGuide.js), öffentlich mit und ohne Sitzung
// wie /finanzierung (App.jsx). Das erkannte Gerät (lib/install.js detectPlatform) steht zuerst; läuft die Seite schon
// vom Startbildschirm, sagt sie „Schon installiert“. Bietet der Browser den Dialog an (Chrome/Edge), gibt es den Knopf.
export default function AppPage({ family = null, platform = detectPlatform(), standalone = isStandalone() }) {
  const [current, setCurrent] = useState(platform)
  const [promptReady, setPromptReady] = useState(false)
  const [installed, setInstalled] = useState(standalone)
  const guide = guideFor(current)

  useEffect(() => subscribeInstallPrompt(setPromptReady), [])

  async function handleInstall() {
    if ((await promptInstall()) === 'accepted') setInstalled(true)
  }

  return (
    <div className="public-page app-guide-page">
      <PublicHeader family={family} />
      <div className="legal-hero app-guide-hero">
        <span className="eyebrow">Ohne App Store</span>
        <h1>Als App aufs Handy</h1>
        <p className="page-lede">
          Familie auf Pfoten lässt sich direkt aus dem Browser auf den Startbildschirm legen – mit eigenem Symbol, eigenem
          Fenster und ohne Adressleiste. {STORES_LINE}
        </p>
      </div>

      {installed ? (
        <p className="app-guide-status" role="status">
          <Icon name="check" /> Schon installiert – diese Chronik läuft vom Startbildschirm aus.
        </p>
      ) : (
        promptReady && (
          <div className="app-guide-install">
            <button type="button" className="btn btn-primary" onClick={handleInstall}>
              App installieren
            </button>
            <span className="muted">Ein Tippen genügt – der Browser fragt kurz nach.</span>
          </div>
        )
      )}

      <section className="app-guide-section" aria-labelledby="app-guide-title">
        <h2 id="app-guide-title">So geht’s auf eurem Gerät</h2>
        <TabBar
          tabs={PLATFORMS}
          current={current}
          label="Gerät"
          idPrefix="app-guide"
          panelId="app-guide-panel"
          className="app-guide-tabs"
          onSelect={setCurrent}
        />
        <div className="app-guide-panel" id="app-guide-panel" role="tabpanel" aria-labelledby={`app-guide-${current}`}>
          <h3>{guide.title}</h3>
          <Steps guide={guide} />
        </div>
      </section>

      <section className="app-guide-section" aria-labelledby="app-guide-warum-title">
        <h2 id="app-guide-warum-title">Was die App kann – und was nicht</h2>
        <ul className="app-guide-facts">
          <li>Dieselbe Chronik wie im Browser, nur schneller zur Hand – eure Daten bleiben auf dem Server.</li>
          <li>Ohne Verbindung zeigt sie eine kurze Offline-Seite; Einträge und Fotos brauchen das Netz.</li>
          <li>Neue Versionen kommen von allein mit – ein Hinweis „Neue Version verfügbar“ fragt vor dem Neuladen.</li>
        </ul>
        {isHouseholdIdentity(family) && (
          <p className="app-guide-note">
            Angemeldet findet ihr diese Hinweise auch unter <Link to={SETTINGS_APP_PATH}>Einstellungen › App</Link>.
          </p>
        )}
      </section>
      <PublicFooter />
    </div>
  )
}
