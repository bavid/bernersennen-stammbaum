import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../themes/ThemeProvider.jsx'
import Icon from './Icon.jsx'

const COPIED_MS = 2000

// Zeigt den Schlüssel genau einmal: nach dem Einlösen eines Gutscheins und nach dem Erneuern des
// Schlüssels (Zugang-Einstellungen). Erst der "Weiter"-Knopf lässt die aufrufende Seite fortfahren –
// so bleibt Zeit, den Schlüssel zu sichern, bevor man in die Chronik wechselt. showCardHint blendet den
// Hinweis auf die (physische) Karte aus – nach einem Schlüssel-Erneuern gibt es keine neue Karte dazu.
// note (final-review Phase T Finding 4, AdminPartners "Tierheim-Bereich anlegen"): ein zusätzlicher,
// aufrufer-spezifischer Hinweis unter dem Kartenhinweis - für Kontexte, in denen die Standardtexte
// (an ein Zuhause gerichtet) nicht passen, ohne die Kernerklärung selbst zu verdoppeln oder zu ersetzen.
// freshKey (Audit V7a): nach einem persönlichen Code (Weitergabe, Besuch, Übergabe, Familien-Einladung) ist der
// Schlüssel neu erzeugt (Server: fromOthers false) - dann kennt ihn niemand sonst, statt des Kartenhinweises steht das da.
export default function KeyReveal({ value, onContinue, continueLabel = 'Weiter zu Meiner Chronik', showCardHint = true, freshKey = false, note }) {
  const { words } = useTheme()
  const [copied, setCopied] = useState(false)
  const headingRef = useRef(null)

  // Fokus auf die Überschrift, sobald der Schlüssel erscheint: sonst bleibt er z. B. nach dem Absenden
  // eines Formulars unbemerkt irgendwo im DOM stehen – role="status" am Wrapper kündigt Überschrift und
  // Wert zusätzlich Screenreadern an.
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

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
      <div role="status">
        <p className="field-label" ref={headingRef} tabIndex={-1}>
          Euer Schlüssel
        </p>
        <p className="key-reveal-value">{value}</p>
      </div>
      <button type="button" className={`btn ${copied ? 'btn-ink' : 'btn-ghost'} btn-block`} onClick={handleCopy}>
        <Icon name={copied ? 'check' : 'copy'} />
        {copied ? 'Kopiert' : 'Kopieren'}
      </button>
      <p className="key-reveal-text">
        Mit diesem Schlüssel meldet ihr euch an – auf jedem Gerät. Hebt ihn gut auf, er ist auch eure Wiederherstellung.
      </p>
      {freshKey && <p className="field-hint">Diesen Schlüssel haben wir eben neu erzeugt – nur ihr kennt ihn.</p>}
      {showCardHint && !freshKey && (
        <p className="field-hint">
          Wer euch die Karte gegeben hat, kennt diesen Code. Erneuert den Schlüssel später unter „{words.groupSettings}“, wenn
          ihr sicher gehen wollt.
        </p>
      )}
      {note && <p className="field-hint">{note}</p>}
      <button type="button" className="btn btn-primary btn-lg btn-block" onClick={onContinue}>
        {continueLabel}
      </button>
    </div>
  )
}
