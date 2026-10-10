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
import { tList, useT } from '../lib/i18n/index.js'
import '../styles/install-hint.css'
import { Button } from './ui/index.js'

export const INSTALL_TITLE = 'Als App aufs Handy – ohne App Store'

// Kurze Anleitung je Gerät - Android/Chrome bekommt den echten Knopf, sobald der Browser den Dialog anbietet
// (lib/install.js, beforeinstallprompt); iPhone/iPad kennen nur den Weg über „Teilen“.
function Steps({ platform, promptReady, onInstall, installing }) {
  const t = useT()
  const [ios1, ios2, and1, and2, desktop] = ['install.ios.1', 'install.ios.2', 'install.android.1', 'install.android.2', 'install.desktop'].map(tList)
  if (promptReady) {
    return (
      <div className="install-hint-actions">
        <Button type="button" onClick={onInstall} disabled={installing}>
          {t('install.install')}
        </Button>
        <span className="muted">{t('install.tap')}</span>
      </div>
    )
  }
  if (platform === 'ios') {
    return (
      <ol className="install-hint-steps">
        <li>
          {ios1[0]} <Icon name="share" /> <strong>{ios1[1]}</strong> {ios1[2]}
        </li>
        <li>
          {ios2[0]} <strong>{ios2[1]}</strong> {ios2[2]}
        </li>
      </ol>
    )
  }
  if (platform === 'android') {
    return (
      <ol className="install-hint-steps">
        <li>
          {and1[0]} <strong>{and1[1]}</strong> {and1[2]}
        </li>
        <li>
          {and2[0]} <strong>{and2[1]}</strong> {and2[2]} <strong>{and2[3]}</strong> {and2[4]}
        </li>
      </ol>
    )
  }
  return (
    <p className="muted">
      {desktop[0]} <Icon name="download" /> {desktop[1]}
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
  const t = useT()
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
        <Heading id={titleId}>{installed ? t('install.installedTitle') : t('install.title')}</Heading>
      </div>
      {installed ? (
        <p className="muted">
          <Icon name="check" /> {t('install.running')}
        </p>
      ) : (
        <>
          <Steps platform={platform} promptReady={promptReady} onInstall={handleInstall} installing={installing} />
          <p className="install-hint-note">{t('install.stores')}</p>
        </>
      )}
      {children}
      {variant === 'card' && !installed && (
        <Button type="button" variant="ghost" className="install-hint-later" onClick={handleDismiss}>
          {t('install.later')}
        </Button>
      )}
    </section>
  )
}
