import { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import {
  detectPlatform,
  dismissInstallHint,
  isInstallHintDismissed,
  isStandalone,
  promptInstall,
  subscribeInstallPrompt
} from '../lib/install.js'
import '../styles/install-hint.css'

export const INSTALL_TITLE = 'Als App aufs Handy – ohne App Store'
const STORES_LINE = 'Später auch in den App Stores – heute schon als App über den Browser.'

// Kurze Anleitung je Gerät - Android/Chrome bekommt den echten Knopf, sobald der Browser den Dialog anbietet
// (lib/install.js, beforeinstallprompt); iPhone/iPad kennen nur den Weg über „Teilen“.
function Steps({ platform, promptReady, onInstall, installing }) {
  if (promptReady) {
    return (
      <div className="install-hint-actions">
        <button type="button" className="btn btn-primary" onClick={onInstall} disabled={installing}>
          App installieren
        </button>
        <span className="muted">Ein Tippen – dann liegt die Chronik auf dem Startbildschirm.</span>
      </div>
    )
  }
  if (platform === 'ios') {
    return (
      <ol className="install-hint-steps">
        <li>
          In Safari unten <Icon name="share" /> <strong>Teilen</strong> antippen.
        </li>
        <li>
          <strong>„Zum Home-Bildschirm“</strong> wählen (ggf. in der Liste nach unten scrollen) und mit „Hinzufügen“ bestätigen.
        </li>
      </ol>
    )
  }
  if (platform === 'android') {
    return (
      <ol className="install-hint-steps">
        <li>
          In Chrome oben rechts <strong>⋮</strong> antippen.
        </li>
        <li>
          <strong>„App installieren“</strong> oder <strong>„Zum Startbildschirm hinzufügen“</strong> wählen.
        </li>
      </ol>
    )
  }
  return (
    <p className="muted">
      Diese Seite auf dem Handy öffnen – oder hier im Browser über das Symbol <Icon name="download" /> in der Adressleiste installieren.
    </p>
  )
}

// „Als App aufs Handy“ - variant 'card' (Login-Seite): ruhige Karte, mit „Später“ 30 Tage weg; variant 'settings'
// (Einstellungen › App): bleibt stehen und sagt „Schon installiert“, wenn die App vom Startbildschirm läuft.
// platform/standalone sind nur für Tests von außen setzbar; children: z. B. ein Link zur ausführlichen Anleitung.
export default function InstallHint({
  variant = 'card',
  headingLevel: Heading = 'h2',
  platform = detectPlatform(),
  standalone = isStandalone(),
  children = null
}) {
  const [promptReady, setPromptReady] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installed, setInstalled] = useState(standalone)
  const [dismissed, setDismissed] = useState(() => variant === 'card' && isInstallHintDismissed())
  const titleId = `install-hint-${variant}`

  useEffect(() => subscribeInstallPrompt(setPromptReady), [])

  async function handleInstall() {
    setInstalling(true)
    try {
      if ((await promptInstall()) === 'accepted') setInstalled(true)
    } finally {
      setInstalling(false)
    }
  }

  function handleDismiss() {
    dismissInstallHint()
    setDismissed(true)
  }

  if (dismissed) return null
  if (installed && variant === 'card') return null

  return (
    <section className={`install-hint install-hint-${variant}`} aria-labelledby={titleId}>
      <div className="install-hint-head">
        <Icon name="paw" />
        <Heading id={titleId}>{installed ? 'Schon als App installiert' : INSTALL_TITLE}</Heading>
      </div>
      {installed ? (
        <p className="muted">
          <Icon name="check" /> Diese Chronik läuft vom Startbildschirm aus – alles ist eingerichtet.
        </p>
      ) : (
        <>
          <Steps platform={platform} promptReady={promptReady} onInstall={handleInstall} installing={installing} />
          <p className="install-hint-note">{STORES_LINE}</p>
        </>
      )}
      {children}
      {variant === 'card' && !installed && (
        <button type="button" className="btn btn-ghost install-hint-later" onClick={handleDismiss}>
          Später
        </button>
      )}
    </section>
  )
}
