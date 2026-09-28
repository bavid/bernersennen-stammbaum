import { useEffect, useState } from 'react'
import { useTheme } from '../themes/ThemeProvider.jsx'
import Icon from './Icon.jsx'

const COPIED_MS = 2000

// Zeigt den Schlüssel genau einmal: nach dem Einlösen eines Gutscheins und nach dem Erneuern des
// Schlüssels (Zugang-Einstellungen). Erst der "Weiter"-Knopf lässt die aufrufende Seite fortfahren –
// so bleibt Zeit, den Schlüssel zu sichern, bevor man in die Chronik wechselt.
export default function KeyReveal({ value, onContinue, continueLabel = 'Weiter zu Meiner Chronik' }) {
  const { words } = useTheme()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return undefined
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      // Ohne Zwischenablage-Recht bleibt der Schlüssel zum Markieren/Abtippen sichtbar.
    }
  }

  return (
    <div className="key-reveal">
      <p className="field-label">Euer Schlüssel</p>
      <p className="key-reveal-value">{value}</p>
      <button type="button" className={`btn ${copied ? 'btn-ink' : 'btn-ghost'} btn-block`} onClick={handleCopy}>
        <Icon name={copied ? 'check' : 'copy'} />
        {copied ? 'Kopiert' : 'Kopieren'}
      </button>
      <p className="key-reveal-text">
        Mit diesem Schlüssel meldet ihr euch an – auf jedem Gerät. Hebt ihn gut auf, er ist auch eure Wiederherstellung.
      </p>
      <p className="field-hint">
        Wer euch die Karte gegeben hat, kennt diesen Code. Erneuert den Schlüssel später unter „{words.groupSettings}“, wenn
        ihr sicher gehen wollt.
      </p>
      <button type="button" className="btn btn-primary btn-lg btn-block" onClick={onContinue}>
        {continueLabel}
      </button>
    </div>
  )
}
